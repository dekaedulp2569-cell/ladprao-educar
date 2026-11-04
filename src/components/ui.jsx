import { classNames } from '../lib/helpers'

export function StatusBadge({ status, className }) {
  const map = {
    pending: { label: 'รอตรวจสอบ', cls: 'bg-brand-50 text-brand-800 border-brand-200', dot: 'bg-brand-500' },
    tentative: { label: 'รอ ผอ.เขต อนุมัติ', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
    approved: { label: 'อนุมัติแล้ว (ล็อกคิว)', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    rejected: { label: 'ไม่อนุมัติ', cls: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
    cancelled: { label: 'ยกเลิกแล้ว', cls: 'bg-slate-100 text-slate-600 border-slate-300', dot: 'bg-slate-500' },
  }
  const item = map[status] || { label: status || '-', cls: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' }
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        item.cls,
        className,
      )}
    >
      <span className={classNames('h-1.5 w-1.5 rounded-full', item.dot)} />
      {item.label}
    </span>
  )
}

export function Card({ children, className }) {
  return (
    <div className={classNames('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ title, subtitle, action }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-slate-800 sm:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Spinner({ label = 'กำลังโหลดข้อมูล...' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="text-3xl">🗂️</div>
      <p className="font-medium text-slate-700">{title}</p>
      {description ? <p className="max-w-md text-sm text-slate-500">{description}</p> : null}
      {action}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null
  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className={classNames(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl',
          sizes[size],
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? <div className="border-t border-slate-200 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Alert({ tone = 'info', children }) {
  const tones = {
    info: 'border-brand-200 bg-brand-50 text-brand-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    danger: 'border-rose-200 bg-rose-50 text-rose-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }
  return (
    <div className={classNames('rounded-xl border px-4 py-3 text-sm', tones[tone])}>{children}</div>
  )
}
