import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { financeAPI } from '@/api'
import { PageLoader, Modal, SearchBar, StatusBadge, Field, Empty, KpiCard } from '@/components/ui'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Plus, Trash2, Filter } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

export default function FinancePage() {
  const qc = useQueryClient()
  const [tab, setTab]           = useState('overview')
  const [expModal, setExpModal] = useState(false)
  const [expForm, setExpForm]   = useState({ category: 'MISC', title: '', amount: '', expense_date: new Date().toISOString().split('T')[0], notes: '' })

  const { data: summary } = useQuery({ queryKey: ['finance-summary'], queryFn: () => financeAPI.summary().then(r => r.data) })
  const { data: expenses, isLoading: expLoading } = useQuery({ queryKey: ['expenses'], queryFn: () => financeAPI.expenses.list().then(r => r.data.results || r.data) })
  const { data: txns, isLoading: txLoading } = useQuery({ queryKey: ['transactions'], queryFn: () => financeAPI.transactions.list().then(r => r.data.results || r.data) })

  const saveExp = useMutation({
    mutationFn: d => financeAPI.expenses.create(d),
    onSuccess: () => { qc.invalidateQueries(['expenses']); qc.invalidateQueries(['finance-summary']); setExpModal(false); toast.success('Expense recorded') },
  })
  const delExp = useMutation({
    mutationFn: id => financeAPI.expenses.delete(id),
    onSuccess: () => { qc.invalidateQueries(['expenses']); qc.invalidateQueries(['finance-summary']); toast.success('Deleted') },
  })

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

  const tabs = [
    { id: 'overview',  label: 'Overview' },
    { id: 'expenses',  label: 'Expenses' },
    { id: 'transactions', label: 'All Transactions' },
  ]

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

      {tab === 'overview' && s && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Total Income"   value={`₹${parseFloat(s.total_income).toLocaleString()}`}  icon={<TrendingUp size={22} />}    color="primary" />
            <KpiCard title="Total Expense"  value={`₹${parseFloat(s.total_expense).toLocaleString()}`} icon={<TrendingDown size={22} />}  color="gold" />
            <KpiCard title="Net Profit"     value={`₹${parseFloat(s.net_profit).toLocaleString()}`}    icon={<DollarSign size={22} />}    color={s.net_profit >= 0 ? 'primary' : 'red'} />
            <KpiCard title="Today Income"   value={`₹${parseFloat(s.today_income).toLocaleString()}`}  icon={<TrendingUp size={22} />}    color="primary" subtitle={`Expense: ₹${parseFloat(s.today_expense).toLocaleString()}`} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Month Income"   value={`₹${parseFloat(s.month_income).toLocaleString()}`}  icon={<TrendingUp size={22} />}    color="primary" />
            <KpiCard title="Month Expense"  value={`₹${parseFloat(s.month_expense).toLocaleString()}`} icon={<TrendingDown size={22} />}  color="gold" />
            <KpiCard title="Month Profit"   value={`₹${parseFloat(s.month_profit).toLocaleString()}`}  icon={<DollarSign size={22} />}    color={s.month_profit >= 0 ? 'primary' : 'red'} />
          </div>
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

      {tab === 'transactions' && (
        <div>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Type</th><th>Category</th><th>Amount</th><th>Description</th><th>Date</th></tr></thead>
              <tbody>
                {txLoading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>}
                {(txns || []).map(t => (
                  <tr key={t.id}>
                    <td><StatusBadge status={t.tx_type} /></td>
                    <td><span className="badge-gray text-xs">{t.category}</span></td>
                    <td className={`font-semibold ${t.tx_type === 'INCOME' ? 'text-primary-600' : 'text-red-600'}`}>
                      {t.tx_type === 'INCOME' ? '+' : '-'}₹{parseFloat(t.amount).toLocaleString()}
                    </td>
                    <td className="text-gray-500 text-xs max-w-xs truncate">{t.description}</td>
                    <td className="text-gray-400">{t.tx_date}</td>
                  </tr>
                ))}
                {!txLoading && (txns || []).length === 0 && <tr><td colSpan={5}><Empty message="No transactions" /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
    </div>
  )
}
