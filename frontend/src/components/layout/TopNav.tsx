import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CreditCard, BarChart3, ScrollText, Settings, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { Logo } from './Logo';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/payments', label: 'Payments', icon: CreditCard },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/audit', label: 'Audit Log', icon: ScrollText },
];

export function TopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

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

          {/* Right: User menu */}
          <div className="flex items-center gap-4">
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
            <div className="h-5 w-px bg-border" />
            <span className="text-xs text-text-muted hidden md:inline">
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:text-status-red hover:bg-status-red-dim transition-colors"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
