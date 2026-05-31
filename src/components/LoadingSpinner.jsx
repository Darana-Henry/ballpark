export default function LoadingSpinner({ message = 'Loading games...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-10 h-10 border-2 border-slate-700 border-t-slate-300 rounded-full animate-spin" />
      <p className="text-slate-500 text-sm">{message}</p>
    </div>
  )
}
