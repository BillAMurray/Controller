import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    import data_store
    data_store.DATA_DIR = tmp_path
    data_store.TEMPLATES_FILE = tmp_path / "templates.json"
    data_store.SETTINGS_FILE = tmp_path / "settings.json"
    data_store.TEMPLATES_DIR = tmp_path / "templates"
    from main import app
    return TestClient(app)


def test_get_status(client):
    with patch("docker_ops.list_containers", return_value=[]), \
         patch("docker_ops.system_stats", return_value={"cpu": 5.0, "memory": 20.0, "disk": 50.0}):
        r = client.get("/api/status")
    assert r.status_code == 200
    assert r.json()["runningCount"] == 0


def test_list_templates_empty(client):
    r = client.get("/api/templates")
    assert r.status_code == 200
    assert r.json() == []


def test_upload_template(client):
    r = client.post(
        "/api/templates?name=Test",
        files={"file": ("docker-compose.yml", b"services:\n  web:\n    image: nginx\n")}
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Test"


def test_get_compose(client):
    r = client.post(
        "/api/templates?name=T",
        files={"file": ("docker-compose.yml", b"services:\n  web:\n    image: nginx\n")}
    )
    tid = r.json()["id"]
    r2 = client.get(f"/api/templates/{tid}/compose")
    assert r2.status_code == 200
    assert "nginx" in r2.json()["content"]


def test_rename_template(client):
    r = client.post(
        "/api/templates?name=Old",
        files={"file": ("docker-compose.yml", b"services:\n")}
    )
    tid = r.json()["id"]
    r2 = client.put(f"/api/templates/{tid}", json={"name": "New"})
    assert r2.status_code == 200
    assert r2.json()["name"] == "New"


def test_get_settings_defaults(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    assert r.json()["publishDir"] == ""


def test_update_settings(client):
    r = client.put("/api/settings", json={"publishDir": "C:\\deploy"})
    assert r.status_code == 200
    assert r.json()["publishDir"] == "C:\\deploy"


def test_deploy_no_publish_dir(client):
    r = client.post(
        "/api/templates?name=T",
        files={"file": ("docker-compose.yml", b"services:\n  web:\n    image: nginx\n")}
    )
    tid = r.json()["id"]
    r2 = client.post(f"/api/templates/{tid}/deploy")
    assert r2.status_code == 400
