import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, UtensilsCrossed, Package, Receipt,
  TrendingUp, Users, UserCog, ChevronRight, Settings
} from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/menu',          icon: UtensilsCrossed, label: 'Menu'        },
  { to: '/inventory',     icon: Package,          label: 'Inventory'  },
  { to: '/billing-admin', icon: Receipt,          label: 'Billing'    },
  { to: '/finance',       icon: TrendingUp,       label: 'Finance'    },
  { to: '/staff',         icon: UserCog,          label: 'Staff'      },
  { to: '/customers',     icon: Users,            label: 'Customers'  },
  { to: '/settings',      icon: Settings,         label: 'Settings'   },
]

export default function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 bg-primary-700 flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-primary-600">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gold-300 flex items-center justify-center shadow">
            <UtensilsCrossed size={20} className="text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">Restaurant</div>
            <div className="text-primary-200 text-xs">CRM v1.0</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-primary-300 text-xs font-semibold uppercase tracking-wider px-2 mb-3">
          Main Menu
        </p>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
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
        <p className="text-primary-300 text-xs text-center">
          © 2025 Restaurant CRM
        </p>
      </div>
    </aside>
  )
}
