import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsAPI, notificationsAPI } from '@/api'
import { Field, Empty } from '@/components/ui'
import toast from 'react-hot-toast'
import {
  Building2, Phone, Mail, MapPin, FileText,
  Percent, Smartphone, Key, Hash,
  MessageCircle, Bell, BellOff, CheckCircle2, XCircle,
  Clock, Save, Settings, Package, Users,
  ChevronLeft, ChevronRight, Eye, EyeOff,
} from 'lucide-react'
import { format } from 'date-fns'

// ── Reusable toggle switch ────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none
        ${checked ? 'bg-primary-500' : 'bg-gray-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200
          ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  )
}

// ── Settings row — responsive (label above on mobile) ─────
function SettingRow({ icon: Icon, label, hint, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start py-3.5 border-b border-gray-100 last:border-0 gap-1.5 sm:gap-6">
      <div className="flex items-center gap-2 sm:w-56 sm:flex-shrink-0 sm:pt-1">
        {Icon && <Icon size={15} className="text-primary-400 flex-shrink-0" />}
        <div>
          <div className="text-sm font-medium text-gray-700">{label}</div>
          {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
        </div>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

// ── Automation toggle row ─────────────────────────────────
function AutoToggleRow({ icon: Icon, label, description, checked, onChange, saving }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
          ${checked ? 'bg-primary-100' : 'bg-gray-100'}`}>
          <Icon size={16} className={checked ? 'text-primary-600' : 'text-gray-400'} />
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-800">{label}</div>
          <div className="text-xs text-gray-400 mt-0.5">{description}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
        <span className={`text-xs font-semibold ${checked ? 'text-primary-600' : 'text-gray-400'}`}>
          {checked ? 'ON' : 'OFF'}
        </span>
        <Toggle checked={checked} onChange={onChange} disabled={saving} />
      </div>
    </div>
  )
}

// ── Notification status badge ─────────────────────────────
function StatusPill({ status }) {
  const map = {
    SENT:    { cls: 'bg-green-100 text-green-700',   label: 'Sent'    },
    PENDING: { cls: 'bg-yellow-100 text-yellow-700', label: 'Pending' },
    FAILED:  { cls: 'bg-red-100 text-red-600',       label: 'Failed'  },
  }
  const s = map[status] || map.PENDING
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>
      {status === 'SENT'    && <CheckCircle2 size={11} />}
      {status === 'FAILED'  && <XCircle size={11} />}
      {status === 'PENDING' && <Clock size={11} />}
      {s.label}
    </span>
  )
}

function TypePill({ type }) {
  const map = {
    BILL:         { cls: 'bg-blue-100 text-blue-700',     label: 'Bill'         },
    ABSENT_STAFF: { cls: 'bg-orange-100 text-orange-700', label: 'Absent–Staff' },
    ABSENT_ADMIN: { cls: 'bg-red-100 text-red-700',       label: 'Absent–Admin' },
    LOW_STOCK:    { cls: 'bg-purple-100 text-purple-700', label: 'Low Stock'    },
  }
  const t = map[type] || { cls: 'bg-gray-100 text-gray-600', label: type }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.cls}`}>{t.label}</span>
  )
}

// ══════════════════════════════════════════════════════════
// Main SettingsPage
// ══════════════════════════════════════════════════════════
export default function SettingsPage() {
  const qc  = useQueryClient()
  const [tab, setTab] = useState('general')

  const { data: raw, isLoading } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn:  () => settingsAPI.get().then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: patch => settingsAPI.update(patch),
    onSuccess:  () => { qc.invalidateQueries(['restaurant-settings']); toast.success('Settings saved') },
    onError:    () => toast.error('Failed to save settings'),
  })

  const tabs = [
    { id: 'general',       label: 'General',       icon: <Building2 size={15} /> },
    { id: 'whatsapp',      label: 'WhatsApp',       icon: <MessageCircle size={15} /> },
    { id: 'notifications', label: 'Notifications',  icon: <Bell size={15} /> },
  ]

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Loading settings…</div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Company info, tax rates, WhatsApp automation</p>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1 mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit min-w-max">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                ${tab === t.id ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'general'       && <GeneralTab       data={raw} save={saveMutation} />}
      {tab === 'whatsapp'      && <WhatsAppTab      data={raw} save={saveMutation} />}
      {tab === 'notifications' && <NotificationsTab />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Tab 1 — General (Company + Tax)
// ══════════════════════════════════════════════════════════
function GeneralTab({ data, save }) {
  const [form, setForm] = useState({})

  useEffect(() => {
    if (data) setForm({
      company_name:    data.company_name    || '',
      company_phone:   data.company_phone   || '',
      company_email:   data.company_email   || '',
      company_address: data.company_address || '',
      gstin:           data.gstin           || '',
      gst_rate:        data.gst_rate        ?? 5,
    })
  }, [data])

  const f = (key, val) => setForm(p => ({ ...p, [key]: val }))

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Company Information */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Building2 size={17} className="text-primary-500" /> Company Information
        </h2>
        <div>
          <SettingRow icon={Building2} label="Company Name" hint="Used in PDF bills and WhatsApp messages">
            <input className="input w-full" value={form.company_name || ''} onChange={e => f('company_name', e.target.value)} placeholder="My Restaurant" />
          </SettingRow>
          <SettingRow icon={Phone} label="Company Phone">
            <input className="input w-full" value={form.company_phone || ''} onChange={e => f('company_phone', e.target.value)} placeholder="+91 98765 43210" />
          </SettingRow>
          <SettingRow icon={Mail} label="Company Email">
            <input type="email" className="input w-full" value={form.company_email || ''} onChange={e => f('company_email', e.target.value)} placeholder="contact@restaurant.com" />
          </SettingRow>
          <SettingRow icon={MapPin} label="Address" hint="Full address shown on invoices">
            <textarea className="input w-full resize-none" rows={2} value={form.company_address || ''} onChange={e => f('company_address', e.target.value)} placeholder="123 Food Street, City - 600001" />
          </SettingRow>
          <SettingRow icon={Hash} label="GSTIN" hint="GST Identification Number">
            <input className="input w-full font-mono uppercase" value={form.gstin || ''} onChange={e => f('gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} />
          </SettingRow>
        </div>
      </div>

      {/* Tax / GST Settings */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Percent size={17} className="text-primary-500" /> Tax &amp; GST Settings
        </h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm min-w-[400px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold w-40">Field</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold">Value</th>
                <th className="text-left px-4 py-3 text-gray-500 font-semibold hidden sm:table-cell">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-700">GST Rate</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="number" step="0.01" min="0" max="100"
                      className="input w-24 text-center font-semibold text-primary-600"
                      value={form.gst_rate ?? ''}
                      onChange={e => f('gst_rate', e.target.value)}
                    />
                    <span className="text-gray-500 font-medium">%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell">Applied to every new bill as the default tax percentage</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-700">GSTIN</td>
                <td className="px-4 py-3">
                  <input
                    className="input w-full max-w-[200px] font-mono uppercase"
                    value={form.gstin || ''}
                    onChange={e => f('gstin', e.target.value.toUpperCase())}
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell">Printed on tax invoices for GST compliance</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
          <FileText size={12} />
          The GST rate set here is used as the default tax rate on all new bills generated.
        </p>
      </div>

      <div className="flex justify-end">
        <button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary px-6">
          <Save size={15} />
          {save.isPending ? 'Saving…' : 'Save General Settings'}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Tab 2 — WhatsApp Config + Automation Toggles
// ══════════════════════════════════════════════════════════
function WhatsAppTab({ data, save }) {
  const [form, setForm]     = useState({})
  const [showToken, setShowToken] = useState(false)

  useEffect(() => {
    if (data) setForm({
      admin_whatsapp:          data.admin_whatsapp          || '',
      wa_api_token:            data.wa_api_token            || '',
      wa_phone_id:             data.wa_phone_id             || '',
      wa_billing_enabled:      data.wa_billing_enabled      ?? false,
      wa_absent_staff_enabled: data.wa_absent_staff_enabled ?? false,
      wa_absent_admin_enabled: data.wa_absent_admin_enabled ?? false,
      wa_low_stock_enabled:    data.wa_low_stock_enabled    ?? false,
    })
  }, [data])

  const f   = (key, val) => setForm(p => ({ ...p, [key]: val }))
  const tog = (key) => {
    const next = { ...form, [key]: !form[key] }
    setForm(next)
    save.mutate({ [key]: !form[key] })
  }

  const configured = !!(form.wa_api_token && form.wa_phone_id)

  return (
    <div className="space-y-6 max-w-4xl">
      {/* API Credentials */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <Smartphone size={17} className="text-primary-500" /> WhatsApp API Configuration
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Uses Meta WhatsApp Cloud API. Get credentials from
          <span className="font-medium text-gray-500"> Meta Business Suite → WhatsApp → API Setup</span>.
        </p>

        {!configured && (
          <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-700">
            <BellOff size={15} />
            API credentials not configured — WhatsApp messages will be queued but not sent.
          </div>
        )}
        {configured && (
          <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-sm text-green-700">
            <CheckCircle2 size={15} />
            API credentials configured. Toggle automations below to activate.
          </div>
        )}

        <div>
          <SettingRow icon={Phone} label="Admin WhatsApp" hint="Receives absent & low-stock alerts">
            <input
              className="input w-full"
              value={form.admin_whatsapp || ''}
              onChange={e => f('admin_whatsapp', e.target.value)}
              placeholder="919876543210  (with country code)"
            />
          </SettingRow>
          <SettingRow icon={Key} label="API Token" hint="Bearer token from Meta">
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                className="input w-full pr-10 font-mono text-xs"
                value={form.wa_api_token || ''}
                onChange={e => f('wa_api_token', e.target.value)}
                placeholder="EAAxxxxxxxx…"
              />
              <button
                type="button"
                onClick={() => setShowToken(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </SettingRow>
          <SettingRow icon={Hash} label="Phone Number ID" hint="From Meta → WhatsApp → Getting Started">
            <input
              className="input w-full font-mono"
              value={form.wa_phone_id || ''}
              onChange={e => f('wa_phone_id', e.target.value)}
              placeholder="1234567890123456"
            />
          </SettingRow>
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={() => save.mutate({
              admin_whatsapp: form.admin_whatsapp,
              wa_api_token:   form.wa_api_token,
              wa_phone_id:    form.wa_phone_id,
            })}
            disabled={save.isPending}
            className="btn-primary"
          >
            <Save size={15} />
            {save.isPending ? 'Saving…' : 'Save API Config'}
          </button>
        </div>
      </div>

      {/* Automation Toggles */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <Bell size={17} className="text-primary-500" /> WhatsApp Automation
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Each toggle immediately saves. Notifications are queued in the Notification log before being sent.
        </p>

        <AutoToggleRow
          icon={MessageCircle}
          label="Bill after Payment"
          description="Send an itemised bill to the customer's WhatsApp number after a payment is confirmed."
          checked={!!form.wa_billing_enabled}
          onChange={() => tog('wa_billing_enabled')}
          saving={save.isPending}
        />
        <AutoToggleRow
          icon={Users}
          label="Absent Notification to Staff"
          description="Send an absent alert to the staff member's WhatsApp when auto-marked absent by the scheduler."
          checked={!!form.wa_absent_staff_enabled}
          onChange={() => tog('wa_absent_staff_enabled')}
          saving={save.isPending}
        />
        <AutoToggleRow
          icon={Smartphone}
          label="Absent Alert to Admin"
          description="Notify the admin WhatsApp number whenever a staff member is auto-marked absent."
          checked={!!form.wa_absent_admin_enabled}
          onChange={() => tog('wa_absent_admin_enabled')}
          saving={save.isPending}
        />
        <AutoToggleRow
          icon={Package}
          label="Low Stock Alert to Admin"
          description="Send a consolidated low-stock report to admin WhatsApp every 6 hours when stock is below minimum threshold."
          checked={!!form.wa_low_stock_enabled}
          onChange={() => tog('wa_low_stock_enabled')}
          saving={save.isPending}
        />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Tab 3 — Notification Log
// ══════════════════════════════════════════════════════════
function NotificationsTab() {
  const [page, setPage] = useState(1)
  const [filterType,   setFilterType]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page, filterType, filterStatus],
    queryFn:  () => notificationsAPI.list({ page, notification_type: filterType || undefined, status: filterStatus || undefined })
                      .then(r => r.data),
    keepPreviousData: true,
  })

  const rows  = data?.results || data || []
  const count = data?.count   || rows.length
  const pages = data?.count ? Math.ceil(data.count / 20) : 1

  const { data: statsData } = useQuery({
    queryKey: ['notification-stats'],
    queryFn:  () => notificationsAPI.stats().then(r => r.data),
  })
  const stats = statsData || []

  const totalSent    = stats.filter(s => s.status === 'SENT').reduce((a, s) => a + s.count, 0)
  const totalFailed  = stats.filter(s => s.status === 'FAILED').reduce((a, s) => a + s.count, 0)
  const totalPending = stats.filter(s => s.status === 'PENDING').reduce((a, s) => a + s.count, 0)

  return (
    <div className="max-w-6xl space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Sent',    value: totalSent,    icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
          { label: 'Failed',  value: totalFailed,  icon: XCircle,      color: 'text-red-500 bg-red-50'    },
          { label: 'Pending', value: totalPending, icon: Clock,        color: 'text-yellow-600 bg-yellow-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card flex items-center gap-3 p-3 sm:p-5">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-gray-800">{value}</div>
              <div className="text-xs text-gray-400">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select className="select w-40" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }}>
          <option value="">All Types</option>
          <option value="BILL">Bill</option>
          <option value="ABSENT_STAFF">Absent–Staff</option>
          <option value="ABSENT_ADMIN">Absent–Admin</option>
          <option value="LOW_STOCK">Low Stock</option>
        </select>
        <select className="select w-36" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
        </select>
        <span className="text-sm text-gray-400 self-center">{count} total</span>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Recipient</th>
              <th>Message</th>
              <th>Reference</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={6}><Empty message="No notifications yet" /></td></tr>}
            {rows.map(n => (
              <tr key={n.id}>
                <td><TypePill type={n.notification_type} /></td>
                <td className="font-mono text-sm">{n.recipient_phone}</td>
                <td className="max-w-xs">
                  <p className="text-sm text-gray-700 whitespace-pre-line">{n.message}</p>
                  {n.error_message && (
                    <p className="text-xs text-red-400 mt-0.5 truncate">{n.error_message}</p>
                  )}
                </td>
                <td className="text-xs text-gray-400 font-mono">{n.reference || '—'}</td>
                <td><StatusPill status={n.status} /></td>
                <td className="text-xs text-gray-400">
                  {n.created_at ? format(new Date(n.created_at), 'dd MMM, HH:mm') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {isLoading && <p className="text-center py-8 text-gray-400">Loading…</p>}
        {!isLoading && rows.length === 0 && <Empty message="No notifications yet" />}
        {rows.map(n => (
          <div key={n.id} className="card flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <TypePill type={n.notification_type} />
                <StatusPill status={n.status} />
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {n.created_at ? format(new Date(n.created_at), 'dd MMM, HH:mm') : '—'}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">To: <span className="font-mono text-gray-600">{n.recipient_phone}</span></p>
              {n.reference && <p className="text-xs text-gray-400">Ref: <span className="font-mono">{n.reference}</span></p>}
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Message</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{n.message}</p>
              {n.error_message && (
                <p className="text-xs text-red-400 mt-1">{n.error_message}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost p-2 disabled:opacity-40">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-600">Page {page} of {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-ghost p-2 disabled:opacity-40">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
