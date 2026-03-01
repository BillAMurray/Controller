# Controller Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web dashboard to manage Docker Compose templates — deploy, stop, pull updates, and edit service sets from a dark-themed UI.

**Architecture:** FastAPI backend executes Docker CLI commands via subprocess and serves JSON to a React/Vite/Tailwind frontend. Templates stored as YAML files on disk with a JSON metadata sidecar. Frontend polls `/api/status` every 5 seconds for live container state and system stats.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, psutil, pyyaml, aiofiles, python-multipart; React 18, Vite, Tailwind CSS, Lucide React, TanStack React Query

---

### Task 1: Initialize project structure and tooling

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `backend/requirements.txt`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`

**Step 1: Initialize git**

```bash
cd C:\inetpub\websites\Controller
git init
```

**Step 2: Create root `package.json`**

```json
{
  "name": "controller",
  "private": true,
  "scripts": {
    "start": "concurrently --kill-others-on-fail --names \"api,ui\" --prefix-colors \"blue,green\" \"npm run start:api\" \"npm run start:ui\"",
    "start:api": "cd backend && venv\\Scripts\\uvicorn main:app --reload --port 8025",
    "start:ui": "cd frontend && npm run dev"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

**Step 3: Create `.gitignore`**

```
node_modules/
backend/venv/
data/
__pycache__/
*.pyc
.env
dist/
```

**Step 4: Create `backend/requirements.txt`**

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
python-multipart==0.0.6
aiofiles==23.2.1
psutil==5.9.8
pyyaml==6.0.1
pytest==7.4.4
pytest-asyncio==0.23.3
httpx==0.26.0
```

**Step 5: Create `frontend/package.json`**

```json
{
  "name": "controller-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5175",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tanstack/react-query": "^5.17.19",
    "lucide-react": "^0.303.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.11",
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.33",
    "autoprefixer": "^10.4.16"
  }
}
```

**Step 6: Create `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': 'http://localhost:8025'
    }
  }
})
```

**Step 7: Create `frontend/tailwind.config.js`**

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: []
}
```

**Step 8: Create `frontend/postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
}
```

**Step 9: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Controller</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

**Step 10: Install dependencies and create backend venv**

```bash
cd frontend && npm install
cd ..\backend && python -m venv venv && venv\Scripts\pip install -r requirements.txt
cd .. && npm install
```

**Step 11: Commit**

```bash
git add .
git commit -m "feat: scaffold project structure"
```

---

### Task 2: Backend data_store.py

**Files:**
- Create: `backend/data_store.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_data_store.py`

**Step 1: Write the failing tests**

```python
# backend/tests/test_data_store.py
import pytest

@pytest.fixture(autouse=True)
def tmp_data(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    import data_store
    data_store.DATA_DIR = tmp_path
    data_store.TEMPLATES_FILE = tmp_path / "templates.json"
    data_store.SETTINGS_FILE = tmp_path / "settings.json"
    data_store.TEMPLATES_DIR = tmp_path / "templates"

def test_load_templates_empty():
    import data_store
    assert data_store.load_templates() == []

def test_create_and_get_template():
    import data_store
    t = data_store.create_template("My Template")
    assert t["name"] == "My Template"
    assert data_store.get_template(t["id"]) == t

def test_update_template():
    import data_store
    t = data_store.create_template("Old Name")
    updated = data_store.update_template(t["id"], name="New Name")
    assert updated["name"] == "New Name"

def test_delete_template():
    import data_store
    t = data_store.create_template("To Delete")
    assert data_store.delete_template(t["id"]) is True
    assert data_store.get_template(t["id"]) is None
    assert data_store.delete_template(t["id"]) is False

def test_write_and_read_compose():
    import data_store
    t = data_store.create_template("T")
    data_store.write_compose(t["id"], "services:\n  web:\n    image: nginx\n")
    assert "nginx" in data_store.read_compose(t["id"])

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

**Step 2: Run tests to verify they fail**

```bash
cd backend && venv\Scripts\pytest tests/test_data_store.py -v
```
Expected: `ModuleNotFoundError: No module named 'data_store'`

**Step 3: Create `backend/tests/__init__.py`** (empty file)

**Step 4: Create `backend/data_store.py`**

```python
import json
import os
import uuid
import shutil
from datetime import date
from pathlib import Path

DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).parent.parent / "data"))
TEMPLATES_FILE = DATA_DIR / "templates.json"
SETTINGS_FILE = DATA_DIR / "settings.json"
TEMPLATES_DIR = DATA_DIR / "templates"


def _ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)


def load_templates() -> list[dict]:
    _ensure_dirs()
    if not TEMPLATES_FILE.exists():
        return []
    return json.loads(TEMPLATES_FILE.read_text())


def save_templates(templates: list[dict]):
    _ensure_dirs()
    TEMPLATES_FILE.write_text(json.dumps(templates, indent=2))


def get_template(template_id: str) -> dict | None:
    return next((t for t in load_templates() if t["id"] == template_id), None)


def create_template(name: str) -> dict:
    template = {
        "id": str(uuid.uuid4()),
        "name": name,
        "createdAt": date.today().isoformat(),
        "lastPulled": None,
    }
    templates = load_templates()
    templates.append(template)
    save_templates(templates)
    (TEMPLATES_DIR / template["id"]).mkdir(parents=True, exist_ok=True)
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
    template_dir = TEMPLATES_DIR / template_id
    if template_dir.exists():
        shutil.rmtree(template_dir)
    return True


def get_compose_path(template_id: str) -> Path:
    return TEMPLATES_DIR / template_id / "docker-compose.yml"


def read_compose(template_id: str) -> str | None:
    path = get_compose_path(template_id)
    return path.read_text() if path.exists() else None


def write_compose(template_id: str, content: str):
    path = get_compose_path(template_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def load_settings() -> dict:
    _ensure_dirs()
    if not SETTINGS_FILE.exists():
        return {"publishDir": "", "activeTemplateId": None, "lastPulledAll": None}
    return json.loads(SETTINGS_FILE.read_text())


def save_settings(settings: dict):
    _ensure_dirs()
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2))
```

**Step 5: Run tests to verify they pass**

```bash
cd backend && venv\Scripts\pytest tests/test_data_store.py -v
```
Expected: 7 tests PASS

**Step 6: Commit**

```bash
git add backend/data_store.py backend/tests/
git commit -m "feat: add data_store with JSON file persistence"
```

---

### Task 3: Backend docker_ops.py

**Files:**
- Create: `backend/docker_ops.py`
- Create: `backend/tests/test_docker_ops.py`

**Step 1: Write the failing tests**

```python
# backend/tests/test_docker_ops.py
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
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && venv\Scripts\pytest tests/test_docker_ops.py -v
```
Expected: `ModuleNotFoundError: No module named 'docker_ops'`

**Step 3: Create `backend/docker_ops.py`**

```python
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
```

**Step 4: Run tests to verify they pass**

```bash
cd backend && venv\Scripts\pytest tests/test_docker_ops.py -v
```
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add backend/docker_ops.py backend/tests/test_docker_ops.py
git commit -m "feat: add docker_ops subprocess wrappers"
```

---

### Task 4: Backend main.py (all FastAPI routes)

**Files:**
- Create: `backend/main.py`
- Create: `backend/tests/test_api.py`

**Step 1: Write the failing tests**

```python
# backend/tests/test_api.py
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
```

**Step 2: Run tests to verify they fail**

```bash
cd backend && venv\Scripts\pytest tests/test_api.py -v
```
Expected: `ModuleNotFoundError: No module named 'main'`

**Step 3: Create `backend/main.py`**

```python
from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

import data_store
import docker_ops

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5175", "http://127.0.0.1:5175"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Status ────────────────────────────────────────────────────────────────────

@app.get("/api/status")
def get_status():
    containers = docker_ops.list_containers()
    stats = docker_ops.system_stats()
    return {**stats, "runningCount": len(containers), "containers": containers}


# ── Templates ─────────────────────────────────────────────────────────────────

@app.get("/api/templates")
def list_templates():
    return data_store.load_templates()


@app.post("/api/templates")
async def upload_template(name: str = "My Template", file: UploadFile = File(...)):
    content = (await file.read()).decode("utf-8")
    template = data_store.create_template(name)
    data_store.write_compose(template["id"], content)
    return template


@app.put("/api/templates/{template_id}")
def rename_template(template_id: str, body: dict):
    t = data_store.update_template(template_id, name=body.get("name", ""))
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
    content = data_store.read_compose(template_id)
    if content is None:
        raise HTTPException(404, "Compose file not found")
    return {"content": content}


@app.put("/api/templates/{template_id}/compose")
def save_compose(template_id: str, body: dict):
    if not data_store.get_template(template_id):
        raise HTTPException(404, "Template not found")
    data_store.write_compose(template_id, body.get("content", ""))
    return {"ok": True}


# ── Deploy / Stop ─────────────────────────────────────────────────────────────

@app.post("/api/templates/{template_id}/deploy")
def deploy_template(template_id: str):
    template = data_store.get_template(template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    compose_content = data_store.read_compose(template_id)
    if not compose_content:
        raise HTTPException(400, "No compose file for this template")
    settings = data_store.load_settings()
    publish_dir = settings.get("publishDir", "")
    if not publish_dir or not Path(publish_dir).exists():
        raise HTTPException(400, "Publish directory not configured or does not exist")
    dest = Path(publish_dir) / "docker-compose.yml"
    dest.write_text(compose_content)
    ok, msg = docker_ops.compose_up(str(dest))
    if not ok:
        raise HTTPException(500, f"docker compose up failed: {msg}")
    settings["activeTemplateId"] = template_id
    data_store.save_settings(settings)
    return {"ok": True}


@app.post("/api/templates/{template_id}/stop")
def stop_template(template_id: str):
    settings = data_store.load_settings()
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


# ── Pull ──────────────────────────────────────────────────────────────────────

@app.post("/api/templates/{template_id}/pull")
def pull_template(template_id: str):
    compose_path = data_store.get_compose_path(template_id)
    if not compose_path.exists():
        raise HTTPException(404, "No compose file for this template")
    ok, msg = docker_ops.compose_pull(str(compose_path))
    if not ok:
        raise HTTPException(500, f"docker compose pull failed: {msg}")
    data_store.update_template(template_id, lastPulled=date.today().isoformat())
    return {"ok": True}


@app.post("/api/pull-all")
def pull_all():
    templates = data_store.load_templates()
    errors = []
    for t in templates:
        compose_path = data_store.get_compose_path(t["id"])
        if compose_path.exists():
            ok, msg = docker_ops.compose_pull(str(compose_path))
            if ok:
                data_store.update_template(t["id"], lastPulled=date.today().isoformat())
            else:
                errors.append({"template": t["name"], "error": msg})
    settings = data_store.load_settings()
    settings["lastPulledAll"] = date.today().isoformat()
    data_store.save_settings(settings)
    return {"ok": True, "errors": errors}


# ── Containers ────────────────────────────────────────────────────────────────

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


# ── Settings ──────────────────────────────────────────────────────────────────

@app.get("/api/settings")
def get_settings():
    return data_store.load_settings()


@app.put("/api/settings")
def update_settings(body: dict):
    settings = data_store.load_settings()
    settings.update(body)
    data_store.save_settings(settings)
    return settings
```

**Step 4: Run tests to verify they pass**

```bash
cd backend && venv\Scripts\pytest tests/test_api.py -v
```
Expected: 8 tests PASS

**Step 5: Smoke-test the server**

```bash
cd backend && venv\Scripts\uvicorn main:app --port 8025 --reload
```
Open http://localhost:8025/docs — Swagger UI should appear with all routes listed.

**Step 6: Run full backend test suite**

```bash
cd backend && venv\Scripts\pytest -v
```
Expected: 20 tests PASS

**Step 7: Commit**

```bash
git add backend/main.py backend/tests/test_api.py
git commit -m "feat: add all FastAPI routes for templates, deploy, pull, settings"
```

---

### Task 5: Frontend scaffold — main.jsx, App.jsx, api.js, index.css

**Files:**
- Create: `frontend/src/index.css`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/api.js`
- Create: `frontend/src/App.jsx`

**Step 1: Create `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 2: Create `frontend/src/main.jsx`**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 4000 } }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
)
```

**Step 3: Create `frontend/src/api.js`**

```js
const BASE = '/api'

async function request(method, path, body, isFile = false) {
  const opts = { method, headers: {} }
  if (body && !isFile) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  } else if (isFile) {
    opts.body = body // FormData — browser sets Content-Type with boundary automatically
  }
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  getStatus:           ()           => request('GET',    '/status'),
  getTemplates:        ()           => request('GET',    '/templates'),
  uploadTemplate:      (name, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return request('POST', `/templates?name=${encodeURIComponent(name)}`, fd, true)
  },
  createEmptyTemplate: (name = 'My Template') => {
    const fd = new FormData()
    fd.append('file', new Blob(['services:\n'], { type: 'text/yaml' }), 'docker-compose.yml')
    return request('POST', `/templates?name=${encodeURIComponent(name)}`, fd, true)
  },
  renameTemplate:      (id, name)   => request('PUT',    `/templates/${id}`, { name }),
  deleteTemplate:      (id)         => request('DELETE', `/templates/${id}`),
  getCompose:          (id)         => request('GET',    `/templates/${id}/compose`),
  saveCompose:         (id, content)=> request('PUT',    `/templates/${id}/compose`, { content }),
  deployTemplate:      (id)         => request('POST',   `/templates/${id}/deploy`),
  stopTemplate:        (id)         => request('POST',   `/templates/${id}/stop`),
  pullTemplate:        (id)         => request('POST',   `/templates/${id}/pull`),
  pullAll:             ()           => request('POST',   '/pull-all'),
  startContainer:      (name)       => request('POST',   `/containers/${encodeURIComponent(name)}/start`),
  stopContainer:       (name)       => request('POST',   `/containers/${encodeURIComponent(name)}/stop`),
  getSettings:         ()           => request('GET',    '/settings'),
  saveSettings:        (body)       => request('PUT',    '/settings', body),
}
```

**Step 4: Create `frontend/src/App.jsx`**

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, Settings as SettingsIcon } from 'lucide-react'
import { api } from './api'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: api.getTemplates,
  })

  if (isLoading) return <div className="min-h-screen bg-gray-900" />

  if (!templates || templates.length === 0) {
    return <Onboarding />
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <aside className="w-16 bg-gray-800 flex flex-col items-center py-4 gap-2 border-r border-gray-700">
        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm mb-4">
          C
        </div>
        <button
          title="Dashboard"
          onClick={() => setPage('dashboard')}
          className={`p-2.5 rounded-lg transition-colors ${page === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
        >
          <LayoutDashboard size={20} />
        </button>
        <div className="flex-1" />
        <button
          title="Settings"
          onClick={() => setPage('settings')}
          className={`p-2.5 rounded-lg transition-colors ${page === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
        >
          <SettingsIcon size={20} />
        </button>
      </aside>
      <main className="flex-1 overflow-hidden">
        {page === 'dashboard' && <Dashboard onSettings={() => setPage('settings')} />}
        {page === 'settings' && <Settings onBack={() => setPage('dashboard')} />}
      </main>
    </div>
  )
}
```

**Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: scaffold frontend with api.js, App routing shell, and CSS"
```

---

### Task 6: Onboarding page

**Files:**
- Create: `frontend/src/pages/Onboarding.jsx`

**Step 1: Create `frontend/src/pages/Onboarding.jsx`**

```jsx
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { api } from '../api'

export default function Onboarding() {
  const qc = useQueryClient()
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)

  async function handleFile(file) {
    setError(null)
    try {
      await api.uploadTemplate('My Template', file)
      qc.invalidateQueries({ queryKey: ['templates'] })
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleGetStarted() {
    setError(null)
    try {
      await api.createEmptyTemplate('My Template')
      qc.invalidateQueries({ queryKey: ['templates'] })
    } catch (e) {
      setError(e.message)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-6 text-white">
      <div
        className={`border-2 border-dashed rounded-lg p-12 w-96 text-center cursor-pointer transition-colors ${
          dragging ? 'border-blue-400 bg-blue-900/20' : 'border-gray-500 hover:border-gray-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
      >
        <h2 className="text-xl font-bold mb-4">Import docker-compose.yaml</h2>
        <Upload className="mx-auto mb-3 text-gray-400" size={48} />
        <p className="text-xs text-gray-400 uppercase tracking-widest">Drag and drop or click to upload</p>
        <input
          ref={inputRef}
          type="file"
          accept=".yml,.yaml"
          className="hidden"
          onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]) }}
        />
      </div>
      <p className="text-gray-400">
        or, skip and click here to{' '}
        <button
          onClick={handleGetStarted}
          className="ml-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white"
        >
          Get Started
        </button>
      </p>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <p className="text-xs text-gray-500 absolute bottom-6">
        <strong>Developer Note</strong>: Uploading the .yaml file will pre-populate the repository with any existing volumes and services.
      </p>
    </div>
  )
}
```

**Step 2: Verify visually**

Start both servers and open http://localhost:5175. The onboarding screen should appear (because `data/` does not exist yet).

```bash
cd C:\inetpub\websites\Controller && npm start
```

**Step 3: Commit**

```bash
git add frontend/src/pages/Onboarding.jsx
git commit -m "feat: add onboarding screen with YAML upload and get-started flow"
```

---

### Task 7: StatsBar component

**Files:**
- Create: `frontend/src/components/StatsBar.jsx`

**Step 1: Create `frontend/src/components/StatsBar.jsx`**

```jsx
export default function StatsBar({ status }) {
  if (!status) return null

  const stats = [
    { label: 'CPU',    value: `${status.cpu}%`,    color: status.cpu    > 80 ? 'text-red-400' : 'text-green-400' },
    { label: 'Memory', value: `${status.memory}%`, color: status.memory > 80 ? 'text-red-400' : 'text-yellow-400' },
    { label: 'Disk',   value: `${status.disk}%`,   color: status.disk   > 90 ? 'text-red-400' : 'text-gray-300' },
  ]

  return (
    <div className="flex items-center gap-6 text-sm">
      {stats.map(s => (
        <span key={s.label} className="flex items-center gap-1">
          <span className="text-gray-400">{s.label}:</span>
          <span className={`font-semibold ${s.color}`}>{s.value}</span>
        </span>
      ))}
      <span className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-gray-700 rounded-full">
        <span className="text-gray-400">Running:</span>
        <span className="font-bold text-white">{status.runningCount}</span>
      </span>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/StatsBar.jsx
git commit -m "feat: add StatsBar component"
```

---

### Task 8: ServiceCard component

**Files:**
- Create: `frontend/src/components/ServiceCard.jsx`

**Step 1: Create `frontend/src/components/ServiceCard.jsx`**

```jsx
import { useState } from 'react'
import { Database, Globe, Server, Box, HardDrive, Cpu, Network } from 'lucide-react'

const iconMap = {
  postgres: Database, mysql: Database, redis: Database, mongo: Database,
  nginx: Globe, caddy: Globe, traefik: Globe,
  ollama: Cpu, agent: Box, webui: Globe, litellm: Network,
}

function getIcon(image = '') {
  const lower = image.toLowerCase()
  for (const [key, Icon] of Object.entries(iconMap)) {
    if (lower.includes(key)) return Icon
  }
  return Server
}

export default function ServiceCard({ service, runningContainers, onToggle }) {
  const Icon = getIcon(service.image)
  const isRunning = runningContainers.some(
    c => c.name === service.containerName || c.name === `/${service.containerName}`
  )
  const [toggling, setToggling] = useState(false)

  async function handleToggle() {
    setToggling(true)
    try { await onToggle(service.containerName, isRunning) }
    finally { setToggling(false) }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
          <Icon size={22} className="text-blue-400" />
        </div>
        <span className="font-semibold text-white truncate">{service.name}</span>
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
            isRunning ? 'bg-green-500' : 'bg-gray-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            isRunning ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
        {!isRunning && <span className="text-xs text-gray-500 uppercase tracking-wider">OFF</span>}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ServiceCard.jsx
git commit -m "feat: add ServiceCard with running-state toggle"
```

---

### Task 9: WarningModal and DeployButton components

**Files:**
- Create: `frontend/src/components/WarningModal.jsx`
- Create: `frontend/src/components/DeployButton.jsx`

**Step 1: Create `frontend/src/components/WarningModal.jsx`**

```jsx
export default function WarningModal({ containers, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2">Containers are running</h3>
        <p className="text-gray-400 text-sm mb-4">
          {containers.length} container{containers.length !== 1 ? 's are' : ' is'} currently running.
          Deploying will stop them all.
        </p>
        <details className="mb-4 cursor-pointer">
          <summary className="text-sm text-gray-400 hover:text-white select-none">Show containers</summary>
          <ul className="mt-2 text-sm text-gray-300 space-y-1 pl-2 font-mono">
            {containers.map(c => <li key={c.id}>{c.name}</li>)}
          </ul>
        </details>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-semibold"
          >
            Stop All & Deploy
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Create `frontend/src/components/DeployButton.jsx`**

```jsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import WarningModal from './WarningModal'

export default function DeployButton({ templateId, activeTemplateId, runningContainers, disabled }) {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const nothingRunning = runningContainers.length === 0
  const thisIsActive   = activeTemplateId === templateId
  const otherIsActive  = !thisIsActive && runningContainers.length > 0

  const label    = nothingRunning ? 'Deploy' : thisIsActive ? 'Redeploy' : 'Switch & Deploy'
  const btnColor = otherIsActive
    ? 'bg-orange-600 hover:bg-orange-500'
    : 'bg-blue-600 hover:bg-blue-500'

  async function executeDeploy() {
    setLoading(true)
    setError(null)
    try {
      await api.deployTemplate(templateId)
      qc.invalidateQueries({ queryKey: ['status'] })
      qc.invalidateQueries({ queryKey: ['templates'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleClick() {
    if (otherIsActive) { setShowModal(true); return }
    executeDeploy()
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <button
          onClick={handleClick}
          disabled={disabled || loading || !templateId}
          className={`px-4 py-1.5 rounded text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${btnColor}`}
        >
          {loading ? 'Working…' : label}
        </button>
        {error && <span className="text-red-400 text-xs max-w-xs truncate">{error}</span>}
      </div>
      {showModal && (
        <WarningModal
          containers={runningContainers}
          onConfirm={() => { setShowModal(false); executeDeploy() }}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  )
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/WarningModal.jsx frontend/src/components/DeployButton.jsx
git commit -m "feat: add DeployButton with contextual label and WarningModal"
```

---

### Task 10: PullButton component

**Files:**
- Create: `frontend/src/components/PullButton.jsx`

**Step 1: Create `frontend/src/components/PullButton.jsx`**

```jsx
import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { api } from '../api'

function fmtDate(d) {
  if (!d) return 'Never'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function PullButton({ templateId, lastPulled, lastPulledAll }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(null) // 'template' | 'all' | null
  const [toast, setToast] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function pull(type) {
    setOpen(false)
    setLoading(type)
    try {
      if (type === 'template') await api.pullTemplate(templateId)
      else await api.pullAll()
      qc.invalidateQueries({ queryKey: ['templates'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
      showToast(type === 'template' ? 'Pull complete' : 'All templates pulled')
    } catch (e) {
      showToast(`Pull failed: ${e.message}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={!!loading}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white disabled:opacity-40 transition-colors"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        Pull
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20">
          <button
            onClick={() => pull('template')}
            className="w-full text-left px-4 py-3 hover:bg-gray-700 rounded-t-lg text-sm"
          >
            <div className="font-medium text-white">Pull this template</div>
            <div className="text-xs text-gray-400 mt-0.5">Last: {fmtDate(lastPulled)}</div>
          </button>
          <hr className="border-gray-700" />
          <button
            onClick={() => pull('all')}
            className="w-full text-left px-4 py-3 hover:bg-gray-700 rounded-b-lg text-sm"
          >
            <div className="font-medium text-white">Pull all</div>
            <div className="text-xs text-gray-400 mt-0.5">Last: {fmtDate(lastPulledAll)}</div>
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-800 border border-gray-700 text-white text-sm px-4 py-2 rounded shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/PullButton.jsx
git commit -m "feat: add PullButton split-dropdown with last-pulled dates"
```

---

### Task 11: YAML parser utility + Dashboard page

**Files:**
- Create: `frontend/src/utils/parseCompose.js`
- Create: `frontend/src/pages/Dashboard.jsx`

**Step 1: Create `frontend/src/utils/parseCompose.js`**

Parses the `services` section of a compose YAML string without a library. Extracts service name, image, and container_name.

```js
export function parseServices(yamlText) {
  if (!yamlText) return []
  const services = []
  const lines = yamlText.split('\n')
  let inServices = false
  let current = null

  for (const line of lines) {
    if (/^services\s*:/.test(line)) { inServices = true; continue }
    if (inServices && /^  (\w[\w-]*):\s*$/.test(line)) {
      const name = line.trim().replace(':', '')
      current = { name, image: '', containerName: name }
      services.push(current)
    }
    if (current) {
      const img = line.match(/^\s+image:\s*(.+)/)
      if (img) current.image = img[1].trim()
      const cn = line.match(/^\s+container_name:\s*(.+)/)
      if (cn) current.containerName = cn[1].trim()
    }
  }
  return services
}
```

**Step 2: Create `frontend/src/pages/Dashboard.jsx`**

```jsx
import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import { api } from '../api'
import { parseServices } from '../utils/parseCompose'
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

  const activeId       = selectedId || templates[0]?.id
  const activeTemplate = templates.find(t => t.id === activeId)

  const { data: composeData } = useQuery({
    queryKey: ['compose', activeId],
    queryFn:  () => api.getCompose(activeId),
    enabled:  !!activeId,
  })

  const services          = parseServices(composeData?.content)
  const runningContainers = status?.containers || []

  const stopMutation = useMutation({
    mutationFn: () => api.stopTemplate(activeId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['status'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  async function handleToggleContainer(containerName, isRunning) {
    if (isRunning) await api.stopContainer(containerName)
    else           await api.startContainer(containerName)
    qc.invalidateQueries({ queryKey: ['status'] })
  }

  const canStop = !!settings?.activeTemplateId

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">C</div>
          <h1 className="text-xl font-bold text-white">Controller</h1>
        </div>
        <StatsBar status={status} />
        <button onClick={onSettings} className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
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
        {services.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
            <p>No services defined.</p>
            <p className="text-sm">Open Settings to edit the YAML for this template.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map(s => (
              <ServiceCard
                key={s.name}
                service={s}
                runningContainers={runningContainers}
                onToggle={handleToggleContainer}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Verify visually**

Start both servers and upload `_ref/docker-compose.yml` on the onboarding screen. Dashboard should show 6 service cards (ollama, open-webui, postgres, litellm, omni-tools, agent-zero), the stats bar, and the action bar.

**Step 4: Commit**

```bash
git add frontend/src/utils/parseCompose.js frontend/src/pages/Dashboard.jsx
git commit -m "feat: add Dashboard page with service grid and action bar"
```

---

### Task 12: Settings page

**Files:**
- Create: `frontend/src/pages/Settings.jsx`

**Step 1: Create `frontend/src/pages/Settings.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2, Save } from 'lucide-react'
import { api } from '../api'

export default function Settings({ onBack }) {
  const qc = useQueryClient()
  const { data: settings }    = useQuery({ queryKey: ['settings'],  queryFn: api.getSettings })
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: api.getTemplates })

  const [publishDir,    setPublishDir]    = useState('')
  const [selectedId,    setSelectedId]    = useState(null)
  const [templateName,  setTemplateName]  = useState('')
  const [yamlContent,   setYamlContent]   = useState('')
  const [saved,         setSaved]         = useState(false)

  useEffect(() => { if (settings) setPublishDir(settings.publishDir || '') }, [settings])

  const activeTemplate = templates.find(t => t.id === selectedId) || templates[0]

  useEffect(() => {
    if (!activeTemplate) return
    setSelectedId(activeTemplate.id)
    setTemplateName(activeTemplate.name)
    api.getCompose(activeTemplate.id).then(d => setYamlContent(d?.content || ''))
  }, [activeTemplate?.id])

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  async function saveAppSettings() {
    await api.saveSettings({ publishDir })
    qc.invalidateQueries({ queryKey: ['settings'] })
    flash()
  }

  async function saveTemplate() {
    if (!selectedId) return
    await api.renameTemplate(selectedId, templateName)
    await api.saveCompose(selectedId, yamlContent)
    qc.invalidateQueries({ queryKey: ['templates'] })
    qc.invalidateQueries({ queryKey: ['compose', selectedId] })
    flash()
  }

  async function deleteTemplate() {
    if (!selectedId) return
    if (!confirm(`Delete "${templateName}"? This cannot be undone.`)) return
    await api.deleteTemplate(selectedId)
    qc.invalidateQueries({ queryKey: ['templates'] })
    setSelectedId(null)
    onBack()
  }

  function handleTemplateChange(id) {
    setSelectedId(id)
    const t = templates.find(t => t.id === id)
    if (t) {
      setTemplateName(t.name)
      api.getCompose(id).then(d => setYamlContent(d?.content || ''))
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-4 px-6 py-4 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <button onClick={onBack} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-white">Settings</h1>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-8">

          {/* App Settings */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">App Settings</h2>
            <label className="block text-sm text-gray-300 mb-1">Publish Directory</label>
            <div className="flex gap-2">
              <input
                value={publishDir}
                onChange={e => setPublishDir(e.target.value)}
                placeholder="e.g. C:\docker\active"
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={saveAppSettings}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white"
              >
                <Save size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              docker compose commands run from this directory. The directory must already exist.
            </p>
          </section>

          {/* Template Settings */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Template Settings</h2>

            <select
              value={selectedId || ''}
              onChange={e => handleTemplateChange(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none mb-4 w-full"
            >
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <label className="block text-sm text-gray-300 mb-1">Template Name</label>
            <input
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <label className="block text-sm text-gray-300 mb-1">docker-compose.yml</label>
            <textarea
              value={yamlContent}
              onChange={e => setYamlContent(e.target.value)}
              rows={20}
              spellCheck={false}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-green-400 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />

            <div className="flex justify-between mt-3">
              <button
                onClick={deleteTemplate}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-900 hover:bg-red-800 rounded text-red-300 text-sm transition-colors"
              >
                <Trash2 size={14} /> Delete Template
              </button>
              <button
                onClick={saveTemplate}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-semibold transition-colors"
              >
                {saved ? 'Saved!' : <><Save size={14} /> Save Template</>}
              </button>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Settings.jsx
git commit -m "feat: add Settings page with publish dir, rename, YAML editor, and delete"
```

---

### Task 13: Final integration smoke test

**Step 1: Run full backend test suite**

```bash
cd backend && venv\Scripts\pytest -v
```
Expected: 20 tests PASS

**Step 2: Start both servers**

```bash
cd C:\inetpub\websites\Controller && npm start
```

**Step 3: Walk through the full user flow**

1. Open http://localhost:5175 → Onboarding screen appears
2. Upload `_ref/docker-compose.yml` → Redirects to Dashboard, 6 service cards visible
3. Stats bar shows CPU / Memory / Disk percentages and "Running: N"
4. Click **Settings** → Configure publish directory (e.g. `C:\docker\active`, must exist)
5. Click **Save** (disk icon) → success flash
6. Go back to Dashboard → Click **Deploy** → docker compose runs in publish dir
7. After deploy, button changes to **Redeploy**; running containers toggle green
8. Click **Pull** dropdown → "Pull this template" → spinner → toast "Pull complete"
9. Check last-pulled date updated in Pull dropdown
10. Settings → rename template to "My AI Stack" → Save Template → Dashboard dropdown updates
11. Settings → edit YAML (add a comment) → Save → Dashboard cards reflect changes
12. Click **Stop** → docker compose down → button reverts to **Deploy**

**Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete Controller v1 — template management dashboard"
```

---

## Post-implementation notes

- **Docker Compose v2** is assumed (`docker compose`, not `docker-compose`). If the host uses v1, change `["docker", "compose", ...]` to `["docker-compose", ...]` in `docker_ops.py`.
- **External volumes** (ollama, open-webui, etc.) must already exist on the Docker host before deploying — the app does not create them.
- **Publish directory** must exist before deploying. The backend validates this and returns a 400 if missing.
- The YAML editor has no syntax validation — invalid YAML will fail at deploy time with an error message from Docker.
- To add a new template later: Settings → upload a new YAML or copy-paste into the YAML editor and save with a new name.
