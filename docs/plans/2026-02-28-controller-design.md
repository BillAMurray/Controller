# Controller — Design Document
*2026-02-28*

## Overview

A local web application for managing Docker Compose templates. Users define named sets of services as templates, then deploy, redeploy, stop, and pull updates for those service sets from a single dashboard. No Portainer — focused entirely on template lifecycle management.

---

## Tech Stack

Identical pattern to the Agenda app.

- **Backend**: Python FastAPI + Uvicorn, subprocess for Docker operations, `psutil` for system stats
- **Frontend**: React 18 + Vite + Tailwind CSS + Lucide icons + TanStack React Query
- **Storage**: JSON files + YAML files on disk (no database)
- **Runner**: `concurrently` root script starts both API and UI dev server

---

## Data Storage

No database. Three files under `data/` (gitignored, created at runtime):

```
data/
  settings.json             # { publishDir, activeTemplateId, lastPulledAll }
  templates.json            # [{ id, name, createdAt, lastPulled }]
  templates/
    {id}/
      docker-compose.yml    # raw YAML content for this template
```

- `lastPulled` per template: date string `"YYYY-MM-DD"` or `null`
- `lastPulledAll` in settings: date string `"YYYY-MM-DD"` or `null`
- `activeTemplateId`: ID of the template currently deployed to the publish directory
- `publishDir` in settings: absolute path where the active docker-compose.yml is written before running compose commands

---

## Project Structure

```
backend/
  main.py           # FastAPI app and all route handlers
  docker_ops.py     # subprocess wrappers: compose up/down/pull, docker start/stop, docker ps
  data_store.py     # read/write helpers for templates.json and settings.json
  requirements.txt  # fastapi, uvicorn[standard], psutil, aiofiles, python-multipart, pyyaml
  venv/
frontend/
  src/
    components/     # ServiceCard, StatsBar, TemplateSelector, DeployButton, PullButton, Modals
    pages/          # Dashboard.jsx, Settings.jsx
    api.js          # fetch wrappers for all API calls
  package.json
  vite.config.js
  tailwind.config.js
data/               # runtime only, not committed
docs/
package.json        # root concurrently start script
```

---

## Screens

### Onboarding (empty state)
Shown when `templates.json` is empty. Two options:
1. Drag-and-drop zone to upload a `docker-compose.yml` — parses and creates first template named "My Template"
2. "Get Started" button — creates an empty template and goes directly to Dashboard

### Dashboard
Main view once at least one template exists.

**Top bar**: App logo + "Controller" title | CPU% | Memory% | Disk% | Running: N badge

**Template bar**: `Template [dropdown]` | `Save` button | `Deploy/Redeploy/Switch & Deploy` button | `Stop` button | `Pull` split-button

**Canvas**: Grid of service cards, one per service defined in the selected template's YAML. Each card shows:
- Service icon (inferred from image name where possible, generic fallback)
- Service name
- Running / stopped toggle (calls `docker start` / `docker stop`)
- "settings" link (future: per-service config)

**Add New** card at end of grid — opens raw YAML editor (see Settings below)

### Settings Page
- **App settings**: publish directory path (text input)
- **Template settings** (per selected template): rename field, raw YAML editor (textarea with monospace font), delete template button

---

## Deploy Flow & Button States

| Current state | Button label | Action |
|---|---|---|
| Nothing running, template saved | **Deploy** | Write YAML to `publishDir/docker-compose.yml` → `docker compose up -d` |
| This template is running | **Redeploy** | `docker compose down` → `docker compose up -d` |
| A different template is running | **Switch & Deploy** | Show warning modal → `docker compose down` → `docker compose up -d` |
| Template not yet saved | **Deploy** (disabled) | — |

**Stop button**: always runs `docker compose down` in `publishDir`.

**Warning modal** (shown before Switch & Deploy):
> "N containers are currently running. Deploying will stop them all."
> Collapsible list of container names.
> Buttons: "Stop All & Deploy" / "Cancel"

`activeTemplateId` in settings.json is updated after every successful deploy and cleared after stop.

---

## Pull Feature

Split-button dropdown near top bar with two options:

- **Pull this template** — runs `docker compose -f {templateYamlPath} pull`. Updates `templates[id].lastPulled` to today's date.
- **Pull all** — iterates every template and runs `docker compose pull` for each. Updates `settings.lastPulledAll`.

Button shows last-pulled date inline: *"Last pulled: Feb 27"* or *"Never"*.
Pull runs async — button shows spinner, toast on completion or error.

---

## API Endpoints

```
GET  /api/status                    # { containers: [...], cpu, memory, disk, runningCount }
GET  /api/templates                 # list all templates with metadata
POST /api/templates                 # upload YAML file → create new template
PUT  /api/templates/{id}            # rename template
DELETE /api/templates/{id}          # delete template + its YAML file
GET  /api/templates/{id}/compose    # return raw YAML string
PUT  /api/templates/{id}/compose    # save raw YAML string (from editor)
POST /api/templates/{id}/deploy     # write YAML to publishDir + docker compose up -d
POST /api/templates/{id}/stop       # docker compose down
POST /api/templates/{id}/pull       # docker compose pull for this template
POST /api/pull-all                  # docker compose pull for all templates
POST /api/containers/{name}/start   # docker start {name}
POST /api/containers/{name}/stop    # docker stop {name}
GET  /api/settings                  # return settings.json
PUT  /api/settings                  # update settings.json
```

---

## Docker Operations (subprocess)

All Docker calls run via `subprocess.run()` in `docker_ops.py`:

```python
docker compose -f {compose_path} up -d
docker compose -f {compose_path} down
docker compose -f {compose_path} pull
docker ps --format "{{json .}}"       # parse running containers
docker start {container_name}
docker stop {container_name}
```

System stats from `psutil`: `cpu_percent()`, `virtual_memory().percent`, `disk_usage('/').percent`.

---

## Frontend Polling

React Query polls `GET /api/status` every 5 seconds to refresh:
- Service card toggle states
- "Running: N" badge
- CPU / Memory / Disk stats

All mutation operations (deploy, stop, pull) invalidate the status query on completion.

---

## Constraints & Notes

- The publish directory must exist before deploying. The app validates this and shows an error if missing.
- External volumes referenced in YAML must exist on the Docker host. The app does not create them.
- `docker compose` v2 CLI assumed (i.e., `docker compose` not `docker-compose`).
- The app runs on the same machine as Docker. No remote Docker host support.
- First template imported from `_ref/docker-compose.yml` is named "My Template" by default.
