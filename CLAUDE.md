# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a reference configuration repository for a local AI infrastructure stack. Currently it contains only `_ref/docker-compose.yml` — a Docker Compose spec for running self-hosted LLM services.

## Stack Architecture

All services communicate over a shared `appnet` bridge network.

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| ollama | ollama/ollama:latest | 11434 | LLM runtime (GPU-accelerated) |
| open-webui | ghcr.io/open-webui/open-webui:main | 3000→8080 | Chat UI for Ollama |
| postgres | postgres:15 | 5432 | Database backend for LiteLLM |
| litellm | ghcr.io/berriai/litellm:main-latest | 4000 | OpenAI-compatible LLM proxy |
| omni-tools | iib0011/omni-tools:latest | 8080→80 | Utility tools |
| agent-zero | agent0ai/agent-zero:latest | 32768→80 | AI agent framework |

**ByteBot** is not in this compose file — it runs from its own `docker/docker-compose.yml` in a separate directory, pointed at LiteLLM via `OPENAI_API_BASE=http://host.docker.internal:4000/v1`.

## External Volumes (must pre-exist)

These Docker volumes must be created before `docker compose up`:
- `ollama`
- `open-webui`
- `litellm_data`
- `postgres_data`

```bash
docker volume create ollama
docker volume create open-webui
docker volume create litellm_data
docker volume create postgres_data
```

## Common Commands

```bash
# Start the stack
docker compose -f _ref/docker-compose.yml up -d

# Stop the stack
docker compose -f _ref/docker-compose.yml down

# View logs
docker compose -f _ref/docker-compose.yml logs -f [service]

# LiteLLM master key (hardcoded in compose)
# sk-1234567890abcdef

# ByteBot (run from its own directory)
docker compose -f docker/docker-compose.yml up -d
```

## LiteLLM Proxy

Acts as an OpenAI-compatible endpoint at `http://localhost:4000/v1`. Downstream clients (ByteBot, etc.) use:
- `OPENAI_API_BASE=http://host.docker.internal:4000/v1` (from inside another container)
- `OPENAI_API_KEY=sk-1234567890abcdef` (the LiteLLM master key)
- Model routing is configured via the LiteLLM UI or API; `STORE_MODEL_IN_DB=True` persists routes in Postgres.
