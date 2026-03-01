import yaml


def generate_compose(template: dict, services: list[dict]) -> str:
    """Generate a docker-compose.yml string from a template and its resolved services."""
    network      = template.get("network", {})
    network_name = (network.get("name") or "appnet").strip() or "appnet"

    # Collect unique named volumes (skip bind mounts: paths starting with . or /,
    # or Windows drive letters like C:\ or C:/)
    all_volumes: dict = {}
    for svc in services:
        for vol in svc.get("volumes", []):
            parts = str(vol).split(":")
            host = parts[0]
            is_bind = (
                host.startswith(".")
                or host.startswith("/")
                or (len(host) == 1 and host.isalpha())  # Windows drive letter, e.g. C
            )
            if host and not is_bind:
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
