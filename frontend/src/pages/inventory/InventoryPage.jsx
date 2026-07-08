import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryAPI, menuAPI } from '@/api'
import { PageLoader, Modal, SearchBar, StatusBadge, ConfirmDialog, Field, Empty } from '@/components/ui'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, Package, Truck, FileText, CreditCard, AlertTriangle } from 'lucide-react'

// ── Searchable ingredient combobox ────────────────────
function IngredientSelect({ ingredients, value, onChange }) {
  const [search, setSearch] = useState('')
  const [open, setOpen]     = useState(false)
  const ref                 = useRef(null)

  const list     = ingredients || []
  const selected = list.find(i => String(i.id) === String(value))
  const filtered = search
    ? list.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : list

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        className="input w-full"
        placeholder="Search ingredient…"
        value={open ? search : (selected ? `${selected.name} (${selected.unit})` : '')}
        onFocus={() => { setOpen(true); setSearch('') }}
        onChange={e => setSearch(e.target.value)}
        onKeyDown={e => e.key === 'Escape' && setOpen(false)}
      />
      {open && (
        <div className="absolute left-0 right-0 z-[100] mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
          {filtered.length === 0
            ? <p className="px-3 py-2 text-sm text-gray-400">No results</p>
            : filtered.map(i => (
              <button key={i.id} type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 flex justify-between items-center"
                onMouseDown={() => { onChange(String(i.id)); setOpen(false); setSearch('') }}>
                <span className="font-medium">{i.name}</span>
                <span className="text-gray-400 text-xs ml-2">{i.unit}</span>
              </button>
            ))
          }
        </div>
      )}
    </div>
  )
}

// ── Vendor Tab ────────────────────────────────────────
function VendorTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [sel, setSel]       = useState(null)
  const [del, setDel]       = useState(null)
  const [form, setForm]     = useState({ name: '', contact_name: '', phone: '', email: '', address: '', gstin: '' })

  const { data, isLoading } = useQuery({ queryKey: ['vendors', search], queryFn: () => inventoryAPI.vendors.list({ search }).then(r => r.data.results || r.data) })
  const save   = useMutation({ mutationFn: d => sel ? inventoryAPI.vendors.update(sel.id, d) : inventoryAPI.vendors.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); setModal(false); toast.success('Saved!') } })
  const remove = useMutation({ mutationFn: id => inventoryAPI.vendors.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); setDel(null); toast.success('Deleted') } })
  const openCreate = () => { setSel(null); setForm({ name: '', contact_name: '', phone: '', email: '', address: '', gstin: '' }); setModal(true) }
  const openEdit   = v => { setSel(v); setForm({ name: v.name, contact_name: v.contact_name, phone: v.phone, email: v.email, address: v.address, gstin: v.gstin }); setModal(true) }
  const vendors = data || []

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search vendors…">
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Vendor</button>
      </SearchBar>

      {/* Desktop table */}
      <div className="hidden sm:block table-container">
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

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {isLoading && <p className="text-center py-8 text-gray-400">Loading…</p>}
        {vendors.map(v => (
          <div key={v.id} className="card flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-800">{v.name}</p>
                {v.email && <p className="text-xs text-gray-400">{v.email}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(v)} className="btn-ghost py-1 px-2"><Edit2 size={13} /></button>
                <button onClick={() => setDel(v)} className="btn-ghost py-1 px-2 text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {v.contact_name && <><span className="text-gray-400 text-xs">Contact</span><span className="text-gray-700">{v.contact_name}</span></>}
              <span className="text-gray-400 text-xs">Phone</span><span className="text-gray-700">{v.phone || '—'}</span>
              <span className="text-gray-400 text-xs">GSTIN</span><span className="text-gray-700 font-mono text-xs">{v.gstin || '—'}</span>
              <span className="text-gray-400 text-xs">Invoices</span><span className="text-gray-700">{v.invoice_count}</span>
            </div>
          </div>
        ))}
        {!isLoading && vendors.length === 0 && <Empty message="No vendors" />}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={sel ? 'Edit Vendor' : 'Add Vendor'}
        footer={<><button onClick={() => setModal(false)} className="btn-ghost">Cancel</button><button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">Save</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Contact Name"><input className="input" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></Field>
          <Field label="Phone"><input type="tel" inputMode="numeric" maxLength={15} className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 15) })} placeholder="9876543210" /></Field>
          <Field label="Email"><input className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="GSTIN"><input className="input" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} /></Field>
        </div>
        <Field label="Address"><textarea className="input" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)} title="Delete Vendor" message={`Delete "${del?.name}"?`} danger />
    </div>
  )
}

// ── Stock Tab (card view on all screens) ──────────────
function StockTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [adjustModal, setAdjustModal] = useState(null)
  const [adjForm, setAdjForm] = useState({ quantity: '', note: '' })

  const { data, isLoading } = useQuery({ queryKey: ['stock', search], queryFn: () => inventoryAPI.stock.list({ search }).then(r => r.data.results || r.data) })
  const { data: lowAlert }  = useQuery({ queryKey: ['low-stock'], queryFn: () => inventoryAPI.stock.lowAlert().then(r => r.data) })
  const adjust = useMutation({
    mutationFn: ({ id, data }) => inventoryAPI.stock.adjust(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['low-stock'] })
      setAdjustModal(null)
      toast.success('Stock adjusted')
    },
    onError: () => toast.error('Failed to adjust stock'),
  })

  const stocks   = data || []
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

      {isLoading && <div className="text-center py-8 text-gray-400">Loading…</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {stocks.map(s => (
          <div key={s.id} className={`card flex flex-col gap-3 ${s.is_low ? 'border-red-200' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-gray-800 leading-tight">{s.ingredient_name}</p>
              <span className={s.is_low ? 'badge-red flex-shrink-0' : 'badge-green flex-shrink-0'}>{s.is_low ? 'Low' : 'OK'}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge-gray text-xs">{s.unit}</span>
              <span className={`text-lg font-bold ${parseFloat(s.current_quantity) <= parseFloat(s.minimum_threshold) ? 'text-red-600' : 'text-gray-800'}`}>
                {parseFloat(s.current_quantity).toFixed(2)}
              </span>
              <span className="text-xs text-gray-400">/ min {parseFloat(s.minimum_threshold).toFixed(2)}</span>
            </div>
            <button
              onClick={() => { setAdjustModal(s); setAdjForm({ quantity: s.current_quantity, note: '' }) }}
              className="btn-ghost py-1 text-xs self-start"
            >
              <Edit2 size={12} />Adjust Stock
            </button>
          </div>
        ))}
        {!isLoading && stocks.length === 0 && <div className="col-span-full"><Empty message="No stock records" /></div>}
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
  const today = new Date().toISOString().split('T')[0]

  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('')
  const [modal, setModal]         = useState(false)
  const [detailModal, setDetail]  = useState(null)
  const [payModal, setPayModal]   = useState(null)
  const [payForm, setPayForm]     = useState({ amount: '', payment_date: '', payment_method: 'Cash', notes: '' })

  const { data: vendors }     = useQuery({ queryKey: ['vendors'], queryFn: () => inventoryAPI.vendors.list().then(r => r.data.results || r.data) })
  const { data: ingredients } = useQuery({ queryKey: ['ingredients'], queryFn: () => menuAPI.ingredients.list().then(r => r.data.results || r.data) })

  const emptyForm = {
    vendor: '', invoice_number: '', invoice_date: today,
    due_date: '', extra_charges: '0', total_amount: '0.00', notes: '', items: [],
  }
  const [form, setForm] = useState(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', search, statusFilter],
    queryFn: () => inventoryAPI.invoices.list({ search, status: statusFilter || undefined }).then(r => r.data.results || r.data),
  })

  const save         = useMutation({ mutationFn: d => inventoryAPI.invoices.create(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); setModal(false); toast.success('Invoice created') } })
  const markReceived = useMutation({ mutationFn: id => inventoryAPI.invoices.markReceived(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['stock'] }); qc.invalidateQueries({ queryKey: ['low-stock'] }); toast.success('Stock updated from invoice') } })
  const addPayment   = useMutation({
    mutationFn: ({ id, data }) => inventoryAPI.invoices.addPayment(id, data),
    onSuccess: (response) => {
      const updated = response.data
      // Directly patch the cached list so paid/balance/status update instantly
      qc.setQueryData(['invoices', search, statusFilter], (old) =>
        Array.isArray(old) ? old.map(inv => inv.id === updated.id ? updated : inv) : old
      )
      qc.invalidateQueries({ queryKey: ['invoices'] })
      setPayModal(null)
      toast.success('Payment recorded')
    },
  })

  const calcSubtotal = items =>
    items.reduce((s, r) => s + (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0), 0)

  const addInvItem = () => {
    setForm(f => ({ ...f, items: [...f.items, { ingredient: '', quantity: '', qty_per_package: '1', unit_price: '' }] }))
  }

  const removeInvItem = i => {
    const newItems = form.items.filter((_, idx) => idx !== i)
    const sub      = calcSubtotal(newItems)
    const extra    = parseFloat(form.extra_charges) || 0
    setForm({ ...form, items: newItems, total_amount: (sub + extra).toFixed(2) })
  }

  const updateInvItem = (i, field, val) => {
    const newItems = form.items.map((row, idx) => idx === i ? { ...row, [field]: val } : row)
    const sub      = calcSubtotal(newItems)
    const extra    = parseFloat(form.extra_charges) || 0
    setForm({ ...form, items: newItems, total_amount: (sub + extra).toFixed(2) })
  }

  const onExtraChange = val => {
    const sub = calcSubtotal(form.items)
    setForm(f => ({ ...f, extra_charges: val, total_amount: (sub + (parseFloat(val) || 0)).toFixed(2) }))
  }

  const onTotalChange = val => {
    const sub   = calcSubtotal(form.items)
    const extra = Math.max(0, (parseFloat(val) || 0) - sub)
    setForm(f => ({ ...f, total_amount: val, extra_charges: extra.toFixed(2) }))
  }

  const handleSubmit = () => {
    save.mutate({
      ...form,
      invoice_number: form.invoice_number || null,
      due_date: form.due_date || null,
    })
  }

  const itemsSubtotal = calcSubtotal(form.items)
  const invoices      = data || []

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search invoices…">
        <select className="select w-36" value={statusFilter} onChange={e => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PARTIAL">Partial</option>
          <option value="PAID">Paid</option>
        </select>
        <button onClick={() => { setForm(emptyForm); setModal(true) }} className="btn-primary"><Plus size={15} />New Invoice</button>
      </SearchBar>

      {/* Desktop table */}
      <div className="hidden sm:block table-container">
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
                    {inv.status !== 'PAID' && <button onClick={() => { setPayModal(inv); setPayForm({ amount: inv.balance_due, payment_date: today, payment_method: 'Cash', notes: '' }) }} className="btn-ghost py-1 text-xs text-gold-400"><CreditCard size={12} />Pay</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && invoices.length === 0 && <tr><td colSpan={8}><Empty message="No invoices" /></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {isLoading && <p className="text-center py-8 text-gray-400">Loading…</p>}
        {invoices.map(inv => (
          <div key={inv.id} className="card flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono font-semibold text-gray-800">{inv.invoice_number}</p>
                <p className="text-sm text-gray-500">{inv.vendor_name}</p>
              </div>
              <StatusBadge status={inv.status} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-xs text-gray-400">Total</p><p className="font-semibold">₹{parseFloat(inv.total_amount).toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Paid</p><p className="font-semibold text-primary-600">₹{parseFloat(inv.paid_amount).toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Balance</p><p className={`font-bold ${parseFloat(inv.balance_due) > 0 ? 'text-red-600' : 'text-gray-400'}`}>₹{parseFloat(inv.balance_due).toLocaleString()}</p></div>
            </div>
            <p className="text-xs text-gray-400">{inv.invoice_date}</p>
            <div className="flex gap-2 flex-wrap border-t border-gray-50 pt-2">
              <button onClick={() => setDetail(inv)} className="btn-ghost py-1 text-xs"><FileText size={12} />View</button>
              {!inv.stock_updated && <button onClick={() => markReceived.mutate(inv.id)} className="btn-ghost py-1 text-xs text-primary-600"><Package size={12} />Receive</button>}
              {inv.status !== 'PAID' && <button onClick={() => { setPayModal(inv); setPayForm({ amount: inv.balance_due, payment_date: today, payment_method: 'Cash', notes: '' }) }} className="btn-ghost py-1 text-xs text-gold-400"><CreditCard size={12} />Pay</button>}
            </div>
          </div>
        ))}
        {!isLoading && invoices.length === 0 && <Empty message="No invoices" />}
      </div>

      {/* ── Create Invoice Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title="New Vendor Invoice" size="xl"
        footer={
          <>
            <button onClick={() => setModal(false)} className="btn-ghost">Cancel</button>
            <button onClick={handleSubmit} disabled={save.isPending} className="btn-primary">Create Invoice</button>
          </>
        }>

        {/* Header fields */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="Vendor" required>
            <select className="select" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })}>
              <option value="">Select vendor…</option>
              {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="Invoice No. (Vendor's — optional)">
            <input className="input" placeholder="Auto-generated if blank"
              value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} />
          </Field>
          <Field label="Invoice Date">
            <input type="date" className="input" value={form.invoice_date}
              onChange={e => setForm({ ...form, invoice_date: e.target.value })} />
          </Field>
          <Field label="Due Date">
            <input type="date" className="input" value={form.due_date}
              onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </Field>
        </div>

        {/* Items section */}
        <div className="flex items-center justify-between mb-2">
          <p className="label">Invoice Items</p>
          <button type="button" onClick={addInvItem} className="btn-outline text-xs"><Plus size={13} />Add Item</button>
        </div>
        <div className="border border-gray-200 rounded-lg overflow-visible mb-4">
          {form.items.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2">Ingredient</th>
                  <th className="text-center px-2 py-2 w-20">Packages</th>
                  <th className="text-center px-2 py-2 w-24">Qty / Pkg</th>
                  <th className="text-center px-2 py-2 w-28">Unit Price (₹)</th>
                  <th className="text-right px-2 py-2 w-24">Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1.5">
                      <IngredientSelect ingredients={ingredients} value={row.ingredient}
                        onChange={v => updateInvItem(i, 'ingredient', v)} />
                    </td>
                    <td className="px-1 py-1.5">
                      <input type="number" min="0" step="0.001" placeholder="5"
                        className="input text-center w-full"
                        value={row.quantity} onChange={e => updateInvItem(i, 'quantity', e.target.value)} />
                    </td>
                    <td className="px-1 py-1.5">
                      <input type="number" min="0" step="0.001" placeholder="1"
                        className="input text-center w-full"
                        value={row.qty_per_package} onChange={e => updateInvItem(i, 'qty_per_package', e.target.value)} />
                    </td>
                    <td className="px-1 py-1.5">
                      <input type="number" min="0" step="0.01" placeholder="0.00"
                        className="input text-right w-full"
                        value={row.unit_price} onChange={e => updateInvItem(i, 'unit_price', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium text-gray-700">
                      ₹{((parseFloat(row.quantity) || 0) * (parseFloat(row.unit_price) || 0)).toFixed(2)}
                    </td>
                    <td className="pr-2">
                      <button type="button" onClick={() => removeInvItem(i)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-6 text-sm text-gray-400">
              No items yet — click "Add Item" to start
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-2 text-sm mb-3">
          <div className="flex justify-between">
            <span className="text-gray-500">Items Subtotal</span>
            <span className="font-medium">₹{itemsSubtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center gap-4">
            <span className="text-gray-500">
              Extra Charges <span className="text-gray-400">(GST / delivery / other)</span>
            </span>
            <input type="number" min="0" step="0.01" className="input w-36 text-right"
              value={form.extra_charges} onChange={e => onExtraChange(e.target.value)} />
          </div>
          <div className="flex justify-between items-center gap-4 border-t border-gray-200 pt-2 font-semibold text-base">
            <span>Invoice Total</span>
            <input type="number" min="0" step="0.01" className="input w-36 text-right font-semibold"
              value={form.total_amount} onChange={e => onTotalChange(e.target.value)} />
          </div>
        </div>

        <Field label="Notes">
          <textarea className="input" rows={2} value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </Modal>

      {/* ── Invoice Detail Modal ── */}
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
              <div className="table-container">
                <table className="table">
                  <thead><tr><th>Ingredient</th><th>Pkgs</th><th>Qty/Pkg</th><th>Stock Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
                  <tbody>
                    {detailModal.items.map((item, i) => (
                      <tr key={i}>
                        <td>{item.ingredient_name}</td>
                        <td>{item.quantity}</td>
                        <td>{item.qty_per_package} {item.unit}</td>
                        <td className="font-medium text-primary-600">
                          {(parseFloat(item.quantity) * parseFloat(item.qty_per_package || 1)).toFixed(3)} {item.unit}
                        </td>
                        <td>₹{item.unit_price}</td>
                        <td>₹{parseFloat(item.line_total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Items Subtotal</span>
                <span>₹{detailModal.items.reduce((s, it) => s + parseFloat(it.line_total), 0).toFixed(2)}</span>
              </div>
              {parseFloat(detailModal.extra_charges) > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Extra Charges</span>
                  <span>₹{parseFloat(detailModal.extra_charges).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>Invoice Total</span>
                <span>₹{parseFloat(detailModal.total_amount).toFixed(2)}</span>
              </div>
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

      {/* ── Add Payment Modal ── */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Add Payment — ${payModal?.invoice_number}`}
        footer={<><button onClick={() => setPayModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={() => addPayment.mutate({ id: payModal.id, data: payForm })} disabled={addPayment.isPending} className="btn-primary">Record Payment</button></>}>
        <Field label="Amount (₹)" required><input type="number" step="0.01" className="input" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></Field>
        <Field label="Payment Date"><input type="date" className="input" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} /></Field>
        <Field label="Method">
          <select className="select" value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}>
            {['Cash', 'UPI', 'Bank Transfer', 'Cheque'].map(m => <option key={m}>{m}</option>)}
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
      {tab === 'stock'    && <StockTab />}
      {tab === 'invoices' && <InvoiceTab />}
      {tab === 'vendors'  && <VendorTab />}
    </div>
  )
}
