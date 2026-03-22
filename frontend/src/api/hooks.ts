import { useState, useCallback } from 'react';
import { apiGet, apiPost } from './client';
import { usePolling } from '../hooks/usePolling';
import { REFRESH_INTERVAL } from '../lib/constants';
import type {
  TreasuryStateResponse,
  PaymentResponse,
  PaymentStatus,
  LendingResponse,
  BestApyResponse,
  AuditEvent,
  HealthResponse,
  CreatePaymentInput,
  StablecoinOption,
} from './types';

export function useTreasuryState() {
  return usePolling(
    () => apiGet<TreasuryStateResponse>('/state'),
    REFRESH_INTERVAL,
  );
}

export function usePayments(status?: PaymentStatus) {
  const path = status ? `/payments?status=${status}` : '/payments';
  return usePolling(
    () => apiGet<PaymentResponse[]>(path),
    REFRESH_INTERVAL,
  );
}

export function useAudit(opts?: { action?: string; since?: string }) {
  const params = new URLSearchParams();
  if (opts?.action) params.set('action', opts.action);
  if (opts?.since) params.set('since', opts.since);
  const query = params.toString();
  const path = query ? `/audit?${query}` : '/audit';
  return usePolling(
    () => apiGet<AuditEvent[]>(path),
    REFRESH_INTERVAL,
  );
}

export function useLending() {
  return usePolling(
    () => apiGet<LendingResponse>('/lending'),
    REFRESH_INTERVAL,
  );
}

export function useBestApy(token: string) {
  return usePolling(
    () => apiGet<BestApyResponse>(`/lending/best-apy/${token}`),
    REFRESH_INTERVAL,
  );
}

export function useStablecoins() {
  return usePolling(
    () => apiGet<StablecoinOption[]>('/stablecoins'),
    REFRESH_INTERVAL,
  );
}

export function useHealth() {
  return usePolling(
    () => apiGet<HealthResponse>('/health'),
    REFRESH_INTERVAL,
  );
}

export function useCreatePayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async (input: CreatePaymentInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<PaymentResponse>('/payments', input);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
}

export function useProcessPayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<PaymentResponse>(`/payments/${id}/process`);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
}

export function useSetExecutionMode() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async (mode: 'auto' | 'manual') => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<{ mode: string }>('/settings/execution-mode', { mode });
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
}

export function useExecute() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiPost<{ signatures: string[] }>('/execute');
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { mutate, loading, error };
}
