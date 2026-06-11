import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { financeAPI } from '@/api'
import { PageLoader, Modal, SearchBar, StatusBadge, Field, Empty, KpiCard } from '@/components/ui'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Plus, Trash2, Download, FileSpreadsheet, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

export default function FinancePage() {
  const qc = useQueryClient()
  const [tab, setTab]           = useState('overview')
  const [expModal, setExpModal] = useState(false)
  const [expForm, setExpForm]   = useState({ category: 'MISC', title: '', amount: '', expense_date: new Date().toISOString().split('T')[0], notes: '' })

  // Report download state
  const now = new Date()
  const [rptYear,  setRptYear]  = useState(now.getFullYear())
  const [rptMonth, setRptMonth] = useState(now.getMonth() + 1)
  const [downloading, setDownloading] = useState(false)

  // Delete with password confirmation
  const [deleteModal,    setDeleteModal]    = useState(false)
  const [deleteTarget,   setDeleteTarget]   = useState(null)   // { txId, label }
  const [deletePassword, setDeletePassword] = useState('')

  const { data: summary } = useQuery({ queryKey: ['finance-summary'], queryFn: () => financeAPI.summary().then(r => r.data) })
  const { data: expenses, isLoading: expLoading } = useQuery({ queryKey: ['expenses'], queryFn: () => financeAPI.expenses.list().then(r => r.data.results || r.data) })
  const { data: txns, isLoading: txLoading } = useQuery({ queryKey: ['transactions'], queryFn: () => financeAPI.transactions.list().then(r => r.data.results || r.data) })

  const { data: monthlyData, isLoading: mdLoading } = useQuery({
    queryKey: ['monthly-data', rptYear, rptMonth],
    queryFn:  () => financeAPI.monthlyData(rptYear, rptMonth).then(r => r.data),
    enabled:  tab === 'reports',
  })

  const saveExp = useMutation({
    mutationFn: d => financeAPI.expenses.create(d),
    onSuccess: () => { qc.invalidateQueries(['expenses']); qc.invalidateQueries(['finance-summary']); setExpModal(false); toast.success('Expense recorded') },
  })
  const delExp = useMutation({
    mutationFn: id => financeAPI.expenses.delete(id),
    onSuccess: () => { qc.invalidateQueries(['expenses']); qc.invalidateQueries(['finance-summary']); toast.success('Deleted') },
  })

  const secureDelete = useMutation({
    mutationFn: ({ txId, password }) => financeAPI.transactions.secureDelete(txId, password),
    onSuccess: () => {
      qc.invalidateQueries(['monthly-data', rptYear, rptMonth])
      qc.invalidateQueries(['finance-summary'])
      qc.invalidateQueries(['transactions'])
      setDeleteModal(false)
      setDeletePassword('')
      setDeleteTarget(null)
      toast.success('Record deleted')
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Delete failed')
    },
  })

  const openDelete = (txId, label) => {
    setDeleteTarget({ txId, label })
    setDeletePassword('')
    setDeleteModal(true)
  }

  const downloadReport = async () => {
    setDownloading(true)
    try {
      const { data } = await financeAPI.monthlyReport(rptYear, rptMonth)
      const url  = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a    = document.createElement('a')
      a.href     = url
      const monthName = new Date(rptYear, rptMonth - 1).toLocaleString('default', { month: 'long' })
      a.download = `Finance_${monthName}_${rptYear}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Report downloaded')
    } catch {
      toast.error('Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const s = summary?.summary
  const dailyMap = {}
  ;(summary?.daily_chart || []).forEach(({ date, tx_type, total }) => {
    const d = typeof date === 'string' ? date.slice(0, 10) : format(date, 'yyyy-MM-dd')
    if (!dailyMap[d]) dailyMap[d] = { date: d, income: 0, expense: 0 }
    if (tx_type === 'INCOME')  dailyMap[d].income  = parseFloat(total)
    if (tx_type === 'EXPENSE') dailyMap[d].expense = parseFloat(total)
  })
  const dailyChart = Object.values(dailyMap).slice(-14).map(d => ({ ...d, date: format(parseISO(d.date), 'dd MMM') }))

  const CATEGORIES = ['SALE','VENDOR_PAYMENT','STAFF_SALARY','UTILITIES','RENT','MAINTENANCE','MISC']
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

  const tabs = [
    { id: 'overview',      label: 'Overview' },
    { id: 'expenses',      label: 'Expenses' },
    { id: 'transactions',  label: 'All Transactions' },
    { id: 'reports',       label: 'Reports' },
  ]

  // Monthly data totals
  const incomeRows  = monthlyData?.income   || []
  const expenseRows = monthlyData?.expenses || []
  const incTotal  = incomeRows.reduce((s, r) => s + r.bill_amount, 0)
  const incBase   = incomeRows.reduce((s, r) => s + r.base_amount, 0)
  const incGst    = incomeRows.reduce((s, r) => s + r.gst_amount,  0)
  const expTotal  = expenseRows.reduce((s, r) => s + r.amount, 0)

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Finance</h1><p className="page-subtitle">Track income, expenses, and profitability</p></div>
        <button onClick={() => setExpModal(true)} className="btn-secondary"><Plus size={15} />Add Expense</button>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && s && (
        <div className="space-y-5">
          {/* Row 1 — all-time */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Total Income"  value={`₹${parseFloat(s.total_income).toLocaleString()}`}  icon={<TrendingUp size={22} />}   color="primary" />
            <KpiCard title="Total Expense" value={`₹${parseFloat(s.total_expense).toLocaleString()}`} icon={<TrendingDown size={22} />} color="gold" />
            <KpiCard title="Net Profit"    value={`₹${parseFloat(s.net_profit).toLocaleString()}`}    icon={<DollarSign size={22} />}   color={s.net_profit >= 0 ? 'primary' : 'red'} />
            <KpiCard title="Today Income"  value={`₹${parseFloat(s.today_income).toLocaleString()}`}  icon={<TrendingUp size={22} />}   color="primary"
              subtitle={
                s.today_tax_income > 0
                  ? `Base ₹${(s.today_income - s.today_tax_income).toLocaleString()} + Tax ₹${parseFloat(s.today_tax_income).toLocaleString()}`
                  : `Expense: ₹${parseFloat(s.today_expense).toLocaleString()}`
              }
            />
          </div>

          {/* Row 2 — this month */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card flex flex-col gap-1 p-4">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Month Income</p>
              <p className="text-2xl font-bold text-primary-600">₹{parseFloat(s.month_income).toLocaleString()}</p>
              {s.month_tax_income > 0 ? (
                <div className="mt-1 space-y-0.5">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Base Income</span>
                    <span className="font-semibold text-gray-700">₹{parseFloat(s.month_base_income).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>GST Collected</span>
                    <span className="font-semibold text-emerald-600">₹{parseFloat(s.month_tax_income).toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">No tax collected this month</p>
              )}
            </div>
            <KpiCard title="Month Expense" value={`₹${parseFloat(s.month_expense).toLocaleString()}`} icon={<TrendingDown size={22} />} color="gold" />
            <KpiCard title="Month Profit"  value={`₹${parseFloat(s.month_profit).toLocaleString()}`}  icon={<DollarSign size={22} />}   color={s.month_profit >= 0 ? 'primary' : 'red'} />
          </div>

          {/* Chart */}
          <div className="card">
            <p className="section-title">Income vs Expense — Last 14 Days</p>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dailyChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gi2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#1D9E75" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ge2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#BA7517" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#BA7517" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => `₹${v.toLocaleString()}`} />
                <Legend />
                <Area type="monotone" dataKey="income"  stroke="#1D9E75" fill="url(#gi2)" name="Income"  strokeWidth={2} />
                <Area type="monotone" dataKey="expense" stroke="#BA7517" fill="url(#ge2)" name="Expense" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Expenses ── */}
      {tab === 'expenses' && (
        <div>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Title</th><th>Category</th><th>Amount</th><th>Date</th><th>Actions</th></tr></thead>
              <tbody>
                {expLoading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>}
                {(expenses || []).map(e => (
                  <tr key={e.id}>
                    <td className="font-medium">{e.title}</td>
                    <td><span className="badge-gold text-xs">{e.category}</span></td>
                    <td className="font-semibold text-gray-700">₹{parseFloat(e.amount).toLocaleString()}</td>
                    <td>{e.expense_date}</td>
                    <td><button onClick={() => delExp.mutate(e.id)} className="btn-ghost py-1 text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                ))}
                {!expLoading && (expenses || []).length === 0 && <tr><td colSpan={5}><Empty message="No expenses recorded" /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── All Transactions ── */}
      {tab === 'transactions' && (
        <div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Type</th><th>Category</th><th>Amount</th><th>GST</th><th>Description</th><th>Date</th></tr>
              </thead>
              <tbody>
                {txLoading && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>}
                {(txns || []).map(t => (
                  <tr key={t.id}>
                    <td><StatusBadge status={t.tx_type} /></td>
                    <td><span className="badge-gray text-xs">{t.category}</span></td>
                    <td className={`font-semibold ${t.tx_type === 'INCOME' ? 'text-primary-600' : 'text-red-600'}`}>
                      {t.tx_type === 'INCOME' ? '+' : '-'}₹{parseFloat(t.amount).toLocaleString()}
                    </td>
                    <td className="text-xs text-gray-500">
                      {t.tax_amount > 0 ? (
                        <span className="text-emerald-600 font-medium">₹{parseFloat(t.tax_amount).toFixed(2)}</span>
                      ) : '—'}
                    </td>
                    <td className="text-gray-500 text-xs max-w-xs truncate">{t.description}</td>
                    <td className="text-gray-400">{t.tx_date}</td>
                  </tr>
                ))}
                {!txLoading && (txns || []).length === 0 && <tr><td colSpan={6}><Empty message="No transactions" /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Reports ── */}
      {tab === 'reports' && (
        <div className="space-y-6">

          {/* Download card */}
          <div className="max-w-md">
            <div className="card space-y-5">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={24} className="text-primary-500" />
                <div>
                  <p className="font-semibold text-gray-800">Monthly Finance Report</p>
                  <p className="text-xs text-gray-400">Income sheet (bills, base + GST) & Expense sheet</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Month</label>
                  <select className="select w-full" value={rptMonth} onChange={e => setRptMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="w-28">
                  <label className="text-xs text-gray-500 mb-1 block">Year</label>
                  <input type="number" className="input" value={rptYear} min={2020} max={2099}
                    onChange={e => setRptYear(Number(e.target.value))} />
                </div>
              </div>

              <button onClick={downloadReport} disabled={downloading} className="btn-primary w-full justify-center">
                <Download size={15} />
                {downloading ? 'Downloading…' : `Download ${MONTHS[rptMonth - 1]} ${rptYear} Report`}
              </button>
            </div>
          </div>

          {/* ── Income table ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title mb-0">
                Income — {MONTHS[rptMonth - 1]} {rptYear}
                <span className="ml-2 text-xs font-normal text-gray-400">({incomeRows.length} records)</span>
              </h3>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Bill Amount</th>
                    <th>Base Amount</th>
                    <th>GST %</th>
                    <th>GST Amount</th>
                    <th>Payment</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {mdLoading && <tr><td colSpan={10} className="text-center py-8 text-gray-400">Loading…</td></tr>}
                  {incomeRows.map((row, i) => (
                    <tr key={row.tx_id ?? i}>
                      <td className="font-mono text-xs text-gray-600">{row.order_number}</td>
                      <td className="font-medium">{row.customer_name}</td>
                      <td className="text-gray-500 text-sm">{row.customer_phone}</td>
                      <td className="font-semibold text-primary-600">₹{row.bill_amount.toLocaleString()}</td>
                      <td className="text-gray-700">₹{row.base_amount.toLocaleString()}</td>
                      <td className="text-gray-500">{row.gst_percent}%</td>
                      <td className="text-emerald-600 font-medium">₹{row.gst_amount.toLocaleString()}</td>
                      <td><span className="badge-gray text-xs">{row.payment_method}</span></td>
                      <td className="text-gray-400 text-sm">{row.date}</td>
                      <td>
                        <button
                          disabled={!row.tx_id}
                          onClick={() => openDelete(row.tx_id, `Order ${row.order_number} — ${row.customer_name}`)}
                          className="btn-ghost py-1 text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Delete income record"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!mdLoading && incomeRows.length === 0 && (
                    <tr><td colSpan={10}><Empty message={`No income records for ${MONTHS[rptMonth - 1]} ${rptYear}`} /></td></tr>
                  )}
                  {incomeRows.length > 0 && (
                    <tr className="bg-emerald-50 font-semibold">
                      <td colSpan={3} className="text-gray-600">TOTAL</td>
                      <td className="text-primary-700">₹{incTotal.toLocaleString()}</td>
                      <td className="text-gray-700">₹{incBase.toLocaleString()}</td>
                      <td></td>
                      <td className="text-emerald-700">₹{incGst.toLocaleString()}</td>
                      <td colSpan={3}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Expense table ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title mb-0">
                Expenses — {MONTHS[rptMonth - 1]} {rptYear}
                <span className="ml-2 text-xs font-normal text-gray-400">({expenseRows.length} records)</span>
              </h3>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {mdLoading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>}
                  {expenseRows.map(row => (
                    <tr key={row.tx_id}>
                      <td><span className="badge-gold text-xs">{row.category}</span></td>
                      <td className="text-gray-600 text-sm max-w-xs truncate">{row.description}</td>
                      <td className="font-semibold text-red-600">₹{row.amount.toLocaleString()}</td>
                      <td className="text-gray-400 text-sm">{row.date}</td>
                      <td>
                        <button
                          onClick={() => openDelete(row.tx_id, row.description || row.category)}
                          className="btn-ghost py-1 text-red-400"
                          title="Delete expense record"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!mdLoading && expenseRows.length === 0 && (
                    <tr><td colSpan={5}><Empty message={`No expense records for ${MONTHS[rptMonth - 1]} ${rptYear}`} /></td></tr>
                  )}
                  {expenseRows.length > 0 && (
                    <tr className="bg-amber-50 font-semibold">
                      <td colSpan={2} className="text-gray-600">TOTAL</td>
                      <td className="text-red-700">₹{expTotal.toLocaleString()}</td>
                      <td colSpan={2}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ── Add Expense Modal ── */}
      <Modal open={expModal} onClose={() => setExpModal(false)} title="Add Expense"
        footer={<><button onClick={() => setExpModal(false)} className="btn-ghost">Cancel</button>
          <button onClick={() => saveExp.mutate(expForm)} disabled={saveExp.isPending} className="btn-primary">Save</button></>}>
        <Field label="Title" required><input className="input" value={expForm.title} onChange={e => setExpForm({ ...expForm, title: e.target.value })} /></Field>
        <Field label="Category">
          <select className="select" value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Amount (₹)" required><input type="number" step="0.01" className="input" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} /></Field>
        <Field label="Date"><input type="date" className="input" value={expForm.expense_date} onChange={e => setExpForm({ ...expForm, expense_date: e.target.value })} /></Field>
        <Field label="Notes"><textarea className="input" rows={2} value={expForm.notes} onChange={e => setExpForm({ ...expForm, notes: e.target.value })} /></Field>
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      <Modal
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeletePassword('') }}
        title="Confirm Delete"
        footer={
          <>
            <button onClick={() => { setDeleteModal(false); setDeletePassword('') }} className="btn-ghost">Cancel</button>
            <button
              onClick={() => secureDelete.mutate({ txId: deleteTarget?.txId, password: deletePassword })}
              disabled={secureDelete.isPending || !deletePassword}
              className="btn-danger"
            >
              {secureDelete.isPending ? 'Deleting…' : 'Delete Record'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
            <Trash2 size={18} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">Delete this finance record?</p>
              <p className="text-xs text-red-500 mt-0.5 truncate max-w-xs">{deleteTarget?.label}</p>
            </div>
          </div>
          <Field label="Enter your password to confirm">
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                className="input pl-8"
                placeholder="Your account password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && deletePassword && secureDelete.mutate({ txId: deleteTarget?.txId, password: deletePassword })}
                autoFocus
              />
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
