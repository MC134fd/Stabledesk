import { useState } from 'react';
import { ScrollText, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/SkeletonLoader';
import { useAudit } from '../api/hooks';
import { fmtDate } from '../lib/format';
import clsx from 'clsx';

function resultVariant(result: string): 'success' | 'error' | 'default' {
  const r = result?.toLowerCase();
  if (r === 'success' || r === 'ok') return 'success';
  if (r === 'failure' || r === 'error' || r === 'failed') return 'error';
  return 'default';
}

function AuditEntry({ event }: { event: { action: string; result: string; params?: Record<string, unknown>; timestamp: string } }) {
  const [expanded, setExpanded] = useState(false);
  const hasParams = event.params && Object.keys(event.params).length > 0;

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => hasParams && setExpanded(!expanded)}
        className={clsx(
          'w-full flex items-center gap-4 px-6 py-4 text-left transition-colors',
          hasParams && 'hover:bg-bg-card-hover cursor-pointer',
          !hasParams && 'cursor-default',
        )}
        aria-expanded={hasParams ? expanded : undefined}
      >
        <span className="text-xs text-text-muted font-mono w-36 shrink-0">
          {fmtDate(event.timestamp)}
        </span>
        <Badge variant="info">{event.action}</Badge>
        <Badge variant={resultVariant(event.result)}>{event.result}</Badge>
        <span className="flex-1" />
        {hasParams && (
          <span className="text-text-muted">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </button>
      {expanded && hasParams && (
        <div className="px-6 pb-4 pl-[calc(1.5rem+9rem+1rem)]">
          <pre className="rounded-lg bg-bg-surface border border-border p-3 text-xs font-mono text-text-secondary overflow-x-auto">
            {JSON.stringify(event.params, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function AuditLog() {
  const [actionFilter, setActionFilter] = useState('');
  const { data: events, loading } = useAudit(
    actionFilter ? { action: actionFilter } : undefined,
  );

  // Get unique actions for filter dropdown
  const actions = events
    ? [...new Set(events.map((e) => e.action))].sort()
    : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Audit Log</h1>
          <p className="mt-1 text-sm text-text-muted">System event history</p>
        </div>
        {events && (
          <Badge>{events.length} events</Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <label htmlFor="action-filter" className="text-xs text-text-muted">
          Filter by action:
        </label>
        <select
          id="action-filter"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-teal"
        >
          <option value="">All events</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Event list */}
      <Card className="p-0 overflow-hidden">
        {loading && !events ? (
          <div className="p-6 space-y-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !events?.length ? (
          <EmptyState
            icon={<ScrollText size={48} />}
            title="No audit events"
            description="Events will appear as the scheduler processes transactions."
          />
        ) : (
          <div>
            {events.map((event, i) => (
              <AuditEntry key={event.id || i} event={event} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
