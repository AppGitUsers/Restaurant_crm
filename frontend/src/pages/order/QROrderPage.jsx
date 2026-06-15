import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { tablesAPI } from '@/api'
import {
  ShoppingCart, Plus, Minus, ChevronRight, Loader2,
  CheckCircle2, AlertTriangle, UtensilsCrossed, X,
  Sparkles, Check, Wand2, ClipboardList, Clock, ChefHat,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rupees = (n) => `₹${parseFloat(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

function genId() { return Math.random().toString(36).slice(2) }

// Same cartId scheme as biller: keyed by foodItemId + sorted addon IDs
const addonSig = (addons) =>
  addons?.length ? [...addons].sort((a, b) => a.id - b.id).map(a => a.id).join('-') : ''
const makeCartId = (foodItemId, addons) => {
  const sig = addonSig(addons)
  return sig ? `${foodItemId}::${sig}` : String(foodItemId)
}

/** How many of a given food item are already reserved in the cart */
function cartUsed(cart, itemId) {
  return cart.reduce((t, ci) => {
    if (ci.is_custom) {
      return t + (ci.components || []).filter(c => c.id === itemId).length * ci.quantity
    }
    if (ci.food_item?.is_combo) {
      return t + (ci.food_item.combo_components || []).filter(cc => cc.component === itemId).length * ci.quantity
    }
    return (ci.food_item?.id === itemId ? t + ci.quantity : t)
  }, 0)
}

function itemAvailable(item, cart) {
  if (!item.is_available) return false
  if (!item.tracks_stock) return true
  return (item.makeable_count - cartUsed(cart, item.id)) > 0
}

function remainingCount(item, cart) {
  if (!item.tracks_stock) return null
  return item.makeable_count - cartUsed(cart, item.id)
}

// ─── Fetch hook ───────────────────────────────────────────────────────────────

function usePublicMenu(token) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const refetch = () => {
    setLoading(true)
    tablesAPI.public.menu(token)
      .then(r  => { setData(r.data); setError(null) })
      .catch(() => setError('Table not found or QR code is invalid.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refetch() }, [token])  // eslint-disable-line
  return { data, loading, error, refetch }
}

// ─── Addon picker modal ───────────────────────────────────────────────────────

function AddonPickerModal({ item, existingAddons, onSave, onClose }) {
  const availableAddons = (item?.food_type_addons || []).filter(a => a.is_active !== false)
  const [selected, setSelected] = useState(existingAddons || [])

  const toggle = (addon) => {
    const exists = selected.find(a => a.id === addon.id)
    setSelected(exists ? selected.filter(a => a.id !== addon.id) : [...selected, addon])
  }
  const isSelected = (id) => selected.some(a => a.id === id)
  const totalCost  = selected.reduce((s, a) => s + (a.is_costed ? parseFloat(a.price) : 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Add-ons — {item?.name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={18} className="text-gray-500" /></button>
        </div>
        <div className="overflow-y-auto max-h-72 px-4 py-3 space-y-2">
          <p className="text-xs text-gray-400 mb-2">Costed add-ons will be charged extra.</p>
          {availableAddons.map(addon => (
            <div key={addon.id}
              onClick={() => toggle(addon)}
              className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-colors
                ${isSelected(addon.id) ? 'border-primary-400 bg-primary-50' : 'border-gray-100 hover:border-gray-200'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                  ${isSelected(addon.id) ? 'border-primary-500 bg-primary-500' : 'border-gray-300'}`}>
                  {isSelected(addon.id) && <Check size={11} className="text-white" />}
                </div>
                <span className="text-sm font-medium text-gray-700">{addon.name}</span>
              </div>
              <span className={`text-sm font-semibold ${addon.is_costed ? 'text-primary-600' : 'text-gray-400'}`}>
                {addon.is_costed ? `+₹${parseFloat(addon.price).toFixed(2)}` : 'Free'}
              </span>
            </div>
          ))}
          {availableAddons.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No add-ons available.</p>}
        </div>
        {totalCost > 0 && (
          <div className="mx-4 mb-2 flex justify-between items-center text-sm font-semibold text-primary-700 bg-primary-50 rounded-xl px-4 py-2.5">
            <span>Add-ons total</span><span>+₹{totalCost.toFixed(2)}</span>
          </div>
        )}
        <div className="px-4 pb-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm">Cancel</button>
          <button
            onClick={() => { onSave(selected); onClose() }}
            className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-semibold text-sm"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Customize modal ──────────────────────────────────────────────────────────

function CustomizeModal({ customizableTypes, cart, onClose, onAdd }) {
  const [selected,      setSelected]  = useState({})   // { typeId: foodItemObj }
  const [selectedAddons, setAddons]   = useState([])

  // All items across all customizable types (for cartUsed calculations)
  const allItems = customizableTypes.flatMap(t => t.items || [])

  const localCartUsed = (itemId) => cartUsed(cart, itemId)

  // Addons: union of all addons from types that allow_addons
  const availableAddons = (() => {
    const map = new Map()
    customizableTypes.filter(t => t.allow_addons).forEach(t =>
      (t.addons || []).forEach(a => map.set(a.id, a))
    )
    return [...map.values()]
  })()

  const toggleItem = (typeId, item) => {
    setSelected(prev => {
      if (prev[typeId]?.id === item.id) {
        const next = { ...prev }; delete next[typeId]; return next
      }
      return { ...prev, [typeId]: item }
    })
  }

  const toggleAddon = (addon) => {
    setAddons(prev => prev.find(a => a.id === addon.id) ? prev.filter(a => a.id !== addon.id) : [...prev, addon])
  }

  const components   = Object.values(selected)
  const canAdd       = components.length >= 2
  const basePrice    = components.reduce((s, c) => s + parseFloat(c.price), 0)
  const addonCost    = selectedAddons.reduce((s, a) => s + (a.is_costed ? parseFloat(a.price) : 0), 0)
  const totalPrice   = basePrice + addonCost
  const customName   = components.map(c => c.name).join(' + ')

  const handleAdd = () => {
    if (!canAdd) return
    onAdd(components, selectedAddons, customName)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-t-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><Wand2 size={18} className="text-amber-500" /> Customize Your Order</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={18} className="text-gray-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
          {customizableTypes.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <Wand2 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No customizable categories available.</p>
            </div>
          ) : (
            <>
              {customizableTypes.map(type => {
                const selItem = selected[type.id]
                return (
                  <div key={type.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{type.icon}</span>
                      <h4 className="font-semibold text-gray-700 text-sm">{type.name}</h4>
                      <span className="text-xs text-gray-400">(pick one)</span>
                    </div>
                    {(type.items || []).length === 0 ? (
                      <p className="text-xs text-gray-400 py-2 ml-6">No available items</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {(type.items || []).map(item => {
                          const isSel          = selItem?.id === item.id
                          const used           = localCartUsed(item.id)
                          const effectiveAvail = item.tracks_stock ? (item.makeable_count - used) : Infinity
                          const outOfStock     = item.tracks_stock
                            ? (!item.is_available || effectiveAvail <= 0)
                            : !item.is_available
                          return (
                            <div
                              key={item.id}
                              onClick={() => !outOfStock && toggleItem(type.id, item)}
                              className={`relative p-3 rounded-xl border-2 transition-all select-none
                                ${outOfStock
                                  ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                                  : isSel
                                    ? 'border-primary-400 bg-primary-50 cursor-pointer'
                                    : 'border-gray-100 bg-white cursor-pointer'}`}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <p className={`text-sm font-medium line-clamp-2 flex-1 ${outOfStock ? 'text-gray-400' : 'text-gray-800'}`}>{item.name}</p>
                                {outOfStock ? (
                                  <span className="text-xs text-red-400 font-semibold flex-shrink-0">Out</span>
                                ) : (
                                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center
                                    ${isSel ? 'border-primary-500 bg-primary-500' : 'border-gray-300'}`}>
                                    {isSel && <Check size={9} className="text-white" />}
                                  </div>
                                )}
                              </div>
                              <p className={`text-xs font-bold mt-1 ${outOfStock ? 'text-gray-400' : 'text-primary-500'}`}>
                                {rupees(item.price)}
                                {!outOfStock && item.tracks_stock && effectiveAvail < 5 && (
                                  <span className="ml-1 text-[10px] text-orange-500">({effectiveAvail})</span>
                                )}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {availableAddons.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={14} className="text-primary-400" />
                    <h4 className="font-semibold text-gray-700 text-sm">Add-ons (optional)</h4>
                  </div>
                  <div className="space-y-1.5">
                    {availableAddons.map(addon => (
                      <div
                        key={addon.id}
                        onClick={() => toggleAddon(addon)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border-2 cursor-pointer transition-colors
                          ${selectedAddons.find(a => a.id === addon.id) ? 'border-primary-400 bg-primary-50' : 'border-gray-100'}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0
                            ${selectedAddons.find(a => a.id === addon.id) ? 'border-primary-500 bg-primary-500' : 'border-gray-300'}`}>
                            {selectedAddons.find(a => a.id === addon.id) && <Check size={9} className="text-white" />}
                          </div>
                          <span className="text-sm text-gray-700">{addon.name}</span>
                        </div>
                        <span className={`text-xs font-semibold ${addon.is_costed ? 'text-primary-600' : 'text-gray-400'}`}>
                          {addon.is_costed ? `+₹${parseFloat(addon.price).toFixed(2)}` : 'Free'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {components.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800 line-clamp-1">{customName}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-amber-600">
                      Base {rupees(basePrice)}{addonCost > 0 ? ` + Add-ons ${rupees(addonCost)}` : ''}
                    </p>
                    <p className="text-sm font-bold text-amber-700">{rupees(totalPrice)}</p>
                  </div>
                  {!canAdd && <p className="text-xs text-amber-500 mt-0.5">Select from at least 2 categories to continue</p>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 pb-4 pt-2 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="w-full bg-amber-500 disabled:opacity-40 text-white font-bold py-4 rounded-2xl text-base
                       flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Wand2 size={18} />
            {canAdd ? `Add to Order · ${rupees(totalPrice)}` : 'Select from 2+ categories'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── My Orders (read-only session history) ────────────────────────────────────

const STATUS_META = {
  PENDING:   { label: 'Pending',   icon: Clock,       color: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  PREPARING: { label: 'Preparing', icon: ChefHat,     color: 'text-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  SERVED:    { label: 'Served',    icon: CheckCircle2, color: 'text-green-500',  bg: 'bg-green-50',  border: 'border-green-200' },
}

function MyOrders({ orders, gstRate }) {
  if (!orders || orders.length === 0) return null

  const grandSubtotal = orders.reduce((sum, batch) =>
    sum + batch.items.reduce((s, it) => s + it.quantity * (it.unit_price + it.addon_unit_price), 0), 0)
  const grandTax   = grandSubtotal * gstRate
  const grandTotal = grandSubtotal + grandTax

  return (
    <div className="px-4 mt-6 mb-2">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={16} className="text-primary-500" />
        <h3 className="font-bold text-gray-800 text-base">My Orders</h3>
      </div>

      <div className="space-y-3">
        {orders.map((batch, idx) => {
          const meta      = STATUS_META[batch.status] || STATUS_META.PENDING
          const Icon      = meta.icon
          const subtotal  = batch.items.reduce((s, it) => s + it.quantity * (it.unit_price + it.addon_unit_price), 0)

          return (
            <div key={batch.id} className={`rounded-2xl border ${meta.border} ${meta.bg} overflow-hidden`}>
              {/* Batch header */}
              <div className={`flex items-center justify-between px-4 py-2.5 border-b ${meta.border}`}>
                <span className="text-sm font-semibold text-gray-700">Order {idx + 1}</span>
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${meta.color}`}>
                  <Icon size={13} />{meta.label}
                </span>
              </div>

              {/* Items */}
              <div className="px-4 py-2 space-y-2">
                {batch.items.map((it, i) => {
                  const lineTotal = it.quantity * (it.unit_price + it.addon_unit_price)
                  return (
                    <div key={i} className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {it.is_custom && <Wand2 size={11} className="text-amber-500 flex-shrink-0" />}
                          <p className="text-sm font-medium text-gray-800 leading-tight">{it.name}</p>
                          <span className="text-xs text-gray-400">×{it.quantity}</span>
                        </div>
                        {it.addon_unit_price > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {rupees(it.unit_price)} + {rupees(it.addon_unit_price)} add-ons
                          </p>
                        )}
                        {it.notes ? (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{it.notes}</p>
                        ) : null}
                      </div>
                      <span className="text-sm font-semibold text-gray-700 flex-shrink-0">{rupees(lineTotal)}</span>
                    </div>
                  )
                })}
              </div>

              {/* Batch subtotal */}
              <div className={`flex justify-between items-center px-4 py-2 border-t ${meta.border}`}>
                <span className="text-xs text-gray-500">Batch subtotal</span>
                <span className="text-sm font-bold text-gray-700">{rupees(subtotal)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Grand total */}
      <div className="mt-3 bg-gray-800 rounded-2xl px-4 py-3 space-y-1.5">
        <div className="flex justify-between text-sm text-gray-300">
          <span>Subtotal</span><span>{rupees(grandSubtotal)}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Tax ({(gstRate * 100).toFixed(0)}%)</span><span>≈ {rupees(grandTax)}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-white border-t border-gray-600 pt-1.5">
          <span>Running Total</span><span>{rupees(grandTotal)}</span>
        </div>
        <p className="text-xs text-gray-500 text-center pt-0.5">Final amount billed at the counter.</p>
      </div>
    </div>
  )
}

// ─── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({ item, cart, onInc, onDec }) {
  const used      = cartUsed(cart, item.id)
  const qty       = cart.filter(ci => !ci.is_custom && ci.food_item?.id === item.id)
                       .reduce((s, ci) => s + ci.quantity, 0)
  const avail     = itemAvailable(item, cart)
  const remaining = remainingCount(item, cart)

  const unavailableLabel = !item.is_available
    ? 'Unavailable'
    : (item.tracks_stock && item.makeable_count <= 0)
      ? 'Out of Stock'
      : !avail ? 'Max Added' : null

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-gray-100 last:border-0 ${!avail && qty === 0 ? 'opacity-50' : ''}`}>
      {item.photo_url && (
        <img src={item.photo_url} alt={item.name}
          className="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 text-sm leading-tight">{item.name}</p>
            {item.description && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>
            )}
            {item.is_combo && (
              <span className="text-xs text-amber-600 font-medium">Combo</span>
            )}
          </div>
          {unavailableLabel && qty === 0 && (
            <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
              {unavailableLabel}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <div>
            <span className="text-primary-600 font-bold text-sm">{rupees(item.price)}</span>
            {remaining !== null && remaining > 0 && remaining <= 10 && (
              <span className="ml-2 text-xs text-orange-500">{remaining} left</span>
            )}
          </div>
          {(avail || qty > 0) && (
            qty === 0 ? (
              <button
                onClick={() => avail && onInc(item)}
                disabled={!avail}
                className="flex items-center gap-1 bg-primary-600 text-white text-xs font-bold
                           px-3 py-1.5 rounded-full active:scale-95 transition-transform disabled:opacity-40"
              >
                <Plus size={13} /> ADD
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-full px-1 py-0.5">
                <button onClick={() => onDec(item)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-600 text-white active:scale-95">
                  <Minus size={13} />
                </button>
                <span className="w-5 text-center font-bold text-primary-700 text-sm">{qty}</span>
                <button onClick={() => avail && onInc(item)}
                  disabled={!avail}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-600 text-white active:scale-95 disabled:opacity-40">
                  <Plus size={13} />
                </button>
              </div>
            )
          )}
        </div>
        {/* "Add add-ons" hint */}
        {item.food_type_allow_addons && item.food_type_addons?.length > 0 && qty > 0 && (
          <p className="text-xs text-primary-400 mt-1 flex items-center gap-1">
            <Sparkles size={10} /> Customize add-ons in cart
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Cart sheet ───────────────────────────────────────────────────────────────

function CartSheet({ cart, setCart, onClose, onPlace, placing, gstRate }) {
  const [addonTarget, setAddonTarget] = useState(null)

  const updateQty = (cartId, newQty) => {
    if (newQty <= 0) {
      setCart(prev => prev.filter(ci => ci.cartId !== cartId))
    } else {
      setCart(prev => prev.map(ci => ci.cartId === cartId ? { ...ci, quantity: newQty } : ci))
    }
  }

  const removeItem = (cartId) => setCart(prev => prev.filter(ci => ci.cartId !== cartId))

  const setItemAddons = (cartId, addons) => {
    const addonCost = addons.reduce((s, a) => s + (a.is_costed ? parseFloat(a.price) : 0), 0)
    const current   = cart.find(ci => ci.cartId === cartId)
    if (!current || current.is_custom) return

    const newCartId = makeCartId(current.food_item.id, addons)

    if (newCartId === cartId) {
      setCart(prev => prev.map(ci =>
        ci.cartId === cartId ? { ...ci, selected_addons: addons, addon_unit_price: addonCost } : ci
      ))
      return
    }

    const target = cart.find(ci => ci.cartId === newCartId)
    if (target) {
      // Merge into the existing row with the same addon combo
      setCart(prev => prev
        .filter(ci => ci.cartId !== cartId)
        .map(ci => ci.cartId === newCartId ? { ...ci, quantity: ci.quantity + current.quantity } : ci)
      )
    } else {
      // Rename this row's cartId to reflect its new addon signature
      setCart(prev => prev.map(ci =>
        ci.cartId === cartId
          ? { ...ci, cartId: newCartId, selected_addons: addons, addon_unit_price: addonCost }
          : ci
      ))
    }
  }

  const subtotal = cart.reduce((s, ci) => s + ci.quantity * (ci.unit_price + ci.addon_unit_price), 0)
  const tax      = subtotal * gstRate
  const total    = subtotal + tax

  const addonItem = addonTarget ? cart.find(ci => ci.cartId === addonTarget) : null

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
        <div className="bg-white rounded-t-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100 flex-shrink-0">
            <h3 className="font-bold text-gray-800">Your Order</h3>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 py-2 space-y-2">
            {cart.map(ci => {
              if (ci.is_custom) {
                const lineTotal = ci.quantity * (ci.unit_price + ci.addon_unit_price)
                return (
                  <div key={ci.cartId} className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <Wand2 size={11} className="text-amber-500 flex-shrink-0" />
                          <p className="text-sm font-medium text-amber-800 truncate">{ci.custom_name}</p>
                        </div>
                        <p className="text-xs text-amber-600">
                          {rupees(ci.unit_price)}{ci.addon_unit_price > 0 ? ` + ${rupees(ci.addon_unit_price)}` : ''} each
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(ci.cartId, ci.quantity - 1)}
                          className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                          <Minus size={11} />
                        </button>
                        <span className="w-5 text-center text-sm font-semibold">{ci.quantity}</span>
                        <button onClick={() => updateQty(ci.cartId, ci.quantity + 1)}
                          className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                          <Plus size={11} />
                        </button>
                      </div>
                      <p className="text-sm font-semibold text-amber-700 w-16 text-right">{rupees(lineTotal)}</p>
                      <button onClick={() => removeItem(ci.cartId)} className="text-red-300 hover:text-red-500">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(ci.components || []).map((c, i) => (
                        <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{c.name}</span>
                      ))}
                      {(ci.selected_addons || []).map(a => (
                        <span key={a.id} className="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full">
                          {a.name}{a.is_costed ? ` +₹${parseFloat(a.price).toFixed(2)}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              }

              // Regular item
              const addonCost = ci.addon_unit_price || 0
              const lineTotal = ci.quantity * (ci.unit_price + addonCost)
              const hasAddons = ci.food_item?.food_type_allow_addons && ci.food_item?.food_type_addons?.length > 0
              const atMax     = ci.food_item?.tracks_stock
                ? cartUsed(cart, ci.food_item.id) >= ci.food_item.makeable_count
                : false

              return (
                <div key={ci.cartId} className="p-2.5 rounded-xl bg-gray-50 space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{ci.food_item.name}</p>
                      <p className="text-xs text-gray-400">
                        {rupees(ci.unit_price)}{addonCost > 0 ? ` + ${rupees(addonCost)}` : ''} each
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(ci.cartId, ci.quantity - 1)}
                        className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                        <Minus size={11} />
                      </button>
                      <span className="w-5 text-center text-sm font-semibold">{ci.quantity}</span>
                      <button onClick={() => !atMax && updateQty(ci.cartId, ci.quantity + 1)}
                        disabled={atMax}
                        className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed">
                        <Plus size={11} />
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-gray-700 w-16 text-right">{rupees(lineTotal)}</p>
                    <button onClick={() => removeItem(ci.cartId)} className="text-red-300 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                  {(ci.selected_addons || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ci.selected_addons.map(a => (
                        <span key={a.id} className="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full">
                          {a.name}{a.is_costed ? ` +₹${parseFloat(a.price).toFixed(2)}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {hasAddons && (
                    <button
                      onClick={() => setAddonTarget(ci.cartId)}
                      className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-700"
                    >
                      <Sparkles size={11} />
                      {(ci.selected_addons || []).length ? 'Edit add-ons' : 'Add add-ons'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="px-4 pb-4 pt-2 border-t border-gray-100 flex-shrink-0 space-y-3">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{rupees(subtotal)}</span></div>
              <div className="flex justify-between text-gray-400 text-xs">
                <span>Tax ({(gstRate * 100).toFixed(0)}%) added at billing</span>
                <span>≈ {rupees(tax)}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">Pay at the counter when done.</p>
            <button
              onClick={onPlace}
              disabled={placing}
              className="w-full bg-primary-600 text-white font-bold py-4 rounded-2xl text-base
                         active:scale-[0.98] transition-transform disabled:opacity-60
                         flex items-center justify-center gap-2"
            >
              {placing
                ? <><Loader2 size={18} className="animate-spin" /> Placing order…</>
                : <>Place Order · {rupees(subtotal)} <ChevronRight size={18} /></>
              }
            </button>
          </div>
        </div>
      </div>

      {addonItem && (
        <AddonPickerModal
          item={addonItem.food_item}
          existingAddons={addonItem.selected_addons}
          onSave={(addons) => setItemAddons(addonItem.cartId, addons)}
          onClose={() => setAddonTarget(null)}
        />
      )}
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QROrderPage() {
  const { token } = useParams()
  const { data, loading, error, refetch } = usePublicMenu(token)

  const [cart,         setCart]         = useState([])
  const [cartOpen,     setCartOpen]     = useState(false)
  const [placing,      setPlacing]      = useState(false)
  const [successInfo,  setSuccessInfo]  = useState(null)
  const [stockErrors,  setStockErrors]  = useState([])
  const [showCustomize, setCustomize]   = useState(false)
  const [addonPrompt,  setAddonPrompt]  = useState(null)  // item to show addon prompt after adding

  const categoryRefs  = useRef({})
  const categories    = data?.categories || []
  const gstRate       = parseFloat(data?.gst_rate || 5) / 100

  // ── Cart helpers ─────────────────────────────────���──────────────────────────

  const incItem = (item) => {
    if (!itemAvailable(item, cart)) return
    const targetCartId = makeCartId(item.id, [])   // always the no-addon row
    setCart(prev => {
      const existing = prev.find(ci => ci.cartId === targetCartId)
      if (existing) {
        return prev.map(ci => ci.cartId === targetCartId ? { ...ci, quantity: ci.quantity + 1 } : ci)
      }
      return [...prev, {
        cartId:          targetCartId,
        food_item:       item,
        is_custom:       false,
        custom_name:     '',
        components:      [],
        quantity:        1,
        unit_price:      parseFloat(item.price),
        addon_unit_price: 0,
        selected_addons:  [],
        notes:           '',
      }]
    })
    // Prompt addon picker on first add if addons exist
    if (item.food_type_allow_addons && item.food_type_addons?.length > 0) {
      setAddonPrompt(item)
    }
  }

  const decItem = (item) => {
    const targetCartId = makeCartId(item.id, [])   // prefer no-addon row
    setCart(prev => {
      const noAddonRow = prev.find(ci => ci.cartId === targetCartId)
      const row = noAddonRow || prev.find(ci => !ci.is_custom && ci.food_item?.id === item.id)
      if (!row) return prev
      if (row.quantity <= 1) return prev.filter(ci => ci.cartId !== row.cartId)
      return prev.map(ci => ci.cartId === row.cartId ? { ...ci, quantity: ci.quantity - 1 } : ci)
    })
  }

  const addCustomItem = (components, addons, name) => {
    const basePrice = components.reduce((s, c) => s + parseFloat(c.price), 0)
    const addonCost = addons.reduce((s, a) => s + (a.is_costed ? parseFloat(a.price) : 0), 0)
    setCart(prev => [...prev, {
      cartId:          genId(),
      food_item:       null,
      is_custom:       true,
      custom_name:     name,
      components,
      quantity:        1,
      unit_price:      basePrice,
      addon_unit_price: addonCost,
      selected_addons: addons,
      notes:           '',
    }])
  }

  const cartCount = cart.reduce((s, ci) => s + ci.quantity, 0)
  const subtotal  = cart.reduce((s, ci) => s + ci.quantity * (ci.unit_price + ci.addon_unit_price), 0)

  const scrollTo = (catId) => {
    categoryRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Submit order ────────────────────────────────────────────────────────────

  const placeOrder = async () => {
    setPlacing(true)
    setStockErrors([])
    const items = cart.map(ci => {
      if (ci.is_custom) {
        return {
          food_item:        null,
          custom_name:      ci.custom_name,
          components:       ci.components.map(c => c.id),
          quantity:         ci.quantity,
          addon_unit_price: ci.addon_unit_price,
          notes:            `Custom: ${ci.components.map(c => c.name).join(' + ')}${ci.selected_addons?.length ? ` | Add-ons: ${ci.selected_addons.map(a => a.name).join(', ')}` : ''}`,
        }
      }
      return {
        food_item:        ci.food_item.id,
        quantity:         ci.quantity,
        addon_unit_price: ci.addon_unit_price,
        notes:            ci.selected_addons?.length ? `Add-ons: ${ci.selected_addons.map(a => a.name).join(', ')}` : '',
      }
    })
    try {
      const res = await tablesAPI.public.order(token, { items })
      setSuccessInfo(res.data)
      setCart([])
      setCartOpen(false)
      refetch()
    } catch (err) {
      const detail = err?.response?.data?.out_of_stock
      if (detail?.length) {
        setStockErrors(detail)
        const outIds = new Set(detail.map(i => String(i.food_item)).filter(Boolean))
        const outNames = new Set(detail.map(i => i.name))
        setCart(prev => prev.filter(ci => {
          if (ci.is_custom) return !ci.components.some(c => outNames.has(c.name))
          return !outIds.has(String(ci.food_item?.id))
        }))
        setCartOpen(false)
        refetch()
      }
    } finally {
      setPlacing(false)
    }
  }

  // ── Addon prompt (auto-open after adding an item with addons) ───────────────
  const addonPromptCartId = addonPrompt ? makeCartId(addonPrompt.id, []) : null

  // ── Loading / Error / Success ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Loader2 size={32} className="animate-spin text-primary-500" />
          <p className="text-sm">Loading menu…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <AlertTriangle size={40} className="text-red-400 mx-auto" />
          <p className="font-semibold text-gray-700">Invalid QR Code</p>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    )
  }

  if (successInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 gap-5">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 size={40} className="text-green-500" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-gray-800">Order Placed!</h2>
          <p className="text-gray-500 text-sm">Kitchen is preparing your food.</p>
          <p className="text-gray-400 text-xs">Pay at the counter when you're done.</p>
        </div>
        <button
          onClick={() => setSuccessInfo(null)}
          className="w-full max-w-xs bg-primary-600 text-white font-bold py-4 rounded-2xl text-base
                     flex items-center justify-center gap-2"
        >
          <UtensilsCrossed size={18} /> Order More
        </button>
      </div>
    )
  }

  // ── Main menu ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-primary-700 text-white px-4 pt-8 pb-4">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gold-300 flex items-center justify-center">
            <UtensilsCrossed size={20} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-base leading-tight">Restaurant</p>
            <p className="text-primary-200 text-xs">Table {data.table_number}</p>
          </div>
        </div>
      </div>

      {/* Stock error banner */}
      {stockErrors.length > 0 && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Some items just ran out:</p>
            <p className="text-xs text-red-500">{stockErrors.map(i => i.name).join(', ')} — removed from your cart.</p>
          </div>
          <button onClick={() => setStockErrors([])}><X size={15} className="text-red-400" /></button>
        </div>
      )}

      {/* Category tabs + Customize button */}
      {categories.length > 0 && (
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
          <div className="flex gap-0 overflow-x-auto scrollbar-hide">
            {/* Customize button */}
            {data.customizable_types?.length > 0 && (
              <button
                onClick={() => setCustomize(true)}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-medium
                           text-amber-600 hover:text-amber-700 bg-amber-50 whitespace-nowrap"
              >
                <Wand2 size={14} /> Customize
              </button>
            )}
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => scrollTo(cat.id)}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-medium
                           text-gray-600 hover:text-primary-600 whitespace-nowrap"
              >
                {cat.icon && <span>{cat.icon}</span>}
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Menu sections */}
      <div className="px-4 space-y-6 mt-4">
        {categories.map(cat => (
          <div key={cat.id} ref={el => categoryRefs.current[cat.id] = el}>
            <h3 className="font-bold text-gray-800 text-base mb-1 flex items-center gap-2">
              {cat.icon && <span className="text-lg">{cat.icon}</span>}
              {cat.name}
            </h3>
            <div className="bg-white rounded-2xl px-4 shadow-sm">
              {cat.items.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  cart={cart}
                  onInc={incItem}
                  onDec={decItem}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Session order history */}
      <MyOrders orders={data.session_orders} gstRate={gstRate} />

      {/* Floating cart bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-40">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full bg-primary-600 text-white rounded-2xl px-4 py-4
                       flex items-center justify-between shadow-xl
                       active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingCart size={22} />
                <span className="absolute -top-2 -right-2 bg-gold-400 text-white text-xs font-bold
                                 w-5 h-5 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              </div>
              <span className="font-bold text-base">View Order</span>
            </div>
            <span className="font-bold text-base">{rupees(subtotal)}</span>
          </button>
        </div>
      )}

      {/* Cart sheet */}
      {cartOpen && (
        <CartSheet
          cart={cart}
          setCart={setCart}
          onClose={() => setCartOpen(false)}
          onPlace={placeOrder}
          placing={placing}
          gstRate={gstRate}
        />
      )}

      {/* Customize modal */}
      {showCustomize && (
        <CustomizeModal
          customizableTypes={data.customizable_types || []}
          cart={cart}
          onClose={() => setCustomize(false)}
          onAdd={(components, addons, name) => {
            addCustomItem(components, addons, name)
            setCustomize(false)
          }}
        />
      )}

      {/* Addon prompt after first add */}
      {addonPrompt && addonPromptCartId && (
        <AddonPickerModal
          item={addonPrompt}
          existingAddons={[]}
          onSave={(addons) => {
            if (addons.length > 0) {
              const addonCost = addons.reduce((s, a) => s + (a.is_costed ? parseFloat(a.price) : 0), 0)
              const newCartId = makeCartId(addonPrompt.id, addons)
              setCart(prev => {
                // Remove one unit from the plain row that incItem just added to
                const plainRow = prev.find(ci => ci.cartId === addonPromptCartId)
                let next = plainRow?.quantity <= 1
                  ? prev.filter(ci => ci.cartId !== addonPromptCartId)
                  : prev.map(ci => ci.cartId === addonPromptCartId
                      ? { ...ci, quantity: ci.quantity - 1 }
                      : ci)
                // Add one unit to the addon row (merge or create)
                const addonRow = next.find(ci => ci.cartId === newCartId)
                if (addonRow) {
                  next = next.map(ci => ci.cartId === newCartId
                    ? { ...ci, quantity: ci.quantity + 1 }
                    : ci)
                } else {
                  next = [...next, {
                    cartId:           newCartId,
                    food_item:        addonPrompt,
                    is_custom:        false,
                    custom_name:      '',
                    components:       [],
                    quantity:         1,
                    unit_price:       parseFloat(addonPrompt.price),
                    addon_unit_price: addonCost,
                    selected_addons:  addons,
                    notes:            '',
                  }]
                }
                return next
              })
            }
            setAddonPrompt(null)
          }}
          onClose={() => setAddonPrompt(null)}
        />
      )}
    </div>
  )
}
