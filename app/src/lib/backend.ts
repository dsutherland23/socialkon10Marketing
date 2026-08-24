import {
  addDoc, collection, doc, getDocs, getDoc, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, getBytes } from "firebase/storage";
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
  items: { name: string; tierLabel?: string; unitPrice: number; addons: { name: string; price: number }[]; rush: boolean; billing: string; templateSlug?: string; license?: string; version?: string }[];
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
    return id;
  }
  const refDoc = await addDoc(collection(db, "orders"), { ...base, createdAt: serverTimestamp() });
  return refDoc.id;
}

/** Link any orders placed with this email (before sign-up) to the account. */
export async function claimOrders(user: User): Promise<void> {
  if (!firebaseReady || !db || !user.email) return;
  try {
    const q = query(collection(db, "orders"), where("email", "==", user.email), where("uid", "==", null));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { uid: user.uid })));
  } catch { /* ignore permission errors */ }
}

export async function listMyOrders(user: User | null): Promise<OrderRecord[]> {
  if (!firebaseReady || !db || !user) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    return orders.map((o) => ({ ...o, files: Array.isArray(o.files) ? o.files : [] }));
  }
  try {
    const q = query(collection(db, "orders"), where("uid", "==", user.uid));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          files: Array.isArray(data.files) ? data.files : [],
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? (typeof data.createdAt === "string" ? data.createdAt : "")
        } as OrderRecord;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function listAllOrders(): Promise<OrderRecord[]> {
  if (!firebaseReady || !db) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    return orders.map((o) => ({ ...o, files: Array.isArray(o.files) ? o.files : [] }));
  }
  try {
    const snap = await getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc")));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        files: Array.isArray(data.files) ? data.files : [],
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? (typeof data.createdAt === "string" ? data.createdAt : "")
      } as OrderRecord;
    });
  } catch {
    return [];
  }
}

/** Delete an order (admin housekeeping). */
export async function deleteOrder(id: string): Promise<void> {
  if (!firebaseReady || !db) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    await idbSet("sk-demo-orders", orders.filter((o) => o.id !== id));
    return;
  }
  await deleteDoc(doc(db, "orders", id));
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  if (!firebaseReady || !db) {
    const orders = (await idbGet<OrderRecord[]>("sk-demo-orders")) || [];
    await idbSet("sk-demo-orders", orders.map((o) => (o.id === id ? { ...o, status } : o)));
    return;
  }
  await updateDoc(doc(db, "orders", id), { status });
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
    return;
  }
  await addDoc(collection(db, "leads"), { ...data, status: "new", createdAt: serverTimestamp() });
}

export async function listLeads(): Promise<LeadRecord[]> {
  if (!firebaseReady || !db) {
    return (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
  }
  const snap = await getDocs(query(collection(db, "leads"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() ?? "" }) as LeadRecord);
}

export async function setLeadStatus(id: string, status: LeadRecord["status"]): Promise<void> {
  if (!firebaseReady || !db) {
    const leads = (await idbGet<LeadRecord[]>("sk-demo-leads")) || [];
    await idbSet("sk-demo-leads", leads.map((l) => (l.id === id ? { ...l, status } : l)));
    return;
  }
  await updateDoc(doc(db, "leads", id), { status });
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

  if (!firebaseReady || !db) {
    const xs = (await idbGet<MessageRecord[]>("sk-demo-messages")) || [];
    xs.push(localEntry);
    await idbSet("sk-demo-messages", xs);
    return;
  }

  try {
    await addDoc(collection(db, "orders", orderId, "messages"), { ...msg, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn("Firestore addDoc error, saving locally:", err);
    const xs = (await idbGet<MessageRecord[]>("sk-demo-messages")) || [];
    xs.push(localEntry);
    await idbSet("sk-demo-messages", xs);
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
    return;
  }
  const ref = doc(db, "orders", orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const o = snap.data() as OrderRecord;
  await updateDoc(ref, { amountPaid: (o.amountPaid ?? 0) + amountUsd, balanceDue: Math.max(0, (o.balanceDue ?? 0) - amountUsd) });
}

export function cartToOrderItems(items: CartItem[]) {
  return items.map((i) => ({
    name: i.name,
    tierLabel: i.tierLabel,
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
