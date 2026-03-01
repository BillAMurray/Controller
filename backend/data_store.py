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
