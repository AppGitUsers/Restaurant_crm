import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryAPI, menuAPI } from '@/api'
import { PageLoader, Modal, SearchBar, StatusBadge, ConfirmDialog, Field, Empty } from '@/components/ui'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, Package, Truck, FileText, CreditCard, AlertTriangle } from 'lucide-react'

// ── Vendor Tab ────────────────────────────────────────
function VendorTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [sel, setSel]       = useState(null)
  const [del, setDel]       = useState(null)
  const [form, setForm]     = useState({ name: '', contact_name: '', phone: '', email: '', address: '', gstin: '' })

  const { data, isLoading } = useQuery({ queryKey: ['vendors', search], queryFn: () => inventoryAPI.vendors.list({ search }).then(r => r.data.results || r.data) })
  const save   = useMutation({ mutationFn: d => sel ? inventoryAPI.vendors.update(sel.id, d) : inventoryAPI.vendors.create(d), onSuccess: () => { qc.invalidateQueries(['vendors']); setModal(false); toast.success('Saved!') } })
  const remove = useMutation({ mutationFn: id => inventoryAPI.vendors.delete(id), onSuccess: () => { qc.invalidateQueries(['vendors']); setDel(null); toast.success('Deleted') } })
  const openCreate = () => { setSel(null); setForm({ name: '', contact_name: '', phone: '', email: '', address: '', gstin: '' }); setModal(true) }
  const openEdit   = v => { setSel(v); setForm({ name: v.name, contact_name: v.contact_name, phone: v.phone, email: v.email, address: v.address, gstin: v.gstin }); setModal(true) }
  const vendors = data || []

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search vendors…">
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Vendor</button>
      </SearchBar>
      <div className="table-container">
        <table className="table">
          <thead><tr><th>Vendor</th><th>Contact</th><th>Phone</th><th>GSTIN</th><th>Invoices</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {vendors.map(v => (
              <tr key={v.id}>
                <td><p className="font-medium">{v.name}</p><p className="text-xs text-gray-400">{v.email}</p></td>
                <td>{v.contact_name || '—'}</td>
                <td>{v.phone}</td>
                <td>{v.gstin || '—'}</td>
                <td>{v.invoice_count}</td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(v)} className="btn-ghost py-1"><Edit2 size={13} /></button>
                    <button onClick={() => setDel(v)} className="btn-ghost py-1 text-red-400"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && vendors.length === 0 && <tr><td colSpan={6}><Empty message="No vendors" /></td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={sel ? 'Edit Vendor' : 'Add Vendor'}
        footer={<><button onClick={() => setModal(false)} className="btn-ghost">Cancel</button><button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">Save</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Contact Name"><input className="input" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><input className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="GSTIN"><input className="input" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} /></Field>
        </div>
        <Field label="Address"><textarea className="input" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)} title="Delete Vendor" message={`Delete "${del?.name}"?`} danger />
    </div>
  )
}

// ── Stock Tab ─────────────────────────────────────────
function StockTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [adjustModal, setAdjustModal] = useState(null)
  const [adjForm, setAdjForm] = useState({ quantity: '', note: '' })

  const { data, isLoading } = useQuery({ queryKey: ['stock', search], queryFn: () => inventoryAPI.stock.list({ search }).then(r => r.data.results || r.data) })
  const { data: lowAlert }  = useQuery({ queryKey: ['low-stock'], queryFn: () => inventoryAPI.stock.lowAlert().then(r => r.data) })
  const adjust = useMutation({
    mutationFn: ({ id, data }) => inventoryAPI.stock.adjust(id, data),
    onSuccess: () => { qc.invalidateQueries(['stock']); setAdjustModal(null); toast.success('Stock adjusted') },
  })

  const stocks = data || []
  const lowCount = (lowAlert || []).length

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        {lowCount > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <AlertTriangle size={15} className="text-red-500" />
            <span className="text-sm text-red-600 font-medium">{lowCount} items below threshold</span>
          </div>
        )}
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search stock…" />
      <div className="table-container">
        <table className="table">
          <thead><tr><th>Ingredient</th><th>Unit</th><th>Current Stock</th><th>Threshold</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {stocks.map(s => (
              <tr key={s.id}>
                <td className="font-medium">{s.ingredient_name}</td>
                <td><span className="badge-gray">{s.unit}</span></td>
                <td className={parseFloat(s.current_quantity) <= parseFloat(s.minimum_threshold) ? 'text-red-600 font-bold' : ''}>
                  {parseFloat(s.current_quantity).toFixed(2)}
                </td>
                <td className="text-gray-400">{parseFloat(s.minimum_threshold).toFixed(2)}</td>
                <td><span className={s.is_low ? 'badge-red' : 'badge-green'}>{s.is_low ? 'Low' : 'OK'}</span></td>
                <td>
                  <button onClick={() => { setAdjustModal(s); setAdjForm({ quantity: s.current_quantity, note: '' }) }}
                    className="btn-ghost py-1 text-xs"><Edit2 size={12} />Adjust</button>
                </td>
              </tr>
            ))}
            {!isLoading && stocks.length === 0 && <tr><td colSpan={6}><Empty message="No stock records" /></td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={!!adjustModal} onClose={() => setAdjustModal(null)} title={`Adjust Stock — ${adjustModal?.ingredient_name}`}
        footer={<><button onClick={() => setAdjustModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={() => adjust.mutate({ id: adjustModal.id, data: adjForm })} disabled={adjust.isPending} className="btn-primary">Update</button></>}>
        <Field label={`New Quantity (${adjustModal?.unit})`}><input type="number" step="0.001" className="input" value={adjForm.quantity} onChange={e => setAdjForm({ ...adjForm, quantity: e.target.value })} /></Field>
        <Field label="Note"><input className="input" value={adjForm.note} onChange={e => setAdjForm({ ...adjForm, note: e.target.value })} /></Field>
      </Modal>
    </div>
  )
}

// ── Invoice Tab ────────────────────────────────────────
function InvoiceTab() {
  const qc = useQueryClient()
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatus] = useState('')
  const [modal, setModal]       = useState(false)
  const [detailModal, setDetail] = useState(null)
  const [payModal, setPayModal] = useState(null)
  const [payForm, setPayForm]   = useState({ amount: '', payment_date: '', payment_method: 'Cash', notes: '' })

  const { data: vendors }     = useQuery({ queryKey: ['vendors'], queryFn: () => inventoryAPI.vendors.list().then(r => r.data.results || r.data) })
  const { data: ingredients } = useQuery({ queryKey: ['ingredients'], queryFn: () => menuAPI.ingredients.list().then(r => r.data.results || r.data) })

  const [form, setForm]   = useState({ vendor: '', invoice_number: '', invoice_date: '', due_date: '', total_amount: '', notes: '', items: [] })

  const { data, isLoading } = useQuery({ queryKey: ['invoices', search, statusFilter], queryFn: () => inventoryAPI.invoices.list({ search, status: statusFilter || undefined }).then(r => r.data.results || r.data) })

  const save          = useMutation({ mutationFn: d => inventoryAPI.invoices.create(d), onSuccess: () => { qc.invalidateQueries(['invoices']); setModal(false); toast.success('Invoice created') } })
  const markReceived  = useMutation({ mutationFn: id => inventoryAPI.invoices.markReceived(id), onSuccess: () => { qc.invalidateQueries(['invoices']); qc.invalidateQueries(['stock']); toast.success('Stock updated from invoice') } })
  const addPayment    = useMutation({ mutationFn: ({ id, data }) => inventoryAPI.invoices.addPayment(id, data), onSuccess: () => { qc.invalidateQueries(['invoices']); setPayModal(null); toast.success('Payment recorded') } })

  const addInvItem    = () => setForm({ ...form, items: [...form.items, { ingredient: '', quantity: '', unit_price: '' }] })
  const removeInvItem = i  => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })
  const updateInvItem = (i, f, v) => setForm({ ...form, items: form.items.map((row, idx) => idx === i ? { ...row, [f]: v } : row) })

  const invoices = data || []

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search invoices…">
        <select className="select w-36" value={statusFilter} onChange={e => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PARTIAL">Partial</option>
          <option value="PAID">Paid</option>
        </select>
        <button onClick={() => { setForm({ vendor: '', invoice_number: '', invoice_date: '', due_date: '', total_amount: '', notes: '', items: [] }); setModal(true) }} className="btn-primary"><Plus size={15} />New Invoice</button>
      </SearchBar>

      <div className="table-container">
        <table className="table">
          <thead><tr><th>Invoice #</th><th>Vendor</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td className="font-mono text-sm font-medium">{inv.invoice_number}</td>
                <td>{inv.vendor_name}</td>
                <td>{inv.invoice_date}</td>
                <td>₹{parseFloat(inv.total_amount).toLocaleString()}</td>
                <td className="text-primary-600">₹{parseFloat(inv.paid_amount).toLocaleString()}</td>
                <td className={parseFloat(inv.balance_due) > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>₹{parseFloat(inv.balance_due).toLocaleString()}</td>
                <td><StatusBadge status={inv.status} /></td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    <button onClick={() => setDetail(inv)} className="btn-ghost py-1 text-xs"><FileText size={12} />View</button>
                    {!inv.stock_updated && <button onClick={() => markReceived.mutate(inv.id)} className="btn-ghost py-1 text-xs text-primary-600"><Package size={12} />Receive</button>}
                    {inv.status !== 'PAID' && <button onClick={() => { setPayModal(inv); setPayForm({ amount: inv.balance_due, payment_date: new Date().toISOString().split('T')[0], payment_method: 'Cash', notes: '' }) }} className="btn-ghost py-1 text-xs text-gold-400"><CreditCard size={12} />Pay</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && invoices.length === 0 && <tr><td colSpan={8}><Empty message="No invoices" /></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Create Invoice Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="New Vendor Invoice" size="xl"
        footer={<><button onClick={() => setModal(false)} className="btn-ghost">Cancel</button><button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">Create Invoice</button></>}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="Vendor" required>
            <select className="select" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })}>
              <option value="">Select vendor…</option>
              {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Invoice Number" required><input className="input" value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} /></Field>
          <Field label="Invoice Date"><input type="date" className="input" value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} /></Field>
          <Field label="Due Date"><input type="date" className="input" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></Field>
          <Field label="Total Amount"><input type="number" step="0.01" className="input" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} /></Field>
        </div>
        <p className="label mb-2">Invoice Items</p>
        <div className="space-y-2 mb-3">
          {form.items.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select className="select flex-1" value={row.ingredient} onChange={e => updateInvItem(i, 'ingredient', e.target.value)}>
                <option value="">Ingredient…</option>
                {(ingredients || []).map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}
              </select>
              <input type="number" step="0.001" placeholder="Qty" className="input w-24" value={row.quantity} onChange={e => updateInvItem(i, 'quantity', e.target.value)} />
              <input type="number" step="0.01"  placeholder="Unit Price" className="input w-28" value={row.unit_price} onChange={e => updateInvItem(i, 'unit_price', e.target.value)} />
              <button onClick={() => removeInvItem(i)} className="text-red-400"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <button onClick={addInvItem} className="btn-outline text-xs"><Plus size={13} />Add Item</button>
      </Modal>

      {/* Invoice Detail Modal */}
      <Modal open={!!detailModal} onClose={() => setDetail(null)} title={`Invoice: ${detailModal?.invoice_number}`} size="lg">
        {detailModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400">Vendor:</span><span className="ml-2 font-medium">{detailModal.vendor_name}</span></div>
              <div><span className="text-gray-400">Date:</span><span className="ml-2">{detailModal.invoice_date}</span></div>
              <div><span className="text-gray-400">Status:</span><span className="ml-2"><StatusBadge status={detailModal.status} /></span></div>
              <div><span className="text-gray-400">Stock Updated:</span><span className={`ml-2 badge ${detailModal.stock_updated ? 'badge-green' : 'badge-gray'}`}>{detailModal.stock_updated ? 'Yes' : 'No'}</span></div>
            </div>
            <div>
              <p className="label mb-2">Items</p>
              <div className="table-container"><table className="table">
                <thead><tr><th>Ingredient</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
                <tbody>{detailModal.items.map((item, i) => (
                  <tr key={i}><td>{item.ingredient_name}</td><td>{item.quantity} {item.unit}</td><td>₹{item.unit_price}</td><td>₹{parseFloat(item.line_total).toFixed(2)}</td></tr>
                ))}</tbody>
              </table></div>
            </div>
            {detailModal.payments.length > 0 && (
              <div>
                <p className="label mb-2">Payment History</p>
                <div className="space-y-1">
                  {detailModal.payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                      <span>{p.payment_date} · {p.payment_method}</span>
                      <span className="font-semibold text-primary-600">₹{parseFloat(p.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-3">
              <span>Balance Due:</span>
              <span className={parseFloat(detailModal.balance_due) > 0 ? 'text-red-600' : 'text-primary-600'}>
                ₹{parseFloat(detailModal.balance_due).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Payment Modal */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Add Payment — ${payModal?.invoice_number}`}
        footer={<><button onClick={() => setPayModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={() => addPayment.mutate({ id: payModal.id, data: payForm })} disabled={addPayment.isPending} className="btn-primary">Record Payment</button></>}>
        <Field label="Amount (₹)" required><input type="number" step="0.01" className="input" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></Field>
        <Field label="Payment Date"><input type="date" className="input" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} /></Field>
        <Field label="Method">
          <select className="select" value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}>
            {['Cash','UPI','Bank Transfer','Cheque'].map(m => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Notes"><input className="input" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} /></Field>
      </Modal>
    </div>
  )
}

export default function InventoryPage() {
  const [tab, setTab] = useState('stock')
  const tabs = [
    { id: 'stock',    label: 'Stock',    icon: <Package size={15} /> },
    { id: 'invoices', label: 'Invoices', icon: <FileText size={15} /> },
    { id: 'vendors',  label: 'Vendors',  icon: <Truck size={15} /> },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory Management</h1>
          <p className="page-subtitle">Stock levels, vendor invoices, and purchase tracking</p>
        </div>
      </div>
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === t.id ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {tab === 'stock'    && <StockTab />}
      {tab === 'invoices' && <InvoiceTab />}
      {tab === 'vendors'  && <VendorTab />}
    </div>
  )
}
