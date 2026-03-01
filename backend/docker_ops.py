import subprocess
import json
import psutil
from pathlib import Path


def _run(cmd: list[str], cwd: str = None) -> tuple[int, str, str]:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    return result.returncode, result.stdout, result.stderr


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


def list_containers() -> list[dict]:
    code, out, err = _run(["docker", "ps", "--format", "{{json .}}"])
    if code != 0 or not out.strip():
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
