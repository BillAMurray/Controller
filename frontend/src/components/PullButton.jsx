import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { api } from '../api'

function fmtDate(d) {
  if (!d) return 'Never'
  const parsed = new Date(d)
  if (isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function PullButton({ templateId, lastPulled, lastPulledAll }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(null) // 'template' | 'all' | null
  const [toast, setToast] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function pull(type) {
    setOpen(false)
    setLoading(type)
    try {
      if (type === 'template') await api.pullTemplate(templateId)
      else await api.pullAll()
      qc.invalidateQueries({ queryKey: ['templates'] })
      qc.invalidateQueries({ queryKey: ['settings'] })
      showToast(type === 'template' ? 'Pull complete' : 'All templates pulled')
    } catch (e) {
      showToast(`Pull failed: ${e.message}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={!!loading}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white disabled:opacity-40 transition-colors"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        Pull
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20">
          <button
            onClick={() => pull('template')}
            className="w-full text-left px-4 py-3 hover:bg-gray-700 rounded-t-lg text-sm"
          >
            <div className="font-medium text-white">Pull this template</div>
            <div className="text-xs text-gray-400 mt-0.5">Last: {fmtDate(lastPulled)}</div>
          </button>
          <hr className="border-gray-700" />
          <button
            onClick={() => pull('all')}
            className="w-full text-left px-4 py-3 hover:bg-gray-700 rounded-b-lg text-sm"
          >
            <div className="font-medium text-white">Pull all</div>
            <div className="text-xs text-gray-400 mt-0.5">Last: {fmtDate(lastPulledAll)}</div>
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-800 border border-gray-700 text-white text-sm px-4 py-2 rounded shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
