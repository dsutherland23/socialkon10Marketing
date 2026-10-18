import { describe, it, expect } from "vitest";
import {
  validateUploadMeta, sniffMatches, sanitizeFileName, extOf,
  nextVersionLabel, orderFilePath, UPLOAD_RULES,
} from "../uploads";

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const EXE_HEAD = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // MZ…
const enc = (s: string) => new TextEncoder().encode(s);

describe("validateUploadMeta", () => {
  it("accepts a normal png", () => {
    expect(validateUploadMeta("logo.png", 500_000, "image/png").ok).toBe(true);
  });
  it("rejects executables and scripts outright", () => {
    for (const n of ["evil.exe", "run.bat", "x.ps1", "page.html", "app.php", "s.js"]) {
      expect(validateUploadMeta(n, 100).ok).toBe(false);
    }
  });
  it("rejects unknown extensions", () => {
    const r = validateUploadMeta("data.xyz", 100);
    expect(r.ok).toBe(false);
    expect(r.error).toContain(".xyz");
  });
  it("rejects empty files", () => {
    expect(validateUploadMeta("a.png", 0).ok).toBe(false);
  });
  it("enforces per-type size limits", () => {
    expect(validateUploadMeta("big.svg", 10 * 1024 * 1024).ok).toBe(false); // svg cap is 5MB
    expect(validateUploadMeta("big.mp4", 150 * 1024 * 1024).ok).toBe(true); // mp4 cap is 200MB
  });
  it("flags svg as never-inline-preview", () => {
    const rule = UPLOAD_RULES.find((r) => r.ext === ".svg")!;
    expect(rule.preview).toBe("none");
  });
});

describe("sniffMatches (content validation, not just extension)", () => {
  const pngRule = UPLOAD_RULES.find((r) => r.ext === ".png")!;
  const svgRule = UPLOAD_RULES.find((r) => r.ext === ".svg")!;
  const psdRule = UPLOAD_RULES.find((r) => r.ext === ".psd")!;
  const zipRule = UPLOAD_RULES.find((r) => r.ext === ".zip")!;

  it("accepts real PNG bytes", () => {
    expect(sniffMatches(PNG_HEAD, pngRule)).toBe(true);
  });
  it("rejects an EXE renamed to .png", () => {
    expect(sniffMatches(EXE_HEAD, pngRule)).toBe(false);
  });
  it("accepts svg markup and rejects binary masquerading as svg", () => {
    expect(sniffMatches(enc("<?xml version=\"1.0\"?><svg xmlns=…>"), svgRule)).toBe(true);
    expect(sniffMatches(enc("<svg viewBox=\"0 0 1 1\">"), svgRule)).toBe(true);
    expect(sniffMatches(EXE_HEAD, svgRule)).toBe(false);
  });
  it("checks PSD magic (8BPS)", () => {
    expect(sniffMatches(enc("8BPS\x00\x01"), psdRule)).toBe(true);
    expect(sniffMatches(enc("not a psd"), psdRule)).toBe(false);
  });
  it("checks ZIP/local-header magic", () => {
    expect(sniffMatches(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), zipRule)).toBe(true);
    expect(sniffMatches(enc("nope"), zipRule)).toBe(false);
  });
  it("signature-less text formats pass", () => {
    const txtRule = UPLOAD_RULES.find((r) => r.ext === ".txt")!;
    expect(sniffMatches(enc("anything"), txtRule)).toBe(true);
  });
});

describe("sanitizeFileName", () => {
  it("strips path traversal and unsafe chars", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..\\..\\evil.png")).toBe("evil.png");
    expect(sanitizeFileName("my logo (final) v2.PNG")).toBe("my-logo-final-v2.png");
  });
  it("handles names without extensions", () => {
    expect(sanitizeFileName("brief")).toBe("brief");
  });
});

describe("extOf / versioning / paths", () => {
  it("extOf lowercases", () => {
    expect(extOf("A.JPG")).toBe(".jpg");
    expect(extOf("noext")).toBe("");
  });
  it("nextVersionLabel increments the highest Vn", () => {
    expect(nextVersionLabel([undefined])).toBe("V1");
    expect(nextVersionLabel(["V1", "V2"])).toBe("V3");
    expect(nextVersionLabel(["draft", "V10"])).toBe("V11");
  });
  it("orderFilePath is namespaced, timestamped, and sanitized", () => {
    const p = orderFilePath("order123", "My Logo!.AI", "proofs");
    expect(p.startsWith("orders/order123/proofs/")).toBe(true);
    expect(p.endsWith("-My-Logo.ai")).toBe(true);
  });
});
