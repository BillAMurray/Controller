import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import WarningModal from './WarningModal'

export default function DeployButton({ templateId, activeTemplateId, runningContainers, disabled }) {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const nothingRunning = runningContainers.length === 0
  const thisIsActive   = activeTemplateId === templateId
  const otherIsActive  = !thisIsActive && runningContainers.length > 0

  const label    = nothingRunning ? 'Deploy' : thisIsActive ? 'Redeploy' : 'Switch & Deploy'
  const btnColor = otherIsActive
    ? 'bg-orange-600 hover:bg-orange-500'
    : 'bg-blue-600 hover:bg-blue-500'

  async function executeDeploy() {
    setLoading(true)
    setError(null)
    try {
      await api.deployTemplate(templateId)
      qc.invalidateQueries({ queryKey: ['status'] })
      qc.invalidateQueries({ queryKey: ['templates'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleClick() {
    if (otherIsActive) { setShowModal(true); return }
    executeDeploy()
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <button
          onClick={handleClick}
          disabled={disabled || loading || !templateId}
          className={`px-4 py-1.5 rounded text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${btnColor}`}
        >
          {loading ? 'Working\u2026' : label}
        </button>
        {error && <span className="text-red-400 text-xs max-w-xs truncate" title={error}>{error}</span>}
      </div>
      {showModal && (
        <WarningModal
          containers={runningContainers}
          onConfirm={() => { setShowModal(false); executeDeploy() }}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  )
}
