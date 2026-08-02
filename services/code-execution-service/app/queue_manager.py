import os
import json
import pika
import redis
import asyncio
import threading
from .executor import executor

# Environment variables
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", 5672))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "guest")
RABBITMQ_PASSWORD = os.getenv("RABBITMQ_PASSWORD", "guest")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

QUEUE_NAME = "code_execution_tasks"

# Initialize Redis client
def get_redis_client():
    pw = REDIS_PASSWORD if REDIS_PASSWORD else None
    return redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=pw,
        decode_responses=True
    )

# Establish connection to RabbitMQ
def get_rabbitmq_channel():
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        credentials=credentials,
        heartbeat=600,
        blocked_connection_timeout=300
    )
    connection = pika.BlockingConnection(parameters)
    channel = connection.channel()
    channel.queue_declare(queue=QUEUE_NAME, durable=True)
    return connection, channel

# Publish task to RabbitMQ queue
def publish_execution_task(job_id: str, code: str, language: str, timeout: int):
    # Write pending status to Redis first
    r = get_redis_client()
    r.setex(
        f"execution_job:{job_id}",
        3600,  # 1 hour expiry
        json.dumps({"status": "pending"})
    )

    connection, channel = get_rabbitmq_channel()
    try:
        body = {
            "job_id": job_id,
            "code": code,
            "language": language,
            "timeout": timeout
        }
        channel.basic_publish(
            exchange="",
            routing_key=QUEUE_NAME,
            body=json.dumps(body),
            properties=pika.BasicProperties(
                delivery_mode=2,  # make message persistent
            )
        )
    finally:
        connection.close()

# Synchronous worker thread runner
def _run_worker():
    print(f"[*] Queue worker starting. Connecting to RabbitMQ at {RABBITMQ_HOST}:{RABBITMQ_PORT}...")
    r = get_redis_client()
    
    # Simple retry loop for RabbitMQ connection (robust for docker-compose startups)
    import time
    connection = None
    channel = None
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

            # Store result in Redis
            r.setex(
                f"execution_job:{job_id}",
                3600,  # 1 hour TTL
                json.dumps({
                    "status": "completed",
                    "result": result
                })
            )
            print(f"[+] Completed job {job_id}.")
        except Exception as e:
            print(f"[!] Worker failed to execute task: {e}")
        finally:
            ch.basic_ack(delivery_tag=method.delivery_tag)

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

# Start daemon queue worker thread
def start_queue_worker():
    t = threading.Thread(target=_run_worker, daemon=True)
    t.start()
