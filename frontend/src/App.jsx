import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, Settings as SettingsIcon } from 'lucide-react'
import { api } from './api'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: api.getTemplates,
  })

  if (isLoading) return <div className="min-h-screen bg-gray-900" />

  if (!templates || templates.length === 0) {
    return <Onboarding />
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      <aside className="w-16 bg-gray-800 flex flex-col items-center py-4 gap-2 border-r border-gray-700">
        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm mb-4">
          C
        </div>
        <button
          title="Dashboard"
          onClick={() => setPage('dashboard')}
          className={`p-2.5 rounded-lg transition-colors ${page === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
        >
          <LayoutDashboard size={20} />
        </button>
        <div className="flex-1" />
        <button
          title="Settings"
          onClick={() => setPage('settings')}
          className={`p-2.5 rounded-lg transition-colors ${page === 'settings' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
        >
          <SettingsIcon size={20} />
        </button>
      </aside>
      <main className="flex-1 overflow-hidden">
        {page === 'dashboard' && <Dashboard onSettings={() => setPage('settings')} />}
        {page === 'settings' && <Settings onBack={() => setPage('dashboard')} />}
      </main>
    </div>
  )
}
