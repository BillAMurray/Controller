import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Settings, Square, RefreshCw, X, Bot } from 'lucide-react'
import { api } from '../api'
import StatsBar from '../components/StatsBar'
import AiChatModal from '../components/AiChatModal'

function isAiConfigured(s) {
  const p = s?.activeAiProvider
  if (!p) return false
  const cfg = s?.aiProviders?.[p]
  if (!cfg?.key?.trim()) return false
  if (p === 'custom' && !cfg?.url?.trim()) return false
  return true
}

// ─── Template Card ────────────────────────────────────────────────────────────
function TemplateCard({ template, isRunning, anyRunning, onSettings, onError }) {
  const qc = useQueryClient()
  const [pulling,   setPulling]   = useState(false)
  const [deploying, setDeploying] = useState(false)

  async function pull() {
    setPulling(true)
    try {
      await api.pullTemplate(template.id)
      qc.invalidateQueries({ queryKey: ['templates'] })
    } catch (e) {
      onError(e.message)
    } finally {
      setPulling(false)
    }
  }

  async function deploy() {
    setDeploying(true)
    try {
      await api.deployTemplate(template.id)
      qc.invalidateQueries({ queryKey: ['status'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['templates'] })
    } catch (e) {
      onError(e.message)
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className={`bg-gray-800 rounded-lg border p-5 flex flex-col gap-4 transition-colors ${
      isRunning ? 'border-green-600' : 'border-gray-700'
    }`}>
      {/* Header: name + running badge + pull button */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-white font-semibold">{template.name}</h3>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              Running
            </span>
          )}
        </div>
        <button
          onClick={pull}
          disabled={pulling || anyRunning}
          title={anyRunning ? 'Stop the running template before pulling' : undefined}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 disabled:opacity-50 transition-colors flex-shrink-0"
        >
          <RefreshCw size={12} className={pulling ? 'animate-spin' : ''} />
          Pull
        </button>
      </div>

      {/* View / modify link */}
      <button
        onClick={() => onSettings('templates', template.id)}
        className="text-sm text-blue-400 hover:text-blue-300 text-left transition-colors"
      >
        View / modify template →
      </button>

      {/* Deploy button */}
      <button
        onClick={deploy}
        disabled={anyRunning || deploying}
        className="w-full py-2 rounded text-sm font-semibold text-white transition-colors bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {deploying ? 'Deploying…' : 'Deploy'}
      </button>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard({ onSettings }) {
  const qc = useQueryClient()
  const [deployError, setDeployError] = useState(null)
  const [aiFixContext, setAiFixContext] = useState(null)

  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: api.getTemplates })
  const { data: status }         = useQuery({ queryKey: ['status'],    queryFn: api.getStatus, refetchInterval: 5000 })
  const { data: settings }       = useQuery({ queryKey: ['settings'],  queryFn: api.getSettings })
  const { data: services = [] }  = useQuery({ queryKey: ['services'],  queryFn: api.getServices })

  const activeTemplateId  = settings?.activeTemplateId
  const anyRunning        = !!activeTemplateId
  const runningContainers = status?.containers ?? []
  const orphaned          = !anyRunning && runningContainers.length > 0

  const stopMutation = useMutation({
    mutationFn: () => api.stopTemplate(activeTemplateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (e) => setDeployError(e.message),
  })

  const forceStopMutation = useMutation({
    mutationFn: () => api.forceStop(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['status'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e) => setDeployError(e.message),
  })

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">C</div>
          <h1 className="text-xl font-bold text-white">Controller</h1>
        </div>
        <div className="flex-1 flex justify-center">
          <StatsBar status={status} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {orphaned ? (
            <button
              onClick={() => forceStopMutation.mutate()}
              disabled={forceStopMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-red-900 rounded text-sm text-white disabled:opacity-40 transition-colors"
            >
              <Square size={14} /> Force Stop
            </button>
          ) : (
            <button
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending || !anyRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-red-900 rounded text-sm text-white disabled:opacity-40 transition-colors"
            >
              <Square size={14} /> Stop
            </button>
          )}
          <button
            onClick={() => onSettings('templates')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300 hover:text-white transition-colors"
          >
            <Settings size={14} /> Settings
          </button>
        </div>
      </header>

      {/* Canvas */}
      <div className="flex-1 overflow-auto p-6">
        {deployError && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-600 rounded-lg flex items-start gap-3">
            <div className="flex-1 text-red-300 text-sm whitespace-pre-wrap break-words">{deployError}</div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isAiConfigured(settings) && (
                <button
                  onClick={() => {
                    const tpl = templates.find(t => t.id === activeTemplateId) || templates[0]
                    const tplServices = tpl
                      ? (tpl.serviceIds || []).map(sid => services.find(s => s.id === sid)).filter(Boolean)
                      : []
                    setAiFixContext({ type: 'fix-error', data: { error: deployError, services: tplServices } })
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-700 hover:bg-blue-600 rounded text-xs text-white transition-colors"
                >
                  <Bot size={12} /> Fix it
                </button>
              )}
              <button onClick={() => setDeployError(null)} className="text-red-400 hover:text-red-300 mt-0.5">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {aiFixContext && (
          <AiChatModal
            context={aiFixContext}
            allServices={services}
            onClose={() => setAiFixContext(null)}
            onApplied={() => qc.invalidateQueries({ queryKey: ['services'] })}
          />
        )}

        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
            <p>No templates yet.</p>
            <p className="text-sm">
              <button onClick={() => onSettings('templates')} className="text-blue-400 hover:underline">
                Open Settings
              </button>{' '}
              to create a template.
            </p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {templates.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  isRunning={t.id === activeTemplateId}
                  anyRunning={anyRunning}
                  onSettings={onSettings}
                  onError={setDeployError}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
