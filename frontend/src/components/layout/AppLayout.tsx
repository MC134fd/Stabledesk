import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-bg-base">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-teal focus:px-4 focus:py-2 focus:text-bg-base focus:text-sm"
      >
        Skip to main content
      </a>

      <TopNav />

      <main id="main-content" className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
