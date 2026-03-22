import { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  useReducedMotion,
  animate,
} from 'framer-motion';
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
import { ScrollReveal } from '../components/ui/ScrollReveal';

/* ── Data ── */

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

/* ── Animated counter ── */

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isInView || !ref.current) return;
    if (prefersReducedMotion) {
      ref.current.textContent = to + suffix;
      return;
    }
    const controls = animate(0, to, {
      duration: 1.5,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = Math.round(v) + suffix;
      },
    });
    return () => controls.stop();
  }, [isInView, to, suffix, prefersReducedMotion]);

  return <span ref={ref}>0{suffix}</span>;
}

/* ── Scroll progress line ── */

function ScrollLine() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const prefersReducedMotion = useReducedMotion();

  // Map scroll progress to line fill (start after hero ~15%, end before footer ~90%)
  const lineProgress = useTransform(scrollYProgress, [0.1, 0.85], [0, 1]);
  const dotY = useTransform(scrollYProgress, [0.1, 0.85], ['0%', '100%']);

  if (prefersReducedMotion) return null;

  return (
    <div
      ref={containerRef}
      className="fixed left-1/2 top-0 bottom-0 -translate-x-1/2 z-0 pointer-events-none hidden lg:block"
      aria-hidden="true"
    >
      {/* Track (faint guide line) */}
      <div className="absolute top-[15vh] bottom-[10vh] w-px bg-white/[0.04]" />

      {/* Filled progress line */}
      <motion.div
        className="absolute top-[15vh] bottom-[10vh] w-px bg-teal/30 origin-top"
        style={{ scaleY: lineProgress }}
      />

      {/* Glowing dot */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          top: '15vh',
          y: dotY,
        }}
      >
        <div className="w-3 h-3 rounded-full bg-teal glow-dot" />
        {/* Outer pulse ring */}
        <div className="absolute inset-0 w-3 h-3 rounded-full bg-teal/30 animate-ping" />
      </motion.div>
    </div>
  );
}

/* ── Main component ── */

export function Welcome() {
  const { scrollY } = useScroll();
  const prefersReducedMotion = useReducedMotion();

  // Parallax for background orbs
  const orb1Y = useTransform(scrollY, [0, 1000], [0, -150]);
  const orb2Y = useTransform(scrollY, [0, 1000], [0, -80]);
  const orb3Y = useTransform(scrollY, [0, 1000], [0, -200]);

  return (
    <div className="min-h-screen bg-bg-base relative overflow-x-hidden">
      {/* Grid pattern overlay */}
      <div className="fixed inset-0 grid-pattern pointer-events-none z-0" aria-hidden="true" />

      {/* Parallax background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
        <motion.div
          className="absolute top-[10%] left-[15%] w-[600px] h-[600px] bg-teal/[0.04] rounded-full blur-[128px]"
          style={{ y: prefersReducedMotion ? 0 : orb1Y }}
        />
        <motion.div
          className="absolute bottom-[5%] right-[10%] w-[700px] h-[700px] bg-blue/[0.04] rounded-full blur-[128px]"
          style={{ y: prefersReducedMotion ? 0 : orb2Y }}
        />
        <motion.div
          className="absolute top-[50%] left-[40%] w-[500px] h-[500px] bg-teal/[0.025] rounded-full blur-[128px]"
          style={{ y: prefersReducedMotion ? 0 : orb3Y }}
        />
      </div>

      {/* Scroll progress line */}
      <ScrollLine />

      {/* ── Nav ── */}
      <header className="relative z-10 border-b border-border/50">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Logo />
            <span className="text-lg font-semibold text-text-primary">StableDesk</span>
          </motion.div>
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link to="/app">
              <Button size="sm">
                Launch App <ArrowRight size={14} />
              </Button>
            </Link>
          </motion.div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 pt-24 pb-20">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-card px-4 py-1.5 mb-8"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-status-green animate-pulse" />
            <span className="text-xs text-text-secondary">Built on Solana</span>
          </motion.div>

          <motion.h1
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            <span className="text-text-primary">Autonomous</span>
            <br />
            <span className="gradient-text">Treasury Management</span>
          </motion.h1>

          <motion.p
            className="mx-auto max-w-2xl text-lg text-text-secondary leading-relaxed mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            StableDesk is an institutional-grade treasury agent that automatically optimizes
            stablecoin yield, manages payments, and enforces liquidity policies on Solana.
          </motion.p>

          <motion.div
            className="flex items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <Link to="/app">
              <Button size="lg">
                Launch App <ChevronRight size={18} />
              </Button>
            </Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="lg">Documentation</Button>
            </a>
          </motion.div>
        </div>
      </section>

      {/* ── Stats ribbon ── */}
      <section className="relative z-10 border-y border-border/50 bg-bg-surface/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 py-12 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {[
            { value: 4, label: 'Lending Protocols' },
            { value: 6, label: 'Supported Stablecoins' },
            { value: 0, label: 'SOL Required', suffix: '' },
          ].map((stat, i) => (
            <ScrollReveal key={stat.label} delay={i * 0.12}>
              <div>
                <p className="text-4xl font-bold font-mono text-text-primary">
                  <CountUp to={stat.value} suffix={stat.suffix} />
                </p>
                <p className="text-sm text-text-muted mt-2">{stat.label}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative z-10 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-text-primary mb-4">
                Everything your treasury needs
              </h2>
              <p className="text-text-secondary max-w-xl mx-auto">
                From yield optimization to payment execution, StableDesk handles it all autonomously.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <ScrollReveal key={f.title} delay={i * 0.08}>
                <motion.div
                  className="rounded-xl border border-border bg-bg-card p-6 transition-all duration-300 hover:border-border-focus hover:bg-bg-card-hover group h-full"
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                >
                  <motion.div
                    className="rounded-lg bg-teal-dim p-2.5 w-fit mb-4 group-hover:bg-teal/15 transition-colors"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  >
                    <f.icon size={20} className="text-teal" />
                  </motion.div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">{f.title}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed">{f.description}</p>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="relative z-10 py-24 border-t border-border/50">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-text-primary mb-4">How it works</h2>
              <p className="text-text-secondary max-w-xl mx-auto">
                Get started in minutes, not weeks. StableDesk handles the complexity.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connecting line between steps (desktop) */}
            <div className="hidden md:block absolute top-7 left-[16.67%] right-[16.67%] h-px" aria-hidden="true">
              <ScrollReveal delay={0.3}>
                <div className="h-px bg-gradient-to-r from-transparent via-teal/30 to-transparent w-full" />
              </ScrollReveal>
            </div>

            {steps.map((step, i) => (
              <ScrollReveal key={step.num} delay={i * 0.2}>
                <div className="text-center relative">
                  <motion.div
                    className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-bg-card border border-border mb-5 relative z-10"
                    whileInView={{ scale: [0.8, 1.05, 1] }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.2 }}
                  >
                    <span className="text-lg font-bold font-mono gradient-text">{step.num}</span>
                  </motion.div>
                  <h3 className="text-xl font-semibold text-text-primary mb-2">{step.title}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed">{step.description}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal scale>
            <motion.div
              className="rounded-2xl border border-border bg-bg-card p-12 text-center relative overflow-hidden"
              whileInView={{ boxShadow: '0 0 60px rgba(45, 212, 191, 0.08)' }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 1 }}
            >
              {/* Subtle glow behind CTA */}
              <div className="absolute inset-0 bg-gradient-to-br from-teal/[0.03] to-blue/[0.03] pointer-events-none" aria-hidden="true" />

              <h2 className="text-3xl font-bold text-text-primary mb-4 relative">
                Ready to automate your treasury?
              </h2>
              <p className="text-text-secondary max-w-lg mx-auto mb-8 relative">
                Stop managing spreadsheets. Let StableDesk optimize your stablecoin operations on Solana.
              </p>
              <Link to="/app" className="relative">
                <motion.div
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-block"
                >
                  <Button size="lg">
                    Get Started <ArrowRight size={16} />
                  </Button>
                </motion.div>
              </Link>
            </motion.div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-border/50 py-8">
        <div className="mx-auto max-w-6xl px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <span className="text-sm text-text-muted">StableDesk</span>
          </div>
          <p className="text-xs text-text-muted">Built on Solana</p>
        </div>
      </footer>
    </div>
  );
}
