import { Layers, TrendingUp, Activity, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { MetricSkeleton } from '../components/ui/SkeletonLoader';
import { ApyBarChart } from '../components/charts/ApyBarChart';
import { useLending, useBestApy } from '../api/hooks';
import { fmtUsdc } from '../lib/format';

export function Analytics() {
  const { data: lending, loading: lendingLoading } = useLending();
  const { data: bestApy, loading: apyLoading } = useBestApy('USDC');

  const loading = lendingLoading || apyLoading;
  const positions = lending?.positions ?? [];
  const protocols = new Set(positions.map((p) => p.protocol));

  if (loading && !lending) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
          <p className="mt-1 text-sm text-text-muted">Yield performance and lending positions</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <MetricSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
        <p className="mt-1 text-sm text-text-muted">Yield performance and lending positions</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">Total Deployed</p>
              <p className="text-3xl font-bold font-mono text-text-primary">
                {lending ? fmtUsdc(lending.totalValueUsdc) : '$0.00'}
              </p>
            </div>
            <div className="rounded-lg p-2.5 bg-blue-dim text-blue">
              <Layers size={20} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">Best APY</p>
              <p className="text-3xl font-bold font-mono text-text-primary">
                {bestApy ? bestApy.apyFormatted : '—'}
              </p>
              {bestApy && (
                <p className="text-xs text-text-muted capitalize">{bestApy.protocol}</p>
              )}
            </div>
            <div className="rounded-lg p-2.5 bg-status-green-dim text-status-green">
              <TrendingUp size={20} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">Active Protocols</p>
              <p className="text-3xl font-bold font-mono text-text-primary">
                {protocols.size}
              </p>
            </div>
            <div className="rounded-lg p-2.5 bg-teal-dim text-teal">
              <Activity size={20} />
            </div>
          </div>
        </Card>
      </div>

      {/* APY comparison chart */}
      {positions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>APY by Protocol</CardTitle>
          </CardHeader>
          <ApyBarChart positions={positions} />
        </Card>
      )}

      {/* Positions table */}
      <Card className="overflow-hidden p-0">
        <div className="px-6 pt-6 pb-4">
          <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">
            Lending Positions
          </h3>
        </div>
        {positions.length === 0 ? (
          <EmptyState
            icon={<Layers size={48} />}
            title="No lending positions"
            description="Positions will appear once the scheduler deploys capital to lending protocols."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Protocol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Token
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                    Deposited
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                    APY
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {positions.map((p, i) => (
                  <tr key={`${p.protocol}-${p.token}-${i}`} className="hover:bg-bg-card-hover transition-colors">
                    <td className="px-6 py-4">
                      <Badge variant="info">{p.protocol}</Badge>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-text-primary">
                      {p.token}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-mono text-text-primary">
                      {fmtUsdc(p.deposited)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-mono text-status-green">{p.apyFormatted}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Balance history placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Balance History</CardTitle>
          <Badge>Coming Soon</Badge>
        </CardHeader>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Clock size={48} className="text-text-muted mb-4" />
          <p className="text-sm text-text-muted">
            Historical balance tracking will be available in a future update.
          </p>
        </div>
      </Card>
    </div>
  );
}
