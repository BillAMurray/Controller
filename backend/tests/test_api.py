import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    import data_store
    data_store.DATA_DIR       = tmp_path
    data_store.TEMPLATES_FILE = tmp_path / "templates.json"
    data_store.SETTINGS_FILE  = tmp_path / "settings.json"
    data_store.SERVICES_FILE  = tmp_path / "services.json"
    from main import app
    return TestClient(app)


# ── Status ────────────────────────────────────────────────────────────────────

def test_get_status(client):
    with patch("docker_ops.list_containers", return_value=[]), \
         patch("docker_ops.system_stats",    return_value={"cpu": 5.0, "memory": 20.0, "disk": 50.0}), \
         patch("docker_ops.list_images",     return_value=["nginx:latest"]):
        r = client.get("/api/status")
    assert r.status_code == 200
    data = r.json()
    assert data["runningCount"] == 0
    assert "nginx:latest" in data["localImages"]


# ── Templates ─────────────────────────────────────────────────────────────────

def test_list_templates_empty(client):
    r = client.get("/api/templates")
    assert r.status_code == 200
    assert r.json() == []


def test_create_template(client):
    r = client.post("/api/templates", json={"name": "My Stack"})
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "My Stack"
    assert data["serviceIds"] == []
    assert data["network"]["name"] == "appnet"


def test_create_template_empty_name_rejected(client):
    r = client.post("/api/templates", json={"name": "  "})
    assert r.status_code == 422


def test_update_template_network_and_services(client):
    r = client.post("/api/templates", json={"name": "T"})
    tid = r.json()["id"]
    # Create a service to reference
    import data_store
    svc = data_store.create_service("web", "nginx:latest")
    r2 = client.put(f"/api/templates/{tid}", json={
        "name": "Updated",
        "network": {"name": "mynet", "driver": "bridge", "internal": True, "external": False, "externalName": ""},
        "serviceIds": [svc["id"]],
    })
    assert r2.status_code == 200
    assert r2.json()["name"] == "Updated"
    assert r2.json()["network"]["name"] == "mynet"
    assert svc["id"] in r2.json()["serviceIds"]


def test_get_compose_generates_yaml(client):
    import data_store
    t = data_store.create_template("T")
    svc = data_store.create_service("web", "nginx:latest")
    data_store.update_template(t["id"], serviceIds=[svc["id"]])
    r = client.get(f"/api/templates/{t['id']}/compose")
    assert r.status_code == 200
    assert "nginx:latest" in r.json()["content"]


def test_get_settings_defaults(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    assert r.json()["publishDir"] == ""


def test_update_settings(client):
    r = client.put("/api/settings", json={"publishDir": "C:\\deploy"})
    assert r.status_code == 200
    assert r.json()["publishDir"] == "C:\\deploy"


def test_deploy_no_publish_dir(client):
    import data_store
    t = data_store.create_template("T")
    r = client.post(f"/api/templates/{t['id']}/deploy")
    assert r.status_code == 400


# ── Services ──────────────────────────────────────────────────────────────────

def test_list_services_empty(client):
    r = client.get("/api/services")
    assert r.status_code == 200
    assert r.json() == []


def test_create_service(client):
    r = client.post("/api/services", json={"name": "ollama", "image": "ollama/ollama:latest"})
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "ollama"
    assert data["image"] == "ollama/ollama:latest"
    assert data["ports"] == []


def test_create_service_empty_name_rejected(client):
    r = client.post("/api/services", json={"name": "", "image": "nginx:latest"})
    assert r.status_code == 422


def test_update_service(client):
    r = client.post("/api/services", json={"name": "web", "image": "nginx:latest"})
    sid = r.json()["id"]
    r2 = client.put(f"/api/services/{sid}", json={"ports": ["80:80"], "restart": "always"})
    assert r2.status_code == 200
    assert r2.json()["ports"] == ["80:80"]
    assert r2.json()["restart"] == "always"


def test_delete_service(client):
    r = client.post("/api/services", json={"name": "db", "image": "postgres:15"})
    sid = r.json()["id"]
    r2 = client.delete(f"/api/services/{sid}")
    assert r2.status_code == 200
    assert client.get("/api/services").json() == []


def test_pull_service(client):
    r = client.post("/api/services", json={"name": "ollama", "image": "ollama/ollama:latest"})
    sid = r.json()["id"]
    with patch("docker_ops.image_pull", return_value=(True, "pulled")):
        r2 = client.post(f"/api/services/{sid}/pull")
    assert r2.status_code == 200
