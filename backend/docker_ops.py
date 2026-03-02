import os
import subprocess
import json
import sys
import psutil
from pathlib import Path


_DEFAULT_TIMEOUT = int(os.getenv("DOCKER_CMD_TIMEOUT", "300"))

def _run(cmd: list[str], cwd: str | None = None, timeout: int = _DEFAULT_TIMEOUT) -> tuple[int, str, str]:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, timeout=timeout)
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return 1, "", f"Command timed out after {timeout}s: {' '.join(cmd)}"
    except FileNotFoundError:
        return 1, "", f"Executable not found: {cmd[0]}"


def compose_up(compose_file: str) -> tuple[bool, str]:
    cwd = str(Path(compose_file).parent)
    code, out, err = _run(["docker", "compose", "-f", compose_file, "up", "-d"], cwd=cwd)
    return code == 0, err if code != 0 else out


def compose_down(compose_file: str) -> tuple[bool, str]:
    cwd = str(Path(compose_file).parent)
    code, out, err = _run(["docker", "compose", "-f", compose_file, "down"], cwd=cwd)
    return code == 0, err if code != 0 else out


def compose_pull(compose_file: str) -> tuple[bool, str]:
    cwd = str(Path(compose_file).parent)
    code, out, err = _run(["docker", "compose", "-f", compose_file, "pull"], cwd=cwd)
    return code == 0, err if code != 0 else out


def container_start(name: str) -> tuple[bool, str]:
    code, out, err = _run(["docker", "start", name])
    return code == 0, err if code != 0 else out


def container_stop(name: str) -> tuple[bool, str]:
    code, out, err = _run(["docker", "stop", name])
    return code == 0, err if code != 0 else out


def list_images() -> list[str]:
    code, out, err = _run(["docker", "images", "--format", "{{json .}}"])
    if code != 0 or not out.strip():
        return []
    images = []
    for line in out.strip().splitlines():
        try:
            img = json.loads(line)
            repo = img.get("Repository", "")
            tag  = img.get("Tag", "")
            if repo and repo != "<none>":
                images.append(f"{repo}:{tag}" if tag and tag != "<none>" else repo)
        except json.JSONDecodeError:
            continue
    return images


def image_pull(image: str) -> tuple[bool, str]:
    code, out, err = _run(["docker", "pull", image])
    return code == 0, err if code != 0 else out


def list_containers() -> list[dict] | None:
    code, out, err = _run(["docker", "ps", "--format", "{{json .}}"])
    if code != 0:
        print(f"[docker_ops] docker ps failed: {err.strip()}", file=sys.stderr)
        return None
    if not out.strip():
        return []
    containers = []
    for line in out.strip().splitlines():
        try:
            c = json.loads(line)
            containers.append({
                "id": c.get("ID", ""),
                "name": c.get("Names", ""),
                "image": c.get("Image", ""),
                "status": c.get("Status", ""),
                "ports": c.get("Ports", ""),
            })
        except json.JSONDecodeError:
            continue
    return containers


def system_stats() -> dict:
    return {
        "cpu": round(psutil.cpu_percent(interval=0.1), 1),
        "memory": round(psutil.virtual_memory().percent, 1),
        "disk": round(psutil.disk_usage("/").percent, 1),
    }
