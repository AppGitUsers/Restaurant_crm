import { useState, useEffect, useRef } from 'react'
import { tablesAPI } from '@/api'
import QRCode from 'qrcode'
import {
  Plus, Pencil, Trash2, QrCode, Download, Printer,
  Loader2, AlertTriangle, CheckCircle2, X, TableProperties, LayoutGrid, List, ChefHat,
} from 'lucide-react'
import TablesGridPage from '@/pages/billing/TablesGridPage'

// ── Helpers ───────────────────────────────────────────────────────────────────
function qrUrl(token) {
  return `${window.location.origin}/order/${token}`
}

async function generateQR(token) {
  return QRCode.toDataURL(qrUrl(token), {
    width: 400, margin: 2,
    color: { dark: '#1e3a5f', light: '#ffffff' },
  })
}

// ── QR Modal ──────────────────────────────────────────────────────────────────
function QRModal({ table, onClose }) {
  const [dataUrl, setDataUrl] = useState(null)
  const printRef = useRef()

  useEffect(() => {
    generateQR(table.qr_token).then(setDataUrl)
  }, [table.qr_token])

  const download = () => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `table-${table.number}-qr.png`
    a.click()
  }

  const print = () => {
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head><title>Table ${table.number} QR</title>
      <style>
        body { font-family: sans-serif; display:flex; flex-direction:column;
               align-items:center; justify-content:center; height:100vh; margin:0; gap:12px; }
        img  { width:280px; height:280px; }
        h2   { font-size:1.5rem; color:#1e3a5f; margin:0; }
        p    { font-size:0.85rem; color:#6b7280; margin:0; }
      </style>
      </head><body>
        <img src="${dataUrl}" />
        <h2>Table ${table.number}</h2>
        <p>Scan to order</p>
      </body></html>
    `)
    win.document.close()
    win.focus()
    win.print()
    win.close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-lg">Table {table.number} QR Code</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="flex justify-center bg-gray-50 rounded-xl p-4">
          {dataUrl
            ? <img ref={printRef} src={dataUrl} alt={`Table ${table.number} QR`} className="w-56 h-56" />
            : <div className="w-56 h-56 flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-primary-400" />
              </div>
          }
        </div>

        <p className="text-xs text-gray-400 text-center break-all">{qrUrl(table.qr_token)}</p>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={download}
            disabled={!dataUrl}
            className="btn-secondary flex items-center justify-center gap-2 py-2.5 disabled:opacity-40"
          >
            <Download size={16} /> Download
          </button>
          <button
            onClick={print}
            disabled={!dataUrl}
            className="btn-primary flex items-center justify-center gap-2 py-2.5 disabled:opacity-40"
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
function TableFormModal({ table, onClose, onSaved }) {
  const [number,   setNumber]   = useState(table?.number ?? '')
  const [isActive, setIsActive] = useState(table?.is_active ?? true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (table) {
        await tablesAPI.admin.update(table.id, { number: parseInt(number), is_active: isActive })
      } else {
        await tablesAPI.admin.create({ number: parseInt(number), is_active: isActive })
      }
      onSaved()
      onClose()
    } catch (err) {
      const msg = err?.response?.data?.number?.[0]
             || err?.response?.data?.detail
             || err?.response?.data?.non_field_errors?.[0]
             || 'Failed to save table.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-lg">{table ? 'Edit Table' : 'Add Table'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Table Number</label>
            <input
              type="number"
              min="1"
              max="200"
              value={number}
              onChange={e => setNumber(e.target.value)}
              required
              className="input w-full"
              placeholder="e.g. 1"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-primary-600"
            />
            <span className="text-sm text-gray-700">Active (visible to customers)</span>
          </label>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2">
              {saving && <Loader2 size={15} className="animate-spin" />}
              {table ? 'Save Changes' : 'Add Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Kitchen Form Modal ────────────────────────────────────────────────────────
function KitchenFormModal({ kitchen, onClose, onSaved }) {
  const [name,   setName]   = useState(kitchen?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (kitchen) {
        await tablesAPI.admin.kitchens.update(kitchen.id, { name })
      } else {
        await tablesAPI.admin.kitchens.create({ name })
      }
      onSaved()
      onClose()
    } catch (err) {
      const msg = err?.response?.data?.name?.[0]
             || err?.response?.data?.detail
             || 'Failed to save kitchen.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-lg">{kitchen ? 'Edit Kitchen' : 'Add Kitchen'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle size={15} /> {error}
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kitchen Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="input w-full"
              placeholder="e.g. Main Kitchen, Waffles Station"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2">
              {saving && <Loader2 size={15} className="animate-spin" />}
              {kitchen ? 'Save Changes' : 'Add Kitchen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Kitchen Section ───────────────────────────────────────────────────────────
function KitchensSection() {
  const [kitchens,      setKitchens]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [formKitchen,   setFormKitchen]   = useState(undefined)
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [toast,         setToast]         = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = () => {
    setLoading(true)
    tablesAPI.admin.kitchens.list()
      .then(r => setKitchens(r.data))
      .catch(() => showToast('Failed to load kitchens.', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await tablesAPI.admin.kitchens.delete(deleteTarget.id)
      setDeleteTarget(null)
      showToast(`Kitchen "${deleteTarget.name}" deleted.`)
      load()
    } catch {
      showToast('Cannot delete this kitchen — it may still be in use.', 'error')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <ChefHat size={20} className="text-orange-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Kitchens</h2>
            <p className="text-sm text-gray-500">{kitchens.length} kitchen station{kitchens.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={() => setFormKitchen(null)} className="btn-primary flex items-center gap-2 px-4 py-2.5">
          <Plus size={17} /> Add Kitchen
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="animate-spin text-primary-400" />
        </div>
      ) : kitchens.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3 text-gray-400">
          <ChefHat size={40} />
          <p className="text-sm">No kitchens configured. Add your first kitchen station.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Kitchen Name</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {kitchens.map(k => (
                <tr key={k.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <ChefHat size={15} className="text-orange-400" />
                      <span className="font-semibold text-gray-800">{k.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setFormKitchen(k)} title="Edit"
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                        <Pencil size={17} />
                      </button>
                      <button onClick={() => setDeleteTarget(k)} title="Delete"
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors">
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formKitchen !== undefined && (
        <KitchenFormModal
          kitchen={formKitchen}
          onClose={() => setFormKitchen(undefined)}
          onSaved={() => { load(); showToast(formKitchen ? 'Kitchen updated.' : 'Kitchen added.') }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-800 text-lg">Delete "{deleteTarget.name}"?</h3>
            <p className="text-sm text-gray-500">
              This cannot be undone. Kitchens with assigned food types cannot be deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1 py-2.5">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600
                           disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting && <Loader2 size={15} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2
                         px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white
                         ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminTablesPage() {
  const [section,     setSection]     = useState('tables')  // 'tables' | 'kitchens'
  const [tables,      setTables]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [qrTable,     setQrTable]     = useState(null)
  const [formTable,   setFormTable]   = useState(undefined)  // undefined=closed, null=new, obj=edit
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,    setDeleting]    = useState(false)
  const [toast,       setToast]       = useState(null)
  const [showLive,    setShowLive]    = useState(false)

  const load = () => {
    setLoading(true)
    tablesAPI.admin.list()
      .then(r => { setTables(r.data); setError(null) })
      .catch(() => setError('Failed to load tables.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await tablesAPI.admin.delete(deleteTarget.id)
      setDeleteTarget(null)
      showToast(`Table ${deleteTarget.number} deleted.`)
      load()
    } catch (err) {
      const msg = err?.response?.data?.error || 'Cannot delete this table.'
      showToast(msg, 'error')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  if (showLive) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 px-4 pt-4 pb-2 border-b border-gray-100">
          <button
            onClick={() => setShowLive(false)}
            className="flex items-center gap-2 text-sm font-semibold text-primary-600
                       hover:text-primary-800 transition-colors"
          >
            <List size={16} /> Back to Table List
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <LayoutGrid size={15} className="text-primary-500" /> Live Tables
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <TablesGridPage />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Section tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { id: 'tables',   label: 'Tables',   icon: <TableProperties size={14} /> },
          { id: 'kitchens', label: 'Kitchens', icon: <ChefHat size={14} /> },
        ].map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all
              ${section === s.id ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {section === 'kitchens' && <KitchensSection />}

      {section === 'tables' && <>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <TableProperties size={20} className="text-primary-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Tables</h1>
            <p className="text-sm text-gray-500">{tables.length} table{tables.length !== 1 ? 's' : ''} configured</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLive(true)}
            className="flex items-center gap-2 btn-secondary px-4 py-2.5"
          >
            <LayoutGrid size={16} /> Live Tables
          </button>
          <button
            onClick={() => setFormTable(null)}
            className="btn-primary flex items-center gap-2 px-4 py-2.5"
          >
            <Plus size={17} /> Add Table
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={30} className="animate-spin text-primary-400" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-gray-400">
          <AlertTriangle size={32} className="text-red-400" />
          <p className="text-sm">{error}</p>
          <button onClick={load} className="btn-secondary text-sm px-4 py-2">Retry</button>
        </div>
      ) : tables.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-gray-400">
          <TableProperties size={40} />
          <p className="text-sm">No tables yet. Add your first table.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Table</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Sessions</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tables.map(t => (
                <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="font-bold text-gray-800">Table {t.number}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                      ${t.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                      }`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {t.session_count} billed
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setQrTable(t)}
                        title="View QR Code"
                        className="p-1.5 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                      >
                        <QrCode size={17} />
                      </button>
                      <button
                        onClick={() => setFormTable(t)}
                        title="Edit"
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(t)}
                        title="Delete"
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* QR Modal */}
      {qrTable && (
        <QRModal table={qrTable} onClose={() => setQrTable(null)} />
      )}

      {/* Add / Edit Modal */}
      {formTable !== undefined && (
        <TableFormModal
          table={formTable}
          onClose={() => setFormTable(undefined)}
          onSaved={() => { load(); showToast(formTable ? 'Table updated.' : 'Table added.') }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-800 text-lg">Delete Table {deleteTarget.number}?</h3>
            <p className="text-sm text-gray-500">
              This cannot be undone. Tables with an open session cannot be deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1 py-2.5">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600
                           disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting && <Loader2 size={15} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2
                         px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white
                         ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.type === 'error'
            ? <AlertTriangle size={16} />
            : <CheckCircle2 size={16} />}
          {toast.msg}
        </div>
      )}
      </>}
    </div>
  )
}
