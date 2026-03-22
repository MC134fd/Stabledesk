import { Shield, Server } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useHealth } from '../api/hooks';

function SettingsRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm font-mono text-text-primary">{value}</span>
    </div>
  );
}

export function Settings() {
  const { data: health } = useHealth();

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">System configuration</p>
      </div>

      {/* Treasury Policy */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-text-muted" />
            <CardTitle>Treasury Policy</CardTitle>
          </div>
          <Badge>Read-only</Badge>
        </CardHeader>
        <div className="space-y-0">
          <SettingsRow label="Min Liquid Reserve" value="1 USDC" />
          <SettingsRow label="Target Liquid Reserve" value="2 USDC" />
          <SettingsRow label="Max Single Transaction" value="1,000 USDC" />
          <SettingsRow label="Target Allocation" value="50% Deployed" />
          <SettingsRow label="Daily Spending Cap" value="Unlimited" />
        </div>
        <p className="mt-4 text-xs text-text-muted">
          Policy is configured via environment variables. Restart the server to apply changes.
        </p>
      </Card>

      {/* System Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server size={16} className="text-text-muted" />
            <CardTitle>System Info</CardTitle>
          </div>
        </CardHeader>
        <div className="space-y-0">
          <SettingsRow
            label="Health"
            value={
              health?.status === 'ok' ? (
                <Badge variant="success">Healthy</Badge>
              ) : (
                <Badge variant="error">Unhealthy</Badge>
              )
            }
          />
          <SettingsRow
            label="Server Time"
            value={health?.timestamp ? new Date(health.timestamp).toLocaleString() : '—'}
          />
          <SettingsRow label="Scheduler Interval" value="60s" />
          <SettingsRow label="Auto-refresh" value="30s" />
        </div>
      </Card>
    </div>
  );
}
