import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2, Save } from 'lucide-react'
import { api } from '../api'

export default function Settings({ onBack }) {
  const qc = useQueryClient()
  const { data: settings }       = useQuery({ queryKey: ['settings'],  queryFn: api.getSettings })
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: api.getTemplates })

  const [publishDir,   setPublishDir]   = useState('')
  const [selectedId,   setSelectedId]   = useState(null)
  const [templateName, setTemplateName] = useState('')
  const [yamlContent,  setYamlContent]  = useState('')
  const [saved,        setSaved]        = useState(false)

  useEffect(() => { if (settings) setPublishDir(settings.publishDir || '') }, [settings])

  const activeTemplate = templates.find(t => t.id === selectedId) || templates[0]

  useEffect(() => {
    if (!activeTemplate) return
    setSelectedId(activeTemplate.id)
    setTemplateName(activeTemplate.name)
    api.getCompose(activeTemplate.id).then(d => setYamlContent(d?.content || ''))
  }, [activeTemplate?.id])

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  async function saveAppSettings() {
    await api.saveSettings({ publishDir })
    qc.invalidateQueries({ queryKey: ['settings'] })
    flash()
  }

  async function saveTemplate() {
    if (!selectedId) return
    await api.renameTemplate(selectedId, templateName)
    await api.saveCompose(selectedId, yamlContent)
    qc.invalidateQueries({ queryKey: ['templates'] })
    qc.invalidateQueries({ queryKey: ['compose', selectedId] })
    flash()
  }

  async function deleteTemplate() {
    if (!selectedId) return
    if (!confirm(`Delete "${templateName}"? This cannot be undone.`)) return
    await api.deleteTemplate(selectedId)
    qc.invalidateQueries({ queryKey: ['templates'] })
    setSelectedId(null)
    onBack()
  }

  function handleTemplateChange(id) {
    setSelectedId(id)
    const t = templates.find(t => t.id === id)
    if (t) {
      setTemplateName(t.name)
      api.getCompose(id).then(d => setYamlContent(d?.content || ''))
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-4 px-6 py-4 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <button onClick={onBack} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-white">Settings</h1>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-8">

          {/* App Settings */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">App Settings</h2>
            <label className="block text-sm text-gray-300 mb-1">Publish Directory</label>
            <div className="flex gap-2">
              <input
                value={publishDir}
                onChange={e => setPublishDir(e.target.value)}
                placeholder="e.g. C:\docker\active"
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={saveAppSettings}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white"
              >
                <Save size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              docker compose commands run from this directory. The directory must already exist.
            </p>
          </section>

          {/* Template Settings */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Template Settings</h2>

            {templates.length === 0 ? (
              <p className="text-gray-500 text-sm">No templates yet.</p>
            ) : (
              <>
                <select
                  value={selectedId || ''}
                  onChange={e => handleTemplateChange(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none mb-4 w-full"
                >
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>

                <label className="block text-sm text-gray-300 mb-1">Template Name</label>
                <input
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />

                <label className="block text-sm text-gray-300 mb-1">docker-compose.yml</label>
                <textarea
                  value={yamlContent}
                  onChange={e => setYamlContent(e.target.value)}
                  rows={20}
                  spellCheck={false}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-green-400 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                />

                <div className="flex justify-between mt-3">
                  <button
                    onClick={deleteTemplate}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-900 hover:bg-red-800 rounded text-red-300 text-sm transition-colors"
                  >
                    <Trash2 size={14} /> Delete Template
                  </button>
                  <button
                    onClick={saveTemplate}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm font-semibold transition-colors"
                  >
                    {saved ? 'Saved!' : <><Save size={14} /> Save Template</>}
                  </button>
                </div>
              </>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}
