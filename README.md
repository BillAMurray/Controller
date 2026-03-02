# Controller

A local web UI for managing Docker Compose stacks. Define your services once, build reusable templates, and deploy or stop your entire stack with a single click. This is a **companion app** intended to work with your existing installation of Docker (Docker Desktop).

![screenshot placeholder]

## Features

- **Services** — define container configs (image, ports, volumes, environment, GPU, etc.) as reusable building blocks
- **Templates** — combine services into named stacks with shared network settings
- **One-click deploy / stop** — runs `docker compose up -d` / `docker compose down` behind the scenes
- **YAML preview** — inspect the generated `docker-compose.yml` before deploying
- **Live status bar** — CPU, memory, disk, and running container count polled every 5 seconds
- **AI assistant** — "Fix it" on deploy errors, "Configure this" on any service (requires an API key for Claude, Gemini, or any OpenAI-compatible endpoint)

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Python](https://www.python.org/) 3.11+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine on Linux)

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/BillAMurray/Controller.git
cd Controller
```

### 2. Install dependencies

```bash
# Frontend
npm install
cd frontend && npm install && cd ..

# Backend — create a virtual environment and install packages
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt   # Windows
# source venv/bin/activate && pip install -r requirements.txt  # macOS/Linux
cd ..
```

### 3. Start the app

**Windows — double-click or run:**

```
_bat file\controller.bat
```

This launches both the API server (port 8025) and the frontend dev server (port 5175), then opens the app in your browser automatically.

**Manual start (any platform):**

```bash
npm run start
```

Then open [http://localhost:5175](http://localhost:5175).

## Project Structure

```
Controller/
├── backend/          # FastAPI API server (port 8025)
│   ├── main.py       # Routes
│   ├── data_store.py # JSON file persistence
│   ├── docker_ops.py # Docker CLI wrapper
│   ├── yaml_generator.py
│   └── requirements.txt
├── frontend/         # React + Vite + Tailwind (port 5175)
│   └── src/
│       ├── pages/    # Dashboard, Settings
│       └── components/
├── data/             # Created at runtime — gitignored
│   └── settings.json # Your services, templates, and API keys (never committed)
└── _bat file/
    └── controller.bat  # Windows one-click launcher
```

## Data & Privacy

Everything you configure (services, templates, API keys) is stored locally in `data/settings.json`. This folder is gitignored and never committed. Cloning this repo starts you with a completely empty slate.

## AI Assistant (optional)

Go to **Settings → AI** to configure a provider:

| Provider | Where to get a key |
|----------|--------------------|
| Claude   | [console.anthropic.com](https://console.anthropic.com) |
| Gemini   | [aistudio.google.com](https://aistudio.google.com) |
| Custom   | Any OpenAI-compatible endpoint (e.g. local Ollama) |

Your key is saved only in `data/settings.json` on your machine.
