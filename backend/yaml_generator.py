import yaml


def generate_compose(template: dict, services: list[dict]) -> str:
    """Generate a docker-compose.yml string from a template and its resolved services."""
    network      = template.get("network", {})
    network_name = (network.get("name") or "appnet").strip() or "appnet"

    # Collect volume aliases from all services: composeKey -> dockerVolumeName
    volume_aliases: dict = {}
    for svc in services:
        for key, docker_name in svc.get("volumeAliases", {}).items():
            if docker_name:
                volume_aliases[key] = docker_name

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
                docker_name = volume_aliases.get(host, host)
                all_volumes[host] = {"external": True, "name": docker_name}

    # Validate volume entries: named volumes must include a container path
    for svc in services:
        for vol in svc.get("volumes", []):
            parts = str(vol).split(":")
            host = parts[0]
            is_bind = (
                host.startswith(".")
                or host.startswith("/")
                or (len(host) == 1 and host.isalpha())
            )
            if not is_bind and len(parts) < 2:
                raise ValueError(
                    f"Service '{svc['name']}': volume '{vol}' is a named volume but has no "
                    f"container path. Use the format 'volumename:/container/path'."
                )

    # Build compose in display order: networks → volumes → services
    compose: dict = {"networks": {network_name: _build_network(network)}}
    if all_volumes:
        compose["volumes"] = all_volumes
    compose["services"] = {}

    for svc in services:
        entry: dict = {"image": svc["image"]}
        if svc.get("container_name"):
            entry["container_name"] = svc["container_name"]
        if svc.get("ports"):
            entry["ports"] = svc["ports"]
        if svc.get("volumes"):
            entry["volumes"] = svc["volumes"]
        if svc.get("environment"):
            entry["environment"] = svc["environment"]
        if svc.get("restart"):
            entry["restart"] = svc["restart"]
        if svc.get("depends_on"):
            entry["depends_on"] = svc["depends_on"]
        if svc.get("command"):
            entry["command"] = svc["command"]

        # GPU deploy block
        gpu = svc.get("gpu", {})
        if gpu.get("enabled"):
            raw_count = gpu.get("count", "1")
            count = raw_count if raw_count == "all" else int(raw_count)
            entry["deploy"] = {
                "resources": {
                    "reservations": {
                        "devices": [{
                            "driver": gpu.get("driver", "nvidia"),
                            "count": count,
                            "capabilities": gpu.get("capabilities", ["gpu"]),
                        }]
                    }
                }
            }

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
