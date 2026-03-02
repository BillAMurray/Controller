# AI Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-assisted error fixing and service configuration to Controller, backed by a streaming `/api/ai/chat` endpoint that routes to the user's configured AI provider.

**Architecture:** A new `backend/ai_provider.py` module handles provider routing and streaming. A shared `AiChatModal` React component is reused for both the "Fix it" (Dashboard error) and "Configure this" (ServiceDetail) flows. AI Settings are stored in `settings.json` and edited via a new `ai` tab in Settings.

**Tech Stack:** FastAPI SSE streaming, Anthropic Python SDK, OpenAI Python SDK (for Gemini + custom), React `ReadableStream` for SSE, TanStack Query, Tailwind CSS, lucide-react.

---

## Task 1: Backend — `ai_provider.py`

**Files:**
- Create: `backend/ai_provider.py`

This module owns system prompt building and streaming calls to each provider.

**Step 1: Create the file**

```python
# backend/ai_provider.py
import json
from typing import Generator

import anthropic
import openai


# ── System prompts ────────────────────────────────────────────────────────────

def build_system_prompt(context: dict) -> str:
    ctx_type = context.get("type")
    data     = context.get("data", {})

    if ctx_type == "fix-error":
        error    = data.get("error", "")
        services = json.dumps(data.get("services", []), indent=2)
        return f"""You are a Docker Compose configuration assistant. The user encountered this error deploying a template:

<error>{error}</error>

Here are the services in the template:
<services>{services}</services>

Diagnose the problem and propose exactly one concrete fix. When proposing a change to a service field, output an action block in this exact format (on its own line, nothing else on that line):

~~~action
{{"service_id": "...", "field": "...", "old": ..., "new": ...}}
~~~

Be concise. One issue, one fix."""

    if ctx_type == "configure-service":
        service = json.dumps(data.get("service", {}), indent=2)
        return f"""You are a Docker Compose configuration assistant. The user wants help configuring this service:

<service>{service}</service>

Help them configure it correctly. When proposing a change to a field, output an action block in this exact format (on its own line):

~~~action
{{"service_id": "...", "field": "...", "old": ..., "new": ...}}
~~~

Ask clarifying questions if needed. Be concise and friendly."""

    return "You are a Docker Compose configuration assistant. Help the user."


# ── Provider streaming ────────────────────────────────────────────────────────

def stream_chat(settings: dict, context: dict, messages: list[dict]) -> Generator[str, None, None]:
    """
    Yield SSE-formatted lines: 'data: <token>\\n\\n'
    Terminates with 'data: [DONE]\\n\\n'
    """
    provider = settings.get("activeAiProvider")
    providers = settings.get("aiProviders", {})

    if not provider or provider not in providers:
        raise ValueError("No AI provider configured. Go to AI Settings.")

    cfg = providers[provider]
    key = cfg.get("key", "").strip()
    if not key:
        raise ValueError(f"No API key set for provider '{provider}'. Go to AI Settings.")

    system_prompt = build_system_prompt(context)

    if provider == "claude":
        yield from _stream_anthropic(key, system_prompt, messages)
    elif provider == "gemini":
        yield from _stream_openai(
            key=key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            model="gemini-2.0-flash",
            system_prompt=system_prompt,
            messages=messages,
        )
    elif provider == "custom":
        url = cfg.get("url", "").strip()
        if not url:
            raise ValueError("Custom provider requires a URL. Go to AI Settings.")
        model = cfg.get("model", "").strip() or "gpt-4o"
        yield from _stream_openai(
            key=key,
            base_url=url,
            model=model,
            system_prompt=system_prompt,
            messages=messages,
        )
    else:
        raise ValueError(f"Unknown provider: {provider}")


def _stream_anthropic(key: str, system_prompt: str, messages: list[dict]) -> Generator[str, None, None]:
    client = anthropic.Anthropic(api_key=key)
    with client.messages.stream(
        model="claude-opus-4-6",
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield f"data: {json.dumps(text)}\n\n"
    yield "data: [DONE]\n\n"


def _stream_openai(
    key: str, base_url: str, model: str, system_prompt: str, messages: list[dict]
) -> Generator[str, None, None]:
    client = openai.OpenAI(api_key=key, base_url=base_url)
    all_messages = [{"role": "system", "content": system_prompt}] + messages
    with client.chat.completions.create(
        model=model,
        messages=all_messages,
        stream=True,
    ) as stream:
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield f"data: {json.dumps(delta)}\n\n"
    yield "data: [DONE]\n\n"
```

**Step 2: Verify it imports cleanly**

```bash
cd backend
python -c "import ai_provider; print('ok')"
```
Expected: `ok`

**Step 3: Commit**

```bash
git add backend/ai_provider.py
git commit -m "feat: add ai_provider module for streaming chat"
```

---

## Task 2: Backend — `/api/ai/chat` endpoint in `main.py`

**Files:**
- Modify: `backend/main.py`

**Step 1: Add import at top of `main.py`**

After the existing imports, add:
```python
from fastapi.responses import StreamingResponse
import ai_provider
```

**Step 2: Add the endpoint** (add after the `/api/settings` PUT endpoint at the bottom of the file)

```python
# ── AI Chat ────────────────────────────────────────────────────────────────────

@app.post("/api/ai/chat")
def ai_chat(body: dict):
    context  = body.get("context", {})
    messages = body.get("messages", [])
    settings = data_store.load_settings()
    try:
        gen = ai_provider.stream_chat(settings, context, messages)
        return StreamingResponse(gen, media_type="text/event-stream")
    except ValueError as e:
        raise HTTPException(400, str(e))
```

**Step 3: Also extend `PUT /api/settings`** to accept `aiProviders` and `activeAiProvider`:

Find the existing `update_settings` function:
```python
@app.put("/api/settings")
def update_settings(body: dict):
    settings = data_store.load_settings()
    if "publishDir" in body:
        settings["publishDir"] = body["publishDir"]
    data_store.save_settings(settings)
    return settings
```

Replace with:
```python
@app.put("/api/settings")
def update_settings(body: dict):
    settings = data_store.load_settings()
    if "publishDir" in body:
        settings["publishDir"] = body["publishDir"]
    if "aiProviders" in body:
        settings["aiProviders"] = body["aiProviders"]
    if "activeAiProvider" in body:
        settings["activeAiProvider"] = body["activeAiProvider"]
    data_store.save_settings(settings)
    return settings
```

**Step 4: Restart the backend and smoke-test**

```bash
# With no AI key configured, expect a 400:
curl -s -X POST http://localhost:8025/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"context":{"type":"configure-service","data":{}},"messages":[]}' | head -c 200
```
Expected: `{"detail":"No AI provider configured. Go to AI Settings."}`

**Step 5: Commit**

```bash
git add backend/main.py
git commit -m "feat: add /api/ai/chat SSE endpoint"
```

---

## Task 3: Frontend — `api.js` streaming helper

**Files:**
- Modify: `frontend/src/api.js`

**Step 1: Add `aiChat` to the `api` object**

`aiChat` is different from other methods — it uses `fetch` directly with a `ReadableStream` and calls `onChunk(text)` incrementally, then `onDone()` when finished. It returns an abort function.

Add this **above** the `export const api = {` line:

```js
export function aiChatStream({ context, messages, onChunk, onDone, onError }) {
  const controller = new AbortController()
  fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, messages }),
    signal: controller.signal,
  }).then(async res => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      onError(err.detail || 'Request failed')
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)
        if (payload === '[DONE]') { onDone(); return }
        try { onChunk(JSON.parse(payload)) } catch { /* skip */ }
      }
    }
    onDone()
  }).catch(err => {
    if (err.name !== 'AbortError') onError(err.message)
  })
  return () => controller.abort()
}
```

**Step 2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add aiChatStream helper to api.js"
```

---

## Task 4: Frontend — `AiChatModal` component

**Files:**
- Create: `frontend/src/components/AiChatModal.jsx`

This is the shared modal used for both "Fix it" and "Configure this" contexts.

**Key behaviours:**
- On mount, if `context.type === 'fix-error'`, immediately fires a first AI request with an empty user messages array (the AI opens the conversation)
- For `configure-service`, shows an input and waits for the user to type
- Renders messages in a scrollable thread
- Parses `~~~action` ... `~~~` blocks out of AI text → renders action cards inline
- "Apply" calls `api.updateService(service_id, { [field]: new_value })`
- Courtesy close bar appears once there is at least one AI message

```jsx
// frontend/src/components/AiChatModal.jsx
import { useState, useEffect, useRef } from 'react'
import { X, Bot, Send, Check } from 'lucide-react'
import { aiChatStream } from '../api'
import { api } from '../api'

const DISCLAIMER = "Even AI can make mistakes — review changes before applying."

// Parse text that may contain ~~~action ... ~~~ blocks.
// Returns an array of parts: { type: 'text', content } | { type: 'action', action }
function parseMessage(text) {
  const parts = []
  const regex = /~~~action\s*([\s\S]*?)~~~/g
  let last = 0, match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', content: text.slice(last, match.index) })
    try {
      parts.push({ type: 'action', action: JSON.parse(match[1].trim()) })
    } catch {
      parts.push({ type: 'text', content: match[0] })
    }
    last = regex.lastIndex
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) })
  return parts
}

function ActionCard({ action, allServices, onApplied }) {
  const [state, setState] = useState('idle') // idle | applying | applied | error
  const [errMsg, setErrMsg] = useState(null)
  const svc = allServices?.find(s => s.id === action.service_id)
  const svcName = svc?.name || action.service_id

  async function apply() {
    setState('applying')
    try {
      await api.updateService(action.service_id, { [action.field]: action.new })
      setState('applied')
      onApplied?.()
    } catch (e) {
      setErrMsg(e.message)
      setState('error')
    }
  }

  return (
    <div className="mt-2 rounded border border-blue-700 bg-blue-900/20 p-3 text-sm">
      <p className="text-blue-300 font-semibold mb-1">Proposed change to {svcName}</p>
      <p className="text-gray-300 font-mono text-xs mb-2">
        {action.field}: {JSON.stringify(action.old)} → {JSON.stringify(action.new)}
      </p>
      {state === 'idle' && (
        <div className="flex gap-2">
          <button onClick={apply}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs">
            Apply this change
          </button>
        </div>
      )}
      {state === 'applying' && <span className="text-gray-400 text-xs">Applying…</span>}
      {state === 'applied' && (
        <span className="flex items-center gap-1 text-green-400 text-xs"><Check size={12} /> Applied</span>
      )}
      {state === 'error' && <span className="text-red-400 text-xs">{errMsg}</span>}
    </div>
  )
}

function MessageBubble({ msg, allServices, onApplied }) {
  const isUser = msg.role === 'user'
  const parts = isUser ? [{ type: 'text', content: msg.content }] : parseMessage(msg.content)

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
        isUser ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'
      }`}>
        {parts.map((p, i) =>
          p.type === 'text'
            ? <p key={i} className="whitespace-pre-wrap">{p.content}</p>
            : <ActionCard key={i} action={p.action} allServices={allServices} onApplied={onApplied} />
        )}
      </div>
    </div>
  )
}

export default function AiChatModal({ context, allServices, onClose, onApplied }) {
  // messages: array of { role: 'user'|'assistant', content: string }
  const [messages,     setMessages]     = useState([])
  const [streaming,    setStreaming]     = useState(false)
  const [input,        setInput]        = useState('')
  const [error,        setError]        = useState(null)
  const [showClose,    setShowClose]    = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const bottomRef   = useRef(null)
  const abortRef    = useRef(null)
  const hasAiMsg    = messages.some(m => m.role === 'assistant')

  // Auto-scroll to bottom on new content
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // For fix-error: auto-fire the first AI request on mount
  useEffect(() => {
    if (context.type === 'fix-error') {
      fireAi([])
    }
    return () => abortRef.current?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Show courtesy close once AI has replied
  useEffect(() => {
    if (hasAiMsg && !showClose) setShowClose(true)
  }, [hasAiMsg, showClose])

  function fireAi(msgs) {
    setStreaming(true)
    setError(null)
    // Add placeholder for streaming assistant message
    const placeholder = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, placeholder])
    let accumulated = ''
    abortRef.current = aiChatStream({
      context,
      messages: msgs,
      onChunk: chunk => {
        accumulated += chunk
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: accumulated }
          return next
        })
      },
      onDone: () => setStreaming(false),
      onError: msg => { setError(msg); setStreaming(false) },
    })
  }

  function send() {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    fireAi(newMessages)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function handleClose() {
    if (streaming) { abortRef.current?.() }
    onClose()
  }

  const title = context.type === 'fix-error' ? 'Fix Error' : `Configure ${context.data?.service?.name || 'Service'}`

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl flex flex-col" style={{ height: '70vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-blue-400" />
            <span className="text-sm font-semibold text-gray-200">{title}</span>
          </div>
          <button onClick={handleClose} className="p-1 text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Disclaimer */}
        <div className="px-4 py-2 bg-yellow-900/20 border-b border-yellow-800/40 flex-shrink-0">
          <p className="text-xs text-yellow-500">{DISCLAIMER}</p>
        </div>

        {/* Message thread */}
        <div className="flex-1 overflow-auto p-4">
          {messages.length === 0 && !streaming && (
            <p className="text-gray-500 text-sm text-center mt-8">
              {context.type === 'configure-service'
                ? `What would you like to configure for ${context.data?.service?.name || 'this service'}?`
                : 'Analyzing error…'}
            </p>
          )}
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              msg={m}
              allServices={allServices}
              onApplied={onApplied}
            />
          ))}
          {error && (
            <div className="text-red-400 text-sm text-center my-2">{error}</div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Courtesy close bar */}
        {confirmClose ? (
          <div className="px-4 py-3 border-t border-gray-700 bg-gray-750 flex items-center justify-between flex-shrink-0">
            <span className="text-sm text-gray-300">Are you ready to try this?</span>
            <div className="flex gap-2">
              <button onClick={handleClose}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs">
                Yes, close
              </button>
              <button onClick={() => setConfirmClose(false)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-xs">
                No — keep chatting
              </button>
            </div>
          </div>
        ) : (
          /* Input row */
          <div className="px-4 py-3 border-t border-gray-700 flex gap-2 flex-shrink-0">
            {showClose && (
              <button onClick={() => setConfirmClose(true)}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-400 hover:text-white text-xs whitespace-nowrap">
                Done
              </button>
            )}
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={streaming ? 'Waiting for response…' : 'Ask a question…'}
              disabled={streaming}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <button onClick={send} disabled={streaming || !input.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-500 rounded text-white disabled:opacity-40">
              <Send size={16} />
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/AiChatModal.jsx
git commit -m "feat: add AiChatModal shared component"
```

---

## Task 5: Frontend — AI Settings tab in `Settings.jsx`

**Files:**
- Modify: `frontend/src/pages/Settings.jsx`

### 5a: Add `AiSettingsTab` component

Add this component above `// ─── Publish Dir` (around line 901). It needs `Eye`, `EyeOff`, `Bot` added to the lucide-react import line.

**Step 1: Update the import line at the top of `Settings.jsx`**

Find:
```js
import { ArrowLeft, Trash2, Save, Code2, X, Plus, RefreshCw } from 'lucide-react'
```
Replace with:
```js
import { ArrowLeft, Trash2, Save, Code2, X, Plus, RefreshCw, Bot, Eye, EyeOff } from 'lucide-react'
```

**Step 2: Add the `AiSettingsTab` component** — insert above the `// ─── Publish Dir` comment:

```jsx
// ─── AI Settings Tab ─────────────────────────────────────────────────────────
const AI_PROVIDERS = [
  { id: 'claude',    label: 'Claude (Anthropic)',   needsUrl: false },
  { id: 'gemini',    label: 'Gemini (Google)',       needsUrl: false },
  { id: 'custom',    label: 'Custom / Local LLM',   needsUrl: true  },
]

function AiSettingsTab() {
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })

  const [providers,       setProviders]       = useState({})
  const [activeProvider,  setActiveProvider]  = useState(null)
  const [show,            setShow]            = useState({}) // { providerId: bool }
  const [saved,           setSaved]           = useState(false)
  const savedTimer = useRef(null)
  useEffect(() => () => clearTimeout(savedTimer.current), [])

  useEffect(() => {
    if (!settings) return
    setProviders(settings.aiProviders || {})
    setActiveProvider(settings.activeAiProvider || null)
  }, [settings])

  function setKey(id, key) {
    setProviders(prev => ({ ...prev, [id]: { ...(prev[id] || {}), key } }))
  }
  function setUrl(id, url) {
    setProviders(prev => ({ ...prev, [id]: { ...(prev[id] || {}), url } }))
  }
  function toggleShow(id) {
    setShow(prev => ({ ...prev, [id]: !prev[id] }))
  }
  function selectActive(id) {
    setActiveProvider(id)
  }

  async function save() {
    try {
      await api.saveSettings({ aiProviders: providers, activeAiProvider: activeProvider })
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      savedTimer.current = setTimeout(() => setSaved(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-xl">
        <div className="flex items-center gap-2 mb-6">
          <Bot size={18} className="text-blue-400" />
          <h2 className="text-white font-semibold">AI Provider Settings</h2>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          Store API keys for multiple providers. Check "Use this" to select the active one.
        </p>

        <div className="space-y-4">
          {AI_PROVIDERS.map(({ id, label, needsUrl }) => {
            const isActive = activeProvider === id
            const cfg = providers[id] || {}
            return (
              <div key={id} className={`rounded-lg border p-4 transition-colors ${
                isActive ? 'border-blue-700 bg-blue-900/20' : 'border-gray-700 bg-gray-800'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-white">{label}</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => selectActive(isActive ? null : id)}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-gray-400">Use this</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <input
                    type={show[id] ? 'text' : 'password'}
                    value={cfg.key || ''}
                    onChange={e => setKey(id, e.target.value)}
                    placeholder="API key"
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button onClick={() => toggleShow(id)}
                    className="p-2 text-gray-400 hover:text-white rounded bg-gray-700 hover:bg-gray-600">
                    {show[id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {needsUrl && (
                  <input
                    type="text"
                    value={cfg.url || ''}
                    onChange={e => setUrl(id, e.target.value)}
                    placeholder="Base URL, e.g. http://localhost:11434/v1"
                    className="mt-2 w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-6">
          <button onClick={save}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-semibold transition-colors">
            {saved ? 'Saved!' : <><Save size={14} /> Save AI Settings</>}
          </button>
        </div>
      </div>
    </div>
  )
}
```

### 5b: Add "AI Settings" footer link to both left panels

**In `TemplatesTab`**, find the closing `</aside>` tag (after the template list `</div>`):
```jsx
        </div>
      </aside>
```
Replace with:
```jsx
        </div>
        <div className="p-3 border-t border-gray-700">
          <button onClick={() => {/* handled by parent */}}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors w-full">
            <Bot size={12} /> AI Settings
          </button>
        </div>
      </aside>
```

But the tab switch needs to reach the parent `Settings` component. The cleanest approach: pass an `onAiSettings` prop down from `Settings` → `TemplatesTab` and `ServicesTab`.

**In `ServicesTab`**, same pattern — add the same footer link block before `</aside>`.

### 5c: Wire up the `ai` tab in the main `Settings` component

**Find the tab bar in the `Settings` component:**
```jsx
        <div className="flex gap-1 ml-4">
          {['templates', 'services'].map(t => (
```
Replace with:
```jsx
        <div className="flex gap-1 ml-4">
          {['templates', 'services', 'ai'].map(t => (
```

And update the tab labels so `ai` shows as "AI":
```jsx
              {t === 'ai' ? 'AI' : t}
```

**Find the tab render at the bottom:**
```jsx
      {tab === 'templates' && <TemplatesTab defaultTemplateId={defaultTemplateId} />}
      {tab === 'services'  && <ServicesTab />}
```
Replace with:
```jsx
      {tab === 'templates' && <TemplatesTab defaultTemplateId={defaultTemplateId} onAiSettings={() => setTab('ai')} />}
      {tab === 'services'  && <ServicesTab onAiSettings={() => setTab('ai')} />}
      {tab === 'ai'        && <AiSettingsTab />}
```

**Update `TemplatesTab` signature** to accept and use `onAiSettings`:
```jsx
function TemplatesTab({ defaultTemplateId = null, onAiSettings }) {
```
And in the aside footer button: `onClick={onAiSettings}`

**Update `ServicesTab` signature**:
```jsx
function ServicesTab({ onAiSettings }) {
```
And in its aside footer button: `onClick={onAiSettings}`

**Step 3: Commit**

```bash
git add frontend/src/pages/Settings.jsx
git commit -m "feat: add AI Settings tab with provider key management"
```

---

## Task 6: Frontend — "Fix it" button on Dashboard error banner

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

**Step 1: Add imports**

```jsx
import AiChatModal from '../components/AiChatModal'
import { Bot } from 'lucide-react'
```

**Step 2: Add state for the AI modal**

In the `Dashboard` component body, below `const [deployError, setDeployError] = useState(null)`:
```jsx
const [aiFixContext, setAiFixContext] = useState(null) // null = closed
```

**Step 3: Add "Fix it" button to the error banner**

Find the error banner:
```jsx
        {deployError && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-600 rounded-lg flex items-start gap-3">
            <div className="flex-1 text-red-300 text-sm whitespace-pre-wrap break-words">{deployError}</div>
            <button onClick={() => setDeployError(null)} className="text-red-400 hover:text-red-300 flex-shrink-0 mt-0.5">
              <X size={16} />
            </button>
          </div>
        )}
```
Replace with:
```jsx
        {deployError && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-600 rounded-lg flex items-start gap-3">
            <div className="flex-1 text-red-300 text-sm whitespace-pre-wrap break-words">{deployError}</div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  const tpl = templates.find(t => t.id === activeTemplateId) || templates[0]
                  const tplServices = tpl
                    ? (tpl.serviceIds || []).flatMap(sid => {
                        const s = /* get from services list */ null
                        return s ? [s] : []
                      })
                    : []
                  setAiFixContext({ type: 'fix-error', data: { error: deployError, services: tplServices } })
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs text-white transition-colors"
              >
                <Bot size={12} /> Fix it
              </button>
              <button onClick={() => setDeployError(null)} className="text-red-400 hover:text-red-300 mt-0.5">
                <X size={16} />
              </button>
            </div>
          </div>
        )}
```

The service lookup needs the `services` list — add a services query to Dashboard:
```jsx
const { data: services = [] } = useQuery({ queryKey: ['services'], queryFn: api.getServices })
```

Then fix the `tplServices` lookup:
```jsx
const tplServices = tpl
  ? (tpl.serviceIds || []).map(sid => services.find(s => s.id === sid)).filter(Boolean)
  : []
```

**Step 4: Render the modal**

Below the error banner JSX, add:
```jsx
        {aiFixContext && (
          <AiChatModal
            context={aiFixContext}
            allServices={services}
            onClose={() => setAiFixContext(null)}
            onApplied={() => {
              // Refresh services so the fix is reflected
              qc.invalidateQueries({ queryKey: ['services'] })
            }}
          />
        )}
```

**Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat: add Fix it button to Dashboard error banner"
```

---

## Task 7: Frontend — "Configure this" button on `ServiceDetail`

**Files:**
- Modify: `frontend/src/pages/Settings.jsx`

**Step 1: Add AiChatModal import** at the top of `Settings.jsx`:

```jsx
import AiChatModal from '../components/AiChatModal'
```

**Step 2: Add state to `ServiceDetail`**

In the `ServiceDetail` function body, below the `const [error, setError] = useState(null)` line:
```jsx
const [aiConfigOpen, setAiConfigOpen] = useState(false)
```

**Step 3: Add "Configure this" button to the action row in `ServiceDetail`**

Find the pull button row:
```jsx
        <div className="flex justify-end mb-4">
          <button onClick={pullService} disabled={pulling || isInRunningTemplate}
```
Replace with:
```jsx
        <div className="flex justify-end gap-2 mb-4">
          <button
            onClick={() => setAiConfigOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
          >
            <Bot size={12} /> Configure this
          </button>
          <button onClick={pullService} disabled={pulling || isInRunningTemplate}
```

**Step 4: Render the modal** — add just before the closing `</div>` of the outer return:

After the `{error && ...}` block, before `<div className="max-w-xl">`:
```jsx
      {aiConfigOpen && (
        <AiChatModal
          context={{
            type: 'configure-service',
            data: {
              service: {
                id: service.id,
                name,
                image,
                container_name: containerName,
                command,
                ports,
                volumes,
                environment,
                restart,
                depends_on: dependsOn,
                gpu,
              }
            }
          }}
          allServices={allServices}
          onClose={() => setAiConfigOpen(false)}
          onApplied={() => {
            // The AI applied a change via the API — reload the service
            onSaved()
          }}
        />
      )}
```

**Step 5: Commit**

```bash
git add frontend/src/pages/Settings.jsx
git commit -m "feat: add Configure this AI button to ServiceDetail"
```

---

## Task 8: Final smoke test

**Step 1: Configure an AI provider**
1. Open Settings → AI tab
2. Enter a Claude API key, check "Use this", save

**Step 2: Test "Configure this"**
1. Go to Settings → Services → select any service
2. Click "Configure this"
3. Type "what port should I use for this service?"
4. Verify streaming response appears
5. If AI proposes a change, click "Apply this change" and verify the service updates

**Step 3: Test "Fix it"**
1. Temporarily set a port to a known-bad value (e.g. `0:80`) and deploy
2. When the error appears, click "Fix it"
3. Verify the AI opens with the error pre-loaded and proposes a fix

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: AI integration complete — settings, chat modal, fix-it, configure-this"
```
