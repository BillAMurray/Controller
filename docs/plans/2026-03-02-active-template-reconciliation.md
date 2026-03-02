# Active Template Reconciliation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-clear `activeTemplateId` in settings when Docker reports zero running containers, so the UI always reflects reality after a Docker restart, crash, or manual stop.

**Architecture:** Single addition to `GET /api/status` in `backend/main.py`. The endpoint already calls `list_containers()` every 5 seconds; after getting the container list, check if the active-template flag is stale and clear it if so. No frontend changes needed.

**Tech Stack:** FastAPI, `data_store.py` (JSON file persistence).

---

### Task 1: Add reconciliation to `get_status()`

**Files:**
- Modify: `backend/main.py` — `get_status()` function (around line 27)

**Step 1: Read the current function**

Read `C:\inetpub\websites\Controller\backend\main.py` lines 25-33 to confirm the exact current state of `get_status()`:

```python
@app.get("/api/status")
def get_status():
    containers   = docker_ops.list_containers()
    stats        = docker_ops.system_stats()
    local_images = docker_ops.list_images()
    return {**stats, "runningCount": len(containers), "containers": containers, "localImages": local_images}
```

**Step 2: Replace `get_status()` with the reconciling version**

```python
@app.get("/api/status")
def get_status():
    containers   = docker_ops.list_containers()
    stats        = docker_ops.system_stats()
    local_images = docker_ops.list_images()

    # Reconcile: if the flag says a template is running but Docker has no
    # containers, the template was stopped outside Controller — clear the flag.
    settings = data_store.load_settings()
    if settings.get("activeTemplateId") and len(containers) == 0:
        settings["activeTemplateId"] = None
        data_store.save_settings(settings)

    return {**stats, "runningCount": len(containers), "containers": containers, "localImages": local_images}
```

**Step 3: Verify the backend still imports cleanly**

```bash
cd C:\inetpub\websites\Controller\backend
python -c "import main; print('ok')"
```
Expected: `ok`

**Step 4: Commit**

```bash
cd C:\inetpub\websites\Controller
git add backend/main.py
git commit -m "fix: auto-clear activeTemplateId when no containers are running"
```

**Step 5: Manual smoke test**

1. Start the app (`_bat file\controller.bat`)
2. Manually set `activeTemplateId` to any non-null value in `data\settings.json` while no Docker containers are running
3. Wait ~5 seconds (one status poll cycle)
4. Reload the UI — the template should no longer show the green "Running" badge and the Stop button should be disabled
5. Confirm `data\settings.json` now has `"activeTemplateId": null`
