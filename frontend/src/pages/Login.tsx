import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { Logo } from '../components/layout/Logo';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import { PageSpinner } from '../components/ui/Spinner';

export function Login() {
  const { user, loading: authLoading, login, register } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (authLoading) return <PageSpinner />;
  if (user) return <Navigate to="/app" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (tab === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate('/app');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-teal/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-[440px]">
        {/* Logo and branding */}
        <div className="flex flex-col items-center mb-8">
          <Logo size={48} />
          <h1 className="mt-4 text-2xl font-bold text-text-primary">StableDesk</h1>
          <p className="mt-1 text-sm text-text-muted">Autonomous Treasury Management</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-bg-card p-8">
          <Tabs.Root value={tab} onValueChange={setTab}>
            <Tabs.List className="flex rounded-lg bg-bg-surface p-1 mb-6" aria-label="Account">
              <Tabs.Trigger
                value="login"
                className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-text-muted transition-colors data-[state=active]:bg-bg-card data-[state=active]:text-text-primary data-[state=active]:shadow-sm"
              >
                Sign In
              </Tabs.Trigger>
              <Tabs.Trigger
                value="register"
                className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-text-muted transition-colors data-[state=active]:bg-bg-card data-[state=active]:text-text-primary data-[state=active]:shadow-sm"
              >
                Create Account
              </Tabs.Trigger>
            </Tabs.List>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  className="rounded-lg border border-status-red/20 bg-status-red-dim px-4 py-3 text-sm text-status-red"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                required
                autoComplete="email"
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              />

              <Tabs.Content value="register" className="mt-0">
                <p className="text-xs text-text-muted mb-4">
                  Only one admin account is allowed per deployment.
                </p>
              </Tabs.Content>

              <Button type="submit" loading={loading} className="w-full" size="lg">
                {tab === 'login' ? 'Sign In' : 'Create Account'}
              </Button>
            </form>
          </Tabs.Root>
        </div>
      </div>
    </div>
  );
}
