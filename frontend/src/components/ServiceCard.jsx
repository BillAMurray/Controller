import { useState } from 'react'
import { Database, Globe, Server, Box, Cpu, Network } from 'lucide-react'

const iconMap = {
  postgres: Database, mysql: Database, redis: Database, mongo: Database,
  nginx: Globe, caddy: Globe, traefik: Globe,
  ollama: Cpu, agent: Box, webui: Globe, litellm: Network,
}

function getIcon(image = '') {
  const lower = image.toLowerCase()
  for (const [key, Icon] of Object.entries(iconMap)) {
    if (lower.includes(key)) return Icon
  }
  return Server
}

export default function ServiceCard({ service, runningContainers, onToggle }) {
  const Icon = getIcon(service.image)
  const isRunning = runningContainers.some(
    c => c.name === service.containerName || c.name === `/${service.containerName}`
  )
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState(null)

  async function handleToggle() {
    setToggling(true)
    setToggleError(null)
    try { await onToggle(service.containerName, isRunning) }
    catch (e) { setToggleError(e.message) }
    finally { setToggling(false) }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 flex flex-col gap-3 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0">
          <Icon size={22} className="text-blue-400" />
        </div>
        <span className="font-semibold text-white truncate">{service.name}</span>
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
            isRunning ? 'bg-green-500' : 'bg-gray-600'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            isRunning ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
        {!isRunning && <span className="text-xs text-gray-500 uppercase tracking-wider">OFF</span>}
        {toggleError && <span className="text-red-400 text-xs truncate max-w-[120px]" title={toggleError}>Error</span>}
      </div>
    </div>
  )
}
