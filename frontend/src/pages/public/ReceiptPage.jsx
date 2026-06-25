import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { tablesAPI } from '@/api'
import { UtensilsCrossed, CheckCircle, Loader2, AlertCircle } from 'lucide-react'

const fmt = iso =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })

export default function ReceiptPage() {
  const { token } = useParams()

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['public-receipt', token],
    queryFn:  () => tablesAPI.public.receipt(token).then(r => r.data),
    retry:    1,
    staleTime: Infinity,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary-500" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-semibold">Receipt not found</p>
          <p className="text-gray-400 text-sm mt-1">This link may be invalid or the order has not been paid yet.</p>
        </div>
      </div>
    )
  }

  const subtotal    = parseFloat(order.subtotal)
  const discount    = parseFloat(order.discount)
  const taxAmount   = parseFloat(order.tax_amount)
  const totalAmount = parseFloat(order.total_amount)

  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center py-8 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">

        {/* Header */}
        <div className="bg-primary-600 px-6 py-6 text-white text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <UtensilsCrossed size={22} className="text-white" />
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight">{order.restaurant_name}</h1>
          <p className="text-primary-200 text-sm mt-0.5">Bill Receipt</p>
        </div>

        {/* Order meta */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-base font-bold text-gray-800">{order.order_number}</p>
              <p className="text-xs text-gray-400 mt-0.5">{fmt(order.created_at)}</p>
              {order.table_number && (
                <p className="text-xs text-gray-400 mt-0.5">Table {order.table_number}</p>
              )}
            </div>
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-semibold flex-shrink-0">
              <CheckCircle size={12} /> Paid
            </span>
          </div>
          {(order.customer_name || order.customer_phone) && (
            <p className="text-sm text-gray-600 mt-3">
              {order.customer_name}
              {order.customer_name && order.customer_phone && <span className="text-gray-300"> · </span>}
              {order.customer_phone}
            </p>
          )}
        </div>

        {/* Items */}
        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Items</p>
          <div className="space-y-2.5">
            {order.items.map((item, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700 flex-1 mr-2">
                    {item.food_item_name}
                    {item.quantity > 1 && (
                      <span className="text-gray-400 ml-1">×{item.quantity}</span>
                    )}
                  </span>
                  <span className="font-medium text-gray-800 flex-shrink-0">
                    ₹{parseFloat(item.line_total).toFixed(2)}
                  </span>
                </div>
                {item.notes && (
                  <p className="text-xs text-gray-400 mt-0.5 ml-1 italic">{item.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="mx-6 mb-4 bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-100">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount</span>
              <span>−₹{discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm text-gray-600">
            <span>Tax ({order.tax_percent}%)</span>
            <span>₹{taxAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200">
            <span>Total</span>
            <span className="text-primary-600">₹{totalAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400 pt-1">
            <span>Payment</span>
            <span className="font-medium">{order.payment_method}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 text-center">
          <p className="text-sm text-gray-500 font-medium">Thank you for visiting us! 🙏</p>
          <p className="text-xs text-gray-300 mt-1.5">Powered by Restaurant CRM</p>
        </div>

      </div>
    </div>
  )
}
