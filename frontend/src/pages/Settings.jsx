import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2, Save, Code2, X, Plus, RefreshCw, Bot, Eye, EyeOff } from 'lucide-react'
import { api } from '../api'
import AiChatModal from '../components/AiChatModal'
import { isAiConfigured } from '../utils/aiConfig'

// ─── Helper: list editor (ports, volumes, env) ───────────────────────────────
function ListEditor({ label, values, onChange, placeholder }) {
  function update(i, val) {
    const next = [...values]
    next[i] = val
    onChange(next)
  }
  function remove(i) { onChange(values.filter((_, idx) => idx !== i)) }
  function add()     { onChange([...values, '']) }
  return (
    <div className="mb-4">
      <label className="block text-sm text-gray-300 mb-1">{label}</label>
      {values.map((v, i) => (
        <div key={`${i}-${values.length}`} className="flex gap-2 mb-1">
          <input
            value={v}
            onChange={e => update(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button onClick={() => remove(i)} className="px-2 text-gray-400 hover:text-red-400">×</button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-blue-400 hover:text-blue-300 mt-1">+ Add</button>
    </div>
  )
}

// ─── YAML View Modal ──────────────────────────────────────────────────────────
function YamlModal({ templateId, templateName, onClose }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [copied,  setCopied]  = useState(false)
  const copyTimer = useRef(null)
  useEffect(() => {
    setLoading(true)
    api.getCompose(templateId)
      .then(d => setContent(d?.content || ''))
      .catch(() => setContent(''))
      .finally(() => setLoading(false))
  }, [templateId])
  useEffect(() => () => clearTimeout(copyTimer.current), [])
  function copy() {
    navigator.clipboard.writeText(content)
    setCopied(true)
    copyTimer.current = setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-sm font-semibold text-gray-200">Generated YAML — {templateName}</span>
          <div className="flex gap-2">
            <button onClick={copy} disabled={loading} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white disabled:opacity-50">
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-white"><X size={16} /></button>
          </div>
        </div>
        {loading
          ? <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading…</div>
          : <pre className="flex-1 overflow-auto p-4 text-green-400 text-xs font-mono whitespace-pre">{content}</pre>
        }
      </div>
    </div>
  )
}

// ─── New Template Dialog ──────────────────────────────────────────────────────
function NewTemplateDialog({ onClose, onCreated }) {
  const [name,  setName]  = useState('')
  const [error, setError] = useState(null)
  const [busy,  setBusy]  = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const t = await api.createTemplate(name.trim())
      onCreated(t)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-sm p-6">
        <h2 className="text-white font-semibold mb-4">New Template</h2>
        <form onSubmit={submit}>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Template name"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button type="submit" disabled={busy || !name.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm disabled:opacity-50">
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Add Service Dialog ───────────────────────────────────────────────────────
function AddServiceDialog({ onClose, onAdded }) {
  const [image,       setImage]       = useState('')
  const [pulling,     setPulling]     = useState(false)
  const [error,       setError]       = useState(null)
  const { data: status, isLoading: statusLoading } = useQuery({ queryKey: ['status'], queryFn: api.getStatus })
  const { data: existingSvcs = [] } = useQuery({ queryKey: ['services'], queryFn: api.getServices })

  const localImages = status?.localImages || []
  const usedImages  = existingSvcs.map(s => s.image)
  const suggestions = localImages.filter(img => !usedImages.includes(img))

  function deriveName(img) {
    // "ghcr.io/open-webui/open-webui:main" → "open-webui"
    // Strip digest (@sha256:...) before splitting on ':'
    const noDigest = img.replace(/@[^:/]+:[^:/]+$/, '')
    const base = noDigest.split('/').pop().split(':')[0]
      .replace(/[^a-z0-9_-]/gi, '_') || 'service'
    return base
  }

  async function addWithoutPull() {
    if (!image.trim()) return
    setError(null)
    try {
      const s = await api.createService({ name: deriveName(image.trim()), image: image.trim() })
      onAdded(s)
    } catch (err) {
      setError(err.message)
    }
  }

  async function addAndPull() {
    if (!image.trim()) return
    setPulling(true)
    setError(null)
    try {
      const s = await api.createService({ name: deriveName(image.trim()), image: image.trim() })
      await api.pullService(s.id)
      onAdded(s)
    } catch (err) {
      setError(err.message)
    } finally {
      setPulling(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-md p-6">
        <h2 className="text-white font-semibold mb-4">Add Service</h2>
        <input
          autoFocus
          value={image}
          onChange={e => setImage(e.target.value)}
          placeholder="e.g. ollama/ollama:latest"
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {statusLoading ? (
          <p className="text-xs text-gray-500 mb-3">Checking local images…</p>
        ) : suggestions.length > 0 ? (
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-1">Local images not yet added:</p>
            <div className="max-h-32 overflow-auto space-y-1">
              {suggestions.map(img => (
                <button key={img} onClick={() => setImage(img)}
                  className="block w-full text-left text-xs text-blue-300 hover:text-blue-200 font-mono px-2 py-1 bg-gray-700 rounded truncate">
                  {img}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
        <p className="text-xs text-gray-500 mb-3">
          Image will be pulled automatically on first deploy if not available locally.
        </p>
        <div className="flex gap-2 justify-end flex-wrap">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button onClick={addWithoutPull} disabled={!image.trim() || pulling}
            className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 rounded text-white disabled:opacity-50">
            Add to Services list
          </button>
          <button onClick={addAndPull} disabled={!image.trim() || pulling}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white disabled:opacity-50 flex items-center gap-1">
            {pulling ? <><RefreshCw size={12} className="animate-spin" /> Pulling…</> : 'Add & Pull'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Template Detail ──────────────────────────────────────────────────────────
function TemplateDetail({ template, allServices, localImages, anyRunning, onSaved, onDeleted }) {
  const qc = useQueryClient()
  const [name,       setName]       = useState(template.name)
  const [network,    setNetwork]    = useState(template.network || { name: 'appnet', driver: 'bridge', internal: false, external: false, externalName: '' })
  const [serviceIds, setServiceIds] = useState(template.serviceIds || [])
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState(null)
  const [showYaml,   setShowYaml]   = useState(false)
  const [pulling,    setPulling]    = useState(false)
  const savedTimer = useRef(null)

  async function pull() {
    setPulling(true)
    try {
      await api.pullTemplate(template.id)
      qc.invalidateQueries({ queryKey: ['templates'] })
    } catch (e) {
      setError(e.message)
    } finally {
      setPulling(false)
    }
  }

  useEffect(() => () => clearTimeout(savedTimer.current), [])

  useEffect(() => {
    setName(template.name)
    setNetwork(template.network || { name: 'appnet', driver: 'bridge', internal: false, external: false, externalName: '' })
    setServiceIds(template.serviceIds || [])
    setSaved(false)
    setError(null)
  }, [template.id])

  function setNetType(type) {
    if (type === 'external') setNetwork(n => ({ ...n, internal: false, external: true }))
    else if (type === 'internal') setNetwork(n => ({ ...n, internal: true, external: false }))
    else setNetwork(n => ({ ...n, internal: false, external: false }))
  }

  const netType = network.external ? 'external' : network.internal ? 'internal' : 'bridge'

  function toggleService(id) {
    setServiceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function save() {
    if (!name.trim()) return
    setError(null)
    try {
      await api.updateTemplate(template.id, { name: name.trim(), network, serviceIds })
      onSaved()
      setSaved(true)
      savedTimer.current = setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e.message)
    }
  }

  async function del() {
    if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return
    setError(null)
    try {
      await api.deleteTemplate(template.id)
      onDeleted()
    } catch (e) {
      setError(e.message)
    }
  }

  // All non-unavailable services are eligible; imagePresent is a visual indicator only
  const availableServices = allServices.filter(s => !s.unavailable)
  const imagePresent = (svc) => localImages.some(li =>
    li === svc.image || li.split(':')[0] === svc.image.split(':')[0]
  )
  // Services that were selected but have since been marked unavailable or deleted
  const selectedButGone = serviceIds
    .filter(sid => {
      const svc = allServices.find(s => s.id === sid)
      return !svc || svc.unavailable
    })
    .map(sid => allServices.find(s => s.id === sid)?.name || 'Unknown service')

  return (
    <div className="flex-1 overflow-auto p-6">
      {showYaml && <YamlModal templateId={template.id} templateName={template.name} onClose={() => setShowYaml(false)} />}

      {error && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-600 rounded-lg flex items-start gap-3">
          <div className="flex-1">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="max-w-xl">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="text-lg font-semibold bg-transparent border-b border-gray-600 text-white focus:outline-none focus:border-blue-500 flex-1 mr-4"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={pull}
              disabled={pulling || anyRunning}
              title={anyRunning ? 'Stop the running template before pulling' : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 disabled:opacity-50 transition-colors">
              <RefreshCw size={13} className={pulling ? 'animate-spin' : ''} /> Pull
            </button>
            <button onClick={() => setShowYaml(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300">
              <Code2 size={14} /> View
            </button>
          </div>
        </div>

        {/* Section 1: Network */}
        <section className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Network</h3>
          <div className="mb-3">
            <label className="block text-sm text-gray-300 mb-1 flex items-center gap-1">
              Name
              <span className="relative group">
                <span className="text-gray-500 cursor-help text-xs border border-gray-600 rounded-full w-4 h-4 inline-flex items-center justify-center">i</span>
                <span className="absolute left-6 top-0 w-72 bg-gray-900 text-gray-300 text-xs rounded p-2 border border-gray-700 hidden group-hover:block z-10">
                  All services on the same network can reach each other. For personal use, one network is fine. For production, consider isolating unrelated services into separate networks.
                </span>
              </span>
            </label>
            <input
              value={network.name}
              onChange={e => setNetwork(n => ({ ...n, name: e.target.value }))}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            {[
              { id: 'bridge',   label: 'Local (bridge)',                     desc: 'Creates an isolated network on this machine.' },
              { id: 'internal', label: 'Block external internet (internal)',  desc: 'Prevents services from reaching the internet.' },
              { id: 'external', label: 'Join a shared network (external)',    desc: 'Connects to an existing Docker network.' },
            ].map(opt => (
              <label key={opt.id} className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                netType === opt.id ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700 hover:border-gray-600'
              }`}>
                <input type="radio" name="netType" value={opt.id} checked={netType === opt.id}
                  onChange={() => setNetType(opt.id)} className="mt-0.5 accent-blue-500" />
                <div>
                  <p className="text-sm text-white">{opt.label}</p>
                  <p className="text-xs text-gray-400">{opt.desc}</p>
                  {opt.id === 'internal' && netType === 'internal' && (
                    <p className="text-xs text-blue-400 mt-0.5">bridge is also enabled</p>
                  )}
                  {opt.id === 'external' && netType === 'external' && (
                    <input
                      value={network.externalName || ''}
                      onChange={e => setNetwork(n => ({ ...n, externalName: e.target.value }))}
                      placeholder="Existing network name"
                      onClick={e => e.stopPropagation()}
                      className="mt-2 w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  )}
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Section 2: Services */}
        <section className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Services</h3>
          <p className="text-sm text-gray-400 mb-3">Select the services to include in this template:</p>
          {availableServices.length === 0 && (
            <p className="text-gray-500 text-sm">No available services. Add services in the Services tab.</p>
          )}
          <div className="space-y-2">
            {availableServices.map(svc => (
              <label key={svc.id} className="flex items-center gap-3 p-3 rounded border border-gray-700 hover:border-gray-600 cursor-pointer">
                <input type="checkbox" checked={serviceIds.includes(svc.id)}
                  onChange={() => toggleService(svc.id)} className="accent-blue-500" />
                <div>
                  <p className="text-sm text-white">{svc.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{svc.image}</p>
                  {!imagePresent(svc) && localImages.length > 0 &&
                    <span className="text-xs text-yellow-500">not pulled locally</span>}
                </div>
              </label>
            ))}
            {selectedButGone.length > 0 && (
              <div className="mt-2 space-y-1">
                {selectedButGone.map((goneName, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded border border-gray-700 opacity-50">
                    <input type="checkbox" checked disabled className="accent-blue-500" />
                    <p className="text-sm text-gray-400">{goneName} <span className="text-yellow-500 text-xs">(unavailable)</span></p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        <div className="flex justify-between">
          <button onClick={del}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-900 hover:bg-red-800 rounded text-red-300 text-sm transition-colors">
            <Trash2 size={14} /> Delete Template
          </button>
          <button onClick={save}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-semibold transition-colors">
            {saved ? 'Saved!' : <><Save size={14} /> Save Template</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Service Detail ───────────────────────────────────────────────────────────
function ServiceDetail({ service, allServices = [], isInRunningTemplate = false, aiEnabled = false, onSaved, onDeleted }) {
  const [pulling, setPulling] = useState(false)

  async function pullService() {
    setPulling(true)
    try { await api.pullService(service.id) }
    catch { /* errors surfaced elsewhere */ }
    finally { setPulling(false) }
  }
  const [name,          setName]          = useState(service.name)
  const [image,         setImage]         = useState(service.image)
  const [containerName, setContainerName] = useState(service.container_name || '')
  const [command,       setCommand]       = useState(service.command || '')
  const [ports,         setPorts]         = useState(service.ports || [])
  const [volumes,       setVolumes]       = useState(service.volumes || [])
  const [volumeAliases, setVolumeAliases] = useState(service.volumeAliases || {})
  const [environment,   setEnvironment]   = useState(service.environment || [])
  const [restart,       setRestart]       = useState(service.restart || 'unless-stopped')
  const [dependsOn,     setDependsOn]     = useState(service.depends_on || [])
  const [depPage,       setDepPage]       = useState(0)
  const [gpu,           setGpu]           = useState(service.gpu || { enabled: false, driver: 'nvidia', count: '1', capabilities: ['gpu'] })
  const [unavailable,   setUnavailable]   = useState(service.unavailable || false)
  const [primaryPort,     setPrimaryPort]     = useState(service.primaryPort     || service.ports?.[0]?.split(':')[0] || '')
  const [urlFriendlyName, setUrlFriendlyName] = useState(service.urlFriendlyName || '')
  const [saved,         setSaved]         = useState(false)
  const [error,         setError]         = useState(null)
  const [aiConfigOpen, setAiConfigOpen] = useState(false)
  const savedTimer = useRef(null)

  useEffect(() => () => clearTimeout(savedTimer.current), [])

  useEffect(() => {
    setName(service.name);        setImage(service.image)
    setContainerName(service.container_name || '')
    setCommand(service.command || '')
    setPorts(service.ports || []); setVolumes(service.volumes || [])
    setVolumeAliases(service.volumeAliases || {})
    setEnvironment(service.environment || []); setRestart(service.restart || 'unless-stopped')
    setDependsOn(service.depends_on || [])
    setDepPage(0)
    setGpu(service.gpu || { enabled: false, driver: 'nvidia', count: '1', capabilities: ['gpu'] })
    setUnavailable(service.unavailable || false)
    const incomingPorts = service.ports || []
    const hostPorts = incomingPorts.map(p => p.split(':')[0]).filter(Boolean)
    const saved = service.primaryPort
    setPrimaryPort(saved && hostPorts.includes(saved) ? saved : (hostPorts[0] || ''))
    setUrlFriendlyName(service.urlFriendlyName || '')
    setSaved(false); setError(null)
  }, [service.id])

  function toggleDep(svcName) {
    setDependsOn(prev => prev.includes(svcName) ? prev.filter(x => x !== svcName) : [...prev, svcName])
  }

  function toggleCapability(cap) {
    setGpu(prev => {
      const caps = prev.capabilities || []
      return { ...prev, capabilities: caps.includes(cap) ? caps.filter(c => c !== cap) : [...caps, cap] }
    })
  }

  async function save() {
    if (!name.trim() || !image.trim()) return
    setError(null)
    try {
      await api.updateService(service.id, {
        name: name.trim(), image: image.trim(), container_name: containerName.trim(),
        command: command.trim(), ports, volumes, volumeAliases, environment,
        restart, depends_on: dependsOn, gpu, unavailable,
        primaryPort: primaryPort !== '' ? primaryPort : null,
        urlFriendlyName: urlFriendlyName.trim(),
      })
      onSaved()
      setSaved(true)
      savedTimer.current = setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(e.message) }
  }

  async function del() {
    const msg = `Remove "${service.name}" from Controller?\n\nThis only removes it from Controller. Your port and volume configuration will be lost.\n\nTo also delete the Docker image, run:\n  docker image rm ${service.image}\nor use Docker Desktop → Images.`
    if (!confirm(msg)) return
    setError(null)
    try {
      await api.deleteService(service.id)
      onDeleted()
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
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
          onApplied={onSaved}
        />
      )}
      {error && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-600 rounded-lg flex items-start gap-3">
          <div className="flex-1">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="max-w-xl">
        <div className="flex justify-end gap-2 mb-4">
          {aiEnabled && (
            <button
              onClick={() => setAiConfigOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
            >
              <Bot size={12} /> Configure this
            </button>
          )}
          <button onClick={pullService} disabled={pulling || isInRunningTemplate}
            title={isInRunningTemplate ? 'Stop the running template before pulling this service' : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 disabled:opacity-50 transition-colors">
            <RefreshCw size={12} className={pulling ? 'animate-spin' : ''} /> {pulling ? 'Pulling…' : 'Pull'}
          </button>
        </div>
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Service name (compose key)</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Image</label>
          <input value={image} onChange={e => setImage(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Container name <span className="text-gray-500 text-xs">(optional)</span></label>
          <input value={containerName} onChange={e => setContainerName(e.target.value)}
            placeholder="e.g. my-ollama"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Command <span className="text-gray-500 text-xs">(optional)</span></label>
          <input value={command} onChange={e => setCommand(e.target.value)}
            placeholder="e.g. --port 4000 --num_workers 1"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>

        <ListEditor label="Ports"                values={ports}       onChange={newPorts => {
          setPorts(newPorts)
          const hp = newPorts.map(p => p.split(':')[0]).filter(Boolean)
          setPrimaryPort(prev => hp.includes(prev) ? prev : (hp[0] || ''))
        }}       placeholder="e.g. 8080:8080" />
        <ListEditor label="Volumes"              values={volumes}     onChange={setVolumes}     placeholder="e.g. myvolume:/data" />

        {/* Volume aliases — shown for each named volume that could have a different Docker name */}
        {volumes.filter(v => { const h = v.split(':')[0]; return h && !h.startsWith('.') && !h.startsWith('/') && !(h.length === 1 && /[a-z]/i.test(h)) }).length > 0 && (
          <div className="mb-4">
            <label className="block text-sm text-gray-300 mb-1">
              Volume Docker names <span className="text-gray-500 text-xs">(if the actual Docker volume name differs from the key above)</span>
            </label>
            <div className="space-y-2">
              {volumes
                .map(v => v.split(':')[0])
                .filter((h, i, arr) => h && !h.startsWith('.') && !h.startsWith('/') && !(h.length === 1 && /[a-z]/i.test(h)) && arr.indexOf(h) === i)
                .map(composeKey => (
                  <div key={composeKey} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-mono w-40 truncate">{composeKey}</span>
                    <span className="text-gray-600 text-xs">→</span>
                    <input
                      value={volumeAliases[composeKey] || ''}
                      onChange={e => setVolumeAliases(prev => ({ ...prev, [composeKey]: e.target.value }))}
                      placeholder={composeKey}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                ))
              }
            </div>
          </div>
        )}
        <ListEditor label="Environment Variables" values={environment} onChange={setEnvironment} placeholder="e.g. KEY=value" />

        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Restart policy</label>
          <select value={restart} onChange={e => setRestart(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
            {['unless-stopped', 'always', 'on-failure', 'no'].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        {/* Depends on — paged, 5 per page */}
        {(() => {
          const PAGE_SIZE = 5
          const eligible = allServices.filter(s => s.id !== service.id && !s.unavailable)
          if (eligible.length === 0) return null
          const pageCount = Math.ceil(eligible.length / PAGE_SIZE)
          const page = depPage ?? 0
          const slice = eligible.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
          return (
            <div className="mb-4">
              <label className="block text-sm text-gray-300 mb-1">Depends on</label>
              <div className="space-y-1">
                {slice.map(s => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded border border-gray-700 hover:border-gray-600 cursor-pointer">
                    <input type="checkbox" checked={dependsOn.includes(s.name)}
                      onChange={() => toggleDep(s.name)} className="accent-blue-500" />
                    <span className="text-sm text-white">{s.name}</span>
                  </label>
                ))}
              </div>
              {pageCount > 1 && (
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => setDepPage(p => Math.max(0, p - 1))} disabled={page === 0}
                    className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 disabled:opacity-40">‹ Prev</button>
                  <span className="text-xs text-gray-500">{page + 1} / {pageCount}</span>
                  <button onClick={() => setDepPage(p => Math.min(pageCount - 1, p + 1))} disabled={page === pageCount - 1}
                    className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 disabled:opacity-40">Next ›</button>
                </div>
              )}
            </div>
          )
        })()}

        {/* GPU */}
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-2">GPU</label>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input type="checkbox" checked={gpu.enabled}
              onChange={e => setGpu(prev => ({ ...prev, enabled: e.target.checked }))} className="accent-blue-500" />
            <span className="text-sm text-white">Enable GPU passthrough</span>
          </label>
          {gpu.enabled && (
            <div className="ml-6 space-y-3 border-l border-gray-700 pl-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Driver</label>
                <select value={gpu.driver} onChange={e => setGpu(prev => ({ ...prev, driver: e.target.value }))}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="nvidia">nvidia</option>
                  <option value="amd">amd</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Count</label>
                <select value={gpu.count} onChange={e => setGpu(prev => ({ ...prev, count: e.target.value }))}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="all">all</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Capabilities</label>
                <div className="flex gap-3">
                  {['gpu', 'compute', 'utility', 'graphics', 'video'].map(cap => (
                    <label key={cap} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={(gpu.capabilities || []).includes(cap)}
                        onChange={() => toggleCapability(cap)} className="accent-blue-500" />
                      <span className="text-xs text-gray-300">{cap}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* URL settings */}
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">
            Primary Port <span className="text-gray-500 text-xs">(used for Dashboard URL link)</span>
          </label>
          {ports.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No ports defined for this service</p>
          ) : (
            <select
              value={primaryPort}
              onChange={e => setPrimaryPort(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {[...new Set(ports.map(p => p.split(':')[0]).filter(Boolean))].map(hp => (
                <option key={hp} value={hp}>{hp}</option>
              ))}
            </select>
          )}
        </div>
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">
            URL Friendly Name <span className="text-gray-500 text-xs">(optional — leave blank to use service name)</span>
          </label>
          <input
            value={urlFriendlyName}
            onChange={e => setUrlFriendlyName(e.target.value)}
            placeholder="e.g. Open WebUI"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <label className="flex items-start gap-3 p-3 rounded border border-gray-700 cursor-pointer hover:border-gray-600 mb-4">
          <input type="checkbox" checked={unavailable} onChange={e => setUnavailable(e.target.checked)} className="mt-0.5 accent-blue-500" />
          <div>
            <p className="text-sm text-white">Unavailable to templates</p>
            <p className="text-xs text-gray-400">Hide this service from template configuration</p>
          </div>
        </label>

        <div className="flex justify-between">
          <button onClick={del}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-900 hover:bg-red-800 rounded text-red-300 text-sm transition-colors">
            <Trash2 size={14} /> Remove from Controller
          </button>
          <button onClick={save}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-semibold transition-colors">
            {saved ? 'Saved!' : <><Save size={14} /> Save Service</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Templates Tab ────────────────────────────────────────────────────────────
function TemplatesTab({ defaultTemplateId = null, onAiSettings }) {
  const qc = useQueryClient()
  const [selectedId,     setSelectedId]     = useState(defaultTemplateId)
  const [showNewDialog,  setShowNewDialog]  = useState(false)
  const hasSynced = useRef(false)

  const { data: templates  = [] } = useQuery({ queryKey: ['templates'],  queryFn: api.getTemplates })
  const { data: allServices = [] } = useQuery({ queryKey: ['services'],  queryFn: api.getServices })
  const { data: status }           = useQuery({ queryKey: ['status'],    queryFn: api.getStatus, refetchInterval: 5000 })
  const { data: settings }         = useQuery({ queryKey: ['settings'],  queryFn: api.getSettings })

  const anyRunning = !!settings?.activeTemplateId

  // Auto-sync services from Docker on first mount
  useEffect(() => {
    if (hasSynced.current) return
    hasSynced.current = true
    api.syncServices()
      .then(() => qc.invalidateQueries({ queryKey: ['services'] }))
      .catch(() => {})
  }, [qc])

  const localImages   = status?.localImages || []
  const activeId      = selectedId || templates[0]?.id
  const activeTemplate = templates.find(t => t.id === activeId)

  function refresh() {
    qc.invalidateQueries({ queryKey: ['templates'] })
    qc.invalidateQueries({ queryKey: ['services'] })
  }

  function handleCreated(t) {
    qc.invalidateQueries({ queryKey: ['templates'] })
    setSelectedId(t.id)
    setShowNewDialog(false)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {showNewDialog && <NewTemplateDialog onClose={() => setShowNewDialog(false)} onCreated={handleCreated} />}

      {/* Left panel */}
      <aside className="w-56 bg-gray-800 border-r border-gray-700 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-gray-700">
          <button onClick={() => setShowNewDialog(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm transition-colors">
            <Plus size={14} /> New Template
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {templates.length === 0 ? (
            <p className="text-gray-500 text-sm p-4">No templates yet.</p>
          ) : (
            templates.map(t => (
              <button key={t.id} onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-gray-700 transition-colors ${
                  t.id === activeId ? 'bg-blue-900/40 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}>
                {t.name}
              </button>
            ))
          )}
        </div>
        <div className="p-3 border-t border-gray-700">
          <button onClick={onAiSettings}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors w-full">
            <Bot size={12} /> AI Settings
          </button>
        </div>
      </aside>

      {/* Right panel */}
      {activeTemplate ? (
        <TemplateDetail
          key={activeTemplate.id}
          template={activeTemplate}
          allServices={allServices}
          localImages={localImages}
          anyRunning={anyRunning}
          onSaved={refresh}
          onDeleted={() => { refresh(); setSelectedId(null) }}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          {templates.length === 0 ? 'Create a template to get started.' : 'Select a template.'}
        </div>
      )}
    </div>
  )
}

// ─── Services Tab ─────────────────────────────────────────────────────────────
function ServicesTab({ onAiSettings }) {
  const qc = useQueryClient()
  const [selectedId,    setSelectedId]    = useState(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [syncing,       setSyncing]       = useState(false)
  const [pullingAll,    setPullingAll]    = useState(false)
  const hasSynced = useRef(false)

  const { data: services  = [] } = useQuery({ queryKey: ['services'],  queryFn: api.getServices })
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: api.getTemplates })
  const { data: status }         = useQuery({ queryKey: ['status'],    queryFn: api.getStatus, refetchInterval: 5000 })
  const { data: settings }       = useQuery({ queryKey: ['settings'],  queryFn: api.getSettings })

  const localImages    = status?.localImages || []
  const activeId       = selectedId || services[0]?.id
  const activeService  = services.find(s => s.id === activeId)
  const anyRunning     = !!settings?.activeTemplateId
  const runningTemplate = templates.find(t => t.id === settings?.activeTemplateId)
  const runningServiceIds = new Set(runningTemplate?.serviceIds || [])

  // Auto-sync from Docker on first mount
  useEffect(() => {
    if (hasSynced.current) return
    hasSynced.current = true
    api.syncServices()
      .then(() => qc.invalidateQueries({ queryKey: ['services'] }))
      .catch(() => {})
  }, [qc])

  function refresh() { qc.invalidateQueries({ queryKey: ['services'] }) }

  async function pullAll() {
    setPullingAll(true)
    try {
      await api.pullAll()
      qc.invalidateQueries({ queryKey: ['templates'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
    } catch { /* ignore */ }
    finally { setPullingAll(false) }
  }

  async function syncFromDocker() {
    setSyncing(true)
    try {
      await api.syncServices()
      qc.invalidateQueries({ queryKey: ['services'] })
    } catch { /* ignore */ }
    finally { setSyncing(false) }
  }

  function handleAdded(s) {
    qc.invalidateQueries({ queryKey: ['services'] })
    setSelectedId(s.id)
    setShowAddDialog(false)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {showAddDialog && <AddServiceDialog onClose={() => setShowAddDialog(false)} onAdded={handleAdded} />}

      {/* Left panel */}
      <aside className="w-56 bg-gray-800 border-r border-gray-700 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-gray-700 space-y-2">
          <button onClick={() => setShowAddDialog(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm transition-colors">
            <Plus size={14} /> Add Service
          </button>
          <button onClick={pullAll} disabled={pullingAll || anyRunning}
            title={anyRunning ? 'Stop the running template before pulling' : undefined}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-sm transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={pullingAll ? 'animate-spin' : ''} /> {pullingAll ? 'Pulling…' : 'Pull All'}
          </button>
          <button onClick={syncFromDocker} disabled={syncing}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-sm transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync from Docker'}
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {services.length === 0 ? (
            <p className="text-gray-500 text-sm p-4">No services yet.</p>
          ) : (
            services.map(s => {
              const imagePresent = localImages.some(li =>
                li === s.image || li.split(':')[0] === s.image.split(':')[0]
              )
              return (
                <button key={s.id} onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-700 transition-colors ${
                    s.id === activeId ? 'bg-blue-900/40' : 'hover:bg-gray-700'
                  }`}>
                  <p className={`text-sm ${s.unavailable ? 'text-gray-500' : 'text-gray-200'}`}>{s.name}</p>
                  <p className="text-xs text-gray-500 font-mono truncate">{s.image}</p>
                  {!imagePresent && <span className="text-xs text-yellow-500">image not found</span>}
                  {s.unavailable && <span className="text-xs text-gray-500">unavailable</span>}
                </button>
              )
            })
          )}
        </div>
        <div className="p-3 border-t border-gray-700">
          <button onClick={onAiSettings}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-400 transition-colors w-full">
            <Bot size={12} /> AI Settings
          </button>
        </div>
      </aside>

      {/* Right panel */}
      {activeService ? (
        <ServiceDetail
          key={activeService.id}
          service={activeService}
          allServices={services}
          isInRunningTemplate={runningServiceIds.has(activeService.id)}
          aiEnabled={isAiConfigured(settings)}
          onSaved={refresh}
          onDeleted={() => { refresh(); setSelectedId(null) }}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          {services.length === 0 ? 'Add a service to get started.' : 'Select a service.'}
        </div>
      )}
    </div>
  )
}

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
  const [show,            setShow]            = useState({})
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

        <div className="flex gap-3 p-3 mb-6 bg-blue-900/20 border border-blue-800/50 rounded-lg text-xs text-blue-300">
          <Bot size={14} className="flex-shrink-0 mt-0.5 text-blue-400" />
          <div>
            <p className="font-medium mb-1">Once configured, AI buttons appear in two places:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-blue-300/80">
              <li><span className="text-blue-200">Services tab</span> — a "Configure this" button in each service's detail panel</li>
              <li><span className="text-blue-200">Dashboard</span> — a "Fix it" button when a deploy error occurs</li>
            </ul>
          </div>
        </div>

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

// ─── Publish Dir (inline in header) ──────────────────────────────────────────
function PublishDirInline() {
  const qc = useQueryClient()
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const [publishDir, setPublishDir] = useState('')
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState(null)
  const savedTimer = useRef(null)

  useEffect(() => () => clearTimeout(savedTimer.current), [])
  useEffect(() => { if (settings) setPublishDir(settings.publishDir || '') }, [settings])

  async function save() {
    setError(null)
    try {
      await api.saveSettings({ publishDir })
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      savedTimer.current = setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      <label className="text-xs text-gray-400 whitespace-nowrap">Publish Dir</label>
      <input
        value={publishDir}
        onChange={e => setPublishDir(e.target.value)}
        placeholder="e.g. C:\docker\active"
        className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
      />
      <button onClick={save} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs">
        {saved ? 'Saved!' : <Save size={14} />}
      </button>
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </div>
  )
}

// ─── Main Settings Component ──────────────────────────────────────────────────
export default function Settings({ onBack, defaultTab = 'templates', defaultTemplateId = null }) {
  const [tab, setTab] = useState(defaultTab)

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-4 px-6 py-4 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <button onClick={onBack} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-white">Settings</h1>
        <div className="flex gap-1 ml-4">
          {['templates', 'services', 'ai'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded text-sm capitalize transition-colors ${
                tab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}>
              {t === 'ai' ? 'AI' : t}
            </button>
          ))}
        </div>

        {/* App Settings: Publish Dir inline in header */}
        <PublishDirInline />
      </header>

      {tab === 'templates' && <TemplatesTab defaultTemplateId={defaultTemplateId} onAiSettings={() => setTab('ai')} />}
      {tab === 'services'  && <ServicesTab onAiSettings={() => setTab('ai')} />}
      {tab === 'ai'        && <AiSettingsTab />}
    </div>
  )
}
