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
    if (existing) {
      set({ items: items.map(i =>
        i.food_item.id === foodItem.id
          ? { ...i, quantity: i.quantity + 1 }
          : i
      )})
    } else {
      set({ items: [...items, {
        food_item:  foodItem,
        quantity:   1,
        unit_price: parseFloat(foodItem.price),
        notes:      '',
      }]})
    }
  },

  removeItem: (foodItemId) =>
    set({ items: get().items.filter(i => i.food_item.id !== foodItemId) }),

  updateQty: (foodItemId, qty) => {
    if (qty <= 0) {
      get().removeItem(foodItemId)
      return
    }
    set({ items: get().items.map(i =>
      i.food_item.id === foodItemId ? { ...i, quantity: qty } : i
    )})
  },

  clearCart: () => set({
    items: [], customerName: '', customerPhone: '',
    paymentMethod: 'CASH', discount: 0,
  }),

  setCustomer: (name, phone) => set({ customerName: name, customerPhone: phone }),
  setPaymentMethod: (m) => set({ paymentMethod: m }),
  setDiscount:      (d) => set({ discount: d }),

  getSubtotal: () => get().items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
  getTax:      () => {
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
