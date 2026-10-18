import { describe, it, expect } from "vitest";
import {
  normalizePhone, isValidPhoneDigits, validateTemplate, renderTemplate,
  extractPlaceholders, buildWhatsAppUrl, mergeTemplates, DEFAULT_WHATSAPP_TEMPLATES,
  previewOf,
} from "../whatsapp";

describe("normalizePhone", () => {
  it("accepts full international format", () => {
    expect(normalizePhone("+1 (876) 255-4848")?.e164Digits).toBe("18762554848");
  });
  it("accepts digits with dashes", () => {
    expect(normalizePhone("1-876-255-4848")?.e164Digits).toBe("18762554848");
  });
  it("expands 7-digit local numbers with the default country code", () => {
    expect(normalizePhone("255-4848")?.e164Digits).toBe("18762554848");
  });
  it("expands 10-digit NANP numbers", () => {
    expect(normalizePhone("8762554848")?.e164Digits).toBe("18762554848");
  });
  it("strips 00 international prefix", () => {
    expect(normalizePhone("0018762554848")?.e164Digits).toBe("18762554848");
  });
  it("rejects empty/garbage input", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("call me maybe")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("0123456789012345")).toBeNull(); // starts with 0 / too long
  });
  it("isValidPhoneDigits enforces 8-15 digits, no leading zero", () => {
    expect(isValidPhoneDigits("18762554848")).toBe(true);
    expect(isValidPhoneDigits("023456789")).toBe(false);
    expect(isValidPhoneDigits("1234567")).toBe(false);
  });
});

describe("templates", () => {
  it("all default templates pass validation", () => {
    for (const t of DEFAULT_WHATSAPP_TEMPLATES) {
      expect(validateTemplate(t.body)).toEqual([]);
    }
  });
  it("covers all 11 required scenarios", () => {
    expect(DEFAULT_WHATSAPP_TEMPLATES.length).toBe(11);
  });
  it("flags unknown placeholders", () => {
    expect(validateTemplate("Hi {customer_nmae}")).toEqual(["Unknown placeholder {customer_nmae}"]);
  });
  it("flags empty bodies", () => {
    expect(validateTemplate("   ")).toContain("Template body is empty");
  });
  it("extractPlaceholders dedupes", () => {
    expect(extractPlaceholders("{a} {b} {a}")).toEqual(["a", "b"]);
  });
  it("renderTemplate substitutes known values and reports missing", () => {
    const { text, missing } = renderTemplate("Hi {customer_name}, ref {order_reference}", { customer_name: "Ada" });
    expect(text).toBe("Hi Ada, ref {order_reference}");
    expect(missing).toEqual(["order_reference"]);
  });
  it("mergeTemplates applies overrides by id and keeps defaults", () => {
    const merged = mergeTemplates([{ id: "follow_up", label: "Follow-up", body: "custom {customer_name}" }]);
    expect(merged.length).toBe(11);
    expect(merged.find((t) => t.id === "follow_up")?.body).toBe("custom {customer_name}");
    expect(merged.find((t) => t.id === "new_order_ack")?.body).toContain("Order Reference");
  });
});

describe("buildWhatsAppUrl", () => {
  it("builds an encoded wa.me URL", () => {
    const phone = normalizePhone("+1 876 255 4848")!;
    const url = buildWhatsAppUrl(phone, "Hello Ada!\nLine two & more")!;
    expect(url.startsWith("https://wa.me/18762554848?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Hello Ada!\nLine two & more");
  });
  it("refuses to build a link without a phone", () => {
    expect(buildWhatsAppUrl(null, "hi")).toBeNull();
  });
});

describe("previewOf", () => {
  it("truncates long messages with ellipsis", () => {
    expect(previewOf("x".repeat(300)).length).toBe(200);
    expect(previewOf("short")).toBe("short");
  });
});
