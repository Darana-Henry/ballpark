export default function EmptyState({ emoji = '🎮', title, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
      <span className="text-5xl">{emoji}</span>
      <p className="text-slate-300 font-medium text-lg">{title}</p>
      {message && <p className="text-slate-500 text-sm max-w-xs">{message}</p>}
    </div>
  )
}
