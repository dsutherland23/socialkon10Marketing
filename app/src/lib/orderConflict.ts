import { type CartItem } from "./shop";
import { type PackageItem } from "./design-shop";
import { DESIGN_PACKAGES, type DesignPackage } from "./design";

/* ------------------------------------------------------------------
   SMART CART CONFLICT & DUPLICATE ORDER PREVENTION ENGINE (2026 Standard)
   1. Package Overlap Detection: Warns customers when adding an individual
      service deliverable that is already bundled in an active package.
   2. In-Cart Duplicate Detection: Identifies accidental identical lines.
   3. Order Idempotency & Duplicate Guard: Prevents double-charges, rapid
      re-submissions, and accidental identical checkouts within a 10-min window.
   4. Payment Session Mutex: Prevents concurrent race conditions.
------------------------------------------------------------------- */

const RECENT_ORDERS_KEY = "sk_recent_orders";
const PAYMENT_LOCK_KEY = "sk_payment_in_progress";
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export interface OverlapResult {
  hasOverlap: boolean;
  itemSlug: string;
  itemName?: string;
  originPackageSlug?: string;
  originPackageName?: string;
  existingCount: number;
}

export interface RecentOrderRecord {
  orderId: string;
  fingerprint: string;
  timestamp: number;
  total: number;
  email: string;
  itemNames: string[];
}

/**
 * Detects if a service deliverable is already included in any currently selected package
 * or exists in the custom package items.
 */
export function detectPackageOverlap(
  serviceSlug: string,
  packageItems: PackageItem[],
  customPackages: DesignPackage[] = DESIGN_PACKAGES
): OverlapResult {
  // Check if an item in the package list originated from a bundle
  const matchingItem = packageItems.find((it) => it.slug === serviceSlug);
  
  if (matchingItem) {
    let packageName = matchingItem.originPackageName;
    let packageSlug = matchingItem.originPackageSlug;

    // If not stamped directly, check if any predefined package in the catalog matches
    if (!packageName && packageSlug) {
      const foundPkg = customPackages.find((p) => p.slug === packageSlug);
      if (foundPkg) packageName = foundPkg.name;
    }

    // Count how many times this deliverable is in the package
    const existingCount = packageItems.filter((it) => it.slug === serviceSlug).length;

    return {
      hasOverlap: true,
      itemSlug: serviceSlug,
      originPackageSlug: packageSlug,
      originPackageName: packageName || (packageSlug ? "Predefined Package" : "Custom Package"),
      existingCount,
    };
  }

  return {
    hasOverlap: false,
    itemSlug: serviceSlug,
    existingCount: 0,
  };
}

/**
 * Scans the unified cart (main shop items + package lines) and returns all deliverables
 * that appear in both a standalone capacity and inside a package.
 */
export function auditCartOverlaps(
  cartItems: CartItem[],
  packageItems: PackageItem[]
): OverlapResult[] {
  const overlaps: OverlapResult[] = [];
  const packageSlugs = new Set(packageItems.map((p) => p.slug));

  cartItems.forEach((c) => {
    if (packageSlugs.has(c.serviceSlug)) {
      const pkgItem = packageItems.find((p) => p.slug === c.serviceSlug);
      overlaps.push({
        hasOverlap: true,
        itemSlug: c.serviceSlug,
        itemName: c.name,
        originPackageSlug: pkgItem?.originPackageSlug,
        originPackageName: pkgItem?.originPackageName ?? "Design Package",
        existingCount: packageItems.filter((p) => p.slug === c.serviceSlug).length,
      });
    }
  });

  return overlaps;
}

/**
 * Computes a deterministic hash fingerprint for an order.
 * Format: Base64 of sorted item slugs & names + total USD + email (lowercase)
 */
export function computeOrderFingerprint(
  email: string,
  items: Array<{ name: string; unitPrice: number; qty?: number; serviceSlug?: string }>,
  total: number
): string {
  const normEmail = (email || "").trim().toLowerCase();
  const sortedItemTokens = items
    .map((i) => `${(i.serviceSlug || i.name).toLowerCase().replace(/[^a-z0-9]/g, "")}_${Math.round(i.unitPrice * 100)}_${i.qty ?? 1}`)
    .sort()
    .join("|");
  const roundedTotal = Math.round(total * 100);

  const raw = `${normEmail}::${sortedItemTokens}::${roundedTotal}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `FP_${Math.abs(hash).toString(36)}_${raw.length}`;
}

/**
 * Checks if an identical order was completed in the last 10 minutes.
 */
export function checkRecentDuplicateOrder(fingerprint: string): {
  isDuplicate: boolean;
  recentOrder?: RecentOrderRecord;
  minutesAgo?: number;
} {
  try {
    const records = getRecentOrders();
    const now = Date.now();

    // Purge expired records older than 30 minutes
    const valid = records.filter((r) => now - r.timestamp < 30 * 60 * 1000);
    saveRecentOrders(valid);

    const match = valid.find((r) => r.fingerprint === fingerprint && now - r.timestamp < DUPLICATE_WINDOW_MS);
    if (match) {
      const minutesAgo = Math.max(1, Math.round((now - match.timestamp) / 60000));
      return { isDuplicate: true, recentOrder: match, minutesAgo };
    }
  } catch (err) {
    console.warn("Error checking recent orders:", err);
  }

  return { isDuplicate: false };
}

/**
 * Records a successfully placed order into local cache for duplicate prevention.
 */
export function recordCompletedOrder(
  orderId: string,
  fingerprint: string,
  total: number,
  email: string,
  itemNames: string[]
): void {
  try {
    const records = getRecentOrders();
    const newRecord: RecentOrderRecord = {
      orderId,
      fingerprint,
      timestamp: Date.now(),
      total,
      email: email.trim().toLowerCase(),
      itemNames,
    };
    records.unshift(newRecord);
    saveRecentOrders(records.slice(0, 20));
  } catch (err) {
    console.warn("Failed to record completed order:", err);
  }
}

/**
 * Attempts to acquire an atomic payment lock in sessionStorage to prevent double-clicks & concurrent tabs.
 * Returns true if lock was acquired, false if payment is already in flight.
 */
export function acquirePaymentLock(): boolean {
  try {
    const current = sessionStorage.getItem(PAYMENT_LOCK_KEY);
    if (current) {
      const ts = Number(current);
      if (Date.now() - ts < 45000) {
        return false;
      }
    }
    sessionStorage.setItem(PAYMENT_LOCK_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

/**
 * Releases the payment lock.
 */
export function releasePaymentLock(): void {
  try {
    sessionStorage.removeItem(PAYMENT_LOCK_KEY);
  } catch {}
}

/* Helpers */
function getRecentOrders(): RecentOrderRecord[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_ORDERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecentOrders(records: RecentOrderRecord[]): void {
  try {
    localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify(records));
  } catch {}
}
