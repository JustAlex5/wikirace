import { useEffect, useState } from 'react';

/** Milliseconds elapsed since `startedAt`, frozen at `finishedAt` once set. */
export function useElapsed(startedAt: number | null, finishedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  const running = startedAt !== null && finishedAt === null;

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [running]);

  if (startedAt === null) return 0;
  return Math.max(0, (finishedAt ?? now) - startedAt);
}
