/**
 * Safe localStorage wrapper with QuotaExceededError handling and recovery.
 *
 * Browsers enforce a strict ~5MB quota on localStorage per origin. When large
 * items (like base64 image uploads or editor drafts) fill the storage, normal
 * setItem calls throw an unhandled QuotaExceededError that crashes the React tree.
 *
 * This utility provides:
 * 1. Safe setItem with try/catch protection.
 * 2. Automatic eviction of non-critical heavy caches (drafts, uploads, rate cache) on quota failure.
 * 3. Graceful fallback so commerce features (cart, currency, favorites) never crash the app.
 */

const NON_CRITICAL_PREFIXES = [
  "sk-draft-",
  "sk-version-",
  "sk-user-uploads",
  "sk-brand-logos",
  "sk-recent-",
  "sk-rates-cache",
  "sk-hand-tug",
  "sk_egg_",
  "sk-studio-",
];

/** Evicts non-critical keys to free space for critical data (like cart). */
function evictNonCriticalStorage(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && NON_CRITICAL_PREFIXES.some((p) => k.startsWith(p))) {
        keysToRemove.push(k);
      }
    }
    if (keysToRemove.length === 0) return false;
    for (const k of keysToRemove) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
    return true;
  } catch {
    return false;
  }
}

export const safeStorage = {
  getItem<T = string>(key: string, fallback: T | null = null): T | string | null {
    if (typeof window === "undefined" || !window.localStorage) return fallback;
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch {
      return fallback;
    }
  },

  getJSON<T>(key: string, fallback: T): T {
    const raw = safeStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  setItem(key: string, value: string): boolean {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (err: unknown) {
      const isQuota =
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" ||
          err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
          err.code === 22 ||
          err.code === 1014);

      if (isQuota) {
        console.warn(`[safeStorage] Quota exceeded while saving "${key}". Evicting non-critical caches...`);
        const evicted = evictNonCriticalStorage();
        if (evicted) {
          try {
            localStorage.setItem(key, value);
            console.info(`[safeStorage] Successfully saved "${key}" after storage cleanup.`);
            return true;
          } catch {
            console.error(`[safeStorage] Storage still full after eviction. Could not save "${key}".`);
          }
        }
      } else {
        console.warn(`[safeStorage] Failed to set "${key}":`, err);
      }
      return false;
    }
  },

  setJSON(key: string, value: unknown): boolean {
    try {
      return safeStorage.setItem(key, JSON.stringify(value));
    } catch {
      return false;
    }
  },

  removeItem(key: string): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/** Runs once on app startup to free space if localStorage is near or over quota. */
export function cleanStorageIfNeeded(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const testKey = "__sk_quota_test__";
    localStorage.setItem(testKey, "1".repeat(2048));
    localStorage.removeItem(testKey);
  } catch {
    console.warn("[safeStorage] Storage quota full on startup. Evicting heavy non-critical caches...");
    evictNonCriticalStorage();
  }
}
