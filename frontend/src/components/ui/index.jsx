import { X } from 'lucide-react'

// ── Modal ─────────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null
  const sizeMap = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-box w-full ${sizeMap[size]}`}>
        <div className="modal-header">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────
export function Spinner({ size = 20, className = '' }) {
  return (
    <svg
      className={`animate-spin text-primary-400 ${className}`}
      width={size} height={size}
      xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ── Page loader ───────────────────────────────────────
export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner size={32} />
    </div>
  )
}

// ── Empty state ───────────────────────────────────────
export function Empty({ message = 'No data found', icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      {icon && <div className="mb-3 opacity-30">{icon}</div>}
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────
const statusMap = {
  PAID:      'badge-green',
  PENDING:   'badge-gold',
  CONFIRMED: 'badge-blue',
  CANCELLED: 'badge-red',
  UNPAID:    'badge-red',
  PARTIAL:   'badge-gold',
  PRESENT:   'badge-green',
  ABSENT:    'badge-red',
  HALF:      'badge-gold',
  LEAVE:     'badge-gray',
  ACTIVE:    'badge-green',
  HIGH:      'badge-green',
  MEDIUM:    'badge-gold',
  LOW:       'badge-gray',
  NEW:       'badge-blue',
  IN:        'badge-green',
  OUT:       'badge-red',
  ADJUST:    'badge-blue',
}

export function StatusBadge({ status }) {
  const cls = statusMap[status] || 'badge-gray'
  return <span className={cls}>{status}</span>
}

// ── Confirm dialog ────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, danger }) {
  if (!open) return null
  return (
    <div className="modal-overlay">
      <div className="bg-white rounded-xl shadow-modal p-6 max-w-sm w-full mx-4">
        <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Search + filter bar ───────────────────────────────
export function SearchBar({ value, onChange, placeholder = 'Search…', children }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="relative flex-1 min-w-[200px]">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input pl-9"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
      </div>
      {children}
    </div>
  )
}

// ── Form field wrapper ────────────────────────────────
export function Field({ label, error, children, required }) {
  return (
    <div className="mb-4">
      {label && (
        <label className="label">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────
export function KpiCard({ title, value, subtitle, icon, color = 'primary', trend }) {
  const colors = {
    primary: 'bg-primary-50 text-primary-500',
    gold:    'bg-gold-50 text-gold-400',
    red:     'bg-red-50 text-red-500',
    blue:    'bg-blue-50 text-blue-500',
  }
  return (
    <div className="kpi-card">
      <div className={`kpi-icon ${colors[color]}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-gray-800 mt-0.5 truncate">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        {trend !== undefined && (
          <p className={`text-xs font-medium mt-0.5 ${trend >= 0 ? 'text-primary-500' : 'text-red-500'}`}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs last month
          </p>
        )}
      </div>
    </div>
  )
}
