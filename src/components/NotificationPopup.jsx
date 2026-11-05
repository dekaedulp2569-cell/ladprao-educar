import { classNames } from '../lib/helpers'

export function NotificationPopup({ open, message, type = 'info', onClose }) {
  if (!open) return null

  const tones = {
    info: 'bg-brand-50 border-brand-200 text-brand-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    danger: 'bg-rose-50 border-rose-200 text-rose-700',
  }

  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    danger: '❌',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        className={classNames(
          'rounded-2xl border p-6 text-sm shadow-2xl max-w-md w-full text-center',
          tones[type],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg mb-2">{icons[type]}</p>
        <p className="font-semibold mb-3 whitespace-pre-line">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mx-auto px-4 py-1.5 text-xs underline hover:opacity-80"
        >
          ปิด
        </button>
      </div>
    </div>
  )
}
