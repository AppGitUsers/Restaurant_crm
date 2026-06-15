import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tablesAPI, menuAPI, customersAPI, settingsAPI } from '@/api'
import { PageLoader, Modal, Field } from '@/components/ui'
import { ArrowLeft, Plus, Minus, CreditCard, ChefHat, Check, Loader2 } from 'lucide-react'
import { formatDistanceToNow, parseISO, format } from 'date-fns'
import toast from 'react-hot-toast'

const BATCH_STATUS_STYLE = {
  PENDING:   'bg-amber-100 text-amber-700',
  PREPARING: 'bg-blue-100 text-blue-700',
  SERVED:    'bg-green-100 text-green-700',
}

// ── Add Items Modal ──────────────────────────────────────────────────────────
function AddItemsModal({ open, onClose, sessionId }) {
  const [cart, setCart]   = useState({})
  const [notes, setNotes] = useState('')
  const qc = useQueryClient()

  const { data: menuData = [], isLoading } = useQuery({
    queryKey: ['menu-items-for-add'],
    queryFn:  () => menuAPI.items.list({ is_active: true }).then(r => r.data.results ?? r.data),
    enabled:  open,
  })

  const submit = useMutation({
    mutationFn: (data) => tablesAPI.addBatch(sessionId, data),
    onSuccess: () => {
      qc.invalidateQueries(['table-session', sessionId])
      qc.invalidateQueries(['tables-grid'])
      toast.success('Items added to table')
      setCart({})
      setNotes('')
      onClose()
    },
    onError: (err) => {
      const detail = err?.response?.data?.out_of_stock
      if (detail?.length) {
        toast.error(`Out of stock: ${detail.map(i => i.name).join(', ')}`)
      } else {
        toast.error('Failed to add items')
      }
    },
  })

  const inc = (id) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }))
  const dec = (id) => setCart(c => {
    const next = (c[id] || 0) - 1
    if (next <= 0) { const { [id]: _, ...rest } = c; return rest }
    return { ...c, [id]: next }
  })

  const totalItems = Object.values(cart).reduce((s, n) => s + n, 0)

  const handleSubmit = () => {
    const items = Object.entries(cart).map(([id, qty]) => ({
      food_item: parseInt(id), quantity: qty, notes: '',
    }))
    submit.mutate({ items, notes })
  }

  const grouped = {}
  menuData.forEach(item => {
    const type = item.food_type_name || 'Other'
    if (!grouped[type]) grouped[type] = []
    grouped[type].push(item)
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Items to Table"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={totalItems === 0 || submit.isPending}
            className="btn-primary disabled:opacity-40"
          >
            {submit.isPending
              ? <><Loader2 size={14} className="animate-spin" /> Adding…</>
              : <><Plus size={14} /> Add {totalItems > 0 ? `${totalItems} item${totalItems > 1 ? 's' : ''}` : 'Items'}</>
            }
          </button>
        </>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary-400" /></div>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{type}</p>
              <div className="space-y-1">
                {items.map(item => {
                  const qty         = cart[item.id] || 0
                  const unavailable = !item.is_available || (item.tracks_stock && item.makeable_count <= 0)
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between py-1.5 px-2 rounded-lg ${unavailable ? 'opacity-40' : 'hover:bg-gray-50'}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-700">{item.name}</p>
                        <p className="text-xs text-gray-400">₹{parseFloat(item.price).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {qty > 0 && (
                          <>
                            <button onClick={() => dec(item.id)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                              <Minus size={13} />
                            </button>
                            <span className="w-5 text-center font-bold text-gray-800">{qty}</span>
                          </>
                        )}
                        <button
                          onClick={() => !unavailable && inc(item.id)}
                          disabled={unavailable}
                          className="w-7 h-7 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center hover:bg-primary-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <Field label="Note (optional)">
        <input
          type="text"
          className="input mt-1"
          placeholder="e.g. no onions"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </Field>
    </Modal>
  )
}

// ── Bill Confirm Modal ───────────────────────────────────────────────────────
function BillModal({ open, onClose, session, gstRate, onBill }) {
  const [method,  setMethod]  = useState('CASH')
  const [phone,   setPhone]   = useState('')
  const [name,    setName]    = useState('')

  if (!session) return null

  const subtotal = parseFloat(session.subtotal)
  const discount = parseFloat(session.discount)
  const taxable  = Math.max(0, subtotal - discount)
  const tax      = taxable * gstRate
  const total    = taxable + tax

  // Phone lookup
  const phoneReady = phone.replace(/\D/g, '').length >= 10
  const { data: lookupData, isFetching } = useQuery({
    queryKey:  ['customer-phone-lookup', phone],
    queryFn:   () => customersAPI.list({ phone }).then(r => r.data.results || r.data),
    enabled:   open && phoneReady,
    staleTime: 30_000,
  })
  const matched = lookupData?.[0] || null

  useEffect(() => {
    if (matched && !name) setName(matched.name)
  }, [matched?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const gstDisplay = (gstRate * 100).toFixed(gstRate % 1 === 0 ? 0 : 1)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Collect Payment"
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => onBill({ payment_method: method, customer_name: name, customer_phone: phone })} className="btn-primary">
            <CreditCard size={14} /> Confirm ₹{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>₹{subtotal.toLocaleString()}</span></div>
          {discount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>−₹{discount.toLocaleString()}</span></div>}
          <div className="flex justify-between"><span className="text-gray-500">Tax ({gstDisplay}%)</span><span>₹{tax.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2">
            <span>Total</span><span className="text-primary-600">₹{total.toFixed(2)}</span>
          </div>
        </div>

        <Field label="Payment Method">
          <div className="flex gap-2 mt-1">
            {['CASH','UPI','CARD'].map(m => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  method === m
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-gray-300 text-gray-600 hover:border-primary-400'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>

        {/* Phone first — triggers lookup */}
        <div className="space-y-2">
          <div className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone (optional)</label>
            <input
              className="input"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="9876543210"
            />
            {phoneReady && isFetching && (
              <span className="absolute right-3 bottom-2.5 text-gray-300 text-xs animate-pulse">…</span>
            )}
          </div>

          {matched && (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs font-semibold text-green-700">{matched.name}</p>
                <p className="text-xs text-green-500">
                  {matched.total_visits > 0
                    ? `${matched.total_visits} visit${matched.total_visits > 1 ? 's' : ''} · ₹${parseFloat(matched.total_spent || 0).toFixed(0)} spent`
                    : 'First visit'}
                </p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                matched.frequency_tag === 'HIGH'   ? 'bg-amber-100 text-amber-700' :
                matched.frequency_tag === 'MEDIUM' ? 'bg-blue-100 text-blue-600'  :
                                                      'bg-green-100 text-green-600'
              }`}>
                {matched.frequency_tag === 'HIGH' ? '★ VIP' : matched.frequency_tag === 'MEDIUM' ? 'Regular' : 'New'}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name (optional)</label>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Walk-in"
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TableBillPage() {
  const { sessionId } = useParams()
  const navigate      = useNavigate()
  const qc            = useQueryClient()

  const [discount,  setDiscount]  = useState(0)
  const [addOpen,   setAddOpen]   = useState(false)
  const [billOpen,  setBillOpen]  = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn:  () => settingsAPI.get().then(r => r.data),
    staleTime: 5 * 60_000,
  })
  const gstRate    = parseFloat(settings?.gst_rate || 5) / 100
  const gstDisplay = (gstRate * 100).toFixed(gstRate * 100 % 1 === 0 ? 0 : 1)

  const { data: session, isLoading } = useQuery({
    queryKey: ['table-session', sessionId],
    queryFn:  () => tablesAPI.sessionDetail(sessionId).then(r => r.data),
    refetchInterval: 20_000,
  })

  const billMutation = useMutation({
    mutationFn: (data) => tablesAPI.bill(sessionId, { ...data, discount }),
    onSuccess: (res) => {
      qc.invalidateQueries(['tables-grid'])
      qc.invalidateQueries(['table-session', sessionId])
      toast.success(`Table ${session?.table_number} billed — Order ${res.data.order_number}`)
      navigate('/billing/tables')
    },
    onError: () => toast.error('Billing failed. Please try again.'),
  })

  if (isLoading) return <PageLoader />
  if (!session)  return <div className="p-8 text-gray-400 text-center">Session not found.</div>

  const isBilled = session.status === 'BILLED'
  const subtotal = parseFloat(session.subtotal)
  const disc     = parseFloat(discount) || 0
  const taxable  = Math.max(0, subtotal - disc)
  const tax      = taxable * gstRate
  const total    = taxable + tax

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/billing/tables')} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="font-bold text-gray-800 text-base">Table {session.table_number}</h2>
            <p className="text-xs text-gray-400">
              Opened {formatDistanceToNow(parseISO(session.opened_at), { addSuffix: true })}
              {session.closed_at && ` · Closed ${format(parseISO(session.closed_at), 'hh:mm a')}`}
            </p>
          </div>
        </div>
        {!isBilled && (
          <button onClick={() => setAddOpen(true)} className="btn-primary py-1.5 px-3 text-sm">
            <Plus size={14} /> Add Items
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {session.batches.map((batch, idx) => (
          <div key={batch.id} className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400">Round {idx + 1}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BATCH_STATUS_STYLE[batch.status]}`}>
                  {batch.status}
                </span>
                {batch.added_by === 'BILLER' && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Biller</span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                {format(parseISO(batch.placed_at), 'hh:mm a')}
              </span>
            </div>
            <div className="space-y-1.5">
              {batch.items.map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">
                    {item.food_item_name}
                    {item.addon_unit_price > 0 && (
                      <span className="text-xs text-primary-400 ml-1">(+add-ons)</span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400">×{item.quantity}</span>
                    <span className="font-medium text-gray-700 w-20 text-right">
                      ₹{parseFloat(item.line_total).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {session.batches.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">No orders yet for this table.</div>
        )}
      </div>

      {/* Bill footer */}
      {!isBilled && (
        <div className="bg-white border-t border-gray-200 p-4 flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-medium">₹{subtotal.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-500 shrink-0">Discount ₹</label>
            <input
              type="number"
              min={0}
              value={discount}
              onChange={e => setDiscount(e.target.value)}
              className="input py-1.5 text-sm w-28"
            />
            <div className="flex-1 text-right text-sm text-gray-500">
              Tax ({gstDisplay}%) ₹{tax.toFixed(2)}
            </div>
          </div>
          <button
            onClick={() => setBillOpen(true)}
            disabled={subtotal === 0 || billMutation.isPending}
            className="btn-primary w-full justify-center text-base py-3 disabled:opacity-40"
          >
            {billMutation.isPending
              ? <><Loader2 size={16} className="animate-spin" /> Processing…</>
              : <><CreditCard size={16} /> Collect ₹{total.toFixed(2)}</>
            }
          </button>
        </div>
      )}

      {isBilled && (
        <div className="bg-green-50 border-t border-green-200 p-4 flex items-center justify-center gap-2 flex-shrink-0">
          <Check size={16} className="text-green-600" />
          <span className="text-green-700 font-semibold text-sm">Session billed and closed</span>
        </div>
      )}

      <AddItemsModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        sessionId={sessionId}
      />
      <BillModal
        open={billOpen}
        onClose={() => setBillOpen(false)}
        session={{ ...session, discount }}
        gstRate={gstRate}
        onBill={(data) => { setBillOpen(false); billMutation.mutate(data) }}
      />
    </div>
  )
}
