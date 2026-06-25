import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import AdminLayout   from '@/components/layout/AdminLayout'
import BillerLayout  from '@/components/layout/BillerLayout'
import KitchenLayout from '@/components/layout/KitchenLayout'

// Auth
import LoginPage      from '@/pages/auth/LoginPage'
import BillerLogin    from '@/pages/auth/BillerLogin'
import KitchenLogin   from '@/pages/auth/KitchenLogin'

// Admin pages
import Dashboard      from '@/pages/dashboard/Dashboard'
import MenuPage       from '@/pages/menu/MenuPage'
import InventoryPage  from '@/pages/inventory/InventoryPage'
import FinancePage    from '@/pages/finance/FinancePage'
import StaffPage      from '@/pages/staff/StaffPage'
import CustomersPage  from '@/pages/customers/CustomersPage'
import SettingsPage   from '@/pages/settings/SettingsPage'
import AdminTablesPage from '@/pages/admin/AdminTablesPage'

// Billing pages
import BillingPage    from '@/pages/billing/BillingPage'
import TablesGridPage from '@/pages/billing/TablesGridPage'
import TableBillPage  from '@/pages/billing/TableBillPage'
import AttendanceKiosk from '@/pages/attendance/AttendanceKiosk'

// Kitchen
import KitchenPage from '@/pages/kitchen/KitchenPage'

// Customer QR order
import QROrderPage from '@/pages/order/QROrderPage'

const roleHome = role => {
  if (role === 'BILLER')  return '/billing'
  if (role === 'KITCHEN') return '/kitchen'
  return '/dashboard'
}

function RequireAuth({ children, allowedRoles }) {
  const { user, token } = useAuthStore()
  if (!token || !user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />
  }
  return children
}

export default function App() {
  const { user, token } = useAuthStore()

  return (
    <Routes>
      {/* Public */}
      <Route path="/login"          element={<LoginPage />} />
      <Route path="/biller-login"   element={<BillerLogin />} />
      <Route path="/kitchen-login"  element={<KitchenLogin />} />

      {/* Admin routes */}
      <Route path="/" element={
        <RequireAuth allowedRoles={['ADMIN']}>
          <AdminLayout />
        </RequireAuth>
      }>
        <Route index                 element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"      element={<Dashboard />} />
        <Route path="menu"           element={<MenuPage />} />
        <Route path="inventory"      element={<InventoryPage />} />
        <Route path="billing-admin"  element={<BillingPage />} />
        <Route path="finance"        element={<FinancePage />} />
        <Route path="staff"          element={<StaffPage />} />
        <Route path="customers"      element={<CustomersPage />} />
        <Route path="tables-admin"   element={<AdminTablesPage />} />
        <Route path="settings"       element={<SettingsPage />} />
      </Route>

      {/* Kiosk — full-screen, no sidebar, accessible by both roles */}
      <Route path="/kiosk" element={
        <RequireAuth allowedRoles={['ADMIN', 'BILLER']}>
          <AttendanceKiosk />
        </RequireAuth>
      } />

      {/* Biller routes */}
      <Route path="/billing" element={
        <RequireAuth allowedRoles={['ADMIN', 'BILLER']}>
          <BillerLayout />
        </RequireAuth>
      }>
        <Route index                      element={<BillingPage />} />
        <Route path="tables"              element={<TablesGridPage />} />
        <Route path="tables/:sessionId"   element={<TableBillPage />} />
        <Route path="customers"           element={<CustomersPage />} />
      </Route>

      {/* Public — Customer QR order page (no auth) */}
      <Route path="/order/:token" element={<QROrderPage />} />

      {/* Kitchen routes */}
      <Route path="/kitchen" element={
        <RequireAuth allowedRoles={['ADMIN', 'BILLER', 'KITCHEN']}>
          <KitchenLayout />
        </RequireAuth>
      }>
        <Route index element={<KitchenPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={
        token
          ? <Navigate to={roleHome(user?.role)} replace />
          : <Navigate to="/login" replace />
      } />
    </Routes>
  )
}
