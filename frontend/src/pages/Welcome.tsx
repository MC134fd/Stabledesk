import { Link } from 'react-router-dom';
import {
  Layers,
  Shield,
  CreditCard,
  ScrollText,
  Zap,
  Eye,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';
import { Logo } from '../components/layout/Logo';
import { Button } from '../components/ui/Button';

const features = [
  {
    icon: Layers,
    title: 'Multi-Protocol Yield',
    description:
      'Deploy capital across Kamino, marginfi, Save, and Jupiter for optimized returns.',
  },
  {
    icon: Shield,
    title: 'Smart Liquidity Policy',
    description:
      'Automatic rebalancing between liquid reserves and deployed capital based on your rules.',
  },
  {
    icon: CreditCard,
    title: 'Automated Payments',
    description:
      'Queue, track, and execute USDC payments with full status lifecycle management.',
  },
  {
    icon: ScrollText,
    title: 'Full Audit Trail',
    description:
      'Every decision, transaction, and state change is logged with immutable audit events.',
  },
  {
    icon: Zap,
    title: 'Gas Abstraction',
    description:
      'Zero SOL exposure. All transaction fees are paid in USDC via Kora relay.',
  },
  {
    icon: Eye,
    title: 'On-Chain Transparency',
    description:
      'Real-time balance tracking and transaction verification directly from Solana.',
  },
];

const steps = [
  { num: '01', title: 'Connect', description: 'Link your treasury wallet and configure policy thresholds.' },
  { num: '02', title: 'Configure', description: 'Set liquidity reserves, allocation targets, and payment rules.' },
  { num: '03', title: 'Automate', description: 'The scheduler continuously optimizes yield and processes payments.' },
];

export function Welcome() {
  return (
    <div className="min-h-screen bg-bg-base">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-teal/3 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue/3 rounded-full blur-[128px]" />
      </div>

      {/* Nav */}
      <header className="relative z-10 border-b border-border/50">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-lg font-semibold text-text-primary">StableDesk</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link to="/login">
              <Button size="sm">
                Get Started <ArrowRight size={14} />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 pt-24 pb-20">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-card px-4 py-1.5 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-status-green animate-pulse" />
            <span className="text-xs text-text-secondary">Built on Solana</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            <span className="text-text-primary">Autonomous</span>
            <br />
            <span className="gradient-text">Treasury Management</span>
          </h1>

          <p className="mx-auto max-w-2xl text-lg text-text-secondary leading-relaxed mb-10">
            StableDesk is an institutional-grade treasury agent that automatically optimizes
            stablecoin yield, manages payments, and enforces liquidity policies on Solana.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link to="/login">
              <Button size="lg">
                Launch App <ChevronRight size={18} />
              </Button>
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary" size="lg">
                Documentation
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Stats ribbon */}
      <section className="relative z-10 border-y border-border/50 bg-bg-surface/50">
        <div className="mx-auto max-w-6xl px-6 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          <div>
            <p className="text-3xl font-bold font-mono text-text-primary">4</p>
            <p className="text-sm text-text-muted mt-1">Lending Protocols</p>
          </div>
          <div>
            <p className="text-3xl font-bold font-mono text-text-primary">6</p>
            <p className="text-sm text-text-muted mt-1">Supported Stablecoins</p>
          </div>
          <div>
            <p className="text-3xl font-bold font-mono text-text-primary">0</p>
            <p className="text-sm text-text-muted mt-1">SOL Required</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Everything your treasury needs
            </h2>
            <p className="text-text-secondary max-w-xl mx-auto">
              From yield optimization to payment execution, StableDesk handles it all autonomously.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-bg-card p-6 transition-colors hover:border-border-focus hover:bg-bg-card-hover group"
              >
                <div className="rounded-lg bg-teal-dim p-2.5 w-fit mb-4 group-hover:bg-teal/15 transition-colors">
                  <f.icon size={20} className="text-teal" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">{f.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 py-24 border-t border-border/50">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-text-primary mb-4">How it works</h2>
            <p className="text-text-secondary max-w-xl mx-auto">
              Get started in minutes, not weeks. StableDesk handles the complexity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step) => (
              <div key={step.num} className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-bg-card border border-border mb-5">
                  <span className="text-lg font-bold font-mono gradient-text">{step.num}</span>
                </div>
                <h3 className="text-xl font-semibold text-text-primary mb-2">{step.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="rounded-2xl border border-border bg-bg-card p-12 text-center">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Ready to automate your treasury?
            </h2>
            <p className="text-text-secondary max-w-lg mx-auto mb-8">
              Stop managing spreadsheets. Let StableDesk optimize your stablecoin operations on Solana.
            </p>
            <Link to="/login">
              <Button size="lg">
                Get Started <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-8">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span className="text-sm text-text-muted">StableDesk</span>
          </div>
          <p className="text-xs text-text-muted">
            Built on Solana
          </p>
        </div>
      </footer>
    </div>
  );
}
