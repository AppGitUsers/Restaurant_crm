import { useQuery } from '@tanstack/react-query'
import { dashboardAPI, financeAPI } from '@/api'
import { PageLoader, KpiCard } from '@/components/ui'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import {
  TrendingUp, ShoppingBag, Users, Package,
  UserCheck, AlertTriangle, Award, Star
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

const TEAL  = '#1D9E75'
const GOLD  = '#BA7517'
const RED   = '#ef4444'
const BLUE  = '#3b82f6'

export default function Dashboard() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn:  () => dashboardAPI.summary().then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data: finance } = useQuery({
    queryKey: ['finance-summary'],
    queryFn:  () => financeAPI.summary().then(r => r.data),
  })

  if (isLoading) return <PageLoader />

  const { today, month, inventory, staff, customers,
          top_selling_items, low_makeable_items,
          top_customers, top_attendance } = summary

  // Build daily chart data
  const dailyMap = {}
  ;(finance?.daily_chart || []).forEach(({ date, tx_type, total }) => {
    const d = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd')
    if (!dailyMap[d]) dailyMap[d] = { date: d, income: 0, expense: 0 }
    if (tx_type === 'INCOME')  dailyMap[d].income  = parseFloat(total)
    if (tx_type === 'EXPENSE') dailyMap[d].expense = parseFloat(total)
  })
  const dailyChart = Object.values(dailyMap).slice(-14).map(d => ({
    ...d,
    date: format(parseISO(d.date), 'dd MMM'),
  }))

  // Expense breakdown pie
  const pieData = (finance?.expense_breakdown || []).slice(0, 6).map(e => ({
    name:  e.category,
    value: parseFloat(e.total),
  }))
  const PIE_COLORS = [TEAL, GOLD, RED, BLUE, '#8b5cf6', '#ec4899']

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your restaurant operations</p>
        </div>
        <span className="text-sm text-gray-400">{format(new Date(), 'EEEE, dd MMMM yyyy')}</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Today's Revenue"
          value={`₹${today.revenue.toLocaleString()}`}
          subtitle={`${today.order_count} orders today`}
          icon={<TrendingUp size={22} />}
          color="primary"
        />
        <KpiCard
          title="Month Revenue"
          value={`₹${month.revenue.toLocaleString()}`}
          subtitle={`${month.order_count} orders this month`}
          icon={<ShoppingBag size={22} />}
          color="gold"
        />
        <KpiCard
          title="Month Profit"
          value={`₹${month.profit.toLocaleString()}`}
          subtitle={`Expense: ₹${month.expense.toLocaleString()}`}
          icon={<Award size={22} />}
          color={month.profit >= 0 ? 'primary' : 'red'}
        />
        <KpiCard
          title="Staff Present"
          value={`${staff.present_today} / ${staff.total}`}
          subtitle="Today's attendance"
          icon={<UserCheck size={22} />}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Low Stock Alerts"
          value={inventory.low_stock_count}
          subtitle="Ingredients below threshold"
          icon={<AlertTriangle size={22} />}
          color={inventory.low_stock_count > 0 ? 'red' : 'primary'}
        />
        <KpiCard
          title="Total Customers"
          value={customers.total}
          subtitle={`${customers.high_value} high-value`}
          icon={<Users size={22} />}
          color="primary"
        />
        <KpiCard
          title="Month Expense"
          value={`₹${month.expense.toLocaleString()}`}
          subtitle="This month spending"
          icon={<Package size={22} />}
          color="gold"
        />
        <KpiCard
          title="High-Value Customers"
          value={customers.high_value}
          subtitle="Loyal regulars"
          icon={<Star size={22} />}
          color="gold"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Income vs Expense area chart */}
        <div className="card lg:col-span-2">
          <p className="section-title">Income vs Expense — Last 14 Days</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TEAL} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={TEAL} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GOLD} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
              <Legend />
              <Area type="monotone" dataKey="income"  stroke={TEAL} fill="url(#gi)" name="Income" strokeWidth={2} />
              <Area type="monotone" dataKey="expense" stroke={GOLD} fill="url(#ge)" name="Expense" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Expense breakdown pie */}
        <div className="card">
          <p className="section-title">Expense Breakdown</p>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                     dataKey="value" paddingAngle={3}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
                <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-300 text-sm">No expense data yet</div>
          )}
        </div>
      </div>

      {/* Tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top selling items */}
        <div className="card">
          <p className="section-title">
            <ShoppingBag size={16} className="text-primary-400" />
            Top Selling Items
          </p>
          <div className="space-y-2">
            {top_selling_items.slice(0, 8).map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-600 text-xs flex items-center justify-center font-bold">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{item.food_item__name}</p>
                    <p className="text-xs text-gray-400">{item.food_item__food_type__name}</p>
                  </div>
                </div>
                <span className="badge-green">{item.total_qty} sold</span>
              </div>
            ))}
            {top_selling_items.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No sales data yet</p>
            )}
          </div>
        </div>

        {/* Top customers */}
        <div className="card">
          <p className="section-title">
            <Users size={16} className="text-primary-400" />
            Top Customers
          </p>
          <div className="space-y-2">
            {top_customers.slice(0, 8).map((c, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-gold-100 text-gold-400 text-xs flex items-center justify-center font-bold">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.phone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-700">₹{parseFloat(c.total_spent).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{c.total_visits} visits</p>
                </div>
              </div>
            ))}
            {top_customers.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No customer data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Low makeable + attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <p className="section-title">
            <AlertTriangle size={16} className="text-gold-400" />
            Low Makeable Items (Stock Alert)
          </p>
          <div className="space-y-2">
            {low_makeable_items.slice(0, 8).map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-700">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.food_type__name}</p>
                </div>
                <span className={item.makeable_count === 0 ? 'badge-red' : 'badge-gold'}>
                  {item.makeable_count} can make
                </span>
              </div>
            ))}
            {low_makeable_items.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">All items well stocked ✓</p>
            )}
          </div>
        </div>

        <div className="card">
          <p className="section-title">
            <UserCheck size={16} className="text-primary-400" />
            Top Attendance (Last 30 Days)
          </p>
          <div className="space-y-2">
            {top_attendance.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-600 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                  <p className="text-sm font-medium text-gray-700">{a.employee__name}</p>
                </div>
                <span className="badge-green">{a.days} days</span>
              </div>
            ))}
            {top_attendance.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">No attendance data yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
