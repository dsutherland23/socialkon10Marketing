/* ------------------------------------------------------------------
   LIVE EXCHANGE RATES (display-only conversion)
   Source: open.er-api.com (free, keyless, CORS-enabled) — USD base.
   Strategy: fetch once per session → cache 12h in localStorage →
   fall back to the cached snapshot, then to static estimates.
   BMD stays a fixed 1:1 USD peg (not market-traded).
   Prices are always SETTLED in USD; converted figures are
   reference-only, so a stale rate can never cause a mischarge.
------------------------------------------------------------------- */

const CACHE_KEY = "sk-fx-rates";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const FEED_URL = "https://open.er-api.com/v6/latest/USD";

type CurrencyCode = "USD" | "BMD" | "JMD" | "CAD";

export interface FxSnapshot {
  rates: Partial<Record<CurrencyCode, number>>;
  /** epoch ms of the feed's own update time */
  fetchedAt: number;
  live: boolean;
}

/** Static fallbacks (mirror of the catalog estimates) — used before first fetch / if the feed is unreachable. */
const STATIC_RATES: Record<CurrencyCode, number> = { USD: 1, BMD: 1, JMD: 160, CAD: 1.36 };

/* module-level live state — formatMoney reads getRate() synchronously */
let current: FxSnapshot = loadCached() ?? {
  rates: { ...STATIC_RATES },
  fetchedAt: 0,
  live: false,
};
let inflight: Promise<boolean> | null = null;

function loadCached(): FxSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as FxSnapshot;
    if (!snap || typeof snap !== "object" || !snap.rates) return null;
    return { ...snap, live: Date.now() - snap.fetchedAt < CACHE_TTL_MS };
  } catch {
    return null;
  }
}

/** Current display rate for a currency (USD base). Never throws. */
export function getRate(code: CurrencyCode): number {
  return current.rates[code] ?? STATIC_RATES[code] ?? 1;
}

/** Snapshot info for UI indicators ("live" vs "estimated"). */
export function fxStatus(): FxSnapshot {
  return current;
}

/**
 * Refresh rates from the live feed. Resolves true if rates changed.
 * Safe to call on every app boot — dedupes concurrent calls and
 * respects the 12h cache TTL. Never rejects.
 */
export async function refreshRates(force = false): Promise<boolean> {
  if (!force && Date.now() - current.fetchedAt < CACHE_TTL_MS && current.live) return false;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(FEED_URL, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`fx feed ${res.status}`);
      const data = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_unix?: number };
      if (data.result !== "success" || !data.rates) throw new Error("fx feed malformed");

      const next: FxSnapshot = {
        rates: {
          USD: 1,
          BMD: 1, // 1:1 peg — not floated
          JMD: typeof data.rates.JMD === "number" ? data.rates.JMD : STATIC_RATES.JMD,
          CAD: typeof data.rates.CAD === "number" ? data.rates.CAD : STATIC_RATES.CAD,
        },
        fetchedAt: (data.time_last_update_unix ?? Math.floor(Date.now() / 1000)) * 1000,
        live: true,
      };
      const changed = (Object.keys(next.rates) as CurrencyCode[]).some(
        (k) => Math.abs((next.rates[k] ?? 1) - getRate(k)) > 1e-9,
      );
      current = next;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* cache best-effort */ }
      return changed;
    } catch (err) {
      console.warn("FX feed unavailable — using cached/estimated rates:", err);
      return false;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
