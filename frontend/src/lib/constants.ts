export const REFRESH_INTERVAL = 30_000;

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  queued: { bg: 'bg-status-yellow-dim', text: 'text-status-yellow' },
  awaiting_liquidity: { bg: 'bg-status-orange-dim', text: 'text-status-orange' },
  ready: { bg: 'bg-blue-dim', text: 'text-blue' },
  processing: { bg: 'bg-teal-dim', text: 'text-teal' },
  sent: { bg: 'bg-status-green-dim', text: 'text-status-green' },
  failed: { bg: 'bg-status-red-dim', text: 'text-status-red' },
};

export const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  awaiting_liquidity: 'Awaiting Liquidity',
  ready: 'Ready',
  processing: 'Processing',
  sent: 'Sent',
  failed: 'Failed',
};

export const DECISION_COLORS: Record<string, { bg: string; text: string }> = {
  deposit: { bg: 'bg-status-green-dim', text: 'text-status-green' },
  withdraw: { bg: 'bg-status-orange-dim', text: 'text-status-orange' },
  none: { bg: 'bg-bg-card', text: 'text-text-muted' },
};
