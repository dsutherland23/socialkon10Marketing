/* ------------------------------------------------------------------
   CHECKOUT CONFIGURATION & ORDER REFERENCE ORCHESTRATION
   Firebase-bound half of the dual-mode checkout system.
   Pure logic lives in order-utils.ts (unit-tested).

   Storage: settings/site document, `checkout` field.
   - Public READ (the storefront must know the active mode)
   - Admin-only WRITE (Firestore rules) + audit log entry on change
   Client-side settings are a display convenience; the rules enforce
   that only admins can change them, and clients can never create
   orders with a paid state (see firestore.rules).
------------------------------------------------------------------- */

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, firebaseReady } from "./firebase";
import { getSettings, saveSettings, logAudit, idbGet, idbSet } from "./backend";
import {
  DEFAULT_CHECKOUT_SETTINGS,
  generateOrderReference,
  normalizeCheckoutSettings,
  type CheckoutSettings,
} from "./order-utils";

export async function getCheckoutSettings(): Promise<CheckoutSettings> {
  try {
    const s = await getSettings();
    return normalizeCheckoutSettings((s as { checkout?: unknown }).checkout);
  } catch {
    return DEFAULT_CHECKOUT_SETTINGS;
  }
}

/**
 * Persist checkout settings (admin only — enforced by Firestore rules).
 * Every change is audit-logged with before/after state.
 */
export async function saveCheckoutSettings(next: CheckoutSettings, actor: string): Promise<void> {
  const current = await getSettings();
  const before = normalizeCheckoutSettings((current as { checkout?: unknown }).checkout);
  await saveSettings({ ...current, checkout: next });
  try {
    await logAudit({
      user: actor || "admin",
      action: "checkout_settings_changed",
      entity: "settings:checkout",
      before,
      after: next,
    });
  } catch (err) {
    console.warn("checkout settings audit log failed (settings were saved):", err);
  }
}

/** React hook: live checkout settings, refreshed whenever admin content changes. */
export function useCheckoutSettings(): { settings: CheckoutSettings; loading: boolean; reload: () => void } {
  const [settings, setSettings] = useState<CheckoutSettings>(DEFAULT_CHECKOUT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    void getCheckoutSettings().then((s) => {
      if (!active) return;
      setSettings(s);
      setLoading(false);
    });
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener("sk-content-changed", onChange);
    return () => {
      active = false;
      window.removeEventListener("sk-content-changed", onChange);
    };
  }, [tick]);

  return { settings, loading, reload: () => setTick((t) => t + 1) };
}

/* ---------------- public order reference reservation ---------------- */

const LOCAL_REFS_KEY = "sk-order-refs";

/**
 * Reserve a unique, human-readable public order reference.
 *
 * Production: the reference is the document ID of an `orderRefs/{ref}`
 * doc. Firestore security rules make that collection create-only, so a
 * collision (or a racing tab) fails the write and we retry with a fresh
 * random suffix. The order document then carries the reserved reference;
 * the reservation doc is immutable and never exposed publicly.
 *
 * Demo mode (no Firebase): reserved against the local reference list.
 */
export async function reserveOrderReference(): Promise<string> {
  let reservationUnavailable = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const ref = generateOrderReference();
    if (firebaseReady && db) {
      try {
        // setDoc WITHOUT merge on a non-existent doc = create; rules deny
        // create when the doc already exists → collision throws → retry.
        await setDoc(doc(db, "orderRefs", ref), { createdAt: new Date().toISOString() });
        return ref;
      } catch (err) {
        const code = (err as { code?: string })?.code ?? "";
        if (code === "permission-denied" || code === "unauthenticated" || code === "failed-precondition") {
          // Rules not yet deployed / collection not writable from this client.
          // A missing reservation must never block checkout: the reference is
          // still unique in practice (date bucket + 28M random suffixes) and
          // the order document itself carries it. Surface a deploy warning
          // and continue with the unreserved reference.
          console.warn(`[checkout] orderRefs reservation unavailable (${code}) — proceeding with unreserved reference. Deploy firestore.rules to enable collision-proof reservations.`);
          reservationUnavailable = true;
          break;
        }
        continue; // genuine collision or transient error — draw a new suffix
      }
    }
    const existing = (await idbGet<string[]>(LOCAL_REFS_KEY)) ?? [];
    if (!existing.includes(ref)) {
      await idbSet(LOCAL_REFS_KEY, [ref, ...existing].slice(0, 500));
      return ref;
    }
  }
  // Degraded path: rules/collection unavailable — issue an unreserved
  // reference rather than failing the customer's order request.
  if (reservationUnavailable) return generateOrderReference();
  // Astronomically unlikely, but never silently reuse a reference.
  throw new Error("Could not allocate a unique order reference — please try again.");
}

/** Verify a reference reservation is still held (diagnostics / tests). */
export async function referenceExists(ref: string): Promise<boolean> {
  if (firebaseReady && db) {
    try {
      const snap = await getDoc(doc(db, "orderRefs", ref));
      return snap.exists();
    } catch {
      return false;
    }
  }
  const existing = (await idbGet<string[]>(LOCAL_REFS_KEY)) ?? [];
  return existing.includes(ref);
}
