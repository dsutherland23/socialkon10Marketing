import { toast } from "sonner";
import type { Template } from "./templates";

/* ------------------------------------------------------------------
   KON10 EDITOR — ENGINE LAYER (Kon10 Editor PRD §6–§17, §23–§27)
   Layer 2: our proprietary logic on top of Fabric.js (Layer 1).
   Template schema, object permissions, snapping, serialization,
   export rules. No marketplace logic lives here.
------------------------------------------------------------------- */

/** Custom Kon10 properties serialized alongside Fabric props (§9/§65). */
export const KON10_PROPS = [
  "kId", "kName", "kEditable", "kLocked", "kMovable", "kResizable",
  "kRotatable", "kDeletable", "kStyleEditable", "kReplaceable",
  "kPlaceholder", "kExportable", "kUserLock", "kWarp", "kFolder", "kGroup",
  "kFadeMask",
] as const;

export type FadeMaskDirection =
  | "none"
  | "bottom"
  | "top"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "radial"
  | "vertical"
  | "horizontal";

export interface FadeMaskConfig {
  direction: FadeMaskDirection;
  depth: number; // 0 to 1 (e.g. 0.45 = 45% of image is faded)
  softness?: number; // 0 to 1
  invert?: boolean;
}

export interface Kon10Field {
  fieldId: string;
  label: string;
  type: "text" | "image";
  required: boolean;
  maxLength?: number;
  defaultValue?: string;
}

export interface Kon10Page {
  id: string;
  name: string;
  fabric: Record<string, unknown>;
}

export interface Kon10Doc {
  schemaVersion: "1.0" | "1.1" | "1.2";
  templateSlug: string;
  canvas: { width: number; height: number; background: string };
  exports: { png: boolean; jpg: boolean; pdf: boolean; svg?: boolean };
  fields: Kon10Field[];
  fabric: Record<string, unknown>; // Fabric.js JSON with Kon10 props per object
  pages?: Kon10Page[]; // optional multi-page documents (Tier 3 foundation)
  guides?: { v: number[]; h: number[] }; // user-placed ruler guides (doc coords)
  folders?: string[]; // user created layer folders
}

export interface EditorObject {
  kId?: string; kName?: string;
  kEditable?: boolean; kLocked?: boolean; kMovable?: boolean; kResizable?: boolean;
  kRotatable?: boolean; kDeletable?: boolean; kStyleEditable?: boolean;
  kReplaceable?: boolean; kPlaceholder?: string; kExportable?: boolean;
  kUserLock?: boolean; // customer-side personal lock (layers panel)
  kFolder?: string; // Photoshop layer folder / group name
  kGroup?: string;
  kFadeMask?: FadeMaskConfig; // non-destructive layer mask fade
  selectable?: boolean; evented?: boolean;
  lockMovementX?: boolean; lockMovementY?: boolean;
  lockScalingX?: boolean; lockScalingY?: boolean; lockRotation?: boolean;
  hasControls?: boolean; visible?: boolean;
  type?: string; text?: string; editable?: boolean;
  [k: string]: unknown;
}

export type EditorMode = "customer" | "author";

const DEFAULT_PERMS: Pick<EditorObject,
  "kEditable" | "kMovable" | "kResizable" | "kRotatable" | "kDeletable" | "kStyleEditable" | "kReplaceable" | "kExportable"> = {
  kEditable: true, kMovable: true, kResizable: true, kRotatable: true,
  kDeletable: true, kStyleEditable: true, kReplaceable: false, kExportable: true,
};

/** Stamp Kon10 defaults onto a freshly added object (author mode). */
export function stampKon10(obj: EditorObject, name: string): void {
  const id = `obj_${Math.random().toString(36).slice(2, 9)}`;
  Object.assign(obj, { ...DEFAULT_PERMS, kLocked: false, kId: id, kName: name });
}

/**
 * Enforce template permissions on a live Fabric object (§10/§17).
 * Customer mode: locked objects can't be selected/moved/edited;
 * restricted transforms are locked at the Fabric level so keyboard
 * shortcuts and group manipulation can't bypass them.
 */
export function applyCustomerPermissions(obj: EditorObject): void {
  if (obj.kLocked || obj.kUserLock) {
    obj.selectable = false;
    obj.evented = false;
    obj.lockMovementX = true;
    obj.lockMovementY = true;
    obj.lockScalingX = true;
    obj.lockScalingY = true;
    obj.lockRotation = true;
    obj.hasControls = false;
    return;
  }
  obj.selectable = true;
  obj.evented = true;
  obj.lockMovementX = obj.kMovable === false;
  obj.lockMovementY = obj.kMovable === false;
  obj.lockScalingX = obj.kResizable === false;
  obj.lockScalingY = obj.kResizable === false;
  obj.lockRotation = obj.kRotatable === false;
  obj.hasControls = obj.kResizable !== false || obj.kRotatable !== false;
  if (/^(textbox|itext)$/i.test(obj.type ?? "")) {
    obj.editable = obj.kEditable !== false;
    if (typeof (obj as unknown as { setControlVisible?: (ctrl: string, vis: boolean) => void }).setControlVisible === "function") {
      const setter = (obj as unknown as { setControlVisible: (ctrl: string, vis: boolean) => void });
      setter.setControlVisible("ml", true);
      setter.setControlVisible("mr", true);
      setter.setControlVisible("mt", false);
      setter.setControlVisible("mb", false);
    }
  }
}

/** Apply permissions to every object on a canvas-like collection. */
export function applyPermissionsToAll(objects: EditorObject[], mode: EditorMode): void {
  if (mode === "author") {
    /* author = full control, but respects explicit user locks */
    objects.forEach((o) => {
      if (o.kUserLock) {
        o.selectable = false;
        o.evented = false;
        o.lockMovementX = true;
        o.lockMovementY = true;
        o.lockScalingX = true;
        o.lockScalingY = true;
        o.lockRotation = true;
        o.hasControls = false;
        return;
      }
      o.selectable = true;
      o.evented = true;
      o.lockMovementX = false; o.lockMovementY = false;
      o.lockScalingX = false; o.lockScalingY = false;
      o.lockRotation = false;
      o.hasControls = true;
      if (/^(textbox|itext)$/i.test(o.type ?? "")) {
        o.editable = true;
        if (typeof (o as unknown as { setControlVisible?: (ctrl: string, vis: boolean) => void }).setControlVisible === "function") {
          const setter = (o as unknown as { setControlVisible: (ctrl: string, vis: boolean) => void });
          setter.setControlVisible("ml", true);
          setter.setControlVisible("mr", true);
          setter.setControlVisible("mt", false);
          setter.setControlVisible("mb", false);
        }
      }
    });
    return;
  }
  objects.forEach(applyCustomerPermissions);
}

/** Permission-safe delete check (§69: no keyboard bypass). */
export function deletableObjects(objs: EditorObject[]): { ok: EditorObject[]; blocked: number } {
  const ok = objs.filter((o) => o.kLocked !== true && o.kDeletable !== false);
  return { ok, blocked: objs.length - ok.length };
}

/** Parse "1080 × 1350 px" / "5 × 7 in" → pixel canvas size (§22). */
export function parseCanvasSize(dimensions: string): { width: number; height: number } {
  const m = dimensions.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/);
  if (!m) return { width: 1080, height: 1350 };
  let w = parseFloat(m[1]), h = parseFloat(m[2]);
  if (/in\b/.test(dimensions)) { w *= 300; h *= 300; } // print inches at 300 DPI
  if (w > 4000 || h > 4000) { const s = 4000 / Math.max(w, h); w *= s; h *= s; }
  return { width: Math.round(w), height: Math.round(h) };
}

/** Template validation before publishing (§31). Returns a list of problems. */
export function validateTemplateDoc(doc: Kon10Doc): string[] {
  const problems: string[] = [];
  if (!doc.fabric || !Array.isArray((doc.fabric as { objects?: unknown[] }).objects)) problems.push("Canvas is empty or invalid.");
  if (!doc.canvas.width || !doc.canvas.height || doc.canvas.width < 10 || doc.canvas.height < 10) problems.push("Canvas dimensions are invalid.");
  const objects = ((doc.fabric as { objects?: EditorObject[] }).objects ?? []);
  const ids = new Set<string>();
  objects.forEach((o) => {
    if (!o.kId) problems.push(`An object is missing an ID (${o.kName ?? o.type}).`);
    else if (ids.has(o.kId)) problems.push(`Duplicate object ID: ${o.kId}`);
    else ids.add(o.kId);
  });
  const fieldIds = new Set<string>();
  doc.fields.forEach((f) => {
    if (!f.fieldId) problems.push("A field is missing its field ID.");
    else if (fieldIds.has(f.fieldId)) problems.push(`Duplicate field ID: ${f.fieldId}`);
    else fieldIds.add(f.fieldId);
    if (f.required && f.type === "text" && !f.defaultValue && !objects.some((o) => o.kPlaceholder === f.fieldId && o.text))
      problems.push(`Required field "${f.label}" has no default value.`);
    // Note: unlinked fields are a warning only — they don't block publish (layer may be added later)
    // if (!objects.some((o) => o.kPlaceholder === f.fieldId))
    //   problems.push(`Field "${f.label}" isn't linked to any canvas object.`);
  });
  if (!doc.exports.png && !doc.exports.jpg && !doc.exports.pdf) problems.push("Enable at least one export format.");
  return problems;
}

/* ------------------------------------------------------------------
   SEED MASTER DOCUMENTS (§70 acceptance template: festival flyer)
   Code-authored Kon10 docs — real structured canvas JSON, not
   flattened images (§7/§73).
------------------------------------------------------------------- */

function tx(partial: Record<string, unknown>): EditorObject {
  return {
    type: "Textbox", version: "7.4.0", originX: "left", originY: "top",
    left: 0, top: 0, width: 900, height: 100, fill: "#ffffff",
    fontFamily: "Archivo, sans-serif", fontSize: 96, fontWeight: "800",
    textAlign: "left", charSpacing: 0, lineHeight: 1.05, styles: [],
    ...partial,
  } as EditorObject;
}

function shape(type: string, partial: Record<string, unknown>): EditorObject {
  return { type, version: "7.4.0", originX: "left", originY: "top", left: 0, top: 0, ...partial } as EditorObject;
}

/** Build the master Kon10 doc for a seed template (never mutated by customers — §8). */
export function buildSeedDoc(tpl: Template): Kon10Doc {
  const { width: W, height: H } = parseCanvasSize(tpl.dimensions);
  const base: Omit<Kon10Doc, "fabric"> = {
    schemaVersion: "1.0",
    templateSlug: tpl.slug,
    canvas: { width: W, height: H, background: `hsl(${tpl.hue} 40% 9%)` },
    exports: { png: true, jpg: true, pdf: true, svg: true },
    fields: [],
  };

  if (tpl.slug === "summer-vibes-party-flyer") {
    const objects: EditorObject[] = [
      shape("Rect", { ...stamp0("background", "Background"), width: W, height: H, fill: `hsl(${tpl.hue} 42% 10%)`, kLocked: true, kEditable: false, kMovable: false, kResizable: false, kRotatable: false, kDeletable: false, kStyleEditable: false }),
      shape("Circle", { ...stamp0("sun_disc", "Sun disc"), left: W * 0.62, top: H * 0.12, radius: W * 0.14, fill: `hsl(${tpl.hue} 90% 55%)`, kLocked: true, kEditable: false, kMovable: false, kResizable: false, kRotatable: false, kDeletable: false, kStyleEditable: false }),
      shape("Rect", { ...stamp0("stripe_1", "Horizon stripe"), left: -W * 0.1, top: H * 0.42, width: W * 1.2, height: H * 0.035, angle: -8, fill: `hsl(${tpl.hue} 70% 30%)`, kLocked: true, kEditable: false, kMovable: false, kResizable: false, kRotatable: false, kDeletable: false, kStyleEditable: false }),
      shape("Rect", { ...stamp0("stripe_2", "Horizon stripe 2"), left: -W * 0.1, top: H * 0.5, width: W * 1.2, height: H * 0.02, angle: -8, fill: `hsl(${tpl.hue} 80% 45%)`, kLocked: true, kEditable: false, kMovable: false, kResizable: false, kRotatable: false, kDeletable: false, kStyleEditable: false }),
      shape("Rect", { ...stamp0("artist_photo", "Artist Photo"), left: W * 0.55, top: H * 0.55, width: W * 0.36, height: H * 0.3, fill: "rgba(255,255,255,0.08)", stroke: "rgba(255,255,255,0.5)", strokeDashArray: [10, 8], strokeWidth: 3, kPlaceholder: "artist_photo", kReplaceable: true, kDeletable: false }),
      tx({ ...stamp0("headline_01", "Event Name"), left: W * 0.06, top: H * 0.62, width: W * 0.62, fontSize: Math.round(W * 0.115), text: "SUMMER VIBES", kPlaceholder: "event_name" }),
      tx({ ...stamp0("date_01", "Event Date"), left: W * 0.06, top: H * 0.82, width: W * 0.6, fontSize: Math.round(W * 0.045), fontWeight: "700", text: "SAT · AUG 30 · 9PM", kPlaceholder: "event_date" }),
      tx({ ...stamp0("location_01", "Event Location"), left: W * 0.06, top: H * 0.875, width: W * 0.6, fontSize: Math.round(W * 0.034), fontWeight: "400", fill: "rgba(255,255,255,0.72)", text: "Kingston Waterfront", kPlaceholder: "event_location" }),
      tx({ ...stamp0("price_01", "Ticket Price"), left: W * 0.06, top: H * 0.12, width: W * 0.4, fontSize: Math.round(W * 0.038), fontWeight: "700", fill: `hsl(${tpl.hue} 90% 60%)`, text: "$25 ADVANCE", kPlaceholder: "ticket_price" }),
    ];
    return {
      ...base,
      fields: [
        { fieldId: "event_name", label: "Event Name", type: "text", required: true, maxLength: 40, defaultValue: "SUMMER VIBES" },
        { fieldId: "event_date", label: "Event Date", type: "text", required: true, maxLength: 30, defaultValue: "SAT · AUG 30 · 9PM" },
        { fieldId: "event_location", label: "Event Location", type: "text", required: false, maxLength: 40, defaultValue: "Kingston Waterfront" },
        { fieldId: "ticket_price", label: "Ticket Price", type: "text", required: false, maxLength: 20, defaultValue: "$25 ADVANCE" },
        { fieldId: "artist_photo", label: "Artist Photo", type: "image", required: false },
      ],
      fabric: { version: "7.4.0", objects, background: base.canvas.background },
    };
  }

  if (tpl.slug === "instagram-carousel-coach") {
    const objects: EditorObject[] = [
      shape("Rect", { ...stamp0("background", "Background"), width: W, height: H, fill: `hsl(${tpl.hue} 35% 12%)`, kLocked: true, kEditable: false, kMovable: false, kResizable: false, kRotatable: false, kDeletable: false, kStyleEditable: false }),
      shape("Rect", { ...stamp0("accent_bar", "Accent bar"), left: W * 0.07, top: H * 0.24, width: W * 0.18, height: H * 0.012, fill: `hsl(${tpl.hue} 80% 55%)`, kLocked: true, kEditable: false, kMovable: false, kResizable: false, kRotatable: false, kDeletable: false, kStyleEditable: false }),
      tx({ ...stamp0("headline_01", "Slide Headline"), left: W * 0.07, top: H * 0.3, width: W * 0.86, fontSize: Math.round(W * 0.085), text: "FIVE HABITS THAT GROW YOUR BRAND", kPlaceholder: "headline" }),
      tx({ ...stamp0("body_01", "Slide Body"), left: W * 0.07, top: H * 0.58, width: W * 0.8, fontSize: Math.round(W * 0.032), fontWeight: "400", fill: "rgba(255,255,255,0.75)", lineHeight: 1.4, text: "Swipe for the full breakdown — save this post so you can come back to it before your next content day.", kPlaceholder: "body" }),
      tx({ ...stamp0("page_01", "Page Number"), left: W * 0.07, top: H * 0.88, width: W * 0.3, fontSize: Math.round(W * 0.028), fontWeight: "700", fill: `hsl(${tpl.hue} 80% 60%)`, text: "01 / 10", kPlaceholder: "page_number", kDeletable: false }),
    ];
    return {
      ...base,
      fields: [
        { fieldId: "headline", label: "Headline", type: "text", required: true, maxLength: 60, defaultValue: "FIVE HABITS THAT GROW YOUR BRAND" },
        { fieldId: "body", label: "Body Text", type: "text", required: false, maxLength: 220, defaultValue: "" },
        { fieldId: "page_number", label: "Page Number", type: "text", required: false, maxLength: 10, defaultValue: "01 / 10" },
      ],
      fabric: { version: "7.4.0", objects, background: base.canvas.background },
    };
  }

  // generic starter canvas for any other template
  const objects: EditorObject[] = [
    shape("Rect", { ...stamp0("background", "Background"), width: W, height: H, fill: `hsl(${tpl.hue} 40% 10%)`, kLocked: true, kEditable: false, kMovable: false, kResizable: false, kRotatable: false, kDeletable: false, kStyleEditable: false }),
    tx({ ...stamp0("headline_01", "Headline"), left: W * 0.07, top: H * 0.55, width: W * 0.86, fontSize: Math.round(W * 0.09), text: tpl.name.toUpperCase().slice(0, 40), kPlaceholder: "headline" }),
    tx({ ...stamp0("sub_01", "Subheading"), left: W * 0.07, top: H * 0.75, width: W * 0.8, fontSize: Math.round(W * 0.032), fontWeight: "400", fill: "rgba(255,255,255,0.72)", text: "Edit this text in Kon10 Editor", kPlaceholder: "subheading" }),
  ];
  return {
    ...base,
    fields: [
      { fieldId: "headline", label: "Headline", type: "text", required: true, maxLength: 40, defaultValue: tpl.name },
      { fieldId: "subheading", label: "Subheading", type: "text", required: false, maxLength: 80, defaultValue: "" },
    ],
    fabric: { version: "7.4.0", objects, background: base.canvas.background },
  };
}

function stamp0(kId: string, kName: string): EditorObject {
  const o = {} as EditorObject;
  stampKon10(o, kName);
  o.kId = kId;
  return o;
}

/** Resolve the master doc for a template: admin-authored JSON wins, seed generator otherwise. */
export function masterDocFor(tpl: Template): Kon10Doc {
  if (tpl.canvasJson) {
    try {
      const doc = JSON.parse(tpl.canvasJson) as Kon10Doc;
      if (doc && doc.fabric) {
        // Sanitize object types for Fabric 7 compatibility (e.g. FabricImage -> Image)
        if (Array.isArray(doc.fabric.objects)) {
          doc.fabric.objects = doc.fabric.objects.map((o) => {
            const item = { ...o } as Record<string, unknown>;
            if (item.type === "FabricImage" || item.type === "fabricImage") {
              item.type = "Image";
            }
            return item as EditorObject;
          });
        }
        return doc;
      }
    } catch { /* fall through to seed */ }
  }
  return buildSeedDoc(tpl);
}

/** Friendly editor errors — never raw stack traces (§50). */
export function editorError(kind: "load" | "image" | "save" | "export" | "permission"): string {
  const map = {
    load: "Template failed to load — please try again.",
    image: "Image failed to load — try a different file.",
    save: "Your design could not be saved — it will retry automatically.",
    export: "Export failed — please try again.",
    permission: "You don't have permission to edit this template.",
  } as const;
  toast.error(map[kind]);
  return map[kind];
}
