import client from './client'
import publicClient from './publicClient'

// ── Auth ───────────────────────────────────────────────
export const authAPI = {
  login:   (data)       => client.post('/auth/login/', data),
  logout:  (refresh)    => client.post('/auth/logout/', { refresh }),
  me:      ()           => client.get('/auth/me/'),
  users:   {
    list:   ()          => client.get('/auth/users/'),
    create: (data)      => client.post('/auth/users/', data),
    update: (id, data)  => client.patch(`/auth/users/${id}/`, data),
    delete: (id)        => client.delete(`/auth/users/${id}/`),
  },
}

// ── Menu ──────────────────────────────────────────────
export const menuAPI = {
  types: {
    list:   (params)    => client.get('/menu/types/', { params }),
    create: (data)      => client.post('/menu/types/', data),
    update: (id, data)  => client.patch(`/menu/types/${id}/`, data),
    delete: (id)        => client.delete(`/menu/types/${id}/`),
  },
  addons: {
    list:   (params)    => client.get('/menu/addons/', { params }),
    create: (data)      => client.post('/menu/addons/', data),
    update: (id, data)  => client.patch(`/menu/addons/${id}/`, data),
    delete: (id)        => client.delete(`/menu/addons/${id}/`),
  },
  items: {
    list:       (params)       => client.get('/menu/items/', { params }),
    get:        (id)           => client.get(`/menu/items/${id}/`),
    create:     (data)         => client.post('/menu/items/', data, { headers: { 'Content-Type': 'multipart/form-data' }}),
    update:     (id, data)     => client.patch(`/menu/items/${id}/`, data, { headers: { 'Content-Type': 'multipart/form-data' }}),
    delete:     (id)           => client.delete(`/menu/items/${id}/`),
    setRecipe:       (id, data)   => client.post(`/menu/items/${id}/set_recipe/`, data),
    recipe:          (id)         => client.get(`/menu/items/${id}/recipe/`),
    recalcAll:       ()           => client.post('/menu/items/recalculate_all/'),
    createCombo:     (data)       => client.post('/menu/items/create_combo/', data),
    setComponents:   (id, data)   => client.post(`/menu/items/${id}/set_combo_components/`, data),
  },
  ingredients: {
    list:   (params)    => client.get('/menu/ingredients/', { params }),
    create: (data)      => client.post('/menu/ingredients/', data),
    update: (id, data)  => client.patch(`/menu/ingredients/${id}/`, data),
    delete: (id)        => client.delete(`/menu/ingredients/${id}/`),
  },
}

// ── Inventory ─────────────────────────────────────────
export const inventoryAPI = {
  vendors: {
    list:   (params)    => client.get('/inventory/vendors/', { params }),
    create: (data)      => client.post('/inventory/vendors/', data),
    update: (id, data)  => client.patch(`/inventory/vendors/${id}/`, data),
    delete: (id)        => client.delete(`/inventory/vendors/${id}/`),
  },
  stock: {
    list:       (params)      => client.get('/inventory/stock/', { params }),
    lowAlert:   ()            => client.get('/inventory/stock/low_stock_alert/'),
    adjust:     (id, data)    => client.post(`/inventory/stock/${id}/manual_adjust/`, data),
  },
  invoices: {
    list:         (params)    => client.get('/inventory/invoices/', { params }),
    get:          (id)        => client.get(`/inventory/invoices/${id}/`),
    create:       (data)      => client.post('/inventory/invoices/', data),
    update:       (id, data)  => client.patch(`/inventory/invoices/${id}/`, data),
    delete:       (id)        => client.delete(`/inventory/invoices/${id}/`),
    markReceived: (id)        => client.post(`/inventory/invoices/${id}/mark_received/`),
    addPayment:   (id, data)  => client.post(`/inventory/invoices/${id}/add_payment/`, data),
  },
  transactions: {
    list: (params) => client.get('/inventory/transactions/', { params }),
  },
}

// ── Billing ───────────────────────────────────────────
export const billingAPI = {
  orders: {
    list:    (params)      => client.get('/billing/orders/', { params }),
    get:     (id)          => client.get(`/billing/orders/${id}/`),
    create:  (data)        => client.post('/billing/orders/', data),
    confirm: (id)          => client.post(`/billing/orders/${id}/confirm/`),
    pay:     (id, data)    => client.post(`/billing/orders/${id}/pay/`, data),
    cancel:  (id)          => client.post(`/billing/orders/${id}/cancel/`),
    billPdf: (id)          => client.get(`/billing/orders/${id}/bill_pdf/`, { responseType: 'blob' }),
  },
}

// ── Finance ───────────────────────────────────────────
export const financeAPI = {
  summary:       (params)        => client.get('/finance/summary/', { params }),
  monthlyReport: (year, month)   => client.get('/finance/monthly_report/', { params: { year, month }, responseType: 'blob' }),
  monthlyData:   (year, month)   => client.get('/finance/monthly_data/',   { params: { year, month } }),
  transactions: {
    list:         (params)        => client.get('/finance/transactions/', { params }),
    create:       (data)          => client.post('/finance/transactions/', data),
    secureDelete: (id, password)  => client.post(`/finance/transactions/${id}/secure_delete/`, { password }),
  },
  expenses: {
    list:   (params)    => client.get('/finance/expenses/', { params }),
    create: (data)      => client.post('/finance/expenses/', data),
    update: (id, data)  => client.patch(`/finance/expenses/${id}/`, data),
    delete: (id)        => client.delete(`/finance/expenses/${id}/`),
  },
  reports: {
    list: (params) => client.get('/finance/reports/', { params }),
  },
}

// ── Staff ─────────────────────────────────────────────
export const staffAPI = {
  departments: {
    list:   ()          => client.get('/staff/departments/'),
    create: (data)      => client.post('/staff/departments/', data),
    update: (id, data)  => client.patch(`/staff/departments/${id}/`, data),
    delete: (id)        => client.delete(`/staff/departments/${id}/`),
  },
  shifts: {
    list:   ()          => client.get('/staff/shifts/'),
    create: (data)      => client.post('/staff/shifts/', data),
    update: (id, data)  => client.patch(`/staff/shifts/${id}/`, data),
    delete: (id)        => client.delete(`/staff/shifts/${id}/`),
  },
  employees: {
    list:               (params)      => client.get('/staff/employees/', { params }),
    get:                (id)          => client.get(`/staff/employees/${id}/`),
    create:             (data)        => client.post('/staff/employees/', data, { headers: { 'Content-Type': 'multipart/form-data' }}),
    update:             (id, data)    => client.patch(`/staff/employees/${id}/`, data, { headers: { 'Content-Type': 'multipart/form-data' }}),
    delete:             (id)          => client.delete(`/staff/employees/${id}/`),
    attendanceCalendar: (id, params)  => client.get(`/staff/employees/${id}/attendance_calendar/`, { params }),
    paymentHistory:     (id)          => client.get(`/staff/employees/${id}/payment_history/`),
  },
  attendance: {
    list:           (params)         => client.get('/staff/attendance/', { params }),
    byDate:         (date)           => client.get('/staff/attendance/by_date/', { params: { date } }),
    todayRecord:    (empId, date)    => client.get('/staff/attendance/', { params: { employee: empId, date } }),
    create:         (data)           => client.post('/staff/attendance/', data),
    update:         (id, data)       => client.patch(`/staff/attendance/${id}/`, data),
    monthlySummary: (params)         => client.get('/staff/attendance/monthly_summary/', { params }),
  },
  payments: {
    list:   (params)    => client.get('/staff/payments/', { params }),
    create: (data)      => client.post('/staff/payments/', data),
    delete: (id)        => client.delete(`/staff/payments/${id}/`),
  },
}

// ── Customers ─────────────────────────────────────────
export const customersAPI = {
  list:      (params)    => client.get('/customers/customers/', { params }),
  get:       (id)        => client.get(`/customers/customers/${id}/`),
  create:    (data)      => client.post('/customers/customers/', data),
  update:    (id, data)  => client.patch(`/customers/customers/${id}/`, data),
  highValue: ()          => client.get('/customers/customers/high_value/'),
  visits:    (params)    => client.get('/customers/visits/', { params }),
}

// ── Dashboard ─────────────────────────────────────────
export const dashboardAPI = {
  summary: () => client.get('/dashboard/summary/'),
}

// ── Settings ──────────────────────────────────────────
export const settingsAPI = {
  get:    ()      => client.get('/settings/'),
  update: (data)  => client.patch('/settings/', data),
}

// ── Notifications ─────────────────────────────────────
export const notificationsAPI = {
  list:  (params) => client.get('/notifications/', { params }),
  stats: ()       => client.get('/notifications/stats/'),
}

// ── Tables / Kitchen / QR ─────────────────────────────
export const tablesAPI = {
  // Admin — table management
  admin: {
    list:   ()              => client.get('/admin/tables/'),
    create: (data)          => client.post('/admin/tables/', data),
    update: (id, data)      => client.patch(`/admin/tables/${id}/`, data),
    delete: (id)            => client.delete(`/admin/tables/${id}/`),
  },

  // Biller
  todaySessions: ()              => client.get('/tables/today/'),
  list:          ()              => client.get('/tables/'),
  openTable:     (id)            => client.post(`/tables/${id}/open/`),
  sessionDetail: (id)            => client.get(`/tables/sessions/${id}/`),
  addBatch:      (id, data)      => client.post(`/tables/sessions/${id}/add_batch/`, data),
  bill:          (id, data)      => client.post(`/tables/sessions/${id}/bill/`, data),
  endSession:    (id)            => client.post(`/tables/sessions/${id}/end/`),

  // Kitchen
  kitchen: {
    batches:       ()                       => client.get('/kitchen/batches/'),
    servedBatches: ()                       => client.get('/kitchen/batches/?served=true'),
    updateStatus:  (id, status)             => client.patch(`/kitchen/batches/${id}/`, { status }),
    cancelItem:    (itemId, pin, restoreStock) => client.post(`/kitchen/items/${itemId}/cancel/`, { pin, restore_stock: restoreStock }),
    reduceItem:    (itemId, newQty, pin)    => client.post(`/kitchen/items/${itemId}/reduce/`, { pin, new_quantity: newQty }),
  },

  // Public (no auth) — uses publicClient so no token is attached
  public: {
    menu:             (token)            => publicClient.get(`/public/table/${token}/menu/`),
    order:            (token, data)      => publicClient.post(`/public/table/${token}/order/`, data),
    cancelBatch:      (token, batchId)   => publicClient.post(`/public/table/${token}/orders/${batchId}/cancel/`),
    ackNotifications: (token, ids)       => publicClient.post(`/public/table/${token}/notifications/ack/`, { ids }),
    receipt:          (shareToken)       => publicClient.get(`/billing/receipt/${shareToken}/`),
  },
}
