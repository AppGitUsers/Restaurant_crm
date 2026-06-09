import { create } from 'zustand'

export const useCartStore = create((set, get) => ({
  items: [],          // [{ food_item, quantity, unit_price, notes }]
  customerName:  '',
  customerPhone: '',
  paymentMethod: 'CASH',
  discount:      0,
  taxPercent:    5,

  addItem: (foodItem) => {
    const items    = get().items
    const existing = items.find(i => i.food_item.id === foodItem.id)
    const maxQty   = foodItem.makeable_count ?? Infinity

    if (existing) {
      if (existing.quantity >= maxQty) return false   // at stock limit
      set({ items: items.map(i =>
        i.food_item.id === foodItem.id
          ? { ...i, quantity: i.quantity + 1 }
          : i
      )})
    } else {
      if (maxQty <= 0) return false
      set({ items: [...items, {
        food_item:  foodItem,
        quantity:   1,
        unit_price: parseFloat(foodItem.price),
        notes:      '',
      }]})
    }
    return true
  },

  removeItem: (foodItemId) =>
    set({ items: get().items.filter(i => i.food_item.id !== foodItemId) }),

  updateQty: (foodItemId, qty) => {
    if (qty <= 0) {
      get().removeItem(foodItemId)
      return
    }
    const cartItem = get().items.find(i => i.food_item.id === foodItemId)
    const maxQty   = cartItem?.food_item?.makeable_count ?? Infinity
    set({ items: get().items.map(i =>
      i.food_item.id === foodItemId
        ? { ...i, quantity: Math.min(qty, maxQty) }
        : i
    )})
  },

  clearCart: () => set({
    items: [], customerName: '', customerPhone: '',
    paymentMethod: 'CASH', discount: 0,
  }),

  setCustomer:      (name, phone) => set({ customerName: name, customerPhone: phone }),
  setPaymentMethod: (m)           => set({ paymentMethod: m }),
  setDiscount:      (d)           => set({ discount: d }),

  getSubtotal: () => get().items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
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
