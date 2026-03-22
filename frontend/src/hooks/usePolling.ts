import { useEffect, useRef, useCallback, useState } from 'react';

export function usePolling<T>(
  fetcher: () => Promise<T>,
  interval: number = 30_000,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(
    Math.floor(interval / 1000),
  );
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const countdownRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
      setSecondsUntilRefresh(Math.floor(interval / 1000));
    }
  }, [interval]);

  const refetch = useCallback(() => {
    setLoading(true);
    doFetch();
  }, [doFetch]);

  useEffect(() => {
    doFetch();
    timerRef.current = setInterval(doFetch, interval);
    countdownRef.current = setInterval(() => {
      setSecondsUntilRefresh((s) => (s > 0 ? s - 1 : Math.floor(interval / 1000)));
    }, 1000);

    return () => {
      clearInterval(timerRef.current);
      clearInterval(countdownRef.current);
    };
  }, [doFetch, interval]);

  return { data, loading, error, refetch, secondsUntilRefresh };
}
