import { useState, useEffect } from 'react'
import { staffAPI } from '@/api'
import {
  Clock, ArrowLeft,
  LogIn, LogOut, CheckCircle, AlertCircle, Users,
} from 'lucide-react'

function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="text-center mb-4">
      <p className="text-5xl font-bold text-primary-700 font-mono tracking-widest">
        {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
      </p>
      <p className="text-gray-500 text-sm mt-2">
        {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
    </div>
  )
}

function Avatar({ employee }) {
  return (
    <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden flex-shrink-0">
      {employee.photo_url
        ? <img src={employee.photo_url} alt={employee.name} className="w-full h-full object-cover" />
        : <span className="font-bold text-primary-500 text-xl">{employee.name[0].toUpperCase()}</span>
      }
    </div>
  )
}

function Countdown({ seconds }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(l => l - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return (
    <div className="mt-5">
      <p className="text-gray-400 text-xs text-center mb-1">Resetting in {left}s…</p>
      <div className="w-full bg-gray-100 rounded-full h-1">
        <div
          className="bg-primary-400 h-1 rounded-full transition-all duration-1000"
          style={{ width: `${(left / seconds) * 100}%` }}
        />
      </div>
    </div>
  )
}

export default function AttendanceKiosk() {
  const [phase, setPhase]             = useState('entry')
  const [empId, setEmpId]             = useState('')
  const [employee, setEmployee]       = useState(null)
  const [todayRecord, setTodayRecord] = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [actionType, setActionType]   = useState('')
  const [actionTime, setActionTime]   = useState('')

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (phase !== 'success') return
    const t = setTimeout(reset, 4000)
    return () => clearTimeout(t)
  }, [phase])

  const reset = () => {
    setPhase('entry')
    setEmpId('')
    setEmployee(null)
    setTodayRecord(null)
    setError('')
    setActionType('')
    setActionTime('')
  }

  const handleLookup = async () => {
    const id = empId.trim()
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const { data: emp }      = await staffAPI.employees.get(id)
      const { data: attData }  = await staffAPI.attendance.todayRecord(emp.id, today)
      const records = attData.results || attData
      const record  = Array.isArray(records) ? records.find(r => r.employee === emp.id) : null
      setEmployee(emp)
      setTodayRecord(record || null)
      setPhase('confirm')
    } catch (e) {
      setError(e.response?.status === 404 ? 'Employee not found. Please check your ID.' : 'Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (type) => {
    setLoading(true)
    setError('')
    try {
      const timeNow = new Date().toTimeString().slice(0, 5)
      if (type === 'CHECK_IN') {
        await staffAPI.attendance.create({ employee: employee.id, date: today, status: 'PRESENT', check_in: timeNow })
      } else {
        await staffAPI.attendance.update(todayRecord.id, { check_out: timeNow })
      }
      setActionType(type)
      setActionTime(timeNow)
      setPhase('success')
    } catch (e) {
      setError(e.response?.data?.non_field_errors?.[0] || 'Failed to record. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const attState = todayRecord
    ? (todayRecord.check_out ? 'COMPLETED' : 'CHECKED_IN')
    : 'NOT_MARKED'

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-4 px-4">

      {/* Page header */}
      <div className="text-center mb-2">
        <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-2">
          <Clock size={24} className="text-primary-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-800">Attendance Kiosk</h1>
        <p className="text-gray-400 text-xs mt-0.5">Staff check-in / check-out station</p>
      </div>

      <div className="w-full max-w-sm">
        <LiveClock />

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">

          {/* ══ ENTRY PHASE ══ */}
          {phase === 'entry' && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-5">
                <Users size={30} className="text-primary-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-1">Mark Attendance</h2>
              <p className="text-gray-400 text-sm mb-7">Enter your Employee ID to continue</p>

              <input
                type="number"
                min="1"
                className="w-full text-center text-4xl font-bold border-2 border-gray-200 rounded-2xl py-4 px-4
                           focus:outline-none focus:border-primary-400 transition-colors mb-4 tracking-widest
                           [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="0000"
                value={empId}
                onChange={e => { setEmpId(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                autoFocus
              />

              {error && (
                <div className="flex items-center justify-center gap-1.5 text-red-500 text-sm mb-4">
                  <AlertCircle size={14} />{error}
                </div>
              )}

              <button
                onClick={handleLookup}
                disabled={loading || !empId.trim()}
                className="w-full bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white
                           font-bold py-4 rounded-2xl text-lg transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary-200"
              >
                {loading ? 'Looking up…' : 'Continue →'}
              </button>
            </div>
          )}

          {/* ══ CONFIRM PHASE ══ */}
          {phase === 'confirm' && employee && (
            <div className="p-8">
              <button
                onClick={() => { setPhase('entry'); setEmpId(''); setError('') }}
                className="flex items-center gap-1 text-gray-400 hover:text-gray-600 text-sm mb-5 transition-colors"
              >
                <ArrowLeft size={14} /> Back
              </button>

              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl mb-6">
                <Avatar employee={employee} />
                <div className="min-w-0">
                  <p className="font-bold text-gray-800 text-lg leading-tight truncate">{employee.name}</p>
                  <p className="text-sm text-gray-400 truncate">
                    {employee.department_name || 'No department'}
                    {employee.shift_name ? ` · ${employee.shift_name}` : ''}
                  </p>
                  <p className="text-xs text-gray-300 mt-0.5">Employee #{employee.id}</p>
                </div>
              </div>

              {error && (
                <div className="flex items-center justify-center gap-1.5 text-red-500 text-sm mb-4">
                  <AlertCircle size={14} />{error}
                </div>
              )}

              {attState === 'NOT_MARKED' && (
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-5">No attendance recorded today</p>
                  <button
                    onClick={() => handleAction('CHECK_IN')}
                    disabled={loading}
                    className="w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white
                               font-bold py-5 rounded-2xl text-xl transition-colors
                               disabled:opacity-40 flex items-center justify-center gap-3 shadow-lg shadow-green-100"
                  >
                    <LogIn size={24} />
                    {loading ? 'Recording…' : 'Check In'}
                  </button>
                </div>
              )}

              {attState === 'CHECKED_IN' && (
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 bg-green-50 text-green-600 text-sm font-medium px-4 py-2 rounded-xl mb-5">
                    <CheckCircle size={15} />
                    Checked in at {todayRecord.check_in?.slice(0, 5)}
                  </div>
                  <button
                    onClick={() => handleAction('CHECK_OUT')}
                    disabled={loading}
                    className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white
                               font-bold py-5 rounded-2xl text-xl transition-colors
                               disabled:opacity-40 flex items-center justify-center gap-3 shadow-lg shadow-orange-100"
                  >
                    <LogOut size={24} />
                    {loading ? 'Recording…' : 'Check Out'}
                  </button>
                </div>
              )}

              {attState === 'COMPLETED' && (
                <div className="text-center">
                  <div className="bg-primary-50 rounded-2xl p-6 mb-4">
                    <CheckCircle size={40} className="text-primary-400 mx-auto mb-3" />
                    <p className="font-semibold text-gray-700">Attendance complete for today</p>
                    <div className="flex justify-center gap-8 mt-3 text-sm">
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-0.5">Check In</p>
                        <p className="font-bold text-green-600">{todayRecord.check_in?.slice(0, 5)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-0.5">Check Out</p>
                        <p className="font-bold text-orange-600">{todayRecord.check_out?.slice(0, 5)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-0.5">Hours</p>
                        <p className="font-bold text-primary-600">{todayRecord.hours_worked}h</p>
                      </div>
                    </div>
                  </div>
                  <button onClick={reset} className="text-primary-500 hover:underline text-sm">
                    ← Back to Kiosk
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══ SUCCESS PHASE ══ */}
          {phase === 'success' && (
            <div className="p-8 text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4
                ${actionType === 'CHECK_IN' ? 'bg-green-100' : 'bg-orange-100'}`}>
                {actionType === 'CHECK_IN'
                  ? <LogIn size={36} className="text-green-500" />
                  : <LogOut size={36} className="text-orange-500" />
                }
              </div>

              <h2 className={`text-3xl font-bold mb-1 ${actionType === 'CHECK_IN' ? 'text-green-600' : 'text-orange-600'}`}>
                {actionType === 'CHECK_IN' ? 'Checked In!' : 'Checked Out!'}
              </h2>

              <p className="text-gray-700 font-semibold text-lg mt-2">{employee?.name}</p>

              <div className="flex items-center justify-center gap-1.5 text-gray-400 text-sm mt-2">
                <Clock size={13} />
                <span>{actionTime}</span>
                <span>·</span>
                <span>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </div>

              <Countdown seconds={4} />
            </div>
          )}
        </div>
      </div>

      <p className="text-gray-400 text-xs mt-4">Restaurant CRM · Staff Attendance System</p>
    </div>
  )
}
