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


def test_generate_skips_windows_drive_letter_volumes():
    """Windows-style paths like C:\\data:/container should not become named volumes."""
    svc = _service(volumes=["C:\\data:/container", "C:/other:/path"])
    t = _template()
    parsed = yaml.safe_load(yaml_generator.generate_compose(t, [svc]))
    assert not parsed.get("volumes")
