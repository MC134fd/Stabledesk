import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CreditCard, BarChart3, ScrollText, Settings } from 'lucide-react';
import clsx from 'clsx';
import { Logo } from './Logo';

const navItems = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/payments', label: 'Payments', icon: CreditCard },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/audit', label: 'Audit Log', icon: ScrollText },
];

export function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg-base/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Left: Logo */}
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-lg font-semibold text-text-primary tracking-tight">
              StableDesk
            </span>
          </div>

          {/* Center: Nav links */}
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-teal-dim text-teal font-medium'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-card',
                  )
                }
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right: Settings */}
          <div className="flex items-center">
            <NavLink
              to="/app/settings"
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-teal-dim text-teal'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-card',
                )
              }
              aria-label="Settings"
            >
              <Settings size={16} />
            </NavLink>
          </div>
        </div>
      </div>
    </header>
  );
}
