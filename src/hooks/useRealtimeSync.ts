import { useState, useEffect, useCallback, useRef } from 'react';

interface UseRealtimeSyncOptions {
  groupIds?: string[] | string;
  onRefresh?: () => void;
  enabled?: boolean;
  label?: string;
  intervalMs?: number;
}

export function useRealtimeSync({
  groupIds = [],
  onRefresh,
  enabled = true,
  label = 'RealtimeSync',
  intervalMs = 15000,
}: UseRealtimeSyncOptions) {
  const [isRealtimeActive, setIsRealtimeActive] = useState(true);
  const [isPollingFallback, setIsPollingFallback] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const refreshNow = useCallback(() => {
    setLastEventAt(new Date());
    if (onRefreshRef.current) {
      onRefreshRef.current();
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Escuchar eventos globales del navegador emitidos por acciones de la app
    const handleGlobalSync = () => {
      setLastEventAt(new Date());
      if (onRefreshRef.current) {
        onRefreshRef.current();
      }
    };

    window.addEventListener('flowmoney_data_changed', handleGlobalSync);
    window.addEventListener('group_created', handleGlobalSync);
    window.addEventListener('expense_created', handleGlobalSync);
    window.addEventListener('expense_updated', handleGlobalSync);
    window.addEventListener('expense_deleted', handleGlobalSync);

    // Intentar conexión SSE si hay soporte
    let eventSource: EventSource | null = null;
    try {
      const groupParam = Array.isArray(groupIds) ? groupIds.join(',') : (groupIds || '');
      const sseUrl = `/api/realtime/stream${groupParam ? `?groups=${groupParam}` : ''}`;
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        setIsRealtimeActive(true);
        setIsPollingFallback(false);
      };

      eventSource.onmessage = () => {
        setLastEventAt(new Date());
        if (onRefreshRef.current) {
          onRefreshRef.current();
        }
      };

      eventSource.onerror = () => {
        setIsRealtimeActive(false);
        setIsPollingFallback(true);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
      };
    } catch {
      setIsRealtimeActive(false);
      setIsPollingFallback(true);
    }

    // Polling de respaldo
    const timer = setInterval(() => {
      if (onRefreshRef.current) {
        onRefreshRef.current();
      }
    }, intervalMs);

    return () => {
      window.removeEventListener('flowmoney_data_changed', handleGlobalSync);
      window.removeEventListener('group_created', handleGlobalSync);
      window.removeEventListener('expense_created', handleGlobalSync);
      window.removeEventListener('expense_updated', handleGlobalSync);
      window.removeEventListener('expense_deleted', handleGlobalSync);
      clearInterval(timer);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [enabled, JSON.stringify(groupIds), intervalMs]);

  return {
    isRealtimeActive,
    isPollingFallback,
    lastEventAt,
    refreshNow,
  };
}
