import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, Bell, LogOut, User, Clock } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { authAPI } from '@/api'
import { ConfirmDialog } from '@/components/ui'
import toast from 'react-hot-toast'

export default function Topbar({ onMenuClick }) {
  const { user, refreshToken, logout } = useAuthStore()
  const navigate = useNavigate()
  const [logoutConfirm, setLogoutConfirm] = useState(false)

  const doLogout = async () => {
    try { await authAPI.logout(refreshToken) } catch {}
    logout()
    navigate('/login')
    toast.success('Logged out successfully')
  }

  return (
    <>
    <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors flex-shrink-0"
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-sm font-semibold text-gray-500 hidden sm:block truncate">
          Welcome back,{' '}
          <span className="text-primary-500">
            {user?.first_name || user?.username || 'Admin'}
          </span>
        </h1>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
        <button
          onClick={() => window.open('/kiosk', '_blank')}
          title="Open Attendance Kiosk"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 text-primary-600
                     hover:bg-primary-100 transition-colors text-sm font-medium"
        >
          <Clock size={15} />
          Kiosk
        </button>

        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell size={18} className="text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-gold-300 rounded-full" />
        </button>

        <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-gray-100">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <User size={16} className="text-primary-500" />
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-gray-700 truncate max-w-[100px]">{user?.username}</p>
            <p className="text-xs text-gray-400">{user?.role}</p>
          </div>
        </div>

        <button
          onClick={() => setLogoutConfirm(true)}
          className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
          title="Logout"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
    <ConfirmDialog
      open={logoutConfirm}
      onClose={() => setLogoutConfirm(false)}
      onConfirm={doLogout}
      title="Log Out"
      message="Are you sure you want to log out?"
    />
    </>
  )
}
