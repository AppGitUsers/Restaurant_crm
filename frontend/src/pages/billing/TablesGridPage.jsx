import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { tablesAPI } from '@/api'
import { PageLoader } from '@/components/ui'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { Users, Clock, RefreshCw, AlertCircle, Unlock, Lock } from 'lucide-react'

export default function TablesGridPage() {
  const navigate  = useNavigate()
  const qc        = useQueryClient()

  const { data: tables = [], isLoading, refetch, isFetching } = useQuery({
    queryKey:        ['tables-grid'],
    queryFn:         () => tablesAPI.list().then(r => r.data),
    refetchInterval: 15_000,
  })

  const openMutation = useMutation({
    mutationFn: (id) => tablesAPI.openTable(id),
    onSuccess:  ()  => qc.invalidateQueries(['tables-grid']),
  })

  if (isLoading) return <PageLoader />

  const occupied = tables.filter(t => t.active_session).length
  const waiting  = tables.filter(t => !t.active_session && t.is_accepting_orders && !(t.pending_sessions?.length)).length
  const empty    = tables.filter(t => !t.active_session && !t.is_accepting_orders && !(t.pending_sessions?.length)).length
  const pending  = tables.reduce((sum, t) => sum + (t.pending_sessions?.length || 0), 0)

  // Flatten all pending sessions across all tables into individual cards
  const pendingCards = tables.flatMap(t =>
    (t.pending_sessions || []).map(s => ({ ...s, table_number: t.number }))
  )

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">

      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-lg px-3 py-1.5">
            <span className="text-primary-600 font-bold">{occupied}</span>
            <span className="text-primary-500 text-sm">Occupied</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <span className="text-gray-600 font-bold">{empty}</span>
            <span className="text-gray-500 text-sm">Available</span>
          </div>
          {waiting > 0 && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
              <span className="text-green-600 font-bold">{waiting}</span>
              <span className="text-green-500 text-sm">Ready</span>
            </div>
          )}
          {pending > 0 && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
              <span className="text-orange-600 font-bold">{pending}</span>
              <span className="text-orange-500 text-sm">Pending Bill</span>
            </div>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Pending Bills — sessions manually ended, not yet billed */}
      {pendingCards.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={15} className="text-orange-500" />
            <h3 className="text-sm font-bold text-gray-700">Pending Bills</h3>
            <span className="text-xs text-gray-400">— sessions ended but not yet billed</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {pendingCards.map(s => {
              const elapsed = formatDistanceToNow(parseISO(s.closed_at), { addSuffix: true })
              return (
                <div
                  key={s.id}
                  onClick={() => navigate(`/billing/tables/${s.id}`)}
                  className="rounded-xl border-2 border-orange-300 bg-orange-50 hover:bg-orange-100
                             p-3 cursor-pointer transition-colors active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl font-extrabold text-orange-700">T{s.table_number}</span>
                    <span className="text-xs bg-orange-200 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                      Ended
                    </span>
                  </div>
                  <p className="text-sm font-bold text-orange-700">
                    ₹{parseFloat(s.subtotal).toLocaleString()}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-orange-500">
                    <span className="flex items-center gap-0.5"><Users size={10} /> {s.item_count} items</span>
                    <span className="flex items-center gap-0.5"><Clock size={10} /> {elapsed}</span>
                  </div>
                  <button
                    className="mt-2 w-full text-xs font-bold bg-orange-500 text-white rounded-lg py-1.5
                               hover:bg-orange-600 transition-colors"
                    onClick={e => { e.stopPropagation(); navigate(`/billing/tables/${s.id}`) }}
                  >
                    View &amp; Bill
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Active table grid */}
      <div>
        {pendingCards.length > 0 && (
          <h3 className="text-sm font-bold text-gray-700 mb-3">Active Tables</h3>
        )}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {tables.map(table => {
            const session    = table.active_session
            const isOccupied = !!session

            if (!isOccupied) {
              const isReady   = table.is_accepting_orders
              const toggling  = openMutation.isPending

              if (isReady) {
                // Table opened by biller — waiting for first customer order
                return (
                  <div
                    key={table.id}
                    className="aspect-square rounded-xl border-2 border-green-400 bg-green-50
                               flex flex-col items-center justify-center gap-1"
                  >
                    <span className="text-2xl font-extrabold text-green-600">{table.number}</span>
                    <span className="text-xs font-semibold text-green-500">Open</span>
                    <button
                      onClick={() => openMutation.mutate(table.id)}
                      disabled={toggling}
                      className="mt-1 text-[10px] text-green-600 underline hover:text-green-800"
                    >
                      {toggling ? '…' : 'Close'}
                    </button>
                  </div>
                )
              }

              // Table is closed — show Open button
              return (
                <div
                  key={table.id}
                  className="aspect-square rounded-xl border-2 border-gray-200 bg-white
                             flex flex-col items-center justify-center gap-1"
                >
                  <span className="text-2xl font-extrabold text-gray-300">{table.number}</span>
                  <button
                    onClick={() => openMutation.mutate(table.id)}
                    disabled={toggling}
                    className="flex items-center gap-0.5 text-[10px] font-bold text-primary-600
                               bg-primary-50 border border-primary-200 rounded-md px-2 py-1
                               hover:bg-primary-100 transition-colors disabled:opacity-50"
                  >
                    <Unlock size={9} />
                    {toggling ? '…' : 'Open'}
                  </button>
                </div>
              )
            }

            const elapsed = formatDistanceToNow(parseISO(session.opened_at), { addSuffix: false })

            return (
              <div
                key={table.id}
                onClick={() => navigate(`/billing/tables/${session.id}`)}
                className="aspect-square rounded-xl border-2 border-primary-400 bg-primary-50 hover:bg-primary-100
                           flex flex-col items-center justify-center gap-0.5 cursor-pointer
                           transition-colors active:scale-95"
              >
                <span className="text-2xl font-extrabold text-primary-700">{table.number}</span>
                <span className="text-xs font-semibold text-primary-600">
                  ₹{parseFloat(session.subtotal).toLocaleString()}
                </span>
                <span className="text-xs text-primary-400 flex items-center gap-0.5">
                  <Clock size={10} /> {elapsed}
                </span>
                <span className="text-xs text-primary-400 flex items-center gap-0.5">
                  <Users size={10} /> {session.item_count} items
                </span>
              </div>
            )
          })}

          {tables.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-400 text-sm">
              No tables configured. Add tables in Admin → Settings.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
