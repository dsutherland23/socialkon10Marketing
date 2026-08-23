import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addManaged, listManaged, logAudit, removeManaged, updateManaged,
  type ManagedItem, type ManagedKind,
} from "../lib/backend";
import { useAuth } from "../lib/auth";
import { isQuoteOnly, priceLabel } from "../lib/design";
import { useDesignCatalog } from "../lib/design-shop";

/* ------------------------------------------------------------------
   STUDIO → DESIGN (PRD §32–§41, §58)
   Full no-code control of the graphic design commerce catalog:
   services (inline price editing, duplicate, deactivate, bulk ops,
   CSV import/export), categories, sizes, options, packages, bundle
   discounts and the audit trail. Every write is audit-logged.
------------------------------------------------------------------- */

const inputCls = "bg-transparent border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--dept)] transition-colors w-full";
const labelCls = "font-meta text-[9px] text-[var(--muted)] block";

async function mutate(fn: () => Promise<unknown>, ok: string) {
  try { await fn(); toast.success(ok); return true; }
  catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); return false; }
}

/* ============ generic entity manager (categories/sizes/options/packages/discounts) ============ */

interface FieldDef { key: string; label: string; area?: boolean; optional?: boolean; hint?: string }

function EntityManager({ kind, fields, noun, keyField, blurb }: {
  kind: ManagedKind; fields: FieldDef[]; noun: string; keyField: string; blurb: string;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<ManagedItem[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const reload = () => listManaged(kind).then(setItems);
  useEffect(() => { reload(); }, [kind]);

  const submit = async () => {
    const missing = fields.find((f) => !f.optional && !draft[f.key]?.trim());
    if (missing) { toast.error(`Fill in ${missing.label} first.`); return; }
    const data: Record<string, unknown> = { ...draft };
    ["w", "h", "price", "value", "sort", "minSubtotal", "minItems", "priority", "dpi"].forEach((k) => {
      if (data[k] !== undefined && data[k] !== "") data[k] = Number(data[k]);
    });
    ["featured", "active", "allowCustomSize"].forEach((k) => {
      if (data[k] !== undefined) data[k] = data[k] === "true" || data[k] === true;
    });
    if (typeof data.items === "string") { try { data.items = JSON.parse(data.items as string); } catch { /* keep */ } }
    const auditAction = editingId ? `${noun}_updated` : `${noun}_created`;
    const ok = await mutate(
      () => (editingId ? updateManaged(kind, editingId, data) : addManaged(kind, data)),
      editingId ? "Updated — live now" : "Added — live now"
    );
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: auditAction, entity: `${kind}:${String(data[keyField])}`, after: data });
      setDraft({}); setEditingId(null); reload();
    }
  };

  return (
    <div>
      <p className="font-meta text-[10px] text-[var(--muted)] mb-6 max-w-2xl">{blurb}</p>
      <div className="border border-[var(--line-strong)] p-5 mb-6" style={{ background: "var(--panel)" }}>
        <div className="flex items-center justify-between">
          <span className="idx">/{editingId ? `edit-${noun}` : `add-${noun}`}</span>
          {editingId && <button className="font-meta text-[10px] text-[var(--muted)]" onClick={() => { setEditingId(null); setDraft({}); }}>Cancel ✕</button>}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {fields.map((f) => (
            <label key={f.key} className={`${labelCls} ${f.area ? "sm:col-span-2 lg:col-span-3" : ""}`}>
              {f.label.toUpperCase()}{f.optional ? " (OPT)" : ""}
              {f.area
                ? <textarea rows={2} className={`${inputCls} mt-1.5`} value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                : <input className={`${inputCls} mt-1.5`} value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />}
              {f.hint && <span className="block font-meta text-[8px] normal-case tracking-normal mt-1">{f.hint}</span>}
            </label>
          ))}
        </div>
        <button className="btn btn-dept !py-2.5 mt-4" onClick={submit}>{editingId ? "Update" : "Add"}</button>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.id} className="border border-[var(--line)] px-5 py-3 flex items-center justify-between gap-4 text-sm" style={{ background: "var(--panel)" }}>
            <span className="truncate">{String(it[fields[1]?.key] ?? it[keyField] ?? "")}</span>
            <span className="flex gap-4 shrink-0">
              <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors"
                onClick={() => { const d: Record<string, string> = {}; fields.forEach((f) => { d[f.key] = typeof it[f.key] === "object" ? JSON.stringify(it[f.key]) : String(it[f.key] ?? ""); }); setDraft(d); setEditingId(it.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                Edit
              </button>
              <button className="font-meta text-[10px] text-red-600"
                onClick={async () => { const ok = await mutate(() => removeManaged(kind, it.id), "Removed"); if (ok) { logAudit({ user: user?.email ?? "studio", action: `${noun}_deleted`, entity: `${kind}:${String(it[keyField])}` }); reload(); } }}>
                Remove
              </button>
            </span>
          </div>
        ))}
        {items.length === 0 && <p className="font-meta text-[10px] text-[var(--muted)]">Nothing overridden yet — the shipped defaults are live.</p>}
      </div>
    </div>
  );
}

/* ============ services manager (PRD §33–§35, §38–§39) ============ */

interface ServiceDraft {
  slug: string; name: string; category: string; short: string; price: string;
  pricingType: string; purchaseMode: string; tiers: string;
  minQty: string; maxQty: string; turnaround: string; revisions: string;
  sizeIds: string; defaultSize: string; optionIds: string; recommended: string;
  allowCustomSize: boolean; customLimits: string;
  featured: boolean; popular: boolean; packageEligible: boolean; active: boolean;
}

const blankDraft: ServiceDraft = {
  slug: "", name: "", category: "social-media", short: "", price: "65",
  pricingType: "fixed", purchaseMode: "", tiers: "",
  minQty: "1", maxQty: "50", turnaround: "3–5 days", revisions: "2",
  sizeIds: "", defaultSize: "", optionIds: "", recommended: "",
  allowCustomSize: false, customLimits: "",
  featured: false, popular: false, packageEligible: true, active: true,
};

function ServicesManager() {
  const { user } = useAuth();
  const { services, categories, sizes, options } = useDesignCatalog();
  const [managed, setManaged] = useState<ManagedItem[]>([]);
  const [draft, setDraft] = useState<ServiceDraft>(blankDraft);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [priceEdit, setPriceEdit] = useState<{ slug: string; value: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkPct, setBulkPct] = useState("10");
  const reload = () => listManaged("designServices").then(setManaged);
  useEffect(() => { reload(); }, []);

  const managedIdBySlug = useMemo(() => {
    const m = new Map<string, string>();
    managed.forEach((x) => m.set(String(x.slug ?? ""), x.id));
    return m;
  }, [managed]);

  /** Save an override for a service (seed or managed) keyed by slug. */
  const saveOverride = async (slug: string, data: Record<string, unknown>, action: string, before?: unknown) => {
    const existingId = managedIdBySlug.get(slug);
    const ok = await mutate(
      () => (existingId ? updateManaged("designServices", existingId, { slug, ...data }) : addManaged("designServices", { slug, ...data })),
      "Saved — live now"
    );
    if (ok) { logAudit({ user: user?.email ?? "studio", action, entity: `service:${slug}`, before, after: data }); reload(); }
    return ok;
  };

  /* inline price editing (PRD §34) + price history via audit (§31) */
  const commitPrice = async (slug: string, oldPrice: number) => {
    if (!priceEdit) return;
    const next = Number(priceEdit.value);
    if (!Number.isFinite(next) || next < 0) { toast.error("Enter a valid price."); return; }
    if (next !== oldPrice) {
      await saveOverride(slug, { price: next }, "price_changed", { price: oldPrice });
    }
    setPriceEdit(null);
  };

  const startEdit = (slug: string) => {
    const s = services.find((x) => x.slug === slug);
    if (!s) return;
    setDraft({
      slug: s.slug, name: s.name, category: s.category, short: s.short, price: String(s.price),
      pricingType: s.pricingType,
      purchaseMode: s.purchaseMode ?? "",
      tiers: s.tiers?.length ? JSON.stringify(s.tiers) : "",
      minQty: String(s.minQty), maxQty: String(s.maxQty),
      turnaround: s.turnaround, revisions: String(s.revisions),
      sizeIds: s.sizes.map((x) => x.sizeId).join(", "),
      defaultSize: s.sizes.find((x) => x.isDefault)?.sizeId ?? "",
      optionIds: s.optionIds.join(", "), recommended: s.recommended.join(", "),
      allowCustomSize: !!s.allowCustomSize,
      customLimits: s.customLimits ? JSON.stringify(s.customLimits) : "",
      featured: !!s.featured, popular: !!s.popular, packageEligible: s.packageEligible !== false, active: s.active !== false,
    });
    setEditingSlug(slug);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitEditor = async () => {
    if (!draft.name.trim() || !draft.slug.trim()) { toast.error("Name and slug are required."); return; }
    let customLimits: unknown;
    if (draft.allowCustomSize && draft.customLimits.trim()) {
      try { customLimits = JSON.parse(draft.customLimits); } catch { toast.error("Custom limits must be valid JSON."); return; }
    }
    let tiers: unknown;
    if (draft.tiers.trim()) {
      try {
        const parsed = JSON.parse(draft.tiers);
        if (!Array.isArray(parsed) || parsed.some((t) => !t?.name || !Number.isFinite(Number(t?.price)))) {
          toast.error('Tiers must be a JSON array like [{"name":"Basic","price":45,"blurb":"…"}].'); return;
        }
        tiers = parsed;
      } catch { toast.error("Tiers must be valid JSON."); return; }
    }
    const sizeIds = draft.sizeIds.split(",").map((x) => x.trim()).filter(Boolean);
    const data: Record<string, unknown> = {
      slug: draft.slug.trim(), name: draft.name.trim(), category: draft.category,
      short: draft.short.trim(), price: Number(draft.price) || 0, pricingType: draft.pricingType,
      purchaseMode: draft.purchaseMode || null,
      tiers: tiers ?? null,
      minQty: Number(draft.minQty) || 1, maxQty: Number(draft.maxQty) || 50,
      turnaround: draft.turnaround, revisions: Number(draft.revisions) || 0,
      sizes: sizeIds.map((id) => ({ sizeId: id, isDefault: id === draft.defaultSize || undefined })),
      optionIds: draft.optionIds.split(",").map((x) => x.trim()).filter(Boolean),
      recommended: draft.recommended.split(",").map((x) => x.trim()).filter(Boolean),
      allowCustomSize: draft.allowCustomSize, customLimits,
      featured: draft.featured, popular: draft.popular,
      packageEligible: draft.packageEligible, active: draft.active,
    };
    const before = editingSlug ? services.find((x) => x.slug === editingSlug) : undefined;
    const ok = await saveOverride(draft.slug.trim(), data, editingSlug ? "service_updated" : "service_created", before);
    if (ok) { setDraft(blankDraft); setEditingSlug(null); }
  };

  const duplicate = (slug: string) => {
    const s = services.find((x) => x.slug === slug);
    if (!s) return;
    startEdit(slug);
    setDraft((d) => ({ ...d, slug: `${slug}-copy`, name: `${s.name} (Copy)` }));
    setEditingSlug(null);
    toast.success("Duplicated into the editor — adjust and save.");
  };

  /* bulk operations with preview (PRD §38) */
  const bulk = async (action: "activate" | "deactivate" | "delete" | "price") => {
    if (selected.length === 0) { toast.error("Select services first."); return; }
    if (action === "price") {
      const pct = Number(bulkPct);
      if (!Number.isFinite(pct) || pct === 0) { toast.error("Enter a non-zero %."); return; }
      const current = selected.reduce((sum, sl) => sum + (services.find((x) => x.slug === sl)?.price ?? 0), 0);
      const next = Math.round(current * (1 + pct / 100));
      if (!window.confirm(`Bulk price change ${pct > 0 ? "+" : ""}${pct}%\n\nCurrent total: $${current.toLocaleString()}\nNew total: $${next.toLocaleString()}\n\nApply to ${selected.length} services?`)) return;
      for (const sl of selected) {
        const s = services.find((x) => x.slug === sl);
        if (s) await saveOverride(sl, { price: Math.round(s.price * (1 + pct / 100)) }, "price_changed", { price: s.price });
      }
    } else if (action === "delete") {
      if (!window.confirm(`Delete overrides for ${selected.length} services? Seed services revert to defaults.`)) return;
      for (const sl of selected) {
        const id = managedIdBySlug.get(sl);
        if (id) await mutate(() => removeManaged("designServices", id), "Removed");
        else await saveOverride(sl, { active: false }, "service_deleted");
      }
    } else {
      for (const sl of selected) await saveOverride(sl, { active: action === "activate" }, action === "activate" ? "service_updated" : "service_deleted");
    }
    setSelected([]);
    reload();
  };

  /* CSV export / import (PRD §39) */
  const exportCsv = () => {
    const head = "Service Name,Slug,Category,Description,Price USD,Pricing Type,Turnaround,Revisions,Active,Featured,Package Eligible,Custom Size Allowed";
    const rows = services.map((s) =>
      [s.name, s.slug, s.category, `"${s.short.replace(/"/g, '""')}"`, s.price, s.pricingType, s.turnaround, s.revisions, s.active !== false, !!s.featured, s.packageEligible !== false, !!s.allowCustomSize].join(","));
    const blob = new Blob([[head, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "design-services.csv";
    a.click();
  };

  const importCsv = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const lines = String(reader.result).split("\n").slice(1).filter((l) => l.trim());
      let n = 0;
      for (const line of lines) {
        const cols = line.match(/("([^"]|"")*"|[^,]+)(?=,|$)/g)?.map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim()) ?? [];
        const [name, slug, category, short, price, pricingType, turnaround, revisions, active, featured, pkgElig] = cols;
        if (!name) continue;
        await addManaged("designServices", {
          slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name, category: category || "social-media", short: short ?? "",
          price: Number(price) || 0, pricingType: pricingType || "fixed",
          turnaround: turnaround || "3–5 days", revisions: Number(revisions) || 2,
          active: active !== "false", featured: featured === "true", packageEligible: pkgElig !== "false",
        });
        n++;
      }
      logAudit({ user: user?.email ?? "studio", action: "services_csv_import", entity: `services:${n}` });
      toast.success(`Imported ${n} services — live now`);
      reload();
    };
    reader.readAsText(file);
  };

  return (
    <div>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button className="btn btn-ghost !py-2" onClick={exportCsv}>Export CSV</button>
        <label className="btn btn-ghost !py-2 cursor-pointer">Import CSV
          <input type="file" accept=".csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0])} />
        </label>
        <span className="font-meta text-[9px] text-[var(--muted)] ml-auto">{services.length} live services</span>
      </div>

      {/* bulk bar (PRD §38) */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 border border-[var(--line-strong)] px-4 py-3" style={{ background: "var(--dept-soft)" }}>
          <span className="font-meta text-[10px]">{selected.length} selected</span>
          <button className="font-meta text-[10px] dept-accent" onClick={() => bulk("activate")}>Activate</button>
          <button className="font-meta text-[10px] dept-accent" onClick={() => bulk("deactivate")}>Deactivate</button>
          <span className="inline-flex items-center gap-1">
            <input className={`${inputCls} !w-16 !py-1`} value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} aria-label="Bulk price percent" />
            <button className="font-meta text-[10px] dept-accent" onClick={() => bulk("price")}>Price % (preview)</button>
          </span>
          <button className="font-meta text-[10px] text-red-600" onClick={() => bulk("delete")}>Delete</button>
          <button className="font-meta text-[10px] text-[var(--muted)]" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      {/* editor (PRD §35) */}
      <div className="border border-[var(--line-strong)] p-5 mb-6" style={{ background: "var(--panel)" }}>
        <div className="flex items-center justify-between">
          <span className="idx">/{editingSlug ? "edit-service" : "add-service"}</span>
          {editingSlug && <button className="font-meta text-[10px] text-[var(--muted)]" onClick={() => { setEditingSlug(null); setDraft(blankDraft); }}>Cancel ✕</button>}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          <label className={labelCls}>SERVICE NAME *<input className={`${inputCls} mt-1.5`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className={labelCls}>SLUG *<input className={`${inputCls} mt-1.5`} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></label>
          <label className={labelCls}>CATEGORY
            <select className={`${inputCls} mt-1.5`} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
          <label className={`${labelCls} sm:col-span-2 lg:col-span-3`}>SHORT DESCRIPTION<input className={`${inputCls} mt-1.5`} value={draft.short} onChange={(e) => setDraft({ ...draft, short: e.target.value })} /></label>
          <label className={labelCls}>BASE PRICE USD (0 = quote)<input type="number" min="0" className={`${inputCls} mt-1.5`} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></label>
          <label className={labelCls}>PRICING TYPE
            <select className={`${inputCls} mt-1.5`} value={draft.pricingType} onChange={(e) => setDraft({ ...draft, pricingType: e.target.value })}>
              {["fixed", "starting_at", "per_quantity", "custom_quote"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className={labelCls}>PURCHASE MODE
            <select className={`${inputCls} mt-1.5`} value={draft.purchaseMode} onChange={(e) => setDraft({ ...draft, purchaseMode: e.target.value })}>
              <option value="">Auto (from price/type)</option>
              <option value="DIRECT_PURCHASE">DIRECT_PURCHASE</option>
              <option value="QUOTE_ONLY">QUOTE_ONLY</option>
            </select>
          </label>
          <label className={`${labelCls} lg:col-span-3`}>PACKAGE TIERS (JSON, optional — replaces base price when picked)
            <textarea rows={2} className={`${inputCls} mt-1.5`} placeholder='[{"id":"basic","name":"Basic","price":45,"blurb":"1 concept, 1 revision"},{"id":"standard","name":"Standard","price":65,"blurb":"2 concepts, 2 revisions"}]'
              value={draft.tiers} onChange={(e) => setDraft({ ...draft, tiers: e.target.value })} />
            <span className="block font-meta text-[8px] normal-case tracking-normal mt-1">Each tier: id, name, price (USD), blurb; optional turnaround + revisions. Leave empty to sell at base price only.</span>
          </label>
          <label className={labelCls}>TURNAROUND<input className={`${inputCls} mt-1.5`} value={draft.turnaround} onChange={(e) => setDraft({ ...draft, turnaround: e.target.value })} /></label>
          <label className={labelCls}>MIN QTY<input type="number" min="1" className={`${inputCls} mt-1.5`} value={draft.minQty} onChange={(e) => setDraft({ ...draft, minQty: e.target.value })} /></label>
          <label className={labelCls}>MAX QTY<input type="number" min="1" className={`${inputCls} mt-1.5`} value={draft.maxQty} onChange={(e) => setDraft({ ...draft, maxQty: e.target.value })} /></label>
          <label className={labelCls}>REVISIONS<input type="number" min="0" className={`${inputCls} mt-1.5`} value={draft.revisions} onChange={(e) => setDraft({ ...draft, revisions: e.target.value })} /></label>
          <label className={`${labelCls} lg:col-span-2`}>SIZE IDS (comma-separated)
            <input className={`${inputCls} mt-1.5`} placeholder="d-square, d-story, p-letter" value={draft.sizeIds} onChange={(e) => setDraft({ ...draft, sizeIds: e.target.value })} />
            <span className="block font-meta text-[8px] normal-case tracking-normal mt-1">Available: {sizes.map((z) => z.id).join(", ")}</span>
          </label>
          <label className={labelCls}>DEFAULT SIZE ID<input className={`${inputCls} mt-1.5`} value={draft.defaultSize} onChange={(e) => setDraft({ ...draft, defaultSize: e.target.value })} /></label>
          <label className={`${labelCls} lg:col-span-2`}>OPTION IDS (comma-separated)
            <input className={`${inputCls} mt-1.5`} placeholder="double-sided, rush, source-file" value={draft.optionIds} onChange={(e) => setDraft({ ...draft, optionIds: e.target.value })} />
            <span className="block font-meta text-[8px] normal-case tracking-normal mt-1">Available: {options.map((o) => o.id).join(", ")}</span>
          </label>
          <label className={labelCls}>RECOMMENDED (service slugs)<input className={`${inputCls} mt-1.5`} value={draft.recommended} onChange={(e) => setDraft({ ...draft, recommended: e.target.value })} /></label>
          <div className="flex flex-wrap gap-4 lg:col-span-3 pt-2">
            {([["featured", "Featured"], ["popular", "Popular"], ["packageEligible", "Package eligible"], ["allowCustomSize", "Custom size allowed"], ["active", "Active"]] as const).map(([k, label]) => (
              <label key={k} className="font-meta text-[10px] flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-[var(--dept)]" checked={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} /> {label.toUpperCase()}
              </label>
            ))}
          </div>
          {draft.allowCustomSize && (
            <label className={`${labelCls} lg:col-span-3`}>CUSTOM LIMITS (JSON)
              <input className={`${inputCls} mt-1.5`} placeholder='{"minW":4,"maxW":40,"minH":4,"maxH":12,"unit":"ft"}' value={draft.customLimits} onChange={(e) => setDraft({ ...draft, customLimits: e.target.value })} />
            </label>
          )}
        </div>
        <button className="btn btn-dept !py-2.5 mt-4" onClick={submitEditor}>{editingSlug ? "Update service" : "Add service"}</button>
      </div>

      {/* table (PRD §33) */}
      <div className="overflow-x-auto border border-[var(--line)]">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="font-meta text-[9px] text-[var(--muted)] text-left border-b border-[var(--line-strong)]">
              <th className="p-3 w-8"></th><th className="p-3">Service</th><th className="p-3">Category</th>
              <th className="p-3">Price (click to edit)</th><th className="p-3">Type</th><th className="p-3">Turnaround</th>
              <th className="p-3">Flags</th><th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.slug} className="border-b border-[var(--line)] hover:bg-[var(--dept-soft)] transition-colors">
                <td className="p-3">
                  <input type="checkbox" className="accent-[var(--dept)]" aria-label={`Select ${s.name}`}
                    checked={selected.includes(s.slug)}
                    onChange={(e) => setSelected((xs) => (e.target.checked ? [...xs, s.slug] : xs.filter((x) => x !== s.slug)))} />
                </td>
                <td className="p-3 font-semibold">{s.name}<span className="block font-meta text-[8px] text-[var(--muted)] font-normal">{s.slug}</span></td>
                <td className="p-3 font-meta text-[10px]">{s.category}</td>
                <td className="p-3">
                  {priceEdit?.slug === s.slug ? (
                    <span className="inline-flex items-center gap-2">
                      <input autoFocus type="number" min="0" className={`${inputCls} !w-24 !py-1`} value={priceEdit.value}
                        onChange={(e) => setPriceEdit({ slug: s.slug, value: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") commitPrice(s.slug, s.price); if (e.key === "Escape") setPriceEdit(null); }} />
                      <button className="font-meta text-[10px] dept-accent" onClick={() => commitPrice(s.slug, s.price)}>Save</button>
                    </span>
                  ) : (
                    <button className="font-display-wide font-bold hover:text-[var(--dept)] transition-colors" onClick={() => setPriceEdit({ slug: s.slug, value: String(s.price) })}>
                      {priceLabel(s)}
                    </button>
                  )}
                </td>
                <td className="p-3 font-meta text-[10px]">{s.pricingType}</td>
                <td className="p-3 font-meta text-[10px]">{s.turnaround}</td>
                <td className="p-3 font-meta text-[9px]">
                  {[s.featured && "FEAT", s.popular && "POP", isQuoteOnly(s) ? "QUOTE-ONLY" : s.packageEligible !== false && "PKG", (s.tiers?.length ?? 0) > 0 && "TIERS", s.active === false && "OFF"].filter(Boolean).join(" · ")}
                </td>
                <td className="p-3">
                  <span className="flex gap-3 font-meta text-[10px]">
                    <button className="text-[var(--muted)] hover:text-[var(--dept)] transition-colors" onClick={() => startEdit(s.slug)}>Edit</button>
                    <button className="text-[var(--muted)] hover:text-[var(--dept)] transition-colors" onClick={() => duplicate(s.slug)}>Dupe</button>
                    <button className="text-[var(--muted)] hover:text-[var(--dept)] transition-colors"
                      onClick={() => saveOverride(s.slug, { active: s.active === false }, s.active === false ? "service_updated" : "service_deleted")}>
                      {s.active === false ? "Activate" : "Deactivate"}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ audit log (PRD §41) ============ */

function AuditLog() {
  const [entries, setEntries] = useState<ManagedItem[]>([]);
  useEffect(() => { listManaged("designAudit").then(setEntries); }, []);
  return (
    <div>
      <p className="font-meta text-[10px] text-[var(--muted)] mb-6 max-w-2xl">
        Every catalog change is recorded — user, action, before/after, timestamp (PRD §31/§41). Price history is the stream of <em>price_changed</em> entries.
      </p>
      <div className="flex flex-col gap-2">
        {entries.slice(0, 100).map((e) => (
          <div key={e.id} className="border border-[var(--line)] px-5 py-3 text-sm flex flex-wrap items-baseline gap-x-4 gap-y-1" style={{ background: "var(--panel)" }}>
            <span className="font-meta text-[9px] dept-accent">{String(e.action ?? "")}</span>
            <span className="font-meta text-[10px]">{String(e.entity ?? "")}</span>
            <span className="font-meta text-[9px] text-[var(--muted)]">{String(e.user ?? "")}</span>
            <span className="font-meta text-[9px] text-[var(--muted)] ml-auto">{String(e.at ?? "").slice(0, 19).replace("T", " ")}</span>
            {e.before !== undefined && e.after !== undefined && (
              <span className="w-full font-meta text-[9px] text-[var(--muted)] truncate">
                {JSON.stringify(e.before)} → {JSON.stringify(e.after)}
              </span>
            )}
          </div>
        ))}
        {entries.length === 0 && <p className="font-meta text-[10px] text-[var(--muted)]">No changes logged yet.</p>}
      </div>
    </div>
  );
}

/* ============ studio shell ============ */

const SUBS = ["Services", "Categories", "Sizes", "Options", "Packages", "Discounts", "Audit"] as const;

export function DesignStudio() {
  const [sub, setSub] = useState<(typeof SUBS)[number]>("Services");
  return (
    <div>
      <p className="font-meta text-[10px] text-[var(--muted)] mb-6 max-w-2xl">
        Graphic Design commerce control (PRD §32) — every price, size, option, package and discount is database-driven;
        changes go live instantly, no code deploy. Shipped defaults stay live until you override them here.
      </p>
      <div className="flex flex-wrap gap-2 mb-8" role="tablist" aria-label="Design studio sections">
        {SUBS.map((s) => (
          <button key={s} role="tab" aria-selected={sub === s} onClick={() => setSub(s)}
            className="font-meta text-[10px] px-3 py-1.5 border transition-colors"
            style={sub === s ? { background: "var(--ink)", borderColor: "var(--ink)", color: "var(--bg)" } : { borderColor: "var(--line)" }}>
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {sub === "Services" && <ServicesManager />}
      {sub === "Categories" && (
        <EntityManager kind="designCategories" noun="category" keyField="slug"
          blurb="Design categories (PRD §6). Use a seed slug to override a default category; a new slug adds one."
          fields={[
            { key: "slug", label: "Slug" }, { key: "name", label: "Name" }, { key: "sort", label: "Sort order" },
            { key: "blurb", label: "Description", area: true },
          ]} />
      )}
      {sub === "Sizes" && (
        <EntityManager kind="designSizes" noun="size" keyField="id"
          blurb="Size presets (PRD §8/§13) — dimensions, units, orientation and production specs. Reusable across services."
          fields={[
            { key: "id", label: "ID (e.g. p-letter)" }, { key: "name", label: "Name" }, { key: "unit", label: "Unit (px/in/mm/cm/ft)" },
            { key: "w", label: "Width" }, { key: "h", label: "Height" }, { key: "orientation", label: "Orientation" },
            { key: "format", label: "Format (digital/print/large_format)" }, { key: "bleed", label: "Bleed", optional: true }, { key: "safeArea", label: "Safe area", optional: true },
            { key: "dpi", label: "DPI", optional: true }, { key: "colorMode", label: "Colour mode", optional: true }, { key: "fileFormat", label: "File format", optional: true },
          ]} />
      )}
      {sub === "Options" && (
        <EntityManager kind="designOptions" noun="option" keyField="id"
          blurb="Production add-ons (PRD §14). Pricing: fixed $ or percentage. Scope: project / design / quantity (PRD §16)."
          fields={[
            { key: "id", label: "ID (e.g. rush)" }, { key: "name", label: "Name" }, { key: "pricing", label: "Pricing (fixed/percentage)" },
            { key: "price", label: "Price ($ or %)" }, { key: "scope", label: "Scope (project/design/quantity)" },
            { key: "description", label: "Description", area: true },
          ]} />
      )}
      {sub === "Packages" && (
        <EntityManager kind="designPackages" noun="package" keyField="slug"
          blurb='Predefined packages (PRD §21–§23). Pricing: calculated / fixed / pct_off / fixed_off. Items as JSON: [{"slug":"logo-design","qty":1}]'
          fields={[
            { key: "slug", label: "Slug" }, { key: "name", label: "Name" }, { key: "pricing", label: "Pricing mode" },
            { key: "price", label: "Fixed price", optional: true }, { key: "value", label: "% or $ off", optional: true }, { key: "featured", label: "Featured (true/false)", optional: true },
            { key: "blurb", label: "Description", area: true }, { key: "items", label: "Items (JSON)", area: true },
          ]} />
      )}
      {sub === "Discounts" && (
        <EntityManager kind="designDiscounts" noun="discount" keyField="id"
          blurb="Automatic bundle discounts (PRD §20) — highest priority eligible tier wins. Defaults: 5% over $250, 10% over $500, 15% over $1,000."
          fields={[
            { key: "id", label: "ID (e.g. tier-250)" }, { key: "name", label: "Name" }, { key: "type", label: "Type (percentage/fixed)" },
            { key: "value", label: "Value" }, { key: "minSubtotal", label: "Min subtotal $" }, { key: "minItems", label: "Min items" }, { key: "priority", label: "Priority" },
          ]} />
      )}
      {sub === "Audit" && <AuditLog />}
    </div>
  );
}
