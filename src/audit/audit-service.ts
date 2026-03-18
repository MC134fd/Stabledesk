import { createLogger } from "./logger.js";

const log = createLogger("audit");

export interface AuditEvent {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  params: Record<string, unknown>;
  result: "success" | "failure";
  detail?: string;
}

/** Maximum number of audit events to keep in memory */
const MAX_EVENTS = 10_000;

const events: AuditEvent[] = [];
let counter = 0;

export const auditService = {
  record(
    action: string,
    params: Record<string, unknown>,
    result: "success" | "failure",
    detail?: string,
    actor = "agent",
  ): AuditEvent {
    const event: AuditEvent = {
      id: `audit-${Date.now()}-${++counter}`,
      timestamp: new Date().toISOString(),
      action,
      actor,
      params,
      result,
      detail,
    };
    events.push(event);

    // Evict oldest events when capacity is exceeded
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }

    log.info(`[${result}] ${action}`, { eventId: event.id, ...params });
    return event;
  },

  query(opts?: { action?: string; since?: Date; until?: Date }): AuditEvent[] {
    let filtered = events;
    if (opts?.action) {
      filtered = filtered.filter((e) => e.action === opts.action);
    }
    if (opts?.since) {
      const s = opts.since.toISOString();
      filtered = filtered.filter((e) => e.timestamp >= s);
    }
    if (opts?.until) {
      const u = opts.until.toISOString();
      filtered = filtered.filter((e) => e.timestamp <= u);
    }
    return filtered;
  },

  all(): AuditEvent[] {
    return [...events];
  },

  clear(): void {
    events.length = 0;
  },
};
