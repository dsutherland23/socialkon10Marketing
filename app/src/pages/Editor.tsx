/* ------------------------------------------------------------------
   KON10 STUDIO (Editor PRD — premium upgrade, §1–§65)
   Routes: /editor/:slug (customer) · /editor/author/:slug (authoring)
   Fabric.js is the canvas engine; everything else here is ours.
   Dark studio chrome, floating contextual toolbar, smart guides,
   rulers/grid/safe-area overlays, command palette, multi-page docs,
   staged export dialog with design check, onboarding, template swap.
   Canva-parity batch: distribute/tidy-up, SVG export, R/C/L/T quick
   insert, text effects (shadow/lift/hollow/neon/echo), QR generator,
   gradient fills (shapes + background).
   Parity batch 2: on-device AI background remover (@imgly), magic
   resize presets, version history snapshots, ruler drag-out guides,
   star/heart/hex masks, brand kit, Openverse stock photos.
------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ActiveSelection, Canvas, Circle, FabricImage, Gradient, Group, Line, Path, PencilBrush, Point, Polygon, Rect, Shadow,
  Textbox, Triangle, classRegistry, filters, util, type FabricObject,
} from "fabric";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { useAuth } from "../lib/auth";
import { firebaseReady } from "../lib/firebase";
import { addManaged, getFileBuffer, listMyOrders, updateManaged } from "../lib/backend";
import { track, useSEO } from "../lib/seo";
import { entitlementsFromOrders, useTemplates, type Template, type Orientation, type TemplateStatus } from "../lib/templates";

import { parsePsdToFabricJson } from "../lib/psd-import";
import {
  KON10_PROPS, applyCustomerPermissions, applyPermissionsToAll, buildSeedDoc, deletableObjects, editorError, masterDocFor,
  parseCanvasSize, stampKon10, validateTemplateDoc,
  type EditorObject, type Kon10Doc, type Kon10Field, type FadeMaskDirection,
} from "../lib/editor";
import {
  clearDraft, createDesign, deleteVersion, deliverProofToOrder, findDesignFor, getCustomerDesignById, listVersions, readDraft, readDraftAsync, saveDesign, saveDraft, saveVersion,
  type CustomerDesign, type DesignVersion,
} from "../lib/editor-store";
import {
  ELEMENTS, ensureFontLoaded, normalizeHex, runDesignChecks, starPoints,
  type DesignCheck, type ElementKind,
} from "../lib/editor-studio";
import { ColorField, FontField, Tip, Toggle } from "./editor/ui";
import { GRAPHICS_LIBRARY, type GraphicItem } from "../lib/graphics-library";
import { FRAME_TEMPLATES, type FrameTemplate } from "../lib/frames";
import { MAGIC_WRITE_OPTIONS, generateAiCopy } from "../lib/ai-copywriter";
import { ANIMATION_PRESETS, playAnimationCycle, recordCanvasAnimation, captureInitialState, restoreInitialState, type AnimationType } from "../lib/canvas-animator";
import { MOCKUP_TEMPLATES, generateMockupDataUrl } from "../lib/mockup-generator";
import { parseCsvText, applyCsvRowToCanvas } from "../lib/bulk-merge";
import { generateBarcodeSvg, svgToDataUrl } from "../lib/barcodes";
import { exportFabricCanvasToPsdBlob, triggerPsdDownload } from "../lib/psd-export";

// Register Fabric class aliases so classRegistry handles Image / FabricImage interchangeably
try {
  classRegistry.setClass(FabricImage, "FabricImage");
  classRegistry.setClass(FabricImage, "fabricImage");
  classRegistry.setClass(FabricImage, "Image");
  classRegistry.setClass(FabricImage, "image");
} catch {
  // safe ignore
}

// Non-destructive Layer Mask Fade renderer on FabricImage
const originalFabricImageRender = FabricImage.prototype._render;
FabricImage.prototype._render = function (ctx: CanvasRenderingContext2D) {
  const eo = this as unknown as EditorObject;
  const mask = eo.kFadeMask;
  if (!mask || mask.direction === "none" || mask.depth <= 0) {
    return originalFabricImageRender.call(this, ctx);
  }

  const w = Math.round(this.width || 1);
  const h = Math.round(this.height || 1);

  let offCanvas = (this as unknown as { __fadeCanvas?: HTMLCanvasElement }).__fadeCanvas;
  if (!offCanvas) {
    offCanvas = document.createElement("canvas");
    (this as unknown as { __fadeCanvas: HTMLCanvasElement }).__fadeCanvas = offCanvas;
  }
  if (offCanvas.width !== w || offCanvas.height !== h) {
    offCanvas.width = w;
    offCanvas.height = h;
  }
  const mCtx = offCanvas.getContext("2d");
  if (!mCtx) {
    return originalFabricImageRender.call(this, ctx);
  }

  mCtx.clearRect(0, 0, w, h);
  mCtx.save();
  const el = (this as unknown as { _element?: HTMLImageElement | HTMLCanvasElement })._element;
  if (el) {
    mCtx.drawImage(el, 0, 0, w, h);
  }
  mCtx.restore();

  // Apply non-destructive alpha gradient mask
  mCtx.save();
  mCtx.globalCompositeOperation = "destination-in";

  const depth = Math.min(1, Math.max(0.02, mask.depth || 0.45));
  let grad: CanvasGradient;

  switch (mask.direction) {
    case "bottom": {
      const startY = h * (1 - depth);
      grad = mCtx.createLinearGradient(0, startY, 0, h);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, w, h);
      break;
    }
    case "top": {
      const endY = h * depth;
      grad = mCtx.createLinearGradient(0, endY, 0, 0);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, w, h);
      break;
    }
    case "left": {
      const endX = w * depth;
      grad = mCtx.createLinearGradient(endX, 0, 0, 0);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, w, h);
      break;
    }
    case "right": {
      const startX = w * (1 - depth);
      grad = mCtx.createLinearGradient(startX, 0, w, 0);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, w, h);
      break;
    }
    case "radial": {
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(cx, cy);
      const innerR = Math.max(0, r * (1 - depth));
      grad = mCtx.createRadialGradient(cx, cy, innerR, cx, cy, r);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, w, h);
      break;
    }
    case "vertical": {
      const dY = h * depth * 0.5;
      grad = mCtx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(Math.min(0.49, dY / h), "rgba(0,0,0,1)");
      grad.addColorStop(Math.max(0.51, 1 - dY / h), "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, w, h);
      break;
    }
    case "horizontal": {
      const dX = w * depth * 0.5;
      grad = mCtx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(Math.min(0.49, dX / w), "rgba(0,0,0,1)");
      grad.addColorStop(Math.max(0.51, 1 - dX / w), "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, w, h);
      break;
    }
    case "top-left": {
      grad = mCtx.createLinearGradient(w * depth, h * depth, 0, 0);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, w, h);
      break;
    }
    case "top-right": {
      grad = mCtx.createLinearGradient(w * (1 - depth), h * depth, w, 0);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, w, h);
      break;
    }
    case "bottom-left": {
      grad = mCtx.createLinearGradient(w * depth, h * (1 - depth), 0, h);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, w, h);
      break;
    }
    case "bottom-right": {
      grad = mCtx.createLinearGradient(w * (1 - depth), h * (1 - depth), w, h);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, w, h);
      break;
    }
    default:
      break;
  }
  mCtx.restore();

  ctx.drawImage(offCanvas, -w / 2, -h / 2, w, h);
};
import "./editor/studio.css";

type SaveState = "saved" | "saving" | "syncing" | "unsaved" | "failed";
type LeftTab = "pages" | "templates" | "elements" | "frames" | "text" | "uploads" | "mockups" | "bulk" | "draw" | "background" | "layers" | "fields";

interface SelInfo { kind: "none" | "text" | "image" | "shape" | "multi"; obj: FabricObject | null }
interface PageMeta { id: string; name: string }

type RulerUnit = "px" | "in" | "cm" | "mm";

const RULER_UNITS: { id: RulerUnit; label: string; symbol: string; pxPerUnit: number }[] = [
  { id: "px", label: "Pixels (px)", symbol: "px", pxPerUnit: 1 },
  { id: "in", label: "Inches (in)", symbol: "in", pxPerUnit: 96 },
  { id: "cm", label: "Centimeters (cm)", symbol: "cm", pxPerUnit: 96 / 2.54 },
  { id: "mm", label: "Millimeters (mm)", symbol: "mm", pxPerUnit: 96 / 25.4 },
];

function getOuterRulerTicks(
  origin: number,
  stageLength: number,
  _canvasLength: number,
  unit: RulerUnit,
  zoomLevel: number
) {
  const cfg = RULER_UNITS.find((u) => u.id === unit) || RULER_UNITS[0];
  const pxPerUnit = cfg.pxPerUnit;
  const scaledUnit = pxPerUnit * zoomLevel;

  let step = 100;
  if (unit === "px") {
    if (zoomLevel >= 2.0) step = 20;
    else if (zoomLevel >= 1.2) step = 50;
    else if (zoomLevel >= 0.6) step = 100;
    else if (zoomLevel >= 0.3) step = 200;
    else if (zoomLevel >= 0.15) step = 500;
    else step = 1000;
  } else if (unit === "in") {
    if (zoomLevel >= 2.0) step = 0.25;
    else if (zoomLevel >= 1.0) step = 0.5;
    else if (zoomLevel >= 0.5) step = 1;
    else if (zoomLevel >= 0.25) step = 2;
    else step = 5;
  } else if (unit === "cm") {
    if (zoomLevel >= 2.0) step = 0.5;
    else if (zoomLevel >= 1.0) step = 1;
    else if (zoomLevel >= 0.5) step = 2;
    else if (zoomLevel >= 0.25) step = 5;
    else step = 10;
  } else if (unit === "mm") {
    if (zoomLevel >= 2.0) step = 5;
    else if (zoomLevel >= 1.0) step = 10;
    else if (zoomLevel >= 0.5) step = 20;
    else if (zoomLevel >= 0.25) step = 50;
    else step = 100;
  }

  const subStep = step / 5;
  const subScaled = subStep * scaledUnit;

  const minVal = Math.floor((-origin - 100) / (subScaled || 1)) * subStep;
  const maxVal = Math.ceil((stageLength - origin + 100) / (subScaled || 1)) * subStep;

  const ticks: {
    screenPos: number;
    val: number;
    isMajor: boolean;
    isSub: boolean;
    label?: string;
  }[] = [];

  for (let v = minVal; v <= maxVal + subStep * 0.5; v += subStep) {
    const screenPos = origin + v * scaledUnit;
    if (screenPos < -50 || screenPos > stageLength + 50) continue;

    const isMajor = Math.abs(Math.round(v / step) * step - v) < subStep * 0.05;
    const isMid = !isMajor && Math.abs(Math.round((v * 2) / step) * (step / 2) - v) < subStep * 0.05;

    let label: string | undefined = undefined;
    if (isMajor) {
      const rounded = Math.round(v * 1000) / 1000;
      if (unit === "in") {
        label = Number.isInteger(rounded) ? `${rounded}"` : `${rounded.toFixed(1)}"`;
      } else {
        label = String(rounded);
      }
    }

    ticks.push({
      screenPos,
      val: v,
      isMajor,
      isSub: !isMajor && !isMid,
      label,
    });
  }

  return { ticks, step, pxPerUnit, symbol: cfg.symbol };
}

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2];
const GRID_STEP = 40;

function isText(o: FabricObject | null) { return !!o && /^(textbox|itext|i-text|text)$/i.test(o.type ?? ""); }
function isImage(o: FabricObject | null) { return !!o && /^(fabricimage|image)$/i.test(o.type ?? ""); }
function isActiveSelection(o: FabricObject | null) { return !!o && /^activeselection$/i.test(o.type ?? ""); }
function isGroup(o: FabricObject | null) { return !!o && /^group$/i.test(o.type ?? ""); }

/** read + downscale an uploaded image to a dataURL so designs serialize */
function fileToDataUrl(file: File, maxDim = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return reject(new Error("Use JPG, PNG or WebP."));
    if (file.size > 8 * 1024 * 1024) return reject(new Error("Image must be under 8MB."));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image failed to load — try a different file.")); };
    img.src = url;
  });
}

/** Render a clean, unshifted, exact-bounds dataURL of the Fabric canvas (no zoom/pan/viewport artifacts) */
function renderCleanDataUrl(
  c: Canvas,
  canvasSize: { width: number; height: number },
  options: { format?: "png" | "jpeg"; quality?: number; multiplier?: number; transparentBg?: boolean } = {}
): string {
  const origVpt: [number, number, number, number, number, number] = c.viewportTransform
    ? [c.viewportTransform[0], c.viewportTransform[1], c.viewportTransform[2], c.viewportTransform[3], c.viewportTransform[4], c.viewportTransform[5]]
    : [1, 0, 0, 1, 0, 0];
  const origW = c.getWidth();
  const origH = c.getHeight();
  const origZoom = c.getZoom();
  const origBg = c.backgroundColor;

  // Preserve active selection and text-editing state so auto-save NEVER interrupts typing
  const activeObj = c.getActiveObject();
  const isEditing = !!(activeObj as unknown as { isEditing?: boolean } | null)?.isEditing;
  const selStart = (activeObj as unknown as { selectionStart?: number } | null)?.selectionStart;
  const selEnd = (activeObj as unknown as { selectionEnd?: number } | null)?.selectionEnd;

  // Temporarily hide selection controls during export without exiting editing mode
  if (activeObj) {
    (activeObj as unknown as { hasControls?: boolean }).hasControls = false;
    (activeObj as unknown as { hasBorders?: boolean }).hasBorders = false;
  }

  c.viewportTransform = [1, 0, 0, 1, 0, 0];
  c.setDimensions({ width: canvasSize.width, height: canvasSize.height });
  if (options.transparentBg && options.format !== "jpeg") {
    c.backgroundColor = "";
  }
  c.renderAll();

  const dataUrl = c.toDataURL({
    format: options.format || "png",
    quality: options.quality ?? 1,
    multiplier: options.multiplier ?? 1,
    left: 0,
    top: 0,
    width: canvasSize.width,
    height: canvasSize.height,
  });

  c.backgroundColor = origBg;
  c.viewportTransform = origVpt;
  c.setDimensions({ width: origW, height: origH });
  c.setZoom(origZoom);

  // Restore selection controls and maintain active editing session
  if (activeObj) {
    (activeObj as unknown as { hasControls?: boolean }).hasControls = true;
    (activeObj as unknown as { hasBorders?: boolean }).hasBorders = true;
    c.setActiveObject(activeObj);
    if (isEditing && typeof (activeObj as unknown as { enterEditing?: () => void }).enterEditing === "function") {
      try {
        (activeObj as unknown as { enterEditing: () => void }).enterEditing();
        if (typeof selStart === "number" && typeof selEnd === "number") {
          (activeObj as unknown as { selectionStart: number; selectionEnd: number }).selectionStart = selStart;
          (activeObj as unknown as { selectionEnd: number }).selectionEnd = selEnd;
        }
        (activeObj as unknown as { hiddenTextarea?: HTMLTextAreaElement }).hiddenTextarea?.focus();
      } catch {
        // no-op
      }
    }
  }

  c.renderAll();

  return dataUrl;
}

/** Selection classification, shared by fabric events + layer clicks. */
function readSelection(c: Canvas): SelInfo {
  const a = c.getActiveObject();
  if (!a) return { kind: "none", obj: null };
  if (isActiveSelection(a)) {
    // group manipulation must not bypass child permissions
    const kids = (a as unknown as ActiveSelection).getObjects();
    if (kids.some((k) => { const e = k as unknown as EditorObject; return e.kLocked || e.kMovable === false; })) {
      a.lockMovementX = true; a.lockMovementY = true;
    }
    return { kind: "multi", obj: a };
  }
  const raw = a as unknown as EditorObject;
  const isPsdTxt = Boolean(raw.kIsPsdText || raw.kLayerType === "text");
  return { kind: (isText(a) || isPsdTxt) ? "text" : isImage(a) ? "image" : "shape", obj: a };
}

/** Colors currently used on the canvas (§12 document colors). */
function collectDocColors(c: Canvas | null): string[] {
  if (!c) return [];
  const set = new Set<string>();
  c.getObjects().forEach((o) => {
    const f = normalizeHex(o.fill);
    const s = normalizeHex(o.stroke);
    if (f) set.add(f);
    if (s && (o.strokeWidth ?? 0) > 0) set.add(s);
  });
  return [...set].slice(0, 14);
}

/* ---------------- left rail tabs ---------------- */

const RAIL: { id: LeftTab; label: string; tip: string; d: string }[] = [
  { id: "pages", label: "Pages", tip: "Pages", d: "M6 3h9l4 4v14H6z M15 3v4h4" },
  { id: "templates", label: "Design", tip: "Change template", d: "M4 4h7v7H4z M13 4h7v7h-7z M4 15h7v5H4z M13 15h7v5h-7z" },
  { id: "elements", label: "Elements", tip: "Graphics & Stickers", d: "M12 3l9 9-9 9-9-9z" },
  { id: "frames", label: "Frames", tip: "Photo Frames & Mockups", d: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zm4 5l3 4 2-2 5 6H6l2-8z" },
  { id: "text", label: "Text", tip: "Text & AI Copy", d: "M5 6V4h14v2 M12 4v16 M9 20h6" },
  { id: "uploads", label: "Uploads", tip: "Uploads & Photos", d: "M12 16V4 M7 9l5-5 5 5 M4 16v4h16v-4" },
  { id: "mockups", label: "3D Mockup", tip: "3D Product Mockups", d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" },
  { id: "bulk", label: "Bulk CSV", tip: "Bulk CSV Data Merge", d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" },
  { id: "draw", label: "Draw", tip: "Brush tool", d: "M4 20l1.2-4.2L16 5l3 3L8.2 18.8z M14 7l3 3" },
  { id: "background", label: "Bg", tip: "Background & colors", d: "M5 4h14v10H5z M8 18h8" },
  { id: "layers", label: "Layers", tip: "Layers", d: "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17l9 5 9-5" },
  { id: "fields", label: "Fields", tip: "Template fields (author)", d: "M4 6h16 M4 12h16 M4 18h10" },
];

function RailIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round">
      <path d={d} />
    </svg>
  );
}

/* ---------------- element glyphs ---------------- */

function Glyph({ kind }: { kind: ElementKind }) {
  const common = { width: 22, height: 22, viewBox: "0 0 22 22", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinejoin: "round", strokeLinecap: "round" } as const;
  switch (kind) {
    case "rect": return <svg {...common}><rect x="3" y="5" width="16" height="12" /></svg>;
    case "rounded": return <svg {...common}><rect x="3" y="5" width="16" height="12" rx="4" /></svg>;
    case "circle": return <svg {...common}><circle cx="11" cy="11" r="8" /></svg>;
    case "ellipse": return <svg {...common}><ellipse cx="11" cy="11" rx="9" ry="6" /></svg>;
    case "triangle": return <svg {...common}><path d="M11 4 L19 18 H3 Z" /></svg>;
    case "pill": return <svg {...common}><rect x="2" y="7" width="18" height="8" rx="4" /></svg>;
    case "diamond": return <svg {...common}><path d="M11 3 L19 11 L11 19 L3 11 Z" /></svg>;
    case "ring": return <svg {...common}><circle cx="11" cy="11" r="8" /><circle cx="11" cy="11" r="3.5" /></svg>;
    case "cross": return <svg {...common}><path d="M9 3 h4 v6 h6 v4 h-6 v6 h-4 v-6 h-6 v-4 h6 Z" /></svg>;
    case "line": return <svg {...common}><path d="M3 16 L19 6" /></svg>;
    case "dash": return <svg {...common} strokeDasharray="3 3"><path d="M3 16 L19 6" /></svg>;
    case "arrow-r": return <svg {...common}><path d="M3 11 H17 M13 6 L19 11 L13 16" /></svg>;
    case "arrow-l": return <svg {...common}><path d="M19 11 H5 M9 6 L3 11 L9 16" /></svg>;
    case "arrow-u": return <svg {...common}><path d="M11 19 V5 M6 9 L11 3 L16 9" /></svg>;
    case "arrow-d": return <svg {...common}><path d="M11 3 V19 M6 13 L11 19 L16 13" /></svg>;
    case "star": return <svg {...common}><path d="M11 3 L13.5 8.5 L19.5 9 L15 13 L16.5 19 L11 15.5 L5.5 19 L7 13 L2.5 9 L8.5 8.5 Z" /></svg>;
    case "burst": return <svg {...common}><path d="M11 2 L13 7 L18 4 L16 9 L21 11 L16 13 L18 18 L13 15 L11 21 L9 15 L4 18 L6 13 L1 11 L6 9 L4 4 L9 7 Z" /></svg>;
    case "chevron": return <svg {...common}><path d="M4 4 L14 4 L20 11 L14 18 L4 18 L10 11 Z" /></svg>;
  }
}

const ALIGNS: { id: "left" | "centerX" | "right" | "top" | "centerY" | "bottom"; tip: string; d: string }[] = [
  { id: "left", tip: "Align left", d: "M5 4v16 M8 7h11 M8 13h7" },
  { id: "centerX", tip: "Align center", d: "M12 4v16 M6 7h12 M8 13h8" },
  { id: "right", tip: "Align right", d: "M19 4v16 M5 7h11 M10 13h7" },
  { id: "top", tip: "Align top", d: "M4 5h16 M7 8v11 M13 8v7" },
  { id: "centerY", tip: "Align middle", d: "M4 12h16 M7 6v12 M13 8v8" },
  { id: "bottom", tip: "Align bottom", d: "M4 19h16 M7 5v11 M13 9v7" },
];

const BLENDS: [string, string][] = [
  ["source-over", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"], ["overlay", "Overlay"],
  ["darken", "Darken"], ["lighten", "Lighten"], ["soft-light", "Soft light"], ["difference", "Difference"],
];

const GRADIENT_PRESETS: [string, string][] = [
  ["#ff8a00", "#ff3d77"], ["#7c3aed", "#2563eb"], ["#06b6d4", "#3b82f6"],
  ["#fbbf24", "#f43f5e"], ["#22c55e", "#0ea5e9"], ["#ec4899", "#8b5cf6"],
  ["#f8fafc", "#94a3b8"], ["#0f172a", "#334155"],
];

/** linear gradient fill in object-local pixel coords (scales with the object) */
function makeGradient(w: number, h: number, from: string, to: string, dir: "h" | "v" | "d"): Gradient<"linear"> {
  const coords = dir === "h" ? { x1: 0, y1: 0, x2: w, y2: 0 }
    : dir === "v" ? { x1: 0, y1: 0, x2: 0, y2: h }
    : { x1: 0, y1: 0, x2: w, y2: h };
  return new Gradient<"linear">({
    type: "linear", gradientUnits: "pixels", coords,
    colorStops: [{ offset: 0, color: from }, { offset: 1, color: to }],
  });
}

export function gradientCss(fill: unknown): string | null {
  if (fill instanceof Gradient) {
    const stops = fill.colorStops.map((s) => s.color);
    return stops.length >= 2 ? `linear-gradient(135deg, ${stops[0]}, ${stops[stops.length - 1]})` : null;
  }
  return null;
}

/** read a linear gradient fill back into editable parts (colors + direction) */
function readGradient(fill: unknown): { from: string; to: string; dir: "h" | "v" | "d" } | null {
  if (!(fill instanceof Gradient)) return null;
  const stops = fill.colorStops;
  if (stops.length < 2) return null;
  const from = normalizeHex(stops[0].color) ?? "#7c3aed";
  const to = normalizeHex(stops[stops.length - 1].color) ?? "#06b6d4";
  const co = fill.coords as { x1?: number; y1?: number; x2?: number; y2?: number };
  const dx = Math.abs((co.x2 ?? 0) - (co.x1 ?? 0));
  const dy = Math.abs((co.y2 ?? 0) - (co.y1 ?? 0));
  const dir: "h" | "v" | "d" = dx > 0.5 && dy < 0.5 ? "h" : dy > 0.5 && dx < 0.5 ? "v" : "d";
  return { from, to, dir };
}

/**
 * Gradient editor — presets + custom two-color + direction.
 * When the target already HAS a gradient, the controls reflect it and every
 * change applies live; otherwise an explicit Apply button commits it.
 */
function GradientEditor({ fill, disabled, docColors = [], onApply, onSolid, applyLabel = "Apply gradient" }: {
  fill: unknown;
  disabled?: boolean;
  docColors?: string[];
  onApply: (from: string, to: string, dir: "h" | "v" | "d") => void;
  onSolid: (hex: string) => void;
  applyLabel?: string;
}) {
  const live = readGradient(fill);
  const liveKey = live ? `${live.from}|${live.to}|${live.dir}` : "";
  const [from, setFrom] = useState("#7c3aed");
  const [to, setTo] = useState("#06b6d4");
  const [dir, setDir] = useState<"h" | "v" | "d">("d");
  useEffect(() => {
    if (live) { setFrom(live.from); setTo(live.to); setDir(live.dir); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);
  const edit = (f: string, t: string, d: "h" | "v" | "d") => {
    setFrom(f); setTo(t); setDir(d);
    if (live) onApply(f, t, d);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {GRADIENT_PRESETS.map(([a, b]) => (
          <button key={a + b} className="s-swatch" disabled={disabled}
            style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
            aria-label={`Gradient ${a} to ${b}`}
            onClick={() => { setFrom(a); setTo(b); onApply(a, b, "d"); }} />
        ))}
      </div>
      <div className="flex gap-1.5 mt-2">
        <div className="grow"><ColorField label="From" value={from} disabled={disabled} docColors={docColors} onChange={(hex) => edit(hex, to, dir)} /></div>
        <div className="grow"><ColorField label="To" value={to} disabled={disabled} docColors={docColors} onChange={(hex) => edit(from, hex, dir)} /></div>
      </div>
      <div className="flex gap-1 mt-1.5">
        {([["h", "→"], ["v", "↓"], ["d", "↘"]] as const).map(([d2, glyph]) => (
          <button key={d2} className={"s-btn s-btn-line grow !px-0" + (dir === d2 ? " s-btn-on" : "")}
            disabled={disabled} aria-label={`Gradient direction ${d2}`} onClick={() => edit(from, to, d2)}>{glyph}</button>
        ))}
      </div>
      {live ? (
        <>
          <p className="font-meta text-[9px] uppercase tracking-wider text-[var(--s-muted)] mt-2">
            Editing the existing gradient — changes apply live
          </p>
          <button className="s-btn s-btn-line w-full mt-1" disabled={disabled} onClick={() => onSolid(from)}>
            Back to solid color
          </button>
        </>
      ) : (
        <button className="s-list-btn justify-center mt-1.5" disabled={disabled} onClick={() => onApply(from, to, dir)}>
          {applyLabel}
        </button>
      )}
    </div>
  );
}

/* ---------------- resize presets + mask geometry ---------------- */

const RESIZE_PRESETS: { name: string; w: number; h: number }[] = [
  { name: "Instagram Post", w: 1080, h: 1080 },
  { name: "Story / Reel", w: 1080, h: 1920 },
  { name: "Facebook Post", w: 1200, h: 630 },
  { name: "X / Twitter Post", w: 1600, h: 900 },
  { name: "Flyer 5×7", w: 1500, h: 2100 },
  { name: "Business Card", w: 1050, h: 600 },
  { name: "A4 Print", w: 2480, h: 3508 },
];

function hexPoints(r: number): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
}

/** rough heart path covering a 2r × 2r box, centered on 0,0 */
function heartPath(r: number): string {
  return `M0 ${r * 0.85} C ${-1.6 * r} ${-0.25 * r} ${-0.55 * r} ${-1.15 * r} 0 ${-0.35 * r} C ${0.55 * r} ${-1.15 * r} ${1.6 * r} ${-0.25 * r} 0 ${r * 0.85} Z`;
}

interface StockHit { id: string; title: string; url: string; thumb: string; creator: string; source: string }

const STYLE_PROPS = [
  "fill", "stroke", "strokeWidth", "opacity", "fontFamily", "fontSize", "fontWeight",
  "fontStyle", "underline", "linethrough", "textAlign", "charSpacing", "lineHeight", "textBackgroundColor",
] as const;

const ONBOARD_STEPS = [
  {
    title: "Welcome to KON10 Studio",
    body: "Click any text on the canvas to edit it — type straight into the design.",
    tips: ["Press R · C · L · T to drop a rect, circle, line or text instantly", "⌘K opens the command palette — every tool, one search away"],
  },
  {
    title: "Images, minus the busywork",
    body: "Click an image, then Replace to drop in your own photo — frames and sizing stay put.",
    tips: ["Remove background with on-device AI — no upload, no waitlist", "Mask photos into circles, stars, hearts and hexagons", "Search free commercial-use stock photos right from Uploads"],
  },
  {
    title: "Elements that do more",
    body: "Shapes, gradients, arrows and badges — plus a QR code generator for menus, tickets and socials.",
    tips: ["Gradient fills on shapes and backgrounds, with presets or your own two colors", "Text effects: Shadow, Lift, Hollow, Neon and Echo from the Text tab"],
  },
  {
    title: "Arrange like a pro",
    body: "Smart guides snap things into place as you drag. Rulers can do more — drag one out to place your own guide.",
    tips: ["Select 3+ elements and Space ↔ / ↕ to tidy them evenly", "Layers panel: rename, reorder, hide or lock anything"],
  },
  {
    title: "Resize without rework",
    body: "Finished a flyer and need a Story? Resize refits the whole design — every page — to the new format, distortion-free.",
    tips: ["Version history: save snapshots and rewind anytime — restoring auto-saves first"],
  },
  {
    title: "Make it yours, then ship it",
    body: "Adjust colors, fonts and layout — everything saves automatically as you work.",
    tips: ["Download as PNG, JPG, SVG or print-ready PDF with a built-in design check", "Save your brand palette and logos in the Bg tab — they follow you into every design"],
  },
];

const SHORTCUTS: [string, string][] = [
  ["Undo / Redo", "⌘Z · ⌘⇧Z"],
  ["Copy / Paste / Duplicate", "⌘C · ⌘V · ⌘D"],
  ["Cut", "⌘X"],
  ["Bold / Italic / Underline", "⌘B · ⌘I · ⌘U"],
  ["Strikethrough", "⌘⇧X"],
  ["Align text L / C / R / justify", "⌘⇧L · E · R · J"],
  ["Group / Ungroup", "⌘G · ⌘⇧G"],
  ["Select all", "⌘A"],
  ["Save now", "⌘S"],
  ["Nudge (fast)", "←↑↓→ (⇧)"],
  ["Bring forward / Send backward", "⌘] · ⌘["],
  ["Bring to front / Send to back", "⌘⇧] · ⌘⇧["],
  ["Zoom in / out / fit", "⌘+ · ⌘− · ⌘0"],
  ["Insert rect / circle / line / text", "R · C · L · T"],
  ["Select tool (exit brush/crop/etc.)", "V"],
  ["Select layer beneath cursor", "Alt+click"],
  ["Right-click any element", "quick actions"],
  ["Command palette", "⌘K"],
  ["Pan canvas", "Hold Space"],
  ["Delete", "⌫"],
  ["This list", "?"],
];

export default function Editor() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const clientParam = searchParams.get("client") || searchParams.get("email");
  const designIdParam = searchParams.get("designId");
  const orderIdParam = searchParams.get("orderId");
  const adminParam = searchParams.get("admin") === "true";
  const navigate = useNavigate();
  const isAuthor = window.location.pathname.startsWith("/editor/author/");
  useSEO({ title: "KON10 Studio — Social Kon10 Marketing", description: "Create. Customize. Download." });

  const { user, isAdmin } = useAuth();
  const isDesignerMode = !isAuthor && (isAdmin || adminParam || !!orderIdParam || (!!clientParam && clientParam !== user?.email));
  const { templates, ready } = useTemplates();
  const tpl: Template | undefined = useMemo(() => {
    const found = templates.find((x) => x.slug === slug);
    if (found) return found;
    if (slug && (isAuthor || isAdmin)) {
      return {
        slug,
        name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        description: "Studio template",
        category: "flyer",
        tags: [],
        keywords: [],
        software: "Adobe Photoshop",
        fileFormat: "PSD",
        dimensions: "1080 × 1350 px",
        resolution: "300 DPI",
        colorMode: "RGB",
        fileSize: "10 MB",
        orientation: "portrait" as Orientation,
        features: [],
        fonts: [],
        price: 0,
        licenseFees: { personal: 0, commercial: 0, extended: 0 },
        customizePrice: 0,
        customizeAvailable: false,
        versions: [],
        previewImages: [],
        status: "published" as TemplateStatus,
        bestseller: false,
        isNew: true,
        sales: 0,
        hue: 210,
        createdAt: new Date().toISOString().slice(0, 10),
      };
    }
    return undefined;
  }, [templates, slug, isAuthor, isAdmin]);



  const canvasEl = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fc = useRef<Canvas | null>(null);
  const historyRef = useRef<{ stack: string[]; idx: number }>({ stack: [], idx: -1 });
  const applyingRef = useRef(false);
  const panningRef = useRef(false);
  const spaceRef = useRef(false);
  const panStart = useRef({ x: 0, y: 0, vpt: [1, 0, 0, 1, 0, 0] as number[] });
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clipboardRef = useRef<{ items: string[]; offset: number } | null>(null);
  const styleRef = useRef<Record<string, unknown> | null>(null);
  const pagesRef = useRef<Record<string, Record<string, unknown>>>({});
  const snapCache = useRef<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const designRef = useRef<CustomerDesign | null>(null);

  const [access, setAccess] = useState<"checking" | "granted" | "denied">("checking");
  const [doc, setDoc] = useState<Kon10Doc | null>(null);
  const [design, setDesign] = useState<CustomerDesign | null>(null);
  const [sel, setSel] = useState<SelInfo>({ kind: "none", obj: null });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [zoom, setZoom] = useState(0.5);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab | null>("text");
  const [layers, setLayers] = useState<FabricObject[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [restore, setRestore] = useState<string | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [fields, setFields] = useState<Kon10Field[]>([]);
  const [booting, setBooting] = useState(true);
  const [psdImporting, setPsdImporting] = useState(false);
  const [psdProgress, setPsdProgress] = useState<string>("Fetching PSD…");
  const [, setViewTick] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  const [rulerUnit, setRulerUnit] = useState<RulerUnit>(() => {
    try { return (localStorage.getItem("sk-ruler-unit") as RulerUnit) || "px"; } catch { return "px"; }
  });
  const [rulerMenu, setRulerMenu] = useState<{ x: number; y: number } | null>(null);
  const [unitDropOpen, setUnitDropOpen] = useState(false);
  const [showSafe, setShowSafe] = useState(false);
  const [guidesLocked, setGuidesLocked] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [newGuideAxis, setNewGuideAxis] = useState<"v" | "h">("v");
  const [newGuideVal, setNewGuideVal] = useState<number>(100);
  const [safeModalOpen, setSafeModalOpen] = useState(false);
  const [safeConfig, setSafeConfig] = useState<{
    enabled: boolean;
    preset: "standard" | "story" | "print" | "square" | "custom";
    top: number;
    right: number;
    bottom: number;
    left: number;
    bleed: number;
    showBleed: boolean;
  }>(() => ({
    enabled: false,
    preset: "standard",
    top: 54,
    right: 54,
    bottom: 54,
    left: 54,
    bleed: 12,
    showBleed: false,
  }));
  const [snapOn, setSnapOn] = useState(true);
  const snapRef = useRef(true);
  const vGuideRef = useRef<HTMLDivElement>(null);
  const hGuideRef = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const ctxEventRef = useRef<Event | null>(null);
  const altCycleRef = useRef<{ time: number; hits: FabricObject[]; index: number }>({ time: 0, hits: [], index: 0 });
  const [zoomMenu, setZoomMenu] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFmt, setExportFmt] = useState<"png" | "jpg" | "pdf" | "svg" | "psd">("png");
  const [exportQuality, setExportQuality] = useState(0.92);
  const [exportPhase, setExportPhase] = useState<"idle" | "prep" | "render" | "done">("idle");
  const [checks, setChecks] = useState<DesignCheck[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQ, setPaletteQ] = useState("");
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [onboard, setOnboard] = useState<number | null>(null);
  const [swapFor, setSwapFor] = useState<Template | null>(null);
  const [pages, setPages] = useState<PageMeta[]>([{ id: "main", name: "Page 1" }]);
  const [activePage, setActivePage] = useState("main");
  const [dragOver, setDragOver] = useState(false);
  const [aspectLock, setAspectLock] = useState(true);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [folderRename, setFolderRename] = useState<string | null>(null);
  const [elemQ, setElemQ] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [sizeOverride, setSizeOverride] = useState<{ width: number; height: number } | null>(null);
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1080);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<DesignVersion[]>([]);
  const [userGuides, setUserGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [dragGuide, setDragGuide] = useState<{ axis: "v" | "h"; pos: number } | null>(null);
  const userGuidesRef = useRef(userGuides);
  const [brandPalette, setBrandPalette] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("sk-brand-palette") ?? "[]") as string[]; } catch { return []; }
  });
  const [brandLogos, setBrandLogos] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("sk-brand-logos") ?? "[]") as string[]; } catch { return []; }
  });
  const [stockQ, setStockQ] = useState("");
  const [stockHits, setStockHits] = useState<StockHit[]>([]);
  const [stockBusy, setStockBusy] = useState(false);
  const [userUploads, setUserUploads] = useState<{ id: string; name: string; url: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem("sk-user-uploads") ?? "[]"); } catch { return []; }
  });
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const [deliverModalOpen, setDeliverModalOpen] = useState(false);
  const [deliverNote, setDeliverNote] = useState("");
  const [deliveringProof, setDeliveringProof] = useState(false);
  const [masterOverride, setMasterOverride] = useState(isDesignerMode);
  const [fadeMenuOpen, setFadeMenuOpen] = useState(false);
  const [hoveredFadeEdge, setHoveredFadeEdge] = useState<FadeMaskDirection | null>(null);
  const [edgeTriggersVisible] = useState(true);
  const [layerExportOpen, setLayerExportOpen] = useState(false);
  const [layerExportFmt, setLayerExportFmt] = useState<"png" | "jpg">("png");
  const [layerExportScale, setLayerExportScale] = useState<number>(2);
  const [swapFrom, setSwapFrom] = useState("");
  const [swapTo, setSwapTo] = useState("#ffffff");
  const [drawing, setDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(8);
  const [brushColor, setBrushColor] = useState("#ffffff");
  const [brushSmooth, setBrushSmooth] = useState(8);
  const [erasing, setErasing] = useState(false);
  const eraserRef = useRef(false);
  /* ---- visual crop (HTML overlay — never pollutes the fabric doc) ---- */
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropImgRef = useRef<FabricImage | null>(null);
  const cropDrag = useRef<null | { mode: "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"; sx: number; sy: number; start: { x: number; y: number; w: number; h: number } }>(null);
  /* ---- retouch brushes (spot heal + clone stamp) ---- */
  const [retouch, setRetouch] = useState<null | { mode: "heal" | "clone"; size: number }>(null);
  const retouchRef = useRef<null | {
    mode: "heal" | "clone"; size: number; img: FabricImage; work: HTMLCanvasElement;
    painting: boolean; last: { x: number; y: number } | null;
    src: { x: number; y: number } | null; srcAtStart: { x: number; y: number } | null; strokeStart: { x: number; y: number } | null;
  }>(null);
  const retouchApi = useRef<{ down: (opt: { e: Event }) => boolean; move: (opt: { e: Event }) => void; up: () => void }>({ down: () => false, move: () => { }, up: () => { } });

  const masterDocRef = useRef<Kon10Doc | null>(null);
  const email = clientParam || user?.email || "demo@local";
  const canvasSize = useMemo(() => sizeOverride ?? (tpl ? parseCanvasSize(tpl.dimensions) : { width: 1080, height: 1350 }), [tpl, sizeOverride]);

  /* ---- Canva Parity Suite State ---- */
  const [barcodeVal, setBarcodeVal] = useState("SK-2026-TICKET");
  const [magicWriteOpen, setMagicWriteOpen] = useState(false);
  const [magicWriteBusy, setMagicWriteBusy] = useState(false);
  const [magicCustomPrompt, setMagicCustomPrompt] = useState("");
  const [animOpen, setAnimOpen] = useState(false);
  const [activeAnim, setActiveAnim] = useState<AnimationType>("rise");
  const [animPlaying, setAnimPlaying] = useState(false);
  const animCancelRef = useRef<null | (() => void)>(null);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [selectedMockup, setSelectedMockup] = useState("street_poster");
  const [mockupPreviewUrl, setMockupPreviewUrl] = useState<string | null>(null);
  const [mockupBusy, setMockupBusy] = useState(false);
  const [csvText, setCsvText] = useState("Name,Date,VIP Price,DJ\nVIP Guest 1,Aug 28,$50,DJ Sparks\nVIP Guest 2,Aug 29,$75,DJ Nova\nVIP Guest 3,Aug 30,$100,DJ Pulse");
  const [csvDataset, setCsvDataset] = useState(() => parseCsvText("Name,Date,VIP Price,DJ\nVIP Guest 1,Aug 28,$50,DJ Sparks\nVIP Guest 2,Aug 29,$75,DJ Nova\nVIP Guest 3,Aug 30,$100,DJ Pulse"));
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [printCropMarks, setPrintCropMarks] = useState(false);
  const [exportScale, setExportScale] = useState<1 | 2 | 3>(1);
  const [exportTransparent, setExportTransparent] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareQrUrl, setShareQrUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    if (!shareOpen) return;
    const shareUrl = window.location.href;
    void QRCode.toDataURL(shareUrl, {
      width: 240,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).then(setShareQrUrl);
  }, [shareOpen]);

  useEffect(() => { snapRef.current = snapOn; }, [snapOn]);
  useEffect(() => { designRef.current = design; }, [design]);
  useEffect(() => { userGuidesRef.current = userGuides; }, [userGuides]);

  /* close ruler unit dropdown on any outside click */
  useEffect(() => {
    if (!unitDropOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-ruler-menu]")) setUnitDropOpen(false);
    };
    document.addEventListener("mousedown", close, true);
    return () => document.removeEventListener("mousedown", close, true);
  }, [unitDropOpen]);

  /* ---------------- outer photoshop-style ruler metrics ---------------- */
  const [rulerMetrics, setRulerMetrics] = useState({ originX: 0, originY: 0, stageW: 1000, stageH: 800 });
  const [rulerCursor, setRulerCursor] = useState<{ x: number; y: number } | null>(null);

  const updateRulerMetrics = useCallback(() => {
    const stage = stageRef.current;
    const canvas = canvasEl.current;
    if (!stage || !canvas) return;
    const sRect = stage.getBoundingClientRect();
    const cRect = canvas.getBoundingClientRect();
    setRulerMetrics({
      originX: cRect.left - sRect.left,
      originY: cRect.top - sRect.top,
      stageW: sRect.width,
      stageH: sRect.height,
    });
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    updateRulerMetrics();
    stage.addEventListener("scroll", updateRulerMetrics, { passive: true });
    window.addEventListener("resize", updateRulerMetrics);
    const ro = new ResizeObserver(updateRulerMetrics);
    ro.observe(stage);
    return () => {
      stage.removeEventListener("scroll", updateRulerMetrics);
      window.removeEventListener("resize", updateRulerMetrics);
      ro.disconnect();
    };
  }, [updateRulerMetrics, leftTab, zoom, canvasSize, showRulers]);

  /* ---------------- access verification ---------------- */
  useEffect(() => {
    if (isAuthor || isAdmin || !firebaseReady) {
      setAccess("granted");
      return;
    }
    if (!ready) return;
    (async () => {
      if (!tpl) { setAccess("denied"); return; }
      const free = (tpl.salePrice ?? tpl.price) === 0 || tpl.price === 0;
      if (free) { setAccess("granted"); return; }
      const orders = await listMyOrders(user);
      const owned = entitlementsFromOrders(orders).some((e) => e.templateSlug === tpl.slug);
      setAccess(owned ? "granted" : "denied");
      if (!owned) track("editor_access_denied", { template: tpl.slug });
    })();
  }, [ready, tpl, user, isAdmin, isAuthor]);


  /* ---------------- serialization / zoom ---------------- */
  const refreshLayers = useCallback(() => {
    const c = fc.current;
    if (!c) return;
    // self-heal: a phantom ActiveSelection can never be a real layer — strip it
    // wherever it came from (old bug, restored version, imported JSON)
    const phantoms = c.getObjects().filter((o) => /^activeselection$/i.test(o.type ?? ""));
    if (phantoms.length) {
      applyingRef.current = true;
      c.remove(...phantoms);
      applyingRef.current = false;
    }
    setLayers([...c.getObjects()].reverse());
  }, []);

  const syncActivePage = useCallback(() => {
    const c = fc.current;
    if (!c) return;
    pagesRef.current[activePage] = c.toObject([...KON10_PROPS] as string[]) as Record<string, unknown>;
  }, [activePage]);

  const serialize = useCallback((): string => {
    const c = fc.current;
    if (!c || !doc) return "";
    syncActivePage();
    const fabric = c.toObject([...KON10_PROPS] as string[]) as Record<string, unknown>;
    const pageList = pages.map((p) => ({ ...p, fabric: p.id === activePage ? fabric : pagesRef.current[p.id] }));
    return JSON.stringify({ ...doc, fields, pages: pageList, fabric, guides: userGuides, folders });
  }, [doc, fields, pages, activePage, syncActivePage, userGuides, folders]);

  const applyZoom = useCallback((z: number) => {
    const c = fc.current;
    if (!c) return;
    const clamped = Math.min(2, Math.max(0.15, z));
    c.viewportTransform = [clamped, 0, 0, clamped, 0, 0];
    c.setZoom(clamped);
    c.setDimensions({ width: canvasSize.width * clamped, height: canvasSize.height * clamped });
    c.renderAll();
    setZoom(clamped);
  }, [canvasSize]);

  const fitZoom = useCallback(() => {
    const host = stageRef.current, c = fc.current;
    if (!host || !c) return;
    const fit = Math.min(2, Math.max(0.15, Math.min(
      (host.clientWidth - 160) / canvasSize.width,
      (host.clientHeight - 160) / canvasSize.height,
    )));
    c.viewportTransform = [fit, 0, 0, fit, 0, 0];
    c.setZoom(fit);
    c.setDimensions({ width: canvasSize.width * fit, height: canvasSize.height * fit });
    c.renderAll();
    setZoom(fit);
  }, [canvasSize]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().then(() => {
          setIsFullscreen(true);
          setTimeout(fitZoom, 150);
        }).catch(() => {
          setIsFullscreen(true);
          setTimeout(fitZoom, 150);
        });
      } else {
        setIsFullscreen(true);
        setTimeout(fitZoom, 150);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          setIsFullscreen(false);
          setTimeout(fitZoom, 150);
        }).catch(() => {
          setIsFullscreen(false);
          setTimeout(fitZoom, 150);
        });
      } else {
        setIsFullscreen(false);
        setTimeout(fitZoom, 150);
      }
    }
  }, [fitZoom]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      setTimeout(fitZoom, 150);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, [fitZoom]);

  const persistNow = useCallback(async (targetId: string) => {
    const json = serialize();
    if (!json) return;
    saveDraft(targetId, json); // local draft first (localStorage + IndexedDB) — instant & offline-safe
    if (!navigator.onLine) { setSaveState("unsaved"); return; }
    setSaveState("saving");
    try {
      const c = fc.current!;
      const maxDim = Math.max(canvasSize.width, canvasSize.height);
      const targetDim = Math.min(800, maxDim);
      const thumb = renderCleanDataUrl(c, canvasSize, {
        format: "jpeg",
        multiplier: targetDim / maxDim,
        quality: 0.9,
      });

      if (isAuthor) {
        if (tpl) {
          const tplId = (tpl as unknown as { id?: string }).id || tpl.slug;
          await updateManaged("templates", tplId, { canvasJson: json });
        }
      } else if (design) {
        await saveDesign(targetId, { canvasJson: json, thumbnail: thumb });
      }
      setSaveState("saved");
      track("design_saved", { template: slug });
    } catch (err) {
      console.warn("Auto-save sync error:", err);
      // Local draft is already saved in IndexedDB, so work is never lost
      setSaveState("saved");
    }
  }, [serialize, canvasSize, slug, isAuthor, tpl, design]);

  const scheduleAutosave = useCallback(() => {
    const targetId = design?.id || (isAuthor ? `author-${tpl?.slug || slug}` : null);
    if (!targetId) return;
    setSaveState("unsaved");
    clearTimeout(saveTimer.current);
    const activeObj = fc.current?.getActiveObject();
    const isEditing = !!(activeObj as unknown as { isEditing?: boolean } | null)?.isEditing;
    saveTimer.current = setTimeout(() => persistNow(targetId), isEditing ? 2500 : 1200);
  }, [design, isAuthor, tpl?.slug, slug, persistNow]);

  const pushHistory = useCallback(() => {
    const c = fc.current;
    if (!c || applyingRef.current) return;
    const json = JSON.stringify(c.toObject([...KON10_PROPS] as string[]));
    const h = historyRef.current;
    /* dedupe: some actions fire pushHistory twice for one mutation (e.g. the
       object:removed listener + the explicit push at the end of deleteSelection).
       Without this, one ⌘Z lands on an identical mid-state instead of the
       pre-delete state. */
    if (h.stack[h.idx] === json) return;
    h.stack = h.stack.slice(0, h.idx + 1);
    h.stack.push(json);
    if (h.stack.length > 50) h.stack.shift();
    h.idx = h.stack.length - 1;
    refreshLayers();
    scheduleAutosave();
  }, [refreshLayers, scheduleAutosave]);

  /* author mode gets full control over every layer; customers get template rules */
  const applyModePermissions = useCallback((c: Canvas) => {
    const objs = c.getObjects() as unknown as EditorObject[];
    if (isAuthor || masterOverride || isDesignerMode) applyPermissionsToAll(objs, "author");
    else objs.forEach((o) => applyCustomerPermissions(o));
  }, [isAuthor, masterOverride, isDesignerMode]);

  const toggleMasterOverride = useCallback(() => {
    const c = fc.current;
    if (!c) return;
    const next = !masterOverride;
    setMasterOverride(next);
    c.getObjects().forEach((o) => {
      if (next) {
        o.set({
          lockMovementX: false,
          lockMovementY: false,
          lockRotation: false,
          lockScalingX: false,
          lockScalingY: false,
          hasControls: true,
          selectable: true,
          evented: true,
        });
      }
    });
    c.requestRenderAll();
    toast.success(next ? "🔓 Master Layer Override ON — All layers unlocked for designer" : "🔒 Standard layer constraints restored");
  }, [masterOverride]);

  const handleDeliverProof = useCallback(async () => {
    const targetOrderId = orderIdParam || design?.orderId;
    if (!targetOrderId) {
      toast.error("No active customer order ID linked to this design. Please specify an Order ID.");
      return;
    }
    const c = fc.current;
    if (!c) return;
    setDeliveringProof(true);
    try {
      const dataUrl = renderCleanDataUrl(c, canvasSize, {
        format: "png",
        multiplier: 2,
      });

      const json = serialize();
      if (json && design?.id) {
        await saveDesign(design.id, {
          canvasJson: json,
          thumbnail: renderCleanDataUrl(c, canvasSize, { format: "jpeg", multiplier: 0.5, quality: 0.85 }),
        });
      }

      const result = await deliverProofToOrder({
        orderId: targetOrderId,
        designId: design?.id,
        dataUrl,
        filename: `${(design?.title || slug || "proof").replace(/[^\w-]/g, "_")}-proof-v${design?.version || 1}.png`,
        note: deliverNote,
        designerName: user?.email ? user.email.split("@")[0] : "Studio Designer",
      });

      if (result.ok) {
        toast.success(`Proof delivered to Order #${targetOrderId.slice(0, 8).toUpperCase()}! Order status is now CLIENT REVIEW.`);
        setDeliverModalOpen(false);
        setDeliverNote("");
      } else {
        toast.error(result.error || "Failed to deliver proof to order.");
      }
    } catch (err) {
      console.error("Proof delivery failed:", err);
      toast.error("Failed to deliver proof: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeliveringProof(false);
    }
  }, [orderIdParam, design, canvasSize, serialize, slug, deliverNote, user?.email]);

  const applyHistory = useCallback(async (idx: number) => {
    const c = fc.current;
    if (!c) return;
    applyingRef.current = true;
    await c.loadFromJSON(historyRef.current.stack[idx]);
    applyModePermissions(c);
    c.renderAll();
    applyingRef.current = false;
    refreshLayers();
    scheduleAutosave();
  }, [applyModePermissions, refreshLayers, scheduleAutosave]);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx > 0) { h.idx -= 1; void applyHistory(h.idx); }
  }, [applyHistory]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.idx < h.stack.length - 1) { h.idx += 1; void applyHistory(h.idx); }
  }, [applyHistory]);

  const convertPsdTextToLiveTextbox = useCallback((imgObj: FabricObject) => {
    const raw = imgObj as unknown as EditorObject;
    let text = (raw.kPsdText as string) || (raw.text as string) || (typeof raw.kName === "string" ? raw.kName : "");
    if (!text || /^layer \d+$/i.test(text.trim()) || /^image/i.test(text.trim()) || /^bitmap/i.test(text.trim())) {
      text = "Your Text Here";
    }
    const fill = (raw.kFontColor as string) || (typeof imgObj.fill === "string" ? imgObj.fill : "#ffffff");
    const fontFamily = (raw.kFontFamily as string) || "Archivo, Bebas Neue, Impact, sans-serif";
    const origLeft = imgObj.left ?? 0;
    const origTop = imgObj.top ?? 0;
    const angle = imgObj.angle ?? 0;
    const opacity = imgObj.opacity ?? 1;

    // True visual bounding box
    const boxW = (imgObj.width ?? 200) * (imgObj.scaleX ?? 1);
    const boxH = (imgObj.height ?? 50) * (imgObj.scaleY ?? 1);

    const lines = text.split(/\r?\n/).filter(Boolean);
    const lineCount = Math.max(lines.length, 1);
    const approxLineH = boxH / lineCount;

    // Detect if text layer was centered on the canvas (within 8% margin of center)
    const centerX = origLeft + boxW / 2;
    const isCanvasCentered = Math.abs(centerX - canvasSize.width / 2) < canvasSize.width * 0.08;

    // Derive accurate font size from rendered pixel height so live text matches visual size exactly
    const derivedFontSize = Math.round(approxLineH * 0.85);
    const fontSize = Math.max((raw.kFontSize as number) || 0, derivedFontSize, 18);
    // 30% width buffer prevents unwanted word wrapping
    const width = Math.max(boxW * 1.3, 160);

    const textbox = new Textbox(text, {
      left: isCanvasCentered ? centerX : origLeft,
      top: origTop,
      width,
      fontSize,
      fill,
      fontFamily,
      opacity,
      angle,
      textAlign: isCanvasCentered ? "center" : "left",
      originX: isCanvasCentered ? "center" : "left",
      originY: "top",
      scaleX: 1,
      scaleY: 1,
      editable: true,
      selectable: true,
      evented: true,
      hasControls: true,
      globalCompositeOperation: "source-over",
    });
    textbox.setCoords();

    stampKon10(textbox as unknown as EditorObject, raw.kName || "Text");
    const e = textbox as unknown as EditorObject;
    e.kLayerType = "text";
    e.kEditable = true;
    e.kMovable = true;
    e.kResizable = true;
    e.kRotatable = true;
    e.kDeletable = true;
    e.kStyleEditable = true;
    e.kLocked = false;
    e.kUserLock = false;
    if (raw.kGroup) e.kGroup = raw.kGroup;

    const c = fc.current;
    if (!c) return;
    const idx = c.getObjects().indexOf(imgObj);
    c.remove(imgObj);
    if (idx >= 0) {
      c.insertAt(idx, textbox);
    } else {
      c.add(textbox);
    }
    textbox.setCoords();
    c.setActiveObject(textbox);
    c.renderAll();

    requestAnimationFrame(() => {
      try {
        textbox.enterEditing();
        if (textbox.hiddenTextarea) {
          textbox.hiddenTextarea.focus();
          textbox.hiddenTextarea.select();
        }
        textbox.selectAll();
        c.renderAll();
      } catch (err) {
        console.error("Text editing trigger:", err);
      }
    });

    refreshLayers();
    pushHistory();
    toast.success("Converted to live editable text!");
  }, [canvasSize.width, pushHistory, refreshLayers]);

  const expandTextToFit = useCallback((target?: FabricObject | null) => {
    const c = fc.current;
    let obj = (target ?? c?.getActiveObject()) as unknown as (Textbox & EditorObject) | null;
    if (!obj) return;

    const raw = obj as unknown as EditorObject;
    if (raw.kIsPsdText || (!isText(obj) && raw.kLayerType === "text")) {
      convertPsdTextToLiveTextbox(obj as unknown as FabricObject);
      obj = c?.getActiveObject() as unknown as (Textbox & EditorObject);
    }
    if (!obj || !isText(obj)) return;

    const currentText = obj.text || "";
    // Join wrapped/multiline text into a clean single line
    const singleLineText = currentText.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();

    // Measure single line width using canvas font metrics
    let measuredWidth = 0;
    try {
      const offscreen = document.createElement("canvas");
      const ctx = offscreen.getContext("2d");
      if (ctx) {
        const fontStyle = obj.fontStyle || "normal";
        const fontWeight = obj.fontWeight || "normal";
        const fontSize = obj.fontSize || 32;
        const fontFamily = obj.fontFamily || "sans-serif";
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
        const metrics = ctx.measureText(singleLineText);
        measuredWidth = metrics.width;
        if (obj.charSpacing) {
          measuredWidth += singleLineText.length * (fontSize * (obj.charSpacing / 1000));
        }
      }
    } catch {
      measuredWidth = singleLineText.length * ((obj.fontSize ?? 32) * 0.7);
    }

    if (measuredWidth <= 0) {
      measuredWidth = singleLineText.length * ((obj.fontSize ?? 32) * 0.7);
    }

    // Set width generously so words never wrap
    const targetWidth = Math.ceil(Math.max(measuredWidth * 1.15 + 40, (obj.width ?? 200) * 1.5, 300));

    obj.set({
      text: singleLineText,
      width: targetWidth,
      scaleX: 1,
      scaleY: 1,
    });

    if (typeof (obj as unknown as { initDimensions?: () => void }).initDimensions === "function") {
      (obj as unknown as { initDimensions: () => void }).initDimensions();
    }
    obj.setCoords();
    c?.renderAll();
    pushHistory();
    setSel(readSelection(c!));
    toast.success("Extended text box to 1 line!");
  }, [convertPsdTextToLiveTextbox, pushHistory]);

  /* ---------------- canvas boot ---------------- */
  useEffect(() => {
    if (access !== "granted" || !tpl || !canvasEl.current || fc.current) return;

    // ---- PSD / AI / INDD import: resolve private file → Kon10Doc ----
    // If the template has a private source file but no canvas JSON yet,
    // fetch the file and parse it into a Kon10Doc before booting the canvas.
    const BINARY_FORMATS = ["PSD", "AI", "INDD", "PSB"];
    const hasValidLayers = (() => {
      if (!tpl.canvasJson) return false;
      try {
        const parsed = JSON.parse(tpl.canvasJson);
        if (parsed?.schemaVersion !== "1.2") return false;
        const objs = (parsed?.fabric?.objects || parsed?.objects || []) as Record<string, unknown>[];
        if (objs.length === 0) return false;
        if (objs.length === 1 && (objs[0]?.kId === "psd_background" || objs[0]?.fill === "#111111")) return false;
        const avgOpacity = objs.reduce((acc, o) => acc + (typeof o.opacity === "number" ? o.opacity : 1), 0) / objs.length;
        if (avgOpacity < 0.05) return false;
        const hasLegacyArial = objs.some((o) => o.type === "Textbox" && o.fontFamily === "Arial, sans-serif");
        if (hasLegacyArial) return false;
        return true;
      } catch {
        return false;
      }
    })();

    const needsPsdImport = (
      Boolean(tpl.privateFilePath) &&
      !hasValidLayers &&
      (BINARY_FORMATS.some((f) => (tpl.fileFormat || "").toUpperCase().includes(f)) ||
       Boolean(tpl.privateFilePath?.match(/\.(psd|psb|ai|indd)/i)))
    );

    (async () => {
      // ---- Step 1: resolve master doc (possibly from PSD or Storage) ----
      let resolvedMaster = masterDocFor(tpl); // returns canvasJson or seed

      if (tpl.canvasJson?.startsWith("storage://")) {
        try {
          setPsdProgress("Loading canvas layers…");
          const path = tpl.canvasJson.replace("storage://", "");
          const buf = await getFileBuffer(path);
          const text = new TextDecoder().decode(buf);
          resolvedMaster = JSON.parse(text) as Kon10Doc;
        } catch (e) {
          console.warn("Storage canvas load fallback:", e);
        }
      }

      if (needsPsdImport && (!resolvedMaster || !resolvedMaster.fabric || ((resolvedMaster.fabric as { objects?: unknown[] })?.objects?.length ?? 0) <= 3)) {
        setPsdImporting(true);
        try {
          setPsdProgress("Loading source file…");
          const bufferPromise = getFileBuffer(tpl.privateFilePath!);
          const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("File download timed out")), 20000));
          const buffer = await Promise.race([bufferPromise, timeoutPromise]);
          setPsdProgress("Parsing PSD layers…");
          resolvedMaster = await parsePsdToFabricJson(buffer, tpl);
          setPsdProgress("Layers ready — opening editor…");
          
          // Cache to template so next open is instant across author and customer views
          if (tpl.slug) {

            try {
              void updateManaged("templates", (tpl as unknown as { id?: string }).id || tpl.slug, { canvasJson: JSON.stringify(resolvedMaster) });
            } catch { /* ignore */ }
          }
        } catch (err) {
          console.error("PSD boot error:", err);
          toast.error("PSD source file unavailable — opened standard layout.", {
            description: err instanceof Error ? err.message : String(err),
          });
        } finally {
          setPsdImporting(false);
        }
      }

      // ---- Step 2: boot the Fabric canvas with the resolved doc ----
      masterDocRef.current = resolvedMaster;
      setDoc(resolvedMaster);
      setFields(resolvedMaster.fields);
      setBooting(true);

      const c = new Canvas(canvasEl.current!, {
        width: canvasSize.width,
        height: canvasSize.height,
        backgroundColor: resolvedMaster.canvas.background,
        preserveObjectStacking: true,
        selection: true,
        selectionColor: "rgba(59, 130, 246, 0.2)",
        selectionBorderColor: "#60a5fa",
        selectionLineWidth: 1.5,
        selectionDashArray: [4, 4],
        selectionFullyContained: false,
      });
      fc.current = c;


      let json: Record<string, unknown> = resolvedMaster.fabric;
      let pageMeta: PageMeta[] = [{ id: "main", name: "Page 1" }];
      pagesRef.current = { main: resolvedMaster.fabric };

      const source: Kon10Doc | null = await (async () => {
        // Author mode: check author draft or template master
        if (isAuthor) {
          try {
            const authorDraft = (await readDraftAsync(`author-${tpl.slug}`)) || readDraft(`author-${tpl.slug}`);
            if (authorDraft?.canvasJson) {
              const parsed = JSON.parse(authorDraft.canvasJson) as Kon10Doc;
              if (parsed && parsed.fabric) return parsed;
            }
          } catch { /* ignore */ }
          return resolvedMaster;
        }

        let d: CustomerDesign | null = null;

        // 1. Direct design ID lookup (e.g. from Admin or Co-Design link)
        if (designIdParam) {
          d = await getCustomerDesignById(designIdParam);
        }

        // 2. Client email lookup
        if (!d && clientParam && tpl) {
          d = await findDesignFor(clientParam, tpl.slug, null);
        }

        // 3. Slug as customer design ID lookup
        if (!d && slug) {
          d = await getCustomerDesignById(slug);
        }

        // 4. Default user lookup
        if (!d && tpl) {
          d = await findDesignFor(email, tpl.slug, user?.uid ?? null);
        }

        // 5. Create new design if none exists
        if (!d) {
          d = await createDesign({
            uid: user?.uid ?? null,
            email,
            templateSlug: tpl?.slug || slug || "custom",
            title: tpl?.name || "Untitled Design",
            canvasJson: JSON.stringify(resolvedMaster),
            thumbnail: "",
          });
          track("editor_opened", { template: tpl?.slug || slug, fresh: true });
        } else {
          track("editor_opened", { template: d.templateSlug || tpl?.slug, fresh: false });
        }
        setDesign(d);

        try {
          // Check local draft only if working on own design (not reviewing a specific remote design)
          if (!designIdParam && !clientParam) {
            const draft = (await readDraftAsync(d.id)) || readDraft(d.id);
            if (draft?.canvasJson) {
              try {
                const draftParsed = JSON.parse(draft.canvasJson) as Kon10Doc;
                if (draftParsed && draftParsed.fabric) {
                  return draftParsed;
                }
              } catch { /* ignore */ }
            }
          }

          // Load remote Firestore / Storage design
          let rawJson = d.canvasJson;
          if (rawJson?.startsWith("storage://")) {
            try {
              const path = rawJson.replace("storage://", "");
              const buf = await getFileBuffer(path);
              rawJson = new TextDecoder().decode(buf);
            } catch (err) {
              console.warn("Storage design fetch fallback:", err);
            }
          }

          if (rawJson) {
            try {
              const saved = JSON.parse(rawJson) as Kon10Doc;
              if (saved && (saved.fabric || (saved as unknown as { objects?: unknown[] }).objects)) {
                return saved;
              }
            } catch (err) {
              console.warn("Failed to parse saved canvas JSON:", err);
            }
          }

          return resolvedMaster;
        } catch {
          return resolvedMaster;
        }
      })();

      if (source) {
        setDoc(source);
        setFields(source.fields ?? resolvedMaster.fields);
        if (source.guides) setUserGuides({ v: source.guides.v ?? [], h: source.guides.h ?? [] });
        if (source.folders?.length) setFolders(source.folders);
        else if (resolvedMaster.folders?.length) setFolders(resolvedMaster.folders);
        // a design previously resized keeps its custom canvas size
        if (source.canvas && (source.canvas.width !== resolvedMaster.canvas.width || source.canvas.height !== resolvedMaster.canvas.height)) {
          setSizeOverride({ width: source.canvas.width, height: source.canvas.height });
        }
        if (source.pages?.length) {
          pageMeta = source.pages.map((p) => ({ id: p.id, name: p.name }));
          pagesRef.current = {};
          source.pages.forEach((p) => { pagesRef.current[p.id] = p.fabric; });
        } else {
          pagesRef.current = { main: source.fabric };
        }
        json = pagesRef.current[pageMeta[0].id];
      }
      setPages(pageMeta);
      setActivePage(pageMeta[0].id);

      try {
        if (json && Array.isArray((json as Record<string, unknown>).objects)) {
          const objs = (json as { objects: Record<string, unknown>[] }).objects;
          objs.forEach((o) => {
            if (o.type === "FabricImage" || o.type === "fabricImage") o.type = "Image";
            if (typeof o.opacity === "number" && o.opacity > 0 && o.opacity <= 0.01) {
              o.opacity = 1;
            }
          });
        }
        const loadPromise = c.loadFromJSON(json);
        const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Canvas load timeout")), 10000));
        await Promise.race([loadPromise, timeoutPromise]);
        applyModePermissions(c);
        purgePhantomSelections();
        c.renderAll();
        historyRef.current = { stack: [JSON.stringify(c.toObject([...KON10_PROPS] as string[]))], idx: 0 };
        refreshLayers();
        track("template_loaded", { template: tpl.slug });
      } catch (err) {
        console.error("Canvas load error:", err);
        try {
          const fallback = buildSeedDoc(tpl);
          await c.loadFromJSON(fallback.fabric);
          applyModePermissions(c);
          c.renderAll();
          refreshLayers();
          toast.warning("Custom layers had an issue; opened standard layout.");
        } catch {
          editorError("load");
        }
      } finally {
        setBooting(false);
      }


      // first-run onboarding (§42) — short, skippable, once per browser
      if (!localStorage.getItem("sk-studio-onboarded-v2")) setOnboard(0);

      // fit zoom into the stage — resets viewport translate to origin so
      // overlays (grid/safe area/rulers) align with the design.
      // use the source's canvas size: a resized design loads larger/smaller than the template default
      const bootW = source?.canvas?.width ?? canvasSize.width;
      const bootH = source?.canvas?.height ?? canvasSize.height;
      const host = stageRef.current;
      if (host && (bootW !== canvasSize.width || bootH !== canvasSize.height)) {
        const fit = Math.min(2, Math.max(0.15, Math.min((host.clientWidth - 160) / bootW, (host.clientHeight - 160) / bootH)));
        c.viewportTransform = [fit, 0, 0, fit, 0, 0];
        c.setZoom(fit);
        c.setDimensions({ width: bootW * fit, height: bootH * fit });
        c.renderAll();
        setZoom(fit);
      } else {
        fitZoom();
      }

      /* ---- event wiring — must be inside IIFE since c is created here ---- */

      /* selection → panels + floating toolbar */
      const onSel = () => setSel(readSelection(c));
      c.on("selection:created", onSel);
      c.on("selection:updated", onSel);
      c.on("selection:cleared", () => setSel({ kind: "none", obj: null }));
      c.on("object:added", (e) => {
        if (!applyingRef.current && e.target && !(e.target as unknown as EditorObject).kId) {
          stampKon10(e.target as unknown as EditorObject, e.target.type ?? "Object");
        }
        if (e.target && isImage(e.target)) (e.target as unknown as { perPixelTargetFind: boolean }).perPixelTargetFind = true;
        pushHistory();
        if (e.target) track("object_added", { type: e.target.type });
      });
      c.on("object:modified", pushHistory);
      c.on("object:removed", pushHistory);

      /* double click: edit text directly or convert PSD text layer to live Textbox */
      const handleCanvasDblClick = (target: FabricObject | undefined) => {
        if (!target) return;

        // If target is inside a Group, locate the inner text object
        if (isGroup(target)) {
          const grp = target as unknown as { getObjects: () => FabricObject[] };
          const textChild = grp.getObjects().find(
            (o) => isText(o) || (o as unknown as EditorObject).kLayerType === "text" || (o as unknown as EditorObject).kIsPsdText
          );
          if (textChild) {
            ungroupSelection();
            c.setActiveObject(textChild);
            c.renderAll();
            target = textChild;
          }
        }

        const raw = target as unknown as EditorObject;
        if (raw.kIsPsdText || (!isText(target) && raw.kLayerType === "text")) {
          convertPsdTextToLiveTextbox(target);
          return;
        } else if (isText(target) || (target as unknown as { text?: string }).text !== undefined) {
          let tbObj = target;
          const rawObj = tbObj as unknown as EditorObject;

          // Unlock any locks that would prevent editing
          rawObj.kLocked = false;
          rawObj.kUserLock = false;

          // If it's a non-interactive base Text instance without enterEditing, promote to Textbox
          if (typeof (tbObj as unknown as Textbox).enterEditing !== "function") {
            const newTb = new Textbox((tbObj as unknown as { text?: string }).text ?? "", {
              left: tbObj.left,
              top: tbObj.top,
              width: Math.max(80, tbObj.width ?? 200),
              fontSize: (tbObj as unknown as { fontSize?: number }).fontSize ?? 32,
              fill: tbObj.fill || "#ffffff",
              fontFamily: (tbObj as unknown as { fontFamily?: string }).fontFamily ?? "sans-serif",
              fontWeight: (tbObj as unknown as { fontWeight?: string | number }).fontWeight,
              fontStyle: ((tbObj as unknown as { fontStyle?: string }).fontStyle as "normal" | "italic" | "oblique") ?? "normal",
              textAlign: ((tbObj as unknown as { textAlign?: string }).textAlign as "left" | "center" | "right" | "justify") ?? "left",
              angle: tbObj.angle,
              scaleX: tbObj.scaleX ?? 1,
              scaleY: tbObj.scaleY ?? 1,
              originX: tbObj.originX,
              originY: tbObj.originY,
              editable: true,
              selectable: true,
              evented: true,
              hasControls: true,
            });
            stampKon10(newTb as unknown as EditorObject, rawObj.kName || "Text");
            const idx = c.getObjects().indexOf(tbObj);
            c.remove(tbObj);
            if (idx >= 0) c.insertAt(idx, newTb);
            else c.add(newTb);
            tbObj = newTb;
          }

          const tb = tbObj as unknown as Textbox;
          tb.editable = true;
          tb.selectable = true;
          tb.evented = true;
          tb.lockMovementX = false;
          tb.lockMovementY = false;

          const sx = tb.scaleX ?? 1;
          const sy = tb.scaleY ?? 1;
          if (sx !== 1 || sy !== 1) {
            tb.set({
              fontSize: Math.max(8, Math.round((tb.fontSize ?? 32) * sy)),
              width: Math.max(40, Math.round((tb.width ?? 100) * sx)),
              scaleX: 1,
              scaleY: 1,
            });
          }
          tb.setCoords();
          c.setActiveObject(tb);
          c.renderAll();
          setSel(readSelection(c));

          // Start editing mode cleanly without moving the object
          setTimeout(() => {
            try {
              tb.enterEditing();
              tb.lockMovementX = true;
              tb.lockMovementY = true;
              if (tb.hiddenTextarea) {
                tb.hiddenTextarea.focus();
              }
              c.renderAll();
              setSel(readSelection(c));
            } catch (err) {
              console.warn("enterEditing failed:", err);
            }
          }, 30);
        } else if (isImage(target) && !raw.kLocked && !raw.kUserLock) {
          convertPsdTextToLiveTextbox(target);
          return;
        }
      };

      c.on("text:editing:entered", (opt) => {
        const tb = (opt.target ?? c.getActiveObject()) as unknown as Textbox;
        if (tb) {
          tb.lockMovementX = true;
          tb.lockMovementY = true;
        }
        setSel(readSelection(c));
      });

      c.on("text:editing:exited", (opt) => {
        const tb = (opt.target ?? c.getActiveObject()) as unknown as Textbox;
        if (tb) {
          tb.lockMovementX = false;
          tb.lockMovementY = false;
        }
        setSel(readSelection(c));
      });

      c.on("text:selection:changed", () => {
        setSel(readSelection(c));
      });

      c.on("before:transform", () => {
        if (spaceRef.current || panningRef.current) {
          (c as unknown as { _currentTransform?: unknown })._currentTransform = null;
        }
      });

      c.on("mouse:dblclick", (opt) => {
        const target = opt.target ?? c.getActiveObject() ?? undefined;
        handleCanvasDblClick(target);
      });

      /* smart guides: snap to canvas center/edges + other objects (§5) */
      c.on("object:moving", (e) => {
        if (spaceRef.current || panningRef.current) return;
        const o = e.target;
        if (!o) return;

        if (!snapRef.current) {
          if (vGuideRef.current) vGuideRef.current.style.display = "none";
          if (hGuideRef.current) hGuideRef.current.style.display = "none";
          return;
        }

        const currentZoom = c.getZoom() || 1;
        const vpt = c.viewportTransform || [1, 0, 0, 1, 0, 0];
        const th = 5 / currentZoom;
        const r = o.getBoundingRect();
        const stageEl = stageRef.current;
        const stageBounds = stageEl?.getBoundingClientRect();

        let dx = 0, dy = 0;
        let gv: number | null = null, gh: number | null = null;
        const vC = [r.left, r.left + r.width / 2, r.left + r.width];
        const hC = [r.top, r.top + r.height / 2, r.top + r.height];

        outerV: for (const t of snapCache.current.v) {
          for (let i = 0; i < 3; i++) {
            if (Math.abs(vC[i] + dx - t) < th) { dx = t - vC[i]; gv = t; break outerV; }
          }
        }
        outerH: for (const t of snapCache.current.h) {
          for (let i = 0; i < 3; i++) {
            if (Math.abs(hC[i] + dy - t) < th) { dy = t - hC[i]; gh = t; break outerH; }
          }
        }

        if (dx) o.set("left", (o.left ?? 0) + dx);
        if (dy) o.set("top", (o.top ?? 0) + dy);

        // Direct DOM update for guide lines without triggering React re-renders
        if (stageBounds) {
          if (gv !== null && vGuideRef.current) {
            const screenX = stageBounds.left + gv * currentZoom + vpt[4];
            vGuideRef.current.style.display = "block";
            vGuideRef.current.style.left = `${screenX}px`;
            vGuideRef.current.style.top = `${stageBounds.top}px`;
            vGuideRef.current.style.height = `${stageBounds.height}px`;
          } else if (vGuideRef.current) {
            vGuideRef.current.style.display = "none";
          }

          if (gh !== null && hGuideRef.current) {
            const screenY = stageBounds.top + gh * currentZoom + vpt[5];
            hGuideRef.current.style.display = "block";
            hGuideRef.current.style.top = `${screenY}px`;
            hGuideRef.current.style.left = `${stageBounds.left}px`;
            hGuideRef.current.style.width = `${stageBounds.width}px`;
          } else if (hGuideRef.current) {
            hGuideRef.current.style.display = "none";
          }
        }
      });

      c.on("mouse:down", (opt) => {
        if (retouchRef.current) { retouchApi.current.down(opt as { e: Event }); return; }
        const ev = opt.e as MouseEvent;
        if (spaceRef.current) {
          panningRef.current = true;
          c.selection = false;
          (c as unknown as { _currentTransform?: unknown })._currentTransform = null;
          c.defaultCursor = "grabbing";
          c.hoverCursor = "grabbing";
          panStart.current = { x: ev.clientX, y: ev.clientY, vpt: [...(c.viewportTransform ?? [1, 0, 0, 1, 0, 0])] as number[] };
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (ev.button === 0 && ev.altKey) {
          const sp = c.getScenePoint(opt.e as MouseEvent);
          const hits = c.getObjects().filter((o) =>
            o.visible !== false && o.selectable !== false && o.evented !== false &&
            o.containsPoint(sp));
          if (hits.length) {
            const prev = altCycleRef.current;
            const now = Date.now();
            let nextIndex = 0;
            if (prev && (now - prev.time < 1200) && prev.hits.length === hits.length) {
              nextIndex = (prev.index + 1) % hits.length;
            }
            altCycleRef.current = { time: now, hits, index: nextIndex };
            const pick = hits[nextIndex];
            if (pick) {
              c.discardActiveObject();
              c.setActiveObject(pick);
              c.renderAll();
              setSel(readSelection(c));
            }
          }
          return;
        }
        if (ev.button === 2) {
          if (opt.target && opt.target !== c.getActiveObject()) {
            try { c.setActiveObject(opt.target); c.renderAll(); setSel(readSelection(c)); } catch { /* locked object */ }
          }
          ctxEventRef.current = ev;
          setCtx({ x: ev.clientX, y: ev.clientY });
          return;
        }
        setCtx(null);
        const active = new Set(c.getActiveObjects());
        const v: number[] = [0, canvasSize.width / 2, canvasSize.width, ...userGuidesRef.current.v];
        const h: number[] = [0, canvasSize.height / 2, canvasSize.height, ...userGuidesRef.current.h];
        c.getObjects().forEach((o2) => {
          if (active.has(o2) || o2.visible === false) return;
          const r = o2.getBoundingRect();
          v.push(r.left, r.left + r.width / 2, r.left + r.width);
          h.push(r.top, r.top + r.height / 2, r.top + r.height);
        });
        snapCache.current = { v, h };
      });
      c.on("mouse:move", (opt) => {
        if (retouchRef.current?.painting) { retouchApi.current.move(opt as { e: Event }); return; }
        if (panningRef.current) {
          const ev = opt.e as MouseEvent;
          const s = panStart.current;
          const vpt = c.viewportTransform!;
          vpt[4] = s.vpt[4] + (ev.clientX - s.x);
          vpt[5] = s.vpt[5] + (ev.clientY - s.y);
          (c as unknown as { _currentTransform?: unknown })._currentTransform = null;
          c.requestRenderAll();
          return;
        }
      });
      c.on("mouse:up", () => {
        if (vGuideRef.current) vGuideRef.current.style.display = "none";
        if (hGuideRef.current) hGuideRef.current.style.display = "none";
        if (panningRef.current) {
          panningRef.current = false;
          c.defaultCursor = spaceRef.current ? "grab" : "default";
          c.hoverCursor = spaceRef.current ? "grab" : "move";
          c.selection = !spaceRef.current;
          (c as unknown as { _currentTransform?: unknown })._currentTransform = null;
          return;
        }
        if (retouchRef.current?.painting) retouchApi.current.up();
        c.selection = true;
      });

      /* overlays (rulers/grid/toolbar) in sync with pan/zoom, throttled */
      let lastVp = 0;
      c.on("after:render", () => {
        const now = Date.now();
        if (now - lastVp > 140) { lastVp = now; setViewTick((t) => t + 1); }
      });

      /* stroke eraser */
      const eraseAt = (opt: { target?: FabricObject; e: Event }) => {
        const t = (opt.target ?? c.findTarget(opt.e as unknown as Parameters<Canvas["findTarget"]>[0])) as unknown as FabricObject | undefined;
        if (t && /^path$/i.test(t.type ?? "")) { c.remove(t); c.renderAll(); }
      };
      c.on("mouse:down", (opt) => { if (eraserRef.current) eraseAt(opt as { target?: FabricObject; e: Event }); });
      c.on("mouse:move", (opt) => {
        if (!eraserRef.current) return;
        if ((opt.e as MouseEvent).buttons !== 1) return;
        eraseAt(opt as { target?: FabricObject; e: Event });
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, tpl]);

  /* dispose on unmount */
  useEffect(() => () => {
    clearTimeout(saveTimer.current);
    clearTimeout(nudgeTimer.current);
    fc.current?.dispose();
    fc.current = null;
  }, []);

  // QA hook — lets automated tests inspect the live canvas (harmless in prod)
  useEffect(() => {
    if (access === "granted") {
      const w = window as unknown as { __fc?: Canvas | null; __fabric?: { FabricImage: typeof FabricImage } };
      w.__fc = fc.current;
      w.__fabric = { FabricImage };
    }
  }, [access, booting]);

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const activeObj = fc.current?.getActiveObject() ?? null;
      const editingText = !!(activeObj as unknown as { isEditing?: boolean } | null)?.isEditing;
      const textTarget = activeObj && isText(activeObj) ? activeObj : null;
      const inField = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      /* Word/Docs-style text formatting — works with a text layer selected
         AND while typing inside it (fabric's hidden textarea) */
      if (mod && textTarget && (!inField || editingText)) {
        const tt = textTarget as unknown as {
          fontWeight?: string; fontStyle?: string; underline?: boolean; linethrough?: boolean; textAlign?: string;
        };
        const setT = (props: Record<string, unknown>) => {
          textTarget.set(props as Partial<FabricObject>);
          textTarget.set("dirty", true);
          fc.current?.renderAll();
          pushHistory();
          setSel((s) => ({ ...s }));
        };
        if (!e.shiftKey && key === "b") { e.preventDefault(); setT({ fontWeight: tt.fontWeight === "800" || tt.fontWeight === "700" ? "400" : "800" }); return; }
        if (!e.shiftKey && key === "i") { e.preventDefault(); setT({ fontStyle: tt.fontStyle === "italic" ? "normal" : "italic" }); return; }
        if (!e.shiftKey && key === "u") { e.preventDefault(); setT({ underline: !tt.underline }); return; }
        if (e.shiftKey && key === "x") { e.preventDefault(); setT({ linethrough: !tt.linethrough }); return; }
        if (e.shiftKey && key === "l") { e.preventDefault(); setT({ textAlign: "left" }); return; }
        if (e.shiftKey && key === "e") { e.preventDefault(); setT({ textAlign: "center" }); return; }
        if (e.shiftKey && key === "r") { e.preventDefault(); setT({ textAlign: "right" }); return; }
        if (e.shiftKey && key === "j") { e.preventDefault(); setT({ textAlign: "justify" }); return; }
      }

      if (inField) return;
      if (e.key === "Enter" && cropRect) { e.preventDefault(); commitCrop(); return; }
      if (e.code === "Space") {
        if (!editingText) {
          e.preventDefault();
          spaceRef.current = true;
          const c = fc.current;
          if (c) {
            c.defaultCursor = "grab";
            c.hoverCursor = "grab";
            c.selection = false;
          }
        }
        return;
      }
      if (mod && key === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && key === "s") { e.preventDefault(); const d = designRef.current; if (d) void persistNow(d.id); return; }
      if (mod && key === "c") { copySelection(); return; }
      if (mod && key === "v") { e.preventDefault(); void pasteClipboard(); return; }
      if (mod && key === "x") { cutSelection(); return; }
      if (mod && key === "d") { e.preventDefault(); void duplicateSelection(); return; }
      if (mod && key === "g") { e.preventDefault(); if (e.shiftKey) ungroupSelection(); else groupSelection(); return; }
      if (mod && key === "a") { e.preventDefault(); selectAll(); return; }
      if (mod && key === "]") { e.preventDefault(); reorderActive(e.shiftKey ? "front" : "forward"); return; }
      if (mod && key === "[") { e.preventDefault(); reorderActive(e.shiftKey ? "back" : "backward"); return; }
      if (mod && (e.key === "=" || e.key === "+" || key === "=" || key === "+")) { e.preventDefault(); applyZoom(Math.round((zoom + 0.1) * 10) / 10); return; }
      if (mod && (e.key === "-" || key === "-")) { e.preventDefault(); applyZoom(Math.round((zoom - 0.1) * 10) / 10); return; }
      if (mod && (e.key === "0" || key === "0")) { e.preventDefault(); fitZoom(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { deleteSelection(); return; }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-step, 0); }
      if (e.key === "ArrowRight") { e.preventDefault(); nudge(step, 0); }
      if (e.key === "ArrowUp") { e.preventDefault(); nudge(0, -step); }
      if (e.key === "ArrowDown") { e.preventDefault(); nudge(0, step); }
      /* Canva-style quick insert: R rect · C circle · L line · T text · V select tool · F fullscreen */
      if (!mod && !e.altKey && key === "f") { e.preventDefault(); toggleFullscreen(); return; }
      if ((mod && e.shiftKey && key === "f") || e.key === "F11") { e.preventDefault(); toggleFullscreen(); return; }
      if (!mod && !e.altKey && key === "v") {
        let exited = false;
        if (drawing) { setDrawingMode(false); exited = true; }
        if (erasing) { setEraserMode(false); exited = true; }
        if (retouch) { stopRetouch(); exited = true; }
        if (cropRect) { endCrop(); exited = true; }
        if (exited) { e.preventDefault(); toast.success("Select tool", { duration: 900 }); return; }
      }
      if (!mod && !e.altKey && !drawing && !erasing) {
        if (key === "r") { e.preventDefault(); addElement("rect"); return; }
        if (key === "c") { e.preventDefault(); addElement("circle"); return; }
        if (key === "l") { e.preventDefault(); addElement("line"); return; }
        if (key === "t") { e.preventDefault(); addText("heading"); return; }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        panningRef.current = false;
        const c = fc.current;
        if (c) {
          c.defaultCursor = "default";
          c.hoverCursor = "move";
          c.selection = true;
          (c as unknown as { _currentTransform?: unknown })._currentTransform = null;
        }
      }
    };
    const onOff = () => {
      const nowOffline = !navigator.onLine;
      setOffline(nowOffline);
      if (!nowOffline && designRef.current) {
        setSaveState("syncing");
        setTimeout(() => { if (designRef.current) void persistNow(designRef.current.id); }, 400);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("online", onOff);
    window.addEventListener("offline", onOff);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("online", onOff);
      window.removeEventListener("offline", onOff);
    };
  });

  /* ⌘K palette + Escape + "?" — capture phase so the editor overrides the site palette (§32) */
  useEffect(() => {
    const cap = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); e.stopPropagation();
        setPaletteQ(""); setPaletteIdx(0); setPaletteOpen(true);
        return;
      }
      const inField = (e.target as HTMLElement).matches?.("input,textarea,[contenteditable]");
      if (e.key === "?" && !inField) { setShortcutsOpen(true); return; }
      if (e.key === "Escape") {
        if (cropRect) { endCrop(); return; }
        if (retouch) { stopRetouch(); return; }
        if (ctx) { setCtx(null); return; }
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (shortcutsOpen) { setShortcutsOpen(false); return; }
        if (exportOpen && exportPhase === "idle") { setExportOpen(false); return; }
        if (preview) { setPreview(null); return; }
        if (swapFor) { setSwapFor(null); return; }
        if (onboard !== null) { finishOnboard(); return; }
        const c = fc.current;
        if (c?.getActiveObject()) { c.discardActiveObject(); c.renderAll(); }
      }
    };
    window.addEventListener("keydown", cap, true);
    return () => window.removeEventListener("keydown", cap, true);
  });

  /* ctrl/⌘ + wheel zoom around the pointer */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || access !== "granted") return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const c = fc.current, el = canvasEl.current;
      if (!c || !el) return;
      const z0 = c.getZoom() || 1;
      const z1 = Math.min(2, Math.max(0.15, z0 * (1 - e.deltaY * 0.0015)));
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const vpt = c.viewportTransform!;
      vpt[4] = px - (px - vpt[4]) * (z1 / z0);
      vpt[5] = py - (py - vpt[5]) * (z1 / z0);
      c.setZoom(z1);
      c.setDimensions({ width: canvasSize.width * z1, height: canvasSize.height * z1 });
      c.requestRenderAll();
      setZoom(z1);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [access, canvasSize]);



  /* context menu closes on any outside click —
     but must ignore (a) the very mousedown that opened it (React flushes state +
     effects mid-dispatch, so the opening event still bubbles to document) and
     (b) mousedowns inside the menu itself (they precede the item's click —
     closing there would unmount the button before its action fires) */
  useEffect(() => {
    if (!ctx) return;
    const close = (e: MouseEvent) => {
      if (ctxEventRef.current && e === ctxEventRef.current) { ctxEventRef.current = null; return; }
      if ((e.target as HTMLElement).closest?.(".s-menu")) return;
      setCtx(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [ctx]);

  const finishOnboard = () => {
    localStorage.setItem("sk-studio-onboarded-v2", "1");
    setOnboard(null);
  };

  /* ---- freehand brush tool (Photoshop-style) ---- */
  const setDrawingMode = (on: boolean) => {
    const c = fc.current;
    if (!c) return;
    if (on && eraserRef.current) setEraserMode(false);
    c.isDrawingMode = on;
    if (on) {
      const b = new PencilBrush(c);
      b.color = brushColor;
      b.width = brushSize;
      (b as unknown as { decimate: number }).decimate = brushSmooth; // stroke smoothing
      c.freeDrawingBrush = b;
      c.discardActiveObject();
      c.renderAll();
    }
    setDrawing(on);
  };

  /* ---- stroke eraser: drag over drawn strokes to remove them ---- */
  const setEraserMode = (on: boolean) => {
    const c = fc.current;
    if (!c) return;
    if (on && drawing) setDrawingMode(false);
    eraserRef.current = on;
    c.selection = !on;
    c.defaultCursor = on ? "crosshair" : "default";
    c.hoverCursor = on ? "crosshair" : "move";
    if (on) { c.discardActiveObject(); }
    c.renderAll();
    setErasing(on);
  };

  useEffect(() => {
    const b = fc.current?.freeDrawingBrush;
    if (b) { b.color = brushColor; b.width = brushSize; (b as unknown as { decimate: number }).decimate = brushSmooth; }
  }, [brushColor, brushSize, brushSmooth]);

  /* ---------------- object actions ---------------- */

  const addText = (preset: "heading" | "subheading" | "paragraph" | "label" | "price" | "date") => {
    const c = fc.current; if (!c) return;
    const sizes = { heading: 96, subheading: 56, paragraph: 32, label: 26, price: 48, date: 36 } as const;
    const o = new Textbox(
      preset === "heading" ? "YOUR HEADLINE" : preset === "date" ? "SAT · AUG 30" : preset === "price" ? "$25" : "Double-click to edit",
      {
        left: canvasSize.width * 0.1, top: canvasSize.height * 0.4, width: canvasSize.width * 0.7,
        fontSize: Math.round(canvasSize.width * sizes[preset] / 1080 * 1.4),
        fontFamily: "Archivo, sans-serif", fontWeight: preset === "paragraph" ? "400" : "800", fill: "#ffffff",
      },
    );
    stampKon10(o as unknown as EditorObject, `Text — ${preset}`);
    c.add(o); c.setActiveObject(o); c.renderAll();
  };

  /* ---- Canva Parity Handlers ---- */

  const insertGraphic = (item: GraphicItem, pos?: { x: number; y: number }) => {
    const c = fc.current;
    if (!c) return;
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(item.svg)}`;
    const imgEl = new Image();
    imgEl.onload = () => {
      const left = pos ? Math.round(pos.x - item.defaultWidth / 2) : Math.round(canvasSize.width / 2 - item.defaultWidth / 2);
      const top = pos ? Math.round(pos.y - item.defaultHeight / 2) : Math.round(canvasSize.height / 2 - item.defaultHeight / 2);
      const fabricImg = new FabricImage(imgEl, {
        left,
        top,
        scaleX: 1,
        scaleY: 1,
      });
      stampKon10(fabricImg as unknown as EditorObject, item.name);
      (fabricImg as unknown as EditorObject).kLayerType = "shape";
      c.add(fabricImg);
      c.setActiveObject(fabricImg);
      c.renderAll();
      refreshLayers();
      pushHistory();
      toast.success(`Inserted ${item.name}`);
    };
    imgEl.src = dataUrl;
  };

  const insertFrame = (frame: FrameTemplate) => {
    const c = fc.current;
    if (!c) return;
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(frame.previewSvg)}`;
    const imgEl = new Image();
    imgEl.onload = () => {
      const fabricImg = new FabricImage(imgEl, {
        left: Math.round(canvasSize.width / 2 - frame.width / 2),
        top: Math.round(canvasSize.height / 2 - frame.height / 2),
        scaleX: 1,
        scaleY: 1,
      });
      stampKon10(fabricImg as unknown as EditorObject, frame.name);
      const e = fabricImg as unknown as EditorObject;
      e.kLayerType = "image";
      e.kReplaceable = true;
      c.add(fabricImg);
      c.setActiveObject(fabricImg);
      c.renderAll();
      refreshLayers();
      pushHistory();
      toast.success(`Inserted ${frame.name} — drop an image to fill`);
    };
    imgEl.src = dataUrl;
  };

  const insertBarcode = (code: string) => {
    const c = fc.current;
    if (!c) return;
    const svg = generateBarcodeSvg(code);
    const dataUrl = svgToDataUrl(svg);
    const imgEl = new Image();
    imgEl.onload = () => {
      const fabricImg = new FabricImage(imgEl, {
        left: Math.round(canvasSize.width / 2 - 120),
        top: Math.round(canvasSize.height / 2 - 45),
      });
      stampKon10(fabricImg as unknown as EditorObject, `Barcode (${code})`);
      (fabricImg as unknown as EditorObject).kLayerType = "shape";
      c.add(fabricImg);
      c.setActiveObject(fabricImg);
      c.renderAll();
      refreshLayers();
      pushHistory();
      toast.success("Barcode inserted!");
    };
    imgEl.src = dataUrl;
  };

  const runMagicWrite = async (optId: string) => {
    setMagicWriteBusy(true);
    try {
      const o = sel.obj;
      const currentText = (o && isText(o)) ? (o as unknown as Textbox).text ?? "" : "";
      const generated = await generateAiCopy(optId, currentText, magicCustomPrompt);
      if (o && isText(o)) {
        (o as unknown as Textbox).set("text", generated);
        fc.current?.renderAll();
        pushHistory();
        toast.success("Text updated with Magic Write!");
      } else {
        addText("heading");
        setTimeout(() => {
          const act = fc.current?.getActiveObject();
          if (act && isText(act)) {
            (act as unknown as Textbox).set("text", generated);
            fc.current?.renderAll();
            pushHistory();
          }
        }, 60);
      }
      setMagicWriteOpen(false);
    } catch {
      toast.error("Failed to generate copy.");
    } finally {
      setMagicWriteBusy(false);
    }
  };

  const toggleAnimPreview = () => {
    const c = fc.current;
    if (!c) return;
    if (animPlaying) {
      if (animCancelRef.current) animCancelRef.current();
      setAnimPlaying(false);
    } else {
      setAnimPlaying(true);
      const states = captureInitialState(c);
      animCancelRef.current = playAnimationCycle(c, activeAnim, states, () => {
        setAnimPlaying(false);
        restoreInitialState(c, states);
      });
    }
  };

  const exportAnimatedVideo = async () => {
    const c = fc.current;
    if (!c) return;
    setRecordingVideo(true);
    toast.info("Recording high-res animated video…");
    try {
      await recordCanvasAnimation(c, activeAnim, `${tpl?.slug || "design"}-animated.webm`);
      toast.success("Video downloaded!");
    } catch (err) {
      console.error(err);
      toast.error("Video recording not supported in this browser.");
    } finally {
      setRecordingVideo(false);
    }
  };

  const preview3DMockup = async (tplId: string) => {
    const c = fc.current;
    if (!c) return;
    setSelectedMockup(tplId);
    setMockupBusy(true);
    try {
      const designUrl = renderCleanDataUrl(c, canvasSize, { format: "png" });
      const rendered = await generateMockupDataUrl(tplId, designUrl);
      setMockupPreviewUrl(rendered);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate 3D mockup.");
    } finally {
      setMockupBusy(false);
    }
  };

  const download3DMockup = () => {
    if (!mockupPreviewUrl) return;
    const a = document.createElement("a");
    a.href = mockupPreviewUrl;
    a.download = `${tpl?.slug || "mockup"}-${selectedMockup}.png`;
    a.click();
    toast.success("Mockup downloaded!");
  };

  const runBatchMerge = async () => {
    const c = fc.current;
    if (!c || !csvDataset.rows.length) return;
    setBulkBusy(true);
    toast.info(`Generating ${csvDataset.rows.length} personalized flyers…`);
    try {
      for (let i = 0; i < csvDataset.rows.length; i++) {
        const row = csvDataset.rows[i];
        applyCsvRowToCanvas(c, csvMapping, row);
        const dataUrl = renderCleanDataUrl(c, canvasSize, { format: "png" });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${tpl?.slug || "batch"}-${i + 1}.png`;
        a.click();
        await new Promise((r) => setTimeout(r, 400));
      }
      toast.success(`Batch merge complete! Downloaded ${csvDataset.rows.length} flyers.`);
    } catch (err) {
      console.error(err);
      toast.error("Batch merge encountered an error.");
    } finally {
      setBulkBusy(false);
    }
  };

  /** quick text styles (§10) + Canva-style effects (shadow/lift/hollow/neon/echo) */
  const TEXT_STYLES: { id: string; name: string; props: Record<string, unknown>; preview?: React.CSSProperties }[] = [
    { id: "impact", name: "Impact", props: { fontFamily: "Archivo, sans-serif", fontWeight: "800", fill: "#ffffff", charSpacing: 0 } },
    { id: "mono-label", name: "Mono label", props: { fontFamily: "Space Mono, monospace", fontWeight: "400", fill: `hsl(${tpl?.hue ?? 200} 80% 65%)`, charSpacing: 300 }, preview: { fontFamily: "Space Mono, monospace" } },
    { id: "serif", name: "Editorial", props: { fontFamily: "Playfair Display, serif", fontWeight: "700", fill: "#f4f1ea", charSpacing: 0 }, preview: { fontFamily: "Georgia, serif" } },
    { id: "glow", name: "Glow", props: { fill: "#ffffff" }, preview: { textShadow: "0 0 10px hsl(215 90% 60%)" } },
    { id: "shadow", name: "Shadow", props: {}, preview: { textShadow: "3px 3px 6px rgba(0,0,0,0.6)" } },
    { id: "lift", name: "Lift", props: {}, preview: { textShadow: "0 7px 12px rgba(0,0,0,0.55)" } },
    { id: "hollow", name: "Hollow", props: {}, preview: { WebkitTextStroke: "1.5px currentColor", color: "transparent" } },
    { id: "neon", name: "Neon", props: {}, preview: { textShadow: "0 0 6px #22d3ee, 0 0 16px #22d3ee" } },
    { id: "echo", name: "Echo", props: {}, preview: { textShadow: "3px 3px 0 rgba(255,255,255,0.28)" } },
    { id: "no-fx", name: "Clear effects", props: {}, preview: { fontWeight: 400, opacity: 0.6 } },
  ];

  const applyTextStyle = async (id: string) => {
    const style = TEXT_STYLES.find((s) => s.id === id);
    const o = sel.obj;
    if (!style || !o || !isText(o)) return;
    if (typeof style.props.fontFamily === "string") {
      const fam = style.props.fontFamily.split(",")[0].trim();
      await ensureFontLoaded({ label: fam, family: fam, stack: style.props.fontFamily, category: "Sans" });
    }
    const props: Record<string, unknown> = { ...style.props };
    const curFill = normalizeHex(o.fill) ?? "#ffffff";
    const accent = `hsl(${tpl?.hue ?? 200} 90% 60%)`;
    switch (id) {
      case "glow":
        props.shadow = new Shadow({ color: `hsla(${tpl?.hue ?? 200}, 90%, 60%, 0.85)`, blur: 26, offsetX: 0, offsetY: 0 });
        break;
      case "shadow":
        props.shadow = new Shadow({ color: "rgba(0,0,0,0.6)", blur: 8, offsetX: 5, offsetY: 5 });
        break;
      case "lift":
        props.shadow = new Shadow({ color: "rgba(0,0,0,0.5)", blur: 26, offsetX: 0, offsetY: 16 });
        break;
      case "hollow":
        // outline look: transparent fill, stroke takes over the current text color
        props.fill = "rgba(0,0,0,0)"; props.stroke = curFill === "#000000" ? "#ffffff" : curFill;
        props.strokeWidth = Math.max(2, Math.round(((o as unknown as { fontSize?: number }).fontSize ?? 32) / 34));
        props.paintFirst = "stroke";
        break;
      case "neon":
        props.fill = "#ffffff";
        props.shadow = new Shadow({ color: accent, blur: 34, offsetX: 0, offsetY: 0 });
        break;
      case "echo":
        props.shadow = new Shadow({ color: "rgba(255,255,255,0.30)", blur: 0, offsetX: 7, offsetY: 7 });
        break;
      case "no-fx":
        props.shadow = null; props.strokeWidth = 0; props.stroke = "";
        if (normalizeHex(o.fill) === null) props.fill = "#ffffff"; // restore a fill after hollow
        break;
    }
    setProp(props);
  };

  /* ---- warped text: render text along a path (arc / wave / circle) ---- */
  type WarpMode = "arcUp" | "arcDown" | "wave" | "circle";
  const warpPath = (mode: WarpMode, w: number, bend: number): string => {
    const s = Math.max(12, bend);
    switch (mode) {
      case "arcUp": return `M 0 ${s} Q ${w / 2} ${-s} ${w} ${s}`;
      case "arcDown": return `M 0 0 Q ${w / 2} ${2 * s} ${w} 0`;
      case "wave": return `M 0 ${s} C ${w * 0.25} ${-s} ${w * 0.75} ${3 * s} ${w} ${s}`;
      case "circle": {
        const r = Math.max(50, (w / (2 * Math.PI)) * 1.04);
        return `M ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0`;
      }
    }
  };
  const applyWarp = (mode: WarpMode | null, bend = 90) => {
    const c = fc.current, o = sel.obj;
    if (!c || !o || !isText(o)) return;
    const t = o as unknown as {
      path?: Path; kWarp?: { mode: WarpMode; bend: number } | null;
      calcTextWidth?: () => number; initDimensions?: () => void; fontSize?: number; width?: number;
    };
    if (!mode) {
      o.set({ path: undefined, kWarp: null } as Partial<FabricObject>);
      o.set("dirty", true); t.initDimensions?.();
      c.renderAll(); pushHistory(); setSel((s) => ({ ...s }));
      return;
    }
    // measure the single-line width so the path is always long enough for every glyph
    o.set("path", undefined);
    o.set("dirty", true); t.initDimensions?.();
    const natural = Math.max(140, Math.ceil(t.calcTextWidth?.() ?? t.width ?? 300));
    if (/textbox/i.test(o.type ?? "")) o.set("width", Math.min(natural + 6, canvasSize.width * 1.5));
    o.set({ path: new Path(warpPath(mode, natural, bend)), kWarp: { mode, bend } } as Partial<FabricObject>);
    o.set("dirty", true); t.initDimensions?.();
    c.renderAll(); pushHistory(); setSel((s) => ({ ...s }));
  };

  /* ---- visual crop: drag a frame over the image, Enter/Apply commits ---- */
  const startCrop = () => {
    const c = fc.current;
    if (!c || !sel.obj || !isImage(sel.obj)) return;
    if (retouchRef.current) { toast.info("Finish retouching first (Done)."); return; }
    const img = sel.obj as unknown as FabricImage;
    if (Math.abs(((img.angle ?? 0) % 360 + 360) % 360) > 0.5) { toast.info("Set rotation back to 0° first, then crop."); return; }
    const r = img.getBoundingRect();
    cropImgRef.current = img;
    img.set({ selectable: false, evented: false });
    c.discardActiveObject(); c.renderAll();
    setCropRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    toast.info("Drag the corners to crop · Enter applies · Esc cancels");
  };
  const endCrop = () => {
    const img = cropImgRef.current;
    if (img) img.set({ selectable: true, evented: true });
    cropImgRef.current = null;
    setCropRect(null);
    fc.current?.renderAll();
  };
  const commitCrop = () => {
    const c = fc.current, img = cropImgRef.current, r = cropRect;
    if (!c || !img || !r) { endCrop(); return; }
    const ir = img.getBoundingRect();
    const x0 = Math.max(r.x, ir.left), y0 = Math.max(r.y, ir.top);
    const x1 = Math.min(r.x + r.w, ir.left + ir.width), y1 = Math.min(r.y + r.h, ir.top + ir.height);
    if (x1 - x0 < 8 || y1 - y0 < 8) { toast.error("Crop area too small."); endCrop(); return; }
    const sx = img.scaleX ?? 1, sy = img.scaleY ?? 1;
    img.set({
      cropX: Math.max(0, (img.cropX ?? 0) + (x0 - ir.left) / sx),
      cropY: Math.max(0, (img.cropY ?? 0) + (y0 - ir.top) / sy),
      width: (x1 - x0) / sx, height: (y1 - y0) / sy,
    });
    img.setPositionByOrigin(new Point(x0, y0), "left", "top");
    img.set({ selectable: true, evented: true, dirty: true });
    cropImgRef.current = null;
    setCropRect(null);
    c.setActiveObject(img); c.renderAll();
    pushHistory(); setSel(readSelection(c));
    toast.success("Cropped — drag the frame again anytime to re-crop.");
  };
  const cropMouseDown = (mode: "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w") => (e: React.MouseEvent) => {
    if (!cropRect) return;
    e.preventDefault(); e.stopPropagation();
    cropDrag.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...cropRect } };
    const onMove = (ev: MouseEvent) => {
      const d = cropDrag.current; if (!d) return;
      const dx = (ev.clientX - d.sx) / zoom, dy = (ev.clientY - d.sy) / zoom;
      const s = d.start;
      const MIN = 24;
      let { x, y, w, h } = s;
      if (d.mode === "move") { x = s.x + dx; y = s.y + dy; }
      else {
        if (d.mode.includes("w")) { x = Math.min(s.x + dx, s.x + s.w - MIN); w = s.w + (s.x - x); }
        if (d.mode.includes("e")) { w = Math.max(MIN, s.w + dx); }
        if (d.mode.includes("n")) { y = Math.min(s.y + dy, s.y + s.h - MIN); h = s.h + (s.y - y); }
        if (d.mode.includes("s")) { h = Math.max(MIN, s.h + dy); }
      }
      setCropRect({ x, y, w, h });
    };
    const onUp = () => {
      cropDrag.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  /* ---- retouch: spot heal (blur-inpaint) + clone stamp, painted into the image's own pixels ---- */
  const startRetouch = (mode: "heal" | "clone") => {
    const c = fc.current;
    if (!c || !sel.obj || !isImage(sel.obj)) return;
    if (cropRect) { toast.info("Finish cropping first (Enter)."); return; }
    const img = sel.obj as unknown as FabricImage;
    const el = img.getElement() as HTMLImageElement | HTMLCanvasElement | undefined;
    if (!el) return;
    const natW = (el as HTMLImageElement).naturalWidth || el.width;
    const natH = (el as HTMLImageElement).naturalHeight || el.height;
    const work = document.createElement("canvas");
    work.width = natW; work.height = natH;
    work.getContext("2d")!.drawImage(el, 0, 0, natW, natH);
    (img as unknown as { setElement: (el: HTMLCanvasElement) => void }).setElement(work);
    c.discardActiveObject();
    c.skipTargetFind = true; c.selection = false;
    c.defaultCursor = "crosshair"; c.hoverCursor = "crosshair";
    c.renderAll();
    const size = retouch?.size ?? 40;
    retouchRef.current = { mode, size, img, work, painting: false, last: null, src: null, srcAtStart: null, strokeStart: null };
    setRetouch({ mode, size });
    toast.info(mode === "clone"
      ? "Click once to pick a source point, then paint to copy from it."
      : "Paint over a spot — it blends into the surrounding texture.");
  };
  const stopRetouch = () => {
    const c = fc.current;
    retouchRef.current = null;
    setRetouch(null);
    if (c) {
      c.skipTargetFind = false; c.selection = true;
      c.defaultCursor = "default"; c.hoverCursor = "move";
      c.renderAll();
    }
  };

  /* retouch pointer engine — assigned every render so closures stay fresh;
     the one-time canvas handlers delegate through retouchApi.current */
  retouchApi.current = (() => {
    const toNatural = (e: Event): { x: number; y: number } | null => {
      const c = fc.current, rt = retouchRef.current;
      if (!c || !rt) return null;
      const sp = c.getScenePoint(e as unknown as Parameters<Canvas["getScenePoint"]>[0]);
      const inv = util.invertTransform(rt.img.calcTransformMatrix());
      const p = util.transformPoint(sp, inv);
      return { x: p.x + (rt.img.cropX ?? 0), y: p.y + (rt.img.cropY ?? 0) };
    };
    const stamp = (x: number, y: number) => {
      const rt = retouchRef.current; if (!rt) return;
      const ctx = rt.work.getContext("2d")!;
      const r = rt.size / 2;
      if (rt.mode === "heal") {
        // cheap content-aware fill: blur the surrounding ring into the spot
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
        ctx.filter = `blur(${Math.max(5, r * 0.6)}px)`;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(rt.work, x - r * 2, y - r * 2, r * 4, r * 4, x - r * 2, y - r * 2, r * 4, r * 4);
        ctx.restore();
      } else {
        // clone: copy from the source point chosen at stroke start
        const anchor = rt.srcAtStart, start = rt.strokeStart;
        if (!anchor || !start) return;
        const dx = anchor.x - start.x, dy = anchor.y - start.y;
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
        ctx.globalAlpha = 0.35;
        ctx.drawImage(rt.work, x + dx - r, y + dy - r, r * 2, r * 2, x - r, y - r, r * 2, r * 2);
        ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(rt.work, x + dx - r, y + dy - r, r * 2, r * 2, x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
    };
    const ensureElement = () => {
      const rt = retouchRef.current; if (!rt) return;
      const el = rt.img.getElement();
      if (el !== rt.work) {
        // element was swapped back to an <img> after a save-sync — repaint the work canvas from it
        const ctx = rt.work.getContext("2d")!;
        ctx.clearRect(0, 0, rt.work.width, rt.work.height);
        if (el) ctx.drawImage(el as CanvasImageSource, 0, 0, rt.work.width, rt.work.height);
        (rt.img as unknown as { setElement: (el: HTMLCanvasElement) => void }).setElement(rt.work);
      }
    };
    const down = (opt: { e: Event }): boolean => {
      const c = fc.current, rt = retouchRef.current;
      if (!c || !rt) return false;
      const ev = opt.e as MouseEvent;
      if (ev.button !== 0) return true;
      const n = toNatural(opt.e);
      if (!n) return true;
      if (rt.mode === "clone" && (!rt.src || ev.altKey)) {
        rt.src = n;
        toast.success("Source set — paint to copy from here.");
        return true;
      }
      ensureElement();
      rt.painting = true;
      rt.strokeStart = n;
      rt.srcAtStart = rt.src;
      rt.last = n;
      stamp(n.x, n.y);
      rt.img.set("dirty", true);
      c.requestRenderAll();
      return true;
    };
    const move = (opt: { e: Event }) => {
      const c = fc.current, rt = retouchRef.current;
      if (!c || !rt || !rt.painting) return;
      const n = toNatural(opt.e);
      if (!n || !rt.last) return;
      // interpolate stamps so fast strokes stay continuous
      const step = Math.max(2, rt.size / 4);
      const dist = Math.hypot(n.x - rt.last.x, n.y - rt.last.y);
      const steps = Math.max(1, Math.floor(dist / step));
      for (let i = 1; i <= steps; i++) {
        stamp(rt.last.x + ((n.x - rt.last.x) * i) / steps, rt.last.y + ((n.y - rt.last.y) * i) / steps);
      }
      rt.last = n;
      rt.img.set("dirty", true);
      c.requestRenderAll();
    };
    const up = () => {
      const c = fc.current, rt = retouchRef.current;
      if (!c || !rt || !rt.painting) return;
      rt.painting = false;
      // sync pixels back to an <img> element so saves/exports serialize the retouched bitmap
      const url = rt.work.toDataURL("image/png");
      void (rt.img as unknown as { setSrc: (src: string) => Promise<void> }).setSrc(url).then(() => {
        rt.img.set("dirty", true);
        c.renderAll();
      });
      pushHistory();
    };
    return { down, move, up };
  })();

  const addElement = (kind: ElementKind) => {
    const c = fc.current; if (!c) return;
    const W = canvasSize.width, H = canvasSize.height;
    const accent = `hsl(${tpl?.hue ?? 215} 80% 55%)`;
    const base = { left: W * 0.35, top: H * 0.35, fill: accent, opacity: 1 };
    let o: FabricObject;
    const size = W * 0.22;
    switch (kind) {
      case "rect": o = new Rect({ ...base, width: W * 0.3, height: H * 0.18 }); break;
      case "rounded": o = new Rect({ ...base, width: W * 0.3, height: H * 0.18, rx: 26, ry: 26 }); break;
      case "circle": o = new Circle({ ...base, radius: W * 0.12 }); break;
      case "ellipse": o = new Circle({ ...base, radius: W * 0.14, scaleY: 0.62 }); break;
      case "triangle": o = new Triangle({ ...base, width: W * 0.24, height: W * 0.2 }); break;
      case "pill": o = new Rect({ ...base, width: W * 0.34, height: H * 0.09, rx: H * 0.045, ry: H * 0.045 }); break;
      case "diamond": o = new Rect({ ...base, width: size, height: size, angle: 45 }); break;
      case "ring": o = new Circle({ ...base, radius: W * 0.11, fill: "transparent", stroke: accent, strokeWidth: Math.round(W * 0.02) }); break;
      case "cross": {
        const t = W * 0.05;
        o = new Polygon([
          { x: -t, y: -size / 2 }, { x: t, y: -size / 2 }, { x: t, y: -t }, { x: size / 2, y: -t },
          { x: size / 2, y: t }, { x: t, y: t }, { x: t, y: size / 2 }, { x: -t, y: size / 2 },
          { x: -t, y: t }, { x: -size / 2, y: t }, { x: -size / 2, y: -t }, { x: -t, y: -t },
        ], base);
        break;
      }
      case "line": o = new Line([W * 0.2, H * 0.3, W * 0.7, H * 0.3], { stroke: accent, strokeWidth: 8 }); break;
      case "dash": o = new Line([W * 0.2, H * 0.3, W * 0.7, H * 0.3], { stroke: accent, strokeWidth: 6, strokeDashArray: [26, 18] }); break;
      case "arrow-r": case "arrow-l": case "arrow-u": case "arrow-d": {
        const horiz = kind === "arrow-r" || kind === "arrow-l";
        const len = W * 0.3;
        const line = horiz
          ? new Line([0, 0, len, 0], { stroke: accent, strokeWidth: 10 })
          : new Line([0, 0, 0, len], { stroke: accent, strokeWidth: 10 });
        const head = new Triangle({ width: 46, height: 40, fill: accent, left: horiz ? len - 8 : -23, top: horiz ? -20 : len - 8, angle: kind === "arrow-r" ? 90 : kind === "arrow-l" ? -90 : kind === "arrow-d" ? 180 : 0 });
        if (kind === "arrow-l") { line.set({ x1: 0, x2: -len }); head.set({ left: -len - 38 }); }
        if (kind === "arrow-u") { line.set({ y1: 0, y2: -len }); head.set({ top: -len - 32 }); }
        o = new Group([line, head], { left: W * 0.35, top: H * 0.4 });
        break;
      }
      case "star": o = new Polygon(starPoints(5, size / 2, size / 4.4), base); break;
      case "burst": o = new Polygon(starPoints(12, size / 2, size / 2.9), base); break;
      case "chevron": {
        const w = size, h = size * 0.62;
        o = new Polygon([
          { x: -w / 2, y: -h / 2 }, { x: w / 6, y: -h / 2 }, { x: w / 2, y: 0 },
          { x: w / 6, y: h / 2 }, { x: -w / 2, y: h / 2 }, { x: -w / 6, y: 0 },
        ], base);
        break;
      }
    }
    stampKon10(o as unknown as EditorObject, ELEMENTS.find((e) => e.kind === kind)?.name ?? kind);
    c.add(o); c.setActiveObject(o); c.renderAll();
  };

  /* ---- QR code generator (Canva-app style) — rendered locally, inserted as an image ---- */
  const insertQr = async () => {
    const c = fc.current; if (!c) return;
    const text = qrUrl.trim();
    if (!text) { toast.error("Paste a link or text first."); return; }
    if (text.length > 400) { toast.error("Keep it under 400 characters — longer codes get hard to scan."); return; }
    setQrBusy(true);
    try {
      const dataUrl = await QRCode.toDataURL(text, {
        margin: 2, width: 640, errorCorrectionLevel: "M",
        color: { dark: "#111111", light: "#ffffff" },
      });
      const img = await FabricImage.fromURL(dataUrl);
      const s = (canvasSize.width * 0.22) / (img.width ?? 640);
      img.set({ left: canvasSize.width * 0.39, top: canvasSize.height * 0.39, scaleX: s, scaleY: s });
      stampKon10(img as unknown as EditorObject, "QR code");
      (img as unknown as EditorObject).kReplaceable = false;
      c.add(img); c.setActiveObject(img); c.renderAll();
      pushHistory();
      toast.success("QR code added — scan it with your phone to test.");
      track("qr_inserted", { template: slug });
    } catch { toast.error("Couldn't generate that QR code."); }
    finally { setQrBusy(false); }
  };

  const importPsdFile = async (file: File) => {
    const c = fc.current; if (!c) return;
    try {
      toast.info(`Parsing ${file.name} layers…`);
      const buffer = await file.arrayBuffer();
      const parsed = await parsePsdToFabricJson(buffer, tpl || { slug: "custom", name: file.name } as unknown as Template);
      
      if (parsed.canvas) {
        c.setDimensions({ width: parsed.canvas.width, height: parsed.canvas.height });
        setSizeOverride({ width: parsed.canvas.width, height: parsed.canvas.height });
      }
      await c.loadFromJSON(parsed.fabric);
      applyModePermissions(c);
      c.renderAll();
      pushHistory();
      refreshLayers();
      setFields(parsed.fields || []);
      fitZoom();
      const objCount = Array.isArray(parsed.fabric.objects) ? parsed.fabric.objects.length : 0;
      toast.success(`Imported PSD: ${file.name} (${objCount} layers)`);
      track("psd_imported", { name: file.name });
    } catch (err) {
      toast.error("PSD import failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const uploadImage = async (file: File, pos?: { x: number; y: number }) => {
    const c = fc.current; if (!c) return;
    if (/\.(psd|psb)$/i.test(file.name) || file.type.includes("photoshop") || file.type.includes("psd")) {
      return importPsdFile(file);
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      // save to userUploads gallery
      setUserUploads((prev) => {
        const item = { id: `up_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: file.name.replace(/\.[^/.]+$/, ""), url: dataUrl };
        const next = [item, ...prev.filter((u) => u.name !== item.name)].slice(0, 30);
        try { localStorage.setItem("sk-user-uploads", JSON.stringify(next.slice(0, 15))); } catch {}
        return next;
      });

      const img = await FabricImage.fromURL(dataUrl);
      const fit = Math.min((canvasSize.width * 0.6) / (img.width ?? 1), (canvasSize.height * 0.6) / (img.height ?? 1));
      const targetW = (img.width ?? 1) * fit;
      const targetH = (img.height ?? 1) * fit;
      const left = pos ? Math.max(0, pos.x - targetW / 2) : canvasSize.width * 0.2;
      const top = pos ? Math.max(0, pos.y - targetH / 2) : canvasSize.height * 0.2;
      img.set({ left, top, scaleX: fit, scaleY: fit });
      stampKon10(img as unknown as EditorObject, file.name.slice(0, 24));
      c.add(img); c.setActiveObject(img); c.renderAll();
      pushHistory();
      refreshLayers();
      track("image_uploaded", {});
    } catch (err) { toast.error(err instanceof Error ? err.message : "Image failed to load."); }
  };

  const addImageFromUrl = async (url: string, title = "Photo", pos?: { x: number; y: number }) => {
    const c = fc.current; if (!c) return;
    const t = toast.loading("Adding photo…");
    try {
      const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      const fit = Math.min((canvasSize.width * 0.55) / (img.width ?? 1), (canvasSize.height * 0.55) / (img.height ?? 1));
      const targetW = (img.width ?? 1) * fit;
      const targetH = (img.height ?? 1) * fit;
      const left = pos ? Math.max(0, pos.x - targetW / 2) : canvasSize.width * 0.2;
      const top = pos ? Math.max(0, pos.y - targetH / 2) : canvasSize.height * 0.2;
      img.set({ left, top, scaleX: fit, scaleY: fit });
      stampKon10(img as unknown as EditorObject, title.slice(0, 24) || "Photo");
      c.add(img); c.setActiveObject(img); c.renderAll();
      pushHistory();
      refreshLayers();
      toast.success(`Added ${title}`, { id: t });
    } catch {
      toast.error("Could not load image — host may block embedding.", { id: t });
    }
  };

  /** image placeholder replacement — swaps artwork, keeps frame + permissions */
  const replaceImage = async (file: File) => {
    const c = fc.current; if (!c || !sel.obj) return;
    const target = sel.obj as unknown as EditorObject & FabricObject;
    try {
      const dataUrl = await fileToDataUrl(file);
      const img = await FabricImage.fromURL(dataUrl);
      const w = target.getScaledWidth(), h = target.getScaledHeight();
      const s = Math.max(w / (img.width ?? 1), h / (img.height ?? 1)); // fill the frame
      img.set({
        left: target.left, top: target.top, scaleX: s, scaleY: s, angle: target.angle,
        kId: target.kId, kName: target.kName, kPlaceholder: target.kPlaceholder,
        kReplaceable: true, kDeletable: target.kDeletable, kMovable: target.kMovable,
      } as Partial<FabricObject>);
      const idx = c.getObjects().indexOf(target);
      c.remove(target);
      c.insertAt(idx, img);
      if (!isAuthor) applyCustomerPermissions(img as unknown as EditorObject);
      c.setActiveObject(img); c.renderAll(); pushHistory();
      track("image_replaced", { template: slug });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Image failed to load."); }
  };

  const setProp = (props: Record<string, unknown>) => {
    const c = fc.current; if (!c || !sel.obj || sel.kind === "multi") return;

    // Handle text-specific property updates (partial selection coloring & style override cleaning)
    if (isText(sel.obj)) {
      const tb = sel.obj as unknown as Textbox;
      const isEditing = Boolean((tb as unknown as { isEditing?: boolean }).isEditing);
      const hasSubSelection = isEditing && typeof tb.selectionStart === "number" && typeof tb.selectionEnd === "number" && tb.selectionStart !== tb.selectionEnd;

      if (props.fill !== undefined) {
        (props as Record<string, unknown>).globalCompositeOperation = "source-over";
        if (hasSubSelection) {
          tb.setSelectionStyles({ fill: props.fill as string });
          c.renderAll();
          pushHistory();
          setSel((s) => ({ ...s }));
          return;
        } else {
          // Setting fill on whole text: clean any per-character styles that might override the new color
          tb.styles = {};
          tb.set("globalCompositeOperation", "source-over");
        }
      }

      if (props.textBackgroundColor !== undefined) {
        if (hasSubSelection) {
          tb.setSelectionStyles({ textBackgroundColor: props.textBackgroundColor as string });
          c.renderAll();
          pushHistory();
          setSel((s) => ({ ...s }));
          return;
        } else {
          if (tb.styles) {
            Object.values(tb.styles).forEach((lineStyles) => {
              if (lineStyles && typeof lineStyles === "object") {
                Object.values(lineStyles).forEach((charStyle) => {
                  if (charStyle && (charStyle as { textBackgroundColor?: string }).textBackgroundColor) {
                    delete (charStyle as { textBackgroundColor?: string }).textBackgroundColor;
                  }
                });
              }
            });
          }
        }
      }

      if (props.fontSize !== undefined && hasSubSelection) {
        tb.setSelectionStyles({ fontSize: props.fontSize as number });
        c.renderAll();
        pushHistory();
        setSel((s) => ({ ...s }));
        return;
      }

      if (props.fontWeight !== undefined && hasSubSelection) {
        tb.setSelectionStyles({ fontWeight: props.fontWeight as string });
        c.renderAll();
        pushHistory();
        setSel((s) => ({ ...s }));
        return;
      }

      if (props.fontStyle !== undefined && hasSubSelection) {
        tb.setSelectionStyles({ fontStyle: props.fontStyle as string });
        c.renderAll();
        pushHistory();
        setSel((s) => ({ ...s }));
        return;
      }

      if (props.underline !== undefined && hasSubSelection) {
        tb.setSelectionStyles({ underline: Boolean(props.underline) });
        c.renderAll();
        pushHistory();
        setSel((s) => ({ ...s }));
        return;
      }

      if (props.linethrough !== undefined && hasSubSelection) {
        tb.setSelectionStyles({ linethrough: Boolean(props.linethrough) });
        c.renderAll();
        pushHistory();
        setSel((s) => ({ ...s }));
        return;
      }
    }

    sel.obj.set(props as Partial<FabricObject>);
    sel.obj.setCoords();
    c.renderAll();
    pushHistory();
    setSel((s) => ({ ...s })); // refresh panel
  };

  const setFont = (stack: string) => {
    const c = fc.current; if (!c || !sel.obj) return;
    sel.obj.set("fontFamily", stack);
    (sel.obj as unknown as { initDimensions?: () => void }).initDimensions?.();
    sel.obj.setCoords();
    c.renderAll();
    pushHistory();
    setSel((s) => ({ ...s }));

    // Ensure async web font finishes loading and re-calculates exact dimensions
    const primaryFont = stack.split(",")[0]?.replace(/['"]/g, "").trim();
    if (primaryFont && document.fonts && typeof document.fonts.load === "function") {
      document.fonts.load(`32px "${primaryFont}"`).then(() => {
        if (fc.current && sel.obj) {
          (sel.obj as unknown as { initDimensions?: () => void }).initDimensions?.();
          sel.obj.setCoords();
          fc.current.requestRenderAll();
        }
      }).catch(() => {});
    }
  };

  const reorder = (action: "front" | "back" | "forward" | "backward", obj: FabricObject) => {
    const c = fc.current; if (!c) return;
    /* multi-select: never send the ActiveSelection itself into the stack —
       fabric's insertAt would add it as a permanent phantom layer. Reorder the
       members instead, in the direction that preserves their relative order. */
    if (isActiveSelection(obj)) {
      const idxOf = (o: FabricObject) => c.getObjects().indexOf(o);
      const bottomFirst = (obj as ActiveSelection).getObjects().slice().sort((a, b) => idxOf(a) - idxOf(b));
      const seq = action === "forward" || action === "back" ? bottomFirst.slice().reverse() : bottomFirst;
      seq.forEach((m) => {
        if (action === "front") c.bringObjectToFront(m);
        else if (action === "back") c.sendObjectToBack(m);
        else if (action === "forward") c.bringObjectForward(m);
        else c.sendObjectBackwards(m);
      });
      c.renderAll(); pushHistory();
      return;
    }
    if (action === "front") c.bringObjectToFront(obj);
    if (action === "back") c.sendObjectToBack(obj);
    if (action === "forward") c.bringObjectForward(obj);
    if (action === "backward") c.sendObjectBackwards(obj);
    c.renderAll(); pushHistory();
  };

  /* drop phantom ActiveSelection layers created by the old multi-reorder bug
     (they entered the canvas stack as real objects; children are intact) */
  const purgePhantomSelections = () => {
    const c = fc.current; if (!c) return;
    const phantoms = c.getObjects().filter((o) => /^activeselection$/i.test(o.type ?? ""));
    if (!phantoms.length) return;
    applyingRef.current = true;
    c.remove(...phantoms);
    applyingRef.current = false;
    c.renderAll();
    refreshLayers();
  };

  const reorderActive = (action: "front" | "back" | "forward" | "backward") => {
    const c = fc.current; const a = c?.getActiveObject();
    if (!c || !a) return;
    reorder(action, a);
  };

  /* ---- drag-to-reorder in the layers panel (Photoshop-style) ---- */
  const dragLayerId = useRef<string | null>(null);

  const moveLayerToRow = (dragId: string, targetId: string) => {
    const c = fc.current; if (!c || dragId === targetId) return;
    const stack = c.getObjects();
    // resolve by kId, falling back to the row-index key used when rendering
    const resolve = (id: string): FabricObject | undefined => {
      const direct = stack.find((o) => (o as unknown as EditorObject).kId === id);
      if (direct) return direct;
      const list = [...stack].reverse();
      const li = Number(id);
      return Number.isFinite(li) ? list[li] : undefined;
    };
    const A = resolve(dragId), B = resolve(targetId);
    if (!A || !B || A === B) return;
    (A as unknown as EditorObject).kFolder = (B as unknown as EditorObject).kFolder;
    const list = [...stack].reverse(); // top-first, matching the panel
    const fromL = list.indexOf(A), toL = list.indexOf(B);
    list.splice(fromL, 1);
    list.splice(toL, 0, A); // A takes B's row
    const newStack = [...list].reverse();
    applyingRef.current = true;
    c.remove(...stack);
    newStack.forEach((o) => c.add(o));
    applyingRef.current = false;
    c.setActiveObject(A);
    c.renderAll();
    pushHistory();
    refreshLayers();
  };

  /* ---- clipboard (§23) ---- */
  const copySelection = () => {
    const c = fc.current; if (!c) return;
    const objs = c.getActiveObjects();
    if (!objs.length) return;
    clipboardRef.current = { items: objs.map((o) => JSON.stringify(o.toObject([...KON10_PROPS] as string[]))), offset: 0 };
    toast.success(`Copied ${objs.length} item${objs.length > 1 ? "s" : ""}.`);
  };

  const pasteClipboard = async () => {
    const c = fc.current, clip = clipboardRef.current;
    if (!c || !clip) return;
    clip.offset += 1;
    applyingRef.current = true;
    const added: FabricObject[] = [];
    for (const raw of clip.items) {
      const [obj] = (await util.enlivenObjects([JSON.parse(raw)])) as unknown as FabricObject[];
      if (!obj) continue;
      obj.set({
        left: (obj.left ?? 0) + 16 * clip.offset, top: (obj.top ?? 0) + 16 * clip.offset,
        kId: `obj_${Math.random().toString(36).slice(2, 9)}`,
      } as Partial<FabricObject>);
      if (!isAuthor) applyCustomerPermissions(obj as unknown as EditorObject);
      c.add(obj);
      added.push(obj);
    }
    applyingRef.current = false;
    if (added.length === 1) c.setActiveObject(added[0]);
    else if (added.length > 1) c.setActiveObject(new ActiveSelection(added, { canvas: c }));
    c.renderAll();
    pushHistory();
  };

  const duplicateSelection = async () => {
    const c = fc.current; if (!c || !c.getActiveObjects().length) return;
    copySelection();
    await pasteClipboard();
  };

  const cutSelection = () => {
    copySelection();
    deleteSelection();
  };

  const deleteSelection = useCallback(() => {
    const c = fc.current; if (!c) return;
    const actives = c.getActiveObjects();
    if (!actives.length) return;
    const { ok, blocked } = deletableObjects(actives as unknown as EditorObject[]);
    ok.forEach((o) => c.remove(o as unknown as FabricObject));
    if (blocked > 0) toast.error("That element is locked by the template — click its padlock in the Layers panel to unlock it first.");
    if (ok.length) { c.discardActiveObject(); c.renderAll(); pushHistory(); }
  }, [pushHistory]);

  /* ---- grouping (§22) — fabric v7 API: toGroup/toActiveSelection were removed,
         so we rebuild Group / ActiveSelection by hand ---- */
  const groupSelection = () => {
    const c = fc.current, a = c?.getActiveObject();
    if (!c || !a || !isActiveSelection(a)) return;
    const objs = (a as unknown as { removeAll: () => FabricObject[] }).removeAll();
    if (!objs.length) { toast.error("Nothing to group."); return; }
    /* fabric v7: ActiveSelection members stay IN the canvas stack —
       they must be detached before joining the Group, or every object duplicates */
    c.remove(a);
    c.remove(...objs);
    const g = new Group(objs, {});
    c.add(g);
    c.setActiveObject(g); c.renderAll(); pushHistory();
    setSel(readSelection(c));
    toast.success(`Grouped ${objs.length} elements.`);
  };

  const ungroupSelection = () => {
    const c = fc.current, a = c?.getActiveObject();
    if (!c || !a || !isGroup(a)) return;
    const objs = (a as unknown as { removeAll: () => FabricObject[] }).removeAll();
    if (!objs.length) { toast.error("Ungrouping isn't available here."); return; }
    c.remove(a);
    objs.forEach((o) => c.add(o));
    c.setActiveObject(new ActiveSelection(objs, { canvas: c }));
    c.renderAll(); pushHistory();
    setSel(readSelection(c));
  };

  /* ---- layer folders (Photoshop-style layer groups) ---- */
  const createFolder = (customName?: string) => {
    const c = fc.current;
    if (!c) return;
    const active = c.getActiveObjects();
    const folderName = customName || `Group ${folders.length + 1}`;
    setFolders((f) => Array.from(new Set([...f, folderName])));
    if (active.length > 0) {
      active.forEach((o) => {
        (o as unknown as EditorObject).kFolder = folderName;
      });
      pushHistory();
      refreshLayers();
      scheduleAutosave();
      toast.success(`Grouped ${active.length} layer${active.length > 1 ? "s" : ""} into "${folderName}"`);
    } else {
      toast.success(`Created folder "${folderName}"`);
    }
  };

  const toggleFolderCollapse = (folderName: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  const toggleFolderVisibility = (folderName: string) => {
    const c = fc.current;
    if (!c) return;
    const objs = c.getObjects().filter((o) => (o as unknown as EditorObject).kFolder === folderName);
    if (!objs.length) return;
    const anyVisible = objs.some((o) => o.visible !== false);
    objs.forEach((o) => { o.visible = !anyVisible; });
    c.renderAll();
    pushHistory();
    refreshLayers();
    scheduleAutosave();
    toast.success(`${anyVisible ? "Hidden" : "Shown"} "${folderName}"`);
  };

  const toggleFolderLock = (folderName: string) => {
    const c = fc.current;
    if (!c) return;
    const objs = c.getObjects().filter((o) => (o as unknown as EditorObject).kFolder === folderName);
    if (!objs.length) return;
    const anyLocked = objs.some((o) => (o as unknown as EditorObject).kUserLock || (o as unknown as EditorObject).kLocked);
    objs.forEach((o) => {
      const e = o as unknown as EditorObject;
      e.kUserLock = !anyLocked;
      applyCustomerPermissions(e);
    });
    c.renderAll();
    pushHistory();
    refreshLayers();
    scheduleAutosave();
    toast.success(`${anyLocked ? "Unlocked" : "Locked"} "${folderName}"`);
  };

  const selectFolder = (folderName: string) => {
    const c = fc.current;
    if (!c) return;
    const objs = c.getObjects().filter((o) => (o as unknown as EditorObject).kFolder === folderName);
    if (!objs.length) return;
    if (objs.length === 1) {
      c.setActiveObject(objs[0]);
    } else {
      const sel = new ActiveSelection(objs, { canvas: c });
      c.setActiveObject(sel);
    }
    c.renderAll();
  };

  const renameFolder = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) {
      setFolderRename(null);
      return;
    }
    const c = fc.current;
    if (c) {
      c.getObjects().forEach((o) => {
        const e = o as unknown as EditorObject;
        if (e.kFolder === oldName) e.kFolder = trimmed;
      });
      pushHistory();
      refreshLayers();
      scheduleAutosave();
    }
    setFolders((f) => f.map((x) => x === oldName ? trimmed : x));
    setFolderRename(null);
    toast.success(`Renamed folder to "${trimmed}"`);
  };

  const ungroupFolder = (folderName: string) => {
    const c = fc.current;
    if (c) {
      c.getObjects().forEach((o) => {
        const e = o as unknown as EditorObject;
        if (e.kFolder === folderName) e.kFolder = undefined;
      });
      pushHistory();
      refreshLayers();
      scheduleAutosave();
    }
    setFolders((f) => f.filter((x) => x !== folderName));
    toast.success(`Ungrouped "${folderName}"`);
  };

  const deleteFolderWithLayers = (folderName: string) => {
    const c = fc.current;
    if (c) {
      const objs = c.getObjects().filter((o) => (o as unknown as EditorObject).kFolder === folderName);
      if (objs.length) c.remove(...objs);
      pushHistory();
      refreshLayers();
      scheduleAutosave();
    }
    setFolders((f) => f.filter((x) => x !== folderName));
    toast.success(`Deleted "${folderName}" and its layers`);
  };

  const moveLayerToFolder = (layerId: string, targetFolder: string | null) => {
    const c = fc.current;
    if (!c) return;
    const obj = c.getObjects().find((o) => (o as unknown as EditorObject).kId === layerId);
    if (obj) {
      (obj as unknown as EditorObject).kFolder = targetFolder || undefined;
      pushHistory();
      refreshLayers();
      scheduleAutosave();
    }
  };

  /* ---- rasterize: flatten any element (text, shape, group) into a pixel image
         so retouch brushes / filters work on it (Photoshop "Rasterize Layer") ---- */
  const rasterizeSelection = () => {
    const c = fc.current, o = c?.getActiveObject();
    if (!c || !o || isImage(o) || isActiveSelection(o)) return;
    const eo = o as unknown as EditorObject;
    if (!isAuthor && (eo.kLocked || eo.kEditable === false || eo.kDeletable === false)) {
      toast.error("This template element is locked — duplicate the design or ask us to customize it.");
      return;
    }
    const M = 2; // 2× resolution so the bitmap stays crisp
    const el = o.toCanvasElement({ multiplier: M });
    const r = o.getBoundingRect();
    const img = new FabricImage(el, {
      left: r.left, top: r.top,
      scaleX: r.width / el.width, scaleY: r.height / el.height,
    });
    stampKon10(img as unknown as EditorObject, `${eo.kName ?? o.type ?? "Element"} (raster)`);
    const idx = c.getObjects().indexOf(o);
    c.remove(o);
    c.insertAt(Math.max(0, idx), img);
    c.setActiveObject(img); c.renderAll();
    pushHistory(); setSel(readSelection(c));
    toast.success("Rasterized into an image — retouch brushes and filters now work on it.");
  };

  const selectAll = () => {
    const c = fc.current; if (!c) return;
    const objs = c.getObjects().filter((o) => o.selectable !== false && o.evented !== false);
    if (!objs.length) return;
    c.setActiveObject(objs.length === 1 ? objs[0] : new ActiveSelection(objs, { canvas: c }));
    c.renderAll();
    setSel(readSelection(c));
  };

  /* ---- alignment (§28) — delta-based so it works inside selections too ---- */
  const align = (edge: "left" | "centerX" | "right" | "top" | "centerY" | "bottom") => {
    const c = fc.current, a = c?.getActiveObject();
    if (!c || !a) return;
    const W = canvasSize.width, H = canvasSize.height;
    const objs: FabricObject[] = isActiveSelection(a)
      ? [...(a as unknown as ActiveSelection).getObjects()]
      : [a];
    const frame = a.getBoundingRect();
    objs.forEach((o) => {
      const r = o.getBoundingRect();
      const ref = objs.length > 1 ? frame : { left: 0, top: 0, width: W, height: H };
      let dx = 0, dy = 0;
      if (edge === "left") dx = ref.left - r.left;
      if (edge === "centerX") dx = ref.left + ref.width / 2 - (r.left + r.width / 2);
      if (edge === "right") dx = ref.left + ref.width - (r.left + r.width);
      if (edge === "top") dy = ref.top - r.top;
      if (edge === "centerY") dy = ref.top + ref.height / 2 - (r.top + r.height / 2);
      if (edge === "bottom") dy = ref.top + ref.height - (r.top + r.height);
      if (dx) o.set("left", (o.left ?? 0) + dx);
      if (dy) o.set("top", (o.top ?? 0) + dy);
      o.setCoords();
    });
    c.renderAll(); pushHistory();
  };

  /* ---- distribute / tidy up (space 3+ selected elements evenly) ---- */
  const distribute = (axis: "h" | "v") => {
    const c = fc.current, a = c?.getActiveObject();
    if (!c || !a || !isActiveSelection(a)) { toast.error("Select at least 3 elements to space evenly."); return; }
    const objs = [...(a as unknown as ActiveSelection).getObjects()];
    if (objs.length < 3) { toast.error("Select at least 3 elements to space evenly."); return; }
    const rects = objs.map((o) => ({ o, r: o.getBoundingRect() }));
    rects.sort((p, q) => (axis === "h" ? p.r.left - q.r.left : p.r.top - q.r.top));
    const first = rects[0], last = rects[rects.length - 1];
    const start = axis === "h" ? first.r.left + first.r.width / 2 : first.r.top + first.r.height / 2;
    const end = axis === "h" ? last.r.left + last.r.width / 2 : last.r.top + last.r.height / 2;
    const step = (end - start) / (rects.length - 1);
    rects.forEach(({ o, r }, i) => {
      if (i === 0 || i === rects.length - 1) return; // anchors stay put
      const cur = axis === "h" ? r.left + r.width / 2 : r.top + r.height / 2;
      const d = start + step * i - cur;
      if (axis === "h") o.set("left", (o.left ?? 0) + d); else o.set("top", (o.top ?? 0) + d);
      o.setCoords();
    });
    c.renderAll(); pushHistory();
    toast.success("Spaced evenly.");
  };

  const nudge = (dx: number, dy: number) => {
    const c = fc.current; if (!c) return;
    const objs = c.getActiveObjects();
    if (!objs.length) return;
    objs.forEach((o) => {
      if (o.lockMovementX || o.lockMovementY) return;
      o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
      o.setCoords();
    });
    c.renderAll();
    clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(pushHistory, 350);
  };

  /* ---- style copy/paste (§25) ---- */
  const copyStyle = () => {
    const o = sel.obj;
    if (!o || sel.kind === "multi") return;
    const pick: Record<string, unknown> = {};
    STYLE_PROPS.forEach((p) => {
      const v = (o as unknown as Record<string, unknown>)[p];
      if (v !== undefined) pick[p] = v;
    });
    const sh = o.shadow as Shadow | null;
    if (sh) pick.shadow = { color: sh.color, blur: sh.blur, offsetX: sh.offsetX, offsetY: sh.offsetY };
    styleRef.current = pick;
    toast.success("Style copied.");
  };

  const pasteStyle = () => {
    const o = sel.obj, style = styleRef.current;
    if (!o || !style || sel.kind === "multi") return;
    const props: Record<string, unknown> = { ...style };
    if (props.shadow) props.shadow = new Shadow(props.shadow as { color: string; blur: number; offsetX: number; offsetY: number });
    if (!isText(o)) {
      ["fontFamily", "fontSize", "fontWeight", "fontStyle", "underline", "linethrough", "textAlign", "charSpacing", "lineHeight", "textBackgroundColor"].forEach((k) => delete props[k]);
    }
    setProp(props);
    toast.success("Style applied.");
  };

  /* ---- image upgrades (§14–§16) ---- */
  const flipObj = (axis: "flipX" | "flipY") => {
    if (!sel.obj) return;
    setProp({ [axis]: !sel.obj[axis] });
  };

  const filterInfo = (key: string): number | boolean => {
    const img = sel.obj as FabricImage | null;
    const f = (img?.filters ?? []).find((x) => (x as unknown as { type: string }).type.toLowerCase() === key) as unknown as Record<string, number> | undefined;
    if (!f) return key === "grayscale" || key === "sepia" ? false : 0;
    if (key === "grayscale" || key === "sepia") return true;
    return f[key] ?? 0;
  };

  const setImageFilter = (key: "brightness" | "contrast" | "saturation" | "blur" | "grayscale" | "sepia", value: number | boolean) => {
    const c = fc.current;
    if (!c || !sel.obj || !isImage(sel.obj)) return;
    const img = sel.obj as FabricImage;
    const names = { brightness: "Brightness", contrast: "Contrast", saturation: "Saturation", blur: "Blur", grayscale: "Grayscale", sepia: "Sepia" } as const;
    const list = (img.filters ?? []).filter((f) => (f as unknown as { type: string }).type !== names[key]);
    if (key === "brightness" && typeof value === "number" && value !== 0) list.push(new filters.Brightness({ brightness: value }));
    if (key === "contrast" && typeof value === "number" && value !== 0) list.push(new filters.Contrast({ contrast: value }));
    if (key === "saturation" && typeof value === "number" && value !== 0) list.push(new filters.Saturation({ saturation: value }));
    if (key === "blur" && typeof value === "number" && value !== 0) list.push(new filters.Blur({ blur: value }));
    if (key === "grayscale" && value === true) list.push(new filters.Grayscale());
    if (key === "sepia" && value === true) list.push(new filters.Sepia());
    img.filters = list;
    img.applyFilters();
    c.renderAll(); pushHistory();
    setSel((s) => ({ ...s }));
  };

  const setMask = (kind: "none" | "circle" | "rounded" | "star" | "heart" | "hex") => {
    const c = fc.current;
    if (!c || !sel.obj || !isImage(sel.obj)) return;
    const img = sel.obj as FabricImage;
    if (kind === "none") {
      img.clipPath = undefined;
    } else {
      const w = img.getScaledWidth(), h = img.getScaledHeight();
      const cx = (img.left ?? 0) + w / 2, cy = (img.top ?? 0) + h / 2;
      const r = Math.min(w, h) / 2;
      const at = { originX: "center" as const, originY: "center" as const, left: cx, top: cy, absolutePositioned: true };
      img.clipPath = kind === "circle" ? new Circle({ radius: r, ...at })
        : kind === "star" ? new Polygon(starPoints(5, r, r * 0.45), at)
        : kind === "hex" ? new Polygon(hexPoints(r * 0.96), at)
        : kind === "heart" ? new Path(heartPath(r), at)
        : new Rect({ width: w, height: h, rx: Math.min(w, h) * 0.12, ry: Math.min(w, h) * 0.12, ...at });
    }
    c.renderAll(); pushHistory();
  };

  const applyFadeMask = (direction: FadeMaskDirection, depth?: number) => {
    const c = fc.current; if (!c || !sel.obj || !isImage(sel.obj)) return;
    const img = sel.obj as unknown as EditorObject & FabricObject;
    const currentMask = img.kFadeMask;
    const newDepth = depth !== undefined ? depth : (currentMask?.depth ?? 0.45);
    if (direction === "none") {
      img.kFadeMask = undefined;
    } else {
      img.kFadeMask = { direction, depth: newDepth };
    }
    img.dirty = true;
    c.renderAll();
    pushHistory();
    setSel((s) => ({ ...s }));
  };

  const fitImage = (mode: "fill" | "fit") => {
    const c = fc.current;
    if (!c || !sel.obj || !isImage(sel.obj)) return;
    const img = sel.obj as FabricImage;
    const fw = img.getScaledWidth(), fh = img.getScaledHeight();
    const nw = img.width ?? 1, nh = img.height ?? 1;
    const s = mode === "fill" ? Math.max(fw / nw, fh / nh) : Math.min(fw / nw, fh / nh);
    img.set({ scaleX: s, scaleY: s });
    img.setCoords();
    c.renderAll(); pushHistory();
    setSel((x) => ({ ...x }));
  };

  /* ---- gradient fills (shapes + background) ---- */
  const applyGradient = (from: string, to: string, dir: "h" | "v" | "d") => {
    const o = sel.obj;
    if (!o) return;
    setProp({ fill: makeGradient(o.width ?? 100, o.height ?? 100, from, to, dir) });
    track("gradient_applied", { template: slug });
  };

  /* ---- AI background remover (in-browser WASM — no server, model cached after first run) ---- */
  const removeBackgroundAI = async () => {
    const c = fc.current, o = sel.obj;
    if (!c || !o || !isImage(o) || bgBusy) return;
    const img = o as FabricImage;
    setBgBusy(true);
    const t = toast.loading("Removing background — first run downloads the AI model, then it's cached…");
    try {
      const el = img.getElement() as CanvasImageSource & { naturalWidth?: number; naturalHeight?: number };
      const tmp = document.createElement("canvas");
      tmp.width = el.naturalWidth ?? (el as HTMLCanvasElement).width ?? img.width ?? 1;
      tmp.height = el.naturalHeight ?? (el as HTMLCanvasElement).height ?? img.height ?? 1;
      tmp.getContext("2d")!.drawImage(el, 0, 0, tmp.width, tmp.height);
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(tmp.toDataURL("image/png"));
      const url = URL.createObjectURL(blob);
      await img.setSrc(url);
      img.filters = [];
      img.applyFilters();
      c.renderAll(); pushHistory();
      toast.success("Background removed.", { id: t });
      track("bg_removed", { template: slug });
    } catch {
      toast.error("Background removal failed — try a different image.", { id: t });
    } finally { setBgBusy(false); }
  };

  /* ---- magic resize — reflow to the new format, every page (§ resize) ----
     Positions scale per-axis so content fills the frame (no letterbox bands).
     Text bakes the scale into a real fontSize (crisp, still editable, floored
     so small formats never render microtext); shapes/images scale uniformly
     so nothing distorts. */
  const resizeDoc = async (w: number, h: number) => {
    const c = fc.current, d = doc;
    if (!c || !d) return;
    const W0 = canvasSize.width, H0 = canvasSize.height;
    if (w === W0 && h === H0) { setResizeOpen(false); return; }
    const sx = w / W0, sy = h / H0;
    const s = Math.min(sx, sy);
    syncActivePage();
    const xform = (pageJson: Record<string, unknown>) => {
      const objs = (pageJson.objects as Record<string, unknown>[] | undefined) ?? [];
      objs.forEach((o) => {
        const e = o as EditorObject;
        if (e.kId === "background") {
          o.left = 0; o.top = 0; o.width = w; o.height = h; o.scaleX = 1; o.scaleY = 1;
          return;
        }
        o.left = ((o.left as number) ?? 0) * sx;
        o.top = ((o.top as number) ?? 0) * sy;
        const isText = /^(textbox|itext)$/i.test((o.type as string) ?? "");
        if (isText) {
          const curScale = ((o.scaleY as number) ?? 1);
          const fs = ((o.fontSize as number) ?? 32) * curScale * s;
          o.fontSize = Math.max(10, Math.round(fs * 10) / 10);
          o.scaleX = 1; o.scaleY = 1;
          if (typeof o.width === "number") o.width = Math.max(20, (o.width as number) * sx);
        } else {
          o.scaleX = ((o.scaleX as number) ?? 1) * s;
          o.scaleY = ((o.scaleY as number) ?? 1) * s;
        }
        if (typeof o.strokeWidth === "number" && o.strokeWidth > 0) o.strokeWidth = Math.max(0.5, (o.strokeWidth as number) * s);
      });
    };
    Object.values(pagesRef.current).forEach(xform);
    setDoc({ ...d, canvas: { ...d.canvas, width: w, height: h } });
    setSizeOverride({ width: w, height: h });
    applyingRef.current = true;
    await c.loadFromJSON(pagesRef.current[activePage]);
    applyModePermissions(c);
    applyingRef.current = false;
    historyRef.current = { stack: [JSON.stringify(c.toObject([...KON10_PROPS] as string[]))], idx: 0 };
    setSel({ kind: "none", obj: null });
    refreshLayers();
    const host = stageRef.current;
    if (host) {
      const fit = Math.min(2, Math.max(0.15, Math.min((host.clientWidth - 160) / w, (host.clientHeight - 160) / h)));
      c.viewportTransform = [fit, 0, 0, fit, 0, 0];
      c.setZoom(fit);
      c.setDimensions({ width: w * fit, height: h * fit });
      c.renderAll();
      setZoom(fit);
    }
    setResizeOpen(false);
    scheduleAutosave();
    toast.success(`Resized to ${w} × ${h} — layout scaled to fit.`);
    track("design_resized", { template: slug, w, h });
  };

  /* ---- version history — named local snapshots with restore ---- */
  const snapshotStoreId = useCallback(() => {
    if (designRef.current?.id) return designRef.current.id;
    if (tpl?.slug) return `tpl-${tpl.slug}`;
    if (slug) return `tpl-${slug}`;
    return "default-design";
  }, [tpl?.slug, slug]);

  const saveSnapshot = () => {
    if (!fc.current) { toast.error("Design not ready yet."); return; }
    const json = serialize() || JSON.stringify({
      schemaVersion: "1.2",
      canvas: { width: canvasSize.width, height: canvasSize.height, background: fc.current.backgroundColor ?? "#ffffff" },
      fabric: fc.current.toObject([...KON10_PROPS] as string[]),
    });
    const thumb = renderCleanDataUrl(fc.current, canvasSize, { format: "jpeg", multiplier: 120 / Math.max(canvasSize.width, canvasSize.height), quality: 0.6 });
    const name = `Snapshot ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const list = saveVersion(snapshotStoreId(), name, json, thumb);
    if (list === null) toast.error("Storage is full — delete older versions first.");
    else { setVersions([...list]); toast.success("Version snapshot saved."); }
  };

  const openHistory = () => {
    const list = listVersions(snapshotStoreId());
    setVersions([...list]);
    setHistoryOpen(true);
  };

  const restoreVersion = async (v: DesignVersion) => {
    const c = fc.current;
    if (!c) return;
    // safety net: snapshot the current state before rewinding
    {
      const thumb = renderCleanDataUrl(c, canvasSize, { format: "jpeg", multiplier: 120 / Math.max(canvasSize.width, canvasSize.height), quality: 0.6 });
      const currentJson = serialize() || JSON.stringify({
        schemaVersion: "1.2",
        canvas: { width: canvasSize.width, height: canvasSize.height, background: c.backgroundColor ?? "#ffffff" },
        fabric: c.toObject([...KON10_PROPS] as string[]),
      });
      const list = saveVersion(snapshotStoreId(), `Before restore (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`, currentJson, thumb);
      if (list) setVersions([...list]);
    }
    try {
      const parsed = JSON.parse(v.json) as Kon10Doc;
      applyingRef.current = true;
      if (parsed.pages?.length) {
        const meta = parsed.pages.map((p) => ({ id: p.id, name: p.name }));
        pagesRef.current = {};
        parsed.pages.forEach((p) => { pagesRef.current[p.id] = p.fabric; });
        setPages(meta);
        setActivePage(meta[0].id);
        await c.loadFromJSON(pagesRef.current[meta[0].id]);
      } else {
        await c.loadFromJSON(parsed.fabric);
      }
      if (parsed.guides) setUserGuides({ v: parsed.guides.v ?? [], h: parsed.guides.h ?? [] });
      if (parsed.canvas) setSizeOverride({ width: parsed.canvas.width, height: parsed.canvas.height });
      setDoc(parsed);
      setFields(parsed.fields ?? []);
      applyModePermissions(c);
      c.renderAll();
      applyingRef.current = false;
      historyRef.current = { stack: [JSON.stringify(c.toObject([...KON10_PROPS] as string[]))], idx: 0 };
      refreshLayers();
      fitZoom();
      scheduleAutosave();
      setHistoryOpen(false);
      toast.success(`Restored "${v.name}".`);
    } catch {
      applyingRef.current = false;
      editorError("load");
    }
  };

  const revertToOriginalTemplate = async () => {
    const c = fc.current;
    if (!c || !tpl) return;
    
    // Safety net: snapshot current design state before reverting so nothing is ever permanently lost
    const curThumb = renderCleanDataUrl(c, canvasSize, {
      format: "jpeg",
      multiplier: 120 / Math.max(canvasSize.width, canvasSize.height),
      quality: 0.6,
    });
    const currentJson = serialize() || JSON.stringify({
      schemaVersion: "1.2",
      canvas: { width: canvasSize.width, height: canvasSize.height, background: c.backgroundColor ?? "#ffffff" },
      fabric: c.toObject([...KON10_PROPS] as string[]),
    });
    const list = saveVersion(
      snapshotStoreId(),
      `Before revert (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`,
      currentJson,
      curThumb
    );
    if (list) setVersions([...list]);

    let originalDoc = masterDocRef.current;
    if (!originalDoc) {
      originalDoc = masterDocFor(tpl);
    }
    if (!originalDoc) {
      toast.error("Original template document not available.");
      return;
    }

    try {
      applyingRef.current = true;
      if (originalDoc.pages?.length) {
        const meta = originalDoc.pages.map((p) => ({ id: p.id, name: p.name }));
        pagesRef.current = {};
        originalDoc.pages.forEach((p) => { pagesRef.current[p.id] = p.fabric; });
        setPages(meta);
        setActivePage(meta[0].id);
        await c.loadFromJSON(pagesRef.current[meta[0].id]);
      } else {
        await c.loadFromJSON(originalDoc.fabric);
      }
      if (originalDoc.guides) setUserGuides({ v: originalDoc.guides.v ?? [], h: originalDoc.guides.h ?? [] });
      if (originalDoc.canvas) setSizeOverride({ width: originalDoc.canvas.width, height: originalDoc.canvas.height });
      setDoc(originalDoc);
      setFields(originalDoc.fields ?? []);
      if (originalDoc.folders?.length) setFolders(originalDoc.folders);
      applyModePermissions(c);
      c.renderAll();
      applyingRef.current = false;
      historyRef.current = { stack: [JSON.stringify(c.toObject([...KON10_PROPS] as string[]))], idx: 0 };
      refreshLayers();
      fitZoom();

      // Clear any corrupted local drafts and persist clean master
      if (designRef.current?.id) {
        clearDraft(designRef.current.id);
        void saveDesign(designRef.current.id, {
          canvasJson: JSON.stringify(originalDoc),
          thumbnail: curThumb,
        });
      }
      scheduleAutosave();
      setHistoryOpen(false);
      toast.success("Reverted to original template (snapshot saved)!");
    } catch (err) {
      applyingRef.current = false;
      console.error("Revert error:", err);
      toast.error("Failed to restore original template.");
    }
  };

  /* ---- manual guides — drag out of the rulers, drag back to remove ---- */
  const startGuideDrag = (axis: "v" | "h", e: React.MouseEvent, existing?: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasEl.current;
    if (!canvas) return;
    const cRect = canvas.getBoundingClientRect();
    const size = axis === "v" ? canvasSize.width : canvasSize.height;
    const posOf = (ev: MouseEvent) =>
      axis === "v" ? (ev.clientX - cRect.left) / zoom : (ev.clientY - cRect.top) / zoom;
    const move = (ev: MouseEvent) => setDragGuide({ axis, pos: posOf(ev) });
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const pos = posOf(ev);
      setDragGuide(null);
      setUserGuides((g) => {
        const v = [...g.v], h = [...g.h];
        if (existing !== undefined) (axis === "v" ? v : h).splice(existing, 1);
        if (pos >= 0 && pos <= size) (axis === "v" ? v : h).push(Math.round(pos));
        return { v, h };
      });
      scheduleAutosave();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    move(e.nativeEvent as MouseEvent);
  };

  /* ---- guide manager & presets (§Canva/Figma parity) ---- */
  const applyGuidePreset = (preset: "thirds" | "crosshairs" | "columns12" | "margins") => {
    const W = canvasSize.width;
    const H = canvasSize.height;
    if (preset === "thirds") {
      setUserGuides((g) => ({
        v: Array.from(new Set([...g.v, Math.round(W / 3), Math.round((2 * W) / 3)])),
        h: Array.from(new Set([...g.h, Math.round(H / 3), Math.round((2 * H) / 3)])),
      }));
      toast.success("Added Rule of Thirds guides (3×3)");
    } else if (preset === "crosshairs") {
      setUserGuides((g) => ({
        v: Array.from(new Set([...g.v, Math.round(W / 2)])),
        h: Array.from(new Set([...g.h, Math.round(H / 2)])),
      }));
      toast.success("Added Center crosshair guides (50% X & Y)");
    } else if (preset === "columns12") {
      const colStep = W / 12;
      const cols = Array.from({ length: 11 }, (_, i) => Math.round((i + 1) * colStep));
      setUserGuides((g) => ({
        ...g,
        v: Array.from(new Set([...g.v, ...cols])),
      }));
      toast.success("Added 12-Column grid layout guides");
    } else if (preset === "margins") {
      const m = Math.round(Math.min(W, H) * 0.05);
      setUserGuides((g) => ({
        v: Array.from(new Set([...g.v, m, W - m])),
        h: Array.from(new Set([...g.h, m, H - m])),
      }));
      toast.success("Added 5% margin boundary guides");
    }
    setShowRulers(true);
    scheduleAutosave();
  };

  const addNewCustomGuide = () => {
    const cfg = RULER_UNITS.find((u) => u.id === rulerUnit) || RULER_UNITS[0];
    const pxVal = Math.round(newGuideVal * cfg.pxPerUnit);
    const maxBound = newGuideAxis === "v" ? canvasSize.width : canvasSize.height;
    if (pxVal < 0 || pxVal > maxBound) {
      toast.error(`Guide position must be between 0 and ${Math.round(maxBound / cfg.pxPerUnit)} ${cfg.symbol}`);
      return;
    }
    setUserGuides((g) => {
      const list = newGuideAxis === "v" ? g.v : g.h;
      if (list.includes(pxVal)) return g;
      return {
        ...g,
        [newGuideAxis]: [...list, pxVal].sort((a, b) => a - b),
      };
    });
    setShowRulers(true);
    setGuideModalOpen(false);
    scheduleAutosave();
    toast.success(`Added ${newGuideAxis === "v" ? "Vertical" : "Horizontal"} guide at ${newGuideVal} ${cfg.symbol}`);
  };

  const applySafePreset = (preset: "standard" | "story" | "print" | "square") => {
    const W = canvasSize.width;
    const H = canvasSize.height;
    if (preset === "standard") {
      const m = Math.round(Math.min(W, H) * 0.05);
      setSafeConfig({ enabled: true, preset, top: m, right: m, bottom: m, left: m, bleed: 12, showBleed: false });
    } else if (preset === "story") {
      setSafeConfig({ enabled: true, preset, top: 180, right: 36, bottom: 260, left: 36, bleed: 12, showBleed: false });
    } else if (preset === "print") {
      const bleedPx = Math.round(96 * 0.125); // 12px for 0.125"
      const marginPx = Math.round(96 * 0.25); // 24px for 0.25"
      setSafeConfig({ enabled: true, preset, top: marginPx, right: marginPx, bottom: marginPx, left: marginPx, bleed: bleedPx, showBleed: true });
    } else if (preset === "square") {
      const m = Math.round(Math.min(W, H) * 0.08);
      setSafeConfig({ enabled: true, preset, top: m, right: m, bottom: m, left: m, bleed: 12, showBleed: false });
    }
    setShowSafe(true);
    setSafeModalOpen(false);
    toast.success(`Applied ${preset.toUpperCase()} safe zone`);
  };

  /* ---- brand kit — persisted palette + logo shelf (localStorage) ---- */
  const saveBrandPalette = () => {
    const cols = collectDocColors(fc.current);
    if (!cols.length) { toast.error("No colors on the canvas yet."); return; }
    try {
      localStorage.setItem("sk-brand-palette", JSON.stringify(cols));
      setBrandPalette(cols);
      toast.success("Brand palette saved from this design.");
    } catch { toast.error("Storage is full."); }
  };

  const addBrandLogo = async (file: File) => {
    try {
      const dataUrl = await fileToDataUrl(file, 600);
      const next = [dataUrl, ...brandLogos].slice(0, 8);
      try { localStorage.setItem("sk-brand-logos", JSON.stringify(next)); } catch { toast.error("Logo storage full — remove one first."); return; }
      setBrandLogos(next);
      toast.success("Logo added to your brand kit.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Logo failed to load."); }
  };

  const removeBrandLogo = (i: number) => {
    const next = brandLogos.filter((_, xi) => xi !== i);
    try { localStorage.setItem("sk-brand-logos", JSON.stringify(next)); } catch { /* quota */ }
    setBrandLogos(next);
  };

  const insertBrandLogo = async (dataUrl: string) => {
    const c = fc.current; if (!c) return;
    const img = await FabricImage.fromURL(dataUrl);
    const s = (canvasSize.width * 0.2) / (img.width ?? 1);
    img.set({ left: canvasSize.width * 0.4, top: canvasSize.height * 0.06, scaleX: s, scaleY: s });
    stampKon10(img as unknown as EditorObject, "Brand logo");
    c.add(img); c.setActiveObject(img); c.renderAll();
    track("brand_logo_inserted", {});
  };

  /* ---- stock photos — Openverse API (CC-licensed, no API key) ---- */
  const searchStock = async () => {
    const q = stockQ.trim();
    if (!q || stockBusy) return;
    setStockBusy(true);
    try {
      const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&per_page=12&license_type=commercial`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { results?: { id: string; title: string; url: string; thumbnail?: string; creator?: string; source?: string }[] };
      const hits = (data.results ?? []).map((r) => ({
        id: r.id, title: r.title ?? "Photo", url: r.url, thumb: r.thumbnail ?? r.url,
        creator: r.creator ?? "Unknown", source: r.source ?? "",
      }));
      setStockHits(hits);
      if (!hits.length) toast.error("No photos matched — try another search.");
    } catch { toast.error("Stock search is unavailable right now."); }
    finally { setStockBusy(false); }
  };

  const insertStock = async (hit: StockHit) => {
    const c = fc.current; if (!c) return;
    const t = toast.loading("Adding photo…");
    try {
      const img = await FabricImage.fromURL(hit.url, { crossOrigin: "anonymous" });
      const fit = Math.min((canvasSize.width * 0.55) / (img.width ?? 1), (canvasSize.height * 0.55) / (img.height ?? 1));
      img.set({ left: canvasSize.width * 0.2, top: canvasSize.height * 0.2, scaleX: fit, scaleY: fit });
      stampKon10(img as unknown as EditorObject, hit.title.slice(0, 24) || "Stock photo");
      c.add(img); c.setActiveObject(img); c.renderAll();
      toast.success(`Added — credit: ${hit.creator} (CC)`, { id: t });
      track("stock_inserted", { source: hit.source });
    } catch {
      toast.error("That photo's host blocked embedding — try another result.", { id: t });
    }
  };

  /* ---- global template color replacement (§13) ---- */
  const replaceColorGlobally = (from: string, to: string) => {
    const c = fc.current; if (!c) return;
    let n = 0;
    c.getObjects().forEach((o) => {
      if (normalizeHex(o.fill) === from) { o.set("fill", to); n++; }
      if (normalizeHex(o.stroke) === from && (o.strokeWidth ?? 0) > 0) { o.set("stroke", to); n++; }
    });
    if (!n) { toast.error("No objects use that exact color."); return; }
    c.renderAll(); pushHistory();
    toast.success(`Recolored ${n} object${n > 1 ? "s" : ""} across the design.`);
    track("template_color_replaced", { template: slug });
  };

  /* ---- position & size (§26) ---- */
  const setSize = (key: "w" | "h", val: number) => {
    const c = fc.current, o = sel.obj;
    if (!c || !o || !val || val <= 0) return;
    const base = key === "w" ? (o.width ?? 1) : (o.height ?? 1);
    const s = val / base;
    if (key === "w") { o.set("scaleX", s); if (aspectLock) o.set("scaleY", s); }
    else { o.set("scaleY", s); if (aspectLock) o.set("scaleX", s); }
    o.setCoords();
    c.renderAll(); pushHistory();
    setSel((x) => ({ ...x }));
  };

  /* ---- pages (§33 foundation + §29 page duplication) ---- */
  const switchPage = async (id: string) => {
    const c = fc.current;
    if (!c || id === activePage || !pagesRef.current[id]) return;
    syncActivePage();
    applyingRef.current = true;
    await c.loadFromJSON(pagesRef.current[id]);
    applyModePermissions(c);
    c.renderAll();
    applyingRef.current = false;
    purgePhantomSelections();
    setActivePage(id);
    setSel({ kind: "none", obj: null });
    historyRef.current = { stack: [JSON.stringify(c.toObject([...KON10_PROPS] as string[]))], idx: 0 };
    refreshLayers();
  };

  const addPage = async () => {
    const c = fc.current; if (!c || !doc) return;
    syncActivePage();
    const id = `page_${Math.random().toString(36).slice(2, 8)}`;
    pagesRef.current[id] = { version: "7.4.0", objects: [], background: doc.canvas.background };
    setPages([...pages, { id, name: `Page ${pages.length + 1}` }]);
    await switchPage(id);
    scheduleAutosave();
    track("editor_page_added", { template: slug });
  };

  const duplicatePage = async (id: string) => {
    syncActivePage();
    const src = pagesRef.current[id];
    if (!src) return;
    const nid = `page_${Math.random().toString(36).slice(2, 8)}`;
    pagesRef.current[nid] = JSON.parse(JSON.stringify(src)) as Record<string, unknown>;
    const idx = pages.findIndex((p) => p.id === id);
    const meta = [...pages];
    meta.splice(idx + 1, 0, { id: nid, name: `${pages[idx].name} copy` });
    setPages(meta);
    await switchPage(nid);
    scheduleAutosave();
  };

  const deletePage = async (id: string) => {
    if (pages.length <= 1) { toast.error("A design needs at least one page."); return; }
    const idx = pages.findIndex((p) => p.id === id);
    const meta = pages.filter((p) => p.id !== id);
    delete pagesRef.current[id];
    setPages(meta);
    if (id === activePage) await switchPage(meta[Math.max(0, idx - 1)].id);
    scheduleAutosave();
  };

  const renamePage = (id: string, name: string) => {
    setPages(pages.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)));
    setRenameId(null);
    scheduleAutosave();
  };

  /* ---------------- individual element export / download ---------------- */
  const exportSelectedElement = async (fmt: "png" | "jpg" = "png", scale = 2, chooseLocation = true) => {
    const c = fc.current;
    if (!c || !sel.obj) {
      toast.error("No element selected.");
      return;
    }
    const obj = sel.obj;
    const rawName = ((obj as unknown as EditorObject).kName || (obj as unknown as { text?: string }).text || obj.type || "element");
    const safeName = rawName.slice(0, 30).toLowerCase().replace(/[^a-z0-9_-]/gi, "_") || "element";
    const filename = `${safeName}-${scale}x.${fmt === "jpg" ? "jpg" : "png"}`;

    try {
      const dataUrl = obj.toDataURL({
        format: fmt === "jpg" ? "jpeg" : "png",
        multiplier: scale,
        quality: 0.95,
        enableRetinaScaling: true,
        withoutTransform: false,
      });

      if (chooseLocation && typeof window !== "undefined" && "showSaveFilePicker" in window) {
        try {
          const handle = await (window as unknown as {
            showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
          }).showSaveFilePicker({
            suggestedName: filename,
            types: [
              {
                description: `${fmt.toUpperCase()} Image`,
                accept: { [fmt === "jpg" ? "image/jpeg" : "image/png"]: [`.${fmt === "jpg" ? "jpg" : "png"}`] },
              },
            ],
          });
          const writable = await handle.createWritable();
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          await writable.write(blob);
          await writable.close();
          toast.success(`Saved "${filename}" to selected folder!`);
          setLayerExportOpen(false);
          return;
        } catch (pickerErr: unknown) {
          if ((pickerErr as { name?: string })?.name === "AbortError") {
            return;
          }
        }
      }

      // Fallback to direct browser download
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`Downloaded "${filename}"`);
      setLayerExportOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export element.");
    }
  };

  const copySelectedElementToClipboard = async (scale = 2) => {
    if (!sel.obj) return;
    try {
      const dataUrl = sel.obj.toDataURL({
        format: "png",
        multiplier: scale,
        quality: 1,
        enableRetinaScaling: true,
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      if (navigator.clipboard && typeof window.ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("Element copied to clipboard as PNG!");
        setLayerExportOpen(false);
      } else {
        toast.error("Clipboard API not supported in this browser.");
      }
    } catch {
      toast.error("Failed to copy element to clipboard.");
    }
  };

  /* ---------------- preview + export (§36–§39) ---------------- */
  const openPreview = () => {
    const c = fc.current; if (!c) return;
    const url = renderCleanDataUrl(c, canvasSize, { format: "png" });
    setPreview(url);
  };

  const openExport = () => {
    const c = fc.current;
    if (c) setChecks(runDesignChecks(c.getObjects() as unknown as Parameters<typeof runDesignChecks>[0], canvasSize.width, canvasSize.height));
    setExportPhase("idle");
    setExportOpen(true);
    track("export_dialog_opened", { template: slug });
  };

  const copyImageToClipboard = async () => {
    const c = fc.current;
    if (!c) return;
    try {
      toast.info("Rendering design for clipboard…");
      const dataUrl = renderCleanDataUrl(c, canvasSize, {
        format: "png",
        multiplier: exportScale,
        transparentBg: exportTransparent,
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      if (navigator.clipboard && typeof window.ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        toast.success("Design image copied to clipboard! Paste (⌘V) anywhere.");
      } else {
        toast.error("Direct clipboard image copy is not supported in this browser.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to copy image to clipboard.");
    }
  };

  const shareNative = async () => {
    const c = fc.current;
    if (!c) return;
    try {
      const dataUrl = renderCleanDataUrl(c, canvasSize, {
        format: "png",
        multiplier: exportScale,
        transparentBg: exportTransparent,
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `${tpl?.name ?? "design"}.png`, { type: "image/png" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: tpl?.name ?? "Socialkon Design",
          text: `Check out my design: ${tpl?.name ?? ""}`,
        });
        toast.success("Shared successfully!");
      } else if (navigator.share) {
        await navigator.share({
          title: tpl?.name ?? "Socialkon Design",
          url: window.location.href,
        });
        toast.success("Shared link!");
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Share link copied to clipboard!");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error(err);
        toast.error("Sharing canceled or not supported on this device.");
      }
    }
  };

  const runExport = async () => {
    const c = fc.current; if (!c || !doc) return;
    if (!fmtAllowed(exportFmt)) { toast.error(`This template doesn't include ${exportFmt.toUpperCase()} export.`); return; }
    setExportPhase("prep");
    await new Promise((r) => setTimeout(r, 280));
    setExportPhase("render");
    try {
      const name = `${tpl?.name ?? "design"}-kon10`;
      if (exportFmt === "pdf") {
        const { width: W, height: H } = canvasSize;
        const orient = W > H ? "landscape" : "portrait";
        const pdf = new jsPDF({ orientation: orient, unit: "px", format: [W, H] });
        syncActivePage();
        const activeFabric = pagesRef.current[activePage];
        for (let i = 0; i < pages.length; i++) {
          applyingRef.current = true;
          await c.loadFromJSON(pagesRef.current[pages[i].id]);
          c.renderAll();
          const url = renderCleanDataUrl(c, canvasSize, { format: "png", multiplier: Math.max(1, exportScale) });
          if (i > 0) pdf.addPage([W, H], orient);
          pdf.addImage(url, "PNG", 0, 0, W, H);
          if (printCropMarks) {
            pdf.setDrawColor(0, 0, 0);
            pdf.setLineWidth(0.6);
            const mLen = 14;
            const bOff = 12;
            pdf.line(bOff, 0, bOff, mLen); pdf.line(0, bOff, mLen, bOff);
            pdf.line(W - bOff, 0, W - bOff, mLen); pdf.line(W, bOff, W - mLen, bOff);
            pdf.line(bOff, H, bOff, H - mLen); pdf.line(0, H - bOff, mLen, H - bOff);
            pdf.line(W - bOff, H, W - bOff, H - mLen); pdf.line(W, H - bOff, W - mLen, H - bOff);
          }
        }
        applyingRef.current = true;
        await c.loadFromJSON(activeFabric);
        applyModePermissions(c);
        c.renderAll();
        applyingRef.current = false;
        refreshLayers();
        pdf.save(`${name}.pdf`);
      } else if (exportFmt === "svg") {
        const { width: W, height: H } = canvasSize;
        const svg = c.toSVG({
          width: `${W}`, height: `${H}`,
          viewBox: { x: 0, y: 0, width: W, height: H },
        } as Parameters<Canvas["toSVG"]>[0]);
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${name}.svg`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      } else if (exportFmt === "psd") {
        const psdBlob = await exportFabricCanvasToPsdBlob(c, canvasSize);
        triggerPsdDownload(psdBlob, `${name}.psd`);
      } else {
        const dataUrl = renderCleanDataUrl(c, canvasSize, {
          format: exportFmt === "jpg" ? "jpeg" : "png",
          quality: exportQuality,
          multiplier: exportScale,
          transparentBg: exportFmt === "png" && exportTransparent,
        });
        const a = document.createElement("a");
        a.href = dataUrl; a.download = `${name}.${exportFmt}`;
        document.body.appendChild(a); a.click(); a.remove();
      }
      void addManaged("downloadRecords", { templateSlug: slug, designId: design?.id, format: exportFmt, email, downloadedAt: new Date().toISOString() });
      track("design_exported", { template: slug, format: exportFmt });
      setExportPhase("done");
      setTimeout(() => setExportOpen(false), 750);
      toast.success(`${exportFmt.toUpperCase()} downloaded at ${exportScale}x resolution.`);
    } catch {
      setExportPhase("idle"); // dialog stays open so the user can try again (§53)
      editorError("export");
    }
  };

  /* ---------------- author: validate + publish ---------------- */
  const publish = async () => {
    const json = serialize();
    if (!json || !tpl) return;
    let parsed: Kon10Doc;
    try { parsed = JSON.parse(json); } catch { toast.error("Template JSON is invalid."); return; }
    const problems = validateTemplateDoc(parsed);
    if (problems.length) {
      problems.forEach((p) => toast.error(p));
      return;
    }
    const templateId = (tpl as unknown as { id?: string }).id;
    if (templateId) {
      await updateManaged("templates", templateId, { canvasJson: json, status: "published" });
    } else {
      await addManaged("templates", { ...tpl, canvasJson: json, status: "published" });
    }
    track("template_published", { template: tpl.slug });
    toast.success("Template validated + published — live in the marketplace.");
    navigate("/admin");
  };

  /* ---------------- command palette (§32) ---------------- */
  const commands: { id: string; label: string; hint?: string; run: () => void }[] = [
    { id: "add-heading", label: "Add heading text", run: () => addText("heading") },
    { id: "add-sub", label: "Add subheading text", run: () => addText("subheading") },
    { id: "add-para", label: "Add paragraph text", run: () => addText("paragraph") },
    ...ELEMENTS.map((el) => ({ id: `el-${el.kind}`, label: `Add ${el.name.toLowerCase()}`, run: () => addElement(el.kind) })),
    { id: "upload", label: "Upload an image", run: () => setLeftTab("uploads") },
    { id: "align-l", label: "Align left", run: () => align("left") },
    { id: "align-cx", label: "Align center", run: () => align("centerX") },
    { id: "align-r", label: "Align right", run: () => align("right") },
    { id: "align-t", label: "Align top", run: () => align("top") },
    { id: "align-cy", label: "Align middle", run: () => align("centerY") },
    { id: "align-b", label: "Align bottom", run: () => align("bottom") },
    { id: "dist-h", label: "Space evenly — horizontal", run: () => distribute("h") },
    { id: "dist-v", label: "Space evenly — vertical", run: () => distribute("v") },
    { id: "qr", label: "Insert QR code", run: () => setLeftTab("elements") },
    { id: "resize", label: "Resize design — fit another format", run: () => setResizeOpen(true) },
    { id: "snapshot", label: "Save version snapshot", run: saveSnapshot },
    { id: "history", label: "Version history", run: openHistory },
    { id: "revert_original", label: "↺ Revert to Original Template (Reset)", run: () => void revertToOriginalTemplate() },
    { id: "remove-bg", label: "Remove image background (AI)", run: () => void removeBackgroundAI() },
    { id: "clear-guides", label: "Clear all guides", run: () => { setUserGuides({ v: [], h: [] }); scheduleAutosave(); } },
    { id: "group", label: "Group selection", hint: "⌘G", run: groupSelection },
    { id: "ungroup", label: "Ungroup", hint: "⌘⇧G", run: ungroupSelection },
    { id: "duplicate", label: "Duplicate selection", hint: "⌘D", run: () => void duplicateSelection() },
    { id: "copy-style", label: "Copy style", run: copyStyle },
    { id: "paste-style", label: "Paste style", run: pasteStyle },
    { id: "grid", label: showGrid ? "Hide grid" : "Show grid", run: () => setShowGrid((v) => !v) },
    { id: "rulers", label: showRulers ? "Hide rulers" : "Show rulers", run: () => setShowRulers((v) => !v) },
    { id: "ruler-unit-px", label: "Ruler unit: Pixels (px)", run: () => { setRulerUnit("px"); setShowRulers(true); } },
    { id: "ruler-unit-in", label: "Ruler unit: Inches (in)", run: () => { setRulerUnit("in"); setShowRulers(true); } },
    { id: "ruler-unit-cm", label: "Ruler unit: Centimeters (cm)", run: () => { setRulerUnit("cm"); setShowRulers(true); } },
    { id: "ruler-unit-mm", label: "Ruler unit: Millimeters (mm)", run: () => { setRulerUnit("mm"); setShowRulers(true); } },
    { id: "safe", label: showSafe ? "Hide safe area" : "Show safe area", run: () => setShowSafe((v) => !v) },
    { id: "snap", label: snapOn ? "Turn snapping off" : "Turn snapping on", run: () => setSnapOn((v) => !v) },
    { id: "draw", label: drawing ? "Exit brush mode" : "Brush mode (draw freehand)", run: () => { setDrawingMode(!drawing); setLeftTab("draw"); } },
    { id: "page-add", label: "Add page", run: () => void addPage() },
    { id: "zoom-fit", label: "Zoom to fit", hint: "⌘0", run: fitZoom },
    { id: "zoom-100", label: "Zoom to 100%", run: () => applyZoom(1) },
    { id: "preview", label: "Preview design", run: openPreview },
    { id: "export", label: "Download / export", run: openExport },
    { id: "fullscreen", label: isFullscreen ? "Exit fullscreen mode" : "Enter fullscreen mode", hint: "F", run: toggleFullscreen },
    { id: "save", label: "Save now", hint: "⌘S", run: () => { const d = designRef.current; if (d) void persistNow(d.id); } },
    { id: "shortcuts", label: "Keyboard shortcuts", hint: "?", run: () => setShortcutsOpen(true) },
  ];
  const filteredCmds = commands.filter((c) => c.label.toLowerCase().includes(paletteQ.toLowerCase()));

  /* ---------------- render states ---------------- */

  if (access === "checking" || !tpl) {
    return createPortal(
      <div className="kon10-studio fixed inset-0 z-[100] grid place-items-center" style={{ background: "var(--s-bg)" }}>
        <div className="flex flex-col items-center gap-4">
          <span className="font-meta text-[10px] text-[var(--s-muted)]">{access === "checking" ? "Verifying access…" : "Template not found."}</span>
          {access === "checking" && <div className="s-bootbar" />}
        </div>
      </div>,
      document.body,
    );
  }

  if (access === "denied") {
    return createPortal(
      <div className="kon10-studio fixed inset-0 z-[100] grid place-items-center p-6" style={{ background: "var(--s-bg)", color: "var(--s-text)" }}>
        <div className="s-panel2 border border-[var(--s-line2)] rounded-2xl p-10 max-w-md text-center s-pop">
          <span className="font-meta text-[9px] text-[var(--dept)]">KON10 STUDIO</span>
          <h1 className="font-display text-2xl font-bold uppercase mt-3">You don't have permission to edit this template</h1>
          <p className="text-sm text-[var(--s-muted)] mt-3">
            KON10 Studio opens templates you own. Purchase <strong>{tpl.name}</strong> and it unlocks here instantly.
          </p>
          <div className="flex justify-center gap-3 mt-7">
            <Link to={`/templates/${tpl.slug}`} className="s-btn s-btn-acc !h-10">Buy Template</Link>
            <Link to="/templates" className="s-btn s-btn-line !h-10">Back to Templates</Link>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  /* PSD import progress overlay — shown while fetching + parsing the source file */
  if (psdImporting) {
    return createPortal(
      <div className="kon10-studio fixed inset-0 z-[100] grid place-items-center" style={{ background: "var(--s-bg)" }}>
        <div className="flex flex-col items-center gap-5 max-w-xs text-center">
          <div className="s-bootbar" />
          <span className="font-meta text-[10px] text-[var(--s-muted)]">Opening PSD…</span>
          <span className="font-meta text-[9px] text-[var(--dept)]">{psdProgress}</span>
          <p className="text-xs text-[var(--s-muted)] opacity-70">
            Parsing layers — this only happens once. Future opens are instant.
          </p>
        </div>
      </div>,
      document.body,
    );
  }

  /* ---------------- shared render helpers ---------------- */

  const selObj = sel.obj as (FabricObject & Partial<EditorObject>) | null;
  const styleLocked = !isAuthor && selObj?.kStyleEditable === false;
  const docColors = collectDocColors(fc.current);
  const vpt = fc.current?.viewportTransform ?? [zoom, 0, 0, zoom, 0, 0];
  const canUndo = historyRef.current.idx > 0;
  const canRedo = historyRef.current.idx < historyRef.current.stack.length - 1;

  const selectLayer = (o: FabricObject, ev?: React.MouseEvent) => {
    const c = fc.current; if (!c) return;
    const e = o as unknown as EditorObject;
    if (e.selectable === false || e.evented === false) { toast.error("That layer is locked."); return; }

    const isMulti = Boolean(ev && (ev.shiftKey || ev.metaKey || ev.ctrlKey));

    if (isMulti) {
      const activeObjs = c.getActiveObjects();
      let nextObjs: FabricObject[];

      if (activeObjs.includes(o)) {
        // Toggle off from active multi-selection
        nextObjs = activeObjs.filter((x) => x !== o);
      } else {
        // Add layer to active multi-selection
        nextObjs = [...activeObjs, o];
      }

      if (nextObjs.length === 0) {
        c.discardActiveObject();
      } else if (nextObjs.length === 1) {
        c.setActiveObject(nextObjs[0]);
      } else {
        const sel = new ActiveSelection(nextObjs, { canvas: c });
        c.setActiveObject(sel);
      }
    } else {
      c.setActiveObject(o);
    }

    c.renderAll();
    setSel(readSelection(c));
  };

  const toggleUserLock = (o: FabricObject) => {
    const c = fc.current; if (!c) return;
    const e = o as unknown as EditorObject;
    const locked = !e.kUserLock;
    o.set({
      kUserLock: locked,
      lockMovementX: locked,
      lockMovementY: locked,
      lockRotation: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      hasControls: !locked,
      selectable: !locked,
      evented: !locked,
    } as Partial<FabricObject>);
    if (locked && c.getActiveObjects().includes(o)) {
      c.discardActiveObject();
    }
    c.renderAll();
    pushHistory();
    refreshLayers();
    toast.success(locked ? `🔒 Locked "${e.kName ?? o.type}"` : `🔓 Unlocked "${e.kName ?? o.type}"`);
  };

  /* one padlock for both lock kinds: user lock toggles freely; template locks
     (kLocked) can be lifted by the site owner (author/admin) — customers keep protection */
  const toggleAnyLock = (o: FabricObject) => {
    const c = fc.current; if (!c) return;
    const e = o as unknown as EditorObject;
    if (e.kLocked && !e.kUserLock) {
      if (!isAuthor && !isAdmin) {
        toast.error("Locked by the template — this protects the design's structure for customers.");
        return;
      }
      /* lifting a template lock restores FULL control — the restriction flags
         (kDeletable/kEditable/kMovable…) travel with the lock, otherwise the
         layer would unlock on paper but still refuse deletes and edits */
      o.set({
        kLocked: false, kDeletable: true, kEditable: true, kMovable: true,
        kResizable: true, kRotatable: true, kStyleEditable: true, kReplaceable: true,
      } as Partial<FabricObject>);
      o.selectable = true;
      o.evented = true;
      o.lockMovementX = false; o.lockMovementY = false;
      o.lockScalingX = false; o.lockScalingY = false;
      o.lockRotation = false;
      o.hasControls = true;
      (o as unknown as { editable?: boolean }).editable = true;
      c.renderAll(); pushHistory(); refreshLayers();
      toast.success(`Unlocked "${e.kName ?? o.type}" — fully editable now.`);
      return;
    }
    toggleUserLock(o);
  };

  const setCase = (mode: "upper" | "lower" | "title") => {
    const t = selObj as unknown as { text?: string } | null;
    const txt = t?.text ?? "";
    const next = mode === "upper" ? txt.toUpperCase() : mode === "lower" ? txt.toLowerCase()
      : txt.toLowerCase().replace(/(?:^|\s)\S/g, (m) => m.toUpperCase());
    setProp({ text: next });
  };

  const Slider = ({ label, min, max, step = 1, value, onChange, disabled }: {
    label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void; disabled?: boolean;
  }) => (
    <label className="block">
      <span className="s-label">{label} — {value}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        className="w-full accent-[var(--dept)]" aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );

  const TbIcon = ({ tip, onClick, disabled, active, d, children }: {
    tip: string; onClick: () => void; disabled?: boolean; active?: boolean; d?: string; children?: React.ReactNode;
  }) => (
    <Tip tip={tip} below>
      <button className={"s-icon-btn" + (active ? " s-btn-on" : "")} onClick={onClick} disabled={disabled} aria-label={tip}>
        {d ? (
          <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
        ) : children}
      </button>
    </Tip>
  );

  const TbColor = ({ tip, value, disabled, onChange }: { tip: string; value: string; disabled?: boolean; onChange: (hex: string) => void }) => (
    <Tip tip={tip} below>
      <ColorField
        value={value}
        disabled={disabled}
        compact
        docColors={docColors}
        onChange={onChange}
      />
    </Tip>
  );

  const menuItem = (label: string, kbd: string | undefined, fn: () => void, opts?: { disabled?: boolean; danger?: boolean }) => (
    <button key={label} className={"s-menu-item" + (opts?.danger ? " s-danger" : "")} disabled={opts?.disabled}
      onClick={() => { setCtx(null); fn(); }}>
      <span>{label}</span>
      {kbd && <span className="s-menu-kbd">{kbd}</span>}
    </button>
  );

  const saveLabel = offline ? "Offline — saved locally"
    : saveState === "saved" ? "✓ Saved"
    : saveState === "saving" ? "Saving…"
    : saveState === "syncing" ? "Syncing…"
    : saveState === "failed" ? "Save failed — will retry"
    : "Unsaved changes";

  const maskKind = (() => {
    if (!selObj || !isImage(selObj)) return "none";
    const cp = selObj.clipPath as FabricObject | undefined;
    if (!cp) return "none";
    const t = cp.type ?? "";
    if (/^circle$/i.test(t)) return "circle";
    if (/^path$/i.test(t)) return "heart";
    if (/^polygon$/i.test(t)) return ((cp as Polygon).points?.length === 6 ? "hex" : "star");
    return "rounded";
  })();

  /* layers under the right-click point — top-first, for the "Select layer" picker */
  const ctxLayers = (() => {
    if (!ctx) return [] as FabricObject[];
    const c = fc.current;
    if (!c) return [] as FabricObject[];
    const el = c.upperCanvasEl?.getBoundingClientRect();
    const vpt = c.viewportTransform;
    if (!el || !vpt) return [] as FabricObject[];
    const sp = new Point((ctx.x - el.left - vpt[4]) / vpt[0], (ctx.y - el.top - vpt[5]) / vpt[3]);
    return c.getObjects()
      .filter((o) => o.visible !== false && o.selectable !== false && o.evented !== false &&
        o.containsPoint(sp))
      .reverse().slice(0, 5);
  })();

  const fmtMeta = [
    { id: "png" as const, name: "PNG", desc: "Crisp digital image" },
    { id: "jpg" as const, name: "JPG", desc: "Web & social sharing" },
    { id: "svg" as const, name: "SVG", desc: "Scalable vector — logos & print" },
    { id: "pdf" as const, name: "PDF", desc: pages.length > 1 ? `Print · all ${pages.length} pages` : "Print-ready document" },
    { id: "psd" as const, name: "PSD (Photoshop)", desc: "Layered source file with all your customizations" },
  ];

  /** SVG and PSD are universal formats — allowed unless a template explicitly opts out */
  const fmtAllowed = (id: (typeof fmtMeta)[number]["id"]) =>
    id === "svg" || id === "psd" ? (doc?.exports as unknown as Record<string, boolean>)?.[id] !== false : !!doc?.exports[id];

  /* ---------------- main layout ---------------- */

  return createPortal(
    <div className="kon10-studio fixed inset-0 z-[100] flex flex-col" style={{ background: "var(--s-bg)", color: "var(--s-text)" }}>

      {/* top bar */}
      <div className="flex items-center justify-between gap-3 px-3 h-[52px] border-b border-[var(--s-line)] shrink-0 s-panel">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="Exit to home">
            <img src="/assets/sk-mark.png" alt="" width={26} height={17} className="h-[15px] w-auto" />
          </Link>
          <span className="font-meta text-[9px] px-2 py-1 rounded-md shrink-0" style={{ background: isDesignerMode ? "rgb(245 158 11)" : "var(--dept)", color: isDesignerMode ? "#000" : "var(--on-dept)" }}>
            KON10 STUDIO{isAuthor ? " · AUTHOR" : isDesignerMode ? " · DESIGNER" : ""}
          </span>
          <span className="font-display text-[13px] font-bold uppercase truncate max-md:hidden">{tpl.name}</span>
          <span className="font-meta text-[9px] shrink-0 flex items-center gap-1.5" role="status"
            style={{ color: saveState === "failed" ? "var(--s-danger)" : saveState === "saved" ? "var(--s-muted)" : "var(--dept)" }}>
            {saveLabel}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-0.5">
          <TbIcon tip="Undo · ⌘Z" onClick={undo} disabled={!canUndo} d="M8 5L3 10l5 5 M3 10h12a6 6 0 0 1 0 12h-2" />
          <TbIcon tip="Redo · ⌘⇧Z" onClick={redo} disabled={!canRedo} d="M16 5l5 5-5 5 M21 10H9a6 6 0 0 0 0 12h2" />
          <span className="w-px h-5 bg-[var(--s-line)] mx-1.5" />
          <TbIcon tip={snapOn ? "Snapping on" : "Snapping off"} onClick={() => setSnapOn(!snapOn)} active={snapOn} d="M6 3v8a6 6 0 0 0 12 0V3 M6 3h4v6H6z M14 3h4v6h-4z" />
          <TbIcon tip="Grid" onClick={() => setShowGrid(!showGrid)} active={showGrid} d="M4 4h16v16H4z M4 12h16 M12 4v16" />
          {/* Ruler toggle + unit switcher inline */}
          <TbIcon tip="Rulers" onClick={() => setShowRulers(!showRulers)} active={showRulers} d="M3 8h18v8H3z M7 8v3 M11 8v4 M15 8v3" />
          {showRulers && (
            <div className="relative" data-ruler-menu>
              <button
                data-ruler-menu
                className="flex items-center gap-1 h-[28px] px-2 rounded-md font-mono text-[10px] font-bold border border-cyan-500/40 bg-cyan-950/60 text-cyan-300 hover:bg-cyan-900/60 transition-colors"
                title="Ruler measurement unit — click to change"
                onClick={() => setUnitDropOpen((o) => !o)}
              >
                {rulerUnit} <span className="opacity-60 text-[8px]">▾</span>
              </button>
              {unitDropOpen && (
                <div data-ruler-menu className="absolute top-[calc(100%+6px)] left-0 z-[200] w-44 rounded-xl border border-[var(--s-line2)] bg-[#121216] shadow-2xl overflow-hidden">
                  <div className="px-3 py-1.5 text-[9px] font-meta text-zinc-500 tracking-wider uppercase border-b border-white/5">
                    Ruler Units
                  </div>
                  {RULER_UNITS.map((u) => (
                    <button
                      key={u.id}
                      data-ruler-menu
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-[12px] transition-colors ${
                        rulerUnit === u.id
                          ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                          : "text-zinc-200 hover:bg-white/10"
                      }`}
                      onClick={() => {
                        setRulerUnit(u.id);
                        try { localStorage.setItem("sk-ruler-unit", u.id); } catch {}
                        setUnitDropOpen(false);
                        toast.success(`Ruler: ${u.label}`);
                      }}
                    >
                      <span>{u.label}</span>
                      {rulerUnit === u.id && <span className="text-cyan-400 text-[10px]">✓</span>}
                    </button>
                  ))}
                  <div className="border-t border-white/5" />
                  <button
                    data-ruler-menu
                    className="w-full flex items-center justify-between px-3 py-2 text-[11.5px] text-zinc-400 hover:bg-white/10 transition-colors"
                    onClick={() => { setUserGuides({ v: [], h: [] }); setUnitDropOpen(false); toast.success("All guides cleared"); }}
                  >
                    Clear Guides <span className="text-[9px] opacity-60">⌥;</span>
                  </button>
                  <button
                    data-ruler-menu
                    className="w-full flex items-center justify-between px-3 py-2 text-[11.5px] text-zinc-400 hover:bg-white/10 transition-colors"
                    onClick={() => { setGuideModalOpen(true); setUnitDropOpen(false); }}
                  >
                    Add Guide… <span className="text-[9px] opacity-60">⌘;</span>
                  </button>
                </div>
              )}
            </div>
          )}
          <TbIcon tip="Safe area & Print bleed settings" onClick={() => { if (!showSafe) setShowSafe(true); else setSafeModalOpen(true); }} active={showSafe} d="M4 4h16v16H4z M9 9h6v6H9z" />
          <span className="w-px h-5 bg-[var(--s-line)] mx-1.5" />
          <TbIcon tip="Resize design — fit to another format" onClick={() => setResizeOpen(true)} d="M4 9V4h5 M20 15v5h-5 M9 4 4 9 M15 20l5-5 M14 4h6v6 M4 14v6h6" />
          <TbIcon tip="Version history" onClick={openHistory} d="M12 7v5l3 2 M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button className="s-btn s-btn-line max-lg:hidden" onClick={() => { setPaletteQ(""); setPaletteIdx(0); setPaletteOpen(true); }}>
            <span className="s-kbd">⌘K</span>
          </button>
          <button className="s-btn s-btn-line text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20 max-sm:hidden flex items-center gap-1" onClick={() => setAnimOpen(true)}>
            <span>✨</span> Animate
          </button>
          <TbIcon tip="Keyboard shortcuts · ?" onClick={() => setShortcutsOpen(true)}>?</TbIcon>
          <button className="s-btn s-btn-line" onClick={openPreview}>Preview</button>
          <button
            className="s-btn s-btn-line !text-cyan-300 !border-cyan-500/40 hover:!bg-cyan-500/15 flex items-center gap-1.5"
            onClick={() => setShareOpen(true)}
            title="Share design link, mobile QR preview, or AirDrop"
          >
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share
          </button>
          {isAuthor ? (
            <button className="s-btn s-btn-acc" onClick={publish}>Publish</button>
          ) : (
            <button className="s-btn s-btn-acc" onClick={openExport}>Download</button>
          )}
          <button className="s-btn" onClick={() => {
            const d = designRef.current;
            if (d && navigator.onLine) void persistNow(d.id);
            navigate(isAuthor || isDesignerMode ? "/admin" : "/client");
          }} aria-label="Exit editor">Exit</button>
        </div>
      </div>

      {/* Studio Designer Mode HUD */}
      {isDesignerMode && (
        <div className="bg-amber-950/90 border-b border-amber-500/40 px-3.5 py-2 flex flex-wrap items-center justify-between gap-3 text-amber-200 text-xs shrink-0 z-30 shadow-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="bg-amber-500 text-black font-meta text-[8.5px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 shadow-sm">
              🛠️ DESIGNER MODE
            </span>
            <span className="font-meta text-[11px] truncate text-white">
              Client: <strong className="text-amber-300">{clientParam || design?.email || "Guest Client"}</strong>
            </span>
            {(orderIdParam || design?.orderId) && (
              <span className="font-meta text-[10px] text-amber-300/80 shrink-0">
                · Order <strong className="text-white">#{(orderIdParam || design?.orderId || "").slice(0, 8).toUpperCase()}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleMasterOverride}
              className={`font-meta text-[9.5px] px-2.5 py-1 rounded border transition-colors flex items-center gap-1 ${
                masterOverride
                  ? "bg-amber-500 text-black font-bold border-amber-400"
                  : "bg-black/40 text-amber-300 border-amber-500/40 hover:bg-amber-500/20"
              }`}
              title="Unlock all template layers to edit unconstrained"
            >
              <span>{masterOverride ? "🔓" : "🔒"}</span>
              <span>{masterOverride ? "Master Override ON" : "Unlock All Layers"}</span>
            </button>

            {(orderIdParam || design?.orderId) && (
              <button
                onClick={() => setDeliverModalOpen(true)}
                className="font-meta text-[9.5px] px-3 py-1 bg-amber-400 text-black hover:bg-amber-300 font-bold rounded shadow transition-colors flex items-center gap-1"
                title="Deliver proof to client order vault"
              >
                <span>🚀</span> Deliver Proof to Order
              </button>
            )}

            <button
              onClick={() => navigate("/admin")}
              className="font-meta text-[9.5px] text-amber-400/80 hover:text-white px-2 py-0.5 underline transition-colors"
            >
              Back to Admin
            </button>
          </div>
        </div>
      )}

      {offline && (
        <div className="px-4 py-1.5 font-meta text-[9.5px] text-center shrink-0 tracking-wider"
          style={{ background: "color-mix(in oklab, var(--dept) 14%, transparent)", color: "var(--dept)" }} role="alert">
          You're offline — changes are stored locally and will sync when your connection returns.
        </div>
      )}

      <div className="flex grow min-h-0">
        {/* left rail + panel */}
        <div className="flex shrink-0 border-r border-[var(--s-line)] s-panel max-md:absolute max-md:z-20 max-md:h-full">
          <div className="w-[54px] flex flex-col py-1 gap-0.5 border-r border-[var(--s-line)] overflow-y-auto s-scroll">
            {RAIL.filter((r) => r.id !== "fields" || isAuthor).map((t) => (
              <button key={t.id} role="tab" aria-selected={leftTab === t.id} aria-label={t.tip}
                className={"s-rail-btn" + (leftTab === t.id ? " s-rail-on" : "")}
                onClick={() => setLeftTab(leftTab === t.id ? null : t.id)}>
                <RailIcon d={t.d} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {leftTab && (
            <div className={(leftTab === "layers" ? "w-80" : "w-72") + " flex flex-col min-h-0 s-fade"}>
              <div className="flex items-center justify-between px-3 h-10 border-b border-[var(--s-line)] shrink-0">
                <span className="font-meta text-[9px] tracking-[0.14em] text-[var(--s-muted)] uppercase">{RAIL.find((r) => r.id === leftTab)?.tip}</span>
                <button className="s-icon-btn !w-6 !h-6" onClick={() => setLeftTab(null)} aria-label="Close panel">✕</button>
              </div>
              <div className="grow overflow-y-auto s-scroll p-2.5 flex flex-col gap-1.5">

                {leftTab === "pages" && (
                  <>
                    {pages.map((p, i) => (
                      <div key={p.id} className={"s-layer" + (p.id === activePage ? " s-layer-active" : "")}>
                        {renameId === p.id ? (
                          <input autoFocus className="s-input !py-1 !text-[11.5px]" defaultValue={p.name} aria-label="Page name"
                            onBlur={(e) => renamePage(p.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") renamePage(p.id, (e.target as HTMLInputElement).value);
                              if (e.key === "Escape") setRenameId(null);
                            }} />
                        ) : (
                          <button className="grow text-left truncate" title="Open page · double-click to rename"
                            onClick={() => void switchPage(p.id)} onDoubleClick={() => setRenameId(p.id)}>
                            {i + 1}. {p.name}
                          </button>
                        )}
                        <button className="s-icon-btn !w-6 !h-6 text-[12px]" title="Duplicate page" onClick={() => void duplicatePage(p.id)}>⧉</button>
                        <button className="s-icon-btn !w-6 !h-6 text-[12px]" title="Delete page" onClick={() => void deletePage(p.id)}>✕</button>
                      </div>
                    ))}
                    <button className="s-list-btn justify-center mt-1" onClick={() => void addPage()}>+ New page</button>
                    <p className="font-meta text-[9px] text-[var(--s-muted)] mt-1">Double-click to rename. PDF export includes every page.</p>
                  </>
                )}

                {leftTab === "templates" && (
                  <>
                    <p className="s-label">Same collection</p>
                    {templates.filter((x) => x.slug !== slug && x.category === tpl.category).slice(0, 6).map((x) => (
                      <button key={x.slug} className="s-list-btn justify-between" onClick={() => setSwapFor(x)}>
                        <span className="truncate">{x.name}</span>
                        <span className="font-meta text-[9px] text-[var(--s-muted)] shrink-0">SWAP →</span>
                      </button>
                    ))}
                    <Link to="/templates" className="s-list-btn justify-center font-meta text-[10px] uppercase tracking-wider">Browse the marketplace</Link>
                    <p className="font-meta text-[9px] text-[var(--s-muted)] mt-1">Swapping opens the other template — this design stays saved.</p>
                  </>
                )}

                {leftTab === "text" && (
                  <>
                    <p className="s-label">Add text</p>
                    {(["heading", "subheading", "paragraph", "label", "price", "date"] as const).map((p) => (
                      <button key={p} className="s-list-btn" onClick={() => addText(p)}>+ {p[0].toUpperCase() + p.slice(1)}</button>
                    ))}
                    <p className="s-label mt-3">Styles — select a text layer first</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TEXT_STYLES.map((s) => (
                        <button key={s.id} className="s-list-btn flex-col !items-start gap-1" disabled={sel.kind !== "text"}
                          onClick={() => void applyTextStyle(s.id)}>
                          <span className="text-[16px] leading-none"
                            style={s.preview ?? { fontWeight: 800 }}>
                            Ag
                          </span>
                          <span className="font-meta text-[9px] text-[var(--s-muted)]">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {leftTab === "uploads" && (
                  <>
                    <label
                      className={"s-dropzone flex flex-col items-center justify-center gap-2 py-8 cursor-pointer text-center transition-all " +
                        (uploadDragActive ? "!border-cyan-400 !bg-cyan-950/30 scale-[1.01]" : "")}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setUploadDragActive(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setUploadDragActive(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setUploadDragActive(false);
                        const files = [...(e.dataTransfer.files ?? [])];
                        files.forEach((f) => void uploadImage(f));
                      }}
                    >
                      <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="text-[var(--s-muted)]">
                        <path d="M12 16V6 M8 10l4-4 4 4 M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
                      </svg>
                      <span className="text-[12.5px]">Drag &amp; drop files here</span>
                      <span className="font-meta text-[9px] text-[var(--s-muted)]">or</span>
                      <span className="s-btn s-btn-line">Upload files</span>
                      <input type="file" multiple accept="image/jpeg,image/png,image/webp,.psd,.psb" className="sr-only"
                        onChange={(e) => {
                          const files = [...(e.target.files ?? [])];
                          files.forEach((f) => void uploadImage(f));
                          e.target.value = "";
                        }} />
                    </label>
                    <p className="font-meta text-[9px] text-[var(--s-muted)]">JPG / PNG / WebP / PSD, max 200MB. Drag files directly onto the canvas.</p>

                    {/* Uploaded Images Gallery */}
                    {userUploads.length > 0 && (
                      <div className="border-t border-[var(--s-line)] pt-2.5 mt-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="s-label">Your Uploads ({userUploads.length})</span>
                          <button
                            className="text-[9px] text-zinc-500 hover:text-rose-400"
                            onClick={() => { setUserUploads([]); localStorage.removeItem("sk-user-uploads"); }}
                          >
                            Clear
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto s-scroll pr-0.5">
                          {userUploads.map((up) => (
                            <div
                              key={up.id}
                              className="border border-white/10 rounded-lg overflow-hidden aspect-square relative group cursor-grab active:cursor-grabbing hover:border-cyan-500/50 bg-black/40"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("application/json", JSON.stringify({ type: "image", url: up.url, name: up.name }));
                                e.dataTransfer.setData("text/uri-list", up.url);
                                e.dataTransfer.setData("text/plain", up.url);
                              }}
                              onClick={() => void addImageFromUrl(up.url, up.name)}
                              title={`${up.name} — Click or drag to canvas`}
                            >
                              <img src={up.url} alt={up.name} className="w-full h-full object-cover pointer-events-none" />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] text-white font-semibold">
                                + Insert
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Free Stock Photos */}
                    <div className="border-t border-[var(--s-line)] pt-3 mt-2">
                      <p className="s-label">Free stock photos</p>
                      <div className="flex gap-1.5">
                        <input className="s-input" placeholder="Search photos…" value={stockQ}
                          aria-label="Search stock photos"
                          onChange={(e) => setStockQ(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") void searchStock(); }} />
                        <button className="s-btn s-btn-line shrink-0" disabled={stockBusy} onClick={() => void searchStock()}>
                          {stockBusy ? "…" : "Search"}
                        </button>
                      </div>
                      {stockHits.length > 0 && (
                        <div className="grid grid-cols-3 gap-1.5 mt-2 max-h-56 overflow-y-auto s-scroll pr-0.5">
                          {stockHits.map((hit) => (
                            <div
                              key={hit.id}
                              className="border border-[var(--s-line)] rounded-md overflow-hidden aspect-square relative group cursor-grab active:cursor-grabbing hover:border-amber-500/50"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("application/json", JSON.stringify({ type: "image", url: hit.url, name: hit.title }));
                                e.dataTransfer.setData("text/uri-list", hit.url);
                                e.dataTransfer.setData("text/plain", hit.url);
                              }}
                              title={`${hit.title} — ${hit.creator} (Drag or click to canvas)`}
                              onClick={() => void insertStock(hit)}
                            >
                              <img src={hit.thumb} alt={hit.title} loading="lazy" className="w-full h-full object-cover pointer-events-none" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] text-white font-medium">
                                + Add
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="font-meta text-[9px] text-[var(--s-muted)] mt-1.5">Commercially licensed (CC) via Openverse — drag or click to place.</p>
                    </div>
                  </>
                )}

                {leftTab === "elements" && (
                  <>
                    <input className="s-input !py-2" placeholder="Search graphics, badges, stickers…" value={elemQ}
                      onChange={(e) => setElemQ(e.target.value)} aria-label="Search elements" />

                    {/* Curated Graphics & Stickers */}
                    {(() => {
                      const matched = GRAPHICS_LIBRARY.filter((g) =>
                        !elemQ || g.name.toLowerCase().includes(elemQ.toLowerCase()) || g.tags.some((t) => t.toLowerCase().includes(elemQ.toLowerCase()))
                      );
                      if (!matched.length) return null;
                      return (
                        <div className="flex flex-col gap-2">
                          <p className="s-label mt-1">Graphics & Stickers</p>
                          <div className="grid grid-cols-2 gap-2">
                            {matched.map((item) => (
                              <button
                                key={item.id}
                                className="s-list-btn flex-col !items-center gap-1.5 !p-2 bg-black/40 hover:bg-white/10 border border-white/5 rounded-lg cursor-grab active:cursor-grabbing"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("application/json", JSON.stringify({ type: "graphic", svg: item.svg, name: item.name }));
                                }}
                                title={`${item.name} — Click or drag to canvas`}
                                onClick={() => insertGraphic(item)}
                              >
                                <div className="w-14 h-14 flex items-center justify-center pointer-events-none"
                                  dangerouslySetInnerHTML={{ __html: item.svg }} />
                                <span className="font-meta text-[8.5px] text-zinc-300 font-medium truncate w-full text-center">{item.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Standard Shapes */}
                    {(["Shapes", "Lines", "Arrows", "Badges"] as const).map((cat) => {
                      const list = ELEMENTS.filter((el) => el.category === cat && el.name.toLowerCase().includes(elemQ.toLowerCase()));
                      if (!list.length) return null;
                      return (
                        <div key={cat}>
                          <p className="s-label mt-2">{cat}</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {list.map((el) => (
                              <button key={el.kind} className="s-list-btn flex-col !items-center gap-1.5 !py-2.5" title={el.name}
                                onClick={() => addElement(el.kind)}>
                                <Glyph kind={el.kind} />
                                <span className="font-meta text-[7.5px] text-[var(--s-muted)] uppercase tracking-wide">{el.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {!elemQ && (
                      <div className="border-t border-[var(--s-line)] pt-3 mt-2 flex flex-col gap-3">
                        <div>
                          <p className="s-label">QR Code</p>
                          <input className="s-input" placeholder="Paste link or text…" value={qrUrl}
                            aria-label="QR code content"
                            onChange={(e) => setQrUrl(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void insertQr(); }} />
                          <button className="s-list-btn justify-center mt-1.5" disabled={qrBusy}
                            onClick={() => void insertQr()}>
                            {qrBusy ? "Generating…" : "Insert QR code"}
                          </button>
                        </div>

                        <div>
                          <p className="s-label">Barcode Generator</p>
                          <input className="s-input" placeholder="Enter barcode (Code 128 / UPC)…" value={barcodeVal}
                            aria-label="Barcode content"
                            onChange={(e) => setBarcodeVal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") insertBarcode(barcodeVal); }} />
                          <button className="s-list-btn justify-center mt-1.5" disabled={!barcodeVal.trim()}
                            onClick={() => insertBarcode(barcodeVal)}>
                            Insert Barcode
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {leftTab === "frames" && (
                  <>
                    <p className="s-label">Photo Frames & Mockups</p>
                    <p className="font-meta text-[9px] text-[var(--s-muted)] mb-2">
                      Click to insert a frame container onto the canvas. Replace image anytime.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {FRAME_TEMPLATES.map((fr) => (
                        <button key={fr.id} className="s-list-btn flex-col !items-center gap-1.5 !p-2 bg-black/40 hover:bg-white/10 border border-white/5 rounded-lg"
                          title={fr.name} onClick={() => insertFrame(fr)}>
                          <div className="w-16 h-20 flex items-center justify-center pointer-events-none"
                            dangerouslySetInnerHTML={{ __html: fr.previewSvg }} />
                          <span className="font-meta text-[8.5px] text-zinc-300 font-medium truncate w-full text-center">{fr.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {leftTab === "mockups" && (
                  <>
                    <p className="s-label">3D Smart Mockups</p>
                    <p className="font-meta text-[9px] text-[var(--s-muted)] mb-2">
                      Preview and export your design on realistic 3D templates in 1 click.
                    </p>
                    <div className="flex flex-col gap-2">
                      {MOCKUP_TEMPLATES.map((m) => (
                        <button key={m.id}
                          className={"s-list-btn !p-2.5 flex items-center justify-between border rounded-lg " +
                            (selectedMockup === m.id ? "border-cyan-500/50 bg-cyan-950/40" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.06]")}
                          onClick={() => void preview3DMockup(m.id)}>
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{m.icon}</span>
                            <div className="text-left">
                              <p className="text-[11.5px] font-semibold text-zinc-200">{m.name}</p>
                              <p className="font-meta text-[8.5px] text-[var(--s-muted)] truncate max-w-[140px]">{m.description}</p>
                            </div>
                          </div>
                          <span className="text-xs text-cyan-400 font-bold">
                            {selectedMockup === m.id && mockupBusy ? "Rendering…" : "Preview →"}
                          </span>
                        </button>
                      ))}
                    </div>

                    {mockupPreviewUrl && (
                      <div className="mt-3 p-2 bg-black/60 border border-white/10 rounded-xl flex flex-col gap-2">
                        <img src={mockupPreviewUrl} alt="3D Mockup Preview" className="w-full rounded-lg shadow-lg" />
                        <button className="s-btn s-btn-dept !py-2 !text-[11px] font-bold w-full" onClick={download3DMockup}>
                          📥 Download High-Res Mockup
                        </button>
                      </div>
                    )}
                  </>
                )}

                {leftTab === "bulk" && (
                  <>
                    <p className="s-label">Bulk CSV Data Merge</p>
                    <p className="font-meta text-[9px] text-[var(--s-muted)] mb-2">
                      Upload or edit tabular data to generate batches of personalized flyers.
                    </p>

                    <label className="s-label text-[10px]">Spreadsheet Data (CSV)</label>
                    <textarea className="s-input !py-1.5 !px-2 !text-[11px] font-mono min-h-[90px] resize-y"
                      value={csvText}
                      onChange={(e) => {
                        setCsvText(e.target.value);
                        setCsvDataset(parseCsvText(e.target.value));
                      }} />

                    {csvDataset.headers.length > 0 && (
                      <div className="flex flex-col gap-1.5 mt-2">
                        <p className="s-label text-[10px]">Map Columns to Text Layers</p>
                        {csvDataset.headers.map((h) => (
                          <div key={h} className="flex items-center gap-1.5 text-[11px]">
                            <span className="w-20 font-bold truncate text-cyan-300">{h}:</span>
                            <select className="s-input grow !py-1 !text-[10.5px]"
                              value={csvMapping[h] ?? ""}
                              onChange={(e) => setCsvMapping({ ...csvMapping, [h]: e.target.value })}>
                              <option value="">(Select text layer…)</option>
                              {layers.filter((l) => isText(l) || (l as unknown as EditorObject).kLayerType === "text").map((l, li) => {
                                const e = l as unknown as EditorObject;
                                const val = e.kPlaceholder || e.kName || e.kId || String(li);
                                return <option key={val} value={val}>{e.kName || (l as unknown as Textbox).text || "Text"}</option>;
                              })}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}

                    <button className="s-btn s-btn-dept !py-2.5 !text-[11px] font-bold w-full mt-3 shadow-lg"
                      disabled={bulkBusy || !csvDataset.rows.length}
                      onClick={() => void runBatchMerge()}>
                      {bulkBusy ? "Generating batch…" : `⚡ Generate ${csvDataset.rows.length} Batch Flyers`}
                    </button>
                  </>
                )}

                {leftTab === "draw" && (
                  <>
                    <Toggle label="Brush mode" on={drawing} onChange={setDrawingMode} />
                    <div className="mt-1">
                      <Toggle label="Eraser — drag over strokes" on={erasing} onChange={setEraserMode} />
                    </div>
                    <div className="mt-2">
                      <ColorField label="Brush color" value={brushColor} onChange={setBrushColor} docColors={docColors} />
                    </div>
                    <div className="mt-2">
                      <span className="s-label">Brush size — {brushSize}px</span>
                      <input type="range" min={1} max={80} value={brushSize} aria-label="Brush size"
                        className="w-full accent-[var(--dept)]"
                        onChange={(e) => setBrushSize(Number(e.target.value))} />
                    </div>
                    <div>
                      <span className="s-label">Smoothing — {brushSmooth === 0 ? "off" : brushSmooth}</span>
                      <input type="range" min={0} max={40} value={brushSmooth} aria-label="Brush smoothing"
                        className="w-full accent-[var(--dept)]"
                        onChange={(e) => setBrushSmooth(Number(e.target.value))} />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="font-meta text-[9px] text-[var(--s-muted)]">TIP</span>
                      <p className="text-[11.5px] text-[var(--s-muted)]">Draw freehand on the canvas. Turn brush mode off to select and move objects again. The eraser only removes drawn strokes, never template elements.</p>
                    </div>
                    <div className="s-dropzone mt-1 py-3 grid place-items-center pointer-events-none">
                      <span className="rounded-full border border-[var(--s-line2)]" style={{ width: Math.min(40, brushSize), height: Math.min(40, brushSize), background: brushColor }} />
                    </div>
                  </>
                )}

                {leftTab === "background" && (
                  <>
                    {(() => {
                      const bg = fc.current?.getObjects().find((o) => (o as unknown as EditorObject).kId === "background");
                      const canEdit = isAuthor || (bg && (bg as unknown as EditorObject).kStyleEditable !== false && (bg as unknown as EditorObject).kLocked !== true);
                      if (!bg || !canEdit) return <p className="text-[12px] text-[var(--s-muted)]">Locked by the template.</p>;
                      const setBg = (fill: unknown) => { bg.set("fill", fill as string); fc.current?.renderAll(); pushHistory(); };
                      return (
                        <>
                          <ColorField label="Background color" docColors={docColors}
                            value={normalizeHex(bg.fill) ?? "#1a1a1a"}
                            onChange={(hex) => setBg(hex)} />
                          <p className="s-label mt-2">Gradient background</p>
                          <GradientEditor fill={bg.fill}
                            applyLabel="Apply custom gradient"
                            onApply={(a, b, dir) => setBg(makeGradient(canvasSize.width, canvasSize.height, a, b, dir))}
                            onSolid={(hex) => setBg(hex)} />
                        </>
                      );
                    })()}
                    <div className="border-t border-[var(--s-line)] pt-3 mt-2">
                      <p className="s-label">Replace a color everywhere</p>
                      {docColors.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {docColors.map((c) => (
                            <button key={c} className="s-swatch" aria-label={`Replace ${c}`}
                              style={{ background: c, outline: swapFrom === c ? "2px solid var(--dept)" : "none", outlineOffset: 2 }}
                              onClick={() => setSwapFrom(c)} />
                          ))}
                        </div>
                      )}
                      <ColorField label="New color" value={swapTo} onChange={setSwapTo} />
                      <button className="s-list-btn justify-center mt-2" disabled={!swapFrom}
                        onClick={() => { replaceColorGlobally(swapFrom, normalizeHex(swapTo) ?? swapTo); setSwapFrom(""); }}>
                        Apply across design
                      </button>
                    </div>
                    <div className="border-t border-[var(--s-line)] pt-3 mt-2">
                      <p className="s-label">Brand kit</p>
                      {brandPalette.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {brandPalette.map((c) => (
                            <button key={c} className="s-swatch" style={{ background: c }} aria-label={`Brand color ${c}`}
                              title="Click to fill the selected element"
                              onClick={() => { if (sel.obj && sel.kind !== "multi") setProp({ fill: c }); else toast.error("Select an element first."); }} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11.5px] text-[var(--s-muted)] mb-2">No brand palette yet.</p>
                      )}
                      <button className="s-list-btn justify-center" onClick={saveBrandPalette}>
                        Save this design's colors as brand palette
                      </button>
                      <p className="s-label mt-3">Brand logos</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {brandLogos.map((l, i) => (
                          <div key={i} className="relative group">
                            <button className="border border-[var(--s-line)] rounded-md overflow-hidden w-full aspect-square grid place-items-center bg-white/5"
                              title="Insert into design"
                              onClick={() => void insertBrandLogo(l)}>
                              <img src={l} alt={`Brand logo ${i + 1}`} className="max-w-full max-h-full object-contain" />
                            </button>
                            <button className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--s-danger)] text-white text-[9px] leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label="Remove logo" onClick={() => removeBrandLogo(i)}>✕</button>
                          </div>
                        ))}
                        <label className="border border-dashed border-[var(--s-line2)] rounded-md aspect-square grid place-items-center cursor-pointer text-[var(--s-muted)] text-lg"
                          title="Upload a logo">
                          +
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) void addBrandLogo(f); e.target.value = ""; }} />
                        </label>
                      </div>
                      <p className="font-meta text-[9px] text-[var(--s-muted)] mt-2">Saved on this device — available in every design you open.</p>
                    </div>
                  </>
                )}

                {leftTab === "layers" && (
                  <>
                    {/* Photoshop-style: add new text, shape, image, or layer folder */}
                    <div className="grid grid-cols-4 gap-1 mb-1">
                      <button className="s-btn s-btn-line !px-0 !text-[11px]" onClick={() => addText("paragraph")}>+ Text</button>
                      <button className="s-btn s-btn-line !px-0 !text-[11px]" onClick={() => addElement("rect")}>+ Shape</button>
                      <label className="s-btn s-btn-line !px-0 !text-[11px] text-center cursor-pointer">
                        + Image
                        <input type="file" accept="image/jpeg,image/png,image/webp,.psd,.psb" className="sr-only"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.target.value = ""; }} />
                      </label>
                      <button
                        className="s-btn s-btn-line !px-0 !text-[11px] !text-amber-300 hover:!bg-amber-500/15"
                        title="Create layer folder / Group selected (⌘G)"
                        onClick={() => createFolder()}
                      >
                        + Folder
                      </button>
                    </div>
                    <p className="font-meta text-[9px] text-[var(--s-muted)] mb-1">Drag rows to restack · drop on folder to group · ⌘G</p>
                    {!layers.length && <p className="text-[12px] text-[var(--s-muted)] text-center py-6">Your design layers will appear here.</p>}

                    {(() => {
                      // Collect all active folders
                      const activeFolders = Array.from(new Set([
                        ...folders,
                        ...layers.map((o) => (o as unknown as EditorObject).kFolder).filter(Boolean) as string[],
                      ]));

                      const renderLayerRow = (o: FabricObject, li: number, insideFolder?: string) => {
                        const e = o as unknown as EditorObject;
                        const active = fc.current?.getActiveObjects().includes(o);
                        const lid = e.kId ?? String(li);
                        const isTxt = isText(o) || Boolean(e.kIsPsdText || e.kLayerType === "text");
                        const isImg = isImage(o) && !e.kIsPsdText;
                        const isGrp = isGroup(o) || Boolean(e.kGroup && !e.kFolder);
                        const imgSrc = (o as unknown as { src?: string }).src;
                        const liveText = (isTxt && ((o as unknown as Textbox).text || e.kPsdText))
                          ? String((o as unknown as Textbox).text || e.kPsdText).trim()
                          : "";
                        const hasCustomName = e.kName && !["textbox", "text", "image", "fabricimage", "rect", "circle", "group", "shape"].includes(e.kName.toLowerCase());
                        const displayName = hasCustomName
                          ? e.kName!
                          : (liveText || e.kName || (isTxt ? "Text Layer" : isImg ? "Image Layer" : isGrp ? "Layer Group" : (o.type ?? "Layer")));

                        return (
                          <div
                            key={lid}
                            className={"s-layer !py-1.5 !px-2 flex items-center gap-2 rounded-lg border transition-all " +
                              (active ? "s-layer-active border-cyan-500/50 bg-cyan-950/30 shadow-sm" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]")}
                            draggable
                            onDragStart={() => { dragLayerId.current = lid; }}
                            onDragOver={(ev) => ev.preventDefault()}
                            onDrop={(ev) => {
                              ev.preventDefault();
                              if (dragLayerId.current) {
                                moveLayerToRow(dragLayerId.current, lid);
                                if (insideFolder) moveLayerToFolder(dragLayerId.current, insideFolder);
                              }
                              dragLayerId.current = null;
                            }}
                            style={{ cursor: "grab" }}
                          >
                            <span className="text-[var(--s-muted)] text-[11px] shrink-0 select-none opacity-60 hover:opacity-100" aria-hidden>⠿</span>

                            {/* Mini Thumbnail / Type Glyphs */}
                            <div className="shrink-0 flex items-center">
                              {isImg && imgSrc ? (
                                <div className="w-6 h-6 rounded overflow-hidden bg-black/60 border border-purple-500/40 flex items-center justify-center">
                                  <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                                </div>
                              ) : isTxt ? (
                                <div className="w-6 h-6 rounded bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 flex items-center justify-center font-bold text-[11px]">
                                  T
                                </div>
                              ) : isGrp ? (
                                <div className="w-6 h-6 rounded bg-amber-950/80 border border-amber-500/50 text-amber-300 flex items-center justify-center font-bold text-[11px]">
                                  📁
                                </div>
                              ) : (
                                <div className="w-6 h-6 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 flex items-center justify-center font-bold text-[11px]">
                                  ❖
                                </div>
                              )}
                            </div>

                            {/* Layer Name / Text Content */}
                            {renameId === lid ? (
                              <input
                                autoFocus
                                className="s-input !py-0.5 !text-[11.5px] grow"
                                defaultValue={displayName}
                                aria-label="Layer name"
                                onBlur={(ev) => { o.set({ kName: ev.target.value } as Partial<FabricObject>); setRenameId(null); refreshLayers(); scheduleAutosave(); }}
                                onKeyDown={(ev) => {
                                  if (ev.key === "Enter") { o.set({ kName: (ev.target as HTMLInputElement).value } as Partial<FabricObject>); setRenameId(null); refreshLayers(); scheduleAutosave(); }
                                  if (ev.key === "Escape") setRenameId(null);
                                }}
                              />
                            ) : (
                              <button
                                className="grow min-w-0 text-left truncate py-0.5"
                                title={`${displayName} — Click to select, Shift/⌘-click for multiple layers, double-click to edit`}
                                onClick={(ev) => selectLayer(o, ev)}
                                onDoubleClick={() => {
                                  if (e.kIsPsdText) {
                                    convertPsdTextToLiveTextbox(o);
                                  } else if (isText(o)) {
                                    selectLayer(o);
                                    const c = fc.current;
                                    if (c) {
                                      c.setActiveObject(o);
                                      c.renderAll();
                                      const tb = o as unknown as Textbox;
                                      try {
                                        tb.enterEditing();
                                        if (tb.hiddenTextarea) {
                                          tb.hiddenTextarea.focus();
                                          tb.hiddenTextarea.select();
                                        }
                                        tb.selectAll();
                                        c.renderAll();
                                      } catch (err) {
                                        console.warn("enterEditing err:", err);
                                      }
                                    }
                                  } else {
                                    setRenameId(lid);
                                  }
                                }}
                              >
                                <span className="truncate text-[12px] font-medium text-zinc-100 block">
                                  {e.kLocked ? "🔒 " : ""}{displayName}
                                </span>
                              </button>
                            )}

                            {/* Action Buttons: Edit, Visibility, Lock */}
                            <div className="flex items-center gap-0.5 shrink-0">
                              {isTxt && (
                                <button
                                  className="s-icon-btn !w-6 !h-6 text-[10px] text-cyan-300 hover:bg-cyan-500/20"
                                  title="Edit Text (Live)"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    selectLayer(o);
                                    if (e.kIsPsdText) {
                                      convertPsdTextToLiveTextbox(o);
                                    } else if (isText(o)) {
                                      const c = fc.current;
                                      if (c) {
                                        c.setActiveObject(o);
                                        c.renderAll();
                                        const tb = o as unknown as Textbox;
                                        try {
                                          tb.enterEditing();
                                          if (tb.hiddenTextarea) {
                                            tb.hiddenTextarea.focus();
                                            tb.hiddenTextarea.select();
                                          }
                                          tb.selectAll();
                                          c.renderAll();
                                        } catch (err) {
                                          console.warn("enterEditing err:", err);
                                        }
                                      }
                                    }
                                  }}
                                >
                                  ✏️
                                </button>
                              )}

                              {insideFolder && (
                                <button
                                  className="s-icon-btn !w-6 !h-6 text-[10px] text-zinc-400 hover:text-amber-300"
                                  title="Remove from folder"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    moveLayerToFolder(lid, null);
                                  }}
                                >
                                  ↩
                                </button>
                              )}

                              <button
                                className="s-icon-btn !w-6 !h-6 text-[11px]"
                                title={o.visible === false ? "Show layer" : "Hide layer"}
                                onClick={() => { o.visible = !o.visible; fc.current?.renderAll(); pushHistory(); }}
                              >
                                {o.visible === false ? "◌" : "◉"}
                              </button>

                              <button
                                className={"s-icon-btn !w-6 !h-6" + ((e.kUserLock || e.kLocked) ? " !text-[var(--dept)]" : "")}
                                title={e.kUserLock ? "Unlock (your lock)"
                                  : e.kLocked ? (isAuthor || isAdmin ? "Locked by template — click to unlock" : "Locked by template")
                                  : "Lock"}
                                onClick={() => toggleAnyLock(o)}
                              >
                                <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                  {(e.kUserLock || e.kLocked) ? <path d="M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v9H5z" /> : <path d="M7 11V7a5 5 0 0 1 9.9-1 M5 11h14v9H5z" />}
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      };

                      return (
                        <div className="flex flex-col gap-1.5">
                          {/* Render Folders */}
                          {activeFolders.map((fName) => {
                            const fLayers = layers.filter((o) => (o as unknown as EditorObject).kFolder === fName);
                            const isCollapsed = collapsedFolders[fName];
                            const allVisible = fLayers.length > 0 && fLayers.every((o) => o.visible !== false);
                            const allLocked = fLayers.length > 0 && fLayers.every((o) => (o as unknown as EditorObject).kUserLock || (o as unknown as EditorObject).kLocked);

                            return (
                              <div
                                key={`folder-${fName}`}
                                className="border border-amber-500/25 bg-amber-950/15 rounded-xl p-1.5 transition-all"
                                onDragOver={(ev) => ev.preventDefault()}
                                onDrop={(ev) => {
                                  ev.preventDefault();
                                  if (dragLayerId.current) {
                                    moveLayerToFolder(dragLayerId.current, fName);
                                    dragLayerId.current = null;
                                  }
                                }}
                              >
                                {/* Folder Header */}
                                <div className="flex items-center gap-1.5 py-1 px-1.5 rounded-lg hover:bg-white/5 transition-colors">
                                  {/* Expand / Collapse Chevron */}
                                  <button
                                    className="w-5 h-5 flex items-center justify-center font-mono text-[11px] text-amber-400 hover:text-white"
                                    onClick={() => toggleFolderCollapse(fName)}
                                    title={isCollapsed ? "Expand folder" : "Collapse folder"}
                                  >
                                    {isCollapsed ? "▸" : "▾"}
                                  </button>

                                  {/* Folder Icon */}
                                  <span className="text-[13px] select-none">📁</span>

                                  {/* Folder Name (Double-click to rename, click to select all) */}
                                  {folderRename === fName ? (
                                    <input
                                      autoFocus
                                      className="s-input !py-0.5 !text-[11.5px] grow font-semibold text-amber-200"
                                      defaultValue={fName}
                                      onBlur={(ev) => renameFolder(fName, ev.target.value)}
                                      onKeyDown={(ev) => {
                                        if (ev.key === "Enter") renameFolder(fName, (ev.target as HTMLInputElement).value);
                                        if (ev.key === "Escape") setFolderRename(null);
                                      }}
                                    />
                                  ) : (
                                    <button
                                      className="grow min-w-0 text-left truncate flex items-center gap-1.5"
                                      title={`${fName} (${fLayers.length} layers) — Click to select all, double-click to rename`}
                                      onClick={() => selectFolder(fName)}
                                      onDoubleClick={() => setFolderRename(fName)}
                                    >
                                      <span className="truncate text-[12px] font-semibold text-amber-200">
                                        {fName}
                                      </span>
                                      <span className="font-mono text-[9px] text-amber-400/70 bg-amber-500/20 rounded px-1">
                                        {fLayers.length}
                                      </span>
                                    </button>
                                  )}

                                  {/* Folder Actions */}
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      className="s-icon-btn !w-6 !h-6 text-[11px] text-amber-400 hover:text-white"
                                      title={allVisible ? "Hide all layers in folder" : "Show all layers in folder"}
                                      onClick={(ev) => { ev.stopPropagation(); toggleFolderVisibility(fName); }}
                                    >
                                      {allVisible ? "◉" : "◌"}
                                    </button>

                                    <button
                                      className={"s-icon-btn !w-6 !h-6 text-amber-400 hover:text-white" + (allLocked ? " !text-[var(--dept)]" : "")}
                                      title={allLocked ? "Unlock all layers in folder" : "Lock all layers in folder"}
                                      onClick={(ev) => { ev.stopPropagation(); toggleFolderLock(fName); }}
                                    >
                                      <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                                        {allLocked ? <path d="M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v9H5z" /> : <path d="M7 11V7a5 5 0 0 1 9.9-1 M5 11h14v9H5z" />}
                                      </svg>
                                    </button>

                                    <button
                                      className="s-icon-btn !w-6 !h-6 text-[10px] text-zinc-500 hover:text-rose-400"
                                      title="Ungroup Folder (Shift+Click to delete folder & layers)"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        if (ev.shiftKey) deleteFolderWithLayers(fName);
                                        else ungroupFolder(fName);
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>

                                {/* Folder Child Layers (when expanded) */}
                                {!isCollapsed && (
                                  <div className="ml-3 pl-2 border-l border-amber-500/25 flex flex-col gap-1 mt-1 mb-0.5">
                                    {!fLayers.length && (
                                      <p className="text-[10px] text-zinc-500 py-1.5 italic">Empty folder — drag layers here</p>
                                    )}
                                    {fLayers.map((o, li) => renderLayerRow(o, li, fName))}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Root Layers (Layers not inside any folder) */}
                          {layers
                            .filter((o) => !(o as unknown as EditorObject).kFolder)
                            .map((o, li) => renderLayerRow(o, li))}
                        </div>
                      );
                    })()}
                  </>
                )}

                {leftTab === "fields" && isAuthor && (
                  <>
                    <p className="s-label">Template fields</p>
                    {fields.map((f, i) => (
                      <div key={i} className="border border-[var(--s-line)] rounded-lg p-2 flex flex-col gap-1.5">
                        <input className="s-input" value={f.label} placeholder="Label" aria-label="Field label"
                          onChange={(e) => setFields(fields.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x))} />
                        <div className="flex gap-1.5">
                          <input className="s-input" value={f.fieldId} placeholder="field_id" aria-label="Field ID"
                            onChange={(e) => setFields(fields.map((x, xi) => xi === i ? { ...x, fieldId: e.target.value } : x))} />
                          <select className="s-input" value={f.type} aria-label="Field type"
                            onChange={(e) => setFields(fields.map((x, xi) => xi === i ? { ...x, type: e.target.value as Kon10Field["type"] } : x))}>
                            <option value="text">text</option><option value="image">image</option>
                          </select>
                        </div>
                        <div className="flex gap-1.5 items-center">
                          <input className="s-input" type="number" value={f.maxLength ?? ""} placeholder="Max chars" aria-label="Max characters"
                            onChange={(e) => setFields(fields.map((x, xi) => xi === i ? { ...x, maxLength: Number(e.target.value) || undefined } : x))} />
                          <label className="font-meta text-[9px] flex items-center gap-1 shrink-0">
                            <input type="checkbox" className="accent-[var(--dept)]" checked={f.required}
                              onChange={(e) => setFields(fields.map((x, xi) => xi === i ? { ...x, required: e.target.checked } : x))} /> Req
                          </label>
                          <button className="s-icon-btn !w-6 !h-6" aria-label="Remove field" onClick={() => setFields(fields.filter((_, xi) => xi !== i))}>✕</button>
                        </div>
                        {selObj && (
                          <button className="s-list-btn justify-center" onClick={() => { selObj.set({ kPlaceholder: f.fieldId } as Partial<FabricObject>); pushHistory(); toast.success(`Selected object linked to "${f.label}".`); }}>
                            Link selected object
                          </button>
                        )}
                      </div>
                    ))}
                    <button className="s-list-btn justify-center" onClick={() => setFields([...fields, { fieldId: `field_${fields.length + 1}`, label: "New Field", type: "text", required: false, maxLength: 40 }])}>
                      + Add field
                    </button>
                    <p className="font-meta text-[9px] text-[var(--s-muted)]">Fields autosave into the template on Publish.</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* canvas stage column */}
        <div className="grow flex flex-col min-w-0 min-h-0 relative overflow-hidden">
          {/* Top horizontal ruler wall (Photoshop-style, pinned to top of viewport) */}
          {showRulers && (() => {
            const xTicks = getOuterRulerTicks(rulerMetrics.originX, rulerMetrics.stageW, canvasSize.width, rulerUnit, zoom);
            const canvasStart = rulerMetrics.originX;
            const canvasEnd = rulerMetrics.originX + canvasSize.width * zoom;
            return (
              <div className="flex shrink-0 h-[22px] bg-[#0c0c0f] border-b border-[var(--s-line)] z-20 select-none">
                {/* Corner 0,0 box (aligned with vertical ruler) */}
                <button
                  className="w-[22px] h-[22px] shrink-0 border-r border-[var(--s-line)] bg-[#101014] flex items-center justify-center font-mono text-[8px] font-bold text-zinc-400 hover:text-cyan-400 hover:bg-white/5 transition-colors cursor-pointer"
                  title={`Ruler Unit: ${rulerUnit.toUpperCase()} — Click to change`}
                  onClick={(e) => { e.stopPropagation(); setUnitDropOpen((o) => !o); }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setRulerMenu({ x: e.clientX, y: e.clientY }); }}
                >
                  {rulerUnit}
                </button>

                {/* Horizontal Ruler Bar */}
                <div
                  className="grow relative overflow-hidden h-[22px] cursor-row-resize"
                  title="Drag down to place horizontal guide · Right-click for units & options"
                  onMouseDown={(e) => startGuideDrag("h", e)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRulerMenu({ x: e.clientX, y: e.clientY });
                  }}
                >
                  <svg className="w-full h-full block" style={{ shapeRendering: "crispEdges" }}>
                    {/* Canvas span highlight */}
                    <rect
                      x={Math.max(0, canvasStart)}
                      y={0}
                      width={Math.max(0, Math.min(canvasEnd, rulerMetrics.stageW) - Math.max(0, canvasStart))}
                      height={22}
                      fill="rgba(255,255,255,0.03)"
                    />
                    {xTicks.ticks.map((t, i) => {
                      const h = t.isMajor ? 9 : t.isSub ? 3 : 5;
                      const strokeColor = t.isMajor
                        ? "rgba(148, 163, 184, 0.75)"
                        : t.isSub
                        ? "rgba(100, 116, 139, 0.35)"
                        : "rgba(100, 116, 139, 0.55)";
                      return (
                        <g key={i}>
                          <line
                            x1={t.screenPos}
                            y1={22 - h}
                            x2={t.screenPos}
                            y2={22}
                            stroke={strokeColor}
                            strokeWidth={1}
                          />
                          {t.isMajor && t.label && (
                            <text
                              x={t.screenPos + 3}
                              y={10}
                              fill="rgba(148, 163, 184, 0.85)"
                              fontSize="7.5"
                              fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                              textAnchor="start"
                            >
                              {t.label}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    {/* Active cursor hairline */}
                    {rulerCursor && (
                      <line
                        x1={rulerCursor.x}
                        y1={0}
                        x2={rulerCursor.x}
                        y2={22}
                        stroke="#06b6d4"
                        strokeWidth={1}
                        opacity={0.8}
                      />
                    )}
                  </svg>
                </div>
              </div>
            );
          })()}

          {/* Main Stage Row (holds Vertical Ruler + Scrollable Stage) */}
          <div className="grow flex min-h-0 min-w-0 relative">
            {/* Left vertical ruler wall (Photoshop-style, pinned to left of viewport) */}
            {showRulers && (() => {
              const yTicks = getOuterRulerTicks(rulerMetrics.originY, rulerMetrics.stageH, canvasSize.height, rulerUnit, zoom);
              const canvasStart = rulerMetrics.originY;
              const canvasEnd = rulerMetrics.originY + canvasSize.height * zoom;
              return (
                <div
                  className="w-[22px] shrink-0 h-full bg-[#0c0c0f] border-r border-[var(--s-line)] z-20 select-none relative overflow-hidden cursor-col-resize"
                  title="Drag right to place vertical guide · Right-click for units & options"
                  onMouseDown={(e) => startGuideDrag("v", e)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRulerMenu({ x: e.clientX, y: e.clientY });
                  }}
                >
                  <svg className="w-full h-full block" style={{ shapeRendering: "crispEdges" }}>
                    {/* Canvas span highlight */}
                    <rect
                      x={0}
                      y={Math.max(0, canvasStart)}
                      width={22}
                      height={Math.max(0, Math.min(canvasEnd, rulerMetrics.stageH) - Math.max(0, canvasStart))}
                      fill="rgba(255,255,255,0.03)"
                    />
                    {yTicks.ticks.map((t, i) => {
                      const w = t.isMajor ? 9 : t.isSub ? 3 : 5;
                      const strokeColor = t.isMajor
                        ? "rgba(148, 163, 184, 0.75)"
                        : t.isSub
                        ? "rgba(100, 116, 139, 0.35)"
                        : "rgba(100, 116, 139, 0.55)";
                      return (
                        <g key={i}>
                          <line
                            x1={22 - w}
                            y1={t.screenPos}
                            x2={22}
                            y2={t.screenPos}
                            stroke={strokeColor}
                            strokeWidth={1}
                          />
                          {t.isMajor && t.label && (
                            <text
                              x={2}
                              y={t.screenPos + 8}
                              fill="rgba(148, 163, 184, 0.85)"
                              fontSize="7"
                              fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                              textAnchor="start"
                            >
                              {t.label}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    {/* Active cursor hairline */}
                    {rulerCursor && (
                      <line
                        x1={0}
                        y1={rulerCursor.y}
                        x2={22}
                        y2={rulerCursor.y}
                        stroke="#06b6d4"
                        strokeWidth={1}
                        opacity={0.8}
                      />
                    )}
                  </svg>
                </div>
              );
            })()}

            {/* Scrollable Canvas Stage Area */}
            <div ref={stageRef} id="kon10-stage"
              className={"grow overflow-auto relative min-w-0 s-scroll" + (dragOver ? " s-stage-drag" : "")}
              style={{ background: "#0a0a0d", backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)", backgroundSize: "22px 22px" }}
              onMouseMove={(e) => {
                const s = stageRef.current;
                if (!s) return;
                const r = s.getBoundingClientRect();
                setRulerCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onMouseLeave={() => setRulerCursor(null)}
              onScroll={updateRulerMetrics}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (!dragOver) setDragOver(true);
              }}
              onDragLeave={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                if (
                  e.clientX <= rect.left ||
                  e.clientX >= rect.right ||
                  e.clientY <= rect.top ||
                  e.clientY >= rect.bottom
                ) {
                  setDragOver(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const pos = (() => {
                  if (!canvasEl.current) return undefined;
                  const rect = canvasEl.current.getBoundingClientRect();
                  const x = (e.clientX - rect.left) / zoom;
                  const y = (e.clientY - rect.top) / zoom;
                  return { x: Math.max(0, Math.min(canvasSize.width, x)), y: Math.max(0, Math.min(canvasSize.height, y)) };
                })();

                // 1. Files dropped from operating system (desktop / Finder)
                const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
                if (files.length > 0) {
                  if (files.length === 1 && sel.kind === "image" && (isAuthor || selObj?.kReplaceable)) {
                    void replaceImage(files[0]);
                  } else {
                    files.forEach((f) => void uploadImage(f, pos));
                  }
                  return;
                }

                // 2. Custom JSON payload dragged from sidebar (Stock photos, Uploads gallery, Graphics)
                try {
                  const rawJson = e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
                  if (rawJson) {
                    const data = JSON.parse(rawJson);
                    if (data.type === "image" && data.url) {
                      void addImageFromUrl(data.url, data.name || "Photo", pos);
                      return;
                    }
                    if (data.type === "graphic" && data.svg) {
                      const item: GraphicItem = GRAPHICS_LIBRARY.find((g) => g.svg === data.svg) || {
                        id: "drag_graphic",
                        name: data.name || "Graphic",
                        category: "shapes",
                        svg: data.svg,
                        defaultWidth: 160,
                        defaultHeight: 160,
                        tags: [],
                      };
                      insertGraphic(item, pos);
                      return;
                    }
                  }
                } catch {}

                // 3. Fallback image URL or text link
                const uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
                if (uri && (uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:image/"))) {
                  void addImageFromUrl(uri, "Photo", pos);
                }
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div className="min-w-full min-h-full grid place-items-center" style={{ padding: 40 }}>
                <div className="relative" style={{ width: canvasSize.width * zoom, height: canvasSize.height * zoom, boxShadow: "0 24px 80px rgb(0 0 0 / 0.55)" }}>
                  {/* user guides — drag to move, drag off the canvas to delete */}
                  {userGuides.v.map((g, gi) => (
                    <div key={`gv-${gi}`} className={`s-uguide ${guidesLocked ? "s-uguide-locked" : ""}`}
                      title={guidesLocked ? `Vertical Guide at ${g}px (Locked)` : `Vertical Guide at ${g}px · Drag to move · Drag off canvas to delete`}
                      style={{ left: g * zoom + vpt[4], top: 0, width: 1.5, height: "100%", cursor: guidesLocked ? "default" : "ew-resize" }}
                      onMouseDown={(e) => !guidesLocked && startGuideDrag("v", e, gi)} />
                  ))}
                  {userGuides.h.map((g, gi) => (
                    <div key={`gh-${gi}`} className={`s-uguide ${guidesLocked ? "s-uguide-locked" : ""}`}
                      title={guidesLocked ? `Horizontal Guide at ${g}px (Locked)` : `Horizontal Guide at ${g}px · Drag to move · Drag off canvas to delete`}
                      style={{ top: g * zoom + vpt[5], left: 0, height: 1.5, width: "100%", cursor: guidesLocked ? "default" : "ns-resize" }}
                      onMouseDown={(e) => !guidesLocked && startGuideDrag("h", e, gi)} />
                  ))}
                  {dragGuide && (
                    <div className="s-uguide s-uguide-live" style={dragGuide.axis === "v"
                      ? { left: dragGuide.pos * zoom + vpt[4], top: -9999, width: 1.5, height: 99999 }
                      : { top: dragGuide.pos * zoom + vpt[5], left: -9999, height: 1.5, width: 99999 }}>
                      <div
                        className="absolute px-1.5 py-0.5 rounded font-mono text-[9px] font-bold text-amber-300 bg-black/90 border border-amber-500/50 shadow-lg pointer-events-none whitespace-nowrap"
                        style={dragGuide.axis === "v" ? { top: 20, left: 6 } : { left: 20, top: 6 }}
                      >
                        {dragGuide.axis === "v" ? "X: " : "Y: "}
                        {rulerUnit === "px"
                          ? `${Math.round(dragGuide.pos)}px`
                          : `${(dragGuide.pos / (RULER_UNITS.find(u => u.id === rulerUnit)?.pxPerUnit || 1)).toFixed(2)}${rulerUnit}`}
                      </div>
                    </div>
                  )}
                  {/* canvas lives in its own host div */}
                  <div className="absolute inset-0">
                    <canvas ref={canvasEl} aria-label={`${tpl.name} — design canvas`} />
                  </div>
                  {showGrid && (
                    <div className="s-grid" style={{
                      backgroundSize: `${GRID_STEP * zoom}px ${GRID_STEP * zoom}px`,
                      backgroundPosition: `${vpt[4]}px ${vpt[5]}px`,
                    }} />
                  )}
                  {(showSafe || safeConfig.showBleed) && (
                    <>
                      {/* Inner Safe Content Margin */}
                      {showSafe && (
                        <div className="s-safe" style={{
                          left: safeConfig.left * zoom + vpt[4],
                          top: safeConfig.top * zoom + vpt[5],
                          width: Math.max(0, (canvasSize.width - safeConfig.left - safeConfig.right) * zoom),
                          height: Math.max(0, (canvasSize.height - safeConfig.top - safeConfig.bottom) * zoom),
                        }}>
                          <button
                            className="absolute -top-[20px] left-0 font-meta text-[8.5px] tracking-wider text-cyan-400 font-bold bg-cyan-950/90 border border-cyan-500/40 rounded px-1.5 py-0.5 pointer-events-auto hover:bg-cyan-900 transition-colors shadow-md"
                            onClick={() => setSafeModalOpen(true)}
                            title="Click to edit Safe Area margins & presets"
                          >
                            🛡️ SAFE ZONE · {safeConfig.preset.toUpperCase()} ({safeConfig.top}px)
                          </button>
                        </div>
                      )}

                      {/* Outer Print Bleed boundary line + Corner Trim Marks */}
                      {safeConfig.showBleed && (() => {
                        const bPx = safeConfig.bleed || 12;
                        const bScaled = bPx * zoom;
                        const cW = canvasSize.width * zoom;
                        const cH = canvasSize.height * zoom;
                        const trimLen = Math.max(8, bScaled);
                        const unitCfg = RULER_UNITS.find(u => u.id === rulerUnit) || RULER_UNITS[0];
                        const bleedDisplay = Math.round((bPx / unitCfg.pxPerUnit) * 1000) / 1000;
                        const bleedStr = rulerUnit === "px" ? `${bPx}px` : `${bleedDisplay}${unitCfg.symbol}`;
                        return (
                          <>
                            {/* Bleed outline box */}
                            <div className="s-bleed" style={{
                              left: -bScaled + vpt[4],
                              top: -bScaled + vpt[5],
                              width: cW + bScaled * 2,
                              height: cH + bScaled * 2,
                            }}>
                              <span className="absolute -top-[18px] right-0 font-meta text-[8px] tracking-wider text-amber-400 font-bold bg-amber-950/90 border border-amber-500/40 rounded px-1.5 py-0.5 pointer-events-auto">
                                ✂️ PRINT BLEED ({bleedStr})
                              </span>
                            </div>

                            {/* Corner Trim / Crop Marks at the 4 canvas corners */}
                            {/* Top-Left */}
                            <div className="absolute pointer-events-none" style={{ left: vpt[4], top: vpt[5] }}>
                              <div className="absolute bg-amber-400/80" style={{ right: 0, top: -bScaled, width: 1, height: trimLen }} />
                              <div className="absolute bg-amber-400/80" style={{ left: -bScaled, bottom: 0, height: 1, width: trimLen }} />
                            </div>
                            {/* Top-Right */}
                            <div className="absolute pointer-events-none" style={{ left: vpt[4] + cW, top: vpt[5] }}>
                              <div className="absolute bg-amber-400/80" style={{ left: 0, top: -bScaled, width: 1, height: trimLen }} />
                              <div className="absolute bg-amber-400/80" style={{ left: 0, bottom: 0, height: 1, width: trimLen }} />
                            </div>
                            {/* Bottom-Left */}
                            <div className="absolute pointer-events-none" style={{ left: vpt[4], top: vpt[5] + cH }}>
                              <div className="absolute bg-amber-400/80" style={{ right: 0, top: 0, width: 1, height: trimLen }} />
                              <div className="absolute bg-amber-400/80" style={{ left: -bScaled, top: 0, height: 1, width: trimLen }} />
                            </div>
                            {/* Bottom-Right */}
                            <div className="absolute pointer-events-none" style={{ left: vpt[4] + cW, top: vpt[5] + cH }}>
                              <div className="absolute bg-amber-400/80" style={{ left: 0, top: 0, width: 1, height: trimLen }} />
                              <div className="absolute bg-amber-400/80" style={{ left: 0, top: 0, height: 1, width: trimLen }} />
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}

                  {/* Instant Edge Hover Triggers for Images (§Layer Mask Fade) */}
                  {sel.kind === "image" && sel.obj && !cropRect && !retouch && edgeTriggersVisible && (() => {
                    const imgObj = sel.obj as FabricImage;
                    const mask = (selObj as unknown as EditorObject)?.kFadeMask;
                    const imgLeft = (imgObj.left ?? 0) * zoom + vpt[4];
                    const imgTop = (imgObj.top ?? 0) * zoom + vpt[5];
                    const imgWidth = imgObj.getScaledWidth() * zoom;
                    const imgHeight = imgObj.getScaledHeight() * zoom;

                    if (imgWidth < 24 || imgHeight < 24) return null;

                    return (
                      <div className="absolute inset-0 pointer-events-none z-20">
                        {/* Hover glow line indicator */}
                        {hoveredFadeEdge && (
                          <div
                            className="absolute pointer-events-none transition-all rounded"
                            style={{
                              ...(hoveredFadeEdge === "top"
                                ? { left: imgLeft, top: imgTop, width: imgWidth, height: Math.min(imgHeight * 0.45, 60), background: "linear-gradient(to bottom, rgba(6,182,212,0.45), transparent)" }
                                : hoveredFadeEdge === "bottom"
                                ? { left: imgLeft, top: imgTop + imgHeight - Math.min(imgHeight * 0.45, 60), width: imgWidth, height: Math.min(imgHeight * 0.45, 60), background: "linear-gradient(to top, rgba(6,182,212,0.45), transparent)" }
                                : hoveredFadeEdge === "left"
                                ? { left: imgLeft, top: imgTop, width: Math.min(imgWidth * 0.45, 60), height: imgHeight, background: "linear-gradient(to right, rgba(6,182,212,0.45), transparent)" }
                                : hoveredFadeEdge === "right"
                                ? { left: imgLeft + imgWidth - Math.min(imgWidth * 0.45, 60), top: imgTop, width: Math.min(imgWidth * 0.45, 60), height: imgHeight, background: "linear-gradient(to left, rgba(6,182,212,0.45), transparent)" }
                                : {}),
                            }}
                          />
                        )}

                        {/* Top Edge Trigger */}
                        <div
                          className="absolute pointer-events-auto"
                          style={{
                            left: imgLeft + imgWidth / 2,
                            top: imgTop - 11,
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          <button
                            type="button"
                            className={"flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold shadow-xl transition-all select-none backdrop-blur-md cursor-pointer border " +
                              (mask?.direction === "top"
                                ? "bg-cyan-400 text-black border-cyan-200 scale-105"
                                : "bg-black/90 text-zinc-300 border-white/20 hover:border-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/90 hover:scale-105")}
                            onMouseEnter={() => setHoveredFadeEdge("top")}
                            onMouseLeave={() => setHoveredFadeEdge(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (mask?.direction === "top") applyFadeMask("none");
                              else applyFadeMask("top");
                            }}
                            title="Instant Top Edge Fade Toggle"
                          >
                            <span>▲</span>
                            <span>{mask?.direction === "top" ? `Faded (${Math.round((mask.depth ?? 0.45) * 100)}%)` : "Fade Top"}</span>
                          </button>
                        </div>

                        {/* Bottom Edge Trigger */}
                        <div
                          className="absolute pointer-events-auto"
                          style={{
                            left: imgLeft + imgWidth / 2,
                            top: imgTop + imgHeight + 11,
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          <button
                            type="button"
                            className={"flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold shadow-xl transition-all select-none backdrop-blur-md cursor-pointer border " +
                              (mask?.direction === "bottom"
                                ? "bg-cyan-400 text-black border-cyan-200 scale-105"
                                : "bg-black/90 text-zinc-300 border-white/20 hover:border-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/90 hover:scale-105")}
                            onMouseEnter={() => setHoveredFadeEdge("bottom")}
                            onMouseLeave={() => setHoveredFadeEdge(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (mask?.direction === "bottom") applyFadeMask("none");
                              else applyFadeMask("bottom");
                            }}
                            title="Instant Bottom Edge Fade Toggle"
                          >
                            <span>▼</span>
                            <span>{mask?.direction === "bottom" ? `Faded (${Math.round((mask.depth ?? 0.45) * 100)}%)` : "Fade Bottom"}</span>
                          </button>
                        </div>

                        {/* Left Edge Trigger */}
                        <div
                          className="absolute pointer-events-auto"
                          style={{
                            left: imgLeft - 11,
                            top: imgTop + imgHeight / 2,
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          <button
                            type="button"
                            className={"flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold shadow-xl transition-all select-none backdrop-blur-md cursor-pointer border " +
                              (mask?.direction === "left"
                                ? "bg-cyan-400 text-black border-cyan-200 scale-105"
                                : "bg-black/90 text-zinc-300 border-white/20 hover:border-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/90 hover:scale-105")}
                            onMouseEnter={() => setHoveredFadeEdge("left")}
                            onMouseLeave={() => setHoveredFadeEdge(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (mask?.direction === "left") applyFadeMask("none");
                              else applyFadeMask("left");
                            }}
                            title="Instant Left Edge Fade Toggle"
                          >
                            <span>◀</span>
                            {mask?.direction === "left" && <span>{Math.round((mask.depth ?? 0.45) * 100)}%</span>}
                          </button>
                        </div>

                        {/* Right Edge Trigger */}
                        <div
                          className="absolute pointer-events-auto"
                          style={{
                            left: imgLeft + imgWidth + 11,
                            top: imgTop + imgHeight / 2,
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          <button
                            type="button"
                            className={"flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold shadow-xl transition-all select-none backdrop-blur-md cursor-pointer border " +
                              (mask?.direction === "right"
                                ? "bg-cyan-400 text-black border-cyan-200 scale-105"
                                : "bg-black/90 text-zinc-300 border-white/20 hover:border-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/90 hover:scale-105")}
                            onMouseEnter={() => setHoveredFadeEdge("right")}
                            onMouseLeave={() => setHoveredFadeEdge(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (mask?.direction === "right") applyFadeMask("none");
                              else applyFadeMask("right");
                            }}
                            title="Instant Right Edge Fade Toggle"
                          >
                            {mask?.direction === "right" && <span>{Math.round((mask.depth ?? 0.45) * 100)}%</span>}
                            <span>▶</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                {/* visual crop frame — HTML overlay, never touches the fabric doc */}
                {cropRect && (
                  <div className="absolute z-20 touch-none"
                    style={{
                      left: cropRect.x * zoom + vpt[4], top: cropRect.y * zoom + vpt[5],
                      width: cropRect.w * zoom, height: cropRect.h * zoom,
                      outline: "1.5px dashed var(--dept)", outlineOffset: -0.75,
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", cursor: "move",
                    }}
                    onMouseDown={cropMouseDown("move")}>
                    {/* rule-of-thirds guides */}
                    <div className="absolute inset-0 pointer-events-none opacity-40"
                      style={{
                        backgroundImage: "linear-gradient(to right, transparent 33.3%, rgba(255,255,255,0.7) 33.3%, rgba(255,255,255,0.7) calc(33.3% + 1px), transparent calc(33.3% + 1px), transparent 66.6%, rgba(255,255,255,0.7) 66.6%, rgba(255,255,255,0.7) calc(66.6% + 1px), transparent calc(66.6% + 1px)), linear-gradient(to bottom, transparent 33.3%, rgba(255,255,255,0.7) 33.3%, rgba(255,255,255,0.7) calc(33.3% + 1px), transparent calc(33.3% + 1px), transparent 66.6%, rgba(255,255,255,0.7) 66.6%, rgba(255,255,255,0.7) calc(66.6% + 1px), transparent calc(66.6% + 1px))",
                      }} />
                    {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((pos) => {
                      const isCorner = pos.length === 2;
                      const style: React.CSSProperties = {
                        position: "absolute", width: isCorner ? 14 : 18, height: isCorner ? 14 : 18,
                        background: "var(--dept)", border: "2px solid #fff", borderRadius: isCorner ? 3 : 9,
                        cursor: `${pos}-resize`, zIndex: 1,
                      };
                      if (pos.includes("n")) style.top = -7;
                      if (pos.includes("s")) style.bottom = -7;
                      if (pos.includes("w")) style.left = -7;
                      if (pos.includes("e")) style.right = -7;
                      if (pos === "n" || pos === "s") { style.left = "50%"; style.marginLeft = -9; }
                      if (pos === "e" || pos === "w") { style.top = "50%"; style.marginTop = -9; }
                      return <div key={pos} style={style} onMouseDown={cropMouseDown(pos)} />;
                    })}
                  </div>
                )}
                {/* retouch brush ring cursor hint */}
                {retouch && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none s-panel2 border border-[var(--s-line2)] rounded-full px-3 py-1.5 font-meta text-[9px] tracking-wider text-[var(--s-muted)]">
                    {retouch.mode === "heal" ? "SPOT HEAL — PAINT OVER SPOTS" : "CLONE — CLICK SOURCE, THEN PAINT"} · ESC TO FINISH
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Unified Bottom-Center Dynamic Island Drawer (§29) — dynamically centered to canvas area */}
          <div
            className={"absolute bottom-3 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ease-out transform pointer-events-none " +
              (sel.kind !== "none" && sel.obj && !cropRect && !retouch
                ? "translate-y-0 opacity-100 scale-100"
                : "translate-y-12 opacity-0 scale-95")}
          >
            <div className="bg-[#0e0e13]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] px-3 py-1.5 flex items-center gap-2 select-none pointer-events-auto relative overflow-visible">
              {/* IMAGE CONTROLS */}
              {sel.kind === "image" && selObj && (
                <div className="flex items-center gap-2">
                  <span className="font-meta text-[9.5px] uppercase tracking-wider text-cyan-400 font-bold px-2 py-0.5 rounded-lg bg-cyan-950/60 border border-cyan-500/30 flex items-center gap-1.5">
                    <span>📷</span> {(selObj as unknown as EditorObject)?.kName || "Photo"}
                  </span>
                  <span className="w-px h-4 bg-white/10" />

                  {(isAuthor || selObj?.kReplaceable) && (
                    <Tip tip="Replace photo" below={false}>
                      <label className="s-icon-btn !w-7 !h-7 !text-[12px] cursor-pointer" aria-label="Replace image">
                        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M12 16V6 M8 10l4-4 4 4 M4 16v4h16v-4" /></svg>
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceImage(f); e.target.value = ""; }} />
                      </label>
                    </Tip>
                  )}

                  <TbIcon tip="Flip Horizontal" onClick={() => flipObj("flipX")} d="M12 3v18 M7 8l-4 4 4 4 M17 8l4 4-4 4" />
                  <TbIcon tip="Flip Vertical" onClick={() => flipObj("flipY")} d="M3 12h18 M8 7l4-4 4 4 M8 17l4 4 4-4" />

                  <span className="w-px h-4 bg-white/10" />

                  {/* Integrated Non-Destructive Edge Fade Mask Widget */}
                  <div className="relative flex items-center gap-1.5 bg-black/40 px-2 py-0.5 rounded-xl border border-white/10">
                    <button
                      type="button"
                      className={"px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all " +
                        ((selObj as unknown as EditorObject)?.kFadeMask?.direction && (selObj as unknown as EditorObject)?.kFadeMask?.direction !== "none"
                          ? "bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 shadow-sm"
                          : "text-zinc-300 hover:text-white hover:bg-white/10")}
                      onClick={() => setFadeMenuOpen(!fadeMenuOpen)}
                      title="Choose fade direction and options"
                    >
                      <span>🌓</span>
                      <span>
                        {(selObj as unknown as EditorObject)?.kFadeMask?.direction && (selObj as unknown as EditorObject)?.kFadeMask?.direction !== "none"
                          ? `${(selObj as unknown as EditorObject)?.kFadeMask?.direction.toUpperCase()} FADE`
                          : "FADE MASK"}
                      </span>
                      <span className="text-[8px] opacity-70">▾</span>
                    </button>

                    {/* Upward Direction Popover Drawer */}
                    {fadeMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setFadeMenuOpen(false); }} />
                        <div
                          className="absolute left-0 bottom-full mb-3 p-3.5 rounded-2xl bg-[#0c0c11]/95 border border-[var(--s-line2)] shadow-[0_20px_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl z-50 w-72 text-left s-pop pointer-events-auto"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2.5">
                            <div>
                              <span className="font-display text-[11.5px] font-bold text-white uppercase tracking-wider">Edge Fade Direction</span>
                              <p className="font-meta text-[8.5px] text-zinc-400">Non-destructive gradient layer mask</p>
                            </div>
                            <button className="text-[11px] text-zinc-400 hover:text-white" onClick={() => setFadeMenuOpen(false)}>✕</button>
                          </div>

                          {/* 8-Direction Grid */}
                          <div className="grid grid-cols-3 gap-1 mb-2">
                            {([
                              { dir: "top-left", label: "↖", tip: "Top-Left Diagonal" },
                              { dir: "top", label: "▲ Top", tip: "Fade Top Edge" },
                              { dir: "top-right", label: "↗", tip: "Top-Right Diagonal" },
                              { dir: "left", label: "◀ Left", tip: "Fade Left Edge" },
                              { dir: "none", label: "⊘ None", tip: "Remove Fade Mask" },
                              { dir: "right", label: "Right ▶", tip: "Fade Right Edge" },
                              { dir: "bottom-left", label: "↙", tip: "Bottom-Left Diagonal" },
                              { dir: "bottom", label: "▼ Bottom", tip: "Fade Bottom Edge" },
                              { dir: "bottom-right", label: "↘", tip: "Bottom-Right Diagonal" },
                            ] as const).map((item) => {
                              const active = (selObj as unknown as EditorObject)?.kFadeMask?.direction === item.dir ||
                                (!((selObj as unknown as EditorObject)?.kFadeMask?.direction) && item.dir === "none");
                              return (
                                <button
                                  key={item.dir}
                                  type="button"
                                  className={"py-1.5 px-1 rounded-lg border text-[10.5px] text-center font-medium transition-all " +
                                    (active
                                      ? "border-cyan-400 bg-cyan-500/25 text-cyan-200 font-bold shadow-md"
                                      : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10")}
                                  title={item.tip}
                                  onClick={() => applyFadeMask(item.dir)}
                                >
                                  {item.label}
                                </button>
                              );
                            })}
                          </div>

                          {/* Multi-Edge & Vignette */}
                          <div className="grid grid-cols-3 gap-1">
                            {([
                              { dir: "radial", label: "○ Vignette" },
                              { dir: "vertical", label: "⬍ Top/Bot" },
                              { dir: "horizontal", label: "⬄ L/R" },
                            ] as const).map((item) => {
                              const active = (selObj as unknown as EditorObject)?.kFadeMask?.direction === item.dir;
                              return (
                                <button
                                  key={item.dir}
                                  type="button"
                                  className={"py-1.5 px-1 rounded-lg border text-[9.5px] text-center font-medium transition-all " +
                                    (active
                                      ? "border-cyan-400 bg-cyan-500/25 text-cyan-200 font-bold"
                                      : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10")}
                                  onClick={() => applyFadeMask(item.dir)}
                                >
                                  {item.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Inline Depth Slider when mask is active */}
                    {(selObj as unknown as EditorObject)?.kFadeMask?.direction && (selObj as unknown as EditorObject)?.kFadeMask?.direction !== "none" && (
                      <div className="flex items-center gap-2 pl-1 border-l border-white/10">
                        <input
                          type="range"
                          min={5}
                          max={95}
                          step={5}
                          value={Math.round(((selObj as unknown as EditorObject)?.kFadeMask?.depth ?? 0.45) * 100)}
                          className="w-20 accent-cyan-400 cursor-pointer h-1.5 bg-white/20 rounded-lg"
                          onChange={(e) => {
                            const cur = (selObj as unknown as EditorObject)?.kFadeMask?.direction || "bottom";
                            applyFadeMask(cur, Number(e.target.value) / 100);
                          }}
                        />
                        <span className="font-mono text-[10.5px] text-cyan-300 min-w-[28px] text-right font-bold">
                          {Math.round(((selObj as unknown as EditorObject)?.kFadeMask?.depth ?? 0.45) * 100)}%
                        </span>
                        <button
                          type="button"
                          className="text-zinc-400 hover:text-rose-400 text-[11px] px-1"
                          title="Clear fade"
                          onClick={() => applyFadeMask("none")}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  <span className="w-px h-4 bg-white/10" />

                  <Tip tip="Crop photo" below={false}>
                    <button className="s-btn s-btn-line !h-7 !px-2 !text-[11px]" onClick={startCrop}>
                      ✂ Crop
                    </button>
                  </Tip>
                </div>
              )}

              {/* TEXT CONTROLS */}
              {sel.kind === "text" && selObj && (
                <div className="flex items-center gap-2">
                  <span className="font-meta text-[9.5px] uppercase tracking-wider text-amber-400 font-bold px-2 py-0.5 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center gap-1">
                    <span>🔤</span> Text
                  </span>
                  <span className="w-px h-4 bg-white/10" />

                  <div className="w-[120px]">
                    <FontField value={(selObj as unknown as { fontFamily?: string }).fontFamily} disabled={styleLocked} onChange={(stack) => setFont(stack)} />
                  </div>
                  <input type="number" className="s-input !w-[48px] !px-1 !py-1 text-center" disabled={styleLocked} aria-label="Font size"
                    value={Math.round((selObj as unknown as { fontSize?: number }).fontSize ?? 32)}
                    onChange={(e) => setProp({ fontSize: Number(e.target.value) || 32 })} />
                  <TbColor tip="Text color" disabled={styleLocked}
                    value={normalizeHex((selObj as unknown as { fill?: string }).fill) ?? "#ffffff"}
                    onChange={(hex) => setProp({ fill: hex })} />

                  <span className="w-px h-4 bg-white/10" />

                  {/* Photoshop-style Box Width Extender */}
                  <Tip tip="Fit all text on 1 line without wrapping">
                    <button
                      className="s-btn s-btn-line !py-1 !px-2 text-[10px] font-bold text-amber-300 hover:text-white flex items-center gap-1 border-amber-500/40 hover:bg-amber-500/20"
                      disabled={styleLocked}
                      onClick={() => expandTextToFit(selObj)}
                    >
                      <span>↔</span> Fit 1 Line
                    </button>
                  </Tip>
                  <div className="flex items-center gap-1 bg-black/40 px-1.5 py-0.5 rounded border border-white/10" title="Text box bounding width (pixels)">
                    <span className="text-[9px] text-white/50">W:</span>
                    <input
                      type="number"
                      className="s-input !w-[56px] !px-1 !py-0.5 text-center text-[10px]"
                      disabled={styleLocked}
                      aria-label="Text box width"
                      value={Math.round((selObj as unknown as { width?: number }).width ?? 200)}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 100;
                        const tb = selObj as unknown as Textbox;
                        if (tb) {
                          tb.set("width", val);
                          tb.setCoords();
                          fc.current?.renderAll();
                          pushHistory();
                          setSel((s) => ({ ...s }));
                        }
                      }}
                    />
                    <span className="text-[9px] text-white/50">px</span>
                  </div>
                </div>
              )}

              {/* SHAPE CONTROLS */}
              {sel.kind === "shape" && selObj && (
                <div className="flex items-center gap-2">
                  <span className="font-meta text-[9.5px] uppercase tracking-wider text-blue-400 font-bold px-2 py-0.5 rounded-lg bg-blue-950/60 border border-blue-500/30 flex items-center gap-1">
                    <span>⬡</span> Shape
                  </span>
                  <span className="w-px h-4 bg-white/10" />

                  <TbColor tip="Fill color" disabled={styleLocked} value={normalizeHex(selObj.fill) ?? "#3b82f6"} onChange={(hex) => setProp({ fill: hex })} />
                  <TbColor tip="Stroke color" disabled={styleLocked} value={normalizeHex(selObj.stroke) ?? "#000000"} onChange={(hex) => setProp({ stroke: hex })} />
                </div>
              )}

              {/* MULTI-SELECT CONTROLS */}
              {sel.kind === "multi" && (
                <div className="flex items-center gap-2">
                  <span className="font-meta text-[9.5px] uppercase tracking-wider text-purple-400 font-bold px-2 py-0.5 rounded-lg bg-purple-950/60 border border-purple-500/30 flex items-center gap-1">
                    <span>🔲</span> Multi-Select
                  </span>
                  <span className="w-px h-4 bg-white/10" />

                  <TbIcon tip="Group · ⌘G" onClick={groupSelection} d="M4 4h7v7H4z M13 13h7v7h-7z" />
                </div>
              )}

              {/* COMMON ACTIONS FOR ALL SELECTIONS */}
              <span className="w-px h-4 bg-white/10" />

              {/* Quick Export Element Pill & Submenu */}
              <div className="relative">
                <button
                  type="button"
                  className={"s-btn s-btn-line !h-7 !px-2.5 !text-[11px] flex items-center gap-1.5 transition-all font-bold cursor-pointer " +
                    (layerExportOpen
                      ? "bg-emerald-500/30 text-emerald-200 border-emerald-400 shadow-sm"
                      : "text-emerald-300 hover:text-emerald-200 border-emerald-500/30 hover:border-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/50")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLayerExportOpen(!layerExportOpen);
                  }}
                  title="Download only this selected element"
                >
                  <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 4v12 M7 11l5 5 5-5 M4 20h16" /></svg>
                  <span>Export</span>
                  <span className="text-[8px] opacity-70">▾</span>
                </button>

                {layerExportOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setLayerExportOpen(false); }} />
                    <div
                      className="absolute right-0 bottom-full mb-3 p-3.5 rounded-2xl bg-[#0c0c11]/95 border border-[var(--s-line2)] shadow-[0_20px_60px_rgba(0,0,0,0.9)] backdrop-blur-2xl z-50 w-72 text-left s-pop pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2.5">
                        <div>
                          <span className="font-display text-[11.5px] font-bold text-white uppercase tracking-wider">Export Selected Layer</span>
                          <p className="font-meta text-[8.5px] text-zinc-400">Download isolated element cutout</p>
                        </div>
                        <button className="text-[11px] text-zinc-400 hover:text-white" onClick={() => setLayerExportOpen(false)}>✕</button>
                      </div>

                      {/* Format Selector: PNG vs JPG */}
                      <div className="mb-2.5">
                        <span className="font-meta text-[9px] uppercase tracking-wider text-zinc-400 block mb-1 font-bold">Image Format</span>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            className={"py-1.5 px-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center cursor-pointer " +
                              (layerExportFmt === "png"
                                ? "border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold shadow-sm"
                                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10")}
                            onClick={() => setLayerExportFmt("png")}
                          >
                            <span className="text-[11px] font-bold">PNG</span>
                            <span className="text-[7.5px] opacity-70">Transparent Cutout</span>
                          </button>

                          <button
                            type="button"
                            className={"py-1.5 px-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center cursor-pointer " +
                              (layerExportFmt === "jpg"
                                ? "border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold shadow-sm"
                                : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10")}
                            onClick={() => setLayerExportFmt("jpg")}
                          >
                            <span className="text-[11px] font-bold">JPEG</span>
                            <span className="text-[7.5px] opacity-70">Solid Background</span>
                          </button>
                        </div>
                      </div>

                      {/* Scale Multiplier: 1x, 2x, 3x */}
                      <div className="mb-3">
                        <span className="font-meta text-[9px] uppercase tracking-wider text-zinc-400 block mb-1 font-bold">Resolution Multiplier</span>
                        <div className="grid grid-cols-3 gap-1">
                          {([
                            { scale: 1, label: "1x", desc: "Standard" },
                            { scale: 2, label: "2x", desc: "Retina 2K" },
                            { scale: 3, label: "3x", desc: "Print 4K" },
                          ] as const).map((opt) => (
                            <button
                              key={opt.scale}
                              type="button"
                              className={"py-1 px-1 rounded-lg border text-center transition-all cursor-pointer " +
                                (layerExportScale === opt.scale
                                  ? "border-emerald-400 bg-emerald-500/25 text-emerald-200 font-bold shadow-sm"
                                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10")}
                              onClick={() => setLayerExportScale(opt.scale)}
                            >
                              <div className="text-[10.5px] font-bold">{opt.label}</div>
                              <div className="text-[7.5px] opacity-60">{opt.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="space-y-1.5 pt-2 border-t border-white/10">
                        <button
                          type="button"
                          className="w-full py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-display font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-lg transition-all cursor-pointer"
                          onClick={() => {
                            setLayerExportOpen(false);
                            void exportSelectedElement(layerExportFmt, layerExportScale, true);
                          }}
                        >
                          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8" /></svg>
                          <span>Save As… (Choose Location)</span>
                        </button>

                        <div className="grid grid-cols-2 gap-1 pt-0.5">
                          <button
                            type="button"
                            className="py-1 px-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-[9.5px] flex items-center justify-center gap-1 transition-all cursor-pointer"
                            onClick={() => {
                              setLayerExportOpen(false);
                              void exportSelectedElement(layerExportFmt, layerExportScale, false);
                            }}
                          >
                            <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 4v12 M7 11l5 5 5-5 M4 20h16" /></svg>
                            <span>Quick Save</span>
                          </button>

                          <button
                            type="button"
                            className="py-1 px-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium text-[9.5px] flex items-center justify-center gap-1 transition-all cursor-pointer"
                            onClick={() => {
                              setLayerExportOpen(false);
                              void copySelectedElementToClipboard(layerExportScale);
                            }}
                          >
                            <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M8 8h12v12H8z M4 4h12v12" /></svg>
                            <span>Copy Image</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <span className="w-px h-4 bg-white/10" />

              <TbIcon tip="Duplicate · ⌘D" onClick={() => void duplicateSelection()} d="M8 8h12v12H8z M4 4h12v12" />
              {(isAuthor || (selObj?.kDeletable !== false && !selObj?.kLocked)) && (
                <TbIcon tip="Delete · ⌫" onClick={deleteSelection} d="M5 7h14 M9 7V5h6v2 M7 7l1 13h8l1-13" />
              )}
            </div>
          </div>
        </div>

          {/* dedicated bottom status bar - CANNOT overlap artwork */}
          <div className="h-9 border-t border-[var(--s-line)] s-panel shrink-0 flex items-center justify-between px-3 z-30">
            <div className="font-meta text-[9.5px] text-[var(--s-muted)] flex items-center gap-2 max-md:hidden select-none">
              <span>Hold <span className="s-kbd">Space</span> to pan</span>
              <span className="opacity-40">·</span>
              <span><span className="s-kbd">⌘K</span> commands</span>
              <span className="opacity-40">·</span>
              <span><span className="s-kbd">?</span> shortcuts</span>
            </div>

            {/* zoom controls */}
            <div className="flex items-center gap-1 ml-auto">
              <button className="s-icon-btn !w-6 !h-6 !text-[11px]" onClick={() => applyZoom(zoom - 0.1)} aria-label="Zoom out">−</button>
              <div className="relative">
                <button className="s-btn !h-6 !px-2 font-meta text-[10px]" onClick={() => setZoomMenu(!zoomMenu)} aria-label="Zoom level">
                  {Math.round(zoom * 100)}% ▾
                </button>
                {zoomMenu && (
                  <div className="s-popover s-pop bottom-full right-0 mb-1.5 w-[120px] !p-1 z-50">
                    {ZOOM_PRESETS.map((z) => (
                      <button key={z} className="s-menu-item" onClick={() => { applyZoom(z); setZoomMenu(false); }}>
                        <span>{Math.round(z * 100)}%</span>
                      </button>
                    ))}
                    <div className="s-menu-sep" />
                    <button className="s-menu-item" onClick={() => { fitZoom(); setZoomMenu(false); }}><span>Fit</span><span className="s-menu-kbd">⌘0</span></button>
                  </div>
                )}
              </div>
              <button className="s-icon-btn !w-6 !h-6 !text-[11px]" onClick={() => applyZoom(zoom + 0.1)} aria-label="Zoom in">+</button>
              <span className="w-px h-3.5 bg-[var(--s-line)] mx-0.5" />
              <button className="s-btn !h-6 !px-2 font-meta text-[10px]" onClick={fitZoom}>Fit</button>
              <span className="w-px h-3.5 bg-[var(--s-line)] mx-0.5" />
              <button
                className={"s-btn !h-6 !px-2 font-meta text-[10px] flex items-center gap-1 transition-all " + (isFullscreen ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : "")}
                onClick={toggleFullscreen}
                title={isFullscreen ? "Exit Fullscreen (F or Esc)" : "Fullscreen Mode (F)"}
              >
                <span>{isFullscreen ? "⛶ Exit" : "⛶ Full"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* right property panel */}
        <div className="w-[264px] shrink-0 border-l border-[var(--s-line)] s-panel overflow-y-auto s-scroll p-3.5 flex flex-col gap-3.5 max-lg:hidden">
          {sel.kind === "none" && !cropRect && !retouch && (
            <div className="text-center mt-10 flex flex-col items-center gap-2.5">
              <p className="text-[12.5px] text-[var(--s-muted)]">Select an element to edit it</p>
              <p className="font-meta text-[9px] text-[var(--s-muted)]">or press <span className="s-kbd">⌘K</span> for commands</p>
            </div>
          )}

          {cropRect && (
            <>
              <p className="s-label !mb-0">Cropping</p>
              <p className="text-[11.5px] text-[var(--s-muted)]">Drag the corners or edges of the frame. The darkened area will be cut away.</p>
              <div className="flex gap-1.5">
                <button className="s-btn grow" onClick={commitCrop}>Apply crop ⏎</button>
                <button className="s-btn s-btn-line grow" onClick={endCrop}>Cancel</button>
              </div>
            </>
          )}

          {retouch && (
            <>
              <p className="s-label !mb-0">{retouch.mode === "heal" ? "Spot healing" : "Clone stamp"}</p>
              <Slider label="Brush size" min={8} max={160} value={retouch.size}
                onChange={(v) => { setRetouch({ ...retouch, size: v }); if (retouchRef.current) retouchRef.current.size = v; }} />
              <p className="text-[11.5px] text-[var(--s-muted)]">
                {retouch.mode === "clone"
                  ? "Click once on a clean area to set the source, then paint over the flaw to copy it. Alt-click picks a new source anytime."
                  : "Paint over spots, dust or small objects — each stroke blends the area into its surroundings."}
              </p>
              <button className="s-btn grow" onClick={stopRetouch}>Done — back to editing</button>
            </>
          )}

          {sel.kind === "multi" && (
            <>
              <p className="s-label">{(fc.current?.getActiveObjects().length ?? 0)} elements selected</p>
              <div className="flex gap-1.5">
                <button className="s-btn s-btn-line grow" onClick={groupSelection}>Group ⌘G</button>
                <button className="s-btn s-btn-line grow" onClick={() => void duplicateSelection()}>Duplicate</button>
              </div>
            </>
          )}

          {selObj && sel.kind === "text" && (() => {
            const raw = selObj as unknown as EditorObject;
            const isPsdBitmap = !isText(selObj) && Boolean(raw.kIsPsdText || raw.kLayerType === "text");
            const t = selObj as unknown as {
              text?: string; fontSize?: number; fontFamily?: string; fontWeight?: string; fontStyle?: string;
              underline?: boolean; linethrough?: boolean; textAlign?: string; fill?: string; opacity?: number;
              charSpacing?: number; lineHeight?: number; textBackgroundColor?: string; shadow?: Shadow | null;
              width?: number;
              kWarp?: { mode: "arcUp" | "arcDown" | "wave" | "circle"; bend: number } | null;
            };
            return (
              <>
                {isPsdBitmap && (
                  <div className="bg-gradient-to-r from-cyan-950/70 to-blue-950/70 border border-cyan-500/40 rounded-xl p-3 flex flex-col gap-2 shadow-lg mb-1">
                    <div className="flex items-center justify-between">
                      <span className="font-meta text-[9px] uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        Photoshop Typography
                      </span>
                      <span className="font-meta text-[8.5px] text-cyan-300/70">Double-click canvas</span>
                    </div>
                    <div className="text-[12px] text-zinc-200 font-medium truncate bg-black/40 border border-white/10 rounded px-2.5 py-1.5">
                      "{String(raw.kPsdText || raw.kName || "Text Layer")}"
                    </div>
                    <button
                      className="s-btn s-btn-dept !py-2 !text-[11px] font-bold w-full flex items-center justify-center gap-1.5 shadow"
                      onClick={() => convertPsdTextToLiveTextbox(selObj)}
                    >
                      <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <path d="M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      Convert to Live Editable Text
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="s-label !mb-0">Text</p>
                  {styleLocked && <span className="font-meta text-[8.5px] text-[var(--dept)]">STYLE LOCKED</span>}
                </div>
                {isText(selObj) && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="s-label !mb-0 text-[10px]">Text Content</span>
                        <button
                          type="button"
                          className="font-meta text-[9px] text-[var(--dept)] hover:underline flex items-center gap-1"
                          onClick={() => {
                            const c = fc.current;
                            if (c && selObj) {
                              const tb = selObj as unknown as Textbox;
                              tb.editable = true;
                              c.setActiveObject(tb);
                              c.renderAll();
                              setTimeout(() => {
                                try {
                                  tb.enterEditing();
                                  tb.selectAll();
                                  c.renderAll();
                                } catch (e) {
                                  console.warn(e);
                                }
                              }, 30);
                            }
                          }}
                        >
                          <span>✏️</span> Focus on Canvas
                        </button>
                      </div>
                      <textarea
                        className="s-input !py-1.5 !px-2 !text-[12px] min-h-[48px] resize-y font-normal"
                        value={t.text ?? ""}
                        disabled={styleLocked}
                        placeholder="Type text here…"
                        onChange={(e) => {
                          setProp({ text: e.target.value });
                        }}
                      />
                    </div>

                    {/* Magic Write AI Assistant */}
                    <div className="bg-gradient-to-r from-purple-950/40 to-pink-950/40 border border-purple-500/30 rounded-xl p-2.5 flex flex-col gap-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-meta text-[9px] uppercase tracking-wider text-purple-300 font-bold flex items-center gap-1.5">
                          <span>🪄</span> Magic Write AI
                        </span>
                        <span className="font-meta text-[8px] text-purple-300/70">1-click copy</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {MAGIC_WRITE_OPTIONS.slice(0, 4).map((opt) => (
                          <button
                            key={opt.id}
                            className="s-btn s-btn-line !py-1 !px-1.5 !text-[9.5px] truncate text-left"
                            disabled={magicWriteBusy || styleLocked}
                            onClick={() => void runMagicWrite(opt.id)}
                          >
                            <span className="mr-1">{opt.icon}</span>
                            {opt.label.split(" ")[0]}
                          </button>
                        ))}
                      </div>
                      <button
                        className="s-btn s-btn-dept !py-1 !text-[10px] font-bold w-full flex items-center justify-center gap-1"
                        disabled={styleLocked}
                        onClick={() => setMagicWriteOpen(true)}
                      >
                        <span>✨</span> All AI Prompts…
                      </button>
                    </div>
                    {/* Partial Text Highlight / Selection Controls */}
                    {(() => {
                      const tb = selObj as unknown as Textbox;
                      const isEditing = Boolean((tb as unknown as { isEditing?: boolean }).isEditing);
                      const sStart = tb.selectionStart ?? 0;
                      const sEnd = tb.selectionEnd ?? 0;
                      const fullText = t.text ?? "";
                      const hasSubSel = isEditing && sStart !== sEnd;
                      const highlightedText = hasSubSel ? fullText.slice(Math.min(sStart, sEnd), Math.max(sStart, sEnd)) : "";

                      return (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 flex flex-col gap-2 shadow-inner">
                          <div className="flex items-center justify-between">
                            <span className="font-meta text-[9px] uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1">
                              <span>✨</span> {hasSubSel ? "Highlighted Portion" : "Text Selection"}
                            </span>
                            <span className="font-meta text-[8.5px] text-zinc-400 font-mono">
                              {hasSubSel ? `[${Math.min(sStart, sEnd)}:${Math.max(sStart, sEnd)}]` : "All text"}
                            </span>
                          </div>

                          {hasSubSel ? (
                            <div className="text-[11.5px] font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded px-2 py-1 truncate">
                              "{highlightedText}"
                            </div>
                          ) : (
                            <p className="text-[10px] text-zinc-400 leading-tight">
                              Drag on canvas to highlight any word, or use quick selectors:
                            </p>
                          )}

                          <div className="grid grid-cols-3 gap-1">
                            <button
                              type="button"
                              className="s-btn s-btn-line !py-1 !text-[9.5px] font-medium"
                              onClick={() => {
                                const c = fc.current;
                                if (c && selObj) {
                                  const tbObj = selObj as unknown as Textbox;
                                  tbObj.enterEditing();
                                  tbObj.selectAll();
                                  c.renderAll();
                                  setSel(readSelection(c));
                                }
                              }}
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              className="s-btn s-btn-line !py-1 !text-[9.5px] font-medium"
                              onClick={() => {
                                const c = fc.current;
                                if (c && selObj) {
                                  const tbObj = selObj as unknown as Textbox;
                                  tbObj.enterEditing();
                                  const firstSpace = fullText.indexOf(" ");
                                  tbObj.selectionStart = 0;
                                  tbObj.selectionEnd = firstSpace > 0 ? firstSpace : fullText.length;
                                  c.renderAll();
                                  setSel(readSelection(c));
                                }
                              }}
                            >
                              First Word
                            </button>
                            <button
                              type="button"
                              className="s-btn s-btn-line !py-1 !text-[9.5px] font-medium"
                              onClick={() => {
                                const c = fc.current;
                                if (c && selObj) {
                                  const tbObj = selObj as unknown as Textbox;
                                  tbObj.enterEditing();
                                  const lastSpace = fullText.lastIndexOf(" ");
                                  tbObj.selectionStart = lastSpace >= 0 ? lastSpace + 1 : 0;
                                  tbObj.selectionEnd = fullText.length;
                                  c.renderAll();
                                  setSel(readSelection(c));
                                }
                              }}
                            >
                              Last Word
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
                <FontField value={t.fontFamily} disabled={styleLocked} onChange={(stack) => setFont(stack)} />
                <div className="flex items-center gap-1">
                  <button className="s-icon-btn" disabled={styleLocked} aria-label="Decrease font size"
                    onClick={() => setProp({ fontSize: Math.max(6, (t.fontSize ?? 32) - 2) })}>−</button>
                  <input type="number" className="s-input text-center" disabled={styleLocked} aria-label="Font size"
                    value={Math.round(t.fontSize ?? 32)} onChange={(e) => setProp({ fontSize: Number(e.target.value) || 32 })} />
                  <button className="s-icon-btn" disabled={styleLocked} aria-label="Increase font size"
                    onClick={() => setProp({ fontSize: (t.fontSize ?? 32) + 2 })}>+</button>
                </div>
                <div className="flex gap-1">
                  <button className={"s-btn s-btn-line grow !px-0" + (t.fontWeight === "800" || t.fontWeight === "700" ? " s-btn-on" : "")}
                    disabled={styleLocked} style={{ fontWeight: 800 }} aria-label="Bold"
                    onClick={() => setProp({ fontWeight: t.fontWeight === "800" || t.fontWeight === "700" ? "400" : "800" })}>B</button>
                  <button className={"s-btn s-btn-line grow !px-0 italic" + (t.fontStyle === "italic" ? " s-btn-on" : "")}
                    disabled={styleLocked} aria-label="Italic"
                    onClick={() => setProp({ fontStyle: t.fontStyle === "italic" ? "normal" : "italic" })}>I</button>
                  <button className={"s-btn s-btn-line grow !px-0 underline" + (t.underline ? " s-btn-on" : "")}
                    disabled={styleLocked} aria-label="Underline"
                    onClick={() => setProp({ underline: !t.underline })}>U</button>
                  <button className={"s-btn s-btn-line grow !px-0 line-through" + (t.linethrough ? " s-btn-on" : "")}
                    disabled={styleLocked} aria-label="Strikethrough"
                    onClick={() => setProp({ linethrough: !t.linethrough })}>S</button>
                </div>
                <div className="flex gap-1">
                  {(["left", "center", "right", "justify"] as const).map((a) => (
                    <button key={a} className={"s-btn s-btn-line grow !px-0" + (t.textAlign === a ? " s-btn-on" : "")}
                      disabled={styleLocked} aria-label={`Align ${a}`}
                      onClick={() => setProp({ textAlign: a })}>
                      {a === "left" ? "⇤" : a === "center" ? "⇹" : a === "right" ? "⇥" : "≡"}
                    </button>
                  ))}
                </div>
                <div>
                  <p className="s-label">Warp</p>
                  <div className="flex gap-1">
                    {([["arcUp", "⌒", "Arc up"], ["arcDown", "⌣", "Arc down"], ["wave", "〜", "Wave"], ["circle", "◯", "Full circle"]] as const).map(([m, glyph, tip]) => (
                      <button key={m} className={"s-btn s-btn-line grow !px-0 text-[14px]" + (t.kWarp?.mode === m ? " s-btn-on" : "")}
                        disabled={styleLocked} title={tip} aria-label={tip}
                        onClick={() => applyWarp(m, t.kWarp?.bend ?? 90)}>{glyph}</button>
                    ))}
                    <button className={"s-btn s-btn-line grow !px-0" + (!t.kWarp ? " s-btn-on" : "")}
                      disabled={styleLocked || !t.kWarp} title="Remove warp" aria-label="Remove warp"
                      onClick={() => applyWarp(null)}>—</button>
                  </div>
                  {t.kWarp && t.kWarp.mode !== "circle" && (
                    <Slider label="Bend" min={16} max={240} disabled={styleLocked} value={t.kWarp.bend}
                      onChange={(v) => applyWarp(t.kWarp!.mode, v)} />
                  )}
                  {t.kWarp && (
                    <p className="font-meta text-[8.5px] text-[var(--s-muted)] mt-1">Warped text stays editable — edit words, then re-tap the warp to refit.</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button className="s-btn s-btn-line grow !px-0" disabled={styleLocked} onClick={() => setCase("upper")} aria-label="Uppercase">AA</button>
                  <button className="s-btn s-btn-line grow !px-0" disabled={styleLocked} onClick={() => setCase("title")} aria-label="Title case">Aa</button>
                  <button className="s-btn s-btn-line grow !px-0" disabled={styleLocked} onClick={() => setCase("lower")} aria-label="Lowercase">aa</button>
                </div>

                {/* Text Color Section with Quick Swatches */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="s-label !mb-0 text-[10px]">
                      {Boolean((selObj as unknown as Textbox).isEditing && (selObj as unknown as Textbox).selectionStart !== (selObj as unknown as Textbox).selectionEnd)
                        ? "Color (for Highlighted Selection)"
                        : "Color"}
                    </span>
                  </div>
                  <ColorField label="" value={normalizeHex(t.fill) ?? "#ffffff"} disabled={styleLocked} docColors={docColors}
                    onChange={(hex) => setProp({ fill: hex })} />
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {["#ffffff", "#facc15", "#22c55e", "#06b6d4", "#ef4444", "#ec4899", "#8b5cf6", "#000000"].map((hexColor) => (
                      <button
                        key={hexColor}
                        type="button"
                        className="s-swatch !w-5 !h-5 border border-white/20 hover:scale-110 transition-transform"
                        style={{ background: hexColor }}
                        title={`Apply ${hexColor}`}
                        onClick={() => setProp({ fill: hexColor })}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-end gap-1.5">
                  <div className="grow">
                    <ColorField label="Text highlight" value={normalizeHex(t.textBackgroundColor) ?? "#000000"} disabled={styleLocked} docColors={docColors}
                      onChange={(hex) => setProp({ textBackgroundColor: hex })} />
                  </div>
                  {t.textBackgroundColor && (
                    <button className="s-icon-btn mb-0.5" title="Clear highlight" disabled={styleLocked}
                      onClick={() => setProp({ textBackgroundColor: "" })}>✕</button>
                  )}
                </div>
                <Slider label="Opacity" min={10} max={100} disabled={styleLocked} value={Math.round((t.opacity ?? 1) * 100)}
                  onChange={(v) => setProp({ opacity: v / 100 })} />
                <Slider label="Letter spacing" min={-50} max={600} step={10} disabled={styleLocked} value={t.charSpacing ?? 0}
                  onChange={(v) => setProp({ charSpacing: v })} />
                <Slider label="Line height" min={0.6} max={2.5} step={0.05} disabled={styleLocked} value={t.lineHeight ?? 1.05}
                  onChange={(v) => setProp({ lineHeight: v })} />

                {/* Photoshop-style Box Width Extender */}
                <div className="pt-2 border-t border-[var(--s-line)]">
                  <div className="flex items-center justify-between mb-1">
                    <p className="s-label mb-0">Box Width (Extend)</p>
                    <button
                      type="button"
                      className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline cursor-pointer"
                      disabled={styleLocked}
                      title="Extend text box width so text fits on 1 line without wrapping"
                      onClick={() => expandTextToFit(selObj)}
                    >
                      <span>↔</span> Fit 1 Line
                    </button>
                  </div>
                  <Slider label="Width (px)" min={80} max={Math.max(2500, Math.round(canvasSize.width * 1.5))} step={10} disabled={styleLocked} value={Math.round(t.width ?? 200)}
                    onChange={(v) => {
                      const tb = selObj as unknown as Textbox;
                      if (tb) {
                        tb.set("width", v);
                        tb.setCoords();
                        fc.current?.renderAll();
                        pushHistory();
                        setSel((s) => ({ ...s }));
                      }
                    }} />
                </div>
              </>
            );
          })()}

          {selObj && sel.kind === "image" && (
            <>
              {/* 1-Click Convert to Live Text (for dates, times, venues, titles imported from PSD) */}
              <div className="bg-gradient-to-r from-cyan-950/60 to-blue-950/60 border border-cyan-500/40 rounded-xl p-2.5 flex flex-col gap-2 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="font-meta text-[9.5px] uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
                    <span>🔤</span> Text / Date Layer
                  </span>
                  <span className="font-meta text-[8.5px] text-zinc-400">PSD / Raster</span>
                </div>
                <p className="text-[10px] text-zinc-300 leading-tight">
                  Convert this element to live editable text to change words, dates, fonts, and colors:
                </p>
                <button
                  type="button"
                  className="s-btn s-btn-dept !py-1.5 !text-[11px] font-bold w-full flex items-center justify-center gap-1.5 shadow"
                  onClick={() => convertPsdTextToLiveTextbox(selObj)}
                >
                  <span>🔤</span> Convert to Live Text
                </button>
              </div>

              <p className="s-label">Image</p>
              {(isAuthor || selObj.kReplaceable) && (
                <label className="s-list-btn justify-center cursor-pointer">
                  Replace image
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceImage(f); e.target.value = ""; }} />
                </label>
              )}
              <div className="flex gap-1.5">
                <button className="s-btn s-btn-line grow" onClick={() => fitImage("fill")}>Fill frame</button>
                <button className="s-btn s-btn-line grow" onClick={() => fitImage("fit")}>Fit frame</button>
              </div>
              <div className="flex gap-1.5">
                <button className="s-btn s-btn-line grow" onClick={() => flipObj("flipX")}>Flip H</button>
                <button className="s-btn s-btn-line grow" onClick={() => flipObj("flipY")}>Flip V</button>
              </div>
              <p className="s-label mt-1">Mask Shape</p>
              <div className="grid grid-cols-3 gap-1">
                {(["none", "circle", "rounded", "star", "heart", "hex"] as const).map((m) => (
                  <button key={m} className={"s-btn s-btn-line grow !px-0" + (maskKind === m ? " s-btn-on" : "")}
                    onClick={() => setMask(m)}>
                    {m === "hex" ? "Hex" : m[0].toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>

              {/* Non-Destructive Edge Fade Mask (§Layer Mask Blend) */}
              <div className="border-t border-[var(--s-line)] pt-2.5 mt-1.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="s-label !mb-0 text-cyan-300 font-bold">Edge Fade Mask</p>
                  {(selObj as unknown as EditorObject).kFadeMask && (
                    <button
                      className="text-[9px] text-rose-400 hover:underline"
                      onClick={() => applyFadeMask("none")}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="font-meta text-[8.5px] text-zinc-400 mb-2">
                  Non-destructive gradient blend into background &amp; text.
                </p>

                {/* 8-Directional Compass */}
                <div className="grid grid-cols-3 gap-1 mb-1.5">
                  {([
                    { dir: "top-left", label: "↖", tip: "Top-Left Diagonal" },
                    { dir: "top", label: "▲ Top", tip: "Fade Top Edge" },
                    { dir: "top-right", label: "↗", tip: "Top-Right Diagonal" },
                    { dir: "left", label: "◀ Left", tip: "Fade Left Edge" },
                    { dir: "none", label: "⊘ None", tip: "No Fade Mask" },
                    { dir: "right", label: "Right ▶", tip: "Fade Right Edge" },
                    { dir: "bottom-left", label: "↙", tip: "Bottom-Left Diagonal" },
                    { dir: "bottom", label: "▼ Bottom", tip: "Fade Bottom Edge" },
                    { dir: "bottom-right", label: "↘", tip: "Bottom-Right Diagonal" },
                  ] as const).map((item) => {
                    const active = (selObj as unknown as EditorObject).kFadeMask?.direction === item.dir ||
                      (!((selObj as unknown as EditorObject).kFadeMask?.direction) && item.dir === "none");
                    return (
                      <button
                        key={item.dir}
                        type="button"
                        className={"s-btn s-btn-line !text-[10px] !py-1 transition-all " +
                          (active ? "!border-cyan-400 !bg-cyan-500/25 text-cyan-200 font-bold shadow-sm" : "hover:bg-white/5")}
                        title={item.tip}
                        onClick={() => applyFadeMask(item.dir)}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {/* Multi-Edge & Radial Presets */}
                <div className="grid grid-cols-3 gap-1 mb-2">
                  {([
                    { dir: "radial", label: "○ Vignette" },
                    { dir: "vertical", label: "⬍ Top/Bot" },
                    { dir: "horizontal", label: "⬄ L/R" },
                  ] as const).map((item) => {
                    const active = (selObj as unknown as EditorObject).kFadeMask?.direction === item.dir;
                    return (
                      <button
                        key={item.dir}
                        type="button"
                        className={"s-btn s-btn-line !text-[9.5px] !py-1 transition-all " +
                          (active ? "!border-cyan-400 !bg-cyan-500/25 text-cyan-200 font-bold" : "hover:bg-white/5")}
                        onClick={() => applyFadeMask(item.dir)}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {/* Feather Depth Slider */}
                {Boolean((selObj as unknown as EditorObject).kFadeMask?.direction && (selObj as unknown as EditorObject).kFadeMask?.direction !== "none") && (
                  <div className="bg-black/40 p-2 rounded-xl border border-white/5">
                    <Slider
                      label="Fade Depth"
                      min={5}
                      max={95}
                      step={5}
                      value={Math.round(((selObj as unknown as EditorObject).kFadeMask?.depth ?? 0.45) * 100)}
                      onChange={(v) => {
                        const curDir = (selObj as unknown as EditorObject).kFadeMask?.direction || "bottom";
                        applyFadeMask(curDir, v / 100);
                      }}
                    />
                  </div>
                )}
              </div>

              <p className="s-label mt-1">Crop</p>
              <button className="s-list-btn justify-center" onClick={startCrop}>
                Crop visually — drag a frame over the image
              </button>
              {(() => {
                const img = selObj as unknown as FabricImage;
                const el = img.getElement?.() as { naturalWidth?: number; naturalHeight?: number } | undefined;
                const natW = el?.naturalWidth ?? img.width ?? 1;
                const natH = el?.naturalHeight ?? img.height ?? 1;
                const maxCX = Math.max(0, Math.round(natW - (img.width ?? 1)));
                const maxCY = Math.max(0, Math.round(natH - (img.height ?? 1)));
                if (!maxCX && !maxCY) return <p className="text-[11px] text-[var(--s-muted)]">Image exactly fills its frame — enlarge it with Fill frame, then reframe.</p>;
                return (
                  <>
                    {maxCX > 0 && (
                      <Slider label="Crop X" min={0} max={maxCX} value={Math.round(img.cropX ?? 0)}
                        onChange={(v) => setProp({ cropX: v })} />
                    )}
                    {maxCY > 0 && (
                      <Slider label="Crop Y" min={0} max={maxCY} value={Math.round(img.cropY ?? 0)}
                        onChange={(v) => setProp({ cropY: v })} />
                    )}
                  </>
                );
              })()}
              <p className="s-label mt-1">Retouch</p>
              <div className="flex gap-1.5">
                <button className="s-btn s-btn-line grow" onClick={() => startRetouch("heal")}>Spot heal</button>
                <button className="s-btn s-btn-line grow" onClick={() => startRetouch("clone")}>Clone stamp</button>
              </div>
              <p className="font-meta text-[8.5px] text-[var(--s-muted)]">Paint directly into the photo's pixels — like Photoshop's healing &amp; clone tools.</p>
              <p className="s-label mt-1">Adjust</p>
              <Slider label="Brightness" min={-100} max={100} value={Math.round((filterInfo("brightness") as number) * 100)}
                onChange={(v) => setImageFilter("brightness", v / 100)} />
              <Slider label="Contrast" min={-100} max={100} value={Math.round((filterInfo("contrast") as number) * 100)}
                onChange={(v) => setImageFilter("contrast", v / 100)} />
              <Slider label="Saturation" min={-100} max={100} value={Math.round((filterInfo("saturation") as number) * 100)}
                onChange={(v) => setImageFilter("saturation", v / 100)} />
              <Slider label="Blur" min={0} max={100} value={Math.round((filterInfo("blur") as number) * 100)}
                onChange={(v) => setImageFilter("blur", v / 100)} />
              <div className="flex gap-4">
                <Toggle label="Grayscale" on={filterInfo("grayscale") as boolean} onChange={(v) => setImageFilter("grayscale", v)} />
                <Toggle label="Sepia" on={filterInfo("sepia") as boolean} onChange={(v) => setImageFilter("sepia", v)} />
              </div>
              <Slider label="Opacity" min={10} max={100} value={Math.round((selObj.opacity ?? 1) * 100)}
                onChange={(v) => setProp({ opacity: v / 100 })} />
              <Slider label="Rotation" min={-180} max={180} value={Math.round(selObj.angle ?? 0)}
                onChange={(v) => setProp({ angle: v })} />
              {/* AI background remover — runs fully in-browser (WASM), model cached after first run */}
              <button className="s-list-btn justify-between" disabled={bgBusy}
                onClick={() => void removeBackgroundAI()}>
                <span>{bgBusy ? "Removing background…" : "Remove background"}</span>
                <span className="font-meta text-[8px] px-1.5 py-0.5 rounded border border-[var(--s-line2)]"
                  style={{ color: "var(--dept)", borderColor: "var(--dept)" }}>AI · ON-DEVICE</span>
              </button>
            </>
          )}

          {selObj && sel.kind === "shape" && (
            <>
              <p className="s-label">Element</p>
              <ColorField label="Fill" value={normalizeHex(selObj.fill) ?? "#3b82f6"} disabled={styleLocked} docColors={docColors}
                onChange={(hex) => setProp({ fill: hex })} />
              <div>
                <p className="s-label">Gradient fill</p>
                <GradientEditor fill={selObj.fill} disabled={styleLocked} docColors={docColors}
                  onApply={(a, b, dir) => applyGradient(a, b, dir)}
                  onSolid={(hex) => setProp({ fill: hex })} />
              </div>
              <ColorField label="Stroke" value={normalizeHex(selObj.stroke) ?? "#000000"} disabled={styleLocked} docColors={docColors}
                onChange={(hex) => setProp({ stroke: hex })} />
              <Slider label="Stroke width" min={0} max={60} disabled={styleLocked} value={selObj.strokeWidth ?? 0}
                onChange={(v) => setProp({ strokeWidth: v })} />
              <Slider label="Opacity" min={10} max={100} disabled={styleLocked} value={Math.round((selObj.opacity ?? 1) * 100)}
                onChange={(v) => setProp({ opacity: v / 100 })} />
              {/^rect$/i.test(selObj.type ?? "") && (
                <Slider label="Corner radius" min={0} max={160} disabled={styleLocked}
                  value={Math.round((selObj as unknown as Rect).rx ?? 0)}
                  onChange={(v) => setProp({ rx: v, ry: v })} />
              )}
              <Toggle label="Dashed stroke" disabled={styleLocked} on={!!selObj.strokeDashArray}
                onChange={(v) => setProp({ strokeDashArray: v ? [26, 18] : null })} />
            </>
          )}

          {selObj && sel.kind !== "none" && (
            <>
              <div>
                <p className="s-label">Align</p>
                <div className="flex gap-0.5">
                  {ALIGNS.map((a) => (
                    <TbIcon key={a.id} tip={a.tip} onClick={() => align(a.id)} d={a.d} />
                  ))}
                </div>
                {(() => {
                  const count = fc.current?.getActiveObjects().length ?? 0;
                  const can = sel.kind === "multi" && count >= 3;
                  return (
                    <div className="flex gap-1 mt-1.5">
                      <button className="s-btn s-btn-line grow !px-0" disabled={!can}
                        title={can ? "Space evenly horizontally" : "Select 3+ elements to space evenly"}
                        onClick={() => distribute("h")}>Space ↔</button>
                      <button className="s-btn s-btn-line grow !px-0" disabled={!can}
                        title={can ? "Space evenly vertically" : "Select 3+ elements to space evenly"}
                        onClick={() => distribute("v")}>Space ↕</button>
                    </div>
                  );
                })()}
              </div>

              {sel.kind !== "multi" && (
                <div>
                  <p className="s-label">Position &amp; size</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label><span className="s-label">X</span>
                      <input type="number" className="s-input" value={Math.round(selObj.left ?? 0)} aria-label="X position"
                        onChange={(e) => setProp({ left: Number(e.target.value) || 0 })} /></label>
                    <label><span className="s-label">Y</span>
                      <input type="number" className="s-input" value={Math.round(selObj.top ?? 0)} aria-label="Y position"
                        onChange={(e) => setProp({ top: Number(e.target.value) || 0 })} /></label>
                    <label><span className="s-label">W</span>
                      <input type="number" className="s-input" value={Math.round(selObj.getScaledWidth())} aria-label="Width"
                        onChange={(e) => setSize("w", Number(e.target.value))} /></label>
                    <label><span className="s-label">H</span>
                      <input type="number" className="s-input" value={Math.round(selObj.getScaledHeight())} aria-label="Height"
                        onChange={(e) => setSize("h", Number(e.target.value))} /></label>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <label className="grow"><span className="s-label">Rotate</span>
                      <input type="number" className="s-input" value={Math.round(selObj.angle ?? 0)} aria-label="Rotation"
                        onChange={(e) => setProp({ angle: Number(e.target.value) || 0 })} /></label>
                    <button className={"s-btn s-btn-line mt-3" + (aspectLock ? " s-btn-on" : "")} title="Lock aspect ratio"
                      onClick={() => setAspectLock(!aspectLock)}>
                      {aspectLock ? "Ratio locked" : "Ratio free"}
                    </button>
                  </div>
                </div>
              )}

              {sel.kind !== "multi" && (
                <div>
                  <p className="s-label">Blend &amp; effects</p>
                  <select className="s-input" disabled={styleLocked} aria-label="Blend mode"
                    value={(selObj.globalCompositeOperation as string) ?? "source-over"}
                    onChange={(e) => setProp({ globalCompositeOperation: e.target.value })}>
                    {BLENDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <div className="flex gap-1.5 mt-1.5">
                    <button className="s-btn s-btn-line grow" onClick={() => flipObj("flipX")}>Flip H</button>
                    <button className="s-btn s-btn-line grow" onClick={() => flipObj("flipY")}>Flip V</button>
                  </div>
                  <Toggle label="Drop shadow" disabled={styleLocked} on={!!selObj.shadow}
                    onChange={(v) => setProp({ shadow: v ? new Shadow({ color: "rgba(0,0,0,0.42)", blur: 18, offsetX: 0, offsetY: 8 }) : null })} />
                </div>
              )}

              <div>
                <p className="s-label">Arrange</p>
                <div className="flex gap-0.5">
                  <TbIcon tip="Bring to front · ⌘⇧]" onClick={() => reorderActive("front")} d="M12 3v10 M7 8l5-5 5 5 M4 17h16 M4 21h16" />
                  <TbIcon tip="Bring forward · ⌘]" onClick={() => reorderActive("forward")} d="M12 7v10 M7 12l5-5 5 5 M4 21h16" />
                  <TbIcon tip="Send backward · ⌘[" onClick={() => reorderActive("backward")} d="M12 17V7 M7 12l5 5 5-5 M4 3h16" />
                  <TbIcon tip="Send to back · ⌘⇧[" onClick={() => reorderActive("back")} d="M12 21V11 M7 16l5 5 5-5 M4 3h16 M4 7h16" />
                </div>
              </div>

              {sel.kind !== "multi" && (isAuthor || (selObj.kDeletable !== false && !selObj.kLocked)) && (
                <button className="s-btn s-btn-danger s-btn-line justify-center" onClick={deleteSelection}>Delete element</button>
              )}

              {isAuthor && sel.kind !== "multi" && (
                <div className="border-t border-[var(--s-line)] pt-3">
                  <p className="s-label">Template permissions</p>
                  {([
                    ["kEditable", "Editable"], ["kLocked", "Locked"], ["kMovable", "Movable"],
                    ["kResizable", "Resizable"], ["kRotatable", "Rotatable"], ["kDeletable", "Deletable"],
                    ["kStyleEditable", "Style editable"], ["kReplaceable", "Replaceable"],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-[12px] py-1">
                      <input type="checkbox" className="accent-[var(--dept)]"
                        checked={(selObj[key] as boolean | undefined) ?? (key !== "kLocked" && key !== "kReplaceable")}
                        onChange={(e) => { selObj.set({ [key]: e.target.checked } as Partial<FabricObject>); pushHistory(); setSel((s) => ({ ...s })); }} />
                      {label}
                    </label>
                  ))}
                  <label className="block mt-2"><span className="s-label">Object name</span>
                    <input className="s-input" value={selObj.kName ?? ""} aria-label="Object name"
                      onChange={(e) => { selObj.set({ kName: e.target.value } as Partial<FabricObject>); refreshLayers(); }} /></label>
                  <label className="block mt-2"><span className="s-label">Placeholder field ID</span>
                    <input className="s-input" value={selObj.kPlaceholder ?? ""} placeholder="none" aria-label="Placeholder field ID"
                      onChange={(e) => { selObj.set({ kPlaceholder: e.target.value || undefined } as Partial<FabricObject>); pushHistory(); }} /></label>
                </div>
              )}
            </>
          )}

          <p className="font-meta text-[8.5px] text-[var(--s-muted)] mt-auto pt-4 border-t border-[var(--s-line)] tracking-wider">
            CREATE. CUSTOMIZE. DOWNLOAD. — KON10 STUDIO
          </p>
        </div>
      </div>



      {/* right-click context menu (§30) */}
      {ctx && (() => {
        const safeTop = Math.max(10, Math.min(ctx.y, window.innerHeight - 340));
        const safeLeft = Math.max(10, Math.min(ctx.x, window.innerWidth - 240));
        return (
          <div
            className="s-menu shadow-2xl backdrop-blur-xl"
            style={{
              left: safeLeft,
              top: safeTop,
              maxHeight: "min(calc(100vh - 80px), 340px)",
            }}
          >
            {menuItem("Copy", "⌘C", copySelection, { disabled: sel.kind === "none" })}
            {menuItem("Paste", "⌘V", () => void pasteClipboard(), { disabled: !clipboardRef.current })}
            {menuItem("Duplicate", "⌘D", () => void duplicateSelection(), { disabled: sel.kind === "none" })}
            <div className="s-menu-sep" />
            {menuItem("Bring forward", "⌘]", () => reorderActive("forward"), { disabled: sel.kind === "none" })}
            {menuItem("Send backward", "⌘[", () => reorderActive("backward"), { disabled: sel.kind === "none" })}
            {sel.kind !== "none" && sel.kind !== "multi" && menuItem("Center on canvas", undefined, () => { align("centerX"); align("centerY"); })}
            {(sel.kind === "text" || sel.kind === "shape" || isGroup(selObj)) &&
              menuItem("Rasterize layer", undefined, rasterizeSelection)}
            <div className="s-menu-sep" />
            {menuItem("Copy style", undefined, copyStyle, { disabled: sel.kind === "none" || sel.kind === "multi" })}
            {menuItem("Paste style", undefined, pasteStyle, { disabled: !styleRef.current || sel.kind === "none" })}
            {ctxLayers.length > 1 && (
              <>
                <div className="s-menu-sep" />
                {ctxLayers.map((o, i) => menuItem(
                  `${i === 0 ? "Select" : "Select beneath"}: ${(o as unknown as EditorObject).kName ?? o.type ?? "layer"}`,
                  i === 0 ? "top" : `−${i}`,
                  () => {
                    const c = fc.current; if (!c) return;
                    c.discardActiveObject();
                    c.setActiveObject(o); c.renderAll(); setSel(readSelection(c));
                  }))}
              </>
            )}
            <div className="s-menu-sep" />
            {sel.kind === "multi" && menuItem("Group", "⌘G", groupSelection)}
            {isGroup(selObj) && menuItem("Ungroup", "⌘⇧G", ungroupSelection)}
            {sel.kind !== "none" && sel.kind !== "multi" && menuItem(
              selObj?.kUserLock ? "Unlock" : selObj?.kLocked ? "Unlock (template lock)" : "Lock",
              undefined, () => { if (sel.obj) toggleAnyLock(sel.obj); })}
            <div className="s-menu-sep" />
            {menuItem("Delete", "⌫", deleteSelection, { disabled: sel.kind === "none", danger: true })}
          </div>
        );
      })()}

      {/* smart guide lines (§5) - direct DOM for 120fps smooth performance */}
      <div
        ref={vGuideRef}
        className="s-guide pointer-events-none fixed z-50 transition-none hidden"
        style={{ width: 1.5 }}
      />
      <div
        ref={hGuideRef}
        className="s-guide pointer-events-none fixed z-50 transition-none hidden"
        style={{ height: 1.5 }}
      />

      {/* boot loading (§51) */}
      {booting && (
        <div className="fixed inset-0 z-[130] grid place-items-center s-fade" style={{ background: "var(--s-bg)" }}>
          <div className="flex flex-col items-center gap-4">
            <span className="font-meta text-[10px] tracking-[0.2em] text-[var(--s-muted)]">LOADING YOUR DESIGN…</span>
            <div className="s-bootbar" />
          </div>
        </div>
      )}

      {/* preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-[140] grid place-items-center p-6 s-fade backdrop-blur-md"
          style={{ background: "rgba(0, 0, 0, 0.88)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Design preview"
          onClick={() => setPreview(null)}
        >
          <div className="max-h-full max-w-full overflow-auto flex items-center justify-center p-4">
            <img
              src={preview}
              alt="Design preview"
              className="max-h-[82vh] w-auto block rounded-lg shadow-2xl border border-white/10"
              style={{ boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)" }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <button
            className="fixed top-4 right-4 s-btn s-btn-line !h-9 !px-4 text-[12px] z-10 hover:border-white/40"
            onClick={() => setPreview(null)}
          >
            Close ✕
          </button>
        </div>
      )}

      {/* export dialog (§36–§39) */}
      {exportOpen && doc && (
        <div className="fixed inset-0 z-[140] grid place-items-center p-6 s-fade backdrop-blur-sm" style={{ background: "rgba(0, 0, 0, 0.78)" }}
          role="dialog" aria-modal="true" aria-label="Download design"
          onClick={() => { if (exportPhase === "idle") setExportOpen(false); }}>
          <div className="s-panel2 border border-[var(--s-line2)] rounded-2xl w-full max-w-md p-6 s-pop shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-[var(--s-line)]">
              <div>
                <h2 className="font-display text-lg font-bold uppercase tracking-wider text-white">Export & Download</h2>
                <p className="font-meta text-[9px] text-[var(--s-muted)]">Select resolution, format, and production options</p>
              </div>
              <button className="s-icon-btn !w-7 !h-7 text-[12px]" onClick={() => setExportOpen(false)}>✕</button>
            </div>

            {/* Format list */}
            <div className="flex flex-col gap-1.5 mt-3.5">
              {fmtMeta.filter((f) => fmtAllowed(f.id)).map((f) => (
                <button key={f.id}
                  className={"s-list-btn justify-between !py-2 !px-3 rounded-xl transition-all " + (exportFmt === f.id ? " !border-[var(--dept)] !bg-[color-mix(in_oklab,var(--dept)_12%,transparent)]" : "hover:bg-white/5")}
                  onClick={() => setExportFmt(f.id)}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white uppercase">{f.id}</span>
                    <span className="font-meta text-[11.5px] font-semibold text-zinc-100">{f.name}</span>
                  </div>
                  <span className="text-[11px] text-[var(--s-muted)]">{f.desc}</span>
                </button>
              ))}
            </div>

            {/* Scale / Resolution Multiplier */}
            <div className="mt-3.5 pt-3 border-t border-[var(--s-line)]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11.5px] font-semibold text-zinc-200">Resolution Multiplier</span>
                <span className="font-mono text-[10px] text-amber-400">
                  {canvasSize.width * exportScale} × {canvasSize.height * exportScale} px
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([1, 2, 3] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    className={"py-1.5 px-2 rounded-lg border text-center transition-all " +
                      (exportScale === sc
                        ? "border-amber-400 bg-amber-500/20 text-amber-200 font-bold"
                        : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/10")}
                    onClick={() => setExportScale(sc)}
                  >
                    <div className="text-[12px]">{sc}x</div>
                    <div className="text-[8.5px] font-meta opacity-70">
                      {sc === 1 ? "1x Web" : sc === 2 ? "2x Social (2K)" : "3x Print (4K)"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Transparent Background (PNG / SVG) */}
            {(exportFmt === "png" || exportFmt === "svg") && (
              <div className="mt-3 flex items-center justify-between border-t border-[var(--s-line)] pt-2.5">
                <div>
                  <p className="text-[11.5px] font-semibold text-zinc-200">Transparent Background</p>
                  <p className="font-meta text-[8.5px] text-[var(--s-muted)]">Removes background fill for transparent cutouts/stickers</p>
                </div>
                <Toggle label="Transparent" on={exportTransparent} onChange={setExportTransparent} />
              </div>
            )}

            {/* Quality Slider (JPG) */}
            {exportFmt === "jpg" && (
              <div className="mt-3 border-t border-[var(--s-line)] pt-2.5">
                <Slider label="JPG Quality" min={40} max={100} value={Math.round(exportQuality * 100)} onChange={(v) => setExportQuality(v / 100)} />
              </div>
            )}

            {/* Print Bleed & Crop Marks (PDF) */}
            {exportFmt === "pdf" && (
              <div className="mt-3 flex items-center justify-between border-t border-[var(--s-line)] pt-2.5">
                <div>
                  <p className="text-[11.5px] font-semibold text-zinc-200">Print Bleed & Crop Marks</p>
                  <p className="font-meta text-[8.5px] text-[var(--s-muted)]">Adds corner trim guides for commercial print shops</p>
                </div>
                <Toggle label="Crop marks" on={printCropMarks} onChange={setPrintCropMarks} />
              </div>
            )}

            {/* Design Check */}
            <div className="border-t border-[var(--s-line)] mt-3.5 pt-2.5">
              <p className="s-label mb-1">Pre-flight Check</p>
              <div className="flex flex-col gap-1 max-h-20 overflow-y-auto s-scroll">
                {checks.map((ch, i) => (
                  <p key={i} className="text-[11px] flex items-center gap-1.5"
                    style={{ color: ch.level === "ok" ? "var(--s-muted)" : "#fbbf24" }}>
                    <span>{ch.level === "ok" ? "✓" : "⚠"}</span>{ch.msg}
                  </p>
                ))}
              </div>
            </div>

            {/* Quick Clipboard & Native Share Actions */}
            <div className="grid grid-cols-2 gap-2 mt-3.5 pt-3 border-t border-[var(--s-line)]">
              <button
                type="button"
                className="s-btn s-btn-line !text-[11px] !py-2 flex items-center justify-center gap-1.5"
                onClick={copyImageToClipboard}
                title="Copy full clean image directly to clipboard"
              >
                <span>📋</span> Copy Image
              </button>
              <button
                type="button"
                className="s-btn s-btn-line !text-[11px] !py-2 flex items-center justify-center gap-1.5 text-cyan-300 border-cyan-500/30"
                onClick={shareNative}
                title="Native AirDrop / Share via installed apps"
              >
                <span>📱</span> AirDrop / Share
              </button>
            </div>

            {/* Download Button */}
            <div className="flex gap-2 mt-3">
              {exportPhase === "idle" ? (
                <>
                  <button className="s-btn s-btn-line grow !h-10" onClick={() => setExportOpen(false)}>Cancel</button>
                  <button className="s-btn s-btn-acc grow !h-10 font-bold" onClick={() => void runExport()}>
                    Download {exportFmt.toUpperCase()} ({exportScale}x)
                  </button>
                </>
              ) : (
                <p className="grow text-center font-meta text-[10px] tracking-[0.16em] py-3" role="status"
                  style={{ color: exportPhase === "done" ? "#4ade80" : "var(--dept)" }}>
                  {exportPhase === "prep" ? "PREPARING…" : exportPhase === "render" ? "RENDERING YOUR DESIGN…" : "✓ COMPLETE"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deliver Proof to Client Order Modal */}
      {deliverModalOpen && (
        <div
          className="fixed inset-0 z-[150] grid place-items-center p-4 s-fade backdrop-blur-md"
          style={{ background: "rgba(0, 0, 0, 0.82)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Deliver Proof to Client Order"
          onClick={() => { if (!deliveringProof) setDeliverModalOpen(false); }}
        >
          <div
            className="s-panel2 border border-amber-500/40 rounded-2xl w-full max-w-lg p-6 s-pop shadow-2xl bg-[#141418] text-white flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚀</span>
                <div>
                  <h2 className="font-display text-base font-bold uppercase tracking-wider text-amber-300">
                    Deliver Proof to Client
                  </h2>
                  <p className="font-meta text-[9.5px] text-zinc-400">
                    Publish high-res deliverable to Order Vault and notify client.
                  </p>
                </div>
              </div>
              <button
                disabled={deliveringProof}
                className="s-icon-btn !w-7 !h-7 text-[12px]"
                onClick={() => setDeliverModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Target Order & Recipient Details */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-meta text-[10px] text-zinc-400">Target Order:</span>
                <span className="font-mono text-[11px] font-bold text-amber-300">
                  #{(orderIdParam || design?.orderId || "").toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-meta text-[10px] text-zinc-400">Client Email:</span>
                <span className="font-meta text-[11px] text-zinc-200">
                  {clientParam || design?.email || "Client"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-meta text-[10px] text-zinc-400">Design Title:</span>
                <span className="font-bold text-white truncate max-w-[200px]">
                  {design?.title || tpl?.name || "Customer Artwork"}
                </span>
              </div>
            </div>

            {/* Designer Note / Changelog */}
            <div>
              <label className="font-meta text-[10px] text-zinc-300 block mb-1 uppercase font-bold">
                Designer Notes for Client (Optional):
              </label>
              <textarea
                rows={3}
                value={deliverNote}
                onChange={(e) => setDeliverNote(e.target.value)}
                placeholder="e.g. Adjusted color palette to match your logo, increased font contrast, and aligned text layers."
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-400 placeholder:text-zinc-500"
              />
            </div>

            {/* Action Summary */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl font-meta text-[9.5px] text-amber-200 space-y-1">
              <p>✓ Renders crisp 2x high-resolution PNG proof</p>
              <p>✓ Attaches file to client's Order Deliverables Vault</p>
              <p>✓ Posts notice in the project discussion thread</p>
              <p>✓ Automatically advances order status to <strong>CLIENT REVIEW</strong></p>
            </div>

            {/* Submit & Cancel Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                disabled={deliveringProof}
                onClick={() => setDeliverModalOpen(false)}
                className="btn btn-ghost !py-2 !px-4 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deliveringProof}
                onClick={handleDeliverProof}
                className="btn btn-dept !py-2 !px-5 text-xs font-bold uppercase shadow-lg flex items-center gap-1.5 !bg-amber-400 !text-black hover:!bg-amber-300"
              >
                {deliveringProof ? "Rendering & Delivering…" : "🚀 Confirm & Deliver Proof"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal (2026 Interactive QR & Link Sharing) */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-[140] grid place-items-center p-6 s-fade backdrop-blur-md"
          style={{ background: "rgba(0, 0, 0, 0.85)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Share design"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="s-panel2 border border-[var(--s-line2)] rounded-3xl w-full max-w-md p-6 s-pop shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="text-left">
                <h2 className="font-display text-lg font-bold uppercase tracking-wider text-white">Share Design</h2>
                <p className="font-meta text-[9.5px] text-zinc-400">Scan on mobile, copy link, or share via apps</p>
              </div>
              <button className="s-icon-btn !w-7 !h-7 text-[12px]" onClick={() => setShareOpen(false)}>✕</button>
            </div>

            {/* Mobile QR Code Box */}
            <div className="mt-4 flex flex-col items-center justify-center p-4 rounded-2xl bg-black/40 border border-white/10">
              {shareQrUrl ? (
                <div className="p-2.5 bg-white rounded-xl shadow-lg">
                  <img src={shareQrUrl} alt="Scan to view" className="w-36 h-36 block rounded-lg" />
                </div>
              ) : (
                <div className="w-36 h-36 bg-white/5 animate-pulse rounded-xl" />
              )}
              <p className="text-[11.5px] font-semibold text-zinc-200 mt-2.5">Scan with Phone Camera</p>
              <p className="font-meta text-[9px] text-zinc-400">Instantly test mobile preview on iOS or Android</p>
            </div>

            {/* Direct Link Sharing */}
            <div className="mt-4 text-left">
              <span className="text-[11px] font-semibold text-zinc-300 block mb-1">Shareable Link</span>
              <div className="flex items-center gap-1.5 p-1.5 rounded-xl border border-white/10 bg-white/5">
                <input
                  readOnly
                  value={window.location.href}
                  className="grow bg-transparent text-[11px] text-zinc-300 px-2 outline-none truncate select-all"
                />
                <button
                  type="button"
                  className={"s-btn !h-8 !px-3 text-[11px] font-semibold transition-all " +
                    (shareCopied ? "!bg-emerald-500 text-black" : "s-btn-acc")}
                  onClick={() => {
                    void navigator.clipboard.writeText(window.location.href);
                    setShareCopied(true);
                    toast.success("Link copied to clipboard!");
                    setTimeout(() => setShareCopied(false), 2000);
                  }}
                >
                  {shareCopied ? "✓ Copied" : "Copy Link"}
                </button>
              </div>
            </div>

            {/* Quick Share Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/10">
              <button
                type="button"
                className="s-btn s-btn-line !py-2.5 !text-[11.5px] flex items-center justify-center gap-1.5 text-zinc-200 hover:bg-white/10"
                onClick={copyImageToClipboard}
              >
                <span>📋</span> Copy Image
              </button>
              <button
                type="button"
                className="s-btn s-btn-line !py-2.5 !text-[11.5px] flex items-center justify-center gap-1.5 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/15"
                onClick={shareNative}
              >
                <span>📱</span> AirDrop / Share
              </button>
            </div>
          </div>
        </div>
      )}

      {/* command palette (§32) */}
      {paletteOpen && (
        <div className="fixed inset-0 z-[145] s-fade" style={{ background: "rgb(0 0 0 / 0.6)" }} onClick={() => setPaletteOpen(false)}>
          <div className="mx-auto mt-[11vh] w-full max-w-lg s-panel2 border border-[var(--s-line2)] rounded-2xl overflow-hidden s-pop"
            onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
            <input autoFocus value={paletteQ} onChange={(e) => { setPaletteQ(e.target.value); setPaletteIdx(0); }}
              placeholder="Type a command…"
              aria-label="Command search"
              className="w-full bg-transparent px-5 py-4 text-[15px] outline-none border-b border-[var(--s-line)]"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setPaletteIdx((i) => Math.min(filteredCmds.length - 1, i + 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setPaletteIdx((i) => Math.max(0, i - 1)); }
                if (e.key === "Enter") { const cmd = filteredCmds[paletteIdx]; if (cmd) { setPaletteOpen(false); cmd.run(); } }
              }} />
            <div className="s-scroll max-h-[46vh] overflow-y-auto p-2">
              {filteredCmds.map((c, i) => (
                <button key={c.id} className="s-menu-item" style={i === paletteIdx ? { background: "var(--s-hover)" } : {}}
                  onMouseEnter={() => setPaletteIdx(i)}
                  onClick={() => { setPaletteOpen(false); c.run(); }}>
                  <span>{c.label}</span>
                  {c.hint && <span className="s-menu-kbd">{c.hint}</span>}
                </button>
              ))}
              {!filteredCmds.length && <p className="text-[12.5px] text-[var(--s-muted)] text-center py-6">No commands match "{paletteQ}"</p>}
            </div>
          </div>
        </div>
      )}

      {/* resize design — magic-resize style format presets */}
      {resizeOpen && (
        <div className="fixed inset-0 z-[145] grid place-items-center p-6 s-fade" style={{ background: "rgb(0 0 0 / 0.7)" }}
          role="dialog" aria-modal="true" aria-label="Resize design" onClick={() => setResizeOpen(false)}>
          <div className="s-panel2 border border-[var(--s-line2)] rounded-2xl w-full max-w-md p-6 s-pop" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold uppercase">Resize design</h2>
            <p className="text-[12px] text-[var(--s-muted)] mt-1">Everything scales proportionally and re-centers — every page, nothing distorts.</p>
            <p className="font-meta text-[9px] text-[var(--s-muted)] mt-2 tracking-wider">CURRENT — {canvasSize.width} × {canvasSize.height}</p>
            <div className="flex flex-col gap-1.5 mt-3">
              {RESIZE_PRESETS.filter((p) => p.w !== canvasSize.width || p.h !== canvasSize.height).map((p) => (
                <button key={p.name} className="s-list-btn justify-between" onClick={() => void resizeDoc(p.w, p.h)}>
                  <span>{p.name}</span>
                  <span className="font-meta text-[9.5px] text-[var(--s-muted)]">{p.w} × {p.h}</span>
                </button>
              ))}
            </div>
            <div className="border-t border-[var(--s-line)] mt-4 pt-3">
              <p className="s-label">Custom size</p>
              <div className="flex gap-1.5 items-end">
                <label className="grow"><span className="s-label">W</span>
                  <input type="number" className="s-input" value={customW} aria-label="Custom width"
                    onChange={(e) => setCustomW(Number(e.target.value) || 0)} /></label>
                <label className="grow"><span className="s-label">H</span>
                  <input type="number" className="s-input" value={customH} aria-label="Custom height"
                    onChange={(e) => setCustomH(Number(e.target.value) || 0)} /></label>
                <button className="s-btn s-btn-acc !h-[34px]" disabled={customW < 50 || customH < 50}
                  onClick={() => void resizeDoc(customW, customH)}>Apply</button>
              </div>
            </div>
            <button className="s-btn s-btn-line w-full mt-4 !h-10" onClick={() => setResizeOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* version history — named local snapshots & original master revert */}
      {historyOpen && (
        <div className="fixed inset-0 z-[145] grid place-items-center p-6 s-fade" style={{ background: "rgb(0 0 0 / 0.7)" }}
          role="dialog" aria-modal="true" aria-label="Version history" onClick={() => setHistoryOpen(false)}>
          <div className="s-panel2 border border-[var(--s-line2)] rounded-2xl w-full max-w-lg p-6 s-pop shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h2 className="font-display text-lg font-bold uppercase tracking-wider text-white">Version History</h2>
                <p className="font-meta text-[11px] text-[var(--s-muted)] mt-0.5">Snapshots & clean template recovery</p>
              </div>
              <button className="s-btn s-btn-acc !h-8 !px-3 text-[11.5px] font-bold" onClick={saveSnapshot}>Save snapshot</button>
            </div>

            {/* Pinned Original Template Master Card */}
            <div className="mt-4 p-3.5 rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-cyan-950/40 via-cyan-900/20 to-transparent flex items-center justify-between gap-3 shadow-lg">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-lg shrink-0 shadow-inner">
                🌟
              </div>
              <div className="grow min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-bold text-white truncate">Original Template (Master)</p>
                  <span className="text-[8px] uppercase tracking-wider font-bold bg-cyan-500/30 text-cyan-200 px-1.5 py-0.5 rounded border border-cyan-400/40">Default</span>
                </div>
                <p className="font-meta text-[10px] text-zinc-400 mt-0.5">Reset all layers & design back to pristine published original.</p>
              </div>
              <button
                type="button"
                className="s-btn !h-8 !px-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-[11px] shrink-0 shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                onClick={() => void revertToOriginalTemplate()}
                title="Revert back to the pristine original template"
              >
                <span>↺</span>
                <span>Revert</span>
              </button>
            </div>

            {/* User Saved Snapshots */}
            <div className="mt-4">
              <span className="font-meta text-[9.5px] uppercase tracking-wider text-[var(--s-muted)] font-bold block mb-2">Saved Local Snapshots</span>
              <div className="flex flex-col gap-1.5 s-scroll max-h-[38vh] overflow-y-auto pr-1">
                {!versions.length && (
                  <div className="text-center py-6 px-4 rounded-xl border border-white/5 bg-white/5">
                    <p className="text-[12.5px] text-zinc-300 font-medium">No custom snapshots yet</p>
                    <p className="font-meta text-[10px] text-[var(--s-muted)] mt-1">Tap "Save snapshot" to bookmark any design milestone anytime.</p>
                  </div>
                )}
                {versions.map((v) => (
                  <div key={v.id} className="s-list-btn justify-between !cursor-default !p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all">
                    <img src={v.thumb} alt="" className="w-10 h-10 rounded-lg object-cover border border-[var(--s-line2)] shrink-0" />
                    <div className="grow min-w-0 px-2.5 text-left">
                      <p className="text-[12.5px] font-medium text-white truncate">{v.name}</p>
                      <p className="font-meta text-[9px] text-[var(--s-muted)]">{new Date(v.at).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button className="s-btn s-btn-line !h-7 !px-2.5 !text-[11px] font-bold text-zinc-200 hover:text-white" onClick={() => void restoreVersion(v)}>Restore</button>
                      <button className="s-icon-btn !w-7 !h-7 text-zinc-400 hover:text-rose-400" aria-label="Delete version"
                        onClick={() => setVersions(deleteVersion(snapshotStoreId(), v.id))}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button className="s-btn s-btn-line w-full mt-4 !h-10 font-bold" onClick={() => setHistoryOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {/* ruler context menu (§right click ruler) */}
      {rulerMenu && (
        <>
          {/* backdrop — use onMouseDown so inner button onClick still fires */}
          <div
            className="fixed inset-0 z-[150]"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setRulerMenu(null); }}
            onContextMenu={(e) => { e.preventDefault(); setRulerMenu(null); }}
          />
          <div
            className="fixed z-[151] w-52 overflow-hidden rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.85)]"
            style={{
              left: Math.max(8, Math.min(rulerMenu.x, window.innerWidth - 220)),
              top: Math.max(8, Math.min(rulerMenu.y, window.innerHeight - 380)),
              background: "#0e0e12",
              border: "1px solid rgba(255,255,255,0.12)",
              outline: "1px solid rgba(0,0,0,0.5)",
            }}
          >
            {/* Measurement Units */}
            <div className="px-3 pt-2.5 pb-1 text-[9px] font-mono text-zinc-400 tracking-[0.14em] uppercase font-semibold">Units</div>
            {RULER_UNITS.map((u) => (
              <button
                key={u.id}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] transition-colors text-left ${
                  rulerUnit === u.id
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "text-zinc-200 hover:bg-white/8 hover:text-white"
                }`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setRulerUnit(u.id);
                  try { localStorage.setItem("sk-ruler-unit", u.id); } catch {}
                  setRulerMenu(null);
                  toast.success(`${u.label}`);
                }}
              >
                <span className={`w-7 h-4 rounded text-[9px] font-mono font-bold flex items-center justify-center shrink-0 ${rulerUnit === u.id ? "bg-cyan-500/40 text-cyan-200" : "bg-white/10 text-zinc-300"}`}>
                  {u.symbol}
                </span>
                <span className="grow font-medium">{u.label.split(" ")[0]}</span>
                {rulerUnit === u.id && <span className="text-cyan-400 text-[10px] shrink-0">✓</span>}
              </button>
            ))}

            {/* Divider */}
            <div className="mx-3 my-1.5 border-t border-white/8" />

            {/* Guide Presets */}
            <div className="px-3 pb-1 text-[9px] font-mono text-zinc-400 tracking-[0.14em] uppercase font-semibold">Guides</div>

            <button className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] text-zinc-200 hover:bg-white/8 hover:text-white transition-colors font-medium"
              onMouseDown={(e) => { e.stopPropagation(); setGuideModalOpen(true); setRulerMenu(null); }}>
              <span className="w-4 h-4 flex items-center justify-center text-zinc-400 shrink-0 font-bold text-[14px] leading-none">+</span>
              <span className="grow">Add Guide…</span>
              <span className="text-[9px] text-zinc-500 font-mono shrink-0">⌘;</span>
            </button>

            <button className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] text-zinc-200 hover:bg-white/8 hover:text-white transition-colors"
              onMouseDown={(e) => { e.stopPropagation(); applyGuidePreset("thirds"); setRulerMenu(null); }}>
              <span className="w-4 h-4 flex items-center justify-center text-zinc-400 shrink-0 text-[11px] font-bold">⅓</span>
              <span className="grow">Rule of Thirds</span>
            </button>

            <button className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] text-zinc-200 hover:bg-white/8 hover:text-white transition-colors"
              onMouseDown={(e) => { e.stopPropagation(); applyGuidePreset("crosshairs"); setRulerMenu(null); }}>
              <span className="w-4 h-4 flex items-center justify-center text-zinc-400 shrink-0 text-[11px]">✛</span>
              <span className="grow">Center Crosshairs</span>
            </button>

            <button className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] text-zinc-200 hover:bg-white/8 hover:text-white transition-colors"
              onMouseDown={(e) => { e.stopPropagation(); applyGuidePreset("columns12"); setRulerMenu(null); }}>
              <span className="w-4 h-4 flex items-center justify-center text-zinc-400 shrink-0 text-[10px]">▦</span>
              <span className="grow">12-Column Grid</span>
            </button>

            <button className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] transition-colors ${guidesLocked ? "text-amber-300 hover:bg-amber-500/10" : "text-zinc-200 hover:bg-white/8 hover:text-white"}`}
              onMouseDown={(e) => { e.stopPropagation(); setGuidesLocked(!guidesLocked); setRulerMenu(null); toast.success(guidesLocked ? "Guides unlocked" : "Guides locked"); }}>
              <span className="w-4 h-4 flex items-center justify-center shrink-0 text-[10px]">{guidesLocked ? "🔒" : "🔓"}</span>
              <span className="grow">{guidesLocked ? "Unlock Guides" : "Lock Guides"}</span>
              <span className="text-[9px] text-zinc-500 font-mono shrink-0">⌥⌘;</span>
            </button>

            <button className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] text-zinc-300 hover:bg-white/8 hover:text-zinc-100 transition-colors"
              onMouseDown={(e) => { e.stopPropagation(); setUserGuides({ v: [], h: [] }); setRulerMenu(null); toast.success("All guides cleared"); }}>
              <span className="w-4 h-4 flex items-center justify-center shrink-0 text-[10px] text-zinc-400">✕</span>
              <span className="grow">Clear All Guides</span>
              <span className="text-[9px] text-zinc-500 font-mono shrink-0">⌥;</span>
            </button>

            {/* Divider */}
            <div className="mx-3 my-1.5 border-t border-white/8" />

            <button className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/6 hover:text-white transition-colors"
              onMouseDown={(e) => { e.stopPropagation(); setSafeModalOpen(true); setRulerMenu(null); }}>
              <span className="w-4 h-4 flex items-center justify-center shrink-0 text-[10px]">🛡️</span>
              <span className="grow">Safe Area & Bleed…</span>
            </button>

            <button className="w-full flex items-center gap-2.5 px-3 py-2 pb-2.5 text-[12px] text-zinc-500 hover:bg-white/6 hover:text-zinc-300 transition-colors"
              onMouseDown={(e) => { e.stopPropagation(); setShowRulers(false); setRulerMenu(null); }}>
              <span className="w-4 h-4 flex items-center justify-center shrink-0 text-[10px]">—</span>
              <span className="grow">Hide Rulers</span>
              <span className="text-[9px] text-zinc-600 font-mono shrink-0">⌘R</span>
            </button>
          </div>
        </>
      )}

      {/* guide manager modal */}
      {guideModalOpen && (
        <div className="fixed inset-0 z-[145] grid place-items-center p-6 s-fade" style={{ background: "rgb(0 0 0 / 0.7)" }}
          role="dialog" aria-modal="true" aria-label="Add Guide" onClick={() => setGuideModalOpen(false)}>
          <div className="s-panel2 border border-[var(--s-line2)] rounded-2xl w-full max-w-sm p-6 s-pop flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--s-line)] pb-3">
              <h2 className="font-display text-base font-bold uppercase flex items-center gap-2">
                <span>📐</span> Add Guide
              </h2>
              <span className="font-meta text-[9px] text-cyan-400 font-bold bg-cyan-950/80 border border-cyan-500/40 rounded px-1.5 py-0.5">
                UNIT: {rulerUnit.toUpperCase()}
              </span>
            </div>

            {/* Axis Selector */}
            <div>
              <label className="s-label !mb-1 text-[11px]">Orientation</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`s-btn !h-9 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 ${
                    newGuideAxis === "v" ? "s-btn-acc !bg-cyan-500 !text-black" : "s-btn-line"
                  }`}
                  onClick={() => setNewGuideAxis("v")}
                >
                  <span>Vertical (X)</span>
                </button>
                <button
                  className={`s-btn !h-9 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 ${
                    newGuideAxis === "h" ? "s-btn-acc !bg-cyan-500 !text-black" : "s-btn-line"
                  }`}
                  onClick={() => setNewGuideAxis("h")}
                >
                  <span>Horizontal (Y)</span>
                </button>
              </div>
            </div>

            {/* Coordinate input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="s-label !mb-0 text-[11px]">Position ({rulerUnit})</label>
                <span className="text-[10px] text-zinc-400 font-mono">
                  Max: {Math.round((newGuideAxis === "v" ? canvasSize.width : canvasSize.height) / (RULER_UNITS.find(u => u.id === rulerUnit)?.pxPerUnit || 1))} {rulerUnit}
                </span>
              </div>
              <input
                type="number"
                step={rulerUnit === "in" || rulerUnit === "cm" ? "0.1" : "1"}
                className="s-input !h-10 text-sm font-mono"
                value={newGuideVal}
                autoFocus
                onChange={(e) => setNewGuideVal(parseFloat(e.target.value) || 0)}
                onKeyDown={(e) => { if (e.key === "Enter") addNewCustomGuide(); }}
              />
            </div>

            {/* Quick Presets */}
            <div className="border-t border-[var(--s-line)] pt-3 flex flex-col gap-1.5">
              <span className="s-label !mb-0 text-[10px]">Composition Grids</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button className="s-btn s-btn-line !h-8 text-[11px]" onClick={() => { applyGuidePreset("thirds"); setGuideModalOpen(false); }}>
                  Rule of Thirds
                </button>
                <button className="s-btn s-btn-line !h-8 text-[11px]" onClick={() => { applyGuidePreset("crosshairs"); setGuideModalOpen(false); }}>
                  Center Crosshair
                </button>
                <button className="s-btn s-btn-line !h-8 text-[11px]" onClick={() => { applyGuidePreset("columns12"); setGuideModalOpen(false); }}>
                  12-Column Grid
                </button>
                <button className="s-btn s-btn-line !h-8 text-[11px]" onClick={() => { applyGuidePreset("margins"); setGuideModalOpen(false); }}>
                  5% Margins
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button className="s-btn s-btn-line grow !h-10 text-xs" onClick={() => setGuideModalOpen(false)}>Cancel</button>
              <button className="s-btn s-btn-acc grow !h-10 text-xs !bg-cyan-500 !text-black font-bold shadow-lg" onClick={addNewCustomGuide}>
                Add Guide ⏎
              </button>
            </div>
          </div>
        </div>
      )}

      {/* safe area & bleed modal */}
      {safeModalOpen && (
        <div
          className="fixed inset-0 z-[145] grid place-items-center p-6 s-fade"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSafeModalOpen(false); }}
        >
          <div
            className="w-full max-w-[400px] rounded-2xl overflow-hidden shadow-[0_16px_56px_rgba(0,0,0,0.9)]"
            style={{ background: "#0e0e12", border: "1px solid rgba(255,255,255,0.12)", outline: "1px solid rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <span className="text-base">🛡️</span>
                <div>
                  <h2 className="text-[13px] font-bold text-white tracking-tight">Safe Area & Print Bleed</h2>
                  <p className="text-[9px] font-mono text-zinc-500 tracking-[0.1em] uppercase mt-0.5">Overlay settings</p>
                </div>
              </div>
              <button
                className={`text-[10px] font-mono font-bold px-3 py-1 rounded-full border transition-all ${
                  showSafe
                    ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                    : "bg-white/6 border-white/10 text-zinc-400 hover:text-zinc-200"
                }`}
                onClick={() => setShowSafe(!showSafe)}
              >
                {showSafe ? "ON" : "OFF"}
              </button>
            </div>

            {/* Format Presets */}
            <div className="px-5 pt-4 pb-3">
              <div className="text-[9px] font-mono text-zinc-400 tracking-[0.14em] uppercase font-semibold mb-2.5">Format Presets</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "standard", label: "Flyer Standard", sub: "5% margins", icon: "📄" },
                  { id: "story",    label: "Story / TikTok",  sub: "9:16 safe zone", icon: "📱" },
                  { id: "print",    label: "Commercial Print", sub: "0.125\" bleed", icon: "🖨️" },
                  { id: "square",   label: "Square Post",      sub: "1:1 — 8% safe", icon: "🖼️" },
                ].map((p) => (
                  <button
                    key={p.id}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-0.5 transition-all ${
                      safeConfig.preset === p.id && showSafe
                        ? "border-cyan-500/60 bg-cyan-500/12 text-cyan-200"
                        : "border-white/8 bg-white/4 hover:bg-white/8 hover:border-white/16 text-zinc-200"
                    }`}
                    onClick={() => applySafePreset(p.id as any)}
                  >
                    <span className="text-[11.5px] font-semibold flex items-center gap-1.5">
                      <span>{p.icon}</span> {p.label}
                    </span>
                    <span className="text-[9px] font-mono text-zinc-500 mt-0.5">{p.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Margins — unit-aware */}
            <div className="px-5 pt-3 pb-3 border-t border-white/8">
              {(() => {
                const unitCfg = RULER_UNITS.find(u => u.id === rulerUnit) || RULER_UNITS[0];
                const ppu = unitCfg.pxPerUnit;
                const toDisplay = (px: number) => {
                  const v = px / ppu;
                  return rulerUnit === "px" ? Math.round(v) : Math.round(v * 100) / 100;
                };
                const toPx = (v: number) => Math.round(v * ppu);
                const precision = rulerUnit === "px" ? 0 : 2;
                const step = rulerUnit === "px" ? 1 : rulerUnit === "in" ? 0.05 : rulerUnit === "mm" ? 0.5 : 0.1;
                return (
                  <>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="text-[9px] font-mono text-zinc-400 tracking-[0.14em] uppercase font-semibold">Custom Margins</div>
                      <span className="text-[9px] font-mono text-zinc-600">T · R · B · L  ({unitCfg.symbol})</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {(["top", "right", "bottom", "left"] as const).map((key) => (
                        <div key={key} className="flex flex-col items-center gap-1">
                          <span className="text-[8px] font-mono text-zinc-500 tracking-widest uppercase">
                            {key === "bottom" ? "BTM" : key.slice(0, 3).toUpperCase()}
                          </span>
                          <input
                            type="number"
                            step={step}
                            className="w-full h-9 rounded-lg text-center text-[12px] font-mono font-medium text-zinc-100 bg-white/6 border border-white/10 focus:border-cyan-500/50 focus:outline-none transition-colors"
                            value={toDisplay(safeConfig[key]).toFixed(precision)}
                            onChange={(e) => {
                              const v = toPx(parseFloat(e.target.value) || 0);
                              setSafeConfig((s) => ({ ...s, [key]: v, preset: "custom" }));
                              setShowSafe(true);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Print Bleed Toggle — unit-aware */}
            <div className="px-5 py-3 border-t border-white/8 flex items-center justify-between">
              {(() => {
                const unitCfg = RULER_UNITS.find(u => u.id === rulerUnit) || RULER_UNITS[0];
                const bleedPx = 12;
                const bleedDisplay = Math.round((bleedPx / unitCfg.pxPerUnit) * 1000) / 1000;
                const bleedStr = rulerUnit === "px" ? `${bleedPx}px` : `${bleedDisplay}${unitCfg.symbol}`;
                return (
                  <div>
                    <div className="text-[12.5px] font-medium text-zinc-200">Print Bleed Line</div>
                    <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
                      {bleedStr} ({bleedPx}px) outer cut guide
                    </div>
                  </div>
                );
              })()}
              <button
                className={`relative w-11 h-6 rounded-full border transition-all ${
                  safeConfig.showBleed
                    ? "bg-amber-500/30 border-amber-500/50"
                    : "bg-white/6 border-white/10"
                }`}
                onClick={() => setSafeConfig((s) => ({ ...s, showBleed: !s.showBleed }))}
              >
                <span
                  className={`absolute top-[3px] w-4 h-4 rounded-full transition-all ${
                    safeConfig.showBleed
                      ? "left-[calc(100%-20px)] bg-amber-400"
                      : "left-[3px] bg-zinc-500"
                  }`}
                />
              </button>
            </div>

            {/* Footer Buttons */}
            <div className="px-5 py-4 border-t border-white/8 flex gap-2.5">
              <button
                className="flex-1 h-9 rounded-xl border border-white/10 bg-white/5 text-[12.5px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
                onClick={() => setSafeModalOpen(false)}
              >
                Close
              </button>
              <button
                className="flex-1 h-9 rounded-xl bg-cyan-500 text-[12.5px] font-bold text-black hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
                onClick={() => { setShowSafe(true); setSafeModalOpen(false); toast.success("Safe area updated"); }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* shortcuts modal (§24/§43) */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-[145] grid place-items-center p-6 s-fade" style={{ background: "rgb(0 0 0 / 0.7)" }}
          role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={() => setShortcutsOpen(false)}>
          <div className="s-panel2 border border-[var(--s-line2)] rounded-2xl w-full max-w-md p-6 s-pop" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold uppercase">Keyboard shortcuts</h2>
            <div className="flex flex-col gap-2 mt-4 s-scroll max-h-[55vh] overflow-y-auto pr-1">
              {SHORTCUTS.map(([label, kbd]) => (
                <div key={label} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-[var(--s-text)]">{label}</span>
                  <span className="s-kbd">{kbd}</span>
                </div>
              ))}
            </div>
            <button className="s-btn s-btn-line w-full mt-5 !h-10" onClick={() => setShortcutsOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {/* onboarding (§42) */}
      {onboard !== null && (
        <div className="fixed inset-0 z-[146] grid place-items-center p-6 s-fade" style={{ background: "rgb(0 0 0 / 0.66)" }}
          role="dialog" aria-modal="true" aria-label="Welcome to KON10 Studio">
          <div className="s-panel2 border border-[var(--s-line2)] rounded-2xl w-full max-w-sm p-7 text-center s-pop">
            <span className="font-meta text-[9px] tracking-[0.2em] text-[var(--dept)]">KON10 STUDIO</span>
            <h2 className="font-display text-xl font-bold mt-2">{ONBOARD_STEPS[onboard].title}</h2>
            <p className="text-[13px] text-[var(--s-muted)] mt-3 leading-relaxed">{ONBOARD_STEPS[onboard].body}</p>
            <div className="flex flex-col gap-2 mt-4 text-left">
              {ONBOARD_STEPS[onboard].tips.map((tip) => (
                <p key={tip} className="text-[12px] text-[var(--s-text)] flex items-start gap-2">
                  <span className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ background: "var(--dept)" }} />
                  {tip}
                </p>
              ))}
            </div>
            <div className="flex justify-center gap-1.5 mt-5">
              {ONBOARD_STEPS.map((_, i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i === onboard ? "var(--dept)" : "var(--s-line2)" }} />
              ))}
            </div>
            <div className="flex gap-2 mt-6">
              <button className="s-btn s-btn-line grow !h-10" onClick={finishOnboard}>Skip</button>
              <button className="s-btn s-btn-acc grow !h-10" onClick={() => (onboard < ONBOARD_STEPS.length - 1 ? setOnboard(onboard + 1) : finishOnboard())}>
                {onboard < ONBOARD_STEPS.length - 1 ? "Next" : "Start designing"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* template swap confirm (§46) */}
      {swapFor && (
        <div className="fixed inset-0 z-[146] grid place-items-center p-6 s-fade" style={{ background: "rgb(0 0 0 / 0.7)" }}
          role="dialog" aria-modal="true" aria-label="Change template" onClick={() => setSwapFor(null)}>
          <div className="s-panel2 border border-[var(--s-line2)] rounded-2xl w-full max-w-sm p-7 text-center s-pop" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl font-bold uppercase">Switch to "{swapFor.name}"?</h2>
            <p className="text-[13px] text-[var(--s-muted)] mt-3">Changing templates may replace your current design. Your saved work stays in My Designs.</p>
            <div className="flex gap-2 mt-6">
              <button className="s-btn s-btn-line grow !h-10" onClick={() => setSwapFor(null)}>Cancel</button>
              <button className="s-btn s-btn-acc grow !h-10"
                onClick={() => window.location.assign(isAuthor ? `/editor/author/${swapFor.slug}` : `/editor/${swapFor.slug}`)}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* crash recovery */}
      {restore && (
        <div className="fixed inset-0 z-[146] grid place-items-center p-6 s-fade" style={{ background: "rgb(0 0 0 / 0.7)" }}
          role="dialog" aria-modal="true" aria-label="Unsaved version found">
          <div className="s-panel2 border border-[var(--s-line2)] rounded-2xl p-8 max-w-sm text-center s-pop">
            <h2 className="font-display text-xl font-bold uppercase">We found an unsaved version</h2>
            <p className="text-sm text-[var(--s-muted)] mt-3">It looks like your last session ended before saving finished.</p>
            <div className="flex justify-center gap-2 mt-6">
              <button className="s-btn s-btn-acc !h-10" onClick={async () => {
                const c = fc.current; if (!c) return;
                try {
                  const parsed = JSON.parse(restore) as Kon10Doc;
                  applyingRef.current = true;
                  await c.loadFromJSON(parsed.fabric);
                  applyModePermissions(c);
                  c.renderAll();
                  applyingRef.current = false;
                  pushHistory();
                } catch { editorError("load"); }
                setRestore(null);
              }}>Restore</button>
              <button className="s-btn s-btn-line !h-10" onClick={() => { if (design) clearDraft(design.id); setRestore(null); }}>Discard</button>
            </div>
          </div>
        </div>
      )}

      {/* Animation & Video Studio Modal (§Canva Parity) */}
      {animOpen && (
        <div className="fixed inset-0 z-[140] grid place-items-center p-6 s-fade" style={{ background: "rgb(0 0 0 / 0.72)" }}
          role="dialog" aria-modal="true" aria-label="Animate design"
          onClick={() => setAnimOpen(false)}>
          <div className="s-panel2 border border-[var(--s-line2)] rounded-2xl w-full max-w-md p-6 s-pop flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2">
                <span>✨</span> Motion & Video Studio
              </h2>
              <button className="s-icon-btn !w-6 !h-6" onClick={() => setAnimOpen(false)}>✕</button>
            </div>

            <p className="text-[12px] text-[var(--s-muted)]">
              Choose a motion style to animate your flyer into a high-energy video for Instagram Stories, TikTok, and digital screens.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {ANIMATION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={"s-list-btn !p-2.5 flex items-center gap-2 border rounded-xl transition-all " +
                    (activeAnim === p.id ? "border-cyan-500 bg-cyan-950/40 text-cyan-300" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.06]")}
                  onClick={() => {
                    setActiveAnim(p.id);
                    setTimeout(toggleAnimPreview, 50);
                  }}
                >
                  <span className="text-xl">{p.icon}</span>
                  <div className="text-left">
                    <p className="text-[11.5px] font-bold">{p.name}</p>
                    <p className="font-meta text-[8.5px] opacity-70">{p.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-2 mt-2">
              <button className="s-btn s-btn-line grow !h-10 flex items-center justify-center gap-1.5" onClick={toggleAnimPreview}>
                <span>{animPlaying ? "⏹️ Stop" : "▶️ Play Preview"}</span>
              </button>
              <button className="s-btn s-btn-acc grow !h-10 flex items-center justify-center gap-1.5"
                disabled={recordingVideo}
                onClick={() => void exportAnimatedVideo()}>
                <span>🎥</span> {recordingVideo ? "Recording…" : "Download Video"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Magic Write AI Assistant Modal (§Canva Parity) */}
      {magicWriteOpen && (
        <div className="fixed inset-0 z-[140] grid place-items-center p-6 s-fade" style={{ background: "rgb(0 0 0 / 0.72)" }}
          role="dialog" aria-modal="true" aria-label="Magic Write AI"
          onClick={() => setMagicWriteOpen(false)}>
          <div className="s-panel2 border border-[var(--s-line2)] rounded-2xl w-full max-w-md p-6 s-pop flex flex-col gap-3.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2">
                <span>🪄</span> Magic Write AI Copywriter
              </h2>
              <button className="s-icon-btn !w-6 !h-6" onClick={() => setMagicWriteOpen(false)}>✕</button>
            </div>

            <p className="text-[12px] text-[var(--s-muted)]">
              Select a tone or action to generate high-converting event titles, slogans, and copy.
            </p>

            <input
              className="s-input !py-2"
              placeholder="Custom topic (optional, e.g. Neon Block Party)…"
              value={magicCustomPrompt}
              onChange={(e) => setMagicCustomPrompt(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2 mt-1">
              {MAGIC_WRITE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className="s-list-btn !p-2.5 flex items-center gap-2 border border-white/5 bg-white/[0.02] hover:bg-white/[0.08] rounded-xl"
                  disabled={magicWriteBusy}
                  onClick={() => void runMagicWrite(opt.id)}
                >
                  <span className="text-xl">{opt.icon}</span>
                  <div className="text-left">
                    <p className="text-[11.5px] font-bold text-zinc-200">{opt.label}</p>
                    <p className="font-meta text-[8.5px] text-[var(--s-muted)]">{opt.prompt}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
