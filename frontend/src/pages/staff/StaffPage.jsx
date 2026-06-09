import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffAPI, authAPI } from '@/api'
import { PageLoader, Modal, SearchBar, StatusBadge, ConfirmDialog, Field, Empty } from '@/components/ui'
import toast from 'react-hot-toast'
import {
  Plus, Edit2, Trash2, Calendar, CreditCard, Users,
  Clock, Building2, KeyRound, Shield,
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

// ── Attendance Calendar ───────────────────────────────
function AttendanceCalendarModal({ employee, onClose }) {
  const today    = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  const { data, isLoading } = useQuery({
    queryKey: ['att-cal', employee?.id, year, month],
    queryFn:  () => staffAPI.employees.attendanceCalendar(employee.id, { year, month }).then(r => r.data),
    enabled: !!employee,
  })

  const attMap = {}
  ;(data || []).forEach(a => { attMap[a.date] = a })

  const days  = getDaysInMonth(new Date(year, month - 1))
  const start = startOfMonth(new Date(year, month - 1)).getDay()
  const colorMap = {
    PRESENT: 'bg-primary-400 text-white',
    ABSENT:  'bg-red-400 text-white',
    HALF:    'bg-gold-300 text-white',
    LEAVE:   'bg-gray-300 text-white',
  }

  return (
    <Modal open={!!employee} onClose={onClose} title={`Attendance Calendar — ${employee?.name}`} size="lg">
      <div className="flex items-center gap-3 mb-4">
        <select className="select w-32" value={month} onChange={e => setMonth(+e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{format(new Date(year, i), 'MMMM')}</option>
          ))}
        </select>
        <select className="select w-24" value={year} onChange={e => setYear(+e.target.value)}>
          {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: start }).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const day  = i + 1
          const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const att  = attMap[date]
          return (
            <div key={day} className={`rounded-lg p-1.5 text-center text-xs font-medium transition-colors
              ${att ? colorMap[att.status] : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>
              <div>{day}</div>
              {att && <div className="text-[9px] mt-0.5 opacity-90">{att.status.slice(0,3)}</div>}
            </div>
          )
        })}
      </div>
      <div className="flex gap-3 mt-4 text-xs">
        {Object.entries(colorMap).map(([k, cls]) => (
          <div key={k} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-sm ${cls}`} />
            <span className="text-gray-500">{k}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── Shift Tab ─────────────────────────────────────────
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

  const handleSubmit = () => {
    save.mutate({ ...form, days: form.days.join(',') })
  }

  const shifts = data || []

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Shift</button>
      </div>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Shift Name</th>
              <th>Time</th>
              <th>Hours</th>
              <th>Days</th>
              <th>Late After</th>
              <th>OT After</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {shifts.map(s => (
              <tr key={s.id}>
                <td className="font-semibold">{s.name}</td>
                <td className="font-mono text-sm">
                  {s.start_time} – {s.end_time}
                </td>
                <td>{s.hours}h</td>
                <td>
                  <div className="flex flex-wrap gap-0.5">
                    {(s.days_list || []).map(d => (
                      <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary-50 text-primary-600">{d}</span>
                    ))}
                  </div>
                </td>
                <td className="text-sm text-gray-500">{s.late_threshold} min</td>
                <td className="text-sm text-gray-500">{s.ot_threshold} min</td>
                <td>
                  <span className={s.is_active ? 'badge-green' : 'badge-gray'}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(s)} className="btn-ghost py-1"><Edit2 size={13} /></button>
                    <button onClick={() => setDel(s)} className="btn-ghost py-1 text-red-400"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && shifts.length === 0 && (
              <tr><td colSpan={8}><Empty message="No shifts created yet" /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={sel ? 'Edit Shift' : 'Add Shift'} size="lg"
        footer={
          <>
            <button onClick={() => setModal(false)} className="btn-ghost">Cancel</button>
            <button onClick={handleSubmit} disabled={save.isPending} className="btn-primary">Save</button>
          </>
        }>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Shift Name" required>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </Field>
          </div>
          <Field label="Start Time" required>
            <input type="time" className="input" value={form.start_time}
              onChange={e => setForm({ ...form, start_time: e.target.value })} />
          </Field>
          <Field label="End Time" required>
            <input type="time" className="input" value={form.end_time}
              onChange={e => setForm({ ...form, end_time: e.target.value })} />
          </Field>
          <Field label="Late Threshold (minutes)">
            <input type="number" min="0" className="input" value={form.late_threshold}
              onChange={e => setForm({ ...form, late_threshold: e.target.value })} />
          </Field>
          <Field label="OT Threshold (minutes)">
            <input type="number" min="0" className="input" value={form.ot_threshold}
              onChange={e => setForm({ ...form, ot_threshold: e.target.value })} />
          </Field>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <label className="label">Working Days</label>
            <div className="flex gap-2 text-xs">
              <button type="button" className="text-primary-500 hover:underline"
                onClick={() => setForm(f => ({ ...f, days: ALL_DAYS.map(d => d.code) }))}>
                All Days
              </button>
              <button type="button" className="text-primary-500 hover:underline"
                onClick={() => setForm(f => ({ ...f, days: ['MON','TUE','WED','THU','FRI'] }))}>
                Weekdays
              </button>
              <button type="button" className="text-gray-400 hover:underline"
                onClick={() => setForm(f => ({ ...f, days: [] }))}>
                Clear
              </button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {ALL_DAYS.map(d => (
              <button key={d.code} type="button"
                onClick={() => toggleDay(d.code)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                  ${form.days.includes(d.code)
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-primary-300'}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <Field label="Notes">
            <textarea className="input" rows={2} value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input type="checkbox" id="shift-active" checked={form.is_active}
            onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 accent-primary-500" />
          <label htmlFor="shift-active" className="text-sm text-gray-600">Active</label>
        </div>
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)}
        title="Delete Shift" message={`Delete "${del?.name}"? Employees assigned will lose their shift.`} danger />
    </div>
  )
}

// ── Employee Tab ──────────────────────────────────────
function EmployeeTab() {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState(false)
  const [sel, setSel]         = useState(null)
  const [del, setDel]         = useState(null)
  const [calEmp, setCalEmp]   = useState(null)
  const [form, setForm]       = useState({ name: '', phone: '', email: '', department: '', shift: '', employment_type: 'FULL_TIME', hourly_rate: '', joined_date: '', address: '' })
  const [photo, setPhoto]     = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['employees', search], queryFn: () => staffAPI.employees.list({ search }).then(r => r.data.results || r.data) })
  const { data: depts }     = useQuery({ queryKey: ['departments'], queryFn: () => staffAPI.departments.list().then(r => r.data.results || r.data) })
  const { data: shifts }    = useQuery({ queryKey: ['shifts'], queryFn: () => staffAPI.shifts.list().then(r => r.data.results || r.data) })

  const save   = useMutation({ mutationFn: async d => { const fd = new FormData(); Object.entries(d).forEach(([k,v]) => v !== '' && fd.append(k,v)); if (photo) fd.append('photo', photo); return sel ? staffAPI.employees.update(sel.id, fd) : staffAPI.employees.create(fd) }, onSuccess: () => { qc.invalidateQueries(['employees']); setModal(false); toast.success('Saved!') } })
  const remove = useMutation({ mutationFn: id => staffAPI.employees.delete(id), onSuccess: () => { qc.invalidateQueries(['employees']); setDel(null); toast.success('Deleted') } })

  const openCreate = () => { setSel(null); setForm({ name: '', phone: '', email: '', department: '', shift: '', employment_type: 'FULL_TIME', hourly_rate: '', joined_date: '', address: '' }); setPhoto(null); setModal(true) }
  const openEdit   = e => { setSel(e); setForm({ name: e.name, phone: e.phone, email: e.email, department: e.department || '', shift: e.shift || '', employment_type: e.employment_type, hourly_rate: e.hourly_rate, joined_date: e.joined_date, address: e.address }); setPhoto(null); setModal(true) }
  const employees  = data || []

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
              <div>
                <p className="font-semibold text-gray-800">{emp.name}</p>
                <p className="text-xs text-gray-400">{emp.phone}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {emp.department_name && <span className="badge-gray text-xs"><Building2 size={10} className="inline mr-0.5" />{emp.department_name}</span>}
              {emp.shift_name && <span className="badge-green text-xs"><Clock size={10} className="inline mr-0.5" />{emp.shift_name}</span>}
              <span className="badge-blue text-xs">{emp.employment_type.replace('_',' ')}</span>
            </div>
            <p className="text-sm font-semibold text-gold-400">₹{parseFloat(emp.hourly_rate).toFixed(2)}/hr</p>
            <div className="flex gap-1 border-t border-gray-50 pt-2">
              <button onClick={() => openEdit(emp)} className="btn-ghost py-1 text-xs flex-1"><Edit2 size={12} />Edit</button>
              <button onClick={() => setCalEmp(emp)} className="btn-ghost py-1 text-xs flex-1"><Calendar size={12} />Attendance</button>
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
          <Field label="Hourly Rate (₹)"><input type="number" step="0.01" className="input" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} /></Field>
        </div>
        <Field label="Address"><textarea className="input" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
        <Field label="Photo"><input type="file" accept="image/*" className="input" onChange={e => setPhoto(e.target.files[0])} /></Field>
      </Modal>

      <AttendanceCalendarModal employee={calEmp} onClose={() => setCalEmp(null)} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)} title="Remove Employee" message={`Remove ${del?.name}?`} danger />
    </div>
  )
}

// ── Attendance Tab ────────────────────────────────────
function AttendanceTab() {
  const qc = useQueryClient()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState({ employee: '', date, status: 'PRESENT', check_in: '', check_out: '', notes: '' })

  const { data, isLoading } = useQuery({ queryKey: ['att-by-date', date], queryFn: () => staffAPI.attendance.byDate(date).then(r => r.data) })
  const { data: emps }      = useQuery({ queryKey: ['employees'], queryFn: () => staffAPI.employees.list().then(r => r.data.results || r.data) })

  const save = useMutation({
    mutationFn: d => staffAPI.attendance.create(d),
    onSuccess: () => { qc.invalidateQueries(['att-by-date']); setModal(false); toast.success('Attendance recorded') },
    onError: e => toast.error(e.response?.data?.non_field_errors?.[0] || 'Already recorded for this date'),
  })

  const STATUS  = ['PRESENT','ABSENT','HALF','LEAVE']
  const records = data || []

  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <div>
          <label className="label">Date</label>
          <input type="date" className="input w-44" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <div className="text-sm">
            <span className="badge-green mr-2">{records.filter(r => r.status === 'PRESENT').length} Present</span>
            <span className="badge-red mr-2">{records.filter(r => r.status === 'ABSENT').length} Absent</span>
            <span className="badge-gold">{records.filter(r => r.status === 'HALF' || r.status === 'LEAVE').length} Other</span>
          </div>
        </div>
        <button onClick={() => { setForm({ employee: '', date, status: 'PRESENT', check_in: '', check_out: '', notes: '' }); setModal(true) }} className="btn-primary ml-auto"><Plus size={15} />Record</button>
      </div>
      <div className="table-container">
        <table className="table">
          <thead><tr><th>Employee</th><th>Status</th><th>Check In</th><th>Check Out</th><th>Hours</th><th>Notes</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {records.map(r => (
              <tr key={r.id}>
                <td className="font-medium">{r.employee_name}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.check_in || '—'}</td>
                <td>{r.check_out || '—'}</td>
                <td>{r.hours_worked > 0 ? `${r.hours_worked}h` : '—'}</td>
                <td className="text-gray-400 text-xs">{r.notes || '—'}</td>
              </tr>
            ))}
            {!isLoading && records.length === 0 && <tr><td colSpan={6}><Empty message="No attendance records for this date" /></td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Record Attendance"
        footer={<><button onClick={() => setModal(false)} className="btn-ghost">Cancel</button><button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">Save</button></>}>
        <Field label="Employee" required>
          <select className="select" value={form.employee} onChange={e => setForm({ ...form, employee: e.target.value })}>
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check In"><input type="time" className="input" value={form.check_in} onChange={e => setForm({ ...form, check_in: e.target.value })} /></Field>
          <Field label="Check Out"><input type="time" className="input" value={form.check_out} onChange={e => setForm({ ...form, check_out: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
      </Modal>
    </div>
  )
}

// ── Payments Tab ──────────────────────────────────────
function PaymentsTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [form, setForm]   = useState({ employee: '', payment_type: 'SALARY', amount: '', payment_date: new Date().toISOString().split('T')[0], period_start: '', period_end: '', notes: '' })

  const { data, isLoading } = useQuery({ queryKey: ['staff-payments'], queryFn: () => staffAPI.payments.list().then(r => r.data.results || r.data) })
  const { data: emps }      = useQuery({ queryKey: ['employees'], queryFn: () => staffAPI.employees.list().then(r => r.data.results || r.data) })

  const save = useMutation({
    mutationFn: d => staffAPI.payments.create(d),
    onSuccess: () => { qc.invalidateQueries(['staff-payments']); setModal(false); toast.success('Payment recorded') },
  })

  const payments = data || []

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setModal(true)} className="btn-primary"><Plus size={15} />Record Payment</button>
      </div>
      <div className="table-container">
        <table className="table">
          <thead><tr><th>Employee</th><th>Type</th><th>Amount</th><th>Period</th><th>Date</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {payments.map(p => (
              <tr key={p.id}>
                <td className="font-medium">{p.employee_name}</td>
                <td><span className="badge-gold text-xs">{p.payment_type}</span></td>
                <td className="font-semibold text-primary-600">₹{parseFloat(p.amount).toLocaleString()}</td>
                <td className="text-gray-400 text-xs">{p.period_start && p.period_end ? `${p.period_start} → ${p.period_end}` : '—'}</td>
                <td>{p.payment_date}</td>
              </tr>
            ))}
            {!isLoading && payments.length === 0 && <tr><td colSpan={5}><Empty message="No payment records" /></td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Record Staff Payment"
        footer={<><button onClick={() => setModal(false)} className="btn-ghost">Cancel</button><button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">Save</button></>}>
        <Field label="Employee" required>
          <select className="select" value={form.employee} onChange={e => setForm({ ...form, employee: e.target.value })}>
            <option value="">Select…</option>
            {(emps || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Payment Type">
          <select className="select" value={form.payment_type} onChange={e => setForm({ ...form, payment_type: e.target.value })}>
            {['SALARY','ADVANCE','BONUS','OTHER'].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Amount (₹)" required><input type="number" step="0.01" className="input" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Payment Date"><input type="date" className="input" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Period Start"><input type="date" className="input" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} /></Field>
          <Field label="Period End"><input type="date" className="input" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><input className="input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
      </Modal>
    </div>
  )
}

// ── Credentials Tab ───────────────────────────────────
function CredentialsTab() {
  const qc = useQueryClient()
  const [modal, setModal]   = useState(false)
  const [sel, setSel]       = useState(null)
  const [del, setDel]       = useState(null)
  const [showPwd, setShowPwd] = useState(false)
  const [confirmPwd, setConfirmPwd] = useState('')

  const emptyForm = {
    username: '', password: '', role: 'BILLER',
    linked_employee: '', is_active: true,
  }
  const [form, setForm] = useState(emptyForm)

  const { data: allUsers, isLoading } = useQuery({
    queryKey: ['staff-users'],
    queryFn:  () => authAPI.users.list().then(r => r.data.results || r.data),
  })
  const { data: emps } = useQuery({
    queryKey: ['employees'],
    queryFn:  () => staffAPI.employees.list().then(r => r.data.results || r.data),
  })

  const staffUsers = (allUsers || []).filter(u => u.role === 'BILLER' || u.role === 'KITCHEN')

  const save = useMutation({
    mutationFn: d => sel ? authAPI.users.update(sel.id, d) : authAPI.users.create(d),
    onSuccess:  () => {
      qc.invalidateQueries(['staff-users'])
      setModal(false)
      toast.success(sel ? 'Credentials updated' : 'User created')
    },
    onError: e => toast.error(e.response?.data?.username?.[0] || 'Failed to save'),
  })
  const remove = useMutation({
    mutationFn: id => authAPI.users.delete(id),
    onSuccess:  () => { qc.invalidateQueries(['staff-users']); setDel(null); toast.success('User deleted') },
  })

  const openCreate = () => {
    setSel(null)
    setForm(emptyForm)
    setConfirmPwd('')
    setShowPwd(false)
    setModal(true)
  }
  const openEdit = u => {
    setSel(u)
    setForm({
      username: u.username, password: '',
      role: u.role, linked_employee: u.linked_employee || '',
      is_active: u.is_active,
    })
    setConfirmPwd('')
    setShowPwd(false)
    setModal(true)
  }

  const handleSubmit = () => {
    if (!sel && form.password !== confirmPwd) {
      toast.error('Passwords do not match')
      return
    }
    if (!sel && form.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    const payload = {
      username:        form.username,
      role:            form.role,
      linked_employee: form.linked_employee || null,
      is_active:       form.is_active,
    }
    if (form.password) payload.password = form.password
    save.mutate(payload)
  }

  const roleColor = role => role === 'KITCHEN' ? 'badge-gold' : 'badge-blue'

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Staff User</button>
      </div>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Linked Employee</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {staffUsers.map(u => (
              <tr key={u.id}>
                <td className="font-medium font-mono">{u.username}</td>
                <td><span className={`${roleColor(u.role)} text-xs`}>{u.role}</span></td>
                <td>{u.linked_employee_name || <span className="text-gray-300">—</span>}</td>
                <td>
                  <span className={u.is_active ? 'badge-green' : 'badge-red'}>
                    {u.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(u)} className="btn-ghost py-1 text-xs"><Edit2 size={13} />Edit</button>
                    <button onClick={() => setDel(u)} className="btn-ghost py-1 text-xs text-red-400"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && staffUsers.length === 0 && (
              <tr><td colSpan={5}><Empty message="No staff users yet" /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={sel ? 'Edit Staff User' : 'Create Staff User'} size="md"
        footer={
          <>
            <button onClick={() => setModal(false)} className="btn-ghost">Cancel</button>
            <button onClick={handleSubmit} disabled={save.isPending} className="btn-primary">
              {sel ? 'Update' : 'Create'}
            </button>
          </>
        }>
        <div className="space-y-3">
          <Field label="Username" required>
            <input className="input" value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })} />
          </Field>

          <Field label={sel ? 'New Password (leave blank to keep)' : 'Password'} required={!sel}>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                className="input pr-10"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder={sel ? 'Leave blank to keep current' : 'Min 6 characters'}
              />
              <button type="button" onClick={() => setShowPwd(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                {showPwd ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>

          {!sel && (
            <Field label="Confirm Password" required>
              <input
                type={showPwd ? 'text' : 'password'}
                className="input"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder="Re-enter password"
              />
            </Field>
          )}

          <Field label="Role">
            <select className="select" value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="BILLER">Biller</option>
              <option value="KITCHEN">Kitchen</option>
            </select>
          </Field>

          <Field label="Link to Employee (optional)">
            <select className="select" value={form.linked_employee}
              onChange={e => setForm({ ...form, linked_employee: e.target.value })}>
              <option value="">— None —</option>
              {(emps || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>

          <div className="flex items-center gap-2 pt-1">
            <input type="checkbox" id="user-active" checked={form.is_active}
              onChange={e => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 accent-primary-500" />
            <label htmlFor="user-active" className="text-sm text-gray-600">Account active</label>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)}
        title="Delete User" message={`Delete user "${del?.username}"? This cannot be undone.`} danger />
    </div>
  )
}

// ── Main StaffPage ────────────────────────────────────
export default function StaffPage() {
  const [tab, setTab] = useState('employees')
  const tabs = [
    { id: 'employees',   label: 'Employees',   icon: <Users size={15} /> },
    { id: 'shifts',      label: 'Shifts',       icon: <Clock size={15} /> },
    { id: 'attendance',  label: 'Attendance',   icon: <Calendar size={15} /> },
    { id: 'payments',    label: 'Payments',     icon: <CreditCard size={15} /> },
    { id: 'credentials', label: 'Credentials',  icon: <KeyRound size={15} /> },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Management</h1>
          <p className="page-subtitle">Employees, shifts, attendance, and payroll</p>
        </div>
      </div>
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === t.id ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {tab === 'employees'   && <EmployeeTab />}
      {tab === 'shifts'      && <ShiftTab />}
      {tab === 'attendance'  && <AttendanceTab />}
      {tab === 'payments'    && <PaymentsTab />}
      {tab === 'credentials' && <CredentialsTab />}
    </div>
  )
}
