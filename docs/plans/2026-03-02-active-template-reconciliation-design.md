# Active Template Reconciliation Design
**Date:** 2026-03-02
**Status:** Approved

## Problem

`settings.activeTemplateId` is a flag set on Deploy and cleared on Stop. If Docker stops outside Controller (restart, crash, manual `docker compose down`), the flag remains set while no containers are actually running. The UI shows the template as "Running" and the Stop button errors when clicked.

## Solution

In `GET /api/status` — which already calls `list_containers()` every 5 seconds — add a single reconciliation check: if `activeTemplateId` is set and Docker reports zero running containers, clear the flag.

## Design

**File:** `backend/main.py` — `get_status()` only

```python
settings = data_store.load_settings()
if settings.get("activeTemplateId") and len(containers) == 0:
    settings["activeTemplateId"] = None
    data_store.save_settings(settings)
```

The check runs after `list_containers()` returns, before the response is built.

No frontend changes needed — the frontend's existing `['settings']` query (polled independently) will pick up the cleared flag within one cycle.

## Trade-offs

- **Chosen:** Clear when zero containers — handles Docker restart/crash/manual down
- **Not chosen:** Container name matching — more precise but fragile (Docker auto-generates names) and unnecessary for the primary scenario
- **Not chosen:** Startup-only — misses mid-session Docker restarts

## Edge case

If unrelated containers from other projects are running, the flag will not auto-clear. The Force Stop button (already implemented) handles that case manually.
