import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useNavigate } from 'react-router-dom'
import { LogOut, UtensilsCrossed } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '@/api'

export default function BillerLayout() {
  const { user, refreshToken, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try { await authAPI.logout(refreshToken) } catch {}
    logout()
    navigate('/biller-login')
    toast.success('Logged out')
  }

  return (
    <div className="flex flex-col h-screen bg-surface">
      {/* Minimal top bar */}
      <header className="bg-primary-600 text-white px-6 py-3 flex items-center justify-between shadow-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gold-300 flex items-center justify-center">
            <UtensilsCrossed size={18} />
          </div>
          <div>
            <span className="font-bold text-base">Restaurant CRM</span>
            <span className="text-primary-200 text-xs ml-2">· Billing Station</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-primary-200 text-sm">
            {user?.first_name || user?.username}
          </span>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-primary-200 hover:text-white text-sm transition-colors">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
