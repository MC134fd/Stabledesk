export type AuditEventType =
  | 'scheduler_decision'
  | 'kamino_deposit_attempt'
  | 'kamino_deposit_success'
  | 'kamino_deposit_failure'
  | 'kamino_withdraw_attempt'
  | 'kamino_withdraw_success'
  | 'kamino_withdraw_failure'
  | 'payment_status_change'
  | 'error';

export type AuditEvent = {
  id: string;
  type: AuditEventType;
  timestamp: string;
  data?: unknown;
};

export type AuditFilter = {
  type?: AuditEventType;
  fromDate?: string;
  toDate?: string;
};

export type AuditQueryOptions = {
  action?: string;
  since?: Date;
  until?: Date;
};

export type AuditService = {
  recordEvent(type: AuditEventType, data?: unknown): AuditEvent;
  listEvents(): AuditEvent[];
  queryEvents(filter?: AuditFilter): AuditEvent[];
  query(opts?: AuditQueryOptions): AuditEvent[];
};

type AuditServiceOptions = {
  now?: () => string;
  generateId?: () => string;
  /** Maximum number of events to retain in memory. Oldest events are evicted first. Default: 10000 */
  maxEvents?: number;
};

let _idCounter = 0;
function defaultGenerateId(): string {
  return `audit_${Date.now()}_${++_idCounter}`;
}

export function createAuditService(options: AuditServiceOptions = {}): AuditService {
  const events: AuditEvent[] = []; // append-only — never mutate existing elements
  const now = options.now ?? (() => new Date().toISOString());
  const generateId = options.generateId ?? defaultGenerateId;
  const maxEvents = options.maxEvents ?? 10_000;

  return {
    recordEvent(type, data?) {
      const event: AuditEvent = {
        id: generateId(),
        type,
        timestamp: now(),
        ...(data !== undefined && { data }),
      };
      events.push(event);
      // Evict oldest events when the cap is exceeded
      if (events.length > maxEvents) {
        events.splice(0, events.length - maxEvents);
      }
      return event;
    },

    listEvents() {
      return [...events]; // shallow copy — callers cannot mutate internal state
    },

    queryEvents(filter = {}) {
      return events.filter((e) => {
        if (filter.type !== undefined && e.type !== filter.type) return false;
        if (filter.fromDate !== undefined && e.timestamp < filter.fromDate) return false;
        if (filter.toDate !== undefined && e.timestamp > filter.toDate) return false;
        return true;
      });
    },

    query(opts: AuditQueryOptions = {}) {
      return events.filter((e) => {
        if (opts.action !== undefined && e.type !== opts.action) return false;
        if (opts.since !== undefined && e.timestamp < opts.since.toISOString()) return false;
        if (opts.until !== undefined && e.timestamp > opts.until.toISOString()) return false;
        return true;
      });
    },
  };
}

export const auditService = createAuditService();
