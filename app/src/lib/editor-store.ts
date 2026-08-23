import { addManaged, idbGet, idbSet, listManaged, removeManaged, updateManaged } from "./backend";
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
    void Promise.allSettled(duplicatesToDelete.map((id) => removeManaged("customerDesigns", id)));
  }

  return uniqueDesigns;
}

export async function findDesignFor(email: string, templateSlug: string, uid?: string | null): Promise<CustomerDesign | null> {
  const all = await listDesigns(email, uid);
  return all.find((d) => d.templateSlug === templateSlug) ?? null;
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
