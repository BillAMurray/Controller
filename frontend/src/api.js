const BASE = '/api'

async function request(method, path, body, isFile = false) {
  const opts = { method, headers: {} }
  if (body && !isFile) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  } else if (isFile) {
    opts.body = body // FormData — browser sets Content-Type with boundary automatically
  }
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  getStatus:           ()           => request('GET',    '/status'),
  getTemplates:        ()           => request('GET',    '/templates'),
  uploadTemplate:      (name, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return request('POST', `/templates?name=${encodeURIComponent(name)}`, fd, true)
  },
  createEmptyTemplate: (name = 'My Template') => {
    const fd = new FormData()
    fd.append('file', new Blob(['services:\n'], { type: 'text/yaml' }), 'docker-compose.yml')
    return request('POST', `/templates?name=${encodeURIComponent(name)}`, fd, true)
  },
  renameTemplate:      (id, name)   => request('PUT',    `/templates/${id}`, { name }),
  deleteTemplate:      (id)         => request('DELETE', `/templates/${id}`),
  getCompose:          (id)         => request('GET',    `/templates/${id}/compose`),
  saveCompose:         (id, content)=> request('PUT',    `/templates/${id}/compose`, { content }),
  deployTemplate:      (id)         => request('POST',   `/templates/${id}/deploy`),
  stopTemplate:        (id)         => request('POST',   `/templates/${id}/stop`),
  pullTemplate:        (id)         => request('POST',   `/templates/${id}/pull`),
  pullAll:             ()           => request('POST',   '/pull-all'),
  startContainer:      (name)       => request('POST',   `/containers/${encodeURIComponent(name)}/start`),
  stopContainer:       (name)       => request('POST',   `/containers/${encodeURIComponent(name)}/stop`),
  getSettings:         ()           => request('GET',    '/settings'),
  saveSettings:        (body)       => request('PUT',    '/settings', body),
}
