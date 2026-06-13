import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffAPI, authAPI } from '@/api'
import { PageLoader, Modal, SearchBar, StatusBadge, ConfirmDialog, Field, Empty } from '@/components/ui'
import toast from 'react-hot-toast'
import {
  Plus, Edit2, Trash2, Calendar, CreditCard, Users,
  Clock, Building2, KeyRound, ChevronLeft, ChevronRight,
  AlertCircle, Zap, Check, X,
} from 'lucide-react'
import { format, getDaysInMonth, startOfMonth } from 'date-fns'

const ALL_DAYS = [
  { code: 'MON', label: 'Mon' },
  { code: 'TUE', label: 'Tue' },
  { code: 'WED', label: 'Wed' },
  { code: 'THU', label: 'Thu' },
  { code: 'FRI', label: 'Fri' },
  { code: 'SAT', label: 'Sat' },
  { code: 'SUN', label: 'Sun' },
]

// ── Attendance full-page calendar ─────────────────────
function AttendanceCalendar({ employee, onBack }) {
  const qc     = useQueryClient()
  const today  = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [editDay, setEditDay] = useState(null)
  const [editForm, setEditForm] = useState({})

  const { data, isLoading } = useQuery({
    queryKey: ['att-cal', employee?.id, year, month],
    queryFn:  () => staffAPI.employees.attendanceCalendar(employee.id, { year, month }).then(r => r.data),
    enabled:  !!employee,
  })

  const records = data || []
  const attMap  = {}
  records.forEach(a => { attMap[a.date] = a })

  const days      = getDaysInMonth(new Date(year, month - 1))
  const startDay  = startOfMonth(new Date(year, month - 1)).getDay()

  const presentDays = records.filter(r => r.status === 'PRESENT').length
  const absentDays  = records.filter(r => r.status === 'ABSENT').length
  const halfDays    = records.filter(r => r.status === 'HALF').length
  const lateDays    = records.filter(r => r.is_late).length
  const otDays      = records.filter(r => r.ot_minutes > 0).length
  const totalHours  = records.reduce((s, r) => s + parseFloat(r.hours_worked || 0), 0)

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const openEdit = (day) => {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const att     = attMap[dateStr]
    setEditDay({ date: dateStr, att })
    setEditForm(att ? {
      status:    att.status,
      check_in:  att.check_in  || '',
      check_out: att.check_out || '',
      notes:     att.notes     || '',
    } : {
      status: 'PRESENT', check_in: '', check_out: '', notes: '',
    })
  }

  const saveAtt = useMutation({
    mutationFn: async (form) => {
      const att = editDay?.att
      const payload = {
        employee:  employee.id,
        date:      editDay.date,
        status:    form.status,
        check_in:  form.check_in  || null,
        check_out: form.check_out || null,
        notes:     form.notes,
      }
      if (att) return staffAPI.attendance.update(att.id, payload)
      return staffAPI.attendance.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries(['att-cal', employee.id, year, month])
      qc.invalidateQueries(['att-by-date'])
      setEditDay(null)
      toast.success('Attendance saved')
    },
    onError: e => toast.error(e?.response?.data?.non_field_errors?.[0] || 'Save failed'),
  })

  const deleteAtt = useMutation({
    mutationFn: (id) => staffAPI.attendance.update(id, { status: 'ABSENT', check_in: null, check_out: null }),
    onSuccess: () => {
      qc.invalidateQueries(['att-cal', employee.id, year, month])
      setEditDay(null)
      toast.success('Marked absent')
    },
  })

  const statusBg = {
    PRESENT: 'bg-primary-500',
    ABSENT:  'bg-red-400',
    HALF:    'bg-amber-400',
    LEAVE:   'bg-gray-400',
  }
  const statusText = { PRESENT: 'P', ABSENT: 'A', HALF: 'H', LEAVE: 'L' }
  const needsTimes = (s) => s === 'PRESENT' || s === 'HALF'

  return (
    <div className="flex flex-col h-full">
      {/* Header: back + employee info + month nav — all on one row on mobile */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="btn-ghost py-1.5 px-2 text-sm flex items-center gap-1 flex-shrink-0">
          <ChevronLeft size={15} />Back
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            {employee.photo_url
              ? <img src={employee.photo_url} alt={employee.name} className="w-full h-full object-cover" />
              : <Users size={16} className="text-primary-400" />
            }
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-gray-800 text-sm sm:text-base truncate">{employee.name}</h2>
            <p className="text-xs text-gray-400 truncate hidden sm:block">{employee.shift_name || 'No shift'} • {employee.employment_type.replace('_',' ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={prevMonth} className="btn-ghost p-1"><ChevronLeft size={15} /></button>
          <span className="font-semibold text-gray-700 text-xs sm:text-sm whitespace-nowrap">
            {format(new Date(year, month - 1), 'MMM yyyy')}
          </span>
          <button onClick={nextMonth} className="btn-ghost p-1"><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {[
          { label: 'Total Hours',   value: `${totalHours.toFixed(1)}h`, color: 'text-primary-600', bg: 'bg-primary-50' },
          { label: 'Present',       value: presentDays,                  color: 'text-green-600',   bg: 'bg-green-50' },
          { label: 'Absent',        value: absentDays,                   color: 'text-red-600',     bg: 'bg-red-50' },
          { label: 'Half Day',      value: halfDays,                     color: 'text-amber-600',   bg: 'bg-amber-50' },
          { label: 'Late',          value: lateDays,                     color: 'text-orange-600',  bg: 'bg-orange-50' },
          { label: 'Overtime',      value: otDays,                       color: 'text-purple-600',  bg: 'bg-purple-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl px-3 py-2 text-center`}>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? <PageLoader /> : (
        <div className="flex-1 overflow-auto">
          {/* Day name headers: single letter on mobile, 3-letter on sm+ */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1">
            {[['S','Sun'],['M','Mon'],['T','Tue'],['W','Wed'],['T','Thu'],['F','Fri'],['S','Sat']].map(([short, full], i) => (
              <div key={full + i} className="text-center text-[10px] sm:text-xs font-semibold text-gray-400 py-1">
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{full}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={`empty-${i}`} className="rounded-lg sm:rounded-xl min-h-[44px] sm:min-h-[80px]" />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day     = i + 1
              const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const att     = attMap[dateStr]
              const isToday = dateStr === today.toISOString().split('T')[0]
              return (
                <div
                  key={day}
                  onClick={() => openEdit(day)}
                  className={`rounded-lg sm:rounded-xl min-h-[44px] sm:min-h-[80px] p-1 sm:p-2 cursor-pointer border transition-all hover:shadow-md select-none
                    ${att ? `${statusBg[att.status]} text-white border-transparent` : 'bg-gray-50 border-gray-100 hover:border-primary-200'}
                    ${isToday && !att ? 'border-primary-300 ring-1 ring-primary-200' : ''}`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs sm:text-sm font-bold ${att ? 'text-white' : isToday ? 'text-primary-600' : 'text-gray-700'}`}>{day}</span>
                    {att && <span className="text-[9px] sm:text-[10px] font-bold bg-white/20 px-0.5 sm:px-1 rounded">{statusText[att.status]}</span>}
                  </div>
                  {att && (att.status === 'PRESENT' || att.status === 'HALF') ? (
                    <div className="space-y-0.5">
                      {/* Time details only on sm+ */}
                      <div className="hidden sm:block space-y-0.5">
                        {att.check_in  && <p className="text-[10px] text-white/90 leading-tight">In: {att.check_in.slice(0,5)}</p>}
                        {att.check_out && <p className="text-[10px] text-white/90 leading-tight">Out: {att.check_out.slice(0,5)}</p>}
                        {parseFloat(att.hours_worked) > 0 && <p className="text-[10px] font-semibold text-white/90 leading-tight">{parseFloat(att.hours_worked).toFixed(1)}h</p>}
                      </div>
                      {/* Mobile: just show hours */}
                      {parseFloat(att.hours_worked) > 0 && (
                        <p className="sm:hidden text-[9px] font-semibold text-white/90">{parseFloat(att.hours_worked).toFixed(1)}h</p>
                      )}
                      <div className="flex flex-wrap gap-0.5">
                        {att.is_late && <span className="text-[8px] sm:text-[9px] bg-orange-500 text-white px-0.5 sm:px-1 rounded font-bold">L</span>}
                        {att.ot_minutes > 0 && <span className="text-[8px] sm:text-[9px] bg-purple-600 text-white px-0.5 sm:px-1 rounded font-bold sm:hidden">OT</span>}
                        {att.ot_minutes > 0 && <span className="hidden sm:inline text-[9px] bg-purple-600 text-white px-1 py-0.5 rounded font-bold">OT+{att.ot_minutes}m</span>}
                      </div>
                    </div>
                  ) : !att ? (
                    <p className="hidden sm:block text-[10px] text-gray-300 mt-1">tap</p>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-4 text-xs">
            {[
              { label: 'Present',  bg: 'bg-primary-500' },
              { label: 'Absent',   bg: 'bg-red-400' },
              { label: 'Half Day', bg: 'bg-amber-400' },
              { label: 'Leave',    bg: 'bg-gray-400' },
              { label: 'Late',     bg: 'bg-orange-500' },
              { label: 'OT',       bg: 'bg-purple-600' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm ${l.bg}`} />
                <span className="text-gray-500">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {editDay && (
        <Modal
          open={!!editDay}
          onClose={() => setEditDay(null)}
          title={`Attendance — ${editDay.date}`}
          size="sm"
          footer={
            <div className="flex justify-between w-full">
              <button onClick={() => setEditDay(null)} className="btn-ghost">Cancel</button>
              <button onClick={() => saveAtt.mutate(editForm)} disabled={saveAtt.isPending} className="btn-primary">
                <Check size={14} />Save
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <Field label="Status">
              <div className="grid grid-cols-2 gap-2">
                {['PRESENT','ABSENT','HALF','LEAVE'].map(s => (
                  <button key={s} type="button" onClick={() => setEditForm(f => ({ ...f, status: s }))}
                    className={`py-2 rounded-lg text-sm font-medium border-2 transition-colors
                      ${editForm.status === s ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-100 bg-white text-gray-500 hover:border-gray-200'}`}>
                    {s === 'PRESENT' ? '✓ Present' : s === 'ABSENT' ? '✗ Absent' : s === 'HALF' ? '½ Half Day' : '🏖 Leave'}
                  </button>
                ))}
              </div>
            </Field>
            {needsTimes(editForm.status) && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Check In"><input type="time" className="input" value={editForm.check_in} onChange={e => setEditForm(f => ({ ...f, check_in: e.target.value }))} /></Field>
                <Field label="Check Out"><input type="time" className="input" value={editForm.check_out} onChange={e => setEditForm(f => ({ ...f, check_out: e.target.value }))} /></Field>
              </div>
            )}
            <Field label="Notes">
              <input className="input" placeholder="Optional notes…" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </Field>
            {editForm.check_in && editForm.check_out && (
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 flex gap-4">
                <span>Hours: <strong className="text-gray-700">{(() => {
                  const ci = editForm.check_in.split(':').map(Number)
                  const co = editForm.check_out.split(':').map(Number)
                  const mins = (co[0]*60+co[1]) - (ci[0]*60+ci[1])
                  return mins > 0 ? `${(mins/60).toFixed(1)}h` : '—'
                })()}</strong></span>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Shift Tab (card view on all screens) ─────────────
function ShiftTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [sel, setSel]     = useState(null)
  const [del, setDel]     = useState(null)

  const emptyForm = {
    name: '', start_time: '', end_time: '',
    late_threshold: '15', ot_threshold: '30',
    days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    notes: '', is_active: true,
  }
  const [form, setForm] = useState(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn:  () => staffAPI.shifts.list().then(r => r.data.results || r.data),
  })

  const save   = useMutation({
    mutationFn: d => sel ? staffAPI.shifts.update(sel.id, d) : staffAPI.shifts.create(d),
    onSuccess:  () => { qc.invalidateQueries(['shifts']); setModal(false); toast.success('Shift saved') },
  })
  const remove = useMutation({
    mutationFn: id => staffAPI.shifts.delete(id),
    onSuccess:  () => { qc.invalidateQueries(['shifts']); setDel(null); toast.success('Shift deleted') },
  })

  const openCreate = () => { setSel(null); setForm(emptyForm); setModal(true) }
  const openEdit   = s => {
    setSel(s)
    setForm({
      name: s.name, start_time: s.start_time, end_time: s.end_time,
      late_threshold: String(s.late_threshold), ot_threshold: String(s.ot_threshold),
      days: s.days_list || [],
      notes: s.notes || '', is_active: s.is_active,
    })
    setModal(true)
  }

  const toggleDay = code => {
    setForm(f => ({
      ...f,
      days: f.days.includes(code) ? f.days.filter(d => d !== code) : [...f.days, code],
    }))
  }

  const shifts = data || []

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Shift</button>
      </div>

      {isLoading && <div className="text-center py-8 text-gray-400">Loading…</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shifts.map(s => (
          <div key={s.id} className="card flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-800">{s.name}</p>
                <p className="font-mono text-sm text-primary-600 mt-0.5">{s.start_time} – {s.end_time}</p>
              </div>
              <span className={s.is_active ? 'badge-green flex-shrink-0' : 'badge-gray flex-shrink-0'}>{s.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-xs text-gray-400">Hours</p><p className="font-semibold text-gray-700">{s.hours}h</p></div>
              <div><p className="text-xs text-gray-400">Late After</p><p className="font-semibold text-gray-700">{s.late_threshold}m</p></div>
              <div><p className="text-xs text-gray-400">OT After</p><p className="font-semibold text-gray-700">{s.ot_threshold}m</p></div>
            </div>
            <div className="flex flex-wrap gap-1">
              {(s.days_list || []).map(d => (
                <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary-50 text-primary-600">{d}</span>
              ))}
            </div>
            <div className="flex gap-1 border-t border-gray-50 pt-2">
              <button onClick={() => openEdit(s)} className="btn-ghost py-1 text-xs flex-1"><Edit2 size={12} />Edit</button>
              <button onClick={() => setDel(s)} className="btn-ghost py-1 text-xs text-red-400"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        {!isLoading && shifts.length === 0 && (
          <div className="col-span-full"><Empty message="No shifts created yet" /></div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={sel ? 'Edit Shift' : 'Add Shift'} size="lg"
        footer={<><button onClick={() => setModal(false)} className="btn-ghost">Cancel</button><button onClick={() => save.mutate({ ...form, days: form.days.join(',') })} disabled={save.isPending} className="btn-primary">Save</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Shift Name" required>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </Field>
          </div>
          <Field label="Start Time" required>
            <input type="time" className="input" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
          </Field>
          <Field label="End Time" required>
            <input type="time" className="input" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
          </Field>
          <Field label="Late Threshold (minutes)">
            <input type="number" min="0" className="input" value={form.late_threshold} onChange={e => setForm({ ...form, late_threshold: e.target.value })} />
          </Field>
          <Field label="OT Threshold (minutes)">
            <input type="number" min="0" className="input" value={form.ot_threshold} onChange={e => setForm({ ...form, ot_threshold: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <label className="label">Working Days</label>
            <div className="flex gap-2 text-xs">
              <button type="button" className="text-primary-500 hover:underline" onClick={() => setForm(f => ({ ...f, days: ALL_DAYS.map(d => d.code) }))}>All Days</button>
              <button type="button" className="text-primary-500 hover:underline" onClick={() => setForm(f => ({ ...f, days: ['MON','TUE','WED','THU','FRI'] }))}>Weekdays</button>
              <button type="button" className="text-gray-400 hover:underline" onClick={() => setForm(f => ({ ...f, days: [] }))}>Clear</button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {ALL_DAYS.map(d => (
              <button key={d.code} type="button" onClick={() => toggleDay(d.code)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                  ${form.days.includes(d.code) ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-500 border-gray-200 hover:border-primary-300'}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <Field label="Notes"><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input type="checkbox" id="shift-active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-primary-500" />
          <label htmlFor="shift-active" className="text-sm text-gray-600">Active</label>
        </div>
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)}
        title="Delete Shift" message={`Delete "${del?.name}"? Employees assigned will lose their shift.`} danger />
    </div>
  )
}

// ── Employee Tab ──────────────────────────────────────
function EmployeeTab({ onOpenCalendar }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [sel, setSel]       = useState(null)
  const [del, setDel]       = useState(null)
  const [form, setForm]     = useState({ name: '', phone: '', email: '', department: '', shift: '', employment_type: 'FULL_TIME', monthly_salary: '', joined_date: '', address: '' })
  const [photo, setPhoto]   = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['employees', search], queryFn: () => staffAPI.employees.list({ search }).then(r => r.data.results || r.data) })
  const { data: depts }     = useQuery({ queryKey: ['departments'], queryFn: () => staffAPI.departments.list().then(r => r.data.results || r.data) })
  const { data: shifts }    = useQuery({ queryKey: ['shifts'], queryFn: () => staffAPI.shifts.list().then(r => r.data.results || r.data) })

  const save   = useMutation({
    mutationFn: async d => {
      const fd = new FormData()
      Object.entries(d).forEach(([k, v]) => v !== '' && fd.append(k, v))
      if (photo) fd.append('photo', photo)
      return sel ? staffAPI.employees.update(sel.id, fd) : staffAPI.employees.create(fd)
    },
    onSuccess: () => { qc.invalidateQueries(['employees']); setModal(false); toast.success('Saved!') },
  })
  const remove = useMutation({
    mutationFn: id => staffAPI.employees.delete(id),
    onSuccess: () => { qc.invalidateQueries(['employees']); setDel(null); toast.success('Deleted') },
  })

  const openCreate = () => {
    setSel(null)
    setForm({ name: '', phone: '', email: '', department: '', shift: '', employment_type: 'FULL_TIME', monthly_salary: '', joined_date: '', address: '' })
    setPhoto(null)
    setModal(true)
  }
  const openEdit = e => {
    setSel(e)
    setForm({ name: e.name, phone: e.phone, email: e.email, department: e.department || '', shift: e.shift || '', employment_type: e.employment_type, monthly_salary: e.monthly_salary, joined_date: e.joined_date, address: e.address })
    setPhoto(null)
    setModal(true)
  }
  const employees = data || []

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search employees…">
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Employee</button>
      </SearchBar>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <PageLoader />}
        {employees.map(emp => (
          <div key={emp.id} className="card flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden">
                {emp.photo_url ? <img src={emp.photo_url} alt={emp.name} className="w-full h-full object-cover" /> : <Users size={22} className="text-primary-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">{emp.name}</p>
                <p className="text-xs text-gray-400">{emp.phone}</p>
              </div>
              <span className="text-xs font-mono bg-gray-100 text-gray-400 px-2 py-0.5 rounded-lg flex-shrink-0">#{emp.id}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {emp.department_name && <span className="badge-gray text-xs"><Building2 size={10} className="inline mr-0.5" />{emp.department_name}</span>}
              {emp.shift_name && <span className="badge-green text-xs"><Clock size={10} className="inline mr-0.5" />{emp.shift_name}</span>}
              <span className="badge-blue text-xs">{emp.employment_type.replace('_',' ')}</span>
            </div>
            <p className="text-sm font-semibold text-amber-600">₹{parseFloat(emp.monthly_salary || 0).toLocaleString()}/month</p>
            <div className="flex gap-1 border-t border-gray-50 pt-2">
              <button onClick={() => openEdit(emp)} className="btn-ghost py-1 text-xs flex-1"><Edit2 size={12} />Edit</button>
              <button onClick={() => onOpenCalendar(emp)} className="btn-ghost py-1 text-xs flex-1"><Calendar size={12} />Attendance</button>
              <button onClick={() => setDel(emp)} className="btn-ghost py-1 text-xs text-red-400"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        {!isLoading && employees.length === 0 && <div className="col-span-3"><Empty message="No employees" icon={<Users size={48} />} /></div>}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={sel ? 'Edit Employee' : 'Add Employee'} size="lg"
        footer={<><button onClick={() => setModal(false)} className="btn-ghost">Cancel</button><button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">Save</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name" required><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><input className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Joined Date"><input type="date" className="input" value={form.joined_date} onChange={e => setForm({ ...form, joined_date: e.target.value })} /></Field>
          <Field label="Department">
            <select className="select" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
              <option value="">None</option>
              {(depts || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Shift">
            <select className="select" value={form.shift} onChange={e => setForm({ ...form, shift: e.target.value })}>
              <option value="">None</option>
              {(shifts || []).map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
            </select>
          </Field>
          <Field label="Employment Type">
            <select className="select" value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })}>
              <option value="FULL_TIME">Full Time</option>
              <option value="PART_TIME">Part Time</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </Field>
          <Field label="Monthly Salary (₹)">
            <input type="number" step="0.01" className="input" value={form.monthly_salary} onChange={e => setForm({ ...form, monthly_salary: e.target.value })} />
          </Field>
        </div>
        <Field label="Address"><textarea className="input" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
        <Field label="Photo"><input type="file" accept="image/*" className="input" onChange={e => setPhoto(e.target.files[0])} /></Field>
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)} title="Remove Employee" message={`Remove ${del?.name}?`} danger />
    </div>
  )
}

// ── Attendance Tab (daily view) ───────────────────────
function AttendanceTab() {
  const qc = useQueryClient()
  const [date, setDate]   = useState(new Date().toISOString().split('T')[0])
  const [modal, setModal] = useState(false)
  const [editRec, setEditRec] = useState(null)
  const [form, setForm]   = useState({ employee: '', date, status: 'PRESENT', check_in: '', check_out: '', notes: '' })

  const { data, isLoading } = useQuery({ queryKey: ['att-by-date', date], queryFn: () => staffAPI.attendance.byDate(date).then(r => r.data) })
  const { data: emps }      = useQuery({ queryKey: ['employees'], queryFn: () => staffAPI.employees.list().then(r => r.data.results || r.data) })

  const save = useMutation({
    mutationFn: d => editRec ? staffAPI.attendance.update(editRec.id, d) : staffAPI.attendance.create(d),
    onSuccess: () => { qc.invalidateQueries(['att-by-date']); setModal(false); setEditRec(null); toast.success('Saved') },
    onError: e => toast.error(e.response?.data?.non_field_errors?.[0] || 'Already recorded for this date'),
  })

  const openCreate = () => {
    setEditRec(null)
    setForm({ employee: '', date, status: 'PRESENT', check_in: '', check_out: '', notes: '' })
    setModal(true)
  }
  const openEdit = r => {
    setEditRec(r)
    setForm({ employee: r.employee, date: r.date, status: r.status, check_in: r.check_in || '', check_out: r.check_out || '', notes: r.notes || '' })
    setModal(true)
  }

  const records = data || []
  const STATUS  = ['PRESENT','ABSENT','HALF','LEAVE']

  return (
    <div>
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input w-44" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="flex items-end gap-2 text-sm">
          <span className="badge-green">{records.filter(r => r.status === 'PRESENT').length} Present</span>
          <span className="badge-red">{records.filter(r => r.status === 'ABSENT').length} Absent</span>
          <span className="badge-gold">{records.filter(r => r.status === 'HALF' || r.status === 'LEAVE').length} Other</span>
        </div>
        <button onClick={openCreate} className="btn-primary ml-auto"><Plus size={15} />Record</button>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block table-container">
        <table className="table">
          <thead><tr><th>Employee</th><th>Status</th><th>Check In</th><th>Check Out</th><th>Hours</th><th>Late</th><th>OT</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {records.map(r => (
              <tr key={r.id}>
                <td className="font-medium">{r.employee_name}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.check_in || '—'}</td>
                <td>{r.check_out || '—'}</td>
                <td>{r.hours_worked > 0 ? `${r.hours_worked}h` : '—'}</td>
                <td>{r.is_late ? <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium">LATE</span> : '—'}</td>
                <td>{r.ot_minutes > 0 ? <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-medium">+{r.ot_minutes}m</span> : '—'}</td>
                <td className="text-gray-400 text-xs">{r.notes || '—'}</td>
                <td><button onClick={() => openEdit(r)} className="btn-ghost py-1 text-xs"><Edit2 size={12} /></button></td>
              </tr>
            ))}
            {!isLoading && records.length === 0 && <tr><td colSpan={9}><Empty message="No records for this date" /></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {isLoading && <p className="text-center py-8 text-gray-400">Loading…</p>}
        {records.map(r => (
          <div key={r.id} className="card flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-800">{r.employee_name}</p>
              <StatusBadge status={r.status} />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-gray-400 text-xs">Check In</span><span className="text-gray-700">{r.check_in || '—'}</span>
              <span className="text-gray-400 text-xs">Check Out</span><span className="text-gray-700">{r.check_out || '—'}</span>
              <span className="text-gray-400 text-xs">Hours</span><span className="text-gray-700">{r.hours_worked > 0 ? `${r.hours_worked}h` : '—'}</span>
              {r.is_late && <><span className="text-gray-400 text-xs">Late</span><span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium w-fit">LATE</span></>}
              {r.ot_minutes > 0 && <><span className="text-gray-400 text-xs">OT</span><span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-medium w-fit">+{r.ot_minutes}m</span></>}
              {r.notes && <><span className="text-gray-400 text-xs">Notes</span><span className="text-gray-600 text-xs">{r.notes}</span></>}
            </div>
            <button onClick={() => openEdit(r)} className="btn-ghost py-1 text-xs self-end"><Edit2 size={12} />Edit</button>
          </div>
        ))}
        {!isLoading && records.length === 0 && <Empty message="No records for this date" />}
      </div>

      <Modal open={modal} onClose={() => { setModal(false); setEditRec(null) }} title={editRec ? 'Edit Attendance' : 'Record Attendance'}
        footer={<><button onClick={() => { setModal(false); setEditRec(null) }} className="btn-ghost">Cancel</button><button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">Save</button></>}>
        <Field label="Employee" required>
          <select className="select" value={form.employee} onChange={e => setForm({ ...form, employee: e.target.value })} disabled={!!editRec}>
            <option value="">Select employee…</option>
            {(emps || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Status">
          <select className="select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {STATUS.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        {(form.status === 'PRESENT' || form.status === 'HALF') && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Check In"><input type="time" className="input" value={form.check_in} onChange={e => setForm({ ...form, check_in: e.target.value })} /></Field>
            <Field label="Check Out"><input type="time" className="input" value={form.check_out} onChange={e => setForm({ ...form, check_out: e.target.value })} /></Field>
          </div>
        )}
        <Field label="Notes"><input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
      </Modal>
    </div>
  )
}

// ── Payments Tab ──────────────────────────────────────
function PaymentsTab() {
  const qc    = useQueryClient()
  const today = new Date()

  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [confirmEmp, setConfirmEmp] = useState(null)

  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const goNext = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1
  const monthLabel  = format(new Date(year, month - 1, 1), 'MMMM yyyy')
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
  const periodEnd   = `${year}-${String(month).padStart(2, '0')}-${String(getDaysInMonth(new Date(year, month - 1, 1))).padStart(2, '0')}`

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ['staff-monthly-summary', year, month],
    queryFn:  () => staffAPI.attendance.monthlySummary({ year, month }).then(r => r.data),
    retry: 1,
  })

  const pay = useMutation({
    mutationFn: data => staffAPI.payments.create(data),
    onSuccess:  () => {
      qc.invalidateQueries(['staff-monthly-summary', year, month])
      setConfirmEmp(null)
      toast.success('Payment recorded — Finance updated')
    },
    onError: () => toast.error('Failed to record payment'),
  })

  const handlePay = () => {
    if (!confirmEmp) return
    pay.mutate({
      employee:      confirmEmp.employee_id,
      payment_type:  'SALARY',
      amount:        confirmEmp.calculated_salary,
      payment_date:  today.toISOString().split('T')[0],
      period_start:  periodStart,
      period_end:    periodEnd,
      hours_worked:  confirmEmp.hours_worked,
      notes:         `Monthly salary for ${monthLabel} — attendance ${confirmEmp.attendance_pct}%`,
    })
  }

  const pctColor = pct => {
    if (pct >= 90) return 'text-green-600'
    if (pct >= 70) return 'text-yellow-600'
    if (pct >= 50) return 'text-orange-500'
    return 'text-red-500'
  }
  const barColor = pct => {
    if (pct >= 90) return 'bg-green-500'
    if (pct >= 70) return 'bg-yellow-400'
    if (pct >= 50) return 'bg-orange-400'
    return 'bg-red-400'
  }

  return (
    <div>
      {/* Month Navigation */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <button onClick={goPrev} className="btn-ghost p-2 rounded-lg"><ChevronLeft size={18} /></button>
        <div className="flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-xl px-5 py-2">
          <Calendar size={16} className="text-primary-500" />
          <span className="text-base font-semibold text-primary-700 min-w-[140px] text-center">{monthLabel}</span>
        </div>
        <button onClick={goNext} className="btn-ghost p-2 rounded-lg"><ChevronRight size={18} /></button>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Shift</th>
              <th className="text-center">Working Days</th>
              <th className="text-center">Required Hrs</th>
              <th className="text-center">Hrs Worked</th>
              <th className="text-center">Attendance</th>
              <th className="text-right">Full Salary</th>
              <th className="text-right">Due Salary</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">Loading staff data…</td></tr>
            )}
            {!isLoading && isError && (
              <tr>
                <td colSpan={9} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2 text-red-500">
                    <AlertCircle size={28} />
                    <span className="font-medium">Failed to load staff data</span>
                    <span className="text-xs text-gray-400">{error?.response?.data?.detail || error?.message || 'Unknown error'}</span>
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr><td colSpan={9}><Empty message="No staff found" /></td></tr>
            )}
            {rows.map(emp => (
              <tr key={emp.employee_id}>
                <td>
                  <div className="font-semibold text-gray-800">{emp.employee_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{emp.department}</div>
                </td>
                <td>
                  <div className="text-sm text-gray-700">{emp.shift_name}</div>
                  <div className="text-xs text-gray-400">{emp.shift_hours}h / day</div>
                </td>
                <td className="text-center">
                  <div className="font-semibold text-gray-800">{emp.working_days} days</div>
                  <div className="text-xs text-gray-400 space-x-1 mt-0.5">
                    <span className="text-green-600">P:{emp.present_days}</span>
                    <span className="text-yellow-500">H:{emp.half_days}</span>
                    <span className="text-red-400">A:{emp.absent_days}</span>
                  </div>
                </td>
                <td className="text-center">
                  <span className="font-medium text-gray-700">{emp.required_hours}h</span>
                </td>
                <td className="text-center">
                  <span className={`font-semibold ${emp.hours_worked >= emp.required_hours ? 'text-green-600' : 'text-gray-700'}`}>
                    {emp.hours_worked}h
                  </span>
                </td>
                <td className="text-center min-w-[90px]">
                  <span className={`font-bold text-sm ${pctColor(emp.attendance_pct)}`}>{emp.attendance_pct}%</span>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                    <div className={`h-1.5 rounded-full transition-all ${barColor(emp.attendance_pct)}`} style={{ width: `${Math.min(100, emp.attendance_pct)}%` }} />
                  </div>
                </td>
                <td className="text-right text-gray-400 text-sm">₹{emp.full_salary.toLocaleString()}</td>
                <td className="text-right">
                  <span className="font-bold text-primary-600 text-base">₹{emp.calculated_salary.toLocaleString()}</span>
                </td>
                <td className="text-right">
                  {emp.paid_this_month ? (
                    <span className="badge-green inline-flex items-center gap-1 text-xs px-3 py-1.5">
                      <Check size={12} /> Paid
                    </span>
                  ) : isCurrentMonth ? (
                    <span className="text-xs text-gray-400 italic">Month in progress</span>
                  ) : (
                    <button
                      onClick={() => setConfirmEmp(emp)}
                      disabled={emp.calculated_salary <= 0}
                      className="btn-primary py-1.5 px-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <CreditCard size={13} />
                      Pay ₹{emp.calculated_salary.toLocaleString()}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {isLoading && <p className="text-center py-8 text-gray-400">Loading staff data…</p>}
        {isError && (
          <div className="flex flex-col items-center gap-2 text-red-500 py-8">
            <AlertCircle size={28} />
            <span className="font-medium">Failed to load staff data</span>
          </div>
        )}
        {rows.map(emp => (
          <div key={emp.employee_id} className="card flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-gray-800">{emp.employee_name}</p>
                <p className="text-xs text-gray-400">{emp.department} · {emp.shift_name}</p>
              </div>
              {emp.paid_this_month
                ? <span className="badge-green inline-flex items-center gap-1 text-xs px-2 py-1"><Check size={11} /> Paid</span>
                : <span className={`text-sm font-bold ${pctColor(emp.attendance_pct)}`}>{emp.attendance_pct}%</span>
              }
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full ${barColor(emp.attendance_pct)}`} style={{ width: `${Math.min(100, emp.attendance_pct)}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <div><p className="text-xs text-gray-400">Working Days</p><p className="font-semibold">{emp.working_days} <span className="text-xs font-normal text-gray-400">(P:{emp.present_days} H:{emp.half_days} A:{emp.absent_days})</span></p></div>
              <div><p className="text-xs text-gray-400">Hours</p><p className="font-semibold">{emp.hours_worked}h <span className="text-xs font-normal text-gray-400">/ {emp.required_hours}h</span></p></div>
              <div><p className="text-xs text-gray-400">Full Salary</p><p className="text-gray-500">₹{emp.full_salary.toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Due Salary</p><p className="font-bold text-primary-600">₹{emp.calculated_salary.toLocaleString()}</p></div>
            </div>
            {!emp.paid_this_month && !isCurrentMonth && (
              <button
                onClick={() => setConfirmEmp(emp)}
                disabled={emp.calculated_salary <= 0}
                className="btn-primary w-full justify-center disabled:opacity-40"
              >
                <CreditCard size={14} />
                Pay ₹{emp.calculated_salary.toLocaleString()}
              </button>
            )}
            {!emp.paid_this_month && isCurrentMonth && (
              <p className="text-xs text-center text-gray-400 italic py-1">Month in progress — pay after month ends</p>
            )}
          </div>
        ))}
        {!isLoading && !isError && rows.length === 0 && <Empty message="No staff found" />}
      </div>

      {/* Pay Confirmation Modal */}
      <Modal
        open={!!confirmEmp}
        onClose={() => !pay.isPending && setConfirmEmp(null)}
        title="Confirm Salary Payment"
        size="md"
        footer={
          <>
            <button onClick={() => setConfirmEmp(null)} disabled={pay.isPending} className="btn-ghost">Cancel</button>
            <button onClick={handlePay} disabled={pay.isPending} className="btn-primary">
              <CreditCard size={14} />
              {pay.isPending ? 'Processing…' : `Confirm & Pay ₹${confirmEmp?.calculated_salary?.toLocaleString()}`}
            </button>
          </>
        }
      >
        {confirmEmp && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-4">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <span className="text-primary-600 font-bold text-sm">{confirmEmp.employee_name.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <div className="font-bold text-gray-800 text-base">{confirmEmp.employee_name}</div>
                <div className="text-sm text-gray-500">{confirmEmp.department} · {confirmEmp.shift_name}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-0.5">Period</div>
                <div className="font-semibold text-gray-700">{monthLabel}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-0.5">Attendance</div>
                <div className={`font-bold ${pctColor(confirmEmp.attendance_pct)}`}>{confirmEmp.attendance_pct}%</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-0.5">Hours Worked</div>
                <div className="font-semibold text-gray-700">{confirmEmp.hours_worked}h<span className="text-gray-400 font-normal"> / {confirmEmp.required_hours}h</span></div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-400 text-xs mb-0.5">Attendance Breakdown</div>
                <div className="text-xs space-x-1.5">
                  <span className="text-green-600 font-medium">P:{confirmEmp.present_days}</span>
                  <span className="text-yellow-500 font-medium">H:{confirmEmp.half_days}</span>
                  <span className="text-red-400 font-medium">A:{confirmEmp.absent_days}</span>
                </div>
              </div>
            </div>
            <div className="bg-primary-600 text-white rounded-xl p-4 flex justify-between items-center">
              <div>
                <div className="text-xs opacity-70 mb-0.5">Amount to Pay</div>
                <div className="text-3xl font-bold">₹{confirmEmp.calculated_salary.toLocaleString()}</div>
              </div>
              <div className="text-right text-xs opacity-70 leading-relaxed">
                {confirmEmp.attendance_pct}% of<br />
                <span className="text-base font-semibold opacity-90">₹{confirmEmp.full_salary.toLocaleString()}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">
              This payment will automatically appear as an expense in the Finance dashboard.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Credentials Tab ───────────────────────────────────
function CredentialsTab() {
  const qc = useQueryClient()
  const [modal, setModal]     = useState(false)
  const [sel, setSel]         = useState(null)
  const [del, setDel]         = useState(null)
  const [showPwd, setShowPwd] = useState(false)
  const [confirmPwd, setConfirmPwd] = useState('')
  const emptyForm = { username: '', password: '', role: 'BILLER', linked_employee: '', is_active: true }
  const [form, setForm] = useState(emptyForm)

  const { data: allUsers, isLoading } = useQuery({ queryKey: ['staff-users'], queryFn: () => authAPI.users.list().then(r => r.data.results || r.data) })
  const { data: emps }                = useQuery({ queryKey: ['employees'], queryFn: () => staffAPI.employees.list().then(r => r.data.results || r.data) })
  const staffUsers = (allUsers || []).filter(u => u.role === 'BILLER' || u.role === 'KITCHEN')

  const save = useMutation({
    mutationFn: d => sel ? authAPI.users.update(sel.id, d) : authAPI.users.create(d),
    onSuccess:  () => { qc.invalidateQueries(['staff-users']); setModal(false); toast.success(sel ? 'Updated' : 'Created') },
    onError: e => toast.error(e.response?.data?.username?.[0] || 'Failed'),
  })
  const remove = useMutation({
    mutationFn: id => authAPI.users.delete(id),
    onSuccess: () => { qc.invalidateQueries(['staff-users']); setDel(null); toast.success('Deleted') },
  })

  const openCreate = () => { setSel(null); setForm(emptyForm); setConfirmPwd(''); setShowPwd(false); setModal(true) }
  const openEdit   = u => { setSel(u); setForm({ username: u.username, password: '', role: u.role, linked_employee: u.linked_employee || '', is_active: u.is_active }); setConfirmPwd(''); setShowPwd(false); setModal(true) }

  const handleSubmit = () => {
    if (!sel && form.password !== confirmPwd) { toast.error('Passwords do not match'); return }
    if (!sel && form.password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    const payload = { username: form.username, role: form.role, linked_employee: form.linked_employee || null, is_active: form.is_active }
    if (form.password) payload.password = form.password
    save.mutate(payload)
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Staff User</button>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block table-container">
        <table className="table">
          <thead><tr><th>Username</th><th>Role</th><th>Linked Employee</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {staffUsers.map(u => (
              <tr key={u.id}>
                <td className="font-medium font-mono">{u.username}</td>
                <td><span className={u.role === 'KITCHEN' ? 'badge-gold text-xs' : 'badge-blue text-xs'}>{u.role}</span></td>
                <td>{u.linked_employee_name || <span className="text-gray-300">—</span>}</td>
                <td><span className={u.is_active ? 'badge-green' : 'badge-red'}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(u)} className="btn-ghost py-1 text-xs"><Edit2 size={13} />Edit</button>
                    <button onClick={() => setDel(u)} className="btn-ghost py-1 text-xs text-red-400"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && staffUsers.length === 0 && <tr><td colSpan={5}><Empty message="No staff users yet" /></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {isLoading && <p className="text-center py-8 text-gray-400">Loading…</p>}
        {staffUsers.map(u => (
          <div key={u.id} className="card flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono font-semibold text-gray-800">{u.username}</p>
                {u.linked_employee_name && <p className="text-xs text-gray-400 mt-0.5">{u.linked_employee_name}</p>}
              </div>
              <div className="flex gap-1.5 items-center flex-shrink-0">
                <span className={u.role === 'KITCHEN' ? 'badge-gold text-xs' : 'badge-blue text-xs'}>{u.role}</span>
                <span className={u.is_active ? 'badge-green text-xs' : 'badge-red text-xs'}>{u.is_active ? 'Active' : 'Disabled'}</span>
              </div>
            </div>
            <div className="flex gap-1 border-t border-gray-50 pt-2">
              <button onClick={() => openEdit(u)} className="btn-ghost py-1 text-xs flex-1"><Edit2 size={12} />Edit</button>
              <button onClick={() => setDel(u)} className="btn-ghost py-1 text-xs text-red-400 flex-1 justify-center"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        {!isLoading && staffUsers.length === 0 && <Empty message="No staff users yet" />}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={sel ? 'Edit Staff User' : 'Create Staff User'} size="md"
        footer={<><button onClick={() => setModal(false)} className="btn-ghost">Cancel</button><button onClick={handleSubmit} disabled={save.isPending} className="btn-primary">{sel ? 'Update' : 'Create'}</button></>}>
        <div className="space-y-3">
          <Field label="Username" required><input className="input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label={sel ? 'New Password (leave blank to keep)' : 'Password'} required={!sel}>
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} className="input pr-10" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={sel ? 'Leave blank to keep current' : 'Min 6 characters'} />
              <button type="button" onClick={() => setShowPwd(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{showPwd ? 'Hide' : 'Show'}</button>
            </div>
          </Field>
          {!sel && <Field label="Confirm Password" required><input type={showPwd ? 'text' : 'password'} className="input" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} /></Field>}
          <Field label="Role">
            <select className="select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="BILLER">Biller</option>
              <option value="KITCHEN">Kitchen</option>
            </select>
          </Field>
          <Field label="Link to Employee (optional)">
            <select className="select" value={form.linked_employee} onChange={e => setForm({ ...form, linked_employee: e.target.value })}>
              <option value="">— None —</option>
              {(emps || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <div className="flex items-center gap-2 pt-1">
            <input type="checkbox" id="user-active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-primary-500" />
            <label htmlFor="user-active" className="text-sm text-gray-600">Account active</label>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)} title="Delete User" message={`Delete user "${del?.username}"?`} danger />
    </div>
  )
}

// ── Main StaffPage ────────────────────────────────────
export default function StaffPage() {
  const [tab, setTab]       = useState('employees')
  const [calEmp, setCalEmp] = useState(null)

  const tabs = [
    { id: 'employees',   label: 'Employees',   icon: <Users size={15} /> },
    { id: 'shifts',      label: 'Shifts',      icon: <Clock size={15} /> },
    { id: 'attendance',  label: 'Attendance',  icon: <Calendar size={15} /> },
    { id: 'payments',    label: 'Payments',    icon: <CreditCard size={15} /> },
    { id: 'credentials', label: 'Credentials', icon: <KeyRound size={15} /> },
  ]

  if (calEmp) {
    return (
      <div className="flex flex-col h-full p-1">
        <AttendanceCalendar employee={calEmp} onBack={() => setCalEmp(null)} />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Management</h1>
          <p className="page-subtitle">Employees, shifts, attendance, and payroll</p>
        </div>
      </div>
      <div className="overflow-x-auto -mx-1 px-1 mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit min-w-max">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                ${tab === t.id ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'employees'   && <EmployeeTab onOpenCalendar={setCalEmp} />}
      {tab === 'shifts'      && <ShiftTab />}
      {tab === 'attendance'  && <AttendanceTab />}
      {tab === 'payments'    && <PaymentsTab />}
      {tab === 'credentials' && <CredentialsTab />}
    </div>
  )
}
