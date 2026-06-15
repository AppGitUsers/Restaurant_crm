import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, UtensilsCrossed, Package, Receipt,
  TrendingUp, Users, UserCog, ChevronRight, Settings, X, TableProperties,
} from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { to: '/dashboard',     icon: LayoutDashboard,  label: 'Dashboard'  },
  { to: '/menu',          icon: UtensilsCrossed,  label: 'Menu'        },
  { to: '/inventory',     icon: Package,          label: 'Inventory'  },
  { to: '/billing-admin', icon: Receipt,          label: 'Billing'    },
  { to: '/tables-admin',  icon: TableProperties,  label: 'Tables'     },
  { to: '/finance',       icon: TrendingUp,       label: 'Finance'    },
  { to: '/staff',         icon: UserCog,          label: 'Staff'      },
  { to: '/customers',     icon: Users,            label: 'Customers'  },
  { to: '/settings',      icon: Settings,         label: 'Settings'   },
]

export default function Sidebar({ open, onClose }) {
  return (
    <aside className={clsx(
      'fixed inset-y-0 left-0 z-40 w-56 flex-shrink-0 bg-primary-700 flex flex-col',
      'transition-transform duration-200 ease-in-out',
      'lg:relative lg:translate-x-0 lg:z-auto',
      open ? 'translate-x-0' : '-translate-x-full'
    )}>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-primary-600 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gold-300 flex items-center justify-center shadow flex-shrink-0">
            <UtensilsCrossed size={20} className="text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">Restaurant</div>
            <div className="text-primary-200 text-xs">CRM v1.0</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg text-primary-300 hover:text-white hover:bg-primary-600 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-primary-300 text-xs font-semibold uppercase tracking-wider px-2 mb-3">
          Main Menu
        </p>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              clsx('sidebar-link group', isActive && 'active')
            }
          >
            <Icon size={17} className="flex-shrink-0" />
            <span className="flex-1 text-sm">{label}</span>
            <ChevronRight size={13} className="opacity-0 group-hover:opacity-60 transition-opacity" />
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-primary-600">
        <p className="text-primary-300 text-xs text-center">© 2025 Restaurant CRM</p>
      </div>
    </aside>
  )
}
