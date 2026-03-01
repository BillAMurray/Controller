import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import { api } from '../api'
import StatsBar from '../components/StatsBar'
import ServiceCard from '../components/ServiceCard'
import DeployButton from '../components/DeployButton'
import PullButton from '../components/PullButton'

export default function Dashboard({ onSettings }) {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)

  const { data: templates = [] }    = useQuery({ queryKey: ['templates'], queryFn: api.getTemplates })
  const { data: status }            = useQuery({ queryKey: ['status'],    queryFn: api.getStatus, refetchInterval: 5000 })
  const { data: settings }          = useQuery({ queryKey: ['settings'],  queryFn: api.getSettings })
  const { data: allServices = [] }  = useQuery({ queryKey: ['services'],  queryFn: api.getServices })

  const activeId       = selectedId || templates[0]?.id
  const activeTemplate = templates.find(t => t.id === activeId)

  const localImages       = status?.localImages || []
  const runningContainers = status?.containers  || []

  const serviceIds     = activeTemplate?.serviceIds || []
  const activeServices = allServices.filter(s => serviceIds.includes(s.id))

  const stopMutation = useMutation({
    mutationFn: () => api.stopTemplate(activeId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['status'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['templates'] })
    },
  })

  async function handleToggleContainer(containerName, isRunning) {
    if (isRunning) await api.stopContainer(containerName)
    else           await api.startContainer(containerName)
    qc.invalidateQueries({ queryKey: ['status'] })
  }

  const canStop = settings?.activeTemplateId === activeId

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">C</div>
          <h1 className="text-xl font-bold text-white">Controller</h1>
        </div>
        <StatsBar status={status} />
        <button onClick={() => onSettings('templates')} className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
          <Settings size={20} />
        </button>
      </header>

      {/* Template action bar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-gray-800/50 border-b border-gray-700 flex-shrink-0 flex-wrap">
        <span className="text-gray-400 text-sm">Template</span>
        <select
          value={activeId || ''}
          onChange={e => setSelectedId(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <div className="flex items-center gap-2 ml-2 flex-wrap">
          <DeployButton
            templateId={activeId}
            activeTemplateId={settings?.activeTemplateId}
            runningContainers={runningContainers}
            disabled={!activeId}
          />
          <button
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending || !canStop}
            className="px-3 py-1.5 bg-gray-700 hover:bg-red-900 rounded text-sm text-white disabled:opacity-40 transition-colors"
          >
            {stopMutation.isPending ? 'Stopping…' : 'Stop'}
          </button>
          <PullButton
            templateId={activeId}
            lastPulled={activeTemplate?.lastPulled}
            lastPulledAll={settings?.lastPulledAll}
          />
        </div>
      </div>

      {/* Service canvas */}
      <div className="flex-1 overflow-auto p-6">
        {activeServices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
            <p>No services in this template.</p>
            <p className="text-sm">
              <button onClick={() => onSettings('templates')} className="text-blue-400 hover:underline">
                Open Settings
              </button>{' '}
              to add services.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeServices.map(s => {
              const imageMissing = !localImages.some(li =>
                li === s.image || li.split(':')[0] === s.image.split(':')[0]
              )
              return (
                <ServiceCard
                  key={s.id}
                  service={s}
                  runningContainers={runningContainers}
                  onToggle={handleToggleContainer}
                  imageMissing={imageMissing}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
