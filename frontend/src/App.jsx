import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [settingsTab, setSettingsTab] = useState('templates')
  const [settingsTemplateId, setSettingsTemplateId] = useState(null)

  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ['templates'],
    queryFn: api.getTemplates,
  })

  if (isLoading) return <div className="min-h-screen bg-gray-900" />

  if (isError) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-red-400 text-sm">Could not reach the backend. Is the API server running on port 8025?</p>
    </div>
  )

  if (!templates || templates.length === 0) {
    return <Onboarding />
  }

  function openSettings(tab = 'templates', templateId = null) {
    setSettingsTab(tab)
    setSettingsTemplateId(templateId)
    setPage('settings')
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {page === 'dashboard' && <Dashboard onSettings={openSettings} />}
      {page === 'settings' && (
        <Settings
          onBack={() => setPage('dashboard')}
          defaultTab={settingsTab}
          defaultTemplateId={settingsTemplateId}
        />
      )}
    </div>
  )
}
