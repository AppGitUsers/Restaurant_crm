import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tablesAPI } from '@/api'
import { parseISO, format } from 'date-fns'
import {
  ChefHat, CheckCheck, Loader2, UtensilsCrossed,
  Timer, Sparkles, Wand2, ClipboardCheck, Flame,
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

// ── Single item row ───────────────────────────────────────────────────────────
function KitchenItem({ item, statusText, dimmed = false }) {
  const isCustom               = item.food_item === null
  const { components, addons } = parseNotes(item.notes)

  return (
    <div className={`rounded-xl p-3 space-y-2 ${
      isCustom
        ? 'bg-amber-900/30 border border-amber-600/40'
        : dimmed ? 'bg-gray-800/60' : 'bg-gray-800'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {isCustom && <Wand2 size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />}
          <span className={`font-bold text-lg leading-tight ${
            isCustom ? 'text-amber-200' : dimmed ? 'text-gray-300' : 'text-white'
          }`}>
            {item.food_item_name}
          </span>
        </div>
        <span className={`font-extrabold text-2xl flex-shrink-0 ${dimmed ? 'text-gray-500' : statusText}`}>
          ×{item.quantity}
        </span>
      </div>

      {isCustom && components && components.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {components.map((c, i) => (
            <span key={i}
              className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">
              {c}
            </span>
          ))}
        </div>
      )}

      {addons && addons.length > 0 && (
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
function ActiveOrders({ batches, pendingCount, preparingCount, advance }) {
  if (batches.length === 0) {
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
          const meta       = STATUS_META[batch.status]
          const isPending  = batch.status === 'PENDING'
          const isWorking  = advance.isPending && advance.variables?.id === batch.id
          const nextStatus = isPending ? 'PREPARING' : 'SERVED'

          return (
            <div key={batch.id}
              className={`rounded-2xl bg-gray-900 border-2 ${meta.border} flex flex-col overflow-hidden`}>

              <div className={`${meta.bg} px-4 py-2.5 flex items-center justify-between gap-3`}>
                <div className="flex items-center gap-2">
                  <span className="text-white font-extrabold text-2xl">T{batch.table_number}</span>
                  {batch.added_by === 'BILLER' && (
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
                  <KitchenItem key={item.id} item={item} statusText={meta.text} />
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

// ── Served orders tab ─────────────────────────────────────────────────────────
function ServedOrders() {
  const { data, isLoading } = useQuery({
    queryKey:        ['kitchen-served'],
    queryFn:         () => tablesAPI.kitchen.servedBatches().then(r => r.data),
    refetchInterval: 30_000,
  })

  const batches = data?.batches || []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500">
        <Loader2 size={24} className="animate-spin" />
      </div>
    )
  }

  if (batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-600">
        <ClipboardCheck size={48} />
        <p className="text-lg font-semibold">No served orders yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-xs">Showing last {batches.length} served orders (newest first)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {batches.map(batch => (
          <div key={batch.id}
            className="rounded-2xl bg-gray-900 border-2 border-green-800 flex flex-col overflow-hidden opacity-80">

            <div className="bg-green-800 px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-white font-extrabold text-2xl">T{batch.table_number}</span>
                {batch.added_by === 'BILLER' && (
                  <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">Biller</span>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-200">
                  <CheckCheck size={12} /> Served
                </span>
                <span className="text-green-300/70 text-xs font-mono">
                  {format(parseISO(batch.placed_at), 'dd MMM · HH:mm')}
                </span>
              </div>
            </div>

            <div className="flex-1 px-4 py-3 space-y-2">
              {batch.items.map(item => (
                <KitchenItem key={item.id} item={item} statusText="text-gray-500" dimmed />
              ))}
              {batch.notes && (
                <p className="text-gray-500 text-xs border-t border-gray-800 pt-2 italic">
                  Note: {batch.notes}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KitchenPage() {
  const [tab, setTab] = useState('active')
  const qc = useQueryClient()

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
          />
        : <ServedOrders />
      }
    </div>
  )
}
