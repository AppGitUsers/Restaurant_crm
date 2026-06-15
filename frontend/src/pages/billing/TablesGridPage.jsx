import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { tablesAPI } from '@/api'
import { PageLoader } from '@/components/ui'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { Users, Clock, RefreshCw } from 'lucide-react'

export default function TablesGridPage() {
  const navigate = useNavigate()

  const { data: tables = [], isLoading, refetch, isFetching } = useQuery({
    queryKey:        ['tables-grid'],
    queryFn:         () => tablesAPI.list().then(r => r.data),
    refetchInterval: 15_000,
  })

  if (isLoading) return <PageLoader />

  const occupied = tables.filter(t => t.active_session).length
  const empty    = tables.length - occupied

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className="flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-lg px-3 py-1.5">
            <span className="text-primary-600 font-bold">{occupied}</span>
            <span className="text-primary-500 text-sm">Occupied</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <span className="text-gray-600 font-bold">{empty}</span>
            <span className="text-gray-500 text-sm">Available</span>
          </div>
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

      {/* Table grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {tables.map(table => {
          const session = table.active_session
          const isOccupied = !!session

          if (!isOccupied) {
            return (
              <div
                key={table.id}
                className="aspect-square rounded-xl border-2 border-gray-200 bg-white flex flex-col items-center justify-center gap-1 cursor-default"
              >
                <span className="text-2xl font-extrabold text-gray-300">{table.number}</span>
                <span className="text-xs text-gray-300">Free</span>
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
  )
}
