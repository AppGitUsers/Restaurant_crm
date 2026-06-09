import { create } from 'zustand'

// Stable key from sorted addon IDs
const addonSig = (addons) =>
  addons && addons.length
    ? [...addons].sort((a, b) => a.id - b.id).map(a => a.id).join('-')
    : ''

const makeCartId = (foodItemId, addons) => {
  const sig = addonSig(addons)
  return sig ? `${foodItemId}::${sig}` : `${foodItemId}`
}

export const useCartStore = create((set, get) => ({
  items: [],          // [{ cartId, food_item, quantity, unit_price, notes, selected_addons, is_custom?, custom_name?, components? }]
  customerName:  '',
  customerPhone: '',
  paymentMethod: 'CASH',
  discount:      0,
  taxPercent:    5,

  // Total qty of a food item across all regular cart rows (for stock limit)
  _totalQty: (foodItemId) =>
    get().items
      .filter(i => !i.is_custom && i.food_item?.id === foodItemId)
      .reduce((s, i) => s + i.quantity, 0),

  addItem: (foodItem) => {
    const items  = get().items
    const maxQty = foodItem.makeable_count ?? Infinity
    const total  = items
      .filter(i => !i.is_custom && i.food_item?.id === foodItem.id)
      .reduce((s, i) => s + i.quantity, 0)

    if (maxQty <= 0 || total >= maxQty) return false

    // Always target the no-addon row for this food item
    const cartId   = makeCartId(foodItem.id, [])
    const existing = items.find(i => i.cartId === cartId)

    if (existing) {
      set({ items: items.map(i =>
        i.cartId === cartId ? { ...i, quantity: i.quantity + 1 } : i
      )})
    } else {
      set({ items: [...items, {
        cartId, food_item: foodItem, quantity: 1,
        unit_price: parseFloat(foodItem.price), notes: '', selected_addons: [],
      }]})
    }
    return true
  },

  // Add a custom fusion combo to cart
  addCustomItem: (components, selectedAddons, customName) => {
    const addonCost = (selectedAddons || []).reduce((s, a) =>
      s + (a.is_costed ? parseFloat(a.price) : 0), 0)
    const basePrice = components.reduce((s, c) => s + parseFloat(c.price), 0)
    const cartId    = `custom-${Date.now()}`
    set({ items: [...get().items, {
      cartId,
      is_custom:      true,
      custom_name:    customName,
      components,
      food_item:      null,
      quantity:       1,
      unit_price:     basePrice,
      addon_unit_price: addonCost,
      notes:          '',
      selected_addons: selectedAddons || [],
    }]})
  },

  removeItem: (cartId) =>
    set({ items: get().items.filter(i => i.cartId !== cartId) }),

  updateQty: (cartId, qty) => {
    if (qty <= 0) { get().removeItem(cartId); return }
    const items    = get().items
    const ci       = items.find(i => i.cartId === cartId)
    if (!ci) return

    // Custom items have no stock limit
    if (ci.is_custom) {
      set({ items: items.map(i => i.cartId === cartId ? { ...i, quantity: qty } : i) })
      return
    }

    const otherQty = items
      .filter(i => !i.is_custom && i.food_item?.id === ci.food_item?.id && i.cartId !== cartId)
      .reduce((s, i) => s + i.quantity, 0)
    const maxQty   = ci.food_item.makeable_count ?? Infinity
    const allowed  = Math.max(0, maxQty - otherQty)
    set({ items: items.map(i =>
      i.cartId === cartId ? { ...i, quantity: Math.min(qty, allowed) } : i
    )})
  },

  setItemAddons: (cartId, newAddons) => {
    const items   = get().items
    const current = items.find(i => i.cartId === cartId)
    if (!current || current.is_custom) return

    const newCartId = makeCartId(current.food_item.id, newAddons)

    if (newCartId === cartId) {
      set({ items: items.map(i => i.cartId === cartId ? { ...i, selected_addons: newAddons } : i) })
      return
    }

    const target = items.find(i => i.cartId === newCartId)
    if (target) {
      // Merge into the existing matching row
      set({ items: items
        .filter(i => i.cartId !== cartId)
        .map(i => i.cartId === newCartId
          ? { ...i, quantity: i.quantity + current.quantity }
          : i
        )
      })
    } else {
      // Rename the row's cartId + update addons
      set({ items: items.map(i =>
        i.cartId === cartId ? { ...i, cartId: newCartId, selected_addons: newAddons } : i
      )})
    }
  },

  clearCart: () => set({
    items: [], customerName: '', customerPhone: '',
    paymentMethod: 'CASH', discount: 0,
  }),

  setCustomer:      (name, phone) => set({ customerName: name, customerPhone: phone }),
  setPaymentMethod: (m)           => set({ paymentMethod: m }),
  setDiscount:      (d)           => set({ discount: d }),

  getSubtotal: () => get().items.reduce((s, i) => {
    const addonCost = i.is_custom
      ? (i.addon_unit_price || 0)
      : (i.selected_addons || []).reduce((a, addon) =>
          a + (addon.is_costed ? parseFloat(addon.price) : 0), 0)
    return s + i.quantity * (i.unit_price + addonCost)
  }, 0),

  getTax: () => {
    const sub = get().getSubtotal()
    const dis = get().discount
    return ((sub - dis) * get().taxPercent) / 100
  },
  getTotal: () => {
    const sub = get().getSubtotal()
    return sub - get().discount + get().getTax()
  },
  getItemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),
}))
