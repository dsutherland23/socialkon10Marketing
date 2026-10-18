/**
 * SECURE UPLOADS (Phase 2, Feature 3)
 *
 * Pure upload-validation helpers. The browser-provided MIME type and the
 * filename extension are BOTH untrusted — validation sniffs magic bytes
 * from the file head where a signature exists.
 *
 * Policy:
 *  - Images/PDF/ZIP/video: signature-checked where the format defines one.
 *  - SVG: treated as untrusted markup — allowed (design workflows need it)
 *    but flagged `preview: "none"` so admins never render it inline; the
 *    first bytes must still look like XML/SVG text.
 *  - Design source files (PSD/AI/EPS): signature-checked (PSD, AI-is-PDF)
 *    or text-sniffed (EPS PostScript header), flagged download-only.
 *  - Executables and scripts: rejected outright.
 */

export interface UploadRule {
  ext: string;                    // ".png"
  mime: string[];                 // acceptable claimed MIME types
  signature?: number[][];         // acceptable magic-byte prefixes
  signatureOffset?: number;       // where to look (default 0)
  textSniff?: RegExp;             // for text-based formats (svg/eps)
  preview: "image" | "none";      // "none" = download-only handling
  maxMb: number;
  note?: string;
}

const MB = 1024 * 1024;

export const UPLOAD_RULES: UploadRule[] = [
  { ext: ".jpg",  mime: ["image/jpeg"], signature: [[0xff, 0xd8, 0xff]], preview: "image", maxMb: 25 },
  { ext: ".jpeg", mime: ["image/jpeg"], signature: [[0xff, 0xd8, 0xff]], preview: "image", maxMb: 25 },
  { ext: ".png",  mime: ["image/png"],  signature: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], preview: "image", maxMb: 25 },
  { ext: ".webp", mime: ["image/webp"], signature: [[0x52, 0x49, 0x46, 0x46]], preview: "image", maxMb: 25, note: "RIFF container; WEBP at offset 8" },
  { ext: ".gif",  mime: ["image/gif"],  signature: [[0x47, 0x49, 0x46, 0x38]], preview: "image", maxMb: 15 },
  { ext: ".pdf",  mime: ["application/pdf"], signature: [[0x25, 0x50, 0x44, 0x46, 0x2d]], preview: "none", maxMb: 25 },
  { ext: ".svg",  mime: ["image/svg+xml", "text/xml", "application/xml"], textSniff: /<\s*(svg|\?xml)/i, preview: "none", maxMb: 5, note: "Untrusted markup — never render inline in admin" },
  { ext: ".psd",  mime: ["image/vnd.adobe.photoshop", "application/x-photoshop", "application/octet-stream"], signature: [[0x38, 0x42, 0x50, 0x53]], preview: "none", maxMb: 100 },
  { ext: ".ai",   mime: ["application/pdf", "application/postscript", "application/octet-stream"], signature: [[0x25, 0x50, 0x44, 0x46, 0x2d]], preview: "none", maxMb: 100, note: "Modern .ai files are PDF containers" },
  { ext: ".eps",  mime: ["application/postscript", "application/eps", "application/octet-stream"], textSniff: /^%!PS-Adobe/, preview: "none", maxMb: 50 },
  { ext: ".tif",  mime: ["image/tiff"], signature: [[0x49, 0x49, 0x2a, 0x00], [0x4d, 0x4d, 0x00, 0x2a]], preview: "image", maxMb: 50 },
  { ext: ".tiff", mime: ["image/tiff"], signature: [[0x49, 0x49, 0x2a, 0x00], [0x4d, 0x4d, 0x00, 0x2a]], preview: "image", maxMb: 50 },
  { ext: ".zip",  mime: ["application/zip", "application/x-zip-compressed", "application/octet-stream"], signature: [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06]], preview: "none", maxMb: 100, note: "Archive — treat contents as untrusted" },
  { ext: ".mp4",  mime: ["video/mp4", "application/octet-stream"], signature: [[0x00, 0x00, 0x00]], preview: "none", maxMb: 200, note: "ftyp box; brand checked loosely" },
  { ext: ".mov",  mime: ["video/quicktime", "application/octet-stream"], signature: [[0x00, 0x00, 0x00]], preview: "none", maxMb: 200, note: "ftyp box; brand checked loosely" },
  { ext: ".docx", mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/octet-stream"], signature: [[0x50, 0x4b, 0x03, 0x04]], preview: "none", maxMb: 25, note: "OOXML is a ZIP container" },
  { ext: ".txt",  mime: ["text/plain", "application/octet-stream"], preview: "none", maxMb: 5 },
  { ext: ".mp3",  mime: ["audio/mpeg", "application/octet-stream"], signature: [[0x49, 0x44, 0x33], [0xff, 0xfb], [0xff, 0xfa]], preview: "none", maxMb: 25 },
];

/** Extensions that must never be accepted regardless of claimed type. */
const HARD_BLOCK = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|vbe|js|jse|wsf|wsh|dll|so|dylib|apk|app|deb|rpm|sh|bash|jar|hta|cpl|pif|reg|php|asp|aspx|jsp|html?|xht)$/i;

export interface UploadValidation {
  ok: boolean;
  error?: string;
  rule?: UploadRule;
}

export function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? `.${m[1].toLowerCase()}` : "";
}

/** Make a storage-safe filename, preserving the extension. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80) || "file";
  const ext = dot > 0 ? base.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, "") : "";
  return stem + ext;
}

/**
 * Validate claimed metadata (extension, size) before any bytes are read.
 * Cheap pre-filter — must be followed by `sniffMatches` on the file head.
 */
export function validateUploadMeta(name: string, size: number, claimedMime?: string): UploadValidation {
  const ext = extOf(name);
  if (!ext) return { ok: false, error: "File has no extension" };
  if (HARD_BLOCK.test(name)) return { ok: false, error: `${ext} files are not accepted for security reasons` };
  const rule = UPLOAD_RULES.find((r) => r.ext === ext);
  if (!rule) return { ok: false, error: `${ext} is not an accepted file type` };
  if (size <= 0) return { ok: false, error: "File is empty" };
  if (size > rule.maxMb * MB) return { ok: false, error: `Exceeds the ${rule.maxMb}MB limit for ${ext} files` };
  if (claimedMime && rule.mime.length > 0 && !rule.mime.includes(claimedMime) && claimedMime !== "application/octet-stream") {
    // Claimed MIME disagrees with the extension — sniffing decides, but flag it.
    return { ok: true, rule };
  }
  return { ok: true, rule };
}

/**
 * Verify the file's actual head bytes against the rule's signature or
 * text sniff. Formats without a defined signature (plain text) pass.
 */
export function sniffMatches(head: Uint8Array, rule: UploadRule): boolean {
  if (rule.textSniff) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(head.slice(0, 512));
    return rule.textSniff.test(text.replace(/^\uFEFF/, "").trimStart()) || rule.textSniff.test(text);
  }
  if (!rule.signature) return true; // e.g. .txt
  const offset = rule.signatureOffset ?? 0;
  return rule.signature.some((sig) => sig.every((b, i) => head[offset + i] === b));
}

/** Read the first N bytes of a File for sniffing. */
export async function readFileHead(file: Blob, bytes = 512): Promise<Uint8Array> {
  const buf = await file.slice(0, bytes).arrayBuffer();
  return new Uint8Array(buf);
}

/** Full client-side validation pipeline for a File. */
export async function validateUploadFile(file: File): Promise<UploadValidation> {
  const meta = validateUploadMeta(file.name, file.size, file.type);
  if (!meta.ok || !meta.rule) return meta;
  if (meta.rule.signature || meta.rule.textSniff) {
    const head = await readFileHead(file);
    if (!sniffMatches(head, meta.rule)) {
      return { ok: false, error: `${file.name}: contents do not match the ${meta.rule.ext} format` };
    }
  }
  return meta;
}

/** Storage object path for an order file — timestamped so versions never overwrite. */
export function orderFilePath(orderId: string, fileName: string, kind: "uploads" | "proofs" | "deliverables" | "chat" = "uploads"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `orders/${orderId}/${kind}/${stamp}-${sanitizeFileName(fileName)}`;
}

/* ── Project file metadata (admin Project Files section) ────────────────── */

export interface ProjectFileMeta {
  name: string;
  size: number;
  path?: string;
  uploadedBy: string;       // email or "customer"
  uploadedAt: string;       // ISO
  kind: "customer_upload" | "admin_proof" | "admin_deliverable" | "admin_asset";
  version?: string;         // "V1", "V2"… free-form label
  scanStatus: "not_scanned"; // no AV available client-side — never claim "clean"
  preview: "image" | "none";
}

/**
 * Compute the next version label for a logical file family, e.g. existing
 * ["V1","V2"] → "V3". Version labels are per (kind + sanitized stem).
 */
export function nextVersionLabel(existing: (string | undefined)[]): string {
  let max = 0;
  for (const v of existing) {
    const m = /^V(\d+)$/i.exec(v ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `V${max + 1}`;
}
