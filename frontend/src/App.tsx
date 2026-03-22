import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppLayout } from './components/layout/AppLayout';
import { Welcome } from './pages/Welcome';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Payments } from './pages/Payments';
import { Analytics } from './pages/Analytics';
import { AuditLog } from './pages/AuditLog';
import { Settings } from './pages/Settings';
import { NotFound } from './pages/NotFound';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/login" element={<Login />} />

            {/* Protected routes */}
            <Route element={<AppLayout />}>
              <Route path="/app" element={<Dashboard />} />
              <Route path="/app/payments" element={<Payments />} />
              <Route path="/app/analytics" element={<Analytics />} />
              <Route path="/app/audit" element={<AuditLog />} />
              <Route path="/app/settings" element={<Settings />} />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/welcome" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
