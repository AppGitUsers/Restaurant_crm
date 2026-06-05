import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { customersAPI } from '@/api'
import { PageLoader, Modal, SearchBar, StatusBadge, Field, Empty } from '@/components/ui'
import toast from 'react-hot-toast'
import { Plus, Edit2, Users, Star, Phone, ShoppingBag } from 'lucide-react'

export default function CustomersPage() {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [tagFilter, setTag]   = useState('')
  const [modal, setModal]     = useState(false)
  const [detailModal, setDetail] = useState(null)
  const [sel, setSel]         = useState(null)
  const [form, setForm]       = useState({ name: '', phone: '', email: '', address: '', notes: '' })

  const { data, isLoading } = useQuery({ queryKey: ['customers', search, tagFilter], queryFn: () => customersAPI.list({ search, frequency_tag: tagFilter || undefined }).then(r => r.data.results || r.data) })
  const save = useMutation({
    mutationFn: d => sel ? customersAPI.update(sel.id, d) : customersAPI.create(d),
    onSuccess: () => { qc.invalidateQueries(['customers']); setModal(false); toast.success('Saved!') },
  })

  const openCreate = () => { setSel(null); setForm({ name: '', phone: '', email: '', address: '', notes: '' }); setModal(true) }
  const openEdit   = c => { setSel(c); setForm({ name: c.name, phone: c.phone, email: c.email, address: c.address, notes: c.notes }); setModal(true) }

  const TAG_COLORS = { HIGH: 'badge-green', MEDIUM: 'badge-gold', LOW: 'badge-gray', NEW: 'badge-blue' }
  const customers  = data || []

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Customers</h1><p className="page-subtitle">Track visits, spending, and loyal customers</p></div>
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Customer</button>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search by name or phone…">
        <select className="select w-40" value={tagFilter} onChange={e => setTag(e.target.value)}>
          <option value="">All Customers</option>
          <option value="HIGH">High Value</option>
          <option value="MEDIUM">Regular</option>
          <option value="LOW">Occasional</option>
          <option value="NEW">New</option>
        </select>
      </SearchBar>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading && <PageLoader />}
        {customers.map(c => (
          <div key={c.id} className="card flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <Users size={18} className="text-primary-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{c.phone}</p>
                </div>
              </div>
              <span className={TAG_COLORS[c.frequency_tag] || 'badge-gray'}>{c.frequency_tag}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-primary-50 rounded-lg p-2">
                <p className="text-lg font-bold text-primary-600">{c.total_visits}</p>
                <p className="text-xs text-gray-400">Visits</p>
              </div>
              <div className="bg-gold-50 rounded-lg p-2">
                <p className="text-lg font-bold text-gold-400">₹{parseFloat(c.total_spent).toLocaleString()}</p>
                <p className="text-xs text-gray-400">Spent</p>
              </div>
            </div>
            <div className="flex gap-1 border-t border-gray-50 pt-2">
              <button onClick={() => openEdit(c)} className="btn-ghost py-1 text-xs flex-1"><Edit2 size={12} />Edit</button>
              <button onClick={() => setDetail(c)} className="btn-ghost py-1 text-xs flex-1"><ShoppingBag size={12} />History</button>
            </div>
          </div>
        ))}
        {!isLoading && customers.length === 0 && <div className="col-span-4"><Empty message="No customers found" icon={<Users size={48} />} /></div>}
      </div>

      {/* Customer detail + visit history */}
      <Modal open={!!detailModal} onClose={() => setDetail(null)} title={`${detailModal?.name} — Visit History`} size="lg">
        {detailModal && (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-primary-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-primary-600">{detailModal.total_visits}</p>
                <p className="text-xs text-gray-500">Total Visits</p>
              </div>
              <div className="bg-gold-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-gold-400">₹{parseFloat(detailModal.total_spent).toLocaleString()}</p>
                <p className="text-xs text-gray-500">Total Spent</p>
              </div>
              <div className="rounded-xl p-3 text-center border">
                <p className="text-2xl font-bold text-gray-700">{detailModal.total_visits > 0 ? `₹${(detailModal.total_spent / detailModal.total_visits).toFixed(0)}` : '—'}</p>
                <p className="text-xs text-gray-500">Avg per Visit</p>
              </div>
            </div>
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Order #</th><th>Amount</th><th>Date</th></tr></thead>
                <tbody>
                  {(detailModal.visits || []).map((v, i) => (
                    <tr key={i}>
                      <td className="font-mono text-sm">{v.order_number}</td>
                      <td className="font-semibold text-primary-600">₹{parseFloat(v.amount_spent).toFixed(2)}</td>
                      <td className="text-gray-400">{new Date(v.visited_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {(detailModal.visits || []).length === 0 && (
                    <tr><td colSpan={3}><Empty message="No visits recorded" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modal} onClose={() => setModal(false)} title={sel ? 'Edit Customer' : 'Add Customer'}
        footer={<><button onClick={() => setModal(false)} className="btn-ghost">Cancel</button><button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">Save</button></>}>
        <Field label="Name" required><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Phone" required><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Email"><input className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Address"><textarea className="input" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
        <Field label="Notes"><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
      </Modal>
    </div>
  )
}
