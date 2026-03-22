import { useState, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Logo } from '../components/layout/Logo';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import { PageSpinner } from '../components/ui/Spinner';
import clsx from 'clsx';

/* ── Email validation (matches backend regex) ── */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── Password strength scoring ── */
type Strength = { score: number; label: string; color: string; width: string };

function getPasswordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: '', color: '', width: '0%' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  // Map 0-5 → 4 buckets
  if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500', width: '25%' };
  if (score === 2) return { score: 2, label: 'Fair', color: 'bg-yellow-500', width: '50%' };
  if (score === 3) return { score: 3, label: 'Good', color: 'bg-teal', width: '75%' };
  return { score: 4, label: 'Strong', color: 'bg-status-green', width: '100%' };
}

export function Login() {
  const { user, loading: authLoading, login, register } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const emailError = useMemo(() => {
    if (!emailTouched || !email) return '';
    return EMAIL_RE.test(email) ? '' : 'Please enter a valid email address';
  }, [email, emailTouched]);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  if (authLoading) return <PageSpinner />;
  if (user) return <Navigate to="/app" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (tab === 'login') {
        await login(email, password, rememberMe);
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
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4 overflow-hidden relative">
      {/* ── Animated gradient orbs ── */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-[15%] left-[20%] w-[500px] h-[500px] rounded-full bg-teal/[0.06] blur-[128px] animate-[float_20s_ease-in-out_infinite]" />
        <div className="absolute bottom-[10%] right-[15%] w-[600px] h-[600px] rounded-full bg-blue/[0.05] blur-[128px] animate-[float_25s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-[60%] left-[50%] w-[400px] h-[400px] rounded-full bg-teal/[0.03] blur-[128px] animate-[float_18s_ease-in-out_infinite_2s]" />
      </div>

      {/* ── Form container (glassmorphism, no visible card edge) ── */}
      <div className="relative z-10 w-full max-w-[420px]">
        {/* Logo + branding */}
        <div className="flex flex-col items-center mb-10">
          <Logo size={52} />
          <h1 className="mt-5 text-3xl font-bold text-text-primary tracking-tight">
            StableDesk
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Autonomous Treasury Management
          </p>
        </div>

        {/* Glass panel */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-8">
          <Tabs.Root value={tab} onValueChange={(v) => { setTab(v); setError(''); }}>
            {/* ── Glass tab selector ── */}
            <Tabs.List
              className="flex rounded-xl bg-white/[0.04] border border-white/[0.06] p-1 mb-8"
              aria-label="Account"
            >
              <Tabs.Trigger
                value="login"
                className={clsx(
                  'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  'data-[state=active]:bg-white/[0.08] data-[state=active]:text-teal data-[state=active]:shadow-[0_0_12px_rgba(45,212,191,0.15)]',
                  'data-[state=inactive]:text-text-muted data-[state=inactive]:hover:text-text-secondary',
                )}
              >
                Sign In
              </Tabs.Trigger>
              <Tabs.Trigger
                value="register"
                className={clsx(
                  'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200',
                  'data-[state=active]:bg-white/[0.08] data-[state=active]:text-teal data-[state=active]:shadow-[0_0_12px_rgba(45,212,191,0.15)]',
                  'data-[state=inactive]:text-text-muted data-[state=inactive]:hover:text-text-secondary',
                )}
              >
                Create Account
              </Tabs.Trigger>
            </Tabs.List>

            {/* ── Form ── */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Error alert */}
              {error && (
                <div
                  className="rounded-xl border border-status-red/20 bg-status-red/[0.08] backdrop-blur-sm px-4 py-3 text-sm text-status-red"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Email field */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-text-secondary">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  placeholder="admin@company.com"
                  required
                  autoComplete="email"
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? 'email-error' : undefined}
                  className={clsx(
                    'w-full rounded-xl border bg-white/[0.04] px-4 py-3 text-sm text-text-primary',
                    'placeholder:text-text-muted/60',
                    'transition-all duration-200',
                    'focus:outline-none focus:border-teal/40 focus:ring-2 focus:ring-teal/20 focus:bg-white/[0.06]',
                    emailError ? 'border-status-red/40' : 'border-white/[0.08]',
                  )}
                />
                {emailError && (
                  <p id="email-error" className="text-xs text-status-red" role="alert">
                    {emailError}
                  </p>
                )}
              </div>

              {/* Password field with visibility toggle */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-text-secondary">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={tab === 'register' ? 'Min. 8 characters' : 'Enter your password'}
                    required
                    autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                    className={clsx(
                      'w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 pr-12 text-sm text-text-primary',
                      'placeholder:text-text-muted/60',
                      'transition-all duration-200',
                      'focus:outline-none focus:border-teal/40 focus:ring-2 focus:ring-teal/20 focus:bg-white/[0.06]',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors p-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Password strength indicator (only on register tab) */}
                <Tabs.Content value="register" className="mt-0" forceMount>
                  <div
                    className={clsx(
                      'transition-all duration-300 overflow-hidden',
                      tab === 'register' && password ? 'max-h-8 opacity-100 mt-2' : 'max-h-0 opacity-0',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={clsx('h-full rounded-full transition-all duration-500', strength.color)}
                          style={{ width: strength.width }}
                        />
                      </div>
                      <span
                        className={clsx(
                          'text-xs font-medium min-w-[48px]',
                          strength.score <= 1 && 'text-status-red',
                          strength.score === 2 && 'text-status-yellow',
                          strength.score === 3 && 'text-teal',
                          strength.score >= 4 && 'text-status-green',
                        )}
                      >
                        {strength.label}
                      </span>
                    </div>
                  </div>
                </Tabs.Content>
              </div>

              {/* Remember me (only on login tab) */}
              <Tabs.Content value="login" className="mt-0" forceMount>
                <div
                  className={clsx(
                    'transition-all duration-300 overflow-hidden',
                    tab === 'login' ? 'max-h-8 opacity-100' : 'max-h-0 opacity-0',
                  )}
                >
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div
                        className={clsx(
                          'w-4 h-4 rounded border transition-all duration-200',
                          'peer-checked:bg-teal peer-checked:border-teal',
                          'peer-focus-visible:ring-2 peer-focus-visible:ring-teal/30',
                          rememberMe ? 'border-teal bg-teal' : 'border-white/20 bg-white/[0.04]',
                        )}
                      >
                        {rememberMe && (
                          <svg viewBox="0 0 12 12" className="w-full h-full text-bg-base" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2.5 6L5 8.5L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-text-muted group-hover:text-text-secondary transition-colors">
                      Remember me for 30 days
                    </span>
                  </label>
                </div>
              </Tabs.Content>

              {/* Register note */}
              <Tabs.Content value="register" className="mt-0" forceMount>
                <div
                  className={clsx(
                    'transition-all duration-300 overflow-hidden',
                    tab === 'register' ? 'max-h-8 opacity-100' : 'max-h-0 opacity-0',
                  )}
                >
                  <p className="text-xs text-text-muted">
                    Only one admin account is allowed per deployment.
                  </p>
                </div>
              </Tabs.Content>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className={clsx(
                  'w-full rounded-xl py-3.5 text-sm font-semibold transition-all duration-200',
                  'bg-gradient-to-r from-teal to-teal-hover text-bg-base',
                  'hover:shadow-[0_0_24px_rgba(45,212,191,0.25)] hover:brightness-110',
                  'active:scale-[0.98]',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none',
                  'focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
                )}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    {tab === 'login' ? 'Signing in...' : 'Creating account...'}
                  </span>
                ) : (
                  tab === 'login' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </form>
          </Tabs.Root>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-text-muted/50">
          Built on Solana
        </p>
      </div>

      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.95); }
        }
      `}</style>
    </div>
  );
}
