import { addManaged, attachFiles, idbGet, idbSet, listManaged, postMessage, removeManaged, setOrderStatus, updateManaged } from "./backend";
import { firebaseReady } from "./firebase";

/* ------------------------------------------------------------------
   KON10 EDITOR — DESIGN STORAGE (Editor PRD §26/§27, §51/§52)
   Customer designs live in the existing managed-doc backend
   (Firestore when connected, demo storage otherwise) — a copy of the
   master template, never the master itself (§8). Drafts in
   IndexedDB/localStorage power offline tolerance and crash recovery.
------------------------------------------------------------------- */

export interface CustomerDesign {
  id: string;
  uid: string | null;
  email: string;
  templateSlug: string;
  orderId?: string;       // Linked customer order ID
  title: string;
  canvasJson: string;     // serialized Kon10Doc — the customer's copy
  thumbnail: string;      // small jpeg dataURL
  version: number;        // versioning foundation (§27)
  createdAt: string;
  updatedAt: string;
}

export async function listDesigns(email: string, uid?: string | null): Promise<CustomerDesign[]> {
  const rows = await listManaged("customerDesigns", uid ?? null);
  const matching = (rows as unknown as CustomerDesign[])
    .filter((d) => (d.email && d.email.toLowerCase() === (email || "").toLowerCase()) || (uid && d.uid === uid))
    .sort((a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""));

  // 2026 Best Practice: Deduplicate by templateSlug (1 canonical active design per template)
  const seenSlugs = new Set<string>();
  const uniqueDesigns: CustomerDesign[] = [];
  const duplicatesToDelete: string[] = [];

  for (const d of matching) {
    const slugKey = d.templateSlug || d.id;
    if (!seenSlugs.has(slugKey)) {
      seenSlugs.add(slugKey);
      uniqueDesigns.push(d);
    } else {
      // Auto-prune duplicate entries created during previous retries
      if (d.id) duplicatesToDelete.push(d.id);
    }
  }

  if (duplicatesToDelete.length > 0) {
    Promise.allSettled(duplicatesToDelete.map((id) => removeManaged("customerDesigns", id))).catch((err) => {
      console.warn("Auto-pruning stale design duplicates notice:", err);
    });
  }

  return uniqueDesigns;
}

export async function listAllCustomerDesigns(): Promise<CustomerDesign[]> {
  const rows = await listManaged("customerDesigns");
  return (rows as unknown as CustomerDesign[])
    .sort((a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""));
}

export async function getCustomerDesignById(id: string): Promise<CustomerDesign | null> {
  if (!id) return null;
  const rows = await listManaged("customerDesigns");
  const match = (rows as unknown as CustomerDesign[]).find((d) => d.id === id);
  return match ?? null;
}

export async function findDesignFor(email: string, templateSlug: string, uid?: string | null): Promise<CustomerDesign | null> {
  const all = await listDesigns(email, uid);
  return all.find((d) => d.templateSlug === templateSlug) ?? null;
}

export async function findDesignForOrder(orderId: string): Promise<CustomerDesign | null> {
  if (!orderId) return null;
  const rows = await listManaged("customerDesigns");
  const match = (rows as unknown as CustomerDesign[]).find((d) => d.orderId === orderId);
  return match ?? null;
}

export async function linkDesignToOrder(designId: string, orderId: string): Promise<void> {
  await updateManaged("customerDesigns", designId, { orderId });
}

/** Link any guest customer designs to the newly authenticated account. */
export async function claimCustomerDesigns(user: { uid: string; email?: string | null }): Promise<void> {
  if (!firebaseReady || !user.email) return;
  try {
    const emailLower = user.email.toLowerCase();
    const rows = (await listManaged("customerDesigns")) as unknown as CustomerDesign[];
    const guestRows = rows.filter(
      (d) => (!d.uid || d.uid === null) && d.email && d.email.toLowerCase() === emailLower
    );
    if (guestRows.length > 0) {
      await Promise.all(
        guestRows.map((d) => updateManaged("customerDesigns", d.id, { uid: user.uid }))
      );
    }
  } catch (err) {
    console.warn("claimCustomerDesigns notice:", err);
  }
}

export async function deliverProofToOrder({
  orderId,
  designId,
  dataUrl,
  filename,
  note,
  designerName = "Studio Designer",
}: {
  orderId: string;
  designId?: string;
  dataUrl: string;
  filename?: string;
  note?: string;
  designerName?: string;
}): Promise<{ ok: boolean; fileUrl?: string; error?: string }> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const cleanFilename = filename || `proof-design-${Date.now().toString().slice(-6)}.png`;
    const file = new File([blob], cleanFilename, { type: blob.type || "image/png" });

    const attached = await attachFiles(orderId, [file]);
    const messageContent = note?.trim()
      ? `✨ ${designerName} delivered a new design proof: "${cleanFilename}".\n\n💬 Designer Note: ${note.trim()}`
      : `✨ ${designerName} delivered a new design proof: "${cleanFilename}" to the project vault for review.`;

    await postMessage(orderId, "studio", messageContent, designerName);
    await setOrderStatus(orderId, "CLIENT REVIEW");

    if (designId) {
      void linkDesignToOrder(designId, orderId);
    }

    return { ok: true, fileUrl: attached[0]?.path };
  } catch (err) {
    console.error("deliverProofToOrder error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Failed to deliver proof" };
  }
}

export async function createDesign(d: Omit<CustomerDesign, "id" | "createdAt" | "updatedAt" | "version">): Promise<CustomerDesign> {
  const now = new Date().toISOString();
  const rec = { ...d, version: 1, createdAt: now, updatedAt: now };
  const assignedId = await addManaged("customerDesigns", rec as unknown as Record<string, unknown>);
  return { id: assignedId, ...rec };
}

export async function saveDesign(id: string, patch: Partial<Pick<CustomerDesign, "canvasJson" | "thumbnail" | "title">>): Promise<void> {
  if (!firebaseReady && id.startsWith("local-")) return; // unraced demo insert — draft covers us
  await updateManaged("customerDesigns", id, { ...patch, updatedAt: new Date().toISOString() });
}

export async function bumpDesignVersion(id: string, version: number): Promise<void> {
  if (!firebaseReady && id.startsWith("local-")) return;
  await updateManaged("customerDesigns", id, { version });
}

export async function deleteDesign(id: string): Promise<void> {
  await removeManaged("customerDesigns", id);
}

/* ---------------- crash recovery + offline drafts (§51/§52) ---------------- */

const draftKey = (designId: string) => `sk-editor-draft-${designId}`;

export interface Draft { canvasJson: string; updatedAt: string }

export function saveDraft(designId: string, canvasJson: string): void {
  const data = { canvasJson, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(draftKey(designId), JSON.stringify(data));
  } catch { /* quota */ }
  void idbSet(draftKey(designId), data);
}

export function readDraft(designId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(designId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch { return null; }
}

export async function readDraftAsync(designId: string): Promise<Draft | null> {
  return idbGet<Draft>(draftKey(designId));
}

export function clearDraft(designId: string): void {
  try {
    localStorage.removeItem(draftKey(designId));
  } catch { /* ignore */ }
  void idbSet(draftKey(designId), null);
}

/* ---------------- version history — named local snapshots (§27) ---------------- */

export interface DesignVersion { id: string; name: string; at: string; json: string; thumb: string }

const versionKey = (designId: string) => `sk-editor-versions-${designId}`;
const MAX_VERSIONS = 10;
const versionsMemCache = new Map<string, DesignVersion[]>();

export function listVersions(designId: string): DesignVersion[] {
  if (versionsMemCache.has(designId)) {
    const mem = versionsMemCache.get(designId);
    if (mem && mem.length > 0) return mem;
  }
  try {
    const raw = localStorage.getItem(versionKey(designId));
    if (raw) {
      const parsed = JSON.parse(raw) as DesignVersion[];
      versionsMemCache.set(designId, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn("listVersions read failed:", err);
  }
  return versionsMemCache.get(designId) ?? [];
}

export function saveVersion(designId: string, name: string, json: string, thumb: string): DesignVersion[] | null {
  const current = listVersions(designId);
  const newVer: DesignVersion = {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    at: new Date().toISOString(),
    json,
    thumb,
  };
  const list: DesignVersion[] = [newVer, ...current].slice(0, MAX_VERSIONS);
  
  versionsMemCache.set(designId, list);
  try {
    localStorage.setItem(versionKey(designId), JSON.stringify(list));
  } catch (err) {
    console.warn("localStorage saveVersion quota reached, stored in memory & IndexedDB:", err);
  }
  void idbSet(versionKey(designId), list);
  return list;
}

export function deleteVersion(designId: string, versionId: string): DesignVersion[] {
  const list = listVersions(designId).filter((v) => v.id !== versionId);
  versionsMemCache.set(designId, list);
  try {
    localStorage.setItem(versionKey(designId), JSON.stringify(list));
  } catch { /* ignore */ }
  void idbSet(versionKey(designId), list);
  return list;
}
