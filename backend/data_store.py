import json
import os
import uuid
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
