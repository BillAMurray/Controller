const BASE = '/api'

async function request(method, path, body) {
  const opts = { method, headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

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

export const api = {
  // Status
  getStatus:        ()              => request('GET',    '/status'),

  // Templates
  getTemplates:     ()              => request('GET',    '/templates'),
  createTemplate:   (name)          => request('POST',   '/templates', { name }),
  updateTemplate:   (id, data)      => request('PUT',    `/templates/${id}`, data),
  deleteTemplate:   (id)            => request('DELETE', `/templates/${id}`),
  getCompose:       (id)            => request('GET',    `/templates/${id}/compose`),
  deployTemplate:   (id)            => request('POST',   `/templates/${id}/deploy`),
  stopTemplate:     (id)            => request('POST',   `/templates/${id}/stop`),
  forceStop:        ()              => request('POST',   '/force-stop'),
  pullTemplate:     (id)            => request('POST',   `/templates/${id}/pull`),
  pullAll:          ()              => request('POST',   '/pull-all'),

  // Services
  getServices:      ()              => request('GET',    '/services'),
  createService:    (data)          => request('POST',   '/services', data),
  updateService:    (id, data)      => request('PUT',    `/services/${id}`, data),
  deleteService:    (id)            => request('DELETE', `/services/${id}`),
  pullService:      (id)            => request('POST',   `/services/${id}/pull`),
  syncServices:     ()              => request('POST',   '/services/sync'),

  // Containers
  startContainer:   (name)          => request('POST',   `/containers/${encodeURIComponent(name)}/start`),
  stopContainer:    (name)          => request('POST',   `/containers/${encodeURIComponent(name)}/stop`),

  // Settings
  getSettings:      ()              => request('GET',    '/settings'),
  saveSettings:     (body)          => request('PUT',    '/settings', body),
}
