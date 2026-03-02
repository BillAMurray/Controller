// frontend/src/components/AiChatModal.jsx
import { useState, useEffect, useRef } from 'react'
import { X, Bot, Send, Check } from 'lucide-react'
import { aiChatStream, api } from '../api'

const DISCLAIMER = "Even AI can make mistakes — review changes before applying."

// Parse text that may contain ~~~action ... ~~~ blocks.
// Returns an array of parts: { type: 'text', content } | { type: 'action', action }
function parseMessage(text) {
  const parts = []
  const regex = /~~~action\s*([\s\S]*?)~~~/g
  let last = 0, match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', content: text.slice(last, match.index) })
    try {
      parts.push({ type: 'action', action: JSON.parse(match[1].trim()) })
    } catch {
      parts.push({ type: 'text', content: match[0] })
    }
    last = regex.lastIndex
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) })
  return parts
}

function ActionCard({ action, allServices, onApplied }) {
  const [state, setState] = useState('idle') // idle | applying | applied | error
  const [errMsg, setErrMsg] = useState(null)
  const svc = allServices?.find(s => s.id === action.service_id)
  const svcName = svc?.name || action.service_id

  async function apply() {
    setState('applying')
    try {
      await api.updateService(action.service_id, { [action.field]: action.new })
      setState('applied')
      onApplied?.()
    } catch (e) {
      setErrMsg(e.message)
      setState('error')
    }
  }

  return (
    <div className="mt-2 rounded border border-blue-700 bg-blue-900/20 p-3 text-sm">
      <p className="text-blue-300 font-semibold mb-1">Proposed change to {svcName}</p>
      <p className="text-gray-300 font-mono text-xs mb-2">
        {action.field}: {JSON.stringify(action.old)} → {JSON.stringify(action.new)}
      </p>
      {state === 'idle' && (
        <div className="flex gap-2">
          <button onClick={apply}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs">
            Apply this change
          </button>
        </div>
      )}
      {state === 'applying' && <span className="text-gray-400 text-xs">Applying…</span>}
      {state === 'applied' && (
        <span className="flex items-center gap-1 text-green-400 text-xs"><Check size={12} /> Applied</span>
      )}
      {state === 'error' && <span className="text-red-400 text-xs">{errMsg}</span>}
    </div>
  )
}

function MessageBubble({ msg, allServices, onApplied }) {
  const isUser = msg.role === 'user'
  const parts = isUser ? [{ type: 'text', content: msg.content }] : parseMessage(msg.content)

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
        isUser ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'
      }`}>
        {parts.map((p, i) =>
          p.type === 'text'
            ? <p key={i} className="whitespace-pre-wrap">{p.content}</p>
            : <ActionCard key={i} action={p.action} allServices={allServices} onApplied={onApplied} />
        )}
      </div>
    </div>
  )
}

export default function AiChatModal({ context, allServices, onClose, onApplied }) {
  const [messages,     setMessages]     = useState([])
  const [streaming,    setStreaming]     = useState(false)
  const [input,        setInput]        = useState('')
  const [error,        setError]        = useState(null)
  const [showClose,    setShowClose]    = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const bottomRef   = useRef(null)
  const abortRef    = useRef(null)
  const hasAiMsg    = messages.some(m => m.role === 'assistant')

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (context.type === 'fix-error') {
      fireAi([])
    }
    return () => abortRef.current?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasAiMsg && !showClose) setShowClose(true)
  }, [hasAiMsg, showClose])

  function fireAi(msgs) {
    setStreaming(true)
    setError(null)
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])
    let accumulated = ''
    abortRef.current = aiChatStream({
      context,
      messages: msgs,
      onChunk: chunk => {
        accumulated += chunk
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: accumulated }
          return next
        })
      },
      onDone: () => setStreaming(false),
      onError: msg => { setError(msg); setStreaming(false) },
    })
  }

  function send() {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    fireAi(newMessages)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function handleClose() {
    if (streaming) { abortRef.current?.() }
    onClose()
  }

  const title = context.type === 'fix-error' ? 'Fix Error' : `Configure ${context.data?.service?.name || 'Service'}`

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl flex flex-col" style={{ height: '70vh' }}>

        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-blue-400" />
            <span className="text-sm font-semibold text-gray-200">{title}</span>
          </div>
          <button onClick={handleClose} className="p-1 text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-2 bg-yellow-900/20 border-b border-yellow-800/40 flex-shrink-0">
          <p className="text-xs text-yellow-500">{DISCLAIMER}</p>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {messages.length === 0 && !streaming && (
            <p className="text-gray-500 text-sm text-center mt-8">
              {context.type === 'configure-service'
                ? `What would you like to configure for ${context.data?.service?.name || 'this service'}?`
                : 'Analyzing error…'}
            </p>
          )}
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              msg={m}
              allServices={allServices}
              onApplied={onApplied}
            />
          ))}
          {error && (
            <div className="text-red-400 text-sm text-center my-2">{error}</div>
          )}
          <div ref={bottomRef} />
        </div>

        {confirmClose ? (
          <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between flex-shrink-0">
            <span className="text-sm text-gray-300">Are you ready to try this?</span>
            <div className="flex gap-2">
              <button onClick={handleClose}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs">
                Yes, close
              </button>
              <button onClick={() => setConfirmClose(false)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-xs">
                No — keep chatting
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 border-t border-gray-700 flex gap-2 flex-shrink-0">
            {showClose && (
              <button onClick={() => setConfirmClose(true)}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-400 hover:text-white text-xs whitespace-nowrap">
                Done
              </button>
            )}
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={streaming ? 'Waiting for response…' : 'Ask a question…'}
              disabled={streaming}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            />
            <button onClick={send} disabled={streaming || !input.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-500 rounded text-white disabled:opacity-40">
              <Send size={16} />
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
