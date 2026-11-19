import { useState, useEffect } from 'react';

/**
 * Hook that returns current Date and automatically refreshes:
 * 1. On document visibility change (e.g. laptop lid opened or tab focused after sleeping for a day or more)
 * 2. On window focus
 * 3. On a regular tick interval (default every 1 minute)
 * 
 * Ensures relative due dates ("Today", "Tomorrow") never freeze or stay stale across machine sleep.
 */
export function useNow(intervalMs: number = 60000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const update = () => {
      setNow(new Date());
    };

    const timer = setInterval(update, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        update();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', update);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', update);
    };
  }, [intervalMs]);

  return now;
}
