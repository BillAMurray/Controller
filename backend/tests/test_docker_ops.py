from unittest.mock import patch, MagicMock
import docker_ops


def _mock_run(returncode, stdout, stderr=""):
    m = MagicMock()
    m.returncode = returncode
    m.stdout = stdout
    m.stderr = stderr
    return m


def test_compose_up_success():
    with patch("subprocess.run", return_value=_mock_run(0, "done")):
        ok, msg = docker_ops.compose_up("/some/docker-compose.yml")
    assert ok is True


def test_compose_up_failure():
    with patch("subprocess.run", return_value=_mock_run(1, "", "error msg")):
        ok, msg = docker_ops.compose_up("/some/docker-compose.yml")
    assert ok is False
    assert "error msg" in msg


def test_list_containers_parses_json():
    line = '{"ID":"abc","Names":"ollama","Image":"ollama/ollama","Status":"Up 2 hours","Ports":"11434/tcp"}'
    with patch("subprocess.run", return_value=_mock_run(0, line + "\n")):
        containers = docker_ops.list_containers()
    assert len(containers) == 1
    assert containers[0]["name"] == "ollama"


def test_list_containers_empty():
    with patch("subprocess.run", return_value=_mock_run(0, "")):
        containers = docker_ops.list_containers()
    assert containers == []


def test_system_stats_returns_numbers():
    with patch("psutil.cpu_percent", return_value=12.5), \
         patch("psutil.virtual_memory") as vm, \
         patch("psutil.disk_usage") as du:
        vm.return_value.percent = 38.0
        du.return_value.percent = 64.0
        stats = docker_ops.system_stats()
    assert stats["cpu"] == 12.5
    assert stats["memory"] == 38.0
    assert stats["disk"] == 64.0
