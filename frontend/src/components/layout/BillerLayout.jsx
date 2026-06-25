import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useNavigate } from 'react-router-dom'
import { LogOut, UtensilsCrossed, Clock, LayoutGrid, Receipt, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '@/api'
import { ConfirmDialog } from '@/components/ui'
import clsx from 'clsx'

export default function BillerLayout() {
  const { user, refreshToken, logout } = useAuthStore()
  const navigate = useNavigate()
  const [logoutConfirm, setLogoutConfirm] = useState(false)

  const doLogout = async () => {
    try { await authAPI.logout(refreshToken) } catch {}
    logout()
    navigate('/biller-login')
    toast.success('Logged out')
  }

  return (
    <div className="flex flex-col h-screen bg-surface">
      {/* Top bar */}
      <header className="bg-primary-600 text-white px-4 py-2.5 flex items-center justify-between shadow-md flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gold-300 flex items-center justify-center flex-shrink-0">
            <UtensilsCrossed size={18} />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm sm:text-base">Restaurant CRM</span>
            <span className="text-primary-200 text-xs ml-2 hidden sm:inline">· Billing Station</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          <span className="text-primary-200 text-sm hidden md:block truncate max-w-[120px]">
            {user?.first_name || user?.username}
          </span>
          <button
            onClick={() => window.open('/kiosk', '_blank')}
            title="Open Attendance Kiosk"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20
                       text-white text-sm font-medium transition-colors"
          >
            <Clock size={14} />
            <span className="hidden sm:inline">Kiosk</span>
          </button>
          <button
            onClick={() => setLogoutConfirm(true)}
            className="flex items-center gap-1.5 text-primary-200 hover:text-white text-sm transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="bg-white border-b border-gray-200 px-4 flex gap-1 flex-shrink-0">
        <NavLink
          to="/billing"
          end
          className={({ isActive }) => clsx(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            isActive
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <Receipt size={15} /> Quick Bill
        </NavLink>
        <NavLink
          to="/billing/tables"
          className={({ isActive }) => clsx(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            isActive
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <LayoutGrid size={15} /> Tables
        </NavLink>
        <NavLink
          to="/billing/customers"
          className={({ isActive }) => clsx(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
            isActive
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <Users size={15} /> Customers
        </NavLink>
      </nav>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <ConfirmDialog
        open={logoutConfirm}
        onClose={() => setLogoutConfirm(false)}
        onConfirm={doLogout}
        title="Log Out"
        message="Are you sure you want to log out?"
      />
    </div>
  )
}
