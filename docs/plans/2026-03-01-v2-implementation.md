# Controller v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade Controller from raw-YAML template management to a form-based approach where templates are structured records (network config + selected services) and YAML is generated at deploy time.

**Architecture:** JSON file persistence extended with a new `services.json`. A new `yaml_generator.py` module builds compose YAML from structured data. The frontend Settings page is rewritten with two tabs (Templates | Services) and two-panel layouts; the Dashboard now sources service cards from `services.json` via template's `serviceIds`.

**Tech Stack:** Python 3.11 + FastAPI + PyYAML (already in requirements.txt) | React 18 + Vite + Tailwind + TanStack React Query + Lucide icons

---

## Reference: v2 Design Doc
`docs/plans/2026-03-01-v2-design.md` — read this before starting any task.

---

## Task 1: data_store.py — services layer + updated template schema

**Files:**
- Modify: `backend/data_store.py`
- Modify: `backend/tests/test_data_store.py`

### Step 1: Write failing tests

Replace `backend/tests/test_data_store.py` with:

```python
import pytest

@pytest.fixture(autouse=True)
def tmp_data(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    import data_store
    data_store.DATA_DIR = tmp_path
    data_store.TEMPLATES_FILE = tmp_path / "templates.json"
    data_store.SETTINGS_FILE  = tmp_path / "settings.json"
    data_store.SERVICES_FILE  = tmp_path / "services.json"

# ── Templates ────────────────────────────────────────────────────────────────

def test_load_templates_empty():
    import data_store
    assert data_store.load_templates() == []

def test_create_template_has_network_and_service_ids():
    import data_store
    t = data_store.create_template("My Stack")
    assert t["name"] == "My Stack"
    assert t["serviceIds"] == []
    assert t["network"]["name"] == "appnet"
    assert t["network"]["driver"] == "bridge"

def test_create_template_no_directory_created():
    import data_store
    t = data_store.create_template("T")
    assert not (data_store.DATA_DIR / "templates" / t["id"]).exists()

def test_update_template():
    import data_store
    t = data_store.create_template("Old")
    updated = data_store.update_template(t["id"], name="New")
    assert updated["name"] == "New"

def test_delete_template():
    import data_store
    t = data_store.create_template("To Delete")
    assert data_store.delete_template(t["id"]) is True
    assert data_store.get_template(t["id"]) is None
    assert data_store.delete_template(t["id"]) is False

# ── Services ─────────────────────────────────────────────────────────────────

def test_load_services_empty():
    import data_store
    assert data_store.load_services() == []

def test_create_and_get_service():
    import data_store
    s = data_store.create_service("ollama", "ollama/ollama:latest")
    assert s["name"] == "ollama"
    assert s["image"] == "ollama/ollama:latest"
    assert s["ports"] == []
    assert s["volumes"] == []
    assert s["environment"] == []
    assert s["restart"] == "unless-stopped"
    assert s["unavailable"] is False
    assert data_store.get_service(s["id"]) == s

def test_update_service():
    import data_store
    s = data_store.create_service("web", "nginx:latest")
    updated = data_store.update_service(s["id"], ports=["80:80"], unavailable=True)
    assert updated["ports"] == ["80:80"]
    assert updated["unavailable"] is True

def test_delete_service():
    import data_store
    s = data_store.create_service("db", "postgres:15")
    assert data_store.delete_service(s["id"]) is True
    assert data_store.get_service(s["id"]) is None
    assert data_store.delete_service(s["id"]) is False

# ── Settings ──────────────────────────────────────────────────────────────────

def test_settings_defaults():
    import data_store
    s = data_store.load_settings()
    assert s["publishDir"] == ""
    assert s["activeTemplateId"] is None

def test_save_and_load_settings():
    import data_store
    data_store.save_settings({"publishDir": "C:\\deploy", "activeTemplateId": "abc", "lastPulledAll": None})
    s = data_store.load_settings()
    assert s["publishDir"] == "C:\\deploy"
```

### Step 2: Run to verify failures

```bash
cd backend && venv/Scripts/pytest tests/test_data_store.py -v
```

Expected: multiple FAILs — `SERVICES_FILE` not found, `create_template` missing `network`/`serviceIds`, no `load_services`, etc.

### Step 3: Rewrite backend/data_store.py

```python
import json
import os
import uuid
import shutil
from datetime import date
from pathlib import Path

DATA_DIR       = Path(os.getenv("DATA_DIR", Path(__file__).parent.parent / "data"))
TEMPLATES_FILE = DATA_DIR / "templates.json"
SETTINGS_FILE  = DATA_DIR / "settings.json"
SERVICES_FILE  = DATA_DIR / "services.json"


def _ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


# ── Templates ────────────────────────────────────────────────────────────────

def load_templates() -> list[dict]:
    _ensure_dirs()
    if not TEMPLATES_FILE.exists():
        return []
    return json.loads(TEMPLATES_FILE.read_text(encoding="utf-8"))


def save_templates(templates: list[dict]):
    _ensure_dirs()
    TEMPLATES_FILE.write_text(json.dumps(templates, indent=2), encoding="utf-8")


def get_template(template_id: str) -> dict | None:
    return next((t for t in load_templates() if t["id"] == template_id), None)


def create_template(name: str) -> dict:
    template = {
        "id": str(uuid.uuid4()),
        "name": name,
        "createdAt": date.today().isoformat(),
        "lastPulled": None,
        "network": {
            "name": "appnet",
            "driver": "bridge",
            "internal": False,
            "external": False,
            "externalName": "",
        },
        "serviceIds": [],
    }
    templates = load_templates()
    templates.append(template)
    save_templates(templates)
    return template


def update_template(template_id: str, **kwargs) -> dict | None:
    templates = load_templates()
    for t in templates:
        if t["id"] == template_id:
            t.update(kwargs)
            save_templates(templates)
            return t
    return None


def delete_template(template_id: str) -> bool:
    templates = load_templates()
    filtered = [t for t in templates if t["id"] != template_id]
    if len(filtered) == len(templates):
        return False
    save_templates(filtered)
    return True


# ── Services ─────────────────────────────────────────────────────────────────

def load_services() -> list[dict]:
    _ensure_dirs()
    if not SERVICES_FILE.exists():
        return []
    return json.loads(SERVICES_FILE.read_text(encoding="utf-8"))


def save_services(services: list[dict]):
    _ensure_dirs()
    SERVICES_FILE.write_text(json.dumps(services, indent=2), encoding="utf-8")


def get_service(service_id: str) -> dict | None:
    return next((s for s in load_services() if s["id"] == service_id), None)


def create_service(name: str, image: str) -> dict:
    service = {
        "id": str(uuid.uuid4()),
        "name": name,
        "image": image,
        "ports": [],
        "volumes": [],
        "environment": [],
        "restart": "unless-stopped",
        "unavailable": False,
    }
    services = load_services()
    services.append(service)
    save_services(services)
    return service


def update_service(service_id: str, **kwargs) -> dict | None:
    services = load_services()
    for s in services:
        if s["id"] == service_id:
            s.update(kwargs)
            save_services(services)
            return s
    return None


def delete_service(service_id: str) -> bool:
    services = load_services()
    filtered = [s for s in services if s["id"] != service_id]
    if len(filtered) == len(services):
        return False
    save_services(filtered)
    return True


# ── Settings ──────────────────────────────────────────────────────────────────

def load_settings() -> dict:
    _ensure_dirs()
    if not SETTINGS_FILE.exists():
        return {"publishDir": "", "activeTemplateId": None, "lastPulledAll": None}
    return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))


def save_settings(settings: dict):
    _ensure_dirs()
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2), encoding="utf-8")
```

### Step 4: Run tests to verify passing

```bash
cd backend && venv/Scripts/pytest tests/test_data_store.py -v
```

Expected: 12 tests PASS.

### Step 5: Commit

```bash
git add backend/data_store.py backend/tests/test_data_store.py
git commit -m "feat: v2 data_store — services layer, updated template schema, remove compose file functions"
```

---

## Task 2: docker_ops.py — list_images + image_pull

**Files:**
- Modify: `backend/docker_ops.py`
- Modify: `backend/tests/test_docker_ops.py`

### Step 1: Add failing tests

Append to `backend/tests/test_docker_ops.py`:

```python
def test_list_images_returns_strings():
    line = '{"Repository":"ollama/ollama","Tag":"latest","ID":"abc123","Size":"6.5GB","CreatedAt":"2024-01-01"}'
    with patch("subprocess.run", return_value=_mock_run(0, line + "\n")):
        images = docker_ops.list_images()
    assert images == ["ollama/ollama:latest"]


def test_list_images_empty_on_failure():
    with patch("subprocess.run", return_value=_mock_run(1, "", "daemon not running")):
        images = docker_ops.list_images()
    assert images == []


def test_image_pull_success():
    with patch("subprocess.run", return_value=_mock_run(0, "pulled")):
        ok, msg = docker_ops.image_pull("ollama/ollama:latest")
    assert ok is True


def test_image_pull_failure():
    with patch("subprocess.run", return_value=_mock_run(1, "", "not found")):
        ok, msg = docker_ops.image_pull("bad/image:xyz")
    assert ok is False
    assert "not found" in msg
```

### Step 2: Run to verify failures

```bash
cd backend && venv/Scripts/pytest tests/test_docker_ops.py -v
```

Expected: 4 new FAILs — `list_images` and `image_pull` not defined.

### Step 3: Add to backend/docker_ops.py

Append after `container_stop`:

```python
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
```

### Step 4: Run tests

```bash
cd backend && venv/Scripts/pytest tests/test_docker_ops.py -v
```

Expected: all 17 tests PASS.

### Step 5: Commit

```bash
git add backend/docker_ops.py backend/tests/test_docker_ops.py
git commit -m "feat: add list_images and image_pull to docker_ops"
```

---

## Task 3: yaml_generator.py — YAML generation from structured data

**Files:**
- Create: `backend/yaml_generator.py`
- Create: `backend/tests/test_yaml_generator.py`

### Step 1: Write failing tests

Create `backend/tests/test_yaml_generator.py`:

```python
import yaml
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
import yaml_generator


def _template(service_ids=None, network=None):
    return {
        "id": "t1",
        "name": "Test Stack",
        "network": network or {"name": "appnet", "driver": "bridge", "internal": False, "external": False, "externalName": ""},
        "serviceIds": service_ids or [],
    }


def _service(name="web", image="nginx:latest", ports=None, volumes=None, environment=None, restart="unless-stopped"):
    return {
        "id": "s1",
        "name": name,
        "image": image,
        "ports": ports or [],
        "volumes": volumes or [],
        "environment": environment or [],
        "restart": restart,
        "unavailable": False,
    }


def test_generate_minimal():
    t = _template()
    result = yaml_generator.generate_compose(t, [_service()])
    parsed = yaml.safe_load(result)
    assert "services" in parsed
    assert "web" in parsed["services"]
    assert parsed["services"]["web"]["image"] == "nginx:latest"


def test_generate_network_bridge():
    t = _template()
    parsed = yaml.safe_load(yaml_generator.generate_compose(t, [_service()]))
    assert parsed["networks"]["appnet"]["driver"] == "bridge"
    assert parsed["services"]["web"]["networks"] == ["appnet"]


def test_generate_network_internal():
    net = {"name": "appnet", "driver": "bridge", "internal": True, "external": False, "externalName": ""}
    t = _template(network=net)
    parsed = yaml.safe_load(yaml_generator.generate_compose(t, [_service()]))
    assert parsed["networks"]["appnet"].get("internal") is True
    assert parsed["networks"]["appnet"]["driver"] == "bridge"


def test_generate_network_external():
    net = {"name": "appnet", "driver": "bridge", "internal": False, "external": True, "externalName": "shared_net"}
    t = _template(network=net)
    parsed = yaml.safe_load(yaml_generator.generate_compose(t, [_service()]))
    assert parsed["networks"]["appnet"]["external"] is True
    assert parsed["networks"]["appnet"]["name"] == "shared_net"
    assert "driver" not in parsed["networks"]["appnet"]


def test_generate_ports_and_volumes():
    svc = _service(ports=["11434:11434"], volumes=["ollama:/root/.ollama"])
    t = _template()
    parsed = yaml.safe_load(yaml_generator.generate_compose(t, [svc]))
    assert "11434:11434" in parsed["services"]["web"]["ports"]
    assert "ollama:/root/.ollama" in parsed["services"]["web"]["volumes"]


def test_generate_deduplicates_volumes():
    svc1 = _service("a", "img1", volumes=["shared:/data"])
    svc2 = _service("b", "img2", volumes=["shared:/data"])
    t = _template()
    parsed = yaml.safe_load(yaml_generator.generate_compose(t, [svc1, svc2]))
    assert "shared" in parsed["volumes"]
    assert len([k for k in parsed["volumes"]]) == 1


def test_generate_environment():
    svc = _service(environment=["KEY=val", "OTHER=123"])
    t = _template()
    parsed = yaml.safe_load(yaml_generator.generate_compose(t, [svc]))
    assert "KEY=val" in parsed["services"]["web"]["environment"]


def test_generate_restart_policy():
    svc = _service(restart="always")
    t = _template()
    parsed = yaml.safe_load(yaml_generator.generate_compose(t, [svc]))
    assert parsed["services"]["web"]["restart"] == "always"


def test_generate_no_services_returns_valid_yaml():
    t = _template()
    result = yaml_generator.generate_compose(t, [])
    parsed = yaml.safe_load(result)
    assert parsed["services"] == {} or parsed["services"] is None


def test_generate_skips_host_path_volumes_from_top_level():
    """Volumes starting with . or / are bind mounts, not named volumes — skip from top-level."""
    svc = _service(volumes=["./data:/app/data", "/host/path:/container"])
    t = _template()
    parsed = yaml.safe_load(yaml_generator.generate_compose(t, [svc]))
    assert not parsed.get("volumes")
```

### Step 2: Run to verify failures

```bash
cd backend && venv/Scripts/pytest tests/test_yaml_generator.py -v
```

Expected: all FAILs — `yaml_generator` module not found.

### Step 3: Create backend/yaml_generator.py

```python
import yaml


def generate_compose(template: dict, services: list[dict]) -> str:
    """Generate a docker-compose.yml string from a template and its resolved services."""
    network      = template.get("network", {})
    network_name = (network.get("name") or "appnet").strip() or "appnet"

    # Collect unique named volumes (skip bind mounts: paths starting with . or /)
    all_volumes: dict = {}
    for svc in services:
        for vol in svc.get("volumes", []):
            parts = str(vol).split(":")
            host = parts[0]
            if host and not host.startswith(".") and not host.startswith("/"):
                all_volumes[host] = {}

    compose: dict = {
        "services":  {},
        "networks":  {network_name: _build_network(network)},
    }
    if all_volumes:
        compose["volumes"] = all_volumes

    for svc in services:
        entry: dict = {"image": svc["image"]}
        if svc.get("ports"):
            entry["ports"] = svc["ports"]
        if svc.get("volumes"):
            entry["volumes"] = svc["volumes"]
        if svc.get("environment"):
            entry["environment"] = svc["environment"]
        if svc.get("restart"):
            entry["restart"] = svc["restart"]
        entry["networks"] = [network_name]
        compose["services"][svc["name"]] = entry

    return yaml.dump(compose, default_flow_style=False, sort_keys=False, allow_unicode=True)


def _build_network(network: dict) -> dict:
    if network.get("external"):
        result: dict = {"external": True}
        if network.get("externalName"):
            result["name"] = network["externalName"]
        return result
    result = {"driver": "bridge"}
    if network.get("internal"):
        result["internal"] = True
    return result
```

### Step 4: Run tests

```bash
cd backend && venv/Scripts/pytest tests/test_yaml_generator.py -v
```

Expected: all 10 tests PASS.

### Step 5: Commit

```bash
git add backend/yaml_generator.py backend/tests/test_yaml_generator.py
git commit -m "feat: add yaml_generator — generate compose YAML from structured template + services"
```

---

## Task 4: main.py — updated API routes

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/test_api.py`

### Step 1: Rewrite backend/tests/test_api.py

```python
import pytest
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


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
```

### Step 2: Run to verify failures

```bash
cd backend && venv/Scripts/pytest tests/test_api.py -v
```

Expected: many FAILs — new service routes don't exist, template creation is wrong format, etc.

### Step 3: Rewrite backend/main.py

```python
import tempfile
from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import data_store
import docker_ops
import yaml_generator

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5175", "http://127.0.0.1:5175"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Status ─────────────────────────────────────────────────────────────────────

@app.get("/api/status")
def get_status():
    containers   = docker_ops.list_containers()
    stats        = docker_ops.system_stats()
    local_images = docker_ops.list_images()
    return {**stats, "runningCount": len(containers), "containers": containers, "localImages": local_images}


# ── Templates ──────────────────────────────────────────────────────────────────

@app.get("/api/templates")
def list_templates():
    return data_store.load_templates()


@app.post("/api/templates")
def create_template_route(body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(422, "name is required")
    return data_store.create_template(name)


@app.put("/api/templates/{template_id}")
def update_template_route(template_id: str, body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(422, "name is required")
    kwargs: dict = {"name": name}
    if "network" in body:
        kwargs["network"] = body["network"]
    if "serviceIds" in body:
        kwargs["serviceIds"] = body["serviceIds"]
    t = data_store.update_template(template_id, **kwargs)
    if not t:
        raise HTTPException(404, "Template not found")
    return t


@app.delete("/api/templates/{template_id}")
def remove_template(template_id: str):
    settings = data_store.load_settings()
    if settings.get("activeTemplateId") == template_id:
        settings["activeTemplateId"] = None
        data_store.save_settings(settings)
    if not data_store.delete_template(template_id):
        raise HTTPException(404, "Template not found")
    return {"ok": True}


@app.get("/api/templates/{template_id}/compose")
def get_compose(template_id: str):
    template = data_store.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    services = [data_store.get_service(sid) for sid in template.get("serviceIds", [])]
    services = [s for s in services if s]
    content = yaml_generator.generate_compose(template, services)
    return {"content": content}


# ── Deploy / Stop ──────────────────────────────────────────────────────────────

def _get_generated_yaml(template_id: str) -> str:
    template = data_store.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    services = [data_store.get_service(sid) for sid in template.get("serviceIds", [])]
    return yaml_generator.generate_compose(template, [s for s in services if s])


@app.post("/api/templates/{template_id}/deploy")
def deploy_template(template_id: str):
    compose_content = _get_generated_yaml(template_id)
    settings = data_store.load_settings()
    publish_dir = settings.get("publishDir", "")
    if not publish_dir or not Path(publish_dir).exists():
        raise HTTPException(400, "Publish directory not configured or does not exist")
    dest = Path(publish_dir) / "docker-compose.yml"
    dest.write_text(compose_content, encoding="utf-8")
    ok, msg = docker_ops.compose_up(str(dest))
    if not ok:
        raise HTTPException(500, f"docker compose up failed: {msg}")
    settings["activeTemplateId"] = template_id
    data_store.save_settings(settings)
    return {"ok": True}


@app.post("/api/templates/{template_id}/stop")
def stop_template(template_id: str):
    settings = data_store.load_settings()
    if settings.get("activeTemplateId") != template_id:
        raise HTTPException(409, "Template is not the active deployment")
    publish_dir = settings.get("publishDir", "")
    if not publish_dir or not Path(publish_dir).exists():
        raise HTTPException(400, "Publish directory not configured")
    compose_file = Path(publish_dir) / "docker-compose.yml"
    if not compose_file.exists():
        raise HTTPException(400, "No compose file in publish directory")
    ok, msg = docker_ops.compose_down(str(compose_file))
    if not ok:
        raise HTTPException(500, f"docker compose down failed: {msg}")
    settings["activeTemplateId"] = None
    data_store.save_settings(settings)
    return {"ok": True}


# ── Pull ───────────────────────────────────────────────────────────────────────

@app.post("/api/templates/{template_id}/pull")
def pull_template(template_id: str):
    compose_content = _get_generated_yaml(template_id)
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yml", delete=False, encoding="utf-8") as f:
        f.write(compose_content)
        tmp_path = f.name
    try:
        ok, msg = docker_ops.compose_pull(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    if not ok:
        raise HTTPException(500, f"docker compose pull failed: {msg}")
    data_store.update_template(template_id, lastPulled=date.today().isoformat())
    return {"ok": True}


@app.post("/api/pull-all")
def pull_all():
    templates  = data_store.load_templates()
    errors     = []
    any_success = False
    for t in templates:
        services = [data_store.get_service(sid) for sid in t.get("serviceIds", [])]
        content  = yaml_generator.generate_compose(t, [s for s in services if s])
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yml", delete=False, encoding="utf-8") as f:
            f.write(content)
            tmp_path = f.name
        try:
            ok, msg = docker_ops.compose_pull(tmp_path)
        finally:
            Path(tmp_path).unlink(missing_ok=True)
        if ok:
            any_success = True
            data_store.update_template(t["id"], lastPulled=date.today().isoformat())
        else:
            errors.append({"template": t["name"], "error": msg})
    if any_success:
        settings = data_store.load_settings()
        settings["lastPulledAll"] = date.today().isoformat()
        data_store.save_settings(settings)
    return {"ok": len(errors) == 0, "errors": errors}


# ── Services ───────────────────────────────────────────────────────────────────

@app.get("/api/services")
def list_services():
    return data_store.load_services()


@app.post("/api/services")
def create_service_route(body: dict):
    name  = body.get("name", "").strip()
    image = body.get("image", "").strip()
    if not name or not image:
        raise HTTPException(422, "name and image are required")
    return data_store.create_service(name, image)


@app.put("/api/services/{service_id}")
def update_service_route(service_id: str, body: dict):
    allowed = {"name", "image", "ports", "volumes", "environment", "restart", "unavailable"}
    kwargs  = {k: v for k, v in body.items() if k in allowed}
    s = data_store.update_service(service_id, **kwargs)
    if not s:
        raise HTTPException(404, "Service not found")
    return s


@app.delete("/api/services/{service_id}")
def delete_service_route(service_id: str):
    if not data_store.delete_service(service_id):
        raise HTTPException(404, "Service not found")
    return {"ok": True}


@app.post("/api/services/{service_id}/pull")
def pull_service_route(service_id: str):
    service = data_store.get_service(service_id)
    if not service:
        raise HTTPException(404, "Service not found")
    ok, msg = docker_ops.image_pull(service["image"])
    if not ok:
        raise HTTPException(500, f"docker pull failed: {msg}")
    return {"ok": True}


# ── Containers ─────────────────────────────────────────────────────────────────

@app.post("/api/containers/{name}/start")
def start_container(name: str):
    ok, msg = docker_ops.container_start(name)
    if not ok:
        raise HTTPException(500, msg)
    return {"ok": True}


@app.post("/api/containers/{name}/stop")
def stop_container(name: str):
    ok, msg = docker_ops.container_stop(name)
    if not ok:
        raise HTTPException(500, msg)
    return {"ok": True}


# ── Settings ───────────────────────────────────────────────────────────────────

@app.get("/api/settings")
def get_settings():
    return data_store.load_settings()


@app.put("/api/settings")
def update_settings(body: dict):
    settings = data_store.load_settings()
    if "publishDir" in body:
        settings["publishDir"] = body["publishDir"]
    data_store.save_settings(settings)
    return settings
```

### Step 4: Run all backend tests

```bash
cd backend && venv/Scripts/pytest -v
```

Expected: all tests PASS (12 data_store + 17 docker_ops + 10 yaml_generator + 18 api = 57 tests).

### Step 5: Commit

```bash
git add backend/main.py backend/tests/test_api.py
git commit -m "feat: v2 main.py — services CRUD, generate YAML on deploy/pull, updated template routes"
```

---

## Task 5: api.js — update frontend API client

**Files:**
- Modify: `frontend/src/api.js`

No unit tests — verified by Vite build in Step 3.

### Step 1: Replace frontend/src/api.js

```javascript
const BASE = '/api'

async function request(method, path, body) {
  const opts = { method, headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  // Status
  getStatus:        ()              => request('GET',    '/status'),

  // Templates
  getTemplates:     ()              => request('GET',    '/templates'),
  createTemplate:   (name)          => request('POST',   '/templates', { name }),
  updateTemplate:   (id, data)      => request('PUT',    `/templates/${id}`, data),
  deleteTemplate:   (id)            => request('DELETE', `/templates/${id}`),
  getCompose:       (id)            => request('GET',    `/templates/${id}/compose`),
  deployTemplate:   (id)            => request('POST',   `/templates/${id}/deploy`),
  stopTemplate:     (id)            => request('POST',   `/templates/${id}/stop`),
  pullTemplate:     (id)            => request('POST',   `/templates/${id}/pull`),
  pullAll:          ()              => request('POST',   '/pull-all'),

  // Services
  getServices:      ()              => request('GET',    '/services'),
  createService:    (data)          => request('POST',   '/services', data),
  updateService:    (id, data)      => request('PUT',    `/services/${id}`, data),
  deleteService:    (id)            => request('DELETE', `/services/${id}`),
  pullService:      (id)            => request('POST',   `/services/${id}/pull`),

  // Containers
  startContainer:   (name)          => request('POST',   `/containers/${encodeURIComponent(name)}/start`),
  stopContainer:    (name)          => request('POST',   `/containers/${encodeURIComponent(name)}/stop`),

  // Settings
  getSettings:      ()              => request('GET',    '/settings'),
  saveSettings:     (body)          => request('PUT',    '/settings', body),
}
```

### Step 2: Verify build

```bash
cd frontend && npm run build
```

Expected: build succeeds, no errors.

### Step 3: Commit

```bash
git add frontend/src/api.js
git commit -m "feat: v2 api.js — services CRUD, remove file upload, JSON-body template creation"
```

---

## Task 6: App.jsx — remove sidebar

**Files:**
- Modify: `frontend/src/App.jsx`

### Step 1: Replace frontend/src/App.jsx

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [settingsTab, setSettingsTab] = useState('templates')

  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ['templates'],
    queryFn: api.getTemplates,
  })

  if (isLoading) return <div className="min-h-screen bg-gray-900" />

  if (isError) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-red-400 text-sm">Could not reach the backend. Is the API server running on port 8025?</p>
    </div>
  )

  if (!templates || templates.length === 0) {
    return <Onboarding />
  }

  function openSettings(tab = 'templates') {
    setSettingsTab(tab)
    setPage('settings')
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {page === 'dashboard' && <Dashboard onSettings={openSettings} />}
      {page === 'settings' && <Settings onBack={() => setPage('dashboard')} defaultTab={settingsTab} />}
    </div>
  )
}
```

### Step 2: Verify build

```bash
cd frontend && npm run build
```

Expected: succeeds.

### Step 3: Commit

```bash
git add frontend/src/App.jsx
git commit -m "feat: remove sidebar from App, pass settingsTab to Settings"
```

---

## Task 7: Dashboard.jsx — use services from store

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Delete: `frontend/src/utils/parseCompose.js`

### Step 1: Replace frontend/src/pages/Dashboard.jsx

```jsx
import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import { api } from '../api'
import StatsBar from '../components/StatsBar'
import ServiceCard from '../components/ServiceCard'
import DeployButton from '../components/DeployButton'
import PullButton from '../components/PullButton'

export default function Dashboard({ onSettings }) {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)

  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: api.getTemplates })
  const { data: status }         = useQuery({ queryKey: ['status'],    queryFn: api.getStatus, refetchInterval: 5000 })
  const { data: settings }       = useQuery({ queryKey: ['settings'],  queryFn: api.getSettings })
  const { data: allServices = [] } = useQuery({ queryKey: ['services'], queryFn: api.getServices })

  const activeId       = selectedId || templates[0]?.id
  const activeTemplate = templates.find(t => t.id === activeId)

  const localImages       = status?.localImages || []
  const runningContainers = status?.containers  || []

  // Filter to this template's services
  const serviceIds    = activeTemplate?.serviceIds || []
  const activeServices = allServices.filter(s => serviceIds.includes(s.id))

  const stopMutation = useMutation({
    mutationFn: () => api.stopTemplate(activeId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['status'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  async function handleToggleContainer(containerName, isRunning) {
    if (isRunning) await api.stopContainer(containerName)
    else           await api.startContainer(containerName)
    qc.invalidateQueries({ queryKey: ['status'] })
  }

  const canStop = settings?.activeTemplateId === activeId

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">C</div>
          <h1 className="text-xl font-bold text-white">Controller</h1>
        </div>
        <StatsBar status={status} />
        <button onClick={() => onSettings('templates')} className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
          <Settings size={20} />
        </button>
      </header>

      {/* Template action bar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-gray-800/50 border-b border-gray-700 flex-shrink-0 flex-wrap">
        <span className="text-gray-400 text-sm">Template</span>
        <select
          value={activeId || ''}
          onChange={e => setSelectedId(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <div className="flex items-center gap-2 ml-2 flex-wrap">
          <DeployButton
            templateId={activeId}
            activeTemplateId={settings?.activeTemplateId}
            runningContainers={runningContainers}
            disabled={!activeId}
          />
          <button
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending || !canStop}
            className="px-3 py-1.5 bg-gray-700 hover:bg-red-900 rounded text-sm text-white disabled:opacity-40 transition-colors"
          >
            {stopMutation.isPending ? 'Stopping…' : 'Stop'}
          </button>
          <PullButton
            templateId={activeId}
            lastPulled={activeTemplate?.lastPulled}
            lastPulledAll={settings?.lastPulledAll}
          />
        </div>
      </div>

      {/* Service canvas */}
      <div className="flex-1 overflow-auto p-6">
        {activeServices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
            <p>No services in this template.</p>
            <p className="text-sm">
              <button onClick={() => onSettings('templates')} className="text-blue-400 hover:underline">
                Open Settings
              </button>{' '}
              to add services.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeServices.map(s => {
              const imageMissing = !localImages.some(li =>
                li === s.image || li.split(':')[0] === s.image.split(':')[0]
              )
              return (
                <ServiceCard
                  key={s.id}
                  service={s}
                  runningContainers={runningContainers}
                  onToggle={handleToggleContainer}
                  imageMissing={imageMissing}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

### Step 2: Update ServiceCard to accept imageMissing prop

Open `frontend/src/components/ServiceCard.jsx`. Find the component signature and add `imageMissing = false` to destructuring. Add a small badge below the service name when `imageMissing` is true:

```jsx
// In the card body, after the service name:
{imageMissing && (
  <span className="text-xs text-yellow-500 mt-0.5">image not found locally</span>
)}
```

### Step 3: Delete parseCompose.js

```bash
rm frontend/src/utils/parseCompose.js
```

If `frontend/src/utils/` is now empty, delete it too:
```bash
rmdir frontend/src/utils
```

### Step 4: Verify build

```bash
cd frontend && npm run build
```

Expected: succeeds, no references to `parseCompose`.

### Step 5: Commit

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/components/ServiceCard.jsx
git rm frontend/src/utils/parseCompose.js
git commit -m "feat: Dashboard uses services.json, add imageMissing badge, remove parseCompose"
```

---

## Task 8: Onboarding.jsx — remove YAML upload

**Files:**
- Modify: `frontend/src/pages/Onboarding.jsx`

The onboarding page no longer offers YAML drag-and-drop. "Get Started" creates an empty template via the new JSON-body API.

### Step 1: Read the current file

Read `frontend/src/pages/Onboarding.jsx` before editing.

### Step 2: Replace frontend/src/pages/Onboarding.jsx

```jsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

export default function Onboarding() {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleGetStarted() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      await api.createTemplate('My Stack')
      qc.invalidateQueries({ queryKey: ['templates'] })
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-6 px-4">
      <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
        C
      </div>
      <h1 className="text-3xl font-bold">Controller</h1>
      <p className="text-gray-400 text-center max-w-sm">
        Manage your Docker Compose services without writing YAML.
        Create a template to get started.
      </p>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        onClick={handleGetStarted}
        disabled={loading}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-semibold disabled:opacity-50 transition-colors"
      >
        {loading ? 'Creating…' : 'Get Started'}
      </button>
      <p className="text-gray-600 text-xs absolute bottom-6">
        Controller runs docker compose on your local machine.
      </p>
    </div>
  )
}
```

### Step 3: Verify build

```bash
cd frontend && npm run build
```

### Step 4: Commit

```bash
git add frontend/src/pages/Onboarding.jsx
git commit -m "feat: simplify Onboarding — remove YAML upload, JSON-body template creation"
```

---

## Task 9: Settings.jsx — full rewrite with tabs + two-panel layouts

This is the largest frontend task. The file is completely rewritten. Read the v2 design doc before starting:
`docs/plans/2026-03-01-v2-design.md`

**Files:**
- Modify: `frontend/src/pages/Settings.jsx`

### Step 1: Read current Settings.jsx

Read `frontend/src/pages/Settings.jsx` — understand what to remove.

### Step 2: Write the new Settings.jsx

The component has three logical sections implemented inline:
1. `Settings` shell (tabs, back arrow, header)
2. `TemplatesTab` (left list + right detail with network form + services checklist + YAML modal)
3. `ServicesTab` (left list + right detail with service form)

```jsx
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Trash2, Save, Code2, X, Plus, RefreshCw } from 'lucide-react'
import { api } from '../api'

// ─── Helper: list editor (ports, volumes, env) ───────────────────────────────
function ListEditor({ label, values, onChange, placeholder }) {
  function update(i, val) {
    const next = [...values]
    next[i] = val
    onChange(next)
  }
  function remove(i) { onChange(values.filter((_, idx) => idx !== i)) }
  function add()     { onChange([...values, '']) }
  return (
    <div className="mb-4">
      <label className="block text-sm text-gray-300 mb-1">{label}</label>
      {values.map((v, i) => (
        <div key={i} className="flex gap-2 mb-1">
          <input
            value={v}
            onChange={e => update(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button onClick={() => remove(i)} className="px-2 text-gray-400 hover:text-red-400">×</button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-blue-400 hover:text-blue-300 mt-1">+ Add</button>
    </div>
  )
}

// ─── YAML View Modal ──────────────────────────────────────────────────────────
function YamlModal({ templateId, templateName, onClose }) {
  const [content, setContent] = useState('')
  const [copied,  setCopied]  = useState(false)
  useEffect(() => {
    api.getCompose(templateId).then(d => setContent(d?.content || '')).catch(() => setContent(''))
  }, [templateId])
  function copy() {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-sm font-semibold text-gray-200">Generated YAML — {templateName}</span>
          <div className="flex gap-2">
            <button onClick={copy} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white">
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-white"><X size={16} /></button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto p-4 text-green-400 text-xs font-mono whitespace-pre">{content}</pre>
      </div>
    </div>
  )
}

// ─── New Template Dialog ──────────────────────────────────────────────────────
function NewTemplateDialog({ onClose, onCreated }) {
  const [name,  setName]  = useState('')
  const [error, setError] = useState(null)
  const [busy,  setBusy]  = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const t = await api.createTemplate(name.trim())
      onCreated(t)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-sm p-6">
        <h2 className="text-white font-semibold mb-4">New Template</h2>
        <form onSubmit={submit}>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Template name"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button type="submit" disabled={busy || !name.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm disabled:opacity-50">
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Add Service Dialog ───────────────────────────────────────────────────────
function AddServiceDialog({ onClose, onAdded }) {
  const [image,       setImage]       = useState('')
  const [pulling,     setPulling]     = useState(false)
  const [error,       setError]       = useState(null)
  const { data: status } = useQuery({ queryKey: ['status'], queryFn: api.getStatus })
  const { data: existingSvcs = [] }   = useQuery({ queryKey: ['services'], queryFn: api.getServices })

  const localImages  = status?.localImages || []
  const usedImages   = existingSvcs.map(s => s.image)
  const suggestions  = localImages.filter(img => !usedImages.includes(img))

  function deriveName(img) {
    // "ghcr.io/open-webui/open-webui:main" → "open-webui"
    const base = img.split('/').pop().split(':')[0]
    return base
  }

  async function addWithoutPull() {
    if (!image.trim()) return
    setError(null)
    try {
      const s = await api.createService({ name: deriveName(image.trim()), image: image.trim() })
      onAdded(s)
    } catch (err) {
      setError(err.message)
    }
  }

  async function addAndPull() {
    if (!image.trim()) return
    setPulling(true)
    setError(null)
    try {
      const s = await api.createService({ name: deriveName(image.trim()), image: image.trim() })
      await api.pullService(s.id)
      onAdded(s)
    } catch (err) {
      setError(err.message)
      setPulling(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-md p-6">
        <h2 className="text-white font-semibold mb-4">Add Service</h2>
        <input
          autoFocus
          value={image}
          onChange={e => setImage(e.target.value)}
          placeholder="e.g. ollama/ollama:latest"
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {suggestions.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-1">Local images not yet added:</p>
            <div className="max-h-32 overflow-auto space-y-1">
              {suggestions.map(img => (
                <button key={img} onClick={() => setImage(img)}
                  className="block w-full text-left text-xs text-blue-300 hover:text-blue-200 font-mono px-2 py-1 bg-gray-700 rounded truncate">
                  {img}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
        <p className="text-xs text-gray-500 mb-3">
          Image will be pulled automatically on first deploy if not available locally.
        </p>
        <div className="flex gap-2 justify-end flex-wrap">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button onClick={addWithoutPull} disabled={!image.trim() || pulling}
            className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 rounded text-white disabled:opacity-50">
            Add to Services list
          </button>
          <button onClick={addAndPull} disabled={!image.trim() || pulling}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white disabled:opacity-50 flex items-center gap-1">
            {pulling ? <><RefreshCw size={12} className="animate-spin" /> Pulling…</> : 'Add & Pull'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Template Detail ──────────────────────────────────────────────────────────
function TemplateDetail({ template, allServices, localImages, onSaved, onDeleted }) {
  const [name,       setName]       = useState(template.name)
  const [network,    setNetwork]    = useState(template.network || { name: 'appnet', driver: 'bridge', internal: false, external: false, externalName: '' })
  const [serviceIds, setServiceIds] = useState(template.serviceIds || [])
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState(null)
  const [showYaml,   setShowYaml]   = useState(false)

  useEffect(() => {
    setName(template.name)
    setNetwork(template.network || { name: 'appnet', driver: 'bridge', internal: false, external: false, externalName: '' })
    setServiceIds(template.serviceIds || [])
    setSaved(false)
    setError(null)
  }, [template.id])

  function setNetType(type) {
    if (type === 'external') setNetwork(n => ({ ...n, internal: false, external: true }))
    else if (type === 'internal') setNetwork(n => ({ ...n, internal: true, external: false }))
    else setNetwork(n => ({ ...n, internal: false, external: false }))
  }

  const netType = network.external ? 'external' : network.internal ? 'internal' : 'bridge'

  function toggleService(id) {
    setServiceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function save() {
    if (!name.trim()) return
    setError(null)
    try {
      await api.updateTemplate(template.id, { name: name.trim(), network, serviceIds })
      onSaved()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e.message)
    }
  }

  async function del() {
    if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return
    setError(null)
    try {
      await api.deleteTemplate(template.id)
      onDeleted()
    } catch (e) {
      setError(e.message)
    }
  }

  // Partition services: available vs previously-selected-but-now-unavailable
  const availableServices = allServices.filter(s => {
    const imagePresent = localImages.some(li =>
      li === s.image || li.split(':')[0] === s.image.split(':')[0]
    )
    return !s.unavailable && imagePresent
  })
  const selectedButGone = (template.serviceIds || []).filter(sid => {
    const svc = allServices.find(s => s.id === sid)
    if (!svc) return true
    const imagePresent = localImages.some(li =>
      li === svc.image || li.split(':')[0] === svc.image.split(':')[0]
    )
    return svc.unavailable || !imagePresent
  }).map(sid => allServices.find(s => s.id === sid)?.name || sid)

  return (
    <div className="flex-1 overflow-auto p-6">
      {showYaml && <YamlModal templateId={template.id} templateName={template.name} onClose={() => setShowYaml(false)} />}

      <div className="max-w-xl">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="text-lg font-semibold bg-transparent border-b border-gray-600 text-white focus:outline-none focus:border-blue-500 flex-1 mr-4"
          />
          <button onClick={() => setShowYaml(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 font-mono">
            <Code2 size={14} /> &lt;/&gt;
          </button>
        </div>

        {/* Section 1: Network */}
        <section className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Network</h3>
          <div className="mb-3">
            <label className="block text-sm text-gray-300 mb-1 flex items-center gap-1">
              Name
              <span className="relative group">
                <span className="text-gray-500 cursor-help text-xs border border-gray-600 rounded-full w-4 h-4 inline-flex items-center justify-center">i</span>
                <span className="absolute left-6 top-0 w-72 bg-gray-900 text-gray-300 text-xs rounded p-2 border border-gray-700 hidden group-hover:block z-10">
                  All services on the same network can reach each other. For personal use, one network is fine. For production, consider isolating unrelated services into separate networks.
                </span>
              </span>
            </label>
            <input
              value={network.name}
              onChange={e => setNetwork(n => ({ ...n, name: e.target.value }))}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            {[
              { id: 'bridge',   label: 'Local (bridge)',                     desc: 'Creates an isolated network on this machine.' },
              { id: 'internal', label: 'Block external internet (internal)',  desc: 'Prevents services from reaching the internet.' },
              { id: 'external', label: 'Join a shared network (external)',    desc: 'Connects to an existing Docker network.' },
            ].map(opt => (
              <label key={opt.id} className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                netType === opt.id ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 hover:border-gray-600'
              }`}>
                <input type="radio" name="netType" value={opt.id} checked={netType === opt.id}
                  onChange={() => setNetType(opt.id)} className="mt-0.5 accent-blue-500" />
                <div>
                  <p className="text-sm text-white">{opt.label}</p>
                  <p className="text-xs text-gray-400">{opt.desc}</p>
                  {opt.id === 'internal' && netType === 'internal' && (
                    <p className="text-xs text-blue-400 mt-0.5">bridge is also enabled</p>
                  )}
                  {opt.id === 'external' && netType === 'external' && (
                    <input
                      value={network.externalName || ''}
                      onChange={e => setNetwork(n => ({ ...n, externalName: e.target.value }))}
                      placeholder="Existing network name"
                      onClick={e => e.stopPropagation()}
                      className="mt-2 w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  )}
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Section 2: Services */}
        <section className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Services</h3>
          <p className="text-sm text-gray-400 mb-3">Select the services to include in this template:</p>
          {availableServices.length === 0 && (
            <p className="text-gray-500 text-sm">No available services. Add services in the Services tab.</p>
          )}
          <div className="space-y-2">
            {availableServices.map(svc => (
              <label key={svc.id} className="flex items-center gap-3 p-3 rounded border border-gray-700 hover:border-gray-600 cursor-pointer">
                <input type="checkbox" checked={serviceIds.includes(svc.id)}
                  onChange={() => toggleService(svc.id)} className="accent-blue-500" />
                <div>
                  <p className="text-sm text-white">{svc.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{svc.image}</p>
                </div>
              </label>
            ))}
            {selectedButGone.length > 0 && (
              <div className="mt-2 space-y-1">
                {selectedButGone.map((name, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded border border-gray-700 opacity-50">
                    <input type="checkbox" checked disabled className="accent-blue-500" />
                    <p className="text-sm text-gray-400">{name} <span className="text-yellow-500 text-xs">(unavailable)</span></p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex justify-between">
          <button onClick={del}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-900 hover:bg-red-800 rounded text-red-300 text-sm transition-colors">
            <Trash2 size={14} /> Delete Template
          </button>
          <button onClick={save}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-semibold transition-colors">
            {saved ? 'Saved!' : <><Save size={14} /> Save Template</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Service Detail ───────────────────────────────────────────────────────────
function ServiceDetail({ service, onSaved, onDeleted }) {
  const [name,        setName]        = useState(service.name)
  const [image,       setImage]       = useState(service.image)
  const [ports,       setPorts]       = useState(service.ports || [])
  const [volumes,     setVolumes]     = useState(service.volumes || [])
  const [environment, setEnvironment] = useState(service.environment || [])
  const [restart,     setRestart]     = useState(service.restart || 'unless-stopped')
  const [unavailable, setUnavailable] = useState(service.unavailable || false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState(null)

  useEffect(() => {
    setName(service.name);        setImage(service.image)
    setPorts(service.ports || []); setVolumes(service.volumes || [])
    setEnvironment(service.environment || []); setRestart(service.restart || 'unless-stopped')
    setUnavailable(service.unavailable || false)
    setSaved(false); setError(null)
  }, [service.id])

  async function save() {
    if (!name.trim() || !image.trim()) return
    setError(null)
    try {
      await api.updateService(service.id, { name: name.trim(), image: image.trim(), ports, volumes, environment, restart, unavailable })
      onSaved()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(e.message) }
  }

  async function del() {
    const msg = `Remove "${service.name}" from Controller?\n\nThis only removes it from Controller. Your port and volume configuration will be lost.\n\nTo also delete the Docker image, run:\n  docker image rm ${service.image}\nor use Docker Desktop → Images.`
    if (!confirm(msg)) return
    setError(null)
    try {
      await api.deleteService(service.id)
      onDeleted()
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-xl">
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Service name (compose key)</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Image</label>
          <input value={image} onChange={e => setImage(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>

        <ListEditor label="Ports"                values={ports}       onChange={setPorts}       placeholder="e.g. 8080:8080" />
        <ListEditor label="Volumes"              values={volumes}     onChange={setVolumes}     placeholder="e.g. myvolume:/data" />
        <ListEditor label="Environment Variables" values={environment} onChange={setEnvironment} placeholder="e.g. KEY=value" />

        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Restart policy</label>
          <select value={restart} onChange={e => setRestart(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
            {['unless-stopped', 'always', 'on-failure', 'no'].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-3 p-3 rounded border border-gray-700 cursor-pointer hover:border-gray-600 mb-4">
          <input type="checkbox" checked={unavailable} onChange={e => setUnavailable(e.target.checked)} className="mt-0.5 accent-blue-500" />
          <div>
            <p className="text-sm text-white">Unavailable to templates</p>
            <p className="text-xs text-gray-400">Hide this service from template configuration</p>
          </div>
        </label>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex justify-between">
          <button onClick={del}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-900 hover:bg-red-800 rounded text-red-300 text-sm transition-colors">
            <Trash2 size={14} /> Remove from Controller
          </button>
          <button onClick={save}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-semibold transition-colors">
            {saved ? 'Saved!' : <><Save size={14} /> Save Service</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Templates Tab ────────────────────────────────────────────────────────────
function TemplatesTab() {
  const qc = useQueryClient()
  const [selectedId,     setSelectedId]     = useState(null)
  const [showNewDialog,  setShowNewDialog]  = useState(false)

  const { data: templates  = [] } = useQuery({ queryKey: ['templates'],  queryFn: api.getTemplates })
  const { data: allServices = [] } = useQuery({ queryKey: ['services'],  queryFn: api.getServices })
  const { data: status }           = useQuery({ queryKey: ['status'],    queryFn: api.getStatus, refetchInterval: 5000 })

  const localImages   = status?.localImages || []
  const activeId      = selectedId || templates[0]?.id
  const activeTemplate = templates.find(t => t.id === activeId)

  function refresh() {
    qc.invalidateQueries({ queryKey: ['templates'] })
    qc.invalidateQueries({ queryKey: ['services'] })
  }

  function handleCreated(t) {
    qc.invalidateQueries({ queryKey: ['templates'] })
    setSelectedId(t.id)
    setShowNewDialog(false)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {showNewDialog && <NewTemplateDialog onClose={() => setShowNewDialog(false)} onCreated={handleCreated} />}

      {/* Left panel */}
      <aside className="w-56 bg-gray-800 border-r border-gray-700 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-gray-700">
          <button onClick={() => setShowNewDialog(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm transition-colors">
            <Plus size={14} /> New Template
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {templates.length === 0 ? (
            <p className="text-gray-500 text-sm p-4">No templates yet.</p>
          ) : (
            templates.map(t => (
              <button key={t.id} onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-gray-700 transition-colors ${
                  t.id === activeId ? 'bg-blue-900/40 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}>
                {t.name}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Right panel */}
      {activeTemplate ? (
        <TemplateDetail
          key={activeTemplate.id}
          template={activeTemplate}
          allServices={allServices}
          localImages={localImages}
          onSaved={refresh}
          onDeleted={() => { refresh(); setSelectedId(null) }}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          {templates.length === 0 ? 'Create a template to get started.' : 'Select a template.'}
        </div>
      )}
    </div>
  )
}

// ─── Services Tab ─────────────────────────────────────────────────────────────
function ServicesTab() {
  const qc = useQueryClient()
  const [selectedId,    setSelectedId]    = useState(null)
  const [showAddDialog, setShowAddDialog] = useState(false)

  const { data: services = [] } = useQuery({ queryKey: ['services'], queryFn: api.getServices })
  const { data: status }        = useQuery({ queryKey: ['status'],   queryFn: api.getStatus, refetchInterval: 5000 })

  const localImages  = status?.localImages || []
  const activeId     = selectedId || services[0]?.id
  const activeService = services.find(s => s.id === activeId)

  function refresh() { qc.invalidateQueries({ queryKey: ['services'] }) }

  function handleAdded(s) {
    qc.invalidateQueries({ queryKey: ['services'] })
    setSelectedId(s.id)
    setShowAddDialog(false)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {showAddDialog && <AddServiceDialog onClose={() => setShowAddDialog(false)} onAdded={handleAdded} />}

      {/* Left panel */}
      <aside className="w-56 bg-gray-800 border-r border-gray-700 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-gray-700">
          <button onClick={() => setShowAddDialog(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm transition-colors">
            <Plus size={14} /> Add Service
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {services.length === 0 ? (
            <p className="text-gray-500 text-sm p-4">No services yet.</p>
          ) : (
            services.map(s => {
              const imagePresent = localImages.some(li =>
                li === s.image || li.split(':')[0] === s.image.split(':')[0]
              )
              return (
                <button key={s.id} onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-700 transition-colors ${
                    s.id === activeId ? 'bg-blue-900/40' : 'hover:bg-gray-700'
                  }`}>
                  <p className={`text-sm ${s.unavailable ? 'text-gray-500' : 'text-gray-200'}`}>{s.name}</p>
                  <p className="text-xs text-gray-500 font-mono truncate">{s.image}</p>
                  {!imagePresent && <span className="text-xs text-yellow-500">image not found</span>}
                  {s.unavailable && <span className="text-xs text-gray-500">unavailable</span>}
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Right panel */}
      {activeService ? (
        <ServiceDetail
          key={activeService.id}
          service={activeService}
          onSaved={refresh}
          onDeleted={() => { refresh(); setSelectedId(null) }}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          {services.length === 0 ? 'Add a service to get started.' : 'Select a service.'}
        </div>
      )}
    </div>
  )
}

// ─── Main Settings Component ──────────────────────────────────────────────────
export default function Settings({ onBack, defaultTab = 'templates' }) {
  const [tab, setTab] = useState(defaultTab)

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-4 px-6 py-4 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <button onClick={onBack} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-white">Settings</h1>
        <div className="flex gap-1 ml-4">
          {['templates', 'services'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded text-sm capitalize transition-colors ${
                tab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* App Settings: Publish Dir inline in header */}
        <PublishDirInline />
      </header>

      {tab === 'templates' && <TemplatesTab />}
      {tab === 'services'  && <ServicesTab />}
    </div>
  )
}

// ─── Publish Dir (inline in header) ──────────────────────────────────────────
function PublishDirInline() {
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const [publishDir, setPublishDir] = useState('')
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState(null)

  useEffect(() => { if (settings) setPublishDir(settings.publishDir || '') }, [settings])

  async function save() {
    setError(null)
    try {
      await api.saveSettings({ publishDir })
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      <label className="text-xs text-gray-400 whitespace-nowrap">Publish Dir</label>
      <input
        value={publishDir}
        onChange={e => setPublishDir(e.target.value)}
        placeholder="e.g. C:\docker\active"
        className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
      />
      <button onClick={save} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs">
        {saved ? 'Saved!' : <Save size={14} />}
      </button>
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </div>
  )
}
```

### Step 3: Verify build

```bash
cd frontend && npm run build
```

Expected: succeeds with no errors. Fix any import/lint issues before committing.

### Step 4: Commit

```bash
git add frontend/src/pages/Settings.jsx
git commit -m "feat: v2 Settings — two-panel Templates tab, Services tab, YAML modal, network form"
```

---

## Task 10: Integration smoke test

**Files:** No changes — verification only.

### Step 1: Run full backend test suite

```bash
cd backend && venv/Scripts/pytest -v
```

Expected: 57 tests PASS (12 + 17 + 10 + 18).

### Step 2: Run Vite production build

```bash
cd frontend && npm run build
```

Expected: succeeds.

### Step 3: Start both servers (optional — verify no crash on startup)

```bash
cd C:/inetpub/websites/Controller && npm start
```

Wait 5 seconds, verify both servers start, then stop with Ctrl+C.

### Step 4: Commit final smoke test note

If any fixes were made during testing, commit them with descriptive message. If all clean:

```bash
git tag v2.0.0-dev
```

---

## Summary

| Task | Files Changed | Tests Added |
|---|---|---|
| 1 | data_store.py, test_data_store.py | +5 (12 total) |
| 2 | docker_ops.py, test_docker_ops.py | +4 (17 total) |
| 3 | yaml_generator.py, test_yaml_generator.py | +10 (new) |
| 4 | main.py, test_api.py | +10 (18 total) |
| 5 | api.js | — (build) |
| 6 | App.jsx | — (build) |
| 7 | Dashboard.jsx, ServiceCard.jsx, parseCompose.js (deleted) | — (build) |
| 8 | Onboarding.jsx | — (build) |
| 9 | Settings.jsx | — (build) |
| 10 | — | smoke test |

**Total backend tests:** 57
