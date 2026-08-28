import {
  addDoc, collection, doc, getDocs, getDoc, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, deleteDoc, onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, getBytes, deleteObject } from "firebase/storage";
import type { User } from "firebase/auth";
import { db, storage, firebaseReady } from "./firebase";
import type { CartItem } from "./shop";

/* ------------------------------------------------------------------
   BACKEND LAYER — Firestore + Storage
   When Firebase isn't configured, everything falls back to
   localStorage so the site remains fully demo-able.
------------------------------------------------------------------- */

export const ORDER_STATUSES = [
  "ORDER RECEIVED", "DISCOVERY", "CONCEPT", "CLIENT REVIEW",
  "REVISION", "FINAL APPROVAL", "DELIVERED", "COMPLETED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderRecord {
  id: string;
  uid: string | null;
  email: string;
  name: string;
  company: string;
  items: { name: string; serviceSlug?: string; tierLabel?: string; unitPrice: number; addons: { name: string; price: number }[]; rush: boolean; billing: string; templateSlug?: string; license?: string; version?: string }[];
  subtotal: number;
  discount: number;
  total: number;
  payMode: "deposit" | "full";
  amountPaid: number;
  balanceDue: number;
  promo: string | null;
  details: Record<string, string>;
  files: { name: string; size: number; path?: string }[];
  status: OrderStatus;
  createdAt: string;
  /** set automatically when status → COMPLETED (history archive); cleared if the order is reopened */
  completedAt?: string | null;
  /** chat read-tracking: set when the client posts; studioReadAt when the studio views the thread */
  lastClientMessageAt?: string;
  lastClientMessageBy?: string;
  studioReadAt?: string;
  /** chat read-tracking: set when the studio posts; clientReadAt when the client views the thread */
  lastStudioMessageAt?: string;
  lastStudioMessageBy?: string;
  clientReadAt?: string;
}

export interface LeadRecord {
  id: string;
  intent: string;
  dept: string | null;
  service: string | null;
  name: string;
  email: string;
  company: string;
  budget?: string;
  timeline?: string;
  date?: string;
  time?: string;
  message: string;
  status: "new" | "contacted" | "converted" | "closed";
  createdAt: string;
  /** First-party attribution (Website Intelligence PRD) */
  session_id?: string | null;
  first_touch_source?: string | null;
  first_touch_medium?: string | null;
  first_touch_campaign?: string | null;
  first_touch_content?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  services_viewed?: string[];
  engagement_score?: number;
}

export interface ServiceOverride {
  price?: number;
  depositPct?: number;
  revisions?: number;
  enabled?: boolean;
  featured?: boolean;
  name?: string;
  tagline?: string;
  description?: string;
  timeline?: string;
  deliverables?: string[];
}

/* ---------------- demo fallback (IndexedDB + localStorage hybrid) ---------------- */

const DB_NAME = "sk_local_files_db";
const STORE_BINARIES = "binaries";
const STORE_DATA = "data";

let dbPromise: Promise<IDBDatabase> | null = null;

function openAppDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB not available"));
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE_BINARIES)) {
        d.createObjectStore(STORE_BINARIES);
      }
      if (!d.objectStoreNames.contains(STORE_DATA)) {
        d.createObjectStore(STORE_DATA);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openAppDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_DATA, "readonly");
      const req = tx.objectStore(STORE_DATA).get(key);
      req.onsuccess = () => {
        if (req.result !== undefined && req.result !== null) {
          resolve(req.result as T);
        } else {
          // fallback to localStorage for legacy data
          try {
            const raw = localStorage.getItem(key);
            resolve(raw ? (JSON.parse(raw) as T) : null);
          } catch {
            resolve(null);
          }
        }
      };
      req.onerror = () => {
        try {
          const raw = localStorage.getItem(key);
          resolve(raw ? (JSON.parse(raw) as T) : null);
        } catch {
          resolve(null);
        }
      };
    });
  } catch {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}

export async function idbSet(key: string, val: unknown): Promise<void> {
  // 1. Primary write to IndexedDB (virtually unlimited quota for large PSDs)
  try {
    const db = await openAppDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DATA, "readwrite");
      tx.objectStore(STORE_DATA).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("idbSet error:", err);
  }

  // 2. Best-effort mirror to localStorage (silently ignore QuotaExceededError)
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // Quota exceeded in localStorage — safely ignored because IndexedDB has the full data!
  }
}

const ls = {
  read<T>(key: string): T[] {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
  },
  write(key: string, v: unknown) {
    void idbSet(key, v);
  },
};

/** Notify the content provider to refetch — admin edits go live instantly. */
function notifyContentChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("sk-content-changed"));
}

/** Firestore Timestamp | ISO string → ISO string (undefined when absent). */
const tsToIso = (v: unknown): string | undefined => {
  const t = (v as { toDate?: () => Date } | null | undefined)?.toDate?.()?.toISOString?.();
  if (t) return t;
  return typeof v === "string" && v ? v : undefined;
};

/** True when the client has posted in the project chat since the studio last viewed it. */
export const orderHasUnreadClientMessage = (o: OrderRecord): boolean =>
  !!o.lastClientMessageAt && (!o.studioReadAt || o.lastClientMessageAt > o.studioReadAt);

/** True when the studio has posted in the project chat since the client last viewed it. */
export const orderHasUnreadStudioMessage = (o: OrderRecord): boolean =>
  !!o.lastStudioMessageAt && (!o.clientReadAt || o.lastStudioMessageAt > o.clientReadAt);

function normalizeOrder(id: string, data: Record<string, unknown>): OrderRecord {
  const rec: OrderRecord = {
    ...(data as unknown as OrderRecord),
    id,
    files: Array.isArray(data.files) ? (data.files as OrderRecord["files"]) : [],
    createdAt: tsToIso(data.createdAt) ?? "",
  };
  const lc = tsToIso(data.lastClientMessageAt);
  const sr = tsToIso(data.studioReadAt);
  const ls = tsToIso(data.lastStudioMessageAt);
  const cr = tsToIso(data.clientReadAt);
  if (lc) rec.lastClientMessageAt = lc; else delete rec.lastClientMessageAt;
  if (sr) rec.studioReadAt = sr; else delete rec.studioReadAt;
  if (ls) rec.lastStudioMessageAt = ls; else delete rec.lastStudioMessageAt;
  if (cr) rec.clientReadAt = cr; else delete rec.clientReadAt;
  const ca = tsToIso(data.completedAt);
  if (ca) rec.completedAt = ca; else delete rec.completedAt;
  return rec;
}

/** History membership: an order auto-archives the moment it's tagged COMPLETED. */
export const isOrderHistory = (o: OrderRecord): boolean => o.status === "COMPLETED";

/* ---------------- orders ---------------- */

export async function createOrder(
  data: Omit<OrderRecord, "id" | "status" | "createdAt" | "uid">,
  user: User | null
): Promise<string> {
  const base = { ...data, uid: user?.uid ?? null, status: "ORDER RECEIVED" as OrderStatus };
  if (!firebaseReady || !db) {
    const id = `SK-DEMO-${String(Date.now()).slice(-6)}`;
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    orders.unshift({ ...base, id, createdAt: new Date().toISOString() });
    await idbSet("sk-demo-orders", orders);
    window.dispatchEvent(new CustomEvent("sk-order-complete"));
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
    return id;
  }
  const refDoc = await addDoc(collection(db, "orders"), { ...base, createdAt: serverTimestamp() });
  window.dispatchEvent(new CustomEvent("sk-order-complete"));
  window.dispatchEvent(new CustomEvent("sk-order-updated"));
  return refDoc.id;
}

/** Link any orders placed with this email (before sign-up) to the account. */
export async function claimOrders(user: User): Promise<{ claimed: number; error?: string }> {
  let claimed = 0;
  // 1. Claim local demo orders if any
  try {
    const demoOrders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    let demoUpdated = false;
    demoOrders.forEach((o) => {
      if (user.email && o.email?.toLowerCase() === user.email.toLowerCase() && o.uid !== user.uid) {
        o.uid = user.uid;
        demoUpdated = true;
        claimed++;
      }
    });
    if (demoUpdated) await idbSet("sk-demo-orders", demoOrders);
  } catch {}

  // 2. Claim Firestore orders
  if (firebaseReady && db && user.email) {
    try {
      const emailLower = user.email.toLowerCase();
      const docsToUpdate = new Map<string, any>();

      const q1 = query(collection(db, "orders"), where("email", "==", user.email));
      const snap1 = await getDocs(q1);
      snap1.docs.forEach((d) => {
        const data = d.data();
        if (data.uid !== user.uid) docsToUpdate.set(d.id, d);
      });

      if (user.email !== emailLower) {
        const q2 = query(collection(db, "orders"), where("email", "==", emailLower));
        const snap2 = await getDocs(q2);
        snap2.docs.forEach((d) => {
          const data = d.data();
          if (data.uid !== user.uid) docsToUpdate.set(d.id, d);
        });
      }

      const updates = Array.from(docsToUpdate.values()).map((d) => updateDoc(d.ref, { uid: user.uid }));
      await Promise.all(updates);
      claimed += updates.length;
    } catch (err) {
      console.warn("claimOrders failed:", err);
    }
  }
  return { claimed };
}

export async function listMyOrders(user: User | null): Promise<OrderRecord[]> {
  if (!user) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    return orders.map((o) => ({ ...o, files: Array.isArray(o.files) ? o.files : [] }));
  }

  const orderMap = new Map<string, OrderRecord>();

  // If Firebase is available, query Firestore by uid and email
  if (firebaseReady && db) {
    try {
      const qUid = query(collection(db, "orders"), where("uid", "==", user.uid));
      const snapUid = await getDocs(qUid);
      snapUid.docs.forEach((d) => {
        const ord = normalizeOrder(d.id, d.data());
        orderMap.set(d.id, ord);
      });
    } catch (err) {
      console.warn("listMyOrders uid query error:", err);
    }

    if (user.email) {
      try {
        const emailLower = user.email.toLowerCase();
        const qEmail = query(collection(db, "orders"), where("email", "==", user.email));
        const snapEmail = await getDocs(qEmail);
        snapEmail.docs.forEach((d) => {
          if (!orderMap.has(d.id)) {
            orderMap.set(d.id, normalizeOrder(d.id, d.data()));
          }
        });

        if (emailLower !== user.email) {
          const qEmailLower = query(collection(db, "orders"), where("email", "==", emailLower));
          const snapEmailLower = await getDocs(qEmailLower);
          snapEmailLower.docs.forEach((d) => {
            if (!orderMap.has(d.id)) {
              orderMap.set(d.id, normalizeOrder(d.id, d.data()));
            }
          });
        }
      } catch (err) {
        console.warn("listMyOrders email query error:", err);
      }
    }
  }

  // Also include local demo orders matching user uid or email
  try {
    const demoOrders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    demoOrders.forEach((o) => {
      if (!o.id) return;
      const matchUid = o.uid && o.uid === user.uid;
      const matchEmail = user.email && o.email?.toLowerCase() === user.email.toLowerCase();
      if ((matchUid || matchEmail || !firebaseReady) && !orderMap.has(o.id)) {
        orderMap.set(o.id, { ...o, files: Array.isArray(o.files) ? o.files : [] });
      }
    });
  } catch {}

  return Array.from(orderMap.values()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function listAllOrders(): Promise<OrderRecord[]> {
  if (!firebaseReady || !db) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    return orders.map((o) => ({ ...o, files: Array.isArray(o.files) ? o.files : [] }));
  }
  try {
    const snap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc")));
    const firestoreOrders = snap.docs.map((d) => normalizeOrder(d.id, d.data()));
    const localOrders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    const orderMap = new Map<string, OrderRecord>();
    firestoreOrders.forEach((o) => orderMap.set(o.id, o));
    localOrders.forEach((o) => { if (!orderMap.has(o.id)) orderMap.set(o.id, o); });
    return Array.from(orderMap.values()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  } catch {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    return orders.map((o) => ({ ...o, files: Array.isArray(o.files) ? o.files : [] }));
  }
}

/** Real-time subscriber for all orders (Studio Cockpit / Admin) with Firestore onSnapshot + instant local event reactivity. */
export function subscribeAllOrders(callback: (orders: OrderRecord[]) => void): () => void {
  let unsubFirestore: (() => void) | null = null;
  let active = true;

  const fetchAndNotify = async () => {
    const orders = await listAllOrders();
    if (active) callback(orders);
  };

  if (firebaseReady && db) {
    try {
      const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
      unsubFirestore = onSnapshot(
        q,
        async (snap) => {
          if (!active) return;
          const firestoreOrders = snap.docs.map((d) => normalizeOrder(d.id, d.data()));
          const localOrders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
          const orderMap = new Map<string, OrderRecord>();
          firestoreOrders.forEach((o) => orderMap.set(o.id, o));
          localOrders.forEach((o) => { if (!orderMap.has(o.id)) orderMap.set(o.id, o); });
          const merged = Array.from(orderMap.values()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
          callback(merged);
        },
        (err) => {
          console.warn("subscribeAllOrders firestore snapshot error, using polling fallback:", err);
          void fetchAndNotify();
        }
      );
    } catch {
      void fetchAndNotify();
    }
  } else {
    void fetchAndNotify();
  }

  const handleLocalEvent = () => { void fetchAndNotify(); };
  window.addEventListener("sk-order-complete", handleLocalEvent);
  window.addEventListener("sk-order-updated", handleLocalEvent);
  window.addEventListener("storage", handleLocalEvent);

  // Polling safety net every 10s
  const interval = setInterval(() => { void fetchAndNotify(); }, 10000);

  return () => {
    active = false;
    if (unsubFirestore) unsubFirestore();
    window.removeEventListener("sk-order-complete", handleLocalEvent);
    window.removeEventListener("sk-order-updated", handleLocalEvent);
    window.removeEventListener("storage", handleLocalEvent);
    clearInterval(interval);
  };
}

/** Real-time subscriber for user's own orders (Client Portal). */
export function subscribeMyOrders(user: User | null, callback: (orders: OrderRecord[]) => void): () => void {
  let active = true;

  const fetchAndNotify = async () => {
    const orders = await listMyOrders(user);
    if (active) callback(orders);
  };

  void fetchAndNotify();

  let unsubFirestore: (() => void) | null = null;
  if (firebaseReady && db && user) {
    try {
      const qUid = query(collection(db, "orders"), where("uid", "==", user.uid));
      unsubFirestore = onSnapshot(qUid, () => { void fetchAndNotify(); }, () => { void fetchAndNotify(); });
    } catch {}
  }

  const handleLocalEvent = () => { void fetchAndNotify(); };
  window.addEventListener("sk-order-complete", handleLocalEvent);
  window.addEventListener("sk-order-updated", handleLocalEvent);
  window.addEventListener("storage", handleLocalEvent);

  const interval = setInterval(() => { void fetchAndNotify(); }, 10000);

  return () => {
    active = false;
    if (unsubFirestore) unsubFirestore();
    window.removeEventListener("sk-order-complete", handleLocalEvent);
    window.removeEventListener("sk-order-updated", handleLocalEvent);
    window.removeEventListener("storage", handleLocalEvent);
    clearInterval(interval);
  };
}

/** Delete an order (admin housekeeping). */
export async function deleteOrder(id: string): Promise<void> {
  if (!firebaseReady || !db) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    await idbSet("sk-demo-orders", orders.filter((o) => o.id !== id));
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
    return;
  }
  await deleteDoc(doc(db, "orders", id));
  window.dispatchEvent(new CustomEvent("sk-order-updated"));
}

/** Batch delete multiple orders. */
export async function deleteOrders(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const idSet = new Set(ids);
  if (!firebaseReady || !db) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    await idbSet("sk-demo-orders", orders.filter((o) => !idSet.has(o.id)));
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
    return;
  }
  await Promise.allSettled(ids.map((id) => deleteDoc(doc(db!, "orders", id))));
  // Also clean up local cache if present
  const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
  if (orders.length > 0) {
    await idbSet("sk-demo-orders", orders.filter((o) => !idSet.has(o.id)));
  }
  window.dispatchEvent(new CustomEvent("sk-order-updated"));
}

/**
 * 2026 Audit-Compliant Financial Reset & Accounting Zero-Out:
 * Purges or zeroes all order transactions, invoices, and accounting totals in IndexedDB & Firestore.
 * Dispatches global events to immediately reset revenue counters across all admin dashboards.
 */
export async function resetAccountingLedger(allOrderIds: string[] = []): Promise<void> {
  if (firebaseReady && db) {
    try {
      let targetIds = allOrderIds;
      if (targetIds.length === 0) {
        const snap = await getDocs(collection(db, "orders"));
        targetIds = snap.docs.map((d) => d.id);
      }
      await Promise.allSettled(targetIds.map((id) => deleteDoc(doc(db!, "orders", id))));
    } catch (err) {
      console.warn("Error resetting Firestore orders during accounting reset:", err);
    }
  }

  // Clear demo / local IndexedDB ledger
  await idbSet("sk-demo-orders", []);
  try {
    localStorage.removeItem("sk-demo-orders");
  } catch {}

  window.dispatchEvent(new CustomEvent("sk-order-updated"));
  window.dispatchEvent(new CustomEvent("sk-content-changed"));
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  // Auto-archive: entering COMPLETED stamps the completion date (history record);
  // reopening (any other status) clears it so the order returns to active lists.
  const completedAt = status === "COMPLETED" ? new Date().toISOString() : null;
  if (!firebaseReady || !db) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    await idbSet("sk-demo-orders", orders.map((o) => (o.id === id ? { ...o, status, completedAt: completedAt ?? undefined } : o)));
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
    return;
  }
  await updateDoc(doc(db, "orders", id), { status, completedAt });
  window.dispatchEvent(new CustomEvent("sk-order-updated"));
}

/** Batch update statuses for multiple orders. */
export async function setOrdersStatus(ids: string[], status: OrderStatus): Promise<void> {
  if (!ids || ids.length === 0) return;
  const idSet = new Set(ids);
  const completedAt = status === "COMPLETED" ? new Date().toISOString() : null;
  if (!firebaseReady || !db) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    await idbSet(
      "sk-demo-orders",
      orders.map((o) => (idSet.has(o.id) ? { ...o, status, completedAt: completedAt ?? undefined } : o))
    );
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
    return;
  }
  await Promise.allSettled(
    ids.map((id) => updateDoc(doc(db!, "orders", id), { status, completedAt }))
  );
  window.dispatchEvent(new CustomEvent("sk-order-updated"));
}

/** Delete a specific file from an order's deliverables vault. */
export async function deleteOrderFile(orderId: string, filePathOrName: string): Promise<void> {
  if (firebaseReady && db) {
    try {
      const snap = await getDoc(doc(db, "orders", orderId));
      if (snap.exists()) {
        const existing = (snap.data().files || []) as { name: string; size: number; path?: string }[];
        const updated = existing.filter((f) => f.path !== filePathOrName && f.name !== filePathOrName);
        await updateDoc(doc(db, "orders", orderId), { files: updated });
        window.dispatchEvent(new CustomEvent("sk-order-updated"));
      }
      if (storage && filePathOrName && !filePathOrName.startsWith("local://") && !filePathOrName.startsWith("data:")) {
        try {
          await deleteObject(ref(storage, filePathOrName));
        } catch {
          // ignore if already deleted or path mismatch
        }
      }
    } catch (err) {
      console.warn("Error deleting order file in Firestore:", err);
    }
  } else {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    await idbSet(
      "sk-demo-orders",
      orders.map((o) =>
        o.id === orderId
          ? { ...o, files: (o.files || []).filter((f) => f.path !== filePathOrName && f.name !== filePathOrName) }
          : o
      )
    );
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
  }
}

/** Upload project files to Storage and attach their paths to the order (with resilient local fallback). */
export async function attachFiles(
  orderId: string,
  files: File[],
  onProgress?: (fileIndex: number, totalFiles: number, fileName: string) => void
): Promise<{ name: string; size: number; path?: string }[]> {
  if (files.length === 0) return [];
  const out: { name: string; size: number; path?: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.(i + 1, files.length, f.name);
    const path = `orders/${orderId}/${Date.now()}-${f.name.replace(/[^\w.-]/g, "_")}`;

    let uploaded = false;
    if (firebaseReady && storage) {
      try {
        await uploadBytes(ref(storage, path), f);
        out.push({ name: f.name, size: f.size, path });
        uploaded = true;
      } catch (err) {
        console.warn("Storage upload failed, falling back to local storage:", err);
      }
    }

    if (!uploaded) {
      try {
        const buf = await f.arrayBuffer();
        const localKey = `local://${path}`;
        await storeLocalBinary(localKey, buf);
        out.push({ name: f.name, size: f.size, path: localKey });
      } catch {
        out.push({ name: f.name, size: f.size });
      }
    }
  }

  if (firebaseReady && db) {
    try {
      const snap = await getDoc(doc(db, "orders", orderId));
      const existing = (snap.exists() ? (snap.data().files || []) : []) as { name: string; size: number; path?: string }[];
      const combined = [...existing, ...out];
      await updateDoc(doc(db, "orders", orderId), { files: combined });
    } catch (err) {
      console.warn("Error updating order files in Firestore:", err);
    }
  } else {
    // Demo mode: update sk-demo-orders in IndexedDB
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    await idbSet(
      "sk-demo-orders",
      orders.map((o) => (o.id === orderId ? { ...o, files: [...(o.files || []), ...out] } : o))
    );
  }

  return out;
}

/* ---------------- leads ---------------- */

export async function createLead(data: Omit<LeadRecord, "id" | "status" | "createdAt">): Promise<void> {
  if (!firebaseReady || !db) {
    const leads = (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
    leads.unshift({ ...data, id: `LEAD-${Date.now()}`, status: "new", createdAt: new Date().toISOString() });
    await idbSet("sk-demo-leads", leads);
    window.dispatchEvent(new CustomEvent("sk-lead-submitted"));
    window.dispatchEvent(new CustomEvent("sk-lead-updated"));
    return;
  }
  await addDoc(collection(db, "leads"), { ...data, status: "new", createdAt: serverTimestamp() });
  window.dispatchEvent(new CustomEvent("sk-lead-submitted"));
  window.dispatchEvent(new CustomEvent("sk-lead-updated"));
}

export async function listLeads(): Promise<LeadRecord[]> {
  if (!firebaseReady || !db) {
    return (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
  }
  try {
    const snap = await getDocs(query(collection(db, "leads"), orderBy("createdAt", "desc")));
    const firestoreLeads = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: tsToIso(d.data().createdAt) || new Date().toISOString() }) as LeadRecord);
    const localLeads = (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
    const leadMap = new Map<string, LeadRecord>();
    firestoreLeads.forEach((l) => leadMap.set(l.id, l));
    localLeads.forEach((l) => { if (!leadMap.has(l.id)) leadMap.set(l.id, l); });
    return Array.from(leadMap.values()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  } catch {
    return (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
  }
}

/** Real-time subscriber for leads (Studio Cockpit). */
export function subscribeLeads(callback: (leads: LeadRecord[]) => void): () => void {
  let unsubFirestore: (() => void) | null = null;
  let active = true;

  const fetchAndNotify = async () => {
    const leads = await listLeads();
    if (active) callback(leads);
  };

  if (firebaseReady && db) {
    try {
      const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));
      unsubFirestore = onSnapshot(
        q,
        async (snap) => {
          if (!active) return;
          const firestoreLeads = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: tsToIso(d.data().createdAt) || new Date().toISOString() }) as LeadRecord);
          const localLeads = (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
          const leadMap = new Map<string, LeadRecord>();
          firestoreLeads.forEach((l) => leadMap.set(l.id, l));
          localLeads.forEach((l) => { if (!leadMap.has(l.id)) leadMap.set(l.id, l); });
          callback(Array.from(leadMap.values()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
        },
        () => { void fetchAndNotify(); }
      );
    } catch {
      void fetchAndNotify();
    }
  } else {
    void fetchAndNotify();
  }

  const handleLocalEvent = () => { void fetchAndNotify(); };
  window.addEventListener("sk-lead-submitted", handleLocalEvent);
  window.addEventListener("sk-lead-updated", handleLocalEvent);
  window.addEventListener("storage", handleLocalEvent);

  const interval = setInterval(() => { void fetchAndNotify(); }, 10000);

  return () => {
    active = false;
    if (unsubFirestore) unsubFirestore();
    window.removeEventListener("sk-lead-submitted", handleLocalEvent);
    window.removeEventListener("sk-lead-updated", handleLocalEvent);
    window.removeEventListener("storage", handleLocalEvent);
    clearInterval(interval);
  };
}

export async function setLeadStatus(id: string, status: LeadRecord["status"]): Promise<void> {
  if (!firebaseReady || !db) {
    const leads = (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
    await idbSet("sk-demo-leads", leads.map((l) => (l.id === id ? { ...l, status } : l)));
    window.dispatchEvent(new CustomEvent("sk-lead-updated"));
    return;
  }
  await updateDoc(doc(db, "leads", id), { status });
  window.dispatchEvent(new CustomEvent("sk-lead-updated"));
}

/** Batch update statuses for multiple leads. */
export async function setLeadsStatus(ids: string[], status: LeadRecord["status"]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const idSet = new Set(ids);
  if (!firebaseReady || !db) {
    const leads = (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
    await idbSet("sk-demo-leads", leads.map((l) => (idSet.has(l.id) ? { ...l, status } : l)));
    window.dispatchEvent(new CustomEvent("sk-lead-updated"));
    return;
  }
  await Promise.allSettled(ids.map((id) => updateDoc(doc(db!, "leads", id), { status })));
  window.dispatchEvent(new CustomEvent("sk-lead-updated"));
}

/** Delete a single lead. */
export async function deleteLead(id: string): Promise<void> {
  if (!firebaseReady || !db) {
    const leads = (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
    await idbSet("sk-demo-leads", leads.filter((l) => l.id !== id));
    window.dispatchEvent(new CustomEvent("sk-lead-updated"));
    return;
  }
  await deleteDoc(doc(db!, "leads", id));
  // Also clean up local cache if present
  const leads = (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
  if (leads.length > 0) {
    await idbSet("sk-demo-leads", leads.filter((l) => l.id !== id));
  }
  window.dispatchEvent(new CustomEvent("sk-lead-updated"));
}

/** Batch delete multiple leads. */
export async function deleteLeads(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const idSet = new Set(ids);
  if (!firebaseReady || !db) {
    const leads = (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
    await idbSet("sk-demo-leads", leads.filter((l) => !idSet.has(l.id)));
    window.dispatchEvent(new CustomEvent("sk-lead-updated"));
    return;
  }
  await Promise.allSettled(ids.map((id) => deleteDoc(doc(db!, "leads", id))));
  // Also clean up local cache if present
  const leads = (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
  if (leads.length > 0) {
    await idbSet("sk-demo-leads", leads.filter((l) => !idSet.has(l.id)));
  }
  window.dispatchEvent(new CustomEvent("sk-lead-updated"));
}

/* ---------------- content overrides (Package CMS, PRD §68) ---------------- */

export async function getServiceOverrides(): Promise<Record<string, ServiceOverride>> {
  if (!firebaseReady || !db) {
    return (await idbGet<Record<string, ServiceOverride>>("sk-demo-overrides")) || {};
  }
  try {
    const snap = await getDocs(collection(db, "serviceOverrides"));
    const out: Record<string, ServiceOverride> = {};
    snap.docs.forEach((d) => (out[d.id] = d.data() as ServiceOverride));
    return out;
  } catch {
    return {};
  }
}


export async function saveServiceOverride(slug: string, override: ServiceOverride): Promise<void> {
  if (!firebaseReady || !db) {
    const all = await getServiceOverrides();
    all[slug] = override;
    await idbSet("sk-demo-overrides", all);
    notifyContentChanged();
    return;
  }
  await setDoc(doc(db, "serviceOverrides", slug), override, { merge: true });
  notifyContentChanged();
}

/** Remove all overrides for a service — restores shipped defaults. */
export async function deleteServiceOverride(slug: string): Promise<void> {
  if (!firebaseReady || !db) {
    const all = await getServiceOverrides();
    delete all[slug];
    await idbSet("sk-demo-overrides", all);
    notifyContentChanged();
    return;
  }
  await deleteDoc(doc(db, "serviceOverrides", slug));
  notifyContentChanged();
}

/* ---------------- testimonials + FAQs + portfolio + promos (editable content) ---------------- */

export type ManagedKind =
  | "testimonials" | "faqs" | "portfolio" | "promos" | "services"
  // graphic design commerce (PRD §7–§24, §41)
  | "designCategories" | "designServices" | "designSizes"
  | "designOptions" | "designPackages" | "designDiscounts" | "designAudit"
  // design templates marketplace (Templates PRD §37–§43, §53)
  | "templates" | "templateCategories" | "templateBundles"
  | "templateReviews" | "downloadRecords"
  // Kon10 Editor customer designs (Editor PRD §26/§58)
  | "customerDesigns";

export interface ManagedItem { id: string; [k: string]: unknown }

export async function listManaged(kind: ManagedKind, filterByUid?: string | null): Promise<ManagedItem[]> {
  if (!firebaseReady || !db) {
    const res = await idbGet<ManagedItem[]>(`sk-demo-${kind}`);
    return res || [];
  }
  try {
    let q;
    if (kind === "customerDesigns" && filterByUid) {
      // Must filter by uid — Firestore rules deny full collection scans for non-admins
      q = query(collection(db, kind), where("uid", "==", filterByUid));
    } else {
      q = query(collection(db, kind));
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    // Permission denied or network error — fall back to empty (seeds remain)
    return [];
  }
}

async function sanitizePayload(kind: ManagedKind, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const clone = { ...data };
  for (const [key, val] of Object.entries(clone)) {
    if (typeof val === "string" && val.length > 500000) {
      if (firebaseReady && storage) {
        try {
          const cleanKey = key.replace(/[^\w.-]/g, "_");
          const path = `template-canvas/${kind}-${Date.now()}-${cleanKey}.json`;
          await uploadBytes(ref(storage, path), new Blob([val], { type: "application/json" }));
          clone[key] = `storage://${path}`;
        } catch (err) {
          console.warn(`Storage offload for ${key} failed, removing to protect Firestore:`, err);
          delete clone[key];
        }
      } else {
        delete clone[key];
      }
    }
  }
  return clone;
}

export async function addManaged(kind: ManagedKind, data: Record<string, unknown>): Promise<string> {
  if (!firebaseReady || !db) {
    const key = `sk-demo-${kind}`;
    const id = `${kind}-${Date.now()}`;
    const xs = (await idbGet<ManagedItem[]>(key)) || [];
    xs.unshift({ id, ...data });
    await idbSet(key, xs);
    notifyContentChanged();
    return id;
  }
  const safeData = await sanitizePayload(kind, data);
  const docRef = await addDoc(collection(db, kind), safeData);
  notifyContentChanged();
  return docRef.id;
}

export async function removeManaged(kind: ManagedKind, id: string): Promise<void> {
  if (!firebaseReady || !db) {
    const key = `sk-demo-${kind}`;
    const xs = (await idbGet<ManagedItem[]>(key)) || [];
    await idbSet(key, xs.filter((x) => x.id !== id));
    notifyContentChanged();
    return;
  }
  await deleteDoc(doc(db, kind, id));
  notifyContentChanged();
}

/** Update an existing managed item (2026 CMS: full edit, not add/remove only). */
export async function updateManaged(kind: ManagedKind, id: string, data: Record<string, unknown>): Promise<void> {
  if (!firebaseReady || !db) {
    const key = `sk-demo-${kind}`;
    const xs = (await idbGet<ManagedItem[]>(key)) || [];
    await idbSet(key, xs.map((x) => (x.id === id ? { ...x, ...data } : x)));
    notifyContentChanged();
    return;
  }
  const safeData = await sanitizePayload(kind, data);
  await updateDoc(doc(db, kind, id), safeData);
  notifyContentChanged();
}

/* ---------------- design audit log + price history (PRD §31/§41) ---------------- */

export interface AuditEntry {
  user: string;
  action: string;          // e.g. "price_changed", "service_created"
  entity: string;          // e.g. "service:business-card"
  before?: unknown;
  after?: unknown;
  at: string;
}

export async function logAudit(entry: Omit<AuditEntry, "at">): Promise<void> {
  const full = { ...entry, at: new Date().toISOString() };
  if (!firebaseReady || !db) {
    const xs = ls.read<ManagedItem>("sk-demo-designAudit");
    xs.unshift({ id: `audit-${Date.now()}`, ...full } as ManagedItem);
    ls.write("sk-demo-designAudit", xs.slice(0, 500));
    return;
  }
  await addDoc(collection(db, "designAudit"), full);
}

/* ---------------- image uploads (portfolio CMS, PRD §59/§67) ---------------- */

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/svg+xml"];
const MAX_IMAGE_MB = 12;

export async function storeLocalBinary(key: string, data: ArrayBuffer | Blob | Uint8Array): Promise<void> {
  try {
    const database = await openAppDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_BINARIES, "readwrite");
      tx.objectStore(STORE_BINARIES).put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("storeLocalBinary error:", err);
  }
}

export async function getLocalBinary(key: string): Promise<ArrayBuffer | null> {
  try {
    const database = await openAppDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_BINARIES, "readonly");
      const req = tx.objectStore(STORE_BINARIES).get(key);
      req.onsuccess = () => {
        const res = req.result;
        if (!res) resolve(null);
        else if (res instanceof ArrayBuffer) resolve(res);
        else if (res instanceof Blob) {
          res.arrayBuffer().then(resolve).catch(reject);
        } else if (res.buffer instanceof ArrayBuffer) {
          resolve(res.buffer);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("getLocalBinary error:", err);
    return null;
  }
}

/** Upload an image to Storage; returns persistent Data URL (demo mode) or Firebase URL. */
export async function uploadImage(file: File, folder = "portfolio"): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type) && !file.name.match(/\.(jpe?g|png|webp|avif|svg)$/i)) {
    throw new Error("Use JPG, PNG, WebP, AVIF or SVG.");
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`Image must be under ${MAX_IMAGE_MB}MB.`);
  
  if (!firebaseReady || !storage) {
    // Persistent Base64 Data URL so local/demo mode never suffers from expired blob: URLs
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });
  }

  const path = `${folder}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  await uploadBytes(ref(storage, path), file);
  return getDownloadURL(ref(storage, path));
}

/** Resolve a stored order-file / template-file path to a downloadable URL. */
export async function getFileUrl(path: string): Promise<string> {
  if (!path) return "#";
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")) return path;
  
  if (firebaseReady && storage && !path.startsWith("demo://")) {
    try {
      return await getDownloadURL(ref(storage, path));
    } catch {
      // fallback to local check
    }
  }

  // Check local IndexedDB binary cache
  const local = await getLocalBinary(path);
  if (local) {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    let mime = "application/octet-stream";
    if (["png"].includes(ext)) mime = "image/png";
    else if (["jpg", "jpeg"].includes(ext)) mime = "image/jpeg";
    else if (["webp"].includes(ext)) mime = "image/webp";
    else if (["svg"].includes(ext)) mime = "image/svg+xml";
    else if (["gif"].includes(ext)) mime = "image/gif";
    else if (["pdf"].includes(ext)) mime = "application/pdf";
    const blob = new Blob([local], { type: mime });
    return URL.createObjectURL(blob);
  }
  
  return "#";
}

/** Get binary ArrayBuffer for a stored file path, URL, or local key. */
export async function getFileBuffer(path: string): Promise<ArrayBuffer> {
  if (!path) throw new Error("No file path provided.");

  // 1. Check local IndexedDB first
  try {
    const local = await getLocalBinary(path);
    if (local) return local;

    // Check with stripped folder / simple filename
    const filename = path.split("/").pop() || path;
    const byName = await getLocalBinary(filename);
    if (byName) return byName;
    const byDemo = await getLocalBinary(`demo://${filename}`);
    if (byDemo) return byDemo;
  } catch (e) {
    console.warn("IndexedDB buffer read error:", e);
  }

  // 2. Data URL or Web URL
  if (path.startsWith("data:") || path.startsWith("blob:") || path.startsWith("http://") || path.startsWith("https://")) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching file.`);
    return resp.arrayBuffer();
  }

  // 3. Firebase Storage — use SDK getBytes() to avoid browser CORS
  if (firebaseReady && storage) {
    const storageRef = ref(storage, path);
    const bytes = await getBytes(storageRef);
    return bytes;
  }

  throw new Error(`File binary not found for: ${path}`);
}

/* ---------------- private digital-goods files (Templates PRD §11/§51/§52) ---------------- */

const MAX_PRIVATE_MB = 250;

/**
 * Upload a private digital file (PSD/AI/INDD/ZIP/PDF…) for a template.
 * Stores in IndexedDB locally and in Firebase Storage if configured.
 */
export async function uploadPrivateFile(file: File, folder = "template-files"): Promise<string> {
  if (file.size > MAX_PRIVATE_MB * 1024 * 1024) throw new Error(`File must be under ${MAX_PRIVATE_MB}MB.`);
  const cleanName = file.name.replace(/[^\w.-]/g, "_");
  const path = `${folder}/${Date.now()}-${cleanName}`;

  // Store in IndexedDB for immediate local access and offline reliability
  try {
    const buffer = await file.arrayBuffer();
    await storeLocalBinary(path, buffer);
    await storeLocalBinary(cleanName, buffer);
    await storeLocalBinary(`demo://${file.name}`, buffer);
    await storeLocalBinary(file.name, buffer);
  } catch (err) {
    console.warn("Failed to store binary in IndexedDB:", err);
  }

  if (!firebaseReady || !storage) return path;

  await uploadBytes(ref(storage, path), file);
  return path;
}

/* ---------------- site settings (PRD §74/§85) ---------------- */

export interface SiteSettings {
  phone?: string;
  email?: string;
  location?: string;
  socials?: { id: string; label: string; href: string }[];
  catchDiscountPct?: number;   // "Catch me" easter egg — % off, 0/blank disables the egg
  /** Preview watermark controls (Templates PRD §39). */
  watermark?: {
    enabled?: boolean;   // default true
    text?: string;       // default "SOCIAL KON10 • PREVIEW"
    opacity?: number;    // 0–1, default 0.16
    rotation?: number;   // degrees, default -30
    spacing?: number;    // px tile size, default 220
  };
  home?: {
    headline?: string;           // plain text; blank keeps the styled default
    sub?: string;
    marquee?: string;            // newline-separated items
    sections?: Record<string, boolean>; // section key -> visible
  };
  /** Analytics & tracking configuration (Website Intelligence PRD) */
  analyticsSettings?: {
    /** GA4 measurement ID — overrides VITE_GA_ID env var when set */
    ga4MeasurementId?: string;
    /** Meta Pixel ID — overrides VITE_META_PIXEL_ID env var when set */
    metaPixelId?: string;
    /** Google Ads conversion ID (e.g. AW-XXXXXXXXXX) */
    googleAdsId?: string;
    /** Google Ads conversion label for checkout complete event */
    googleAdsConversionLabel?: string;
    /** Enable first-party event tracking to Firestore analytics_* collections */
    firstPartyTracking?: boolean;
    /** Track individual service/department page views */
    trackServiceViews?: boolean;
    /** Track form funnel start + submit events */
    trackFormFunnels?: boolean;
    /** Track scroll depth milestones (25/50/75/100%) */
    trackScrollDepth?: boolean;
    /** Meta Conversions API (CAPI) — requires Cloud Function; doc URL for admin reference */
    capiEnabled?: boolean;
    /** GA4 Measurement Protocol — requires Cloud Function; doc URL for admin reference */
    ga4MpEnabled?: boolean;
  };
}

export async function getSettings(): Promise<SiteSettings> {
  if (!firebaseReady || !db) {
    return (await idbGet<SiteSettings>("sk-demo-settings")) || {};
  }
  try {
    const snap = await getDoc(doc(db, "settings", "site"));
    return snap.exists() ? (snap.data() as SiteSettings) : {};
  } catch {
    return {};
  }
}


export async function saveSettings(s: SiteSettings): Promise<void> {
  if (!firebaseReady || !db) {
    await idbSet("sk-demo-settings", s);
    notifyContentChanged();
    return;
  }
  await setDoc(doc(db, "settings", "site"), s, { merge: true });
  notifyContentChanged();
}

/* ---------------- project messaging (PRD §66) ---------------- */

export interface MessageAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  type: "image" | "document" | "vector" | "other";
  mimeType?: string;
}

export interface MessageRecord {
  id: string;
  orderId: string;
  from: "studio" | "client";
  text: string;
  author: string;        // email or "Social Kon10"
  createdAt: string;
  attachments?: MessageAttachment[];
}

async function compressImageForChat(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_DIM = 1200;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/webp", 0.82));
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

/** Upload a project chat attachment (logos, reference photos, copy docs, vectors). */
export async function uploadChatAttachment(orderId: string, file: File): Promise<MessageAttachment> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const isImg = ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext) || file.type.startsWith("image/");
  const isVector = ["ai", "eps", "psd", "svg", "cdr"].includes(ext);
  const isDoc = ["pdf", "doc", "docx", "txt", "rtf"].includes(ext);
  const type: MessageAttachment["type"] = isImg ? "image" : isVector ? "vector" : isDoc ? "document" : "other";

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `orders/${orderId}/chat/${Date.now()}-${safeName}`;

  let url = "";

  // 1. Attempt upload to Firebase Storage
  if (firebaseReady && storage) {
    try {
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
      url = await getDownloadURL(storageRef);
    } catch (storageErr) {
      console.warn("Storage upload rejected/unavailable (403), activating inline resilient fallback:", storageErr);
    }
  }

  // 2. Seamless Inline Fallback: Optimized Data URL or local blob
  if (!url) {
    try {
      if (isImg) {
        url = await compressImageForChat(file);
      } else {
        const buffer = await file.arrayBuffer();
        await storeLocalBinary(path, buffer);
        const blob = new Blob([buffer], { type: file.type || "application/octet-stream" });
        url = URL.createObjectURL(blob);
      }
    } catch (e) {
      console.error("Local buffer fallback error:", e);
    }
  }

  return {
    id: `ATT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    url: url || "#",
    size: file.size,
    type,
    mimeType: file.type,
  };
}

export async function listMessages(orderId: string): Promise<MessageRecord[]> {
  const localList = ((await idbGet<MessageRecord[]>("sk-demo-messages")) || [])
    .filter((m) => m.orderId === orderId);

  if (!firebaseReady || !db) {
    return localList.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  try {
    const snap = await getDocs(query(collection(db, "orders", orderId, "messages"), orderBy("createdAt", "asc")));
    const remoteList = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    })) as MessageRecord[];

    // Merge any locally queued messages not yet in remote
    const remoteIds = new Set(remoteList.map((r) => r.id));
    const merged = [...remoteList, ...localList.filter((l) => !remoteIds.has(l.id))];
    return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch (err) {
    console.warn("Error fetching remote messages, using local store:", err);
    return localList.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export async function postMessage(
  orderId: string,
  from: MessageRecord["from"],
  text: string,
  author: string,
  attachments?: MessageAttachment[]
): Promise<void> {
  const msg = {
    orderId,
    from,
    text: text || "",
    author,
    ...(attachments && attachments.length ? { attachments } : {}),
  };

  const localEntry: MessageRecord = {
    ...msg,
    id: `MSG-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };

  // stamp the order so both studio and client alert centers can see unread messages
  const touchLocalOrder = async () => {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    await idbSet(
      "sk-demo-orders",
      orders.map((o) =>
        o.id === orderId
          ? from === "client"
            ? { ...o, lastClientMessageAt: new Date().toISOString(), lastClientMessageBy: author }
            : { ...o, lastStudioMessageAt: new Date().toISOString(), lastStudioMessageBy: author }
          : o
      )
    );
  };

  const dispatchEvents = () => {
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
    window.dispatchEvent(new CustomEvent("sk-message-received", { detail: { orderId, from, text, author } }));
  };

  if (!firebaseReady || !db) {
    const xs = (await idbGet<MessageRecord[]>("sk-demo-messages")) || [];
    xs.push(localEntry);
    await idbSet("sk-demo-messages", xs);
    await touchLocalOrder();
    dispatchEvents();
    return;
  }

  try {
    await addDoc(collection(db, "orders", orderId, "messages"), { ...msg, createdAt: serverTimestamp() });
    if (from === "client") {
      try {
        await updateDoc(doc(db, "orders", orderId), { lastClientMessageAt: serverTimestamp(), lastClientMessageBy: author });
      } catch (touchErr) {
        console.warn("Order client unread-stamp failed (message was posted):", touchErr);
      }
    } else if (from === "studio") {
      try {
        await updateDoc(doc(db, "orders", orderId), { lastStudioMessageAt: serverTimestamp(), lastStudioMessageBy: author });
      } catch (touchErr) {
        console.warn("Order studio unread-stamp failed (message was posted):", touchErr);
      }
    }
    dispatchEvents();
  } catch (err) {
    console.warn("Firestore addDoc error, saving locally:", err);
    const xs = (await idbGet<MessageRecord[]>("sk-demo-messages")) || [];
    xs.push(localEntry);
    await idbSet("sk-demo-messages", xs);
    await touchLocalOrder();
    dispatchEvents();
  }
}

/** Mark a project thread as read by the studio (clears the unread-message alert for studio). */
export async function markThreadReadForStudio(orderId: string): Promise<void> {
  if (!firebaseReady || !db) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    await idbSet(
      "sk-demo-orders",
      orders.map((o) => (o.id === orderId ? { ...o, studioReadAt: new Date().toISOString() } : o))
    );
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
    return;
  }
  try {
    await updateDoc(doc(db, "orders", orderId), { studioReadAt: serverTimestamp() });
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
  } catch (err) {
    console.warn("markThreadReadForStudio failed:", err);
  }
}

/** Mark a project thread as read by the client (clears the unread-message alert for client). */
export async function markThreadReadForClient(orderId: string): Promise<void> {
  if (!firebaseReady || !db) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    await idbSet(
      "sk-demo-orders",
      orders.map((o) => (o.id === orderId ? { ...o, clientReadAt: new Date().toISOString() } : o))
    );
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
    return;
  }
  try {
    await updateDoc(doc(db, "orders", orderId), { clientReadAt: serverTimestamp() });
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
  } catch (err) {
    console.warn("markThreadReadForClient failed:", err);
  }
}

/** Delete a message and its attachments from the project thread. */
export async function deleteMessage(orderId: string, messageId: string): Promise<void> {
  // 1. Delete from local IndexedDB cache
  const localList = (await idbGet<MessageRecord[]>("sk-demo-messages")) || [];
  const updated = localList.filter((m) => !(m.orderId === orderId && m.id === messageId));
  await idbSet("sk-demo-messages", updated);

  // 2. Delete from Firestore
  if (firebaseReady && db && !messageId.startsWith("MSG-")) {
    try {
      await deleteDoc(doc(db, "orders", orderId, "messages", messageId));
    } catch (err) {
      console.warn("Firestore deleteDoc error:", err);
    }
  }
}

/* ---------------- quote → payable order (PRD §70) ---------------- */

/** Convert a lead into a payable proposal the client can accept and pay in the portal. */
export async function convertLeadToOrder(lead: LeadRecord, amountUsd: number, description: string): Promise<string> {
  const order: Omit<OrderRecord, "id" | "status" | "createdAt" | "uid"> = {
    email: lead.email,
    name: lead.name,
    company: lead.company,
    items: [{ name: description || "Custom project", unitPrice: amountUsd, addons: [], rush: false, billing: "one_time" }],
    subtotal: amountUsd,
    discount: 0,
    total: amountUsd,
    payMode: "deposit",
    amountPaid: 0,
    balanceDue: amountUsd,
    promo: null,
    details: { source: `lead:${lead.id}`, brief: lead.message },
    files: [],
  };
  const id = await createOrder(order, null);
  await setLeadStatus(lead.id, "converted");
  return id;
}

/**
 * Record a payment against an order (deposit, balance or proposal payment).
 * NOTE: Firestore rules intentionally deny client-side writes to payment
 * fields — in production this must be called from a verified payment
 * webhook / Cloud Function (see FIREBASE-SETUP.md §7). It succeeds in
 * demo mode (localStorage) and for admins; client calls in live mode are
 * caught by the caller and treated as "pending provider confirmation".
 */
export async function recordPayment(orderId: string, amountUsd: number): Promise<void> {
  if (!firebaseReady || !db) {
    const orders = ls.read<OrderRecord>("sk-demo-orders").map((o) =>
      o.id === orderId
        ? { ...o, amountPaid: o.amountPaid + amountUsd, balanceDue: Math.max(0, o.balanceDue - amountUsd) }
        : o
    );
    ls.write("sk-demo-orders", orders);
    window.dispatchEvent(new CustomEvent("sk-order-updated"));
    return;
  }
  const ref = doc(db, "orders", orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const o = snap.data() as OrderRecord;
  await updateDoc(ref, { amountPaid: (o.amountPaid ?? 0) + amountUsd, balanceDue: Math.max(0, (o.balanceDue ?? 0) - amountUsd) });
  window.dispatchEvent(new CustomEvent("sk-order-updated"));
}

export function cartToOrderItems(items: CartItem[]) {
  return items.map((i) => ({
    name: i.name,
    serviceSlug: i.serviceSlug,
    tierLabel: i.tierLabel,
    variantLabel: i.variantLabel,
    unitPrice: i.unitPrice,
    addons: i.addons.map((a) => ({ name: a.name, price: a.price })),
    rush: i.rush,
    billing: i.billing,
    // template marketplace entitlement metadata (Templates PRD §54)
    ...(i.templateSlug ? { templateSlug: i.templateSlug } : {}),
    ...(i.license ? { license: i.license } : {}),
    ...(i.version ? { version: i.version } : {}),
  }));
}

export { getDoc, doc };
