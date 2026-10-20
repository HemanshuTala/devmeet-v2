"""
================================================================================
CODE EXECUTION SERVICE — ASYNCHRONOUS JOB QUEUE & WORKER (RABBITMQ + REDIS)
================================================================================
Role & Responsibility:
  This module implements the asynchronous job processing pipeline for code execution.
  Compiling and running untrusted code in Docker containers is resource-heavy and
  latency-unpredictable. To prevent HTTP connection timeouts and worker thread exhaustion,
  long-running tasks (e.g. running full test suites or large submissions) are queued.

Architecture & State Transitions:
  1. Producer (`publish_execution_task`):
     - Receives job payload (job_id, code, language, timeout).
     - Marks job state as 'pending' in Redis key `execution_job:{job_id}` with 1-hour TTL.
     - Publishes persistent message to RabbitMQ queue `code_execution_tasks`.
  2. Consumer / Worker Thread (`_run_worker`):
     - Runs in a background daemon thread (`start_queue_worker`).
     - Consumes tasks with `prefetch_count=1` (fair dispatch).
     - Executes code in sandboxed Docker container via `executor.execute_code`.
     - Stores output (`stdout`, `stderr`, `exit_code`, `execution_time`) in Redis.
     - Acknowledges message (`basic_ack`) on success; rejects (`basic_nack(requeue=False)`)
       on unrecoverable failures to prevent infinite retry loops.
================================================================================
"""

import os
import json
import pika
import redis
import asyncio
import threading
from .executor import executor

# ==============================================================================
# ENVIRONMENT & CONNECTION PARAMETERS
# ==============================================================================
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", 5672))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "guest")
RABBITMQ_PASSWORD = os.getenv("RABBITMQ_PASSWORD", "guest")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

QUEUE_NAME = "code_execution_tasks"


def get_redis_client() -> redis.Redis:
    """
    Creates and returns a synchronous Redis client instance.

    Returns:
      redis.Redis: Configured Redis client with automatic string decoding.
    """
    pw = REDIS_PASSWORD if REDIS_PASSWORD else None
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=pw,
        decode_responses=True,
    )


def get_rabbitmq_channel():
    """
    Establishes a blocking TCP connection and channel to RabbitMQ.

    Returns:
      Tuple[pika.BlockingConnection, pika.channel.Channel]: Active connection and declared queue channel.

    Settings:
      - Durable Queue: Messages survive RabbitMQ broker restarts.
      - Heartbeat: 600 seconds to prevent NAT timeouts during idle periods.
    """
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        credentials=credentials,
        heartbeat=600,
        blocked_connection_timeout=300,
    )
    connection = pika.BlockingConnection(parameters)
    channel = connection.channel()
    channel.queue_declare(queue=QUEUE_NAME, durable=True)
    return connection, channel


def publish_execution_task(job_id: str, code: str, language: str, timeout: int):
    """
    Publishes an asynchronous code execution task to RabbitMQ and initializes Redis state.

    Parameters:
      job_id (str): Unique job UUID for polling status.
      code (str): Source code to execute.
      language (str): Target runtime programming language.
      timeout (int): Sandbox execution time limit in seconds.

    Flow:
      1. Writes initial status `{"status": "pending"}` to Redis with 1-hour expiration.
      2. Publishes persistent task payload (delivery_mode=2) to RabbitMQ queue.
      3. Closes AMQP connection cleanly.
    """
    # Write pending status to Redis first so status endpoint finds record immediately
    r = get_redis_client()
    r.setex(
        f"execution_job:{job_id}",
        3600,  # 1 hour expiry
        json.dumps({"status": "pending"}),
    )

    connection, channel = get_rabbitmq_channel()
    try:
        body = {
            "job_id": job_id,
            "code": code,
            "language": language,
            "timeout": timeout,
        }
        channel.basic_publish(
            exchange="",
            routing_key=QUEUE_NAME,
            body=json.dumps(body),
            properties=pika.BasicProperties(
                delivery_mode=2,  # Persistent message on disk
            ),
        )
    finally:
        connection.close()


def _run_worker():
    """
    Worker consumer loop running in a dedicated background daemon thread.

    Resilience & Error Handling:
      - Startup Retry Loop: Attempts RabbitMQ connection up to 10 times with 5s delay,
        accommodating Docker Compose startup sequencing.
      - Fair Dispatch (`prefetch_count=1`): Ensures the worker only takes 1 task at a time,
        preventing one worker from hoarding execution tasks.
      - Sandboxed Execution: Runs `executor.execute_code` inside a fresh asyncio event loop.
      - Error Dead-Lettering: On crash, records error in Redis and emits `basic_nack(requeue=False)`
        to prevent infinite queue choking.
    """
    print(f"[*] Queue worker starting. Connecting to RabbitMQ at {RABBITMQ_HOST}:{RABBITMQ_PORT}...")
    r = get_redis_client()

    import time
    connection = None
    channel = None
    
    # Retry connection to accommodate broker boot delays in container clusters
    for attempt in range(10):
        try:
            connection, channel = get_rabbitmq_channel()
            break
        except Exception as e:
            print(f"[!] RabbitMQ connection attempt {attempt + 1}/10 failed: {e}. Retrying in 5s...")
            time.sleep(5)

    if not channel:
        print("[CRITICAL] Could not connect to RabbitMQ. Worker thread exiting.")
        return

    def callback(ch, method, properties, body):
        """Processes a single task dequeued from RabbitMQ."""
        job_id = None
        try:
            data = json.loads(body.decode("utf-8"))
            job_id = data["job_id"]
            code = data["code"]
            language = data["language"]
            timeout = data.get("timeout", 10)

            print(f"[*] Processing job {job_id} ({language})...")

            # Run async code executor inside worker thread's event loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(
                    executor.execute_code(code=code, language=language, timeout=timeout)
                )
            finally:
                loop.close()

            # Store execution result in Redis
            r.setex(
                f"execution_job:{job_id}",
                3600,  # 1 hour TTL
                json.dumps({
                    "status": "completed",
                    "result": result,
                }),
            )
            print(f"[+] Completed job {job_id}.")
            # Acknowledge successful processing
            ch.basic_ack(delivery_tag=method.delivery_tag)

        except Exception as e:
            print(f"[!] Worker failed to execute task: {e}")
            # Write error result to Redis so status endpoint does not hang indefinitely
            if job_id:
                try:
                    r.setex(
                        f"execution_job:{job_id}",
                        3600,
                        json.dumps({
                            "status": "error",
                            "result": {
                                "stdout": "",
                                "stderr": f"Execution failed: {str(e)}",
                                "exit_code": 1,
                                "execution_time": 0,
                            },
                        }),
                    )
                except Exception as redis_err:
                    print(f"[!] Failed to write error state to Redis for job {job_id}: {redis_err}")
            # Reject message without requeueing to avoid blocking queue on poison messages
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

    # Fair dispatch: Only deliver 1 message at a time per worker process
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=QUEUE_NAME, on_message_callback=callback)

    try:
        channel.start_consuming()
    except Exception as e:
        print(f"[!] Worker connection lost: {e}")
        try:
            connection.close()
        except Exception:
            pass


def start_queue_worker():
    """
    Spawns the RabbitMQ worker loop in a background daemon thread.
    Invoked during FastAPI startup lifecycle in `main.py`.
    """
    t = threading.Thread(target=_run_worker, daemon=True)
    t.start()
