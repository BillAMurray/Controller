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
  pullTemplate:     (id)            => request('POST',   `/templates/${id}/pull`),
  pullAll:          ()              => request('POST',   '/pull-all'),

  // Services
  getServices:      ()              => request('GET',    '/services'),
  createService:    (data)          => request('POST',   '/services', data),
  updateService:    (id, data)      => request('PUT',    `/services/${id}`, data),
  deleteService:    (id)            => request('DELETE', `/services/${id}`),
  pullService:      (id)            => request('POST',   `/services/${id}/pull`),

  // Containers
  startContainer:   (name)          => request('POST',   `/containers/${encodeURIComponent(name)}/start`),
  stopContainer:    (name)          => request('POST',   `/containers/${encodeURIComponent(name)}/stop`),

  // Settings
  getSettings:      ()              => request('GET',    '/settings'),
  saveSettings:     (body)          => request('PUT',    '/settings', body),
}
