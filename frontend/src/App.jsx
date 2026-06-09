import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import AdminLayout from '@/components/layout/AdminLayout'
import BillerLayout from '@/components/layout/BillerLayout'

// Auth
import LoginPage      from '@/pages/auth/LoginPage'
import BillerLogin    from '@/pages/auth/BillerLogin'

// Admin pages
import Dashboard      from '@/pages/dashboard/Dashboard'
import MenuPage       from '@/pages/menu/MenuPage'
import InventoryPage  from '@/pages/inventory/InventoryPage'
import FinancePage    from '@/pages/finance/FinancePage'
import StaffPage      from '@/pages/staff/StaffPage'
import CustomersPage  from '@/pages/customers/CustomersPage'

// Billing pages
import BillingPage       from '@/pages/billing/BillingPage'
import AttendanceKiosk   from '@/pages/attendance/AttendanceKiosk'

function RequireAuth({ children, allowedRoles }) {
  const { user, token } = useAuthStore()
  if (!token || !user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return user.role === 'BILLER'
      ? <Navigate to="/billing" replace />
      : <Navigate to="/dashboard" replace />
  }
  return children
}

export default function App() {
  const { user, token } = useAuthStore()

  return (
    <Routes>
      {/* Public */}
      <Route path="/login"        element={<LoginPage />} />
      <Route path="/biller-login" element={<BillerLogin />} />

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
        <Route path="kiosk"          element={<AttendanceKiosk />} />
      </Route>

      {/* Biller routes */}
      <Route path="/billing" element={
        <RequireAuth allowedRoles={['ADMIN', 'BILLER']}>
          <BillerLayout />
        </RequireAuth>
      }>
        <Route index             element={<BillingPage />} />
        <Route path="kiosk"      element={<AttendanceKiosk />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={
        token
          ? <Navigate to={user?.role === 'BILLER' ? '/billing' : '/dashboard'} replace />
          : <Navigate to="/login" replace />
      } />
    </Routes>
  )
}
