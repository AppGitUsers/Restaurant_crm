import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tablesAPI, menuAPI, customersAPI, settingsAPI, billingAPI } from '@/api'
import { PageLoader, Modal, Field } from '@/components/ui'
import { ArrowLeft, Plus, Minus, CreditCard, ChefHat, Check, Loader2, CheckCircle, MessageCircle } from 'lucide-react'
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
    enabled:         open,
    refetchInterval: open ? 15_000 : false,
    staleTime:       0,
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
          <button
            onClick={() => {
              if (phone.replace(/\D/g, '').length < 10) {
                toast.error('Phone number is required (10 digits)')
                return
              }
              onBill({ payment_method: method, customer_name: name, customer_phone: phone })
            }}
            className="btn-primary"
          >
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone <span className="text-red-500">*</span></label>
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

// ── Table Bill Receipt Modal ─────────────────────────────────────────────────
// Uses the order object returned directly by the bill API — no dependency on
// the live session query, so invalidation timing cannot affect rendering.
function TableBillReceiptModal({ open, onClose, order }) {
  if (!order) return null

  const downloadPdf = async () => {
    try {
      const { data } = await billingAPI.orders.billPdf(order.id)
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
      const a   = document.createElement('a')
      a.href    = url
      a.download = `bill_${order.order_number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('PDF download failed')
    }
  }

  const sendWhatsApp = () => {
    const digits = (order.customer_phone || '').replace(/\D/g, '')
    const phone  = digits.length === 10 ? `91${digits}` : digits

    const lines = []
    lines.push(`🧾 *Bill Receipt — ${order.order_number}*`)
    lines.push(``)
    lines.push(`*Items:*`)
    order.items.forEach(item => {
      lines.push(`• ${item.food_item_name} ×${item.quantity}  ₹${parseFloat(item.line_total).toFixed(2)}`)
      if (item.notes) lines.push(`  ↳ ${item.notes}`)
    })
    lines.push(``)
    lines.push(`Subtotal:  ₹${parseFloat(order.subtotal).toFixed(2)}`)
    if (parseFloat(order.discount) > 0)
      lines.push(`Discount:  -₹${parseFloat(order.discount).toFixed(2)}`)
    lines.push(`Tax:       ₹${parseFloat(order.tax_amount).toFixed(2)}`)
    lines.push(`*Total:    ₹${parseFloat(order.total_amount).toFixed(2)}*`)
    lines.push(``)
    lines.push(`Payment: ${order.payment_method}`)
    lines.push(``)
    lines.push(`Thank you for visiting us! 🙏`)

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
  }

  return (
    <Modal open={open} onClose={onClose} title="Bill Receipt" size="md"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Close</button>
        {order.customer_phone && (
          <button onClick={sendWhatsApp}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-colors">
            <MessageCircle size={15} />WhatsApp
          </button>
        )}
        <button onClick={downloadPdf} className="btn-primary">
          <CheckCircle size={15} />Download PDF
        </button>
      </>}
    >
      <div className="text-center mb-5">
        <CheckCircle size={44} className="text-primary-400 mx-auto mb-2" />
        <p className="font-bold text-lg text-gray-800">Payment Successful!</p>
        <p className="text-sm text-gray-400">Bill No: {order.order_number}</p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm mb-4">
        {order.customer_name  && <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-medium">{order.customer_name}</span></div>}
        {order.customer_phone && <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{order.customer_phone}</span></div>}
        <div className="flex justify-between"><span className="text-gray-500">Payment</span><span className="badge-green">{order.payment_method}</span></div>
      </div>

      <div className="space-y-2 text-sm">
        {order.items.map((item, i) => (
          <div key={i}>
            <div className="flex justify-between">
              <span className="text-gray-700">{item.food_item_name} × {item.quantity}</span>
              <span className="font-medium">₹{parseFloat(item.line_total).toFixed(2)}</span>
            </div>
            {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
          </div>
        ))}
        <div className="border-t border-gray-200 pt-2 space-y-1">
          <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>₹{parseFloat(order.subtotal).toFixed(2)}</span></div>
          {parseFloat(order.discount) > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>-₹{parseFloat(order.discount).toFixed(2)}</span></div>}
          <div className="flex justify-between text-gray-500"><span>Tax</span><span>₹{parseFloat(order.tax_amount).toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-primary-600 text-base pt-1 border-t">
            <span>Total</span><span>₹{parseFloat(order.total_amount).toFixed(2)}</span>
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

  const [discount,        setDiscount]        = useState(0)
  const [addOpen,         setAddOpen]         = useState(false)
  const [billOpen,        setBillOpen]        = useState(false)
  const [endConfirmOpen,  setEndConfirmOpen]  = useState(false)
  const [billedOrder,     setBilledOrder]     = useState(null)

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
    refetchInterval: 15_000,
  })

  const billMutation = useMutation({
    mutationFn: (data) => tablesAPI.bill(sessionId, { ...data, discount }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tables-grid'] })
      setBilledOrder(res.data)
    },
    onError: () => toast.error('Billing failed. Please try again.'),
  })

  const endMutation = useMutation({
    mutationFn: () => tablesAPI.endSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries(['tables-grid'])
      qc.invalidateQueries(['table-session', sessionId])
      toast.success('Session ended — table is free for new customers.')
      navigate('/billing/tables')
    },
    onError: () => toast.error('Failed to end session.'),
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEndConfirmOpen(true)}
              disabled={endMutation.isPending}
              className="py-1.5 px-3 text-sm rounded-lg border border-red-200 text-red-500 hover:bg-red-50 font-medium flex items-center gap-1"
            >
              End Session
            </button>
            <button onClick={() => setAddOpen(true)} className="btn-primary py-1.5 px-3 text-sm">
              <Plus size={14} /> Add Items
            </button>
          </div>
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
      <TableBillReceiptModal
        open={!!billedOrder}
        onClose={() => { setBilledOrder(null); navigate('/billing/tables') }}
        order={billedOrder}
      />

      {/* End Session confirmation modal */}
      <Modal
        open={endConfirmOpen}
        onClose={() => setEndConfirmOpen(false)}
        title="End Session"
        size="sm"
        footer={
          <>
            <button
              onClick={() => setEndConfirmOpen(false)}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={() => { setEndConfirmOpen(false); endMutation.mutate() }}
              disabled={endMutation.isPending}
              className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold text-sm disabled:opacity-50"
            >
              {endMutation.isPending ? 'Ending…' : 'Yes, End Session'}
            </button>
          </>
        }
      >
        <div className="space-y-3 py-1">
          <p className="text-gray-700 text-sm">
            This will free <span className="font-semibold">Table {session?.table_number}</span> for new customers immediately.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            The session and all its orders will be saved. You can still bill it from the <span className="font-semibold">Pending Bills</span> section on the tables page.
          </div>
        </div>
      </Modal>
    </div>
  )
}
