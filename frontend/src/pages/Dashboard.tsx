import { DollarSign, TrendingUp, Wallet, Clock, RefreshCw, WifiOff } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { MetricSkeleton } from '../components/ui/SkeletonLoader';
import { AllocationRing } from '../components/charts/AllocationRing';
import { useTreasuryState } from '../api/hooks';
import { useHealth } from '../api/hooks';
import { fmtUsdc } from '../lib/format';
import { DECISION_COLORS } from '../lib/constants';

function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-text-secondary">{label}</p>
          <p className="text-3xl font-bold font-mono tracking-tight text-text-primary">
            {value}
          </p>
        </div>
        <div
          className={`rounded-lg p-2.5 ${accent ? 'bg-status-yellow-dim text-status-yellow' : 'bg-teal-dim text-teal'}`}
        >
          <Icon size={20} />
        </div>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { data: state, loading, error, refetch, secondsUntilRefresh } = useTreasuryState();
  const { data: health } = useHealth();

  const isConnected = !!health && health.status === 'ok';

  if (loading && !state) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="mt-1 text-sm text-text-muted">Treasury overview</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <MetricSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <WifiOff size={48} className="text-text-muted mb-4" />
        <h2 className="text-lg font-medium text-text-primary mb-2">Unable to connect</h2>
        <p className="text-sm text-text-muted mb-4">Could not reach the treasury service.</p>
        <Button onClick={refetch} variant="secondary">
          <RefreshCw size={16} /> Retry
        </Button>
      </div>
    );
  }

  const liquid = parseFloat(state?.liquidUsdc ?? '0');
  const deployed = parseFloat(state?.kaminoDeposited ?? '0');
  const total = parseFloat(state?.totalUsdc ?? '0');
  const pending = parseFloat(state?.pendingObligations ?? '0');
  const decision = state?.lastDecision;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="mt-1 text-sm text-text-muted">Treasury overview and status</p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Available USDC" value={fmtUsdc(liquid)} icon={DollarSign} />
        <MetricCard label="Earning Yield" value={fmtUsdc(deployed)} icon={TrendingUp} />
        <MetricCard label="Total AUM" value={fmtUsdc(total)} icon={Wallet} />
        <MetricCard
          label="Pending Obligations"
          value={fmtUsdc(pending)}
          icon={Clock}
          accent={pending > 0}
        />
      </div>

      {/* Two-column: Allocation + Policy */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Allocation ring */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
          </CardHeader>
          <AllocationRing liquid={liquid} deployed={deployed} />
          <div className="mt-6 grid grid-cols-2 gap-4 text-center">
            <div className="rounded-lg bg-bg-surface p-3">
              <p className="text-xs text-text-muted">Liquid Reserve</p>
              <p className="text-lg font-semibold font-mono text-teal">{fmtUsdc(liquid)}</p>
            </div>
            <div className="rounded-lg bg-bg-surface p-3">
              <p className="text-xs text-text-muted">Deployed Capital</p>
              <p className="text-lg font-semibold font-mono text-blue">{fmtUsdc(deployed)}</p>
            </div>
          </div>
        </Card>

        {/* Policy engine */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Policy Engine</CardTitle>
          </CardHeader>
          {decision ? (
            <div className="space-y-5">
              {/* Decision badge */}
              <div className="space-y-2">
                <p className="text-xs text-text-muted">Last Decision</p>
                <div
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    DECISION_COLORS[decision.action]?.bg ?? 'bg-bg-surface'
                  } ${DECISION_COLORS[decision.action]?.text ?? 'text-text-secondary'}`}
                >
                  {decision.action === 'deposit' && `Deposit ${fmtUsdc(decision.amountUsdc ?? 0)}`}
                  {decision.action === 'withdraw' && `Withdraw ${fmtUsdc(decision.amountUsdc ?? 0)}`}
                  {decision.action === 'none' && 'Hold — No Rebalance'}
                </div>
              </div>

              {/* Reason */}
              {decision.reason && (
                <div className="space-y-1">
                  <p className="text-xs text-text-muted">Reason</p>
                  <p className="text-sm text-text-secondary">{decision.reason}</p>
                </div>
              )}

              {/* Payment processing */}
              <div className="space-y-1">
                <p className="text-xs text-text-muted">Payment Processing</p>
                <Badge variant={decision.paymentProcessing ? 'success' : 'warning'}>
                  {decision.paymentProcessing ? 'Enabled' : 'Paused'}
                </Badge>
              </div>

              {/* Available for payments */}
              {decision.availableForPayments !== undefined && (
                <div className="space-y-1">
                  <p className="text-xs text-text-muted">Available for Payments</p>
                  <p className="text-sm font-mono text-text-primary">
                    {fmtUsdc(decision.availableForPayments)}
                  </p>
                </div>
              )}

              {/* Timestamp */}
              {decision.timestamp && (
                <div className="space-y-1">
                  <p className="text-xs text-text-muted">Updated</p>
                  <p className="text-xs text-text-muted font-mono">
                    {new Date(decision.timestamp).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-text-muted">No decision data yet.</p>
              <p className="text-xs text-text-muted mt-1">
                The scheduler will make its first decision shortly.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-bg-card px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-green opacity-50" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-status-green" />
                </span>
                <span className="text-xs text-status-green font-medium">Connected</span>
              </>
            ) : (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-status-red" />
                <span className="text-xs text-status-red font-medium">Offline</span>
              </>
            )}
          </div>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs text-text-muted font-mono">
            Refresh in {secondsUntilRefresh}s
          </span>
        </div>

        <Button onClick={refetch} variant="ghost" size="sm" loading={loading}>
          <RefreshCw size={14} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>
    </div>
  );
}
