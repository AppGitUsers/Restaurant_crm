import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tablesAPI } from '@/api'
import { PageLoader, Empty } from '@/components/ui'
import {
  RefreshCcw, ClipboardList, Clock, Users,
  TrendingUp, Store, Utensils, Receipt, Search, MessageCircle, Printer,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const fmt = iso =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    : '—'

const dur = (start, end) => {
  const ms = Math.max(0, (end ? new Date(end) : new Date()) - new Date(start))
  const m  = Math.floor(ms / 60000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

const STATUS = {
  OPEN:   { label: 'Active', cls: 'bg-blue-100  text-blue-700'  },
  CLOSED: { label: 'Closed', cls: 'bg-amber-100 text-amber-700' },
  BILLED: { label: 'Billed', cls: 'bg-green-100 text-green-700' },
}

const SESSION_FILTERS = [
  { key: 'ALL',    label: 'All'    },
  { key: 'OPEN',   label: 'Active' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'BILLED', label: 'Billed' },
]

function sendWhatsApp({ order_number, customer_phone, items, subtotal, discount, tax_amount, total_amount, payment_method, share_token }) {
  const digits = (customer_phone || '').replace(/\D/g, '')
  const phone  = digits.length === 10 ? `91${digits}` : digits
  const lines  = []
  lines.push(`🧾 *Bill Receipt — ${order_number}*`)
  lines.push(``)
  lines.push(`*Items:*`)
  items.forEach(item => {
    const name = item.food_item_name || item.name || 'Item'
    lines.push(`• ${name} ×${item.quantity}  ₹${parseFloat(item.line_total).toFixed(2)}`)
    if (item.notes) lines.push(`  ↳ ${item.notes}`)
  })
  lines.push(``)
  lines.push(`Subtotal:  ₹${parseFloat(subtotal).toFixed(2)}`)
  if (parseFloat(discount) > 0)
    lines.push(`Discount:  -₹${parseFloat(discount).toFixed(2)}`)
  lines.push(`Tax:       ₹${parseFloat(tax_amount).toFixed(2)}`)
  lines.push(`*Total:    ₹${parseFloat(total_amount).toFixed(2)}*`)
  lines.push(``)
  lines.push(`Payment: ${payment_method}`)
  lines.push(``)
  lines.push(`Thank you for visiting us! 🙏`)
  if (share_token)
    lines.push(`\n📄 View your bill: ${window.location.origin}/receipt/${share_token}`)
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
}

function printBill(order) {
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  const items   = order.items || []
  const sub     = parseFloat(order.subtotal    || 0)
  const disc    = parseFloat(order.discount    || 0)
  const tax     = parseFloat(order.tax_amount  || 0)
  const total   = parseFloat(order.total_amount || 0)

  const rows = items.map(item => {
    const name = item.food_item_name || item.name || 'Item'
    return `<tr>
      <td>${name}${item.notes ? `<br/><span class="note">&#x21B3; ${item.notes}</span>` : ''}</td>
      <td class="c">&#xD7;${item.quantity}</td>
      <td class="r">&#x20B9;${parseFloat(item.line_total || 0).toFixed(2)}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Receipt ${order.order_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:6mm 4mm}
.ctr{text-align:center}.bold{font-weight:bold}
.dash{border-top:1px dashed #000;margin:5px 0}
table{width:100%;border-collapse:collapse}
td,th{vertical-align:top;padding:1px 0;font-size:11px}
.c{text-align:center;width:28px}.r{text-align:right;width:64px}
.note{font-size:10px;color:#555}
.sum{display:flex;justify-content:space-between;padding:1px 0;font-size:11px}
.tot{font-size:14px;font-weight:bold}
</style></head><body>
<div class="ctr bold" style="font-size:15px;margin-bottom:2px">BILL RECEIPT</div>
<div class="ctr" style="font-size:10px;margin-bottom:6px">${dateStr} &nbsp; ${timeStr}</div>
<div class="dash"></div>
<div style="font-size:11px;margin-bottom:4px">
  <div><b>Bill No:</b> ${order.order_number}</div>
  ${order.customer_name  ? `<div><b>Customer:</b> ${order.customer_name}</div>`  : ''}
  ${order.customer_phone ? `<div><b>Phone:</b> ${order.customer_phone}</div>` : ''}
</div>
<div class="dash"></div>
<table><thead><tr style="opacity:0.6;font-size:10px;text-transform:uppercase">
  <th style="text-align:left;padding-bottom:3px">Item</th><th class="c">Qty</th><th class="r">Amt</th>
</tr></thead><tbody>${rows}</tbody></table>
<div class="dash"></div>
<div class="sum"><span>Subtotal</span><span>&#x20B9;${sub.toFixed(2)}</span></div>
${disc > 0 ? `<div class="sum"><span>Discount</span><span>-&#x20B9;${disc.toFixed(2)}</span></div>` : ''}
<div class="sum"><span>Tax</span><span>&#x20B9;${tax.toFixed(2)}</span></div>
<div class="dash"></div>
<div class="sum tot"><span>TOTAL</span><span>&#x20B9;${total.toFixed(2)}</span></div>
<div class="dash"></div>
<div class="sum" style="font-size:11px"><span>Payment</span><span>${order.payment_method || ''}</span></div>
<div class="dash"></div>
<div class="ctr" style="margin-top:8px;font-size:11px">Thank you! Visit again &#x1F64F;</div><br/>
</body></html>`

  const w = window.open('', '_blank', 'width=360,height=600,menubar=no,toolbar=no')
  if (!w) { toast.error('Allow pop-ups to print the receipt'); return }
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
  w.onafterprint = () => w.close()
}

export default function TodayOrdersPage() {
  const [activeTab,  setActiveTab]  = useState('sessions')  // 'sessions' | 'counter'
  const [filter,     setFilter]     = useState('ALL')
  const [search,     setSearch]     = useState('')

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey:        ['today-sessions'],
    queryFn:         () => tablesAPI.todaySessions().then(r => r.data),
    refetchInterval: 30_000,
    retry:           1,
  })

  const summary       = data?.summary        || {}
  const allSessions   = data?.sessions       || []
  const allCounter    = data?.counter_orders || []

  const q = search.trim().toLowerCase()

  // Table sessions — status filter + search by table number
  const sessions = allSessions
    .filter(s => filter === 'ALL' || s.status === filter)
    .filter(s => !q || String(s.table_number).includes(q))

  // Counter bills — search by order number, customer phone or name
  const counterOrders = allCounter.filter(o =>
    !q ||
    o.order_number.toLowerCase().includes(q) ||
    o.customer_phone.includes(q) ||
    o.customer_name.toLowerCase().includes(q)
  )

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Today's Orders</h1>
          <p className="page-subtitle">
            {data?.date || '—'} &middot; {allSessions.length} table session{allSessions.length !== 1 ? 's' : ''} &middot; {allCounter.length} counter bill{allCounter.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="btn-ghost">
          <RefreshCcw size={15} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <SummaryCard icon={<ClipboardList size={20} />} label="Table Sessions"  value={summary.total_sessions      ?? 0}                        bg="bg-primary-50" text="text-primary-600" />
        <SummaryCard icon={<Clock         size={20} />} label="Active Now"      value={summary.active_sessions     ?? 0}                        bg="bg-blue-50"    text="text-blue-600"    />
        <SummaryCard icon={<TrendingUp    size={20} />} label="Today's Revenue" value={`₹${(summary.today_revenue  ?? 0).toFixed(0)}`}           bg="bg-green-50"   text="text-green-600"   />
        <SummaryCard icon={<Store         size={20} />} label="Counter Bills"   value={summary.counter_bills_today ?? 0}                        bg="bg-orange-50"  text="text-orange-600"  />
        <SummaryCard icon={<Users         size={20} />} label="Scanner Rounds"  value={summary.customer_batches    ?? 0}                        bg="bg-indigo-50"  text="text-indigo-600"  />
      </div>

      {isLoading && <PageLoader />}
      {isError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 mb-4">
          Could not load today's data.
        </div>
      )}

      {/* Tab bar + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        {/* Main tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-shrink-0">
          <button
            onClick={() => setActiveTab('sessions')}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'sessions' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <ClipboardList size={14} /> Table Sessions
            <span className={clsx('ml-1 text-xs px-1.5 py-0.5 rounded-full', activeTab === 'sessions' ? 'bg-primary-100 text-primary-600' : 'bg-gray-200 text-gray-500')}>
              {allSessions.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('counter')}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeTab === 'counter' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Receipt size={14} /> Counter Bills
            <span className={clsx('ml-1 text-xs px-1.5 py-0.5 rounded-full', activeTab === 'counter' ? 'bg-primary-100 text-primary-600' : 'bg-gray-200 text-gray-500')}>
              {allCounter.length}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8 py-1.5 text-sm w-full"
            placeholder={activeTab === 'sessions' ? 'Search table no…' : 'Order no / phone / name…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Status filter — only for sessions tab */}
        {activeTab === 'sessions' && (
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-shrink-0">
            {SESSION_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={clsx(
                  'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                  filter === f.key ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Table Sessions tab ─────────────────────────────────────────── */}
      {activeTab === 'sessions' && (
        <>
          {!isLoading && !isError && sessions.length === 0 && (
            <Empty message="No table sessions found" icon={<Utensils size={40} />} />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {sessions.map(s => <SessionCard key={s.id} session={s} />)}
          </div>
        </>
      )}

      {/* ── Counter Bills tab ──────────────────────────────────────────── */}
      {activeTab === 'counter' && (
        <>
          {!isLoading && !isError && counterOrders.length === 0 && (
            <Empty message="No counter bills found" icon={<Receipt size={40} />} />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {counterOrders.map(o => <CounterOrderCard key={o.id} order={o} />)}
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ icon, label, value, bg, text }) {
  return (
    <div className={clsx('rounded-xl p-4 flex items-center gap-3', bg)}>
      <div className={clsx('flex-shrink-0', text)}>{icon}</div>
      <div className="min-w-0">
        <p className={clsx('text-xl font-bold leading-tight truncate', text)}>{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  )
}

function SessionCard({ session }) {
  const cfg     = STATUS[session.status] || STATUS.OPEN
  const batches = session.batches || []

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex flex-col items-center justify-center flex-shrink-0">
            <span className="text-xs text-gray-400 leading-none">T</span>
            <span className="text-2xl font-bold text-primary-600 leading-none">{session.table_number}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {session.item_count} item{session.item_count !== 1 ? 's' : ''} &middot; ₹{parseFloat(session.subtotal).toFixed(0)}
            </p>
            <p className="text-xs text-gray-400">
              {fmt(session.opened_at)} → {session.closed_at ? fmt(session.closed_at) : 'ongoing'}
              &nbsp;&middot;&nbsp;{dur(session.opened_at, session.closed_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {session.status === 'BILLED' && session.billing_order?.customer_phone && (
            <button
              onClick={() => sendWhatsApp(session.billing_order)}
              title="Send bill on WhatsApp"
              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
            >
              <MessageCircle size={15} />
            </button>
          )}
          {session.status === 'BILLED' && session.billing_order && (
            <button
              onClick={() => printBill(session.billing_order)}
              title="Print bill"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <Printer size={15} />
            </button>
          )}
          <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold', cfg.cls)}>
            {cfg.label}
          </span>
        </div>
      </div>

      {session.billing_order?.customer_name || session.billing_order?.customer_phone ? (
        <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
          <span className="font-medium">{session.billing_order.customer_name || '—'}</span>
          {session.billing_order.customer_phone && (
            <span className="text-gray-400">&middot; {session.billing_order.customer_phone}</span>
          )}
        </p>
      ) : null}

      <div className="space-y-2">
        {batches.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-1">No orders yet</p>
        )}
        {batches.map((batch, idx) => (
          <div key={batch.id} className="bg-gray-50 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-gray-500">Round {idx + 1}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{fmt(batch.placed_at)}</span>
                <span className={clsx(
                  'text-xs px-1.5 py-0.5 rounded font-semibold',
                  batch.added_by === 'BILLER'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-indigo-100 text-indigo-700'
                )}>
                  {batch.added_by === 'BILLER' ? 'Counter' : 'Scanner'}
                </span>
              </div>
            </div>
            <div className="space-y-0.5">
              {(batch.items || []).map((item, j) => (
                <div key={j} className="flex justify-between text-xs text-gray-600">
                  <span className="truncate mr-2">
                    {item.food_item_name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}
                  </span>
                  <span className="font-medium flex-shrink-0">₹{parseFloat(item.line_total).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CounterOrderCard({ order }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-mono text-sm font-bold text-gray-800">{order.order_number}</p>
          <p className="text-xs text-gray-400">{fmt(order.created_at)} &middot; by {order.biller_name}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {order.customer_phone && (
            <button
              onClick={() => sendWhatsApp(order)}
              title="Send bill on WhatsApp"
              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
            >
              <MessageCircle size={15} />
            </button>
          )}
          <button
            onClick={() => printBill(order)}
            title="Print bill"
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Printer size={15} />
          </button>
          <div className="text-right">
            <p className="text-sm font-bold text-green-600">₹{order.total_amount.toFixed(0)}</p>
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold">
              Counter
            </span>
          </div>
        </div>
      </div>

      {(order.customer_name || order.customer_phone) && (
        <p className="text-xs text-gray-500 mb-2">
          {order.customer_name}{order.customer_name && order.customer_phone ? ' · ' : ''}{order.customer_phone}
        </p>
      )}

      <div className="bg-gray-50 rounded-lg p-2.5 space-y-0.5">
        {(order.items || []).map((item, i) => (
          <div key={i} className="flex justify-between text-xs text-gray-600">
            <span className="truncate mr-2">{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
            <span className="font-medium flex-shrink-0">₹{item.line_total.toFixed(0)}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
        <span>{order.payment_method}</span>
        {order.discount > 0 && <span>Discount: ₹{order.discount.toFixed(0)}</span>}
      </div>
    </div>
  )
}
