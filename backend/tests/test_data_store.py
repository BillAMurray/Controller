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
