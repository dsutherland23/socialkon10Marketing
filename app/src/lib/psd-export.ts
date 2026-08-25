/* ------------------------------------------------------------------
   PSD EXPORT ENGINE (2026 Kon10 Studio)
   Converts an active Fabric.js canvas, saved Kon10Doc, or image dataURL
   into a real, multi-layered Adobe Photoshop (.psd) binary using ag-psd.
   Preserves customized text, replacement images, opacities, layer
   hierarchy, positions, and composite raster preview.
------------------------------------------------------------------- */

import { initializeCanvas, writePsd, type Layer, type Psd } from "ag-psd";
import { Canvas, FabricImage, classRegistry } from "fabric";
import type { EditorObject, Kon10Doc } from "./editor";

// Register Fabric class aliases so classRegistry can enliven all variants
try {
  classRegistry.setClass(FabricImage, "FabricImage");
  classRegistry.setClass(FabricImage, "fabricImage");
  classRegistry.setClass(FabricImage, "Image");
  classRegistry.setClass(FabricImage, "image");
} catch {
  // safe ignore
}

// Ensure ag-psd canvas factory is initialized in browser
if (typeof document !== "undefined") {
  try {
    initializeCanvas(
      (width, height) => {
        const c = document.createElement("canvas");
        c.width = Math.max(1, width);
        c.height = Math.max(1, height);
        return c;
      },
      (width, height) => {
        const c = document.createElement("canvas");
        return c.getContext("2d")!.createImageData(Math.max(1, width), Math.max(1, height));
      }
    );
  } catch (err) {
    console.warn("ag-psd initializeCanvas warning:", err);
  }
}

/** Converts an image dataURL / PNG into a Photoshop PSD Blob */
export async function exportImageToPsdBlob(dataUrl: string, layerName = "Custom Artwork"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const W = img.naturalWidth || img.width || 1080;
      const H = img.naturalHeight || img.height || 1350;

      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = W;
      layerCanvas.height = H;
      const ctx = layerCanvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);

      const compCanvas = document.createElement("canvas");
      compCanvas.width = W;
      compCanvas.height = H;
      const compCtx = compCanvas.getContext("2d");
      if (compCtx) compCtx.drawImage(img, 0, 0);

      const psdDoc: Psd = {
        width: W,
        height: H,
        children: [
          {
            name: layerName,
            opacity: 1,
            left: 0,
            top: 0,
            right: W,
            bottom: H,
            canvas: layerCanvas,
          },
        ],
        canvas: compCanvas,
      };

      try {
        const buffer = writePsd(psdDoc, { generateThumbnail: true });
        resolve(new Blob([buffer], { type: "image/vnd.adobe.photoshop" }));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image data URL for PSD export"));
    img.src = dataUrl;
  });
}

/** Extracts dimensions from Kon10Doc or Fabric state */
function getDocDimensions(docObj: unknown, fallback = { width: 1080, height: 1350 }): { width: number; height: number } {
  if (!docObj || typeof docObj !== "object") return fallback;
  const d = docObj as { canvas?: { width?: number; height?: number }; width?: number; height?: number };
  const w = d.canvas?.width || d.width || fallback.width;
  const h = d.canvas?.height || d.height || fallback.height;
  return { width: Math.round(w), height: Math.round(h) };
}

/** Extracts the Fabric JSON payload from any doc wrapper */
function extractFabricJson(docObj: unknown): Record<string, any> {
  if (!docObj) return { objects: [] };
  if (typeof docObj === "string") {
    try {
      const parsed = JSON.parse(docObj);
      return extractFabricJson(parsed);
    } catch {
      return { objects: [] };
    }
  }
  const d = docObj as Record<string, any>;
  if (d.fabric && typeof d.fabric === "object") {
    return extractFabricJson(d.fabric);
  }
  if (Array.isArray(d.objects)) {
    return d;
  }
  return d;
}

/** Converts an active Fabric Canvas into a layered Adobe Photoshop PSD Blob */
export async function exportFabricCanvasToPsdBlob(
  canvas: Canvas,
  canvasSize: { width: number; height: number }
): Promise<Blob> {
  const W = Math.round(canvasSize.width || canvas.width || 1080);
  const H = Math.round(canvasSize.height || canvas.height || 1080);

  const objects = canvas.getObjects();
  const psdLayers: Layer[] = [];

  // Capture original state
  const originalBg = canvas.backgroundColor;
  const originalVisibilities = objects.map((o) => o.visible !== false);
  const activeObj = canvas.getActiveObject();
  canvas.discardActiveObject();

  try {
    // 1. Isolate and rasterize each layer cleanly
    canvas.backgroundColor = "transparent";
    objects.forEach((o) => { o.visible = false; });

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (!obj) continue;
      const wasVisible = originalVisibilities[i];

      // Make only this layer visible
      obj.visible = true;
      canvas.renderAll();

      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = W;
      layerCanvas.height = H;
      const ctx = layerCanvas.getContext("2d");

      if (ctx) {
        const sourceEl = canvas.getElement();
        if (sourceEl) {
          ctx.drawImage(sourceEl, 0, 0);
        }

        const raw = obj as unknown as EditorObject;
        const name = raw.kName || (raw.text ? String(raw.text).slice(0, 32) : obj.type || `Layer ${i + 1}`);
        const opacity = typeof obj.opacity === "number" ? Math.max(0, Math.min(1, obj.opacity)) : 1;

        psdLayers.push({
          name,
          opacity,
          hidden: !wasVisible,
          left: 0,
          top: 0,
          right: W,
          bottom: H,
          canvas: layerCanvas,
        });
      }

      // Hide layer again
      obj.visible = false;
    }

    // 2. Restore all layers for the composite preview
    objects.forEach((o, i) => { o.visible = originalVisibilities[i]; });
    canvas.backgroundColor = originalBg;
    canvas.renderAll();

    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = W;
    compositeCanvas.height = H;
    const compCtx = compositeCanvas.getContext("2d");
    if (compCtx) {
      const sourceEl = canvas.getElement();
      if (sourceEl) {
        compCtx.drawImage(sourceEl, 0, 0);
      }
    }

    // Ensure there is at least one layer
    if (psdLayers.length === 0) {
      psdLayers.push({
        name: "Custom Artwork",
        opacity: 1,
        left: 0,
        top: 0,
        right: W,
        bottom: H,
        canvas: compositeCanvas,
      });
    }

    const psdDoc: Psd = {
      width: W,
      height: H,
      children: psdLayers,
      canvas: compositeCanvas,
    };

    const buffer = writePsd(psdDoc, { generateThumbnail: true });
    return new Blob([buffer], { type: "image/vnd.adobe.photoshop" });
  } finally {
    // Always restore canvas to its exact state
    objects.forEach((o, i) => { o.visible = originalVisibilities[i]; });
    canvas.backgroundColor = originalBg;
    if (activeObj) canvas.setActiveObject(activeObj);
    canvas.renderAll();
  }
}

/** Converts a serialized Kon10Doc (or JSON string / image dataURL) into a layered PSD Blob */
export async function exportJsonDocToPsdBlob(
  docJson: string | Kon10Doc | unknown,
  fallbackSize = { width: 1080, height: 1350 }
): Promise<Blob> {
  // If it's a dataURL image, export directly to PSD
  if (typeof docJson === "string" && docJson.startsWith("data:image")) {
    return await exportImageToPsdBlob(docJson, "Custom Artwork");
  }

  let docObj: unknown = docJson;
  if (typeof docJson === "string") {
    try {
      docObj = JSON.parse(docJson);
    } catch {
      throw new Error("Invalid design JSON format.");
    }
  }

  const { width: W, height: H } = getDocDimensions(docObj, fallbackSize);
  const fabricData = extractFabricJson(docObj);

  const hiddenEl = document.createElement("canvas");
  hiddenEl.width = W;
  hiddenEl.height = H;
  hiddenEl.style.display = "none";
  document.body.appendChild(hiddenEl);

  const tempCanvas = new Canvas(hiddenEl, {
    width: W,
    height: H,
    renderOnAddRemove: false,
    enableRetinaScaling: false,
  });

  try {
    await tempCanvas.loadFromJSON(fabricData as Record<string, any>);
    tempCanvas.renderAll();
    return await exportFabricCanvasToPsdBlob(tempCanvas, { width: W, height: H });
  } finally {
    tempCanvas.dispose();
    hiddenEl.remove();
  }
}

/** Triggers an immediate browser download for a PSD Blob */
export function triggerPsdDownload(blob: Blob, filename: string): void {
  const cleanName = filename.endsWith(".psd") ? filename : `${filename}.psd`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = cleanName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
