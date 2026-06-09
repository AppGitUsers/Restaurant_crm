import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { menuAPI, billingAPI } from '@/api'
import { useCartStore } from '@/store/cartStore'
import { PageLoader, Modal, SearchBar, Empty } from '@/components/ui'
import toast from 'react-hot-toast'
import {
  ShoppingCart, Plus, Minus, Trash2, UtensilsCrossed,
  CheckCircle, Printer, X, Receipt
} from 'lucide-react'

// ── Food card ─────────────────────────────────────────
function FoodCard({ item, onAdd }) {
  const cartItem = useCartStore(s => s.items.find(i => i.food_item.id === item.id))
  const cartQty  = cartItem?.quantity || 0
  const hasStock = item.is_available && item.makeable_count > 0
  const atMax    = hasStock && cartQty >= item.makeable_count
  const available = hasStock && !atMax

  const overlayLabel = !hasStock ? 'Out of Stock' : 'Max Added'

  return (
    <div
      onClick={() => available && onAdd(item)}
      className={`card-sm flex flex-col gap-2 select-none transition-all
        ${available ? 'cursor-pointer hover:border-primary-300 hover:shadow-md active:scale-[0.98]' : 'opacity-50 cursor-not-allowed'}
        ${cartItem ? 'border-primary-300 ring-1 ring-primary-200' : ''}`}
    >
      <div className="relative w-full h-28 rounded-lg bg-primary-50 overflow-hidden flex items-center justify-center">
        {item.photo_url
          ? <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover" />
          : <UtensilsCrossed size={28} className="text-primary-200" />
        }
        {(!available) && (
          <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center rounded-lg">
            <span className="text-white text-xs font-semibold bg-red-500 px-2 py-0.5 rounded-full">{overlayLabel}</span>
          </div>
        )}
        {cartItem && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">{cartItem.quantity}</span>
          </div>
        )}
        {hasStock && (
          <div className="absolute bottom-1.5 right-1.5 bg-white rounded-full px-1.5 py-0.5 text-xs text-primary-600 font-semibold shadow">
            {item.makeable_count - cartQty}✓
          </div>
        )}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-gray-800 text-sm line-clamp-1">{item.name}</p>
        <p className="text-xs text-gray-400">{item.food_type_icon} {item.food_type_name}</p>
      </div>
      <p className="font-bold text-primary-500">₹{parseFloat(item.price).toFixed(2)}</p>
    </div>
  )
}

// ── Cart panel ────────────────────────────────────────
function CartPanel({ onPlaceOrder }) {
  const {
    items, removeItem, updateQty,
    customerName, customerPhone, paymentMethod, discount,
    setCustomer, setPaymentMethod, setDiscount,
    getSubtotal, getTax, getTotal, clearCart,
  } = useCartStore()

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-300 py-20">
        <ShoppingCart size={48} className="mb-3 opacity-40" />
        <p className="text-sm">Cart is empty</p>
        <p className="text-xs mt-1">Click items to add</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Items */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {items.map(({ food_item, quantity, unit_price }) => (
          <div key={food_item.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{food_item.name}</p>
              <p className="text-xs text-gray-400">₹{unit_price.toFixed(2)} each</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => updateQty(food_item.id, quantity - 1)} className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-primary-100 transition-colors">
                <Minus size={11} />
              </button>
              <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
              <button
                onClick={() => updateQty(food_item.id, quantity + 1)}
                disabled={food_item.makeable_count > 0 && quantity >= food_item.makeable_count}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors
                  ${food_item.makeable_count > 0 && quantity >= food_item.makeable_count
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-gray-200 hover:bg-primary-100'}`}
              >
                <Plus size={11} />
              </button>
            </div>
            <p className="text-sm font-semibold text-gray-700 w-16 text-right">₹{(quantity * unit_price).toFixed(2)}</p>
            <button onClick={() => removeItem(food_item.id)} className="text-red-300 hover:text-red-500 ml-1">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Customer */}
      <div className="divider" />
      <div className="space-y-2">
        <input className="input-sm" placeholder="Customer name (optional)" value={customerName} onChange={e => setCustomer(e.target.value, customerPhone)} />
        <input className="input-sm" placeholder="Phone (optional)" value={customerPhone} onChange={e => setCustomer(customerName, e.target.value)} />
        <div className="flex gap-2">
          <select className="select text-xs py-1.5 flex-1" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="OTHER">Other</option>
          </select>
          <input type="number" className="input-sm w-24" placeholder="Discount ₹" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      {/* Totals */}
      <div className="mt-3 space-y-1.5 text-sm border-t border-gray-100 pt-3">
        <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>₹{getSubtotal().toFixed(2)}</span></div>
        {discount > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>-₹{discount.toFixed(2)}</span></div>}
        <div className="flex justify-between text-gray-600"><span>Tax (5%)</span><span>₹{getTax().toFixed(2)}</span></div>
        <div className="flex justify-between text-base font-bold text-primary-600 pt-1 border-t border-gray-100">
          <span>Total</span><span>₹{getTotal().toFixed(2)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <button onClick={clearCart} className="btn-ghost flex-1 justify-center text-xs py-2"><X size={13} />Clear</button>
        <button onClick={onPlaceOrder} className="btn-primary flex-1 justify-center py-2"><Receipt size={14} />Confirm &amp; Pay</button>
      </div>
    </div>
  )
}

// ── Bill modal ────────────────────────────────────────
function BillModal({ order, onClose }) {
  if (!order) return null

  const downloadPdf = async () => {
    try {
      const { data } = await billingAPI.orders.billPdf(order.id)
      const url      = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
      const a        = document.createElement('a')
      a.href         = url
      a.download     = `bill_${order.order_number}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('PDF download failed')
    }
  }

  return (
    <Modal open={!!order} onClose={onClose} title="Bill Receipt" size="md"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Close</button>
        <button onClick={downloadPdf} className="btn-primary"><Printer size={15} />Download PDF</button>
      </>}
    >
      <div className="text-center mb-5">
        <CheckCircle size={44} className="text-primary-400 mx-auto mb-2" />
        <p className="font-bold text-lg text-gray-800">Payment Successful!</p>
        <p className="text-sm text-gray-400">Bill No: {order.order_number}</p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm mb-4">
        {order.customer_name && <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-medium">{order.customer_name}</span></div>}
        {order.customer_phone && <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{order.customer_phone}</span></div>}
        <div className="flex justify-between"><span className="text-gray-500">Payment</span><span className="badge-green">{order.payment_method}</span></div>
      </div>

      <div className="space-y-2 text-sm">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between">
            <span className="text-gray-700">{item.food_item_name} × {item.quantity}</span>
            <span className="font-medium">₹{parseFloat(item.line_total).toFixed(2)}</span>
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

// ── Main BillingPage ──────────────────────────────────
export default function BillingPage() {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [typeFilter, setType] = useState('')
  const [billOrder, setBill]  = useState(null)
  const { addItem, getItemCount } = useCartStore()

  const handleAdd = (item) => {
    const ok = addItem(item)
    if (!ok) toast.error(`Only ${item.makeable_count} available — already at max`)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['billing-items', search, typeFilter],
    queryFn:  () => menuAPI.items.list({
      search,
      food_type: typeFilter || undefined,
      is_active: true,
    }).then(r => r.data.results || r.data),
    refetchInterval: 30_000,
  })

  const { data: types } = useQuery({
    queryKey: ['food-types'],
    queryFn:  () => menuAPI.types.list({ is_active: true }).then(r => r.data.results || r.data),
  })

  const placeOrder = useMutation({
    mutationFn: async () => {
      const { items, customerName, customerPhone, paymentMethod, discount, taxPercent } = useCartStore.getState()
      const payload = {
        customer_name:  customerName,
        customer_phone: customerPhone,
        payment_method: paymentMethod,
        discount,
        tax_percent: taxPercent,
        items: items.map(i => ({
          food_item:  i.food_item.id,
          quantity:   i.quantity,
          unit_price: i.unit_price,
        })),
      }
      const { data: order } = await billingAPI.orders.create(payload)
      const { data: paid  } = await billingAPI.orders.pay(order.id, { payment_method: paymentMethod })
      return paid
    },
    onSuccess: (order) => {
      useCartStore.getState().clearCart()
      setBill(order)
      qc.invalidateQueries(['billing-items'])
      toast.success('Order placed and paid!')
    },
    onError: () => toast.error('Order failed. Check stock availability.'),
  })

  const items = data || []
  const typesList = types || []
  const cartCount = getItemCount()

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Menu grid */}
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[180px]">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search menu…" className="input pl-8" />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setType('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === '' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              All
            </button>
            {typesList.map(t => (
              <button key={t.id} onClick={() => setType(String(t.id))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === String(t.id) ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t.icon} {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? <PageLoader /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {items.map(item => (
                <FoodCard key={item.id} item={item} onAdd={handleAdd} />
              ))}
              {items.length === 0 && (
                <div className="col-span-5">
                  <Empty message="No items found" icon={<UtensilsCrossed size={48} />} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-80 flex-shrink-0 bg-white border-l border-gray-100 flex flex-col p-4 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-primary-500" />
            <span className="font-semibold text-gray-800">Cart</span>
          </div>
          {cartCount > 0 && (
            <span className="w-5 h-5 bg-gold-300 text-white rounded-full text-xs flex items-center justify-center font-bold">
              {cartCount}
            </span>
          )}
        </div>
        <CartPanel onPlaceOrder={() => placeOrder.mutate()} />
      </div>

      {/* Bill receipt modal */}
      <BillModal order={billOrder} onClose={() => setBill(null)} />
    </div>
  )
}
