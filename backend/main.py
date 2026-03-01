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
