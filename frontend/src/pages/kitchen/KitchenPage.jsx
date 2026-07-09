import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tablesAPI } from '@/api'
import { parseISO, format } from 'date-fns'
import {
  ChefHat, CheckCheck, Loader2, UtensilsCrossed,
  Timer, Sparkles, Wand2, ClipboardCheck, Flame,
  X, Minus, Trash2, Lock,
} from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_META = {
  PENDING:   { label: 'New Order', bg: 'bg-amber-500', border: 'border-amber-400', text: 'text-amber-300' },
  PREPARING: { label: 'Preparing', bg: 'bg-blue-600',  border: 'border-blue-400',  text: 'text-blue-300'  },
}

// ── Live elapsed timer ────────────────────────────────────────────────────────
function LiveTimer({ placedAt }) {
  const start = parseISO(placedAt).getTime()
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - start) / 1000))

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
  }, [start])

  const mins    = Math.floor(elapsed / 60)
  const secs    = elapsed % 60
  const overdue = elapsed >= 180

  return (
    <span className={`inline-flex items-center gap-1 font-mono font-bold text-sm px-2.5 py-1 rounded-lg
      ${overdue ? 'bg-red-500/25 text-red-400 animate-pulse' : 'bg-green-500/20 text-green-400'}`}>
      <Timer size={13} />
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  )
}

// ── Parse add-ons / components out of the notes string ───────────────────────
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
  if (addonMatch) {
    addons = addonMatch[1].split(',').map(s => s.trim()).filter(Boolean)
  }

  return { components, addons }
}

// ── Cancel item modal (with restore-stock toggle + PIN) ───────────────────────
function CancelItemModal({ item, onConfirm, onClose, loading }) {
  const [pin,          setPin]          = useState('')
  const [restoreStock, setRestoreStock] = useState(false)
  const inputRef                        = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = () => { if (!loading) onConfirm(pin, restoreStock) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 size={16} className="text-red-400" />
            <h3 className="font-bold text-white text-lg">Cancel Item</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <p className="text-gray-400 text-sm">
          Cancelling <span className="text-white font-semibold">{item.food_item_name}</span> ×{item.quantity}.
          The customer will be notified.
        </p>

        {/* Restore stock toggle */}
        <button
          onClick={() => setRestoreStock(s => !s)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors
            ${restoreStock
              ? 'bg-green-900/40 border-green-700 text-green-300'
              : 'bg-gray-800 border-gray-700 text-gray-400'}`}
        >
          <span className="text-sm font-medium">Restore stock to inventory?</span>
          <div className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0
            ${restoreStock ? 'bg-green-500' : 'bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all
              ${restoreStock ? 'left-5' : 'left-0.5'}`} />
          </div>
        </button>
        <p className="text-xs text-gray-600 -mt-2">
          {restoreStock
            ? 'Stock will be added back — use this if the item was never started.'
            : 'Stock stays deducted — use this if ingredients were already used or wasted.'}
        </p>

        {/* PIN */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Staff PIN</label>
          <input
            ref={inputRef}
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Enter PIN to confirm"
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-white
                       placeholder-gray-600 focus:outline-none focus:border-red-500 text-center
                       tracking-widest text-lg font-mono"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white
                       hover:border-gray-500 transition-colors font-semibold">
            Back
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold
                       transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Cancel Item'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reduce-quantity picker modal ──────────────────────────────────────────────
function ReduceModal({ item, onConfirm, onClose, loading }) {
  const [pin,          setPin]          = useState('')
  const [newQty,       setNewQty]       = useState(item.quantity - 1)
  const [restoreStock, setRestoreStock] = useState(false)
  const inputRef                        = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Minus size={16} className="text-amber-400" />
            <h3 className="font-bold text-white text-lg">Reduce Quantity</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <p className="text-gray-400 text-sm">
          <span className="text-white font-semibold">{item.food_item_name}</span> — currently ×{item.quantity}
        </p>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Serve how many?</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setNewQty(q => Math.max(1, q - 1))}
              className="w-10 h-10 rounded-xl bg-gray-800 border border-gray-700 text-white
                         flex items-center justify-center hover:bg-gray-700"
            >
              <Minus size={16} />
            </button>
            <span className="text-white font-extrabold text-3xl flex-1 text-center">{newQty}</span>
            <button
              onClick={() => setNewQty(q => Math.min(item.quantity - 1, q + 1))}
              className="w-10 h-10 rounded-xl bg-gray-800 border border-gray-700 text-white
                         flex items-center justify-center hover:bg-gray-700"
            >
              <span className="text-xl font-bold">+</span>
            </button>
          </div>
          <p className="text-xs text-gray-600 text-center mt-1">
            {item.quantity - newQty} will be cancelled
          </p>
        </div>

        {/* Restore stock toggle */}
        <button
          onClick={() => setRestoreStock(s => !s)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors
            ${restoreStock
              ? 'bg-green-900/40 border-green-700 text-green-300'
              : 'bg-gray-800 border-gray-700 text-gray-400'}`}
        >
          <span className="text-sm font-medium">Restore reduced stock?</span>
          <div className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0
            ${restoreStock ? 'bg-green-500' : 'bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all
              ${restoreStock ? 'left-5' : 'left-0.5'}`} />
          </div>
        </button>
        <p className="text-xs text-gray-600 -mt-2">
          {restoreStock
            ? 'Stock will be added back for the cancelled portion.'
            : 'Stock stays deducted — ingredients already used or wasted.'}
        </p>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Staff PIN</label>
          <input
            ref={inputRef}
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onConfirm(newQty, pin, restoreStock)}
            placeholder="Enter PIN"
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2 text-white
                       placeholder-gray-600 focus:outline-none focus:border-amber-500 text-center
                       tracking-widest font-mono"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white
                       hover:border-gray-500 transition-colors font-semibold">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(newQty, pin, restoreStock)}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold
                       transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Reduce'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Single item row ───────────────────────────────────────────────────────────
function KitchenItem({ item, statusText, dimmed = false, onCancel, onReduce }) {
  const isCustom               = item.food_item === null
  const isCancelled            = item.cancelled_by_kitchen
  const { components, addons } = parseNotes(item.notes)

  return (
    <div className={`rounded-xl p-3 space-y-2 relative ${
      isCancelled
        ? 'bg-gray-800/30 border border-gray-700/40 opacity-50'
        : isCustom
          ? 'bg-amber-900/30 border border-amber-600/40'
          : dimmed ? 'bg-gray-800/60' : 'bg-gray-800'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {isCustom && !isCancelled && <Wand2 size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />}
          <span className={`font-bold text-lg leading-tight ${
            isCancelled ? 'line-through text-gray-600'
            : isCustom  ? 'text-amber-200'
            : dimmed    ? 'text-gray-300'
            :             'text-white'
          }`}>
            {item.food_item_name}
          </span>
          {isCancelled && (
            <span className="text-xs bg-red-900/50 text-red-400 border border-red-800/50 px-2 py-0.5 rounded-full">
              Cancelled
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`font-extrabold text-2xl ${
            isCancelled ? 'text-gray-600 line-through' : dimmed ? 'text-gray-500' : statusText
          }`}>
            ×{item.quantity}
          </span>

          {/* Action buttons — only for non-cancelled items on kitchen side */}
          {!isCancelled && !dimmed && onCancel && (
            <>
              {item.quantity > 1 && (
                <button
                  onClick={() => onReduce(item)}
                  title="Reduce quantity"
                  className="w-7 h-7 rounded-lg bg-amber-900/60 border border-amber-700/50 text-amber-400
                             flex items-center justify-center hover:bg-amber-800/60 transition-colors"
                >
                  <Minus size={13} />
                </button>
              )}
              <button
                onClick={() => onCancel(item)}
                title="Cancel item"
                className="w-7 h-7 rounded-lg bg-red-900/60 border border-red-700/50 text-red-400
                           flex items-center justify-center hover:bg-red-800/60 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {!isCancelled && isCustom && components && components.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {components.map((c, i) => (
            <span key={i}
              className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
              {c}
            </span>
          ))}
        </div>
      )}

      {!isCancelled && addons && addons.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-xs text-gray-500 mr-0.5">Add-ons:</span>
          {addons.map((a, i) => (
            <span key={i}
              className="inline-flex items-center gap-0.5 text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-medium">
              <Sparkles size={9} />{a}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Active orders tab ─────────────────────────────────────────────────────────
function ActiveOrders({ batches, pendingCount, preparingCount, advance, onCancelItem, onReduceItem }) {
  const activeBatches = batches.filter(b =>
    b.items.some(i => !i.cancelled_by_kitchen)
  )

  if (activeBatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-600">
        <UtensilsCrossed size={56} />
        <p className="text-xl font-semibold">All caught up!</p>
        <p className="text-sm">No pending orders right now</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-amber-500/20 border border-amber-500/40 rounded-xl px-4 py-2">
          <span className="text-amber-300 font-bold text-2xl">{pendingCount}</span>
          <span className="text-amber-400 text-sm font-medium">New</span>
        </div>
        <div className="flex items-center gap-2 bg-blue-500/20 border border-blue-500/40 rounded-xl px-4 py-2">
          <span className="text-blue-300 font-bold text-2xl">{preparingCount}</span>
          <span className="text-blue-400 text-sm font-medium">Preparing</span>
        </div>
        <p className="text-gray-500 text-xs ml-auto">Auto-refreshes every 10s</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {batches.map(batch => {
          const meta        = STATUS_META[batch.status]
          const isPending   = batch.status === 'PENDING'
          const isWorking   = advance.isPending && advance.variables?.id === batch.id
          const nextStatus  = isPending ? 'PREPARING' : 'SERVED'
          const activeItems = batch.items.filter(i => !i.cancelled_by_kitchen)
          if (activeItems.length === 0) return null

          return (
            <div key={batch.id}
              className={`rounded-2xl bg-gray-900 border-2 ${meta.border} flex flex-col overflow-hidden`}>

              <div className={`${meta.bg} px-4 py-2.5 flex items-center justify-between gap-3`}>
                <div className="flex items-center gap-2">
                  {batch.is_counter ? (
                    <div className="flex flex-col leading-tight">
                      <span className="text-white/60 text-[10px] font-semibold uppercase tracking-wide">Counter</span>
                      <span className="text-white font-extrabold text-lg">{batch.order_number}</span>
                    </div>
                  ) : (
                    <span className="text-white font-extrabold text-2xl">T{batch.table_number}</span>
                  )}
                  {batch.added_by === 'BILLER' && !batch.is_counter && (
                    <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">Biller</span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-white/90 text-xs font-semibold">{meta.label}</p>
                  <p className="text-white/70 text-xs font-mono">{format(parseISO(batch.placed_at), 'dd MMM · HH:mm')}</p>
                  <LiveTimer placedAt={batch.placed_at} />
                </div>
              </div>

              <div className="flex-1 px-4 py-3 space-y-2">
                {batch.items.map(item => (
                  <KitchenItem
                    key={item.id}
                    item={item}
                    statusText={meta.text}
                    onCancel={onCancelItem}
                    onReduce={onReduceItem}
                  />
                ))}
                {batch.notes && (
                  <p className="text-gray-400 text-xs border-t border-gray-800 pt-2 italic">
                    Note: {batch.notes}
                  </p>
                )}
              </div>

              <div className="px-4 pb-4">
                <button
                  onClick={() => advance.mutate({ id: batch.id, nextStatus })}
                  disabled={isWorking}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white
                    transition-opacity disabled:opacity-50
                    ${isPending ? 'bg-blue-600 hover:bg-blue-500' : 'bg-green-600 hover:bg-green-500'}`}
                >
                  {isWorking
                    ? <Loader2 size={18} className="animate-spin" />
                    : isPending
                      ? <><ChefHat size={18} /> Start Preparing</>
                      : <><CheckCheck size={18} /> Mark as Served</>
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

function BatchDuration({ placedAt, servedAt }) {
  if (!servedAt) return null
  const mins = Math.round((new Date(servedAt) - new Date(placedAt)) / 60000)
  const label = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
  const color = mins <= 15 ? 'text-green-400' : mins <= 30 ? 'text-yellow-400' : 'text-red-400'
  return <span className={`text-xs font-mono font-semibold ${color}`}>{label}</span>
}

// ── Served orders tab ─────────────────────────────────────────────────────────
function ServedOrders({ onCancelItem }) {
  const today     = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')

  const [selectedDate, setSelectedDate] = useState(today)
  const [customDate,   setCustomDate]   = useState('')

  const { data, isLoading } = useQuery({
    queryKey:        ['kitchen-served', selectedDate],
    queryFn:         () => tablesAPI.kitchen.servedBatches(selectedDate).then(r => r.data),
    refetchInterval: 30_000,
  })

  const batches       = data?.batches || []
  const cancelledCount = batches.reduce((n, b) => n + b.items.filter(i => i.cancelled_by_kitchen).length, 0)

  const pickDate = (d) => { setSelectedDate(d); setCustomDate('') }

  return (
    <div className="space-y-4">

      {/* Date filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => pickDate(today)}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors
            ${selectedDate === today ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          Today
        </button>
        <button
          onClick={() => pickDate(yesterday)}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors
            ${selectedDate === yesterday ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          Yesterday
        </button>
        <input
          type="date"
          value={customDate}
          max={today}
          onChange={e => { setCustomDate(e.target.value); setSelectedDate(e.target.value) }}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5
                     focus:outline-none focus:border-green-600 cursor-pointer"
        />
        {batches.length > 0 && (
          <span className="ml-auto text-gray-500 text-xs">
            {batches.length} order{batches.length !== 1 ? 's' : ''}
            {cancelledCount > 0 && ` · ${cancelledCount} item${cancelledCount !== 1 ? 's' : ''} cancelled`}
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : batches.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-600">
          <ClipboardCheck size={48} />
          <p className="text-lg font-semibold">No served orders</p>
          <p className="text-sm text-gray-700">
            {selectedDate === today ? 'Nothing served today yet.' : `No orders on ${format(new Date(selectedDate + 'T00:00:00'), 'dd MMM yyyy')}.`}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border border-gray-800">
          {batches.map((batch, idx) => {
            const activeItems    = batch.items.filter(i => !i.cancelled_by_kitchen)
            const cancelledItems = batch.items.filter(i => i.cancelled_by_kitchen)
            return (
              <div
                key={batch.id}
                className={`flex items-start gap-4 px-4 py-3 ${idx !== batches.length - 1 ? 'border-b border-gray-800' : ''} hover:bg-gray-900/50 transition-colors`}
              >
                {/* Time */}
                <span className="text-gray-300 text-sm font-mono font-semibold w-12 flex-shrink-0 pt-0.5">
                  {format(parseISO(batch.placed_at), 'HH:mm')}
                </span>

                {/* Table + source */}
                <div className="flex flex-col gap-0.5 w-20 flex-shrink-0">
                  {batch.is_counter ? (
                    <>
                      <span className="text-amber-400 font-bold text-xs">Counter</span>
                      <span className="text-white font-bold text-sm">{batch.order_number}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-white font-bold text-sm">T{batch.table_number}</span>
                      {batch.added_by === 'BILLER' && (
                        <span className="text-xs text-gray-500">Biller</span>
                      )}
                    </>
                  )}
                </div>

                {/* Items */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  {activeItems.map(i => (
                    <div key={i.id} className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="text-yellow-400 font-bold text-xs w-6 text-right flex-shrink-0">×{i.quantity}</span>
                      <span>{i.food_item_name}</span>
                    </div>
                  ))}
                  {cancelledItems.map(i => (
                    <div key={i.id} className="flex items-center gap-2 text-xs text-red-400 line-through opacity-70">
                      <span className="font-bold w-6 text-right flex-shrink-0">×{i.quantity}</span>
                      <span>{i.food_item_name}</span>
                    </div>
                  ))}
                  {batch.notes && (
                    <p className="text-gray-600 text-xs mt-1 italic">{batch.notes}</p>
                  )}
                </div>

                {/* Served + duration */}
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0 pt-0.5">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-500">
                    <CheckCheck size={13} /> Served
                  </span>
                  <BatchDuration placedAt={batch.placed_at} servedAt={batch.served_at} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KitchenPage() {
  const [tab, setTab] = useState('active')
  const qc            = useQueryClient()

  // PIN / reduce modal state
  const [cancelTarget, setCancelTarget] = useState(null) // item to cancel
  const [reduceTarget, setReduceTarget] = useState(null) // item to reduce

  const { data, isLoading } = useQuery({
    queryKey:        ['kitchen-batches'],
    queryFn:         () => tablesAPI.kitchen.batches().then(r => r.data),
    refetchInterval: 10_000,
  })

  const advance = useMutation({
    mutationFn: ({ id, nextStatus }) => tablesAPI.kitchen.updateStatus(id, nextStatus),
    onSuccess:  () => {
      qc.invalidateQueries(['kitchen-batches'])
      qc.invalidateQueries(['kitchen-served'])
    },
    onError: () => toast.error('Failed to update status'),
  })

  const cancelMutation = useMutation({
    mutationFn: ({ itemId, pin, restoreStock }) => tablesAPI.kitchen.cancelItem(itemId, pin, restoreStock),
    onSuccess: () => {
      toast.success('Item cancelled and customer notified.')
      setCancelTarget(null)
      qc.invalidateQueries(['kitchen-batches'])
      qc.invalidateQueries(['kitchen-served'])
    },
    onError: (err) => {
      const msg = err?.response?.data?.error || 'Failed to cancel item.'
      toast.error(msg)
    },
  })

  const reduceMutation = useMutation({
    mutationFn: ({ itemId, newQty, pin, restoreStock }) => tablesAPI.kitchen.reduceItem(itemId, newQty, pin, restoreStock),
    onSuccess: () => {
      toast.success('Quantity reduced and customer notified.')
      setReduceTarget(null)
      qc.invalidateQueries(['kitchen-batches'])
      qc.invalidateQueries(['kitchen-served'])
    },
    onError: (err) => {
      const msg = err?.response?.data?.error || 'Failed to reduce quantity.'
      toast.error(msg)
    },
  })

  const batches        = data?.batches        || []
  const pendingCount   = data?.pending_count  ?? 0
  const preparingCount = data?.preparing_count ?? 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <Loader2 size={32} className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('active')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors
            ${tab === 'active'
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
              : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          <Flame size={15} />
          Active Orders
          {(pendingCount + preparingCount) > 0 && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full
              ${tab === 'active' ? 'bg-white/20 text-white' : 'bg-amber-500/30 text-amber-400'}`}>
              {pendingCount + preparingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('served')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors
            ${tab === 'served'
              ? 'bg-green-700 text-white shadow-lg shadow-green-700/30'
              : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          <ClipboardCheck size={15} />
          Finished Orders
        </button>
      </div>

      {/* Tab content */}
      {tab === 'active'
        ? <ActiveOrders
            batches={batches}
            pendingCount={pendingCount}
            preparingCount={preparingCount}
            advance={advance}
            onCancelItem={setCancelTarget}
            onReduceItem={setReduceTarget}
          />
        : <ServedOrders onCancelItem={setCancelTarget} />
      }

      {/* Cancel item modal */}
      {cancelTarget && (
        <CancelItemModal
          item={cancelTarget}
          loading={cancelMutation.isPending}
          onClose={() => setCancelTarget(null)}
          onConfirm={(pin, restoreStock) => cancelMutation.mutate({ itemId: cancelTarget.id, pin, restoreStock })}
        />
      )}

      {/* Reduce quantity modal */}
      {reduceTarget && (
        <ReduceModal
          item={reduceTarget}
          loading={reduceMutation.isPending}
          onClose={() => setReduceTarget(null)}
          onConfirm={(newQty, pin, restoreStock) => reduceMutation.mutate({ itemId: reduceTarget.id, newQty, pin, restoreStock })}
        />
      )}
    </div>
  )
}
