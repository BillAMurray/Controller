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
