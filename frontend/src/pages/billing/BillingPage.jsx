import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { menuAPI, billingAPI, customersAPI, settingsAPI } from '@/api'
import { useCartStore } from '@/store/cartStore'
import { PageLoader, Modal, Empty } from '@/components/ui'
import toast from 'react-hot-toast'
import {
  ShoppingCart, Plus, Minus, Trash2, UtensilsCrossed,
  CheckCircle, Printer, X, Receipt, Sparkles, Check, Wand2, MessageCircle
} from 'lucide-react'

// ── Food card ─────────────────────────────────────────
function FoodCard({ item, onAdd }) {
  const cartQty   = useCartStore(s =>
    s.items.filter(i => !i.is_custom && i.food_item?.id === item.id).reduce((t, i) => t + i.quantity, 0)
  )
  // Count this item when used as a component in custom fusion orders OR pre-defined combos
  const customQty = useCartStore(s =>
    s.items.reduce((t, ci) => {
      if (ci.is_custom) {
        return t + (ci.components || []).filter(c => c.id === item.id).length * ci.quantity
      }
      if (ci.food_item?.is_combo) {
        return t + (ci.food_item.combo_components || []).filter(cc => cc.component === item.id).length * ci.quantity
      }
      return t
    }, 0)
  )
  const totalInCart = cartQty + customQty
  const inCart   = totalInCart > 0
  const hasStock = item.tracks_stock ? (item.is_available && item.makeable_count > 0) : item.is_available
  const atMax    = item.tracks_stock ? (hasStock && totalInCart >= item.makeable_count) : false
  const available = hasStock && !atMax

  const overlayLabel = !hasStock ? 'Out of Stock' : 'Max Added'

  return (
    <div
      onClick={() => available && onAdd(item)}
      className={`card-sm flex flex-col gap-2 select-none transition-all
        ${available ? 'cursor-pointer hover:border-primary-300 hover:shadow-md active:scale-[0.98]' : 'opacity-50 cursor-not-allowed'}
        ${inCart ? 'border-primary-300 ring-1 ring-primary-200' : ''}`}
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
        {inCart && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">{cartQty}</span>
          </div>
        )}
        {hasStock && item.tracks_stock && (
          <div className="absolute bottom-1.5 right-1.5 bg-white rounded-full px-1.5 py-0.5 text-xs text-primary-600 font-semibold shadow">
            {item.makeable_count - totalInCart}✓
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

// ── Addon picker modal ────────────────────────────────
function AddonPickerModal({ cartItem, onSave, onClose }) {
  const availableAddons = (cartItem?.food_item?.food_type_addons || []).filter(a => a.is_active)
  const [selected, setSelected] = useState(cartItem?.selected_addons || [])

  const toggle = (addon) => {
    const exists = selected.find(a => a.id === addon.id)
    setSelected(exists ? selected.filter(a => a.id !== addon.id) : [...selected, addon])
  }
  const isSelected = (id) => selected.some(a => a.id === id)
  const totalCost  = selected.reduce((s, a) => s + (a.is_costed ? parseFloat(a.price) : 0), 0)

  return (
    <Modal open onClose={onClose} title={`Add-ons — ${cartItem?.food_item?.name}`}
      footer={<>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={() => { onSave(cartItem.cartId, selected); onClose() }} className="btn-primary">Apply</button>
      </>}
    >
      <p className="text-xs text-gray-400 mb-3">Select add-ons for this item. Costed add-ons will be charged extra.</p>
      <div className="space-y-2">
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
        {availableAddons.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No add-ons available for this category.</p>}
      </div>
      {totalCost > 0 && (
        <div className="mt-4 flex justify-between items-center text-sm font-semibold text-primary-700 bg-primary-50 rounded-xl px-4 py-2.5">
          <span>Add-ons total (per item)</span>
          <span>+₹{totalCost.toFixed(2)}</span>
        </div>
      )}
    </Modal>
  )
}

// ── Customize modal ───────────────────────────────────
function CustomizeModal({ onClose, onAdd }) {
  const [selected, setSelected]       = useState({})   // { typeId: foodItemObj }
  const [selectedAddons, setAddons]   = useState([])
  const cartItems = useCartStore(s => s.items)

  // How many of a food item are already reserved in the cart (regular + as components)
  const cartUsed = (itemId) => cartItems.reduce((t, ci) => {
    if (ci.is_custom) {
      return t + (ci.components || []).filter(c => c.id === itemId).length * ci.quantity
    }
    if (ci.food_item?.is_combo) {
      return t + (ci.food_item.combo_components || []).filter(cc => cc.component === itemId).length * ci.quantity
    }
    return ci.food_item?.id === itemId ? t + ci.quantity : t
  }, 0)

  const { data: customTypes = [] } = useQuery({
    queryKey: ['customizable-types'],
    queryFn:  () => menuAPI.types.list({ is_active: true, is_customizable: true })
                      .then(r => r.data.results || r.data),
  })

  const { data: allItems = [] } = useQuery({
    queryKey: ['customizable-items'],
    queryFn:  () => menuAPI.items.list({ is_active: true }).then(r => r.data.results || r.data),
    enabled:  customTypes.length > 0,
  })

  const customTypeIds  = new Set(customTypes.map(t => t.id))
  const itemsByType    = (typeId) => allItems.filter(i => i.food_type === typeId && i.is_active)

  // Addons: union of all addons from types that allow_addons, deduplicated by id
  const availableAddons = (() => {
    const map = new Map()
    customTypes.filter(t => t.allow_addons).forEach(t =>
      (t.addons || []).filter(a => a.is_active).forEach(a => map.set(a.id, a))
    )
    return [...map.values()]
  })()

  const toggleItem = (typeId, item) => {
    setSelected(prev => {
      const cur = prev[typeId]
      if (cur?.id === item.id) {
        const next = { ...prev }
        delete next[typeId]
        return next
      }
      return { ...prev, [typeId]: item }
    })
  }

  const toggleAddon = (addon) => {
    setAddons(prev => {
      const exists = prev.find(a => a.id === addon.id)
      return exists ? prev.filter(a => a.id !== addon.id) : [...prev, addon]
    })
  }

  const isAddonSelected = (id) => selectedAddons.some(a => a.id === id)

  const components    = Object.values(selected)
  const categoriesUsed = Object.keys(selected).length
  const canAdd        = categoriesUsed >= 2

  const basePrice  = components.reduce((s, c) => s + parseFloat(c.price), 0)
  const addonCost  = selectedAddons.reduce((s, a) => s + (a.is_costed ? parseFloat(a.price) : 0), 0)
  const totalPrice = basePrice + addonCost

  const customName = components.map(c => c.name).join(' + ')

  const handleAdd = () => {
    if (!canAdd) return
    onAdd(components, selectedAddons, customName)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Customize Your Order" size="lg"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          className={`btn-primary ${!canAdd ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Wand2 size={15} />
          {canAdd ? `Add to Cart — ₹${totalPrice.toFixed(2)}` : 'Select from 2+ categories'}
        </button>
      </>}
    >
      {customTypes.length === 0 ? (
        <div className="py-10 text-center text-gray-400">
          <Wand2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No customizable categories configured.</p>
          <p className="text-xs mt-1">Enable "Customizable" on categories in the Menu page.</p>
        </div>
      ) : (
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
          {/* Category sections */}
          {customTypes.map(type => {
            const typeItems  = itemsByType(type.id)
            const selItem    = selected[type.id]
            return (
              <div key={type.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{type.icon}</span>
                  <h4 className="font-semibold text-gray-700 text-sm">{type.name}</h4>
                  <span className="text-xs text-gray-400">(pick one)</span>
                </div>
                {typeItems.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 ml-6">No available items</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 ml-0">
                    {typeItems.map(item => {
                      const isSel           = selItem?.id === item.id
                      const effectiveAvail  = item.tracks_stock ? (item.makeable_count - cartUsed(item.id)) : Infinity
                      const outOfStock      = item.tracks_stock ? (!item.is_available || effectiveAvail <= 0) : !item.is_available
                      return (
                        <div
                          key={item.id}
                          onClick={() => !outOfStock && toggleItem(type.id, item)}
                          className={`relative p-3 rounded-xl border-2 transition-all select-none
                            ${outOfStock
                              ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                              : isSel
                                ? 'border-primary-400 bg-primary-50 cursor-pointer'
                                : 'border-gray-100 hover:border-gray-200 bg-white cursor-pointer'}`}
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
                            ₹{parseFloat(item.price).toFixed(2)}
                            {!outOfStock && item.tracks_stock && effectiveAvail < 5 && <span className="ml-1 text-[10px] text-orange-500">({effectiveAvail})</span>}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Add-ons section */}
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
                      ${isAddonSelected(addon.id) ? 'border-primary-400 bg-primary-50' : 'border-gray-100 hover:border-gray-200'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0
                        ${isAddonSelected(addon.id) ? 'border-primary-500 bg-primary-500' : 'border-gray-300'}`}>
                        {isAddonSelected(addon.id) && <Check size={9} className="text-white" />}
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

          {/* Summary strip */}
          {components.length > 0 && (
            <div className="sticky bottom-0 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-amber-800 line-clamp-1">
                {customName}
              </p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-amber-600">
                  Base ₹{basePrice.toFixed(2)}{addonCost > 0 ? ` + Add-ons ₹${addonCost.toFixed(2)}` : ''}
                </p>
                <p className="text-sm font-bold text-amber-700">₹{totalPrice.toFixed(2)}</p>
              </div>
              {!canAdd && (
                <p className="text-xs text-amber-500 mt-0.5">Select from at least 2 categories to continue</p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Customer fields with phone lookup ────────────────
function CustomerFields({ customerName, customerPhone, setCustomer }) {
  const phoneReady = customerPhone.replace(/\D/g, '').length >= 10

  const { data: lookupData, isFetching } = useQuery({
    queryKey:  ['customer-phone-lookup', customerPhone],
    queryFn:   () => customersAPI.list({ phone: customerPhone }).then(r => r.data.results || r.data),
    enabled:   phoneReady,
    staleTime: 30_000,
  })

  // Exact-match filter returns only the right customer (or empty)
  const matched = lookupData?.[0] || null

  // Auto-fill name when a match is found and name field is empty
  useEffect(() => {
    if (matched && !customerName) {
      setCustomer(matched.name, customerPhone)
    }
  }, [matched?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const visits       = matched?.total_visits ?? 0
  const totalSpent   = matched ? parseFloat(matched.total_spent || 0) : 0
  const isReturning  = visits > 0

  return (
    <div className="mt-3 pt-3 space-y-2 border-t border-gray-100">
      {/* Phone first — triggers lookup */}
      <div className="relative">
        <input
          type="tel"
          inputMode="numeric"
          maxLength={15}
          className="input-sm pr-8"
          placeholder="Phone * (required)"
          value={customerPhone}
          onChange={e => setCustomer(customerName, e.target.value.replace(/\D/g, '').slice(0, 15))}
        />
        {phoneReady && isFetching && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 text-xs animate-pulse">…</span>
        )}
      </div>

      {/* Returning customer badge */}
      {matched && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
          <div>
            <p className="text-xs font-semibold text-green-700">{matched.name}</p>
            <p className="text-xs text-green-500">
              {isReturning ? `${visits} visit${visits > 1 ? 's' : ''} • ₹${totalSpent.toFixed(0)} spent` : 'First visit'}
              {' • '}This will be visit #{visits + 1}
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

      {/* Name field */}
      <input
        className="input-sm"
        placeholder="Customer name (optional)"
        value={customerName}
        onChange={e => setCustomer(e.target.value, customerPhone)}
      />
    </div>
  )
}

// ── Cart panel ────────────────────────────────────────
function CartPanel({ onPlaceOrder, isLoading = false, orderType, setOrderType }) {
  const {
    items, removeItem, updateQty, setItemAddons,
    customerName, customerPhone, paymentMethod, discount, taxPercent,
    setCustomer, setPaymentMethod, setDiscount,
    getSubtotal, getTax, getTotal, clearCart,
  } = useCartStore()

  const [addonTarget, setAddonTarget] = useState(null)

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
        {items.map((cartItem) => {
          const { cartId, food_item, is_custom, custom_name, components, quantity, unit_price, selected_addons, addon_unit_price } = cartItem

          if (is_custom) {
            const addonCost = addon_unit_price || 0
            const lineTotal = quantity * (unit_price + addonCost)
            return (
              <div key={cartId} className="p-2 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <Wand2 size={11} className="text-amber-500 flex-shrink-0" />
                      <p className="text-sm font-medium text-amber-800 truncate">{custom_name}</p>
                    </div>
                    <p className="text-xs text-amber-600">
                      ₹{unit_price.toFixed(2)}{addonCost > 0 ? ` +₹${addonCost.toFixed(2)}` : ''} each
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(cartId, quantity - 1)} className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center hover:bg-amber-200 transition-colors">
                      <Minus size={11} />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
                    <button onClick={() => updateQty(cartId, quantity + 1)} className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center hover:bg-amber-200 transition-colors">
                      <Plus size={11} />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-amber-700 w-16 text-right">₹{lineTotal.toFixed(2)}</p>
                  <button onClick={() => removeItem(cartId)} className="text-red-300 hover:text-red-500 ml-1">
                    <Trash2 size={13} />
                  </button>
                </div>
                {/* Component chips */}
                {components?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {components.map((c, i) => (
                      <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        {c.name}
                      </span>
                    ))}
                  </div>
                )}
                {/* Addon chips */}
                {selected_addons?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selected_addons.map(a => (
                      <span key={a.id} className="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full">
                        {a.name}{a.is_costed ? ` +₹${parseFloat(a.price).toFixed(2)}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          // Regular item
          const addonCost    = (selected_addons || []).reduce((s, a) => s + (a.is_costed ? parseFloat(a.price) : 0), 0)
          const hasAddons    = food_item.food_type_allow_addons && food_item.food_type_addons?.length > 0
          const lineTotal    = quantity * (unit_price + addonCost)
          const totalFoodQty = items.filter(i => !i.is_custom && i.food_item?.id === food_item.id).reduce((s, i) => s + i.quantity, 0)
          const atMax        = food_item.makeable_count > 0 && totalFoodQty >= food_item.makeable_count

          return (
            <div key={cartId} className="p-2 rounded-lg bg-gray-50 space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{food_item.name}</p>
                  <p className="text-xs text-gray-400">
                    ₹{unit_price.toFixed(2)}{addonCost > 0 ? ` +₹${addonCost.toFixed(2)}` : ''} each
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(cartId, quantity - 1)} className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-primary-100 transition-colors">
                    <Minus size={11} />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
                  <button
                    onClick={() => updateQty(cartId, quantity + 1)}
                    disabled={atMax}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors
                      ${atMax ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-200 hover:bg-primary-100'}`}
                  >
                    <Plus size={11} />
                  </button>
                </div>
                <p className="text-sm font-semibold text-gray-700 w-16 text-right">₹{lineTotal.toFixed(2)}</p>
                <button onClick={() => removeItem(cartId)} className="text-red-300 hover:text-red-500 ml-1">
                  <Trash2 size={13} />
                </button>
              </div>

              {selected_addons?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selected_addons.map(a => (
                    <span key={a.id} className="text-xs bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full">
                      {a.name}{a.is_costed ? ` +₹${parseFloat(a.price).toFixed(2)}` : ''}
                    </span>
                  ))}
                </div>
              )}

              {hasAddons && (
                <button
                  onClick={() => setAddonTarget(cartItem)}
                  className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-700 transition-colors"
                >
                  <Sparkles size={11} />
                  {selected_addons?.length ? 'Edit add-ons' : 'Add add-ons'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {addonTarget && (
        <AddonPickerModal
          cartItem={addonTarget}
          onSave={setItemAddons}
          onClose={() => setAddonTarget(null)}
        />
      )}

      <CustomerFields
        customerName={customerName}
        customerPhone={customerPhone}
        setCustomer={setCustomer}
      />

      <div className="mt-2 space-y-2">
        {/* Dine In / Parcel toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          <button
            type="button"
            onClick={() => setOrderType('DINE_IN')}
            className={`flex-1 py-1.5 transition-colors ${orderType === 'DINE_IN' ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Dine In
          </button>
          <button
            type="button"
            onClick={() => setOrderType('PARCEL')}
            className={`flex-1 py-1.5 border-l border-gray-200 transition-colors ${orderType === 'PARCEL' ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Parcel
          </button>
        </div>
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

      <div className="mt-3 space-y-1.5 text-sm border-t border-gray-100 pt-3">
        <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>₹{getSubtotal().toFixed(2)}</span></div>
        {discount > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>-₹{discount.toFixed(2)}</span></div>}
        <div className="flex justify-between text-gray-600"><span>Tax ({taxPercent}%)</span><span>₹{getTax().toFixed(2)}</span></div>
        <div className="flex justify-between text-base font-bold text-primary-600 pt-1 border-t border-gray-100">
          <span>Total</span><span>₹{getTotal().toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button onClick={clearCart} className="btn-ghost flex-1 justify-center text-xs py-2"><X size={13} />Clear</button>
        <button
          onClick={onPlaceOrder}
          disabled={isLoading}
          className="btn-primary flex-1 justify-center py-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading
            ? <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Processing…</>
            : <><Receipt size={14} />Confirm &amp; Pay</>}
        </button>
      </div>
    </div>
  )
}

// ── Bill modal ────────────────────────────────────────
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

  const sendWhatsApp = () => {
    const digits   = order.customer_phone.replace(/\D/g, '')
    const phone    = digits.length === 10 ? `91${digits}` : digits

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

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`,
      '_blank'
    )
  }

  return (
    <Modal open={!!order} onClose={onClose} title="Bill Receipt" size="md"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Close</button>
        {order.customer_phone && (
          <button onClick={sendWhatsApp}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-colors">
            <MessageCircle size={15} />WhatsApp
          </button>
        )}
        <button onClick={() => printBill(order)} className="btn-secondary flex items-center gap-1.5"><Printer size={15} />Print</button>
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

// ── Main BillingPage ──────────────────────────────────
export default function BillingPage() {
  const qc = useQueryClient()
  const [search, setSearch]           = useState('')
  const [typeFilter, setType]         = useState('')
  const [billOrder, setBill]          = useState(null)
  const [showCustomize, setCustomize] = useState(false)
  const [mobileCartOpen, setCartOpen] = useState(false)
  const [orderType, setOrderType]     = useState('DINE_IN')
  const { addItem, addCustomItem, getItemCount, setTaxPercent } = useCartStore()

  // Sync GST rate from settings into cart store on page load
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => settingsAPI.get().then(r => r.data),
    staleTime: 5 * 60_000,
  })
  useEffect(() => {
    if (settingsData?.gst_rate !== undefined) {
      setTaxPercent(parseFloat(settingsData.gst_rate) || 0)
    }
  }, [settingsData?.gst_rate]) // eslint-disable-line react-hooks/exhaustive-deps

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
      if (customerPhone.replace(/\D/g, '').length < 10) {
        throw new Error('Phone number is required (10 digits)')
      }
      const payload = {
        customer_name:  customerName,
        customer_phone: customerPhone,
        payment_method: paymentMethod,
        order_type:     orderType,
        discount,
        tax_percent: taxPercent,
        items: items.map(i => {
          if (i.is_custom) {
            const componentNames = (i.components || []).map(c => c.name).join(' + ')
            const addonNames     = i.selected_addons?.length ? ` | Add-ons: ${i.selected_addons.map(a => a.name).join(', ')}` : ''
            return {
              food_item:        null,
              custom_name:      i.custom_name,
              quantity:         i.quantity,
              unit_price:       i.unit_price,
              addon_unit_price: i.addon_unit_price || 0,
              notes:            `Custom: ${componentNames}${addonNames}`,
            }
          }
          const addonCost = (i.selected_addons || []).reduce((s, a) => s + (a.is_costed ? parseFloat(a.price) : 0), 0)
          return {
            food_item:        i.food_item.id,
            quantity:         i.quantity,
            unit_price:       i.unit_price,
            addon_unit_price: addonCost,
            notes:            i.selected_addons?.length ? `Add-ons: ${i.selected_addons.map(a => a.name).join(', ')}` : '',
          }
        }),
      }
      const { data: order } = await billingAPI.orders.create(payload)
      const { data: paid  } = await billingAPI.orders.pay(order.id, { payment_method: paymentMethod })
      return paid
    },
    onSuccess: (order) => {
      useCartStore.getState().clearCart()
      setBill(order)
      qc.invalidateQueries(['billing-items'])
      if (order.customer_phone) {
        qc.invalidateQueries(['customer-phone-lookup', order.customer_phone])
      }
      toast.success('Order placed and paid!')
    },
    onError: (err) => {
      if (err?.message && !err?.response) {
        toast.error(err.message)
        return
      }
      const msg = err?.response?.data?.detail
        || Object.values(err?.response?.data || {})[0]
        || 'Order failed. Please try again.'
      toast.error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    },
  })

  const items     = data || []
  const typesList = types || []
  const cartCount = getItemCount()

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Menu grid — full width on mobile, flex-1 on desktop */}
      <div className="flex-1 flex flex-col overflow-hidden p-3 md:p-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[160px]">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search menu…" className="input pl-8" />
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCustomize(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200 flex items-center gap-1.5"
            >
              <Wand2 size={12} />
              Customize
            </button>
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

        {/* Grid — extra bottom padding on mobile for FAB */}
        <div className="flex-1 overflow-y-auto pb-24 md:pb-0">
          {isLoading ? <PageLoader /> : typeFilter ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
              {items.map(item => <FoodCard key={item.id} item={item} onAdd={handleAdd} />)}
              {items.length === 0 && <div className="col-span-4"><Empty message="No items found" icon={<UtensilsCrossed size={48} />} /></div>}
            </div>
          ) : (
            <div className="space-y-5">
              {typesList
                .map(type => ({ type, groupItems: items.filter(i => String(i.food_type) === String(type.id)) }))
                .filter(({ groupItems }) => groupItems.length > 0)
                .map(({ type, groupItems }) => (
                  <div key={type.id}>
                    <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-100">
                      <span className="text-base">{type.icon}</span>
                      <h3 className="font-semibold text-sm text-gray-700">{type.name}</h3>
                      <span className="text-xs text-gray-400">({groupItems.length})</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
                      {groupItems.map(item => <FoodCard key={item.id} item={item} onAdd={handleAdd} />)}
                    </div>
                  </div>
                ))
              }
              {items.length === 0 && <Empty message="No items found" icon={<UtensilsCrossed size={48} />} />}
            </div>
          )}
        </div>
      </div>

      {/* Desktop: static right cart panel */}
      <div className="hidden md:flex w-80 flex-shrink-0 bg-white border-l border-gray-100 flex-col p-4 shadow-lg">
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
        <CartPanel onPlaceOrder={() => placeOrder.mutate()} isLoading={placeOrder.isPending} orderType={orderType} setOrderType={setOrderType} />
      </div>

      {/* Mobile: cart overlay drawer */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart size={18} className="text-primary-500" />
                <span className="font-semibold text-gray-800">Cart</span>
                {cartCount > 0 && (
                  <span className="w-5 h-5 bg-gold-300 text-white rounded-full text-xs flex items-center justify-center font-bold">
                    {cartCount}
                  </span>
                )}
              </div>
              <button onClick={() => setCartOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <CartPanel onPlaceOrder={() => { placeOrder.mutate(); setCartOpen(false) }} isLoading={placeOrder.isPending} orderType={orderType} setOrderType={setOrderType} />
            </div>
          </div>
        </div>
      )}

      {/* Mobile: floating cart button */}
      <button
        onClick={() => setCartOpen(true)}
        className="fixed bottom-5 right-5 z-40 md:hidden flex items-center gap-2 px-5 py-3 bg-primary-500 text-white rounded-full shadow-xl hover:bg-primary-600 active:scale-95 transition-all"
      >
        <ShoppingCart size={18} />
        <span className="font-semibold text-sm">Cart</span>
        {cartCount > 0 && (
          <span className="w-5 h-5 bg-gold-300 rounded-full text-xs flex items-center justify-center font-bold">
            {cartCount}
          </span>
        )}
      </button>

      {/* Customize modal */}
      {showCustomize && (
        <CustomizeModal
          onClose={() => setCustomize(false)}
          onAdd={(components, addons, name) => {
            addCustomItem(components, addons, name)
            toast.success(`"${name}" added to cart!`)
          }}
        />
      )}

      {/* Bill receipt modal */}
      <BillModal order={billOrder} onClose={() => setBill(null)} />
    </div>
  )
}
