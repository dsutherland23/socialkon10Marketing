/* ------------------------------------------------------------------
   PSD IMPORT (Editor PRD — PSD open support)
   Converts an Adobe Photoshop PSD/PSB binary (ArrayBuffer) into a
   valid Kon10Doc that the Kon10 Editor can load directly.

   Strategy:
   - Each visible raster layer → Image JSON (data-URL src)
   - Each text layer          → Textbox JSON (best-effort font/size)
   - Groups are flattened: the group canvas is composited and placed
     as a single image so blend modes inside the group are preserved.
   - Layer order: PSD stores top→bottom; we reverse so the bottom PSD
     layer lands on the Fabric canvas first (correct z-order).
   - Single-layer or flattened PSD fallback: if no child layers have
     pixels, uses the composite PSD image.

   What ag-psd handles:
   ✓ Raster layers (pixel data)
   ✓ Text layer content + position
   ✓ Group/folder structure
   ✓ Layer visibility, opacity
   ✓ Layer bounds (left/top/width/height)
   ✓ CMYK → RGB conversion (auto)
------------------------------------------------------------------- */

import { initializeCanvas, readPsd, type Layer, type Psd } from "ag-psd";
import { FabricImage, classRegistry } from "fabric";
import type { Template } from "./templates";
import type { Kon10Doc, EditorObject, Kon10Field } from "./editor";
import { stampKon10, parseCanvasSize } from "./editor";

// Explicitly initialize canvas factory for ag-psd in browser environment
if (typeof document !== "undefined") {
  try {
    initializeCanvas(
      (width, height) => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        return c;
      },
      (width, height) => {
        const c = document.createElement("canvas");
        return c.getContext("2d")!.createImageData(width, height);
      }
    );
  } catch (err) {
    console.warn("initializeCanvas error:", err);
  }
}

// Register Fabric class aliases so classRegistry can enliven all variants
try {
  classRegistry.setClass(FabricImage, "FabricImage");
  classRegistry.setClass(FabricImage, "fabricImage");
  classRegistry.setClass(FabricImage, "Image");
  classRegistry.setClass(FabricImage, "image");
} catch {
  // safe ignore
}

/* ---- internal counter for stable kId generation ---- */
let _seq = 0;
function nextId() { return `psd_${++_seq}_${Math.random().toString(36).slice(2, 7)}`; }
function nextName(layer: Layer) {
  return (layer.name || "Layer").slice(0, 48);
}

/* ---- convert layer or psd object to HTMLCanvasElement safely ---- */
function layerToCanvas(layer: Layer | Psd | { canvas?: HTMLCanvasElement; imageData?: unknown }): HTMLCanvasElement | null {
  if (!layer) return null;
  const l = layer as { canvas?: HTMLCanvasElement; imageData?: ImageData | { width: number; height: number; data: Uint8ClampedArray | ArrayLike<number> } };
  if (l.canvas && l.canvas.width > 0 && l.canvas.height > 0) return l.canvas;
  if (l.imageData && l.imageData.width > 0 && l.imageData.height > 0) {
    try {
      const c = document.createElement("canvas");
      c.width = l.imageData.width;
      c.height = l.imageData.height;
      const ctx = c.getContext("2d");
      if (ctx) {
        if (typeof ImageData !== "undefined" && l.imageData instanceof ImageData) {
          ctx.putImageData(l.imageData, 0, 0);
        } else {
          const imgData = ctx.createImageData(l.imageData.width, l.imageData.height);
          imgData.data.set(l.imageData.data);
          ctx.putImageData(imgData, 0, 0);
        }
        return c;
      }
    } catch (e) {
      console.warn("Failed to render layer imageData to canvas:", e);
    }
  }
  return null;
}

/* ---- canvas → data URL (PNG) safely ---- */
function canvasToDataUrl(c: HTMLCanvasElement): string | null {
  try {
    if (!c || c.width <= 0 || c.height <= 0) return null;
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

const BLEND_MODE_MAP: Record<string, string> = {
  "normal": "source-over",
  "pass through": "source-over",
  "multiply": "multiply",
  "screen": "screen",
  "overlay": "overlay",
  "darken": "darken",
  "lighten": "lighten",
  "color dodge": "color-dodge",
  "color burn": "color-burn",
  "hard light": "hard-light",
  "soft light": "soft-light",
  "difference": "difference",
  "exclusion": "exclusion",
  "hue": "hue",
  "saturation": "saturation",
  "color": "color",
  "luminosity": "luminosity",
};

/* ---- build a Fabric Image JSON entry ---- */
function fabricImage(
  dataUrl: string,
  left: number, top: number,
  width: number, height: number,
  name: string,
  opacity: number,
  blendMode?: string,
): EditorObject {
  const compOp = blendMode ? (BLEND_MODE_MAP[blendMode.toLowerCase()] || "source-over") : "source-over";
  const obj: EditorObject = {
    type: "Image",
    version: "7.4.0",
    originX: "left",
    originY: "top",
    left,
    top,
    width,
    height,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity,
    globalCompositeOperation: compOp,
    src: dataUrl,
    crossOrigin: null,
    filters: [],
  };
  stampKon10(obj, name);
  obj.kId = nextId();
  obj.kName = name;
  obj.kEditable = true;
  obj.kMovable = true;
  obj.kResizable = true;
  obj.kRotatable = true;
  obj.kDeletable = true;
  obj.kStyleEditable = false; // image — colour style not applicable
  obj.kReplaceable = true;    // user can swap photo
  obj.kExportable = true;
  return obj;
}

/* ---- build a Fabric Textbox JSON entry (vector fallback) ---- */
function fabricText(
  text: string,
  left: number, top: number,
  width: number,
  name: string,
  fontSize: number,
  color: string,
  opacity: number,
  angle = 0,
  blendMode?: string,
): EditorObject {
  const compOp = blendMode ? (BLEND_MODE_MAP[blendMode.toLowerCase()] || "source-over") : "source-over";
  const obj: EditorObject = {
    type: "Textbox",
    version: "7.4.0",
    originX: "left",
    originY: "top",
    left,
    top,
    angle,
    width: Math.max(width, 40),
    height: Math.max(fontSize * 1.3, 24),
    text,
    fontSize: Math.max(8, Math.round(fontSize)),
    fontFamily: "Arial, sans-serif",
    fontWeight: "normal",
    fill: color,
    opacity,
    globalCompositeOperation: compOp,
    textAlign: "left",
    charSpacing: 0,
    lineHeight: 1.16,
    styles: [],
    editable: true,
  };
  stampKon10(obj, name);
  obj.kId = nextId();
  obj.kName = name;
  obj.kEditable = true;
  obj.kMovable = true;
  obj.kResizable = true;
  obj.kRotatable = true;
  obj.kDeletable = true;
  obj.kStyleEditable = true;
  obj.kReplaceable = false;
  obj.kExportable = true;
  return obj;
}

/* ---- extract a CSS colour string from ag-psd colour ---- */
function psdColor(c: { r: number; g: number; b: number } | undefined): string {
  if (!c) return "#ffffff";
  return `rgb(${c.r},${c.g},${c.b})`;
}

/* ---- recursively walk layers; collect Fabric objects (bottom-up) ---- */
function walkLayers(
  layers: Layer[],
  objects: EditorObject[],
  fields: Kon10Field[],
  psdW: number,
  psdH: number,
  folderPath?: string,
  folderList?: Set<string>,
): void {
  // In ag-psd, layers[0] is the bottom layer (Background) and layers[last] is the topmost foreground.
  // We iterate 0 -> length-1 so bottom layers are added first to Fabric canvas (correct z-order).
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (layer.hidden) continue; // skip invisible layers

    const rawOpacity = typeof layer.opacity === "number" ? layer.opacity : 1;
    const opacity = rawOpacity > 1 ? rawOpacity / 255 : rawOpacity;
    const left    = layer.left ?? 0;
    const top     = layer.top  ?? 0;
    const layerName = nextName(layer);
    const blendMode = layer.blendMode;

    /* ---- group / folder: recursively unpack all child layers with folder preservation ---- */
    if (layer.children?.length) {
      const folderName = folderPath ? `${folderPath} / ${layerName}` : layerName;
      if (folderList) folderList.add(folderName);
      walkLayers(layer.children, objects, fields, psdW, psdH, folderName, folderList);
      continue;
    }

    /* ---- 1. Layer has pre-rendered pixels (Photoshop typography, effects, styles, raster) ---- */
    const layerCanvas = layerToCanvas(layer);
    if (layerCanvas && layerCanvas.width > 0 && layerCanvas.height > 0) {
      const dataUrl = canvasToDataUrl(layerCanvas);
      if (dataUrl) {
        const layerW = layerCanvas.width;
        const layerH = layerCanvas.height;
        const imgObj = fabricImage(dataUrl, left, top, layerW, layerH, layerName, opacity, blendMode);
        if (folderPath) {
          imgObj.kFolder = folderPath;
          imgObj.kGroup = folderPath;
          if (folderList) folderList.add(folderPath);
        }

        // If this was a text layer in Photoshop, record rich typography metadata for instant double-click live conversion
        if (layer.text?.text) {
          const rawText = (layer.text.text ?? "").trim();
          if (rawText) {
            imgObj.kIsPsdText = true;
            imgObj.kPsdText = rawText;
            imgObj.kLayerType = "text";
            imgObj.kFontSize = layer.text.style?.fontSize ?? 36;
            imgObj.kFontColor = psdColor(layer.text.style?.fillColor as { r: number; g: number; b: number } | undefined);
            imgObj.kFontFamily = layer.text.style?.font?.name || "Bebas Neue, Impact, sans-serif";
            const fieldId = `field_${nextId()}`;
            imgObj.kPlaceholder = fieldId;
            fields.push({
              fieldId,
              label: folderPath ? `${folderPath} › ${layerName}` : layerName,
              type: "text",
              required: false,
              maxLength: 200,
              defaultValue: rawText.slice(0, 200),
            });
          }
        } else {
          imgObj.kLayerType = "image";
        }

        objects.push(imgObj);
        continue;
      }
    }

    /* ---- 2. Vector text fallback if no pre-rendered pixel canvas exists ---- */
    if (layer.text?.text) {
      const t = layer.text;
      const rawText = (t.text ?? "").trim();
      if (rawText) {
        const ptSize = t.style?.fontSize ?? 24;
        const color  = psdColor(t.style?.fillColor as { r: number; g: number; b: number } | undefined);
        const w = (layer.right ?? psdW) - left;
        let angle = 0;
        if (Array.isArray(t.transform) && t.transform.length >= 4) {
          angle = Math.round(Math.atan2(t.transform[1], t.transform[0]) * (180 / Math.PI));
        }
        const textObj = fabricText(rawText, left, top, Math.max(w, 40), layerName, ptSize, color, opacity, angle, blendMode);
        if (folderPath) {
          textObj.kFolder = folderPath;
          textObj.kGroup = folderPath;
          if (folderList) folderList.add(folderPath);
        }
        textObj.kLayerType = "text";

        const fieldId = `field_${nextId()}`;
        textObj.kPlaceholder = fieldId;
        fields.push({
          fieldId,
          label: folderPath ? `${folderPath} › ${layerName}` : layerName,
          type: "text",
          required: false,
          maxLength: 200,
          defaultValue: rawText.slice(0, 200),
        });

        objects.push(textObj);
        continue;
      }
    }
  }
}

/* ---- solid background rectangle (fallback only) ---- */
function solidBackground(W: number, H: number, bg: string): EditorObject {
  const obj: EditorObject = {
    type: "Rect",
    version: "7.4.0",
    originX: "left",
    originY: "top",
    left: 0,
    top: 0,
    width: W,
    height: H,
    fill: bg,
    strokeWidth: 0,
    kLocked: true,
    kEditable: false,
    kMovable: false,
    kResizable: false,
    kRotatable: false,
    kDeletable: false,
    kStyleEditable: true,
    kReplaceable: false,
    kExportable: true,
  };
  stampKon10(obj, "Background");
  obj.kId = "psd_background";
  obj.kName = "Background";
  return obj;
}

/* ------------------------------------------------------------------
   PUBLIC API
   parsePsdToFabricJson(buffer, tpl) → Kon10Doc
   Call from the editor or admin panel when a PSD file is uploaded/opened.
------------------------------------------------------------------- */
export async function parsePsdToFabricJson(
  buffer: ArrayBuffer,
  tpl: Partial<Template> & { slug?: string; name?: string; dimensions?: string },
): Promise<Kon10Doc> {
  // reset seq so IDs are deterministic per parse (not per session)
  _seq = 0;

  const psd = readPsd(buffer, {
    skipCompositeImageData: false,  // preserve composite image as fallback
    skipLayerImageData: false,      // read layer pixel data
    useImageData: false,            // generate HTMLCanvasElement in browser
  });

  const W = psd.width || 1080;
  const H = psd.height || 1080;

  const bgColor = "#ffffff";

  const objects: EditorObject[] = [];
  const fields: Kon10Field[]    = [];
  const folderList = new Set<string>();

  // walk all layers (bottom-up: 0 -> length-1)
  if (psd.children?.length) {
    walkLayers(psd.children, objects, fields, W, H, undefined, folderList);
  }

  // Fallback: if no individual layers could be extracted, but composite canvas exists
  if (objects.length === 0) {
    const compositeCanvas = layerToCanvas(psd);
    if (compositeCanvas) {
      const dataUrl = canvasToDataUrl(compositeCanvas);
      if (dataUrl) {
        objects.push(fabricImage(dataUrl, 0, 0, W, H, "Artwork", 1));
      }
    }
  }

  // If completely empty, insert a clean white background
  if (objects.length === 0) {
    objects.push(solidBackground(W, H, bgColor));
  }

  // derive canvas size from template dimensions if stored; fall back to PSD native
  const tplSize = tpl.dimensions ? parseCanvasSize(tpl.dimensions) : null;
  const canvasW = tplSize?.width  ?? W;
  const canvasH = tplSize?.height ?? H;

  // if canvas size differs from PSD size, scale all object positions/sizes proportionally
  if (canvasW !== W || canvasH !== H) {
    const sx = canvasW / W;
    const sy = canvasH / H;
    for (const o of objects) {
      if (typeof o.left   === "number") o.left   = Math.round((o.left   as number) * sx);
      if (typeof o.top    === "number") o.top    = Math.round((o.top    as number) * sy);
      if (typeof o.width  === "number") o.width  = Math.round((o.width  as number) * sx);
      if (typeof o.height === "number") o.height = Math.round((o.height as number) * sy);
      if (typeof o.fontSize === "number") o.fontSize = Math.round((o.fontSize as number) * Math.min(sx, sy));
    }
  }

  const doc: Kon10Doc = {
    schemaVersion: "1.2",
    templateSlug: tpl.slug || "custom",
    canvas: { width: canvasW, height: canvasH, background: bgColor },
    exports: { png: true, jpg: true, pdf: true, svg: false },
    fields,
    folders: Array.from(folderList),
    fabric: {
      version: "7.4.0",
      objects,
      background: bgColor,
    },
  };

  return doc;
}
