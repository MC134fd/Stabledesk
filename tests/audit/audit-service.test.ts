import { describe, it, expect } from 'vitest';
import { createAuditService } from '../../src/audit/audit-service.js';

let _n = 0;
function makeAudit() {
  return createAuditService({
    now: () => '2024-01-01T00:00:00.000Z',
    generateId: () => `audit_${++_n}`,
  });
}

// ---------------------------------------------------------------------------
describe('createAuditService — recordEvent', () => {
  it('records a scheduler_decision event with correct fields', () => {
    const svc = makeAudit();
    const event = svc.recordEvent('scheduler_decision', { actions: ['no_action'] });
    expect(event.type).toBe('scheduler_decision');
    expect(event.timestamp).toBe('2024-01-01T00:00:00.000Z');
    expect(event.id).toBeTruthy();
    expect((event.data as { actions: string[] }).actions).toEqual(['no_action']);
  });

  it('records a kamino_deposit_attempt event', () => {
    const svc = makeAudit();
    const event = svc.recordEvent('kamino_deposit_attempt', { depositAmount: 1000 });
    expect(event.type).toBe('kamino_deposit_attempt');
  });

  it('records a kamino_withdraw_attempt event', () => {
    const svc = makeAudit();
    const event = svc.recordEvent('kamino_withdraw_attempt', { withdrawAmount: 500 });
    expect(event.type).toBe('kamino_withdraw_attempt');
  });

  it('records a payment_status_change event', () => {
    const svc = makeAudit();
    const event = svc.recordEvent('payment_status_change', { id: 'pay_1', from: 'queued', to: 'ready' });
    expect(event.type).toBe('payment_status_change');
  });

  it('records an error event', () => {
    const svc = makeAudit();
    const event = svc.recordEvent('error', { message: 'something went wrong' });
    expect(event.type).toBe('error');
  });
});

// ---------------------------------------------------------------------------
describe('createAuditService — append-only behavior', () => {
  it('preserves insertion order', () => {
    const svc = makeAudit();
    svc.recordEvent('kamino_deposit_attempt');
    svc.recordEvent('kamino_deposit_success');
    svc.recordEvent('scheduler_decision');

    const events = svc.listEvents();
    expect(events[0]!.type).toBe('kamino_deposit_attempt');
    expect(events[1]!.type).toBe('kamino_deposit_success');
    expect(events[2]!.type).toBe('scheduler_decision');
  });

  it('listEvents returns a copy — external mutation does not affect the store', () => {
    const svc = makeAudit();
    svc.recordEvent('scheduler_decision');

    const first = svc.listEvents();
    first.pop(); // mutate the returned copy

    const second = svc.listEvents();
    expect(second).toHaveLength(1); // internal store unchanged
  });

  it('existing events are never mutated after recording', () => {
    const svc = makeAudit();
    const e = svc.recordEvent('scheduler_decision', { actions: ['no_action'] });
    const idBefore = e.id;

    svc.recordEvent('error'); // add a second event

    const stored = svc.listEvents()[0]!;
    expect(stored.id).toBe(idBefore);
    expect(stored.type).toBe('scheduler_decision');
  });
});

// ---------------------------------------------------------------------------
describe('createAuditService — queryEvents', () => {
  it('filters by event type', () => {
    const svc = makeAudit();
    svc.recordEvent('scheduler_decision');
    svc.recordEvent('error');
    svc.recordEvent('scheduler_decision');

    const decisions = svc.queryEvents({ type: 'scheduler_decision' });
    expect(decisions).toHaveLength(2);
    expect(decisions.every((e) => e.type === 'scheduler_decision')).toBe(true);
  });

  it('returns all events when no filter provided', () => {
    const svc = makeAudit();
    svc.recordEvent('scheduler_decision');
    svc.recordEvent('kamino_deposit_attempt');
    expect(svc.queryEvents()).toHaveLength(2);
  });

  it('returns empty array when no events match the filter', () => {
    const svc = makeAudit();
    svc.recordEvent('scheduler_decision');
    expect(svc.queryEvents({ type: 'error' })).toHaveLength(0);
  });

  it('returns empty array on a fresh service', () => {
    const svc = makeAudit();
    expect(svc.queryEvents()).toHaveLength(0);
    expect(svc.listEvents()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('createAuditService — date range filtering', () => {
  it('filters events on or after fromDate', () => {
    let ts = 0;
    const timestamps = [
      '2024-01-01T00:00:00.000Z',
      '2024-06-01T00:00:00.000Z',
      '2024-12-31T00:00:00.000Z',
    ];
    const svc = createAuditService({
      now: () => timestamps[ts++]!,
      generateId: () => `a_${ts}`,
    });
    svc.recordEvent('scheduler_decision');   // 2024-01-01
    svc.recordEvent('kamino_deposit_attempt'); // 2024-06-01
    svc.recordEvent('error');                 // 2024-12-31

    const result = svc.queryEvents({ fromDate: '2024-06-01T00:00:00.000Z' });
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe('kamino_deposit_attempt');
    expect(result[1]!.type).toBe('error');
  });

  it('filters events on or before toDate', () => {
    let ts = 0;
    const timestamps = [
      '2024-01-01T00:00:00.000Z',
      '2024-06-01T00:00:00.000Z',
      '2024-12-31T00:00:00.000Z',
    ];
    const svc = createAuditService({
      now: () => timestamps[ts++]!,
      generateId: () => `b_${ts}`,
    });
    svc.recordEvent('scheduler_decision');
    svc.recordEvent('kamino_deposit_attempt');
    svc.recordEvent('error');

    const result = svc.queryEvents({ toDate: '2024-06-01T00:00:00.000Z' });
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe('scheduler_decision');
    expect(result[1]!.type).toBe('kamino_deposit_attempt');
  });

  it('filters events within a fromDate + toDate range', () => {
    let ts = 0;
    const timestamps = [
      '2024-01-01T00:00:00.000Z',
      '2024-06-01T00:00:00.000Z',
      '2024-12-31T00:00:00.000Z',
    ];
    const svc = createAuditService({
      now: () => timestamps[ts++]!,
      generateId: () => `c_${ts}`,
    });
    svc.recordEvent('scheduler_decision');
    svc.recordEvent('kamino_deposit_attempt');
    svc.recordEvent('error');

    const result = svc.queryEvents({
      fromDate: '2024-01-02T00:00:00.000Z',
      toDate: '2024-11-30T00:00:00.000Z',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('kamino_deposit_attempt');
  });
});

// ---------------------------------------------------------------------------
describe('createAuditService — combined type + date filters', () => {
  it('filters by type AND fromDate together', () => {
    let ts = 0;
    const timestamps = [
      '2024-01-01T00:00:00.000Z',
      '2024-06-01T00:00:00.000Z',
      '2024-06-01T00:00:00.000Z',
      '2024-12-31T00:00:00.000Z',
    ];
    const svc = createAuditService({
      now: () => timestamps[ts++]!,
      generateId: () => `d_${ts}`,
    });
    svc.recordEvent('scheduler_decision');    // 2024-01-01
    svc.recordEvent('error');                 // 2024-06-01
    svc.recordEvent('scheduler_decision');    // 2024-06-01
    svc.recordEvent('scheduler_decision');    // 2024-12-31

    const result = svc.queryEvents({
      type: 'scheduler_decision',
      fromDate: '2024-06-01T00:00:00.000Z',
    });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.type === 'scheduler_decision')).toBe(true);
  });

  it('toDate boundary is inclusive — event at exact toDate timestamp is included', () => {
    let ts = 0;
    const timestamps = [
      '2024-06-01T00:00:00.000Z',
      '2024-06-02T00:00:00.000Z',
    ];
    const svc = createAuditService({
      now: () => timestamps[ts++]!,
      generateId: () => `e_${ts}`,
    });
    svc.recordEvent('scheduler_decision'); // 2024-06-01 — exactly at toDate
    svc.recordEvent('error');              // 2024-06-02 — after toDate

    const result = svc.queryEvents({ toDate: '2024-06-01T00:00:00.000Z' });
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('scheduler_decision');
  });
});

// ---------------------------------------------------------------------------
describe('createAuditService — instance isolation', () => {
  it('two separate instances do not share events', () => {
    const svc1 = createAuditService({ generateId: () => 'id1', now: () => '2024-01-01T00:00:00.000Z' });
    const svc2 = createAuditService({ generateId: () => 'id2', now: () => '2024-01-01T00:00:00.000Z' });

    svc1.recordEvent('scheduler_decision');
    expect(svc1.listEvents()).toHaveLength(1);
    expect(svc2.listEvents()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('createAuditService — event data', () => {
  it('records event without data — data field is absent', () => {
    const svc = makeAudit();
    const event = svc.recordEvent('error');
    expect(event.data).toBeUndefined();
  });

  it('records event with complex nested data', () => {
    const svc = makeAudit();
    const data = { nested: { count: 3, amounts: [100, 200, 300] }, ok: true };
    const event = svc.recordEvent('scheduler_decision', data);
    expect(event.data).toEqual(data);
  });
});
