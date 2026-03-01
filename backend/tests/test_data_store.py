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
    assert not (data_store.TEMPLATES_DIR / t["id"]).exists()
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
