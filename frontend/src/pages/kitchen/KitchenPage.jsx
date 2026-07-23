import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tablesAPI } from '@/api'
import { parseISO, format } from 'date-fns'
import { Modal, Field, Empty } from '@/components/ui'
import {
  ChefHat, CheckCheck, Loader2, UtensilsCrossed,
  Timer, Sparkles, Wand2, ClipboardCheck, Flame,
  Minus, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'

// PENDING = amber, PREPARING = blue
const STATUS = {
  PENDING:   {
    header:  'bg-green-500',
    itemQty: 'bg-green-600 text-white',
    badge:   'bg-green-100 text-green-700 border border-green-200',
    btn:     'bg-green-600 hover:bg-green-700 text-white',
    label:   'New Order',
  },
  PREPARING: {
    header:  'bg-blue-500',
    itemQty: 'bg-blue-500 text-white',
    badge:   'bg-blue-100 text-blue-700 border border-blue-200',
    btn:     'bg-green-600 hover:bg-green-700 text-white',
    label:   'Preparing',
  },
}

// ── Live elapsed timer ────────────────────────────────────────────────────────
function LiveTimer({ placedAt, invert = false }) {
  const start = parseISO(placedAt).getTime()
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - start) / 1000))

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [start])

  const mins    = Math.floor(elapsed / 60)
  const secs    = elapsed % 60
  const overdue = elapsed >= 180

  if (invert) {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono font-bold text-sm px-2.5 py-1 rounded-full
        ${overdue
          ? 'bg-red-500 text-white animate-pulse'
          : 'bg-white/30 text-white'}`}>
        <Timer size={13} />
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1 font-mono font-semibold text-xs px-2 py-0.5 rounded-full
      ${overdue ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-black/10 text-white/90'}`}>
      <Timer size={10} />
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  )
}

// ── Parse add-ons / components ────────────────────────────────────────────────
function parseNotes(notes) {
  if (!notes) return { components: null, addons: null }
  let text = notes
  let components = null
  const customMatch = text.match(/^Custom:\s*([^|]+)/)
  if (customMatch) {
    components = customMatch[1].trim().split(' + ').map(s => s.trim()).filter(Boolean)
    text = text.slice(customMatch[0].length).replace(/^\s*\|\s*/, '').trim()
  }
  let addons = null
  const addonMatch = text.match(/Add-ons:\s*(.+)/i)
  if (addonMatch) addons = addonMatch[1].split(',').map(s => s.trim()).filter(Boolean)
  return { components, addons }
}

// ── Stock-restore toggle ──────────────────────────────────────────────────────
function StockToggle({ value, onChange, label, hint }) {
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all
          ${value ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
      >
        <span className={`text-sm font-medium ${value ? 'text-green-700' : 'text-gray-600'}`}>{label}</span>
        <div className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${value ? 'bg-green-500' : 'bg-gray-300'}`}>
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${value ? 'left-6' : 'left-1'}`} />
        </div>
      </button>
      <p className="text-xs text-gray-400 mt-1 px-1">{hint}</p>
    </div>
  )
}

// ── Cancel modal ──────────────────────────────────────────────────────────────
function CancelItemModal({ item, onConfirm, onClose, loading }) {
  const [pin, setPin]                   = useState('')
  const [restoreStock, setRestoreStock] = useState(false)
  const ref                             = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <Modal open={!!item} onClose={onClose} title="Cancel Item" size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Back</button>
          <button onClick={() => !loading && onConfirm(pin, restoreStock)} disabled={loading} className="btn-danger">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <><Trash2 size={14} />Remove Item</>}
          </button>
        </>
      }
    >
      <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
        <p className="text-sm text-red-700 font-medium">{item?.food_item_name}</p>
        <p className="text-xs text-red-500 mt-0.5">Quantity: {item?.quantity} · Customer will be notified</p>
      </div>

      <StockToggle
        value={restoreStock}
        onChange={setRestoreStock}
        label="Restore stock to inventory?"
        hint={restoreStock
          ? 'Ingredients will be added back — use when item was never started.'
          : 'Ingredients stay deducted — use when already used or wasted.'}
      />

      <Field label="Staff PIN">
        <input ref={ref} type="password" value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && onConfirm(pin, restoreStock)}
          placeholder="Enter your PIN"
          className="input text-center tracking-[0.4em] font-mono text-lg"
        />
      </Field>
    </Modal>
  )
}

// ── Reduce modal ──────────────────────────────────────────────────────────────
function ReduceModal({ item, onConfirm, onClose, loading }) {
  const [pin, setPin]                   = useState('')
  const [newQty, setNewQty]             = useState(1)
  const [restoreStock, setRestoreStock] = useState(false)
  const ref                             = useRef(null)

  useEffect(() => { if (item) setNewQty(item.quantity - 1) }, [item?.id])
  useEffect(() => { ref.current?.focus() }, [])

  const max = item ? item.quantity - 1 : 1

  return (
    <Modal open={!!item} onClose={onClose} title="Reduce Quantity" size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => !loading && onConfirm(newQty, pin, restoreStock)} disabled={loading} className="btn-primary">
            {loading ? <Loader2 size={14} className="animate-spin" /> : 'Confirm'}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-500 mb-4">
        <span className="font-semibold text-gray-800">{item?.food_item_name}</span>
        {' '}— ordered ×{item?.quantity}, serving how many?
      </p>

      {/* Qty stepper */}
      <div className="flex items-center justify-center gap-4 mb-1">
        <button type="button" onClick={() => setNewQty(q => Math.max(1, q - 1))}
          className="w-11 h-11 rounded-xl border-2 border-gray-200 flex items-center justify-center
                     hover:border-gray-300 hover:bg-gray-50 transition-all text-gray-600">
          <Minus size={18} />
        </button>
        <div className="text-center min-w-[60px]">
          <span className="text-5xl font-black text-gray-800 leading-none">{newQty}</span>
        </div>
        <button type="button" onClick={() => setNewQty(q => Math.min(max, q + 1))}
          className="w-11 h-11 rounded-xl border-2 border-gray-200 flex items-center justify-center
                     hover:border-gray-300 hover:bg-gray-50 transition-all text-gray-600 text-2xl font-bold">
          +
        </button>
      </div>
      {item && (
        <p className="text-xs text-gray-400 text-center mb-4">
          {item.quantity - newQty} item{item.quantity - newQty !== 1 ? 's' : ''} will be cancelled
        </p>
      )}

      <StockToggle
        value={restoreStock}
        onChange={setRestoreStock}
        label="Restore reduced portion to stock?"
        hint={restoreStock ? 'Ingredients for cancelled portion will be added back.' : 'Ingredients stay deducted.'}
      />

      <Field label="Staff PIN">
        <input ref={ref} type="password" value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && onConfirm(newQty, pin, restoreStock)}
          placeholder="Enter your PIN"
          className="input text-center tracking-[0.4em] font-mono text-lg"
        />
      </Field>
    </Modal>
  )
}

// ── Single item row ───────────────────────────────────────────────────────────
function KitchenItem({ item, qtyClass, onCancel, onReduce }) {
  const isCustom               = !item.food_item
  const isCancelled            = item.cancelled_by_kitchen
  const { components, addons } = parseNotes(item.notes)

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-gray-100 last:border-0 ${isCancelled ? 'opacity-35' : ''}`}>

      {/* Quantity circle */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-black text-lg
        ${isCancelled ? 'bg-gray-200 text-gray-400' : qtyClass}`}>
        {item.quantity}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          {isCustom && !isCancelled && <Wand2 size={13} className="text-amber-500 flex-shrink-0" />}
          <span className={`font-semibold text-base leading-snug
            ${isCancelled ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {item.food_item_name}
          </span>
          {isCancelled && (
            <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-medium shrink-0">
              Cancelled
            </span>
          )}
        </div>

        {!isCancelled && isCustom && components?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {components.map((c, i) => (
              <span key={i} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                {c}
              </span>
            ))}
          </div>
        )}

        {!isCancelled && addons?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5 items-center">
            <span className="text-xs text-gray-400 font-medium">+ Add-ons:</span>
            {addons.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-600 border border-violet-100 px-2 py-0.5 rounded-full font-medium">
                <Sparkles size={9} />{a}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons — only for active items */}
      {!isCancelled && onCancel && (
        <div className="flex gap-1 flex-shrink-0 pt-0.5">
          {item.quantity > 1 && (
            <button onClick={() => onReduce(item)} title="Reduce quantity"
              className="w-8 h-8 rounded-lg border border-amber-200 bg-amber-50 text-amber-600
                         flex items-center justify-center hover:bg-amber-100 transition-colors">
              <Minus size={14} />
            </button>
          )}
          <button onClick={() => onCancel(item)} title="Cancel item"
            className="w-8 h-8 rounded-lg border border-red-200 bg-red-50 text-red-500
                       flex items-center justify-center hover:bg-red-100 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Active orders ─────────────────────────────────────────────────────────────
function ActiveOrders({ batches, pendingCount, preparingCount, advance, onCancelItem, onReduceItem }) {
  const activeBatches = batches.filter(b => b.items.some(i => !i.cancelled_by_kitchen))

  if (activeBatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
          <UtensilsCrossed size={36} className="text-green-400" />
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-gray-700">All caught up!</p>
          <p className="text-sm text-gray-400 mt-1">No pending orders right now</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-2xl px-5 py-2.5">
          <span className="text-2xl font-black text-green-600">{pendingCount}</span>
          <div>
            <p className="text-xs font-bold text-green-600 uppercase tracking-wide leading-none">New</p>
            <p className="text-xs text-green-500">orders</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-2.5">
          <span className="text-2xl font-black text-blue-600">{preparingCount}</span>
          <div>
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wide leading-none">In</p>
            <p className="text-xs text-blue-500">progress</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 ml-auto hidden sm:block">Refreshes every 10 seconds</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        {batches.map(batch => {
          const meta        = STATUS[batch.status]
          const isPending   = batch.status === 'PENDING'
          const isWorking   = advance.isPending && advance.variables?.id === batch.id
          const nextStatus  = isPending ? 'PREPARING' : 'SERVED'
          const activeItems = batch.items.filter(i => !i.cancelled_by_kitchen)
          if (activeItems.length === 0) return null

          return (
            <div key={batch.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">

              {/* ── Coloured header ── */}
              <div className={`${meta.header} px-4 py-3`}>
                <div className="flex items-start justify-between gap-2">

                  {/* Left: table / order */}
                  <div className="min-w-0">
                    {batch.is_counter ? (
                      <>
                        <p className="text-white/70 text-xs font-semibold uppercase tracking-widest leading-none mb-1">
                          Counter
                        </p>
                        <p className="text-white font-black text-lg leading-tight break-all">
                          {batch.order_number}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-white/70 text-xs font-semibold uppercase tracking-widest leading-none mb-1">
                          Table
                        </p>
                        <p className="text-white font-black text-4xl leading-none">
                          {batch.table_number}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Right: status + timer */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="bg-white/25 text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
                      {meta.label}
                    </span>
                    <LiveTimer placedAt={batch.placed_at} invert />
                  </div>
                </div>

                {/* Meta row: source + order type + time */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {batch.added_by === 'BILLER' && !batch.is_counter && (
                    <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                      Staff added
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full
                    ${batch.order_type === 'PARCEL'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-white/25 text-white'}`}>
                    {batch.order_type === 'PARCEL' ? '📦 Parcel' : '🍽 Dine In'}
                  </span>
                  <span className="bg-white/25 text-white text-xs ml-auto font-mono font-semibold px-2 py-0.5 rounded-full">
                    {format(parseISO(batch.placed_at), 'hh:mm a')}
                  </span>
                </div>
              </div>

              {/* ── Items ── */}
              <div className="flex-1 px-4 pt-1 pb-2">
                {batch.items.map(item => (
                  <KitchenItem
                    key={item.id}
                    item={item}
                    qtyClass={meta.itemQty}
                    onCancel={onCancelItem}
                    onReduce={onReduceItem}
                  />
                ))}
                {batch.notes && (
                  <div className="mt-2 mb-1 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <p className="text-xs font-medium text-amber-700">📝 {batch.notes}</p>
                  </div>
                )}
              </div>

              {/* ── CTA button ── */}
              <div className="px-4 pb-4">
                <button
                  onClick={() => advance.mutate({ id: batch.id, nextStatus })}
                  disabled={isWorking}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm
                    transition-all disabled:opacity-50 shadow-sm ${meta.btn}`}
                >
                  {isWorking
                    ? <Loader2 size={17} className="animate-spin" />
                    : isPending
                      ? <><ChefHat size={17} /> Start Preparing</>
                      : <><CheckCheck size={17} /> Mark as Served</>
                  }
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Duration badge ────────────────────────────────────────────────────────────
function BatchDuration({ placedAt, servedAt }) {
  if (!servedAt) return null
  const mins  = Math.round((new Date(servedAt) - new Date(placedAt)) / 60000)
  const label = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`
  const cls   = mins <= 15 ? 'bg-green-50 text-green-700 border-green-100'
              : mins <= 30 ? 'bg-amber-50 text-amber-700 border-amber-100'
              :               'bg-red-50 text-red-600 border-red-100'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>
  )
}

// ── Served orders ─────────────────────────────────────────────────────────────
function ServedOrders() {
  const today     = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(today)
  const [customDate, setCustomDate]     = useState('')

  const { data, isLoading } = useQuery({
    queryKey:        ['kitchen-served', selectedDate],
    queryFn:         () => tablesAPI.kitchen.servedBatches(selectedDate).then(r => r.data),
    refetchInterval: 30_000,
  })

  const batches        = data?.batches || []
  const cancelledCount = batches.reduce((n, b) => n + b.items.filter(i => i.cancelled_by_kitchen).length, 0)
  const pickDate       = d => { setSelectedDate(d); setCustomDate('') }

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {[{ label: 'Today', val: today }, { label: 'Yesterday', val: yesterday }].map(({ label, val }) => (
          <button key={val} onClick={() => pickDate(val)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${selectedDate === val ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
        <input type="date" value={customDate} max={today}
          onChange={e => { setCustomDate(e.target.value); setSelectedDate(e.target.value) }}
          className="input w-auto py-1.5 text-sm"
        />
        {batches.length > 0 && (
          <span className="ml-auto text-gray-400 text-sm">
            {batches.length} order{batches.length !== 1 ? 's' : ''}
            {cancelledCount > 0 && ` · ${cancelledCount} cancelled`}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : batches.length === 0 ? (
        <Empty
          icon={<ClipboardCheck size={40} />}
          message={selectedDate === today
            ? 'Nothing served today yet.'
            : `No orders on ${format(new Date(selectedDate + 'T00:00:00'), 'dd MMM yyyy')}.`}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Table / Order</th>
                <th>Type</th>
                <th>Items</th>
                <th className="text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {batches.map(batch => {
                const active    = batch.items.filter(i => !i.cancelled_by_kitchen)
                const cancelled = batch.items.filter(i => i.cancelled_by_kitchen)
                return (
                  <tr key={batch.id}>
                    <td className="font-mono text-sm font-semibold text-gray-600 whitespace-nowrap">
                      {format(parseISO(batch.placed_at), 'hh:mm a')}
                    </td>
                    <td>
                      {batch.is_counter ? (
                        <div>
                          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Counter</p>
                          <p className="font-bold text-gray-800">{batch.order_number}</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Table</p>
                          <p className="font-black text-gray-800 text-xl leading-none">T{batch.table_number}</p>
                          {batch.added_by === 'BILLER' && <p className="text-xs text-gray-400 mt-0.5">Staff added</p>}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full
                        ${batch.order_type === 'PARCEL'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-green-100 text-green-700'}`}>
                        {batch.order_type === 'PARCEL' ? 'Parcel' : 'Dine In'}
                      </span>
                    </td>
                    <td className="max-w-xs">
                      <div className="space-y-1">
                        {active.map(i => (
                          <div key={i.id} className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {i.quantity}
                            </span>
                            <span className="text-sm text-gray-700 font-medium">{i.food_item_name}</span>
                          </div>
                        ))}
                        {cancelled.map(i => (
                          <div key={i.id} className="flex items-center gap-2 opacity-40">
                            <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {i.quantity}
                            </span>
                            <span className="text-sm text-gray-400 line-through">{i.food_item_name}</span>
                          </div>
                        ))}
                        {batch.notes && (
                          <p className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg mt-1 italic">
                            {batch.notes}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
                          <CheckCheck size={13} /> Served
                        </span>
                        <BatchDuration placedAt={batch.placed_at} servedAt={batch.served_at} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KitchenPage() {
  const [tab, setTab] = useState('active')
  const qc            = useQueryClient()
  const [cancelTarget, setCancelTarget] = useState(null)
  const [reduceTarget, setReduceTarget] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey:        ['kitchen-batches'],
    queryFn:         () => tablesAPI.kitchen.batches().then(r => r.data),
    refetchInterval: 10_000,
  })

  const advance = useMutation({
    mutationFn: ({ id, nextStatus }) => tablesAPI.kitchen.updateStatus(id, nextStatus),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['kitchen-batches'] })
      qc.invalidateQueries({ queryKey: ['kitchen-served'] })
    },
    onError: () => toast.error('Failed to update status'),
  })

  const cancelMutation = useMutation({
    mutationFn: ({ itemId, pin, restoreStock }) => tablesAPI.kitchen.cancelItem(itemId, pin, restoreStock),
    onSuccess: () => {
      toast.success('Item cancelled.')
      setCancelTarget(null)
      qc.invalidateQueries({ queryKey: ['kitchen-batches'] })
      qc.invalidateQueries({ queryKey: ['kitchen-served'] })
    },
    onError: err => toast.error(err?.response?.data?.error || 'Failed to cancel item.'),
  })

  const reduceMutation = useMutation({
    mutationFn: ({ itemId, newQty, pin, restoreStock }) => tablesAPI.kitchen.reduceItem(itemId, newQty, pin, restoreStock),
    onSuccess: () => {
      toast.success('Quantity reduced.')
      setReduceTarget(null)
      qc.invalidateQueries({ queryKey: ['kitchen-batches'] })
      qc.invalidateQueries({ queryKey: ['kitchen-served'] })
    },
    onError: err => toast.error(err?.response?.data?.error || 'Failed to reduce quantity.'),
  })

  const batches        = data?.batches        || []
  const pendingCount   = data?.pending_count  ?? 0
  const preparingCount = data?.preparing_count ?? 0
  const totalActive    = pendingCount + preparingCount

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">Kitchen Display</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live orders · auto-refreshes every 10 seconds</p>
        </div>
        {totalActive > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-600 font-bold text-sm">{totalActive} active order{totalActive !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { id: 'active', label: 'Active Orders', icon: <Flame size={14} />, count: totalActive },
          { id: 'served', label: 'Served Orders', icon: <ClipboardCheck size={14} /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all
              ${tab === t.id ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon}
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full
                ${tab === t.id ? 'bg-primary-100 text-primary-600' : 'bg-gray-200 text-gray-600'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'active'
        ? <ActiveOrders
            batches={batches}
            pendingCount={pendingCount}
            preparingCount={preparingCount}
            advance={advance}
            onCancelItem={setCancelTarget}
            onReduceItem={setReduceTarget}
          />
        : <ServedOrders />
      }

      <CancelItemModal
        item={cancelTarget}
        loading={cancelMutation.isPending}
        onClose={() => setCancelTarget(null)}
        onConfirm={(pin, restore) => cancelMutation.mutate({ itemId: cancelTarget.id, pin, restoreStock: restore })}
      />
      <ReduceModal
        item={reduceTarget}
        loading={reduceMutation.isPending}
        onClose={() => setReduceTarget(null)}
        onConfirm={(qty, pin, restore) => reduceMutation.mutate({ itemId: reduceTarget.id, newQty: qty, pin, restoreStock: restore })}
      />
    </div>
  )
}
