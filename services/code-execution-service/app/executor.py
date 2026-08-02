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

# Try to import docker SDK — but we have a CLI fallback
try:
    import docker
    _DOCKER_SDK_AVAILABLE = True
except ImportError:
    _DOCKER_SDK_AVAILABLE = False
    logger.warning("docker SDK not installed — will use CLI fallback")


class CodeExecutor:
    def __init__(self):
        self.timeout = 10
        self.is_linux = platform.system() == "Linux"
        self.client = None
        self._docker_error = None
        self._use_cli_fallback = False

        # Try SDK first
        if _DOCKER_SDK_AVAILABLE:
            try:
                self.client = self._create_docker_client()
                self._docker_error = None
                logger.info("CODE-03: Docker SDK client ready.")
            except RuntimeError as e:
                self._docker_error = str(e)
                logger.warning(f"CODE-03: Docker SDK failed: {e}. Trying CLI fallback...")

        # If SDK failed, try CLI fallback
        if self.client is None:
            if self._cli_available():
                self._use_cli_fallback = True
                self._docker_error = None
                logger.info("CODE-03: Using Docker CLI fallback for code execution.")
            else:
                logger.warning("CODE-03: Docker completely unavailable — code execution will return 503.")

    def _create_docker_client(self):
        """Create Docker client — try multiple connection methods."""
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

        # Method 2: from_env (respects DOCKER_HOST and socket)
        try:
            c = docker.from_env()
            c.ping()
            logger.info("Docker SDK connected via from_env()")
            return c
        except Exception as e:
            errors.append(f"from_env: {e}")

        # Method 3: Explicit unix socket paths
        for sock in ["/var/run/docker.sock", "/run/docker.sock"]:
            if os.path.exists(sock):
                try:
                    c = docker.DockerClient(base_url=f"unix://{sock}")
                    c.ping()
                    logger.info(f"Docker SDK connected via unix socket {sock}")
                    return c
                except Exception as e:
                    errors.append(f"unix://{sock}: {e}")

        # Method 4: TCP (only works if Docker Desktop has 'Expose on port 2375' enabled)
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
        """Check if docker CLI is available and can connect."""
        try:
            result = subprocess.run(
                ["docker", "info"],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    async def _execute_via_cli(self, code: str, language: str, timeout: int, session_id: str = None) -> dict:
        """
        Execute code using docker CLI subprocess — works on Windows Docker Desktop
        where the SDK socket connection fails but the CLI works fine.
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
                "success": False, "output": "",
                "error": f"Unsupported language: {language}",
                "execution_time": 0, "exit_code": -1,
            }

        start = time.time()
        tmp_dir = None

        try:
            # For interpreted languages (Python, JS): pass code as CLI arg — no file needed
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

            else:
                # Compiled languages: write to temp file, mount into container
                tmp_dir = tempfile.mkdtemp()
                fname = f"Main{config['ext']}"
                fpath = os.path.join(tmp_dir, fname)
                with open(fpath, "w") as f:
                    f.write(code)

                if language.lower() == "cpp":
                    inner_cmd = f"g++ -o /code/main /code/{fname} && /code/main"
                elif language.lower() == "java":
                    inner_cmd = f"javac /code/{fname} && java -cp /code Main"
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
                    "--tmpfs=/tmp:size=32m",
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

            # S3 snapshot upload
            if session_id and s3_code_service.is_available():
                try:
                    await s3_code_service.upload_code_snapshot(
                        session_id=session_id, language=language,
                        code=code, execution_result=result
                    )
                except Exception as e:
                    logger.error(f"S3 snapshot upload failed: {e}")

            return result

        except Exception as e:
            return {
                "success": False, "output": "",
                "error": str(e),
                "execution_time": time.time() - start,
                "exit_code": -1, "timed_out": False,
            }
        finally:
            # Clean up temp dir
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
        session_id: str = None
    ) -> dict:
        """Execute code in a Docker sandbox (SDK or CLI fallback)."""

        # Use CLI fallback if SDK is not connected
        if self.client is None:
            if self._use_cli_fallback:
                return await self._execute_via_cli(code, language, timeout, session_id)
            # Completely unavailable
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

        # Use SDK path
        language_configs = {
            "python":     {"image": "python:3.11-slim",  "command": ["python", "-c"],  "file_extension": ".py"},
            "javascript": {"image": "node:20-slim",       "command": ["node",   "-e"],  "file_extension": ".js"},
            "java":       {"image": "openjdk:21-slim",    "command": ["java"],          "file_extension": ".java",  "compile": True},
            "cpp":        {"image": "gcc:13-slim",        "command": ["./a.out"],       "file_extension": ".cpp",   "compile": True, "compile_command": ["g++", "-o", "a.out"]},
            "go":         {"image": "golang:1.21-slim",   "command": ["go", "run"],     "file_extension": ".go"},
            "rust":       {"image": "rust:1.75-slim",     "command": ["rustc", "-o", "/tmp/main", "/tmp/main.rs", "&&", "/tmp/main"], "file_extension": ".rs", "compile": True},
        }

        config = language_configs.get(language.lower())
        if not config:
            return {"success": False, "output": "", "error": f"Unsupported language: {language}", "execution_time": 0}

        start_time = time.time()
        container_obj = None
        temp_file = None

        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix=config["file_extension"], delete=False) as f:
                f.write(code)
                temp_file = f.name

            if config.get("compile"):
                compile_cmd = config.get("compile_command", [])
                if compile_cmd:
                    compile_cmd = list(compile_cmd) + [temp_file]
                else:
                    compile_cmd = config["command"] + [temp_file]
                try:
                    self.client.containers.run(
                        config["image"], compile_cmd, remove=True,
                        mem_limit="256m", memswap_limit="256m", cpu_quota=50000,
                        pids_limit=50, timeout=timeout,
                        security_opt=["no-new-privileges:true"], cap_drop=["ALL"],
                    )
                except Exception as e:
                    return {
                        "success": False, "output": "",
                        "error": f"Compilation error: {str(e)}",
                        "execution_time": time.time() - start_time,
                        "memory_used_mb": None, "exit_code": 1, "timed_out": False,
                    }

            run_kwargs = dict(
                detach=True, mem_limit="256m", memswap_limit="256m",
                cpu_quota=50000, pids_limit=50, network_disabled=True,
                security_opt=["no-new-privileges:true"],
                cap_drop=["ALL"], read_only=True,
                tmpfs={"/tmp": "size=32m,noexec,nosuid,nodev"},
            )

            if language.lower() in ("java", "cpp", "rust"):
                run_kwargs["volumes"] = {'/tmp': {'bind': '/tmp', 'mode': 'rw'}}
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

            container_obj = self.client.containers.run(config["image"], cmd, **run_kwargs)

            timed_out = False
            try:
                result_data = container_obj.wait(timeout=timeout)
                exit_code = result_data.get("StatusCode", 0)
            except Exception:
                timed_out = True
                exit_code = -1

            raw_logs = container_obj.logs(stdout=True, stderr=True)
            output_text = raw_logs.decode("utf-8", errors="replace") if isinstance(raw_logs, bytes) else str(raw_logs)

            memory_used_mb = None
            try:
                stats = container_obj.stats(stream=False)
                mem_bytes = stats.get("memory_stats", {}).get("usage")
                memory_used_mb = round(mem_bytes / (1024 * 1024), 2) if mem_bytes else None
            except Exception:
                pass

        except Exception as e:
            return {
                "success": False, "output": "", "error": str(e),
                "execution_time": time.time() - start_time,
                "memory_used_mb": None, "exit_code": -1, "timed_out": False,
            }
        finally:
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
                "execution_time": execution_time, "memory_used_mb": memory_used_mb,
                "exit_code": exit_code, "timed_out": True,
            }
        else:
            success = (exit_code == 0)
            result = {
                "success": success,
                "output": output_text.strip(),
                "error": output_text.strip() if not success else None,
                "execution_time": execution_time, "memory_used_mb": memory_used_mb,
                "exit_code": exit_code, "timed_out": timed_out,
            }

        if session_id and s3_code_service.is_available():
            try:
                await s3_code_service.upload_code_snapshot(
                    session_id=session_id, language=language,
                    code=code, execution_result=result
                )
            except Exception as e:
                logger.error(f"Failed to upload code snapshot to S3: {e}")

        return result


executor = CodeExecutor()
