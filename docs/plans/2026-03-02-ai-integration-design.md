# AI Integration Design
**Date:** 2026-03-02
**Status:** Approved

## Overview

Add AI-assisted configuration and error-fixing to the Controller app. Three connected pieces: an AI Settings page to store provider keys, a shared AI chat modal used in two contexts (error fix and service configure), and a single streaming backend endpoint that routes to the active AI provider.

---

## 1. AI Settings

### Data model (`settings.json`)

```json
"aiProviders": {
  "claude":  { "key": "sk-ant-..." },
  "gemini":  { "key": "AIza..." },
  "custom":  { "key": "sk-...", "url": "http://localhost:11434/v1" }
},
"activeAiProvider": "claude"
```

- All providers are stored; only one is active at a time.
- `custom` is the only provider that requires a URL (OpenAI-compatible endpoint, e.g. local Ollama).
- `PUT /api/settings` already exists and will accept these new fields.

### UI entry point

A small `Bot` icon + "AI Settings" text link at the bottom of the left panel in both `TemplatesTab` and `ServicesTab`. Styled low-contrast (`text-xs text-gray-500 hover:text-gray-400`) so it doesn't compete with the list. Clicking it sets the active tab to `"ai"`.

### AiSettingsTab layout

A single right-panel form with four provider rows: **Claude**, **Anthropic**, **Gemini**, **Custom**.

Each row:
- Radio-style "use this" checkbox — selecting one clears all others, sets `activeAiProvider`
- API key input (password-masked, with show/hide toggle)
- Custom row only: a URL input below the key field

Active provider row gets a subtle highlight (`bg-blue-900/20 border-blue-700`).
Auto-saves to `PUT /api/settings` on blur or explicit Save button.

---

## 2. AI Chat Modal (shared component)

### Two contexts

| Context | Trigger | Pre-loaded context |
|---|---|---|
| `fix-error` | "Fix it" button on Dashboard error banner | Error message + full config of every service in the failed template |
| `configure-service` | "Configure this" button on ServiceDetail | Service name, image, and current full config |

### Chat mechanics

- Scrollable message thread: user messages right-aligned, AI messages left-aligned.
- AI responses stream token-by-token (SSE) — feels live.
- The AI's opening message is pre-generated (no need to type anything for fix-error).

### Action cards

When the AI proposes a change, it embeds a fenced JSON block in its response:

```
~~~action
{ "service_id": "ae51...", "field": "ports", "old": ["32768:80"], "new": ["38080:80"] }
~~~
```

The frontend strips this from the visible text and renders an inline action card:

```
┌─────────────────────────────────────────┐
│  Proposed change to agent-zero          │
│  ports: ["32768:80"] → ["38080:80"]     │
│  [Apply this change]  [Skip]            │
└─────────────────────────────────────────┘
```

Applying calls `PUT /api/services/{id}` with the new field value and shows a ✓ inline.

### Disclaimer

Before the first AI response renders, a one-line notice appears at the top of the thread:
> "Even AI can make mistakes — review changes before applying."

### Courtesy close

When the user clicks X or types something like "thanks" / "done", a prompt appears at the bottom:
> "Are you ready to try this?"  **[Yes, close]**  **[No — keep chatting]**

"Yes, close" dismisses the modal. "No" returns focus to the input.

---

## 3. Backend

### Endpoint

`POST /api/ai/chat`  — streaming SSE response (`text/event-stream`)

**Request body:**
```json
{
  "context": {
    "type": "fix-error" | "configure-service",
    "data": { }
  },
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Behavior:**
1. Read `activeAiProvider` + credentials from `settings.json`.
2. Build system prompt from context type + data.
3. Route to provider:
   - `claude` → Anthropic Python SDK (`anthropic` package), streaming messages API
   - `gemini` → `openai` Python package pointed at Google's OpenAI-compatible endpoint
   - `custom` → `openai` Python package pointed at `url` from settings
4. Stream tokens back as SSE `data:` lines.
5. On completion, emit a final `data: [DONE]` event.

**Error handling:**
- No `activeAiProvider` set or no key → `400` with message "No AI provider configured. Go to AI Settings."
- Provider call fails → `502` with the provider error message.

### System prompts

**fix-error:**
```
You are a Docker Compose configuration assistant. The user encountered this error deploying a template:

<error>{error}</error>

Here are the services in the template:
<services>{json}</services>

Diagnose the problem and propose exactly one concrete fix. When proposing a change to a service field, output an action block in this format:
~~~action
{ "service_id": "...", "field": "...", "old": ..., "new": ... }
~~~
Be concise. One issue, one fix.
```

**configure-service:**
```
You are a Docker Compose configuration assistant. The user wants help configuring this service:

<service>{json}</service>

Help them configure it correctly. When proposing a change to a field, output an action block:
~~~action
{ "service_id": "...", "field": "...", "old": ..., "new": ... }
~~~
Ask clarifying questions if needed. Be concise and friendly.
```

---

## File Changes

| File | Change |
|---|---|
| `backend/main.py` | Add `POST /api/ai/chat` SSE endpoint |
| `backend/ai_provider.py` | New: provider routing, system prompt building, streaming |
| `frontend/src/api.js` | Add `aiChat(context, messages)` using fetch + ReadableStream |
| `frontend/src/pages/Settings.jsx` | Add `AiSettingsTab`, "AI Settings" footer link in both left panels |
| `frontend/src/components/AiChatModal.jsx` | New: shared chat modal component |
| `frontend/src/pages/Dashboard.jsx` | Add "Fix it" button to error banner; pass context to AiChatModal |
| `frontend/src/pages/Settings.jsx` | Add "Configure this" button to `ServiceDetail` |
