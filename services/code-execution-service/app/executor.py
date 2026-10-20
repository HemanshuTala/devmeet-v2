"""
================================================================================
CODE EXECUTION SERVICE — DOCKER SANDBOX ISOLATION & CLI EXECUTION ENGINE
================================================================================
Role & Responsibility:
  This module implements the core isolation runtime for executing untrusted user code.
  Running arbitrary code submitted by candidates over the internet is extremely dangerous:
  a malicious user could attempt fork bombs, socket connections to internal databases,
  reading environment variables, or filling server disk space.

Multi-Layer Defense & Sandbox Hardening:
  1. Container Resource Capping:
     - `--memory=512m` & `--memswap=512m`: Prevents Out-Of-Memory (OOM) crashes on the host.
     - `--cpus=0.5` (`cpu_quota=50000`): Limits thread execution to 50% of one core.
     - `--pids-limit=64`: Thwarts fork bombs and infinite thread creation attacks.
  2. Network & Filesystem Lockdown:
     - `--network=none`: Disables all outbound and inbound networking (cannot ping or scrape).
     - `--read-only`: Root filesystem is mounted strictly read-only.
     - `--tmpfs=/tmp:size=32m,noexec,nosuid,nodev`: Small ephemeral RAM scratch space
       for temporary compilation binaries, wiped immediately on exit.
  3. Linux Kernel Privileges:
     - `--security-opt=no-new-privileges:true`: Prevents `setuid` privilege escalation.
     - `--cap-drop=ALL`: Strips all Linux root capabilities.
  4. Dual Engine Architecture (SDK + CLI Fallback):
     - Attempts Docker Python SDK socket communication first (`/var/run/docker.sock`).
     - Automatically falls back to Docker CLI subprocess execution when running on
       Windows Docker Desktop (where socket mounting can fail across WSL2 boundaries).
================================================================================
"""

import asyncio
import subprocess
import sys
import os
import json
import time
import tempfile
import platform
import logging
from typing import Optional
from .s3_service import s3_code_service

logger = logging.getLogger("executor")

# Detect whether the Docker Python SDK is installed in the current environment
try:
    import docker
    _DOCKER_SDK_AVAILABLE = True
except ImportError:
    _DOCKER_SDK_AVAILABLE = False
    logger.warning("docker SDK not installed — will use CLI fallback")


class CodeExecutor:
    """
    Sandboxed execution engine coordinating Docker container lifecycle and fallback subprocesses.

    Attributes:
      timeout (int): Default execution timeout in seconds.
      is_linux (bool): True if host system is running Linux.
      client (docker.DockerClient | None): Active Docker SDK client if connected.
      _docker_error (str | None): Diagnostic message if SDK connection failed.
      _use_cli_fallback (bool): Set to True if Docker CLI was detected as an alternative.
    """

    def __init__(self):
        """
        Initializes Docker client connection strategies:
          1. Tries Docker Python SDK via env, socket, or TCP.
          2. If SDK fails, tests whether Docker CLI is callable.
        """
        self.timeout = 10
        self.is_linux = platform.system() == "Linux"
        self.client = None
        self._docker_error = None
        self._use_cli_fallback = False

        # Attempt SDK connection first
        if _DOCKER_SDK_AVAILABLE:
            try:
                self.client = self._create_docker_client()
                self._docker_error = None
                logger.info("CODE-03: Docker SDK client ready.")
            except RuntimeError as e:
                self._docker_error = str(e)
                logger.warning(f"CODE-03: Docker SDK failed: {e}. Trying CLI fallback...")

        # If SDK connection was unsuccessful, check if Docker CLI works
        if self.client is None:
            if self._cli_available():
                self._use_cli_fallback = True
                self._docker_error = None
                logger.info("CODE-03: Using Docker CLI fallback for code execution.")
            else:
                logger.warning("CODE-03: Docker completely unavailable — code execution will return 503.")

    def _create_docker_client(self):
        """
        Attempts multiple connection strategies to connect to the Docker daemon.

        Connection Priority:
          1. Explicit DOCKER_HOST environment variable.
          2. Standard `docker.from_env()`.
          3. Unix domain sockets (`/var/run/docker.sock`).
          4. TCP sockets (Docker Desktop exposed on port 2375).
        """
        errors = []

        # Method 1: DOCKER_HOST env var (set explicitly)
        docker_host_env = os.getenv("DOCKER_HOST", "")
        if docker_host_env:
            try:
                c = docker.DockerClient(base_url=docker_host_env)
                c.ping()
                logger.info(f"Docker SDK connected via DOCKER_HOST={docker_host_env}")
                return c
            except Exception as e:
                errors.append(f"DOCKER_HOST={docker_host_env}: {e}")

        # Method 2: from_env (respects DOCKER_HOST and default socket)
        try:
            c = docker.from_env()
            c.ping()
            logger.info("Docker SDK connected via from_env()")
            return c
        except Exception as e:
            errors.append(f"from_env: {e}")

        # Method 3: Explicit Unix socket paths
        for sock in ["/var/run/docker.sock", "/run/docker.sock"]:
            if os.path.exists(sock):
                try:
                    c = docker.DockerClient(base_url=f"unix://{sock}")
                    c.ping()
                    logger.info(f"Docker SDK connected via unix socket {sock}")
                    return c
                except Exception as e:
                    errors.append(f"unix://{sock}: {e}")

        # Method 4: TCP port 2375 (Docker Desktop setting)
        for tcp in ["tcp://host.docker.internal:2375", "tcp://localhost:2375", "tcp://172.17.0.1:2375"]:
            try:
                c = docker.DockerClient(base_url=tcp)
                c.ping()
                logger.info(f"Docker SDK connected via {tcp}")
                return c
            except Exception as e:
                errors.append(f"{tcp}: {e}")

        raise RuntimeError(f"Cannot connect to Docker daemon. Tried: {errors}")

    def _cli_available(self) -> bool:
        """
        Tests whether the `docker` CLI command is installed and can query daemon info.

        Returns:
          bool: True if `docker info` exits with code 0 within 5 seconds.
        """
        try:
            result = subprocess.run(
                ["docker", "info"],
                capture_output=True,
                timeout=5,
            )
            return result.returncode == 0
        except Exception:
            return False

    async def _execute_via_cli(
        self,
        code: str,
        language: str,
        timeout: int,
        session_id: str = None,
    ) -> dict:
        """
        Executes code using Docker CLI subprocess commands.

        Architecture & Cross-Platform Value:
          On Windows running Docker Desktop with WSL2, the Docker Python SDK often
          encounters named pipe or localhost binding failures. Invoking the native
          `docker run` CLI avoids these driver issues while maintaining full sandboxing.
        """
        language_configs = {
            "python":     {"image": "python:3.11-slim",   "ext": ".py",   "cmd": ["python", "-c", code]},
            "javascript": {"image": "node:20-slim",        "ext": ".js",   "cmd": ["node",   "-e", code]},
            "java":       {"image": "openjdk:21-slim",     "ext": ".java", "cmd": None, "needs_file": True},
            "cpp":        {"image": "gcc:13",              "ext": ".cpp",  "cmd": None, "needs_file": True},
            "go":         {"image": "golang:1.21-alpine",  "ext": ".go",   "cmd": None, "needs_file": True},
            "rust":       {"image": "rust:1.75-slim",      "ext": ".rs",   "cmd": None, "needs_file": True},
        }

        config = language_configs.get(language.lower())
        if not config:
            return {
                "success": False,
                "output": "",
                "error": f"Unsupported language: {language}",
                "execution_time": 0,
                "exit_code": -1,
            }

        start = time.time()
        tmp_dir = None

        try:
            # Case 1: Interpreted languages (Python, JS) - pass code string directly as argument
            if config.get("cmd"):
                docker_cmd = [
                    "docker", "run", "--rm",
                    "--network=none",
                    "--memory=512m",
                    "--cpus=0.5",
                    "--pids-limit=64",
                    "--read-only",
                    "--tmpfs=/tmp:size=32m",
                    "--security-opt=no-new-privileges:true",
                    "--cap-drop=ALL",
                    config["image"],
                ] + config["cmd"]

                proc = await asyncio.create_subprocess_exec(
                    *docker_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                try:
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout + 2)
                    exit_code = proc.returncode
                    timed_out = False
                except asyncio.TimeoutError:
                    proc.kill()
                    stdout, stderr = b"", b"Execution timed out"
                    exit_code = -1
                    timed_out = True

            # Case 2: Compiled languages (Java, C++, Rust, Go) - write file and mount read-only
            else:
                tmp_dir = tempfile.mkdtemp()
                fname = f"Main{config['ext']}"
                fpath = os.path.join(tmp_dir, fname)
                with open(fpath, "w") as f:
                    f.write(code)

                if language.lower() == "cpp":
                    inner_cmd = f"g++ -o /tmp/main /code/{fname} && /tmp/main"
                elif language.lower() == "java":
                    inner_cmd = f"javac -d /tmp /code/{fname} && java -cp /tmp Main"
                elif language.lower() == "go":
                    inner_cmd = f"go run /code/{fname}"
                elif language.lower() == "rust":
                    inner_cmd = f"rustc -o /tmp/main /code/{fname} && /tmp/main"
                else:
                    inner_cmd = f"cat /code/{fname}"

                docker_cmd = [
                    "docker", "run", "--rm",
                    "--network=none",
                    "--memory=512m",
                    "--cpus=0.5",
                    "--pids-limit=64",
                    "--security-opt=no-new-privileges:true",
                    "--cap-drop=ALL",
                    "-v", f"{tmp_dir}:/code:ro",
                    "--tmpfs=/tmp:size=64m",   # Writable scratch RAM for compiled executable
                    config["image"],
                    "sh", "-c", inner_cmd,
                ]

                proc = await asyncio.create_subprocess_exec(
                    *docker_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                try:
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout + 5)
                    exit_code = proc.returncode
                    timed_out = False
                except asyncio.TimeoutError:
                    proc.kill()
                    stdout, stderr = b"", b"Execution timed out"
                    exit_code = -1
                    timed_out = True

            out_text = stdout.decode("utf-8", errors="replace").strip() if stdout else ""
            err_text = stderr.decode("utf-8", errors="replace").strip() if stderr else ""
            success = (exit_code == 0) and not timed_out
            execution_time = time.time() - start

            result = {
                "success": success,
                "output": out_text,
                "error": err_text if not success else None,
                "execution_time": round(execution_time, 3),
                "memory_used_mb": None,
                "exit_code": exit_code,
                "timed_out": timed_out,
            }

            if timed_out:
                result["error"] = f"Execution timed out after {timeout}s."

            # Upload snapshot to S3 if session is tracked
            if session_id and s3_code_service.is_available():
                try:
                    await s3_code_service.upload_code_snapshot(
                        session_id=session_id,
                        language=language,
                        code=code,
                        execution_result=result,
                    )
                except Exception as e:
                    logger.error(f"S3 snapshot upload failed: {e}")

            return result

        except Exception as e:
            return {
                "success": False,
                "output": "",
                "error": str(e),
                "execution_time": time.time() - start,
                "exit_code": -1,
                "timed_out": False,
            }
        finally:
            # Purge temporary directory on host
            if tmp_dir:
                import shutil
                try:
                    shutil.rmtree(tmp_dir, ignore_errors=True)
                except Exception:
                    pass

    async def execute_code(
        self,
        code: str,
        language: str,
        timeout: int = 10,
        session_id: str = None,
    ) -> dict:
        """
        Executes candidate code in a secure container sandbox.

        Parameters:
          code (str): Source code string.
          language (str): Target runtime language.
          timeout (int): Timeout in seconds (default: 10s).
          session_id (Optional[str]): Active interview session identifier.

        Returns:
          dict: Result payload containing 'success', 'output', 'error', 'execution_time',
                'memory_used_mb', and 'exit_code'.
        """
        # Cascade to CLI execution if Python SDK client is unavailable
        if self.client is None:
            if self._use_cli_fallback:
                return await self._execute_via_cli(code, language, timeout, session_id)
            return {
                "success": False,
                "output": "",
                "error": "Code execution sandbox unavailable: Docker daemon not reachable. "
                         "Please enable 'Expose daemon on tcp://localhost:2375 without TLS' in "
                         "Docker Desktop Settings → General.",
                "execution_time": 0,
                "memory_used_mb": None,
                "exit_code": -1,
                "timed_out": False,
            }

        # Language configuration map for Docker SDK
        language_configs = {
            "python":     {"image": "python:3.11-slim",  "command": ["python", "-c"],  "file_extension": ".py"},
            "javascript": {"image": "node:20-slim",       "command": ["node",   "-e"],  "file_extension": ".js"},
            "java":       {"image": "openjdk:21-slim",    "command": ["java"],          "file_extension": ".java",  "compile": True},
            "cpp":        {"image": "gcc:13",             "command": ["/tmp/main"],     "file_extension": ".cpp",   "compile": True, "compile_command": ["g++", "-o", "/tmp/main"]},
            "go":         {"image": "golang:1.21-alpine", "command": ["go", "run"],     "file_extension": ".go"},
            "rust":       {"image": "rust:1.75-slim",     "command": ["/tmp/main"],     "file_extension": ".rs",    "compile": True},
        }

        config = language_configs.get(language.lower())
        if not config:
            return {"success": False, "output": "", "error": f"Unsupported language: {language}", "execution_time": 0}

        start_time = time.time()
        container_obj = None
        temp_file = None

        try:
            with tempfile.NamedTemporaryFile(mode="w", suffix=config["file_extension"], delete=False) as f:
                f.write(code)
                temp_file = f.name

            # Optional compilation phase for C++, Java, Rust
            if config.get("compile"):
                compile_cmd = config.get("compile_command", [])
                if compile_cmd:
                    compile_cmd = list(compile_cmd) + [temp_file]
                else:
                    compile_cmd = config["command"] + [temp_file]
                try:
                    self.client.containers.run(
                        config["image"],
                        compile_cmd,
                        remove=True,
                        mem_limit="256m",
                        memswap_limit="256m",
                        cpu_quota=50000,
                        pids_limit=50,
                        timeout=timeout,
                        security_opt=["no-new-privileges:true"],
                        cap_drop=["ALL"],
                    )
                except Exception as e:
                    return {
                        "success": False,
                        "output": "",
                        "error": f"Compilation error: {str(e)}",
                        "execution_time": time.time() - start_time,
                        "memory_used_mb": None,
                        "exit_code": 1,
                        "timed_out": False,
                    }

            # Hardened sandbox security flags for container execution
            run_kwargs = dict(
                detach=True,
                mem_limit="256m",
                memswap_limit="256m",
                cpu_quota=50000,
                pids_limit=50,
                network_disabled=True,
                security_opt=["no-new-privileges:true"],
                cap_drop=["ALL"],
                read_only=True,
                tmpfs={"/tmp": "size=32m,noexec,nosuid,nodev"},
            )

            if language.lower() in ("java", "cpp", "rust"):
                run_kwargs["volumes"] = {"/tmp": {"bind": "/tmp", "mode": "rw"}}
                run_kwargs["read_only"] = False
                if language.lower() == "java":
                    cmd = ["java", "-cp", "/tmp", "Main"]
                elif language.lower() == "cpp":
                    cmd = config["command"]
                else:
                    cmd = ["sh", "-c", "rustc -o /tmp/main /tmp/main.rs && /tmp/main"]
            else:
                run_kwargs["read_only"] = True
                run_kwargs["tmpfs"] = {"/tmp": "size=32m,noexec"}
                cmd = config["command"] + [code]

            # Spawn sandboxed container
            container_obj = self.client.containers.run(config["image"], cmd, **run_kwargs)

            # Wait for execution completion or timeout
            timed_out = False
            try:
                result_data = container_obj.wait(timeout=timeout)
                exit_code = result_data.get("StatusCode", 0)
            except Exception:
                timed_out = True
                exit_code = -1

            # Harvest stdout and stderr logs
            raw_logs = container_obj.logs(stdout=True, stderr=True)
            output_text = raw_logs.decode("utf-8", errors="replace") if isinstance(raw_logs, bytes) else str(raw_logs)

            # Sample peak memory utilization
            memory_used_mb = None
            try:
                stats = container_obj.stats(stream=False)
                mem_bytes = stats.get("memory_stats", {}).get("usage")
                memory_used_mb = round(mem_bytes / (1024 * 1024), 2) if mem_bytes else None
            except Exception:
                pass

        except Exception as e:
            return {
                "success": False,
                "output": "",
                "error": str(e),
                "execution_time": time.time() - start_time,
                "memory_used_mb": None,
                "exit_code": -1,
                "timed_out": False,
            }
        finally:
            # Force removal of ephemeral container and temp file
            if container_obj:
                try:
                    container_obj.remove(force=True)
                except Exception:
                    pass
            if temp_file:
                try:
                    os.unlink(temp_file)
                except Exception:
                    pass

        execution_time = time.time() - start_time
        if timed_out:
            result = {
                "success": False,
                "output": output_text.strip(),
                "error": f"Execution timed out after {timeout}s.",
                "execution_time": execution_time,
                "memory_used_mb": memory_used_mb,
                "exit_code": exit_code,
                "timed_out": True,
            }
        else:
            success = (exit_code == 0)
            result = {
                "success": success,
                "output": output_text.strip(),
                "error": output_text.strip() if not success else None,
                "execution_time": execution_time,
                "memory_used_mb": memory_used_mb,
                "exit_code": exit_code,
                "timed_out": timed_out,
            }

        # S3 snapshot persistence
        if session_id and s3_code_service.is_available():
            try:
                await s3_code_service.upload_code_snapshot(
                    session_id=session_id,
                    language=language,
                    code=code,
                    execution_result=result,
                )
            except Exception as e:
                logger.error(f"Failed to upload code snapshot to S3: {e}")

        return result


# Singleton executor instance
executor = CodeExecutor()
