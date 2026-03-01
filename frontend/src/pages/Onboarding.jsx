import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { api } from '../api'

export default function Onboarding() {
  const qc = useQueryClient()
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)

  async function handleFile(file) {
    setError(null)
    try {
      await api.uploadTemplate('My Template', file)
      qc.invalidateQueries({ queryKey: ['templates'] })
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleGetStarted() {
    setError(null)
    try {
      await api.createEmptyTemplate('My Template')
      qc.invalidateQueries({ queryKey: ['templates'] })
    } catch (e) {
      setError(e.message)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-6 text-white">
      <div
        className={`border-2 border-dashed rounded-lg p-12 w-96 text-center cursor-pointer transition-colors ${
          dragging ? 'border-blue-400 bg-blue-900/20' : 'border-gray-500 hover:border-gray-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
      >
        <h2 className="text-xl font-bold mb-4">Import docker-compose.yaml</h2>
        <Upload className="mx-auto mb-3 text-gray-400" size={48} />
        <p className="text-xs text-gray-400 uppercase tracking-widest">Drag and drop or click to upload</p>
        <input
          ref={inputRef}
          type="file"
          accept=".yml,.yaml"
          className="hidden"
          onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]) }}
        />
      </div>
      <p className="text-gray-400">
        or, skip and click here to{' '}
        <button
          onClick={handleGetStarted}
          className="ml-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white"
        >
          Get Started
        </button>
      </p>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <p className="text-xs text-gray-500 absolute bottom-6">
        <strong>Developer Note</strong>: Uploading the .yaml file will pre-populate the repository with any existing volumes and services.
      </p>
    </div>
  )
}
