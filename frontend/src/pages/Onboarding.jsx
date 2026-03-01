import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

export default function Onboarding() {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleGetStarted() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      await api.createTemplate('My Stack')
      qc.invalidateQueries({ queryKey: ['templates'] })
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-6 px-4">
      <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
        C
      </div>
      <h1 className="text-3xl font-bold">Controller</h1>
      <p className="text-gray-400 text-center max-w-sm">
        Manage your Docker Compose services without writing YAML.
        Create a template to get started.
      </p>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        onClick={handleGetStarted}
        disabled={loading}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-semibold disabled:opacity-50 transition-colors"
      >
        {loading ? 'Creating…' : 'Get Started'}
      </button>
      <p className="text-gray-600 text-xs absolute bottom-6">
        Controller runs docker compose on your local machine.
      </p>
    </div>
  )
}
