import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { authAPI } from '@/api'
import { Spinner } from '@/components/ui'
import toast from 'react-hot-toast'
import { Receipt, Eye, EyeOff } from 'lucide-react'

export default function BillerLogin() {
  const [form, setForm]       = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const { setAuth }           = useAuthStore()
  const navigate              = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await authAPI.login(form)
      if (!['BILLER', 'ADMIN'].includes(data.role)) {
        toast.error('Access denied for this portal.')
        return
      }
      setAuth(data.access, data.refresh, {
        user_id:  data.user_id,
        username: data.username,
        email:    data.email,
        role:     data.role,
      })
      toast.success('Welcome to Billing!')
      navigate('/billing')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-700 via-primary-600 to-gold-400 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gold-300 flex items-center justify-center shadow-lg mb-3">
            <Receipt size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-800">Billing Station</h1>
          <p className="text-sm text-gray-400 mt-1">Biller Access Only</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              type="text"
              className="input"
              placeholder="Biller username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                className="input pr-10"
                placeholder="Password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-secondary w-full justify-center py-2.5 mt-2">
            {loading ? <><Spinner size={16} /> Signing in…</> : 'Open Billing'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-gray-100 text-center">
          <Link to="/login" className="text-sm text-gray-400 hover:text-gray-600">
            ← Admin Login
          </Link>
        </div>
      </div>
    </div>
  )
}
