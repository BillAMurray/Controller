export default function StatsBar({ status }) {
  if (!status) return null

  const stats = [
    { label: 'CPU',    value: `${status.cpu}%`,    color: status.cpu    > 80 ? 'text-red-400' : 'text-green-400' },
    { label: 'Memory', value: `${status.memory}%`, color: status.memory > 80 ? 'text-red-400' : 'text-yellow-400' },
    { label: 'Disk',   value: `${status.disk}%`,   color: status.disk   > 90 ? 'text-red-400' : 'text-gray-300' },
  ]

  return (
    <div className="flex items-center gap-6 text-sm">
      {stats.map(s => (
        <span key={s.label} className="flex items-center gap-1">
          <span className="text-gray-400">{s.label}:</span>
          <span className={`font-semibold ${s.color}`}>{s.value}</span>
        </span>
      ))}
      <span className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-gray-700 rounded-full">
        <span className="text-gray-400">Running:</span>
        <span className="font-bold text-white">{status.runningCount}</span>
      </span>
    </div>
  )
}
