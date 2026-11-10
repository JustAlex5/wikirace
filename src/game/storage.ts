export interface KeyValueStorage {
  readonly persistent: boolean;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    persistent: false,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/**
 * Wraps localStorage so that private browsing modes, disabled storage or
 * quota errors degrade to an in-memory store instead of breaking the game.
 */
export function createSafeStorage(getBackend: () => Storage | null | undefined = () => window.localStorage): KeyValueStorage {
  const fallback = memoryStorage();
  let backend: Storage | null = null;
  try {
    const candidate = getBackend() ?? null;
    if (candidate) {
      const probe = '__wikirace_probe__';
      candidate.setItem(probe, probe);
      candidate.removeItem(probe);
      backend = candidate;
    }
  } catch {
    backend = null;
  }
  if (!backend) return fallback;
  const store = backend;

  return {
    persistent: true,
    getItem(key) {
      try {
        return store.getItem(key) ?? fallback.getItem(key);
      } catch {
        return fallback.getItem(key);
      }
    },
    setItem(key, value) {
      fallback.setItem(key, value);
      try {
        store.setItem(key, value);
      } catch {
        // Quota exceeded or storage revoked: keep the in-memory copy.
      }
    },
    removeItem(key) {
      fallback.removeItem(key);
      try {
        store.removeItem(key);
      } catch {
        // Ignore.
      }
    },
  };
}
