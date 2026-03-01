export default function WarningModal({ containers, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 border border-gray-700 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2">Containers are running</h3>
        <p className="text-gray-400 text-sm mb-4">
          {containers.length} container{containers.length !== 1 ? 's are' : ' is'} currently running.
          Deploying will stop them all.
        </p>
        <details className="mb-4 cursor-pointer">
          <summary className="text-sm text-gray-400 hover:text-white select-none">Show containers</summary>
          <ul className="mt-2 text-sm text-gray-300 space-y-1 pl-2 font-mono">
            {containers.map(c => <li key={c.id}>{c.name}</li>)}
          </ul>
        </details>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-semibold"
          >
            Stop All & Deploy
          </button>
        </div>
      </div>
    </div>
  )
}
