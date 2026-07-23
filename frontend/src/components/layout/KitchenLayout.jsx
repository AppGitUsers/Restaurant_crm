import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useNavigate } from 'react-router-dom'
import { LogOut, ChefHat } from 'lucide-react'
import { authAPI } from '@/api'
import toast from 'react-hot-toast'

export default function KitchenLayout() {
  const { user, refreshToken, logout } = useAuthStore()
  const navigate = useNavigate()
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const doLogout = async () => {
    try { await authAPI.logout(refreshToken) } catch {}
    logout()
    navigate('/kitchen-login')
    toast.success('Logged out')
  }

  const pad = n => String(n).padStart(2, '0')
  const clock = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
            <ChefHat size={18} className="text-white" />
          </div>
          <span className="text-gray-800 font-bold text-base">Kitchen Display</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-primary-600 font-mono text-lg font-bold tracking-widest">{clock}</span>
          <span className="text-gray-500 text-sm hidden sm:block">{user?.first_name || user?.username}</span>
          <button
            onClick={doLogout}
            className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm transition-colors"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}
