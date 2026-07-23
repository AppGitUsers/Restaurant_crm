import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tablesAPI, menuAPI, customersAPI, settingsAPI, billingAPI } from '@/api'
import { PageLoader, Modal, Field } from '@/components/ui'
import { ArrowLeft, Plus, Minus, CreditCard, ChefHat, Check, Loader2, CheckCircle, MessageCircle, Printer, X, Lock } from 'lucide-react'
import { formatDistanceToNow, parseISO, format } from 'date-fns'
import toast from 'react-hot-toast'

const BATCH_STATUS_STYLE = {
  PENDING_PAYMENT: 'bg-purple-100 text-purple-700',
  PENDING:         'bg-amber-100 text-amber-700',
  PREPARING:       'bg-blue-100 text-blue-700',
  SERVED:          'bg-green-100 text-green-700',
}

const BATCH_STATUS_LABEL = {
  PENDING_PAYMENT: 'Awaiting Payment',
  PENDING:         'Pending',
  PREPARING:       'Preparing',
  SERVED:          'Served',
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
function BillModal({ open, onClose, session, gstRate, onBill, title = 'Collect Payment' }) {
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
      title={title}
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
              type="tel"
              inputMode="numeric"
              maxLength={15}
              className="input"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
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
function printBill(order) {
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  const items   = order.items || []
  const sub     = parseFloat(order.subtotal    || 0)
  const disc    = parseFloat(order.discount    || 0)
  const tax     = parseFloat(order.tax_amount  || 0)
  const total   = parseFloat(order.total_amount || 0)

  const rows = items.map(item => {
    const name = item.food_item_name || item.name || 'Item'
    return `<tr>
      <td>${name}${item.notes ? `<br/><span class="note">&#x21B3; ${item.notes}</span>` : ''}</td>
      <td class="c">&#xD7;${item.quantity}</td>
      <td class="r">&#x20B9;${parseFloat(item.line_total || 0).toFixed(2)}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Receipt ${order.order_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:6mm 4mm}
.ctr{text-align:center}.bold{font-weight:bold}
.dash{border-top:1px dashed #000;margin:5px 0}
table{width:100%;border-collapse:collapse}
td,th{vertical-align:top;padding:1px 0;font-size:11px}
.c{text-align:center;width:28px}.r{text-align:right;width:64px}
.note{font-size:10px;color:#555}
.sum{display:flex;justify-content:space-between;padding:1px 0;font-size:11px}
.tot{font-size:14px;font-weight:bold}
</style></head><body>
<div class="ctr bold" style="font-size:15px;margin-bottom:2px">BILL RECEIPT</div>
<div class="ctr" style="font-size:10px;margin-bottom:6px">${dateStr} &nbsp; ${timeStr}</div>
<div class="dash"></div>
<div style="font-size:11px;margin-bottom:4px">
  <div><b>Bill No:</b> ${order.order_number}</div>
  ${order.customer_name  ? `<div><b>Customer:</b> ${order.customer_name}</div>`  : ''}
  ${order.customer_phone ? `<div><b>Phone:</b> ${order.customer_phone}</div>` : ''}
</div>
<div class="dash"></div>
<table><thead><tr style="opacity:0.6;font-size:10px;text-transform:uppercase">
  <th style="text-align:left;padding-bottom:3px">Item</th><th class="c">Qty</th><th class="r">Amt</th>
</tr></thead><tbody>${rows}</tbody></table>
<div class="dash"></div>
<div class="sum"><span>Subtotal</span><span>&#x20B9;${sub.toFixed(2)}</span></div>
${disc > 0 ? `<div class="sum"><span>Discount</span><span>-&#x20B9;${disc.toFixed(2)}</span></div>` : ''}
<div class="sum"><span>Tax</span><span>&#x20B9;${tax.toFixed(2)}</span></div>
<div class="dash"></div>
<div class="sum tot"><span>TOTAL</span><span>&#x20B9;${total.toFixed(2)}</span></div>
<div class="dash"></div>
<div class="sum" style="font-size:11px"><span>Payment</span><span>${order.payment_method || ''}</span></div>
<div class="dash"></div>
<div class="ctr" style="margin-top:8px;font-size:11px">Thank you! Visit again &#x1F64F;</div><br/>
</body></html>`

  const w = window.open('', '_blank', 'width=360,height=600,menubar=no,toolbar=no')
  if (!w) { toast.error('Allow pop-ups to print the receipt'); return }
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
  w.onafterprint = () => w.close()
}

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
    if (order.share_token)
      lines.push(`\n📄 View your bill: ${window.location.origin}/receipt/${order.share_token}`)

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
        <button onClick={() => printBill(order)} className="btn-secondary flex items-center gap-1.5">
          <Printer size={15} />Print
        </button>
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

// ── Biller Item Action Modal ─────────────────────────────────────────────────
// Handles both cancel and reduce for PENDING_PAYMENT batch items.
function BillerItemActionModal({ open, onClose, item, sessionId, onDone }) {
  const [action,        setAction]        = useState('cancel')  // 'cancel' | 'reduce'
  const [newQty,        setNewQty]        = useState(1)
  const [pin,           setPin]           = useState('')
  const [restoreStock,  setRestoreStock]  = useState(false)
  const [busy,          setBusy]          = useState(false)
  const qc = useQueryClient()

  // Reset state whenever the modal opens on a new item
  useEffect(() => {
    if (open) { setAction('cancel'); setPin(''); setNewQty(1); setRestoreStock(false) }
  }, [open, item?.id])

  if (!item) return null

  const itemName = item.food_item_name
  const maxQty   = item.quantity - 1  // reduce must result in at least 1

  const handleSubmit = async () => {
    if (!pin) { toast.error('Enter your PIN'); return }
    if (action === 'reduce' && (newQty < 1 || newQty >= item.quantity)) {
      toast.error(`New quantity must be between 1 and ${item.quantity - 1}`)
      return
    }
    setBusy(true)
    try {
      if (action === 'cancel') {
        await tablesAPI.biller.cancelItem(item.id, pin, restoreStock)
        toast.success(`${itemName} removed from order`)
      } else {
        await tablesAPI.biller.reduceItem(item.id, newQty, pin, restoreStock)
        toast.success(`${itemName} quantity reduced to ${newQty}`)
      }
      qc.invalidateQueries(['table-session', sessionId])
      onDone()
      onClose()
    } catch (err) {
      const msg = err?.response?.data?.error
      toast.error(msg || 'Action failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Modify Customer Order" size="sm"
      footer={<>
        <button onClick={onClose} className="btn-ghost" disabled={busy}>Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={busy || !pin}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40 transition-colors ${
            action === 'cancel' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'
          }`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          {action === 'cancel' ? 'Remove Item' : 'Reduce Qty'}
        </button>
      </>}
    >
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
          <p className="font-semibold text-gray-800">{itemName}</p>
          <p className="text-gray-400 text-xs mt-0.5">Current quantity: {item.quantity}</p>
        </div>

        {/* Action toggle */}
        <div className="flex gap-2">
          {['cancel', 'reduce'].map(a => (
            <button
              key={a}
              onClick={() => setAction(a)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                action === a
                  ? a === 'cancel'
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-amber-500 text-white border-amber-500'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400'
              }`}
            >
              {a === 'cancel' ? 'Remove Item' : 'Reduce Qty'}
            </button>
          ))}
        </div>

        {/* Quantity input for reduce */}
        {action === 'reduce' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New Quantity</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setNewQty(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                <Minus size={14} />
              </button>
              <span className="w-8 text-center font-bold text-gray-800 text-lg">{newQty}</span>
              <button
                onClick={() => setNewQty(q => Math.min(maxQty, q + 1))}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                <Plus size={14} />
              </button>
              <span className="text-xs text-gray-400 ml-1">(max {maxQty})</span>
            </div>
          </div>
        )}

        {/* Restore stock toggle */}
        <button
          type="button"
          onClick={() => setRestoreStock(s => !s)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
            restoreStock
              ? 'bg-green-50 border-green-300 text-green-700'
              : 'bg-gray-50 border-gray-200 text-gray-500'
          }`}
        >
          <span className="text-sm font-medium">Restore stock to inventory?</span>
          <div className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${restoreStock ? 'bg-green-500' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${restoreStock ? 'left-5' : 'left-0.5'}`} />
          </div>
        </button>
        <p className="text-xs text-gray-400 -mt-2">
          {restoreStock
            ? 'Stock will be added back — use this if the item was cancelled before reaching the kitchen.'
            : 'Stock stays deducted — use this if the ingredient was already used or wasted.'}
        </p>

        {/* PIN input */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            <Lock size={11} className="inline mr-1" />Your PIN (login password)
          </label>
          <input
            type="password"
            className="input"
            placeholder="••••••"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
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

  const [discount,            setDiscount]            = useState(0)
  const [addOpen,             setAddOpen]             = useState(false)
  const [billOpen,            setBillOpen]            = useState(false)
  const [releaseConfirmOpen,  setReleaseConfirmOpen]  = useState(false)
  const [billedOrder,         setBilledOrder]         = useState(null)
  const [itemActionItem,      setItemActionItem]      = useState(null)

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

  // Release PENDING_PAYMENT batches to kitchen (payment already collected, session stays open)
  const releaseMutation = useMutation({
    mutationFn: () => tablesAPI.bill(sessionId, {}),
    onSuccess: () => {
      qc.invalidateQueries(['table-session', sessionId])
      qc.invalidateQueries(['tables-grid'])
      toast.success('Order sent to kitchen.')
    },
    onError: (err) => {
      const msg = err?.response?.data?.error
      toast.error(msg || 'Failed to release order.')
    },
  })

  // End session with final billing — creates Order, fires signal, closes session
  const endMutation = useMutation({
    mutationFn: (data) => tablesAPI.endSession(sessionId, { ...data, discount }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tables-grid'] })
      if (res.data?.order_number) {
        setBilledOrder(res.data)
      } else {
        toast.success('Session ended — table is free for new customers.')
        navigate('/billing/tables')
      }
    },
    onError: (err) => {
      const msg = err?.response?.data?.error
      toast.error(msg || 'Failed to end session.')
    },
  })

  if (isLoading) return <PageLoader />
  if (!session)  return <div className="p-8 text-gray-400 text-center">Session not found.</div>

  if (session.status === 'OPEN' && session.item_count === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <ChefHat size={32} className="text-green-500" />
        </div>
        <div>
          <p className="font-bold text-gray-800 text-lg">Table {session.table_number}</p>
          <p className="text-gray-400 text-sm mt-1">No items yet — all orders were cancelled.</p>
          <p className="text-gray-400 text-xs mt-0.5">Waiting for the customer to place a new order.</p>
        </div>
        <button onClick={() => navigate('/billing/tables')} className="btn-ghost mt-2">
          <ArrowLeft size={15} /> Back to Tables
        </button>
      </div>
    )
  }

  const isBilled          = session.status === 'BILLED'
  const subtotal          = parseFloat(session.subtotal)
  const disc              = parseFloat(discount) || 0
  const taxable           = Math.max(0, subtotal - disc)
  const tax               = taxable * gstRate
  const total             = taxable + tax
  const hasPendingPayment = session.batches.some(b => b.status === 'PENDING_PAYMENT')
  const pendingPaymentTotal = session.batches
    .filter(b => b.status === 'PENDING_PAYMENT')
    .reduce((sum, batch) =>
      sum + batch.items
        .filter(item => !item.cancelled_by_kitchen)
        .reduce((s, item) => s + parseFloat(item.line_total), 0),
      0)

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
              onClick={() => setBillOpen(true)}
              disabled={hasPendingPayment || endMutation.isPending}
              title={hasPendingPayment ? 'Release all pending payment orders first' : ''}
              className="py-1.5 px-3 text-sm rounded-lg border border-red-200 text-red-500 hover:bg-red-50 font-medium flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
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
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BATCH_STATUS_STYLE[batch.status] || 'bg-gray-100 text-gray-600'}`}>
                  {BATCH_STATUS_LABEL[batch.status] || batch.status}
                </span>
                {batch.added_by === 'BILLER' && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Biller</span>
                )}
                {batch.status === 'PENDING_PAYMENT' && batch.added_by !== 'BILLER' && (
                  <span className="text-xs text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">Customer</span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                {format(parseISO(batch.placed_at), 'hh:mm a')}
              </span>
            </div>
            <div className="space-y-1.5">
              {batch.items.map(item => {
                const cancelled        = item.cancelled_by_kitchen
                const canBillerModify  = !cancelled && batch.status === 'PENDING_PAYMENT' && !isBilled
                return (
                  <div key={item.id} className={`flex items-center justify-between text-sm ${cancelled ? 'opacity-50' : ''}`}>
                    <span className={cancelled ? 'line-through text-gray-400' : 'text-gray-700'}>
                      {item.food_item_name}
                      {!cancelled && item.addon_unit_price > 0 && (
                        <span className="text-xs text-primary-400 ml-1">(+add-ons)</span>
                      )}
                      {cancelled && (
                        <span className="text-xs text-red-400 ml-1 no-underline">(Cancelled)</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">×{item.quantity}</span>
                      <span className={`font-medium w-20 text-right ${cancelled ? 'line-through text-red-300' : 'text-gray-700'}`}>
                        ₹{parseFloat(item.line_total).toLocaleString()}
                      </span>
                      {canBillerModify && (
                        <button
                          onClick={() => setItemActionItem(item)}
                          className="w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 flex items-center justify-center transition-colors flex-shrink-0"
                          title="Modify item"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
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
          {/* Per-batch breakdown */}
          {session.batches.length > 0 && (
            <div className="space-y-1">
              {session.batches.map((batch, idx) => {
                const batchTotal = batch.items
                  .filter(item => !item.cancelled_by_kitchen)
                  .reduce((s, item) => s + parseFloat(item.line_total), 0)
                if (batchTotal === 0) return null
                return (
                  <div key={batch.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">
                      Round {idx + 1}
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full ${BATCH_STATUS_STYLE[batch.status] || 'bg-gray-100 text-gray-500'}`}>
                        {BATCH_STATUS_LABEL[batch.status] || batch.status}
                      </span>
                    </span>
                    <span className="text-gray-500">₹{batchTotal.toFixed(2)}</span>
                  </div>
                )
              })}
              <div className="border-t border-gray-100 pt-2 flex items-center justify-between text-sm font-medium">
                <span className="text-gray-600">Session Total</span>
                <span>₹{subtotal.toLocaleString()}</span>
              </div>
            </div>
          )}

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
          {hasPendingPayment && pendingPaymentTotal > 0 && (
            <button
              onClick={() => setReleaseConfirmOpen(true)}
              disabled={releaseMutation.isPending}
              className="btn-primary w-full justify-center text-base py-3 disabled:opacity-40"
            >
              {releaseMutation.isPending
                ? <><Loader2 size={16} className="animate-spin" /> Releasing…</>
                : <><ChefHat size={16} /> Release to Kitchen — ₹{pendingPaymentTotal.toFixed(2)} collected</>
              }
            </button>
          )}
        </div>
      )}

      {isBilled && (
        <div className="bg-green-50 border-t border-green-200 p-4 flex items-center justify-center gap-2 flex-shrink-0">
          <Check size={16} className="text-green-600" />
          <span className="text-green-700 font-semibold text-sm">Session billed and closed</span>
        </div>
      )}

      <BillerItemActionModal
        open={!!itemActionItem}
        onClose={() => setItemActionItem(null)}
        item={itemActionItem}
        sessionId={sessionId}
        onDone={() => setItemActionItem(null)}
      />
      <AddItemsModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        sessionId={sessionId}
      />
      <Modal
        open={releaseConfirmOpen}
        onClose={() => setReleaseConfirmOpen(false)}
        title="Release to Kitchen"
        size="sm"
        footer={
          <>
            <button onClick={() => setReleaseConfirmOpen(false)} className="btn-ghost">Cancel</button>
            <button
              onClick={() => { setReleaseConfirmOpen(false); releaseMutation.mutate() }}
              disabled={releaseMutation.isPending}
              className="btn-primary disabled:opacity-50"
            >
              <ChefHat size={14} /> Yes, Release
            </button>
          </>
        }
      >
        <div className="space-y-2 py-1">
          <p className="text-gray-700 text-sm">
            Confirm you have collected <span className="font-bold text-gray-900">₹{pendingPaymentTotal.toFixed(2)}</span> from the customer.
          </p>
          <p className="text-gray-400 text-xs">
            The order will be sent to the kitchen immediately and can no longer be modified by the biller.
          </p>
        </div>
      </Modal>

      <BillModal
        open={billOpen}
        onClose={() => setBillOpen(false)}
        session={{ ...session, discount }}
        gstRate={gstRate}
        title="End Session — Final Bill"
        onBill={(data) => { setBillOpen(false); endMutation.mutate(data) }}
      />
      <TableBillReceiptModal
        open={!!billedOrder}
        onClose={() => { setBilledOrder(null); navigate('/billing/tables') }}
        order={billedOrder}
      />
    </div>
  )
}
