import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addManaged, listManaged, logAudit, removeManaged, updateManaged,
  type ManagedItem,
} from "../lib/backend";
import { useAuth } from "../lib/auth";
import {
  isQuoteOnly, packageValue,
  type DesignCategory, type DesignSize, type DesignOption, type DesignPackage, type DesignDiscount,
  type SizeUnit, type Orientation, type FormatType, type AdjType, type OptionScope,
} from "../lib/design";
import { useDesignCatalog } from "../lib/design-shop";
import { useMoney } from "../lib/money";

/* ------------------------------------------------------------------
   STUDIO → DESIGN (PRD §32–§41, §58)
   Full no-code control of the graphic design commerce catalog:
   services (inline price editing, duplicate, deactivate, bulk ops,
   CSV import/export), categories, sizes, options, packages, bundle
   discounts and the audit trail. Every write is audit-logged and
   broadcasted live to the store instantly.
------------------------------------------------------------------- */

const inputCls = "bg-transparent border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--dept)] transition-colors w-full rounded-xl";
const labelCls = "font-meta text-[9px] text-[var(--muted)] block font-semibold mb-1";

async function mutate(fn: () => Promise<unknown>, ok: string) {
  try { await fn(); toast.success(ok); return true; }
  catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); return false; }
}

/* ============ CATEGORIES MANAGER ============ */

function CategoriesManager() {
  const { user } = useAuth();
  const { categories, services } = useDesignCatalog();
  const [managed, setManaged] = useState<ManagedItem[]>([]);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [sort, setSort] = useState("1");
  const [blurb, setBlurb] = useState("");
  const [active, setActive] = useState(true);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const reload = () => listManaged("designCategories").then(setManaged);
  useEffect(() => { reload(); }, []);

  const managedIdBySlug = useMemo(() => {
    const m = new Map<string, string>();
    managed.forEach((x) => m.set(String(x.slug ?? ""), x.id));
    return m;
  }, [managed]);

  const startEdit = (c: DesignCategory) => {
    setSlug(c.slug);
    setName(c.name);
    setSort(String(c.sort ?? 99));
    setBlurb(c.blurb ?? "");
    setActive(c.active !== false);
    setEditingSlug(c.slug);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setSlug("");
    setName("");
    setSort("1");
    setBlurb("");
    setActive(true);
    setEditingSlug(null);
  };

  const submit = async () => {
    if (!name.trim()) { toast.error("Category name is required."); return; }
    const finalSlug = (slug.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-|-$/g, "");
    const data = {
      slug: finalSlug,
      name: name.trim(),
      sort: Number(sort) || 1,
      blurb: blurb.trim(),
      active,
    };
    const existingId = managedIdBySlug.get(finalSlug);
    const ok = await mutate(
      () => (existingId ? updateManaged("designCategories", existingId, data) : addManaged("designCategories", data)),
      editingSlug ? `Category "${name}" updated — live now` : `Category "${name}" added — live now`
    );
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: editingSlug ? "category_updated" : "category_created", entity: `category:${finalSlug}`, after: data });
      cancelEdit();
      reload();
    }
  };

  const toggleActive = async (c: DesignCategory) => {
    const nextActive = c.active === false;
    const existingId = managedIdBySlug.get(c.slug);
    const data = { ...c, active: nextActive };
    const ok = await mutate(
      () => (existingId ? updateManaged("designCategories", existingId, data) : addManaged("designCategories", data)),
      nextActive ? `"${c.name}" activated` : `"${c.name}" hidden`
    );
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: "category_toggled", entity: `category:${c.slug}`, after: { active: nextActive } });
      reload();
    }
  };

  const revertOrDelete = async (c: DesignCategory) => {
    const existingId = managedIdBySlug.get(c.slug);
    if (!existingId) {
      await toggleActive(c);
      return;
    }
    const ok = await mutate(() => removeManaged("designCategories", existingId), "Removed override — reverted to default");
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: "category_reverted", entity: `category:${c.slug}` });
      reload();
    }
  };

  const filtered = categories.filter((c) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) || (c.blurb ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <p className="font-meta text-[10px] text-[var(--muted)] max-w-2xl">
        Design categories (PRD §6) — organized sections in the Design Services Store and Catalog. Edits and additions sync live across all navigation points.
      </p>

      {/* Editor Card */}
      <div className="border border-[var(--line-strong)] p-5 rounded-2xl bg-[var(--panel)] shadow-xs">
        <div className="flex items-center justify-between">
          <span className="idx">/{editingSlug ? `edit-category (${editingSlug})` : "add-category"}</span>
          {editingSlug && (
            <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]" onClick={cancelEdit}>
              Cancel ✕
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <label className={labelCls}>
            CATEGORY NAME *
            <input className={`${inputCls} mt-1`} placeholder="e.g. Social Media Graphics" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={labelCls}>
            SLUG (URL KEY)
            <input className={`${inputCls} mt-1`} placeholder="e.g. social-media" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!editingSlug} />
          </label>
          <label className={labelCls}>
            SORT ORDER #
            <input type="number" min="1" className={`${inputCls} mt-1`} value={sort} onChange={(e) => setSort(e.target.value)} />
          </label>
          <div className="flex items-center pt-6">
            <label className="font-meta text-[10px] flex items-center gap-2 cursor-pointer font-bold">
              <input type="checkbox" className="accent-[var(--dept)] w-4 h-4 rounded" checked={active} onChange={(e) => setActive(e.target.checked)} />
              ACTIVE / VISIBLE IN STORE
            </label>
          </div>
          <label className={`${labelCls} sm:col-span-2 lg:col-span-4`}>
            DESCRIPTION / BLURB
            <textarea rows={2} className={`${inputCls} mt-1`} placeholder="Short summary displayed on category headers and catalog filters..." value={blurb} onChange={(e) => setBlurb(e.target.value)} />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-dept !py-2 !px-4 text-xs font-bold rounded-xl" onClick={submit}>
            {editingSlug ? "Save Category Changes" : "+ Add Category"}
          </button>
          {editingSlug && (
            <button className="btn btn-ghost !py-2 !px-4 text-xs font-bold rounded-xl" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-meta text-[10px] text-[var(--muted)] font-semibold">
          {categories.length} Total Categories ({categories.filter((c) => c.active !== false).length} Active)
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories by name, slug..."
          className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded-xl w-full sm:w-64"
        />
      </div>

      {/* Categories Cards List */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((c) => {
          const isOverridden = managedIdBySlug.has(c.slug);
          const svcCount = services.filter((s) => s.category === c.slug).length;
          const isLive = c.active !== false;
          return (
            <div key={c.slug} className="border border-[var(--line)] p-4 rounded-2xl bg-[var(--panel)] flex flex-col justify-between gap-3 shadow-xs">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-meta text-[8.5px] px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--bg)] font-bold text-[var(--muted)]">
                    Sort #{c.sort ?? 99}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={`font-meta text-[8px] px-2 py-0.5 rounded-full border font-bold ${
                      isLive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : "bg-neutral-500/10 text-neutral-400 border-neutral-500/30"
                    }`}>
                      {isLive ? "LIVE" : "HIDDEN"}
                    </span>
                    {isOverridden && (
                      <span className="font-meta text-[8px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                        OVERRIDE
                      </span>
                    )}
                  </div>
                </div>

                <h4 className="font-display text-sm font-bold uppercase">{c.name}</h4>
                <span className="font-meta text-[9px] text-[var(--muted)] block mt-0.5">/{c.slug}</span>
                <p className="text-xs text-[var(--muted)] mt-2 line-clamp-2">{c.blurb || "No description set."}</p>
                <span className="font-meta text-[9px] dept-accent font-bold mt-2 block">
                  {svcCount} service{svcCount === 1 ? "" : "s"} in this category
                </span>
              </div>

              <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="font-meta text-[10px] dept-accent font-bold hover:underline"
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(c)}
                  className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  {isLive ? "Hide" : "Activate"}
                </button>
                {isOverridden && (
                  <button
                    type="button"
                    onClick={() => revertOrDelete(c)}
                    className="font-meta text-[10px] text-red-500 hover:underline"
                  >
                    Revert
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ SIZES MANAGER ============ */

function SizesManager() {
  const { user } = useAuth();
  const { sizes, services } = useDesignCatalog();
  const [managed, setManaged] = useState<ManagedItem[]>([]);
  const [filterFormat, setFilterFormat] = useState<"ALL" | "digital" | "print" | "large_format">("ALL");
  const [search, setSearch] = useState("");

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [w, setW] = useState("1080");
  const [h, setH] = useState("1080");
  const [unit, setUnit] = useState<SizeUnit>("px");
  const [orientation, setOrientation] = useState<Orientation>("square");
  const [format, setFormat] = useState<FormatType>("digital");
  const [bleed, setBleed] = useState("");
  const [safeArea, setSafeArea] = useState("");
  const [dpi, setDpi] = useState("300");
  const [colorMode, setColorMode] = useState("RGB");
  const [fileFormat, setFileFormat] = useState("PNG / JPG");
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = () => listManaged("designSizes").then(setManaged);
  useEffect(() => { reload(); }, []);

  const managedIdById = useMemo(() => {
    const m = new Map<string, string>();
    managed.forEach((x) => m.set(String(x.id ?? ""), x.id));
    return m;
  }, [managed]);

  const startEdit = (s: DesignSize) => {
    setId(s.id);
    setName(s.name);
    setW(String(s.w));
    setH(String(s.h));
    setUnit(s.unit);
    setOrientation(s.orientation);
    setFormat(s.format);
    setBleed(s.bleed ?? "");
    setSafeArea(s.safeArea ?? "");
    setDpi(s.dpi ? String(s.dpi) : "300");
    setColorMode(s.colorMode ?? "RGB");
    setFileFormat(s.fileFormat ?? "PNG / JPG");
    setActive(s.active !== false);
    setEditingId(s.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setId("");
    setName("");
    setW("1080");
    setH("1080");
    setUnit("px");
    setOrientation("square");
    setFormat("digital");
    setBleed("");
    setSafeArea("");
    setDpi("300");
    setColorMode("RGB");
    setFileFormat("PNG / JPG");
    setActive(true);
    setEditingId(null);
  };

  const submit = async () => {
    if (!name.trim() || !id.trim()) { toast.error("Size ID and Name are required."); return; }
    const data = {
      id: id.trim(),
      name: name.trim(),
      w: Number(w) || 0,
      h: Number(h) || 0,
      unit,
      orientation,
      format,
      bleed: bleed.trim() || undefined,
      safeArea: safeArea.trim() || undefined,
      dpi: Number(dpi) || 300,
      colorMode: colorMode.trim() || undefined,
      fileFormat: fileFormat.trim() || undefined,
      active,
    };
    const existingId = managedIdById.get(id.trim());
    const ok = await mutate(
      () => (existingId ? updateManaged("designSizes", existingId, data) : addManaged("designSizes", data)),
      editingId ? `Size "${name}" updated — live now` : `Size "${name}" added — live now`
    );
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: editingId ? "size_updated" : "size_created", entity: `size:${id.trim()}`, after: data });
      cancelEdit();
      reload();
    }
  };

  const toggleActive = async (s: DesignSize) => {
    const nextActive = s.active === false;
    const existingId = managedIdById.get(s.id);
    const data = { ...s, active: nextActive };
    const ok = await mutate(
      () => (existingId ? updateManaged("designSizes", existingId, data) : addManaged("designSizes", data)),
      nextActive ? `"${s.name}" activated` : `"${s.name}" hidden`
    );
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: "size_toggled", entity: `size:${s.id}`, after: { active: nextActive } });
      reload();
    }
  };

  const revertOrDelete = async (s: DesignSize) => {
    const existingId = managedIdById.get(s.id);
    if (!existingId) {
      await toggleActive(s);
      return;
    }
    const ok = await mutate(() => removeManaged("designSizes", existingId), "Removed override — reverted to default");
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: "size_reverted", entity: `size:${s.id}` });
      reload();
    }
  };

  const filtered = sizes.filter((s) => {
    if (filterFormat !== "ALL" && s.format !== filterFormat) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || `${s.w}x${s.h}`.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <p className="font-meta text-[10px] text-[var(--muted)] max-w-2xl">
        Size presets (PRD §8/§13) — dimensions, units, orientation, and production specs. Reusable across services and integrated into the Kon10 Vector Editor.
      </p>

      {/* Editor Card */}
      <div className="border border-[var(--line-strong)] p-5 rounded-2xl bg-[var(--panel)] shadow-xs">
        <div className="flex items-center justify-between">
          <span className="idx">/{editingId ? `edit-size (${editingId})` : "add-size-preset"}</span>
          {editingId && (
            <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]" onClick={cancelEdit}>
              Cancel ✕
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <label className={labelCls}>
            SIZE ID *
            <input className={`${inputCls} mt-1`} placeholder="e.g. d-ig-post" value={id} onChange={(e) => setId(e.target.value)} disabled={!!editingId} />
          </label>
          <label className={labelCls}>
            SIZE NAME *
            <input className={`${inputCls} mt-1`} placeholder="e.g. Instagram Square Post" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={labelCls}>
            WIDTH *
            <input type="number" step="any" className={`${inputCls} mt-1`} value={w} onChange={(e) => setW(e.target.value)} />
          </label>
          <label className={labelCls}>
            HEIGHT *
            <input type="number" step="any" className={`${inputCls} mt-1`} value={h} onChange={(e) => setH(e.target.value)} />
          </label>
          <label className={labelCls}>
            UNIT
            <select className={`${inputCls} mt-1`} value={unit} onChange={(e) => setUnit(e.target.value as SizeUnit)}>
              {["px", "in", "mm", "cm", "ft"].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className={labelCls}>
            ORIENTATION
            <select className={`${inputCls} mt-1`} value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)}>
              {["square", "portrait", "landscape", "auto"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className={labelCls}>
            FORMAT
            <select className={`${inputCls} mt-1`} value={format} onChange={(e) => setFormat(e.target.value as FormatType)}>
              {["digital", "print", "large_format"].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className={labelCls}>
            DPI
            <input type="number" className={`${inputCls} mt-1`} value={dpi} onChange={(e) => setDpi(e.target.value)} />
          </label>
          <label className={labelCls}>
            BLEED (OPTIONAL)
            <input className={`${inputCls} mt-1`} placeholder="e.g. 0.125 in" value={bleed} onChange={(e) => setBleed(e.target.value)} />
          </label>
          <label className={labelCls}>
            SAFE AREA (OPTIONAL)
            <input className={`${inputCls} mt-1`} placeholder="e.g. 0.25 in" value={safeArea} onChange={(e) => setSafeArea(e.target.value)} />
          </label>
          <label className={labelCls}>
            COLOR MODE
            <input className={`${inputCls} mt-1`} placeholder="e.g. CMYK or RGB" value={colorMode} onChange={(e) => setColorMode(e.target.value)} />
          </label>
          <div className="flex items-center pt-6">
            <label className="font-meta text-[10px] flex items-center gap-2 cursor-pointer font-bold">
              <input type="checkbox" className="accent-[var(--dept)] w-4 h-4 rounded" checked={active} onChange={(e) => setActive(e.target.checked)} />
              ACTIVE IN CATALOG
            </label>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-dept !py-2 !px-4 text-xs font-bold rounded-xl" onClick={submit}>
            {editingId ? "Save Size Changes" : "+ Add Size Preset"}
          </button>
          {editingId && (
            <button className="btn btn-ghost !py-2 !px-4 text-xs font-bold rounded-xl" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Filter Format Pills & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {[
            { id: "ALL", label: `All Sizes (${sizes.length})` },
            { id: "digital", label: `Digital (${sizes.filter((s) => s.format === "digital").length})` },
            { id: "print", label: `Print (${sizes.filter((s) => s.format === "print").length})` },
            { id: "large_format", label: `Large Format (${sizes.filter((s) => s.format === "large_format").length})` },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setFilterFormat(pill.id as any)}
              className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
                filterFormat === pill.id
                  ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-bold shadow-xs"
                  : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sizes by name, ID, dimensions…"
          className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded-xl w-full sm:w-64"
        />
      </div>

      {/* Sizes Cards Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((s) => {
          const isOverridden = managedIdById.has(s.id);
          const isLive = s.active !== false;
          const usageCount = services.filter((svc) => svc.sizes?.some((z) => z.sizeId === s.id)).length;
          return (
            <div key={s.id} className="border border-[var(--line)] p-4 rounded-2xl bg-[var(--panel)] flex flex-col justify-between gap-3 shadow-xs">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-meta text-[8.5px] px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--bg)] font-bold uppercase text-[var(--muted)]">
                    {s.format} · {s.orientation}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={`font-meta text-[8px] px-2 py-0.5 rounded-full border font-bold ${
                      isLive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : "bg-neutral-500/10 text-neutral-400 border-neutral-500/30"
                    }`}>
                      {isLive ? "LIVE" : "HIDDEN"}
                    </span>
                    {isOverridden && (
                      <span className="font-meta text-[8px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                        OVERRIDE
                      </span>
                    )}
                  </div>
                </div>

                <h4 className="font-display text-xs font-bold uppercase truncate">{s.name}</h4>
                <p className="font-display font-bold text-sm dept-accent mt-1">
                  {s.w} × {s.h} {s.unit}
                </p>
                <span className="font-meta text-[8.5px] text-[var(--muted)] block mt-1">ID: {s.id} · {s.dpi ?? 300} DPI · {s.colorMode ?? "RGB"}</span>
                {s.bleed && <span className="font-meta text-[8px] text-[var(--muted)] block">Bleed: {s.bleed}</span>}
                <span className="font-meta text-[8.5px] text-[var(--muted)] mt-2 block">
                  Used by {usageCount} service{usageCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  className="font-meta text-[10px] dept-accent font-bold hover:underline"
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(s)}
                  className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  {isLive ? "Hide" : "Activate"}
                </button>
                {isOverridden && (
                  <button
                    type="button"
                    onClick={() => revertOrDelete(s)}
                    className="font-meta text-[10px] text-red-500 hover:underline"
                  >
                    Revert
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ OPTIONS MANAGER ============ */

function OptionsManager() {
  const { user } = useAuth();
  const money = useMoney();
  const { options, services } = useDesignCatalog();
  const [managed, setManaged] = useState<ManagedItem[]>([]);
  const [search, setSearch] = useState("");

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [pricing, setPricing] = useState<AdjType>("fixed");
  const [price, setPrice] = useState("50");
  const [scope, setScope] = useState<OptionScope>("project");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = () => listManaged("designOptions").then(setManaged);
  useEffect(() => { reload(); }, []);

  const managedIdById = useMemo(() => {
    const m = new Map<string, string>();
    managed.forEach((x) => m.set(String(x.id ?? ""), x.id));
    return m;
  }, [managed]);

  const startEdit = (o: DesignOption) => {
    setId(o.id);
    setName(o.name);
    setPricing(o.pricing);
    setPrice(String(o.price));
    setScope(o.scope);
    setDescription(o.description ?? "");
    setActive(o.active !== false);
    setEditingId(o.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setId("");
    setName("");
    setPricing("fixed");
    setPrice("50");
    setScope("project");
    setDescription("");
    setActive(true);
    setEditingId(null);
  };

  const submit = async () => {
    if (!name.trim() || !id.trim()) { toast.error("Option ID and Name are required."); return; }
    const data = {
      id: id.trim(),
      name: name.trim(),
      pricing,
      price: Number(price) || 0,
      scope,
      description: description.trim(),
      active,
    };
    const existingId = managedIdById.get(id.trim());
    const ok = await mutate(
      () => (existingId ? updateManaged("designOptions", existingId, data) : addManaged("designOptions", data)),
      editingId ? `Option "${name}" updated — live now` : `Option "${name}" added — live now`
    );
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: editingId ? "option_updated" : "option_created", entity: `option:${id.trim()}`, after: data });
      cancelEdit();
      reload();
    }
  };

  const toggleActive = async (o: DesignOption) => {
    const nextActive = o.active === false;
    const existingId = managedIdById.get(o.id);
    const data = { ...o, active: nextActive };
    const ok = await mutate(
      () => (existingId ? updateManaged("designOptions", existingId, data) : addManaged("designOptions", data)),
      nextActive ? `"${o.name}" activated` : `"${o.name}" hidden`
    );
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: "option_toggled", entity: `option:${o.id}`, after: { active: nextActive } });
      reload();
    }
  };

  const revertOrDelete = async (o: DesignOption) => {
    const existingId = managedIdById.get(o.id);
    if (!existingId) {
      await toggleActive(o);
      return;
    }
    const ok = await mutate(() => removeManaged("designOptions", existingId), "Removed override — reverted to default");
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: "option_reverted", entity: `option:${o.id}` });
      reload();
    }
  };

  const filtered = options.filter((o) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q) || o.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <p className="font-meta text-[10px] text-[var(--muted)] max-w-2xl">
        Production add-on options (PRD §14) — optional enhancements selectable during service customization (e.g. Rush 24h, Vector Source Files, Foil Stamping).
      </p>

      {/* Editor Card */}
      <div className="border border-[var(--line-strong)] p-5 rounded-2xl bg-[var(--panel)] shadow-xs">
        <div className="flex items-center justify-between">
          <span className="idx">/{editingId ? `edit-option (${editingId})` : "add-addon-option"}</span>
          {editingId && (
            <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]" onClick={cancelEdit}>
              Cancel ✕
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <label className={labelCls}>
            OPTION ID *
            <input className={`${inputCls} mt-1`} placeholder="e.g. rush-24h" value={id} onChange={(e) => setId(e.target.value)} disabled={!!editingId} />
          </label>
          <label className={labelCls}>
            OPTION NAME *
            <input className={`${inputCls} mt-1`} placeholder="e.g. 24h Rush Delivery" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={labelCls}>
            PRICING MODE
            <select className={`${inputCls} mt-1`} value={pricing} onChange={(e) => setPricing(e.target.value as AdjType)}>
              <option value="fixed">Fixed Dollar ($)</option>
              <option value="percentage">Percentage of Line Base (%)</option>
            </select>
          </label>
          <label className={labelCls}>
            PRICE ({pricing === "fixed" ? "USD $" : "%"}) *
            <input type="number" min="0" className={`${inputCls} mt-1`} value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className={labelCls}>
            BILLING SCOPE
            <select className={`${inputCls} mt-1`} value={scope} onChange={(e) => setScope(e.target.value as OptionScope)}>
              <option value="project">Per Project (one-time fee)</option>
              <option value="design">Per Design (multiplies by design count)</option>
              <option value="quantity">Per Quantity (multiplies by print quantity)</option>
            </select>
          </label>
          <div className="flex items-center pt-6 lg:col-span-3">
            <label className="font-meta text-[10px] flex items-center gap-2 cursor-pointer font-bold">
              <input type="checkbox" className="accent-[var(--dept)] w-4 h-4 rounded" checked={active} onChange={(e) => setActive(e.target.checked)} />
              ACTIVE / AVAILABLE IN CUSTOMIZATION
            </label>
          </div>
          <label className={`${labelCls} sm:col-span-2 lg:col-span-4`}>
            DESCRIPTION
            <textarea rows={2} className={`${inputCls} mt-1`} placeholder="Explain what the client receives with this add-on..." value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-dept !py-2 !px-4 text-xs font-bold rounded-xl" onClick={submit}>
            {editingId ? "Save Option Changes" : "+ Add Option"}
          </button>
          {editingId && (
            <button className="btn btn-ghost !py-2 !px-4 text-xs font-bold rounded-xl" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Search & Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-meta text-[10px] text-[var(--muted)] font-semibold">
          {options.length} Production Add-Ons ({options.filter((o) => o.active !== false).length} Active)
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search options by name, ID, scope..."
          className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded-xl w-full sm:w-64"
        />
      </div>

      {/* Options Cards Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((o) => {
          const isOverridden = managedIdById.has(o.id);
          const isLive = o.active !== false;
          const usageCount = services.filter((s) => s.optionIds?.includes(o.id)).length;
          return (
            <div key={o.id} className="border border-[var(--line)] p-4 rounded-2xl bg-[var(--panel)] flex flex-col justify-between gap-3 shadow-xs">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-meta text-[8.5px] px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--bg)] font-bold uppercase text-[var(--muted)]">
                    Scope: {o.scope}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={`font-meta text-[8px] px-2 py-0.5 rounded-full border font-bold ${
                      isLive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : "bg-neutral-500/10 text-neutral-400 border-neutral-500/30"
                    }`}>
                      {isLive ? "LIVE" : "HIDDEN"}
                    </span>
                    {isOverridden && (
                      <span className="font-meta text-[8px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                        OVERRIDE
                      </span>
                    )}
                  </div>
                </div>

                <h4 className="font-display text-sm font-bold uppercase">{o.name}</h4>
                <p className="font-display font-bold text-sm dept-accent mt-1">
                  {o.pricing === "percentage" ? `+${o.price}% of base` : `+${money(o.price)}`}
                </p>
                <span className="font-meta text-[8.5px] text-[var(--muted)] block mt-0.5">ID: {o.id}</span>
                <p className="text-xs text-[var(--muted)] mt-2 line-clamp-2">{o.description || "No description set."}</p>
                <span className="font-meta text-[8.5px] text-[var(--muted)] mt-2 block">
                  Enabled on {usageCount} service{usageCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => startEdit(o)}
                  className="font-meta text-[10px] dept-accent font-bold hover:underline"
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(o)}
                  className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  {isLive ? "Hide" : "Activate"}
                </button>
                {isOverridden && (
                  <button
                    type="button"
                    onClick={() => revertOrDelete(o)}
                    className="font-meta text-[10px] text-red-500 hover:underline"
                  >
                    Revert
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ PACKAGES MANAGER ============ */

function PackagesManager() {
  const { user } = useAuth();
  const money = useMoney();
  const { packages, services } = useDesignCatalog();
  const [managed, setManaged] = useState<ManagedItem[]>([]);
  const [search, setSearch] = useState("");

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [pricing, setPricing] = useState<"calculated" | "fixed" | "pct_off" | "fixed_off">("calculated");
  const [price, setPrice] = useState("");
  const [value, setValue] = useState("20");
  const [featured, setFeatured] = useState(false);
  const [blurb, setBlurb] = useState("");
  const [items, setItems] = useState<{ slug: string; qty: number }[]>([]);
  const [active, setActive] = useState(true);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);

  // Service picker for adding items visually
  const [pickerSlug, setPickerSlug] = useState("");
  const [pickerQty, setPickerQty] = useState("1");

  const reload = () => listManaged("designPackages").then(setManaged);
  useEffect(() => { reload(); }, []);

  const managedIdBySlug = useMemo(() => {
    const m = new Map<string, string>();
    managed.forEach((x) => m.set(String(x.slug ?? ""), x.id));
    return m;
  }, [managed]);

  const startEdit = (p: DesignPackage) => {
    setSlug(p.slug);
    setName(p.name);
    setPricing(p.pricing);
    setPrice(p.price ? String(p.price) : "");
    setValue(p.value ? String(p.value) : "20");
    setFeatured(!!p.featured);
    setBlurb(p.blurb ?? "");
    setItems(Array.isArray(p.items) ? p.items : []);
    setActive(p.active !== false);
    setEditingSlug(p.slug);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setSlug("");
    setName("");
    setPricing("calculated");
    setPrice("");
    setValue("20");
    setFeatured(false);
    setBlurb("");
    setItems([]);
    setActive(true);
    setEditingSlug(null);
  };

  const addItemToPackage = () => {
    if (!pickerSlug) return;
    const qty = Number(pickerQty) || 1;
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.slug === pickerSlug);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [...prev, { slug: pickerSlug, qty }];
    });
    setPickerSlug("");
    setPickerQty("1");
  };

  const removeItem = (sl: string) => {
    setItems((prev) => prev.filter((x) => x.slug !== sl));
  };

  const submit = async () => {
    if (!name.trim() || !slug.trim()) { toast.error("Package Slug and Name are required."); return; }
    if (items.length === 0) { toast.error("Add at least one design service to this package."); return; }
    const data = {
      slug: slug.trim(),
      name: name.trim(),
      pricing,
      price: pricing === "fixed" && price ? Number(price) : undefined,
      value: (pricing === "pct_off" || pricing === "fixed_off") && value ? Number(value) : undefined,
      featured,
      blurb: blurb.trim(),
      items,
      active,
    };
    const existingId = managedIdBySlug.get(slug.trim());
    const ok = await mutate(
      () => (existingId ? updateManaged("designPackages", existingId, data) : addManaged("designPackages", data)),
      editingSlug ? `Package "${name}" updated — live now` : `Package "${name}" added — live now`
    );
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: editingSlug ? "package_updated" : "package_created", entity: `package:${slug.trim()}`, after: data });
      cancelEdit();
      reload();
    }
  };

  const toggleActive = async (p: DesignPackage) => {
    const nextActive = p.active === false;
    const existingId = managedIdBySlug.get(p.slug);
    const data = { ...p, active: nextActive };
    const ok = await mutate(
      () => (existingId ? updateManaged("designPackages", existingId, data) : addManaged("designPackages", data)),
      nextActive ? `"${p.name}" activated` : `"${p.name}" hidden`
    );
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: "package_toggled", entity: `package:${p.slug}`, after: { active: nextActive } });
      reload();
    }
  };

  const revertOrDelete = async (p: DesignPackage) => {
    const existingId = managedIdBySlug.get(p.slug);
    if (!existingId) {
      await toggleActive(p);
      return;
    }
    const ok = await mutate(() => removeManaged("designPackages", existingId), "Removed override — reverted to default");
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: "package_reverted", entity: `package:${p.slug}` });
      reload();
    }
  };

  const filtered = packages.filter((p) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.blurb.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <p className="font-meta text-[10px] text-[var(--muted)] max-w-2xl">
        Predefined design packages (PRD §21–§23) — bundled service packages featured in the Custom Package Builder and Design Store.
      </p>

      {/* Editor Card */}
      <div className="border border-[var(--line-strong)] p-5 rounded-2xl bg-[var(--panel)] shadow-xs">
        <div className="flex items-center justify-between">
          <span className="idx">/{editingSlug ? `edit-package (${editingSlug})` : "add-design-package"}</span>
          {editingSlug && (
            <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]" onClick={cancelEdit}>
              Cancel ✕
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <label className={labelCls}>
            PACKAGE SLUG *
            <input className={`${inputCls} mt-1`} placeholder="e.g. brand-identity-suite" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!editingSlug} />
          </label>
          <label className={labelCls}>
            PACKAGE NAME *
            <input className={`${inputCls} mt-1`} placeholder="e.g. Brand Identity Suite" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={labelCls}>
            PRICING MODE
            <select className={`${inputCls} mt-1`} value={pricing} onChange={(e) => setPricing(e.target.value as any)}>
              <option value="calculated">Calculated (Sum of standard services)</option>
              <option value="pct_off">Percentage Off Bundle (%)</option>
              <option value="fixed">Fixed Package Price ($)</option>
              <option value="fixed_off">Fixed Dollar Discount ($ Off)</option>
            </select>
          </label>
          {pricing === "fixed" && (
            <label className={labelCls}>
              FIXED PRICE (USD $) *
              <input type="number" min="0" className={`${inputCls} mt-1`} value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
          )}
          {(pricing === "pct_off" || pricing === "fixed_off") && (
            <label className={labelCls}>
              DISCOUNT AMOUNT ({pricing === "pct_off" ? "% Off" : "$ Off"}) *
              <input type="number" min="0" className={`${inputCls} mt-1`} value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
          )}
          <div className="flex items-center pt-6">
            <label className="font-meta text-[10px] flex items-center gap-2 cursor-pointer font-bold mr-4">
              <input type="checkbox" className="accent-[var(--dept)] w-4 h-4 rounded" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
              FEATURED
            </label>
            <label className="font-meta text-[10px] flex items-center gap-2 cursor-pointer font-bold">
              <input type="checkbox" className="accent-[var(--dept)] w-4 h-4 rounded" checked={active} onChange={(e) => setActive(e.target.checked)} />
              ACTIVE
            </label>
          </div>
          <label className={`${labelCls} sm:col-span-2 lg:col-span-4`}>
            DESCRIPTION / BLURB
            <textarea rows={2} className={`${inputCls} mt-1`} placeholder="Highlights what this package delivers and why clients save..." value={blurb} onChange={(e) => setBlurb(e.target.value)} />
          </label>
        </div>

        {/* Visual Package Item Picker */}
        <div className="mt-4 pt-4 border-t border-[var(--line)]">
          <span className="font-meta text-[10px] font-bold uppercase tracking-wider block mb-2">
            Included Services in Package ({items.length})
          </span>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              className={`${inputCls} !w-auto !py-1.5 text-xs font-bold`}
              value={pickerSlug}
              onChange={(e) => setPickerSlug(e.target.value)}
              aria-label="Pick service to add"
            >
              <option value="">Select a design service to add…</option>
              {services.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name} ({money(s.price)})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              max="20"
              className={`${inputCls} !w-20 !py-1.5 text-xs`}
              value={pickerQty}
              onChange={(e) => setPickerQty(e.target.value)}
              aria-label="Service quantity"
            />
            <button
              type="button"
              className="btn btn-dept !py-1.5 !px-3 font-meta text-[10px] font-bold rounded-xl"
              onClick={addItemToPackage}
            >
              + Add to Package
            </button>
          </div>

          {items.length === 0 ? (
            <p className="font-meta text-[10px] text-amber-600">No services added yet. Pick a service above to bundle it.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {items.map((it) => {
                const s = services.find((x) => x.slug === it.slug);
                return (
                  <span key={it.slug} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-xs font-bold">
                    <span>{it.qty}×</span>
                    <span>{s?.name ?? it.slug}</span>
                    <button
                      type="button"
                      onClick={() => removeItem(it.slug)}
                      className="text-red-500 hover:text-red-700 ml-1 font-bold"
                      title="Remove item"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button className="btn btn-dept !py-2 !px-4 text-xs font-bold rounded-xl" onClick={submit}>
            {editingSlug ? "Save Package Changes" : "+ Add Package"}
          </button>
          {editingSlug && (
            <button className="btn btn-ghost !py-2 !px-4 text-xs font-bold rounded-xl" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-meta text-[10px] text-[var(--muted)] font-semibold">
          {packages.length} Predefined Packages ({packages.filter((p) => p.active !== false).length} Active)
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search packages by name, slug..."
          className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded-xl w-full sm:w-64"
        />
      </div>

      {/* Packages Cards Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((p) => {
          const isOverridden = managedIdBySlug.has(p.slug);
          const isLive = p.active !== false;
          const pkgTotal = packageValue(p, services);
          return (
            <div key={p.slug} className="border border-[var(--line)] p-4 rounded-2xl bg-[var(--panel)] flex flex-col justify-between gap-3 shadow-xs">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-meta text-[8.5px] px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--bg)] font-bold uppercase text-[var(--muted)]">
                    {p.pricing.replace("_", " ")}
                  </span>
                  <div className="flex items-center gap-1">
                    {p.featured && (
                      <span className="font-meta text-[8px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 font-bold">
                        FEATURED
                      </span>
                    )}
                    <span className={`font-meta text-[8px] px-2 py-0.5 rounded-full border font-bold ${
                      isLive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : "bg-neutral-500/10 text-neutral-400 border-neutral-500/30"
                    }`}>
                      {isLive ? "LIVE" : "HIDDEN"}
                    </span>
                    {isOverridden && (
                      <span className="font-meta text-[8px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                        OVERRIDE
                      </span>
                    )}
                  </div>
                </div>

                <h4 className="font-display text-sm font-bold uppercase">{p.name}</h4>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="font-display font-bold text-base dept-accent">
                    {money(pkgTotal.price)}
                  </span>
                  {pkgTotal.savings > 0 && (
                    <span className="font-meta text-[10px] text-[var(--muted)] line-through">
                      {money(pkgTotal.regular)}
                    </span>
                  )}
                  {pkgTotal.savings > 0 && (
                    <span className="font-meta text-[9px] text-emerald-600 font-bold">
                      Save {money(pkgTotal.savings)}
                    </span>
                  )}
                </div>
                <span className="font-meta text-[8.5px] text-[var(--muted)] block mt-0.5">/{p.slug}</span>
                <p className="text-xs text-[var(--muted)] mt-2 line-clamp-2">{p.blurb || "No description set."}</p>

                {/* Included items summary */}
                <div className="mt-3 pt-2 border-t border-[var(--line)]">
                  <span className="font-meta text-[8.5px] text-[var(--muted)] uppercase font-bold block mb-1">
                    Includes {p.items?.length ?? 0} Services:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {p.items?.map((it) => {
                      const s = services.find((x) => x.slug === it.slug);
                      return (
                        <span key={it.slug} className="font-meta text-[8.5px] px-2 py-0.5 rounded-md bg-[var(--bg)] border border-[var(--line)]">
                          {it.qty}× {s?.name ?? it.slug}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  className="font-meta text-[10px] dept-accent font-bold hover:underline"
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(p)}
                  className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  {isLive ? "Hide" : "Activate"}
                </button>
                {isOverridden && (
                  <button
                    type="button"
                    onClick={() => revertOrDelete(p)}
                    className="font-meta text-[10px] text-red-500 hover:underline"
                  >
                    Revert
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ DISCOUNTS MANAGER ============ */

function DiscountsManager() {
  const { user } = useAuth();
  const money = useMoney();
  const { discounts } = useDesignCatalog();
  const [managed, setManaged] = useState<ManagedItem[]>([]);
  const [search, setSearch] = useState("");

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("10");
  const [minSubtotal, setMinSubtotal] = useState("500");
  const [minItems, setMinItems] = useState("2");
  const [priority, setPriority] = useState("2");
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = () => listManaged("designDiscounts").then(setManaged);
  useEffect(() => { reload(); }, []);

  const managedIdById = useMemo(() => {
    const m = new Map<string, string>();
    managed.forEach((x) => m.set(String(x.id ?? ""), x.id));
    return m;
  }, [managed]);

  const startEdit = (d: DesignDiscount) => {
    setId(d.id);
    setName(d.name);
    setType(d.type);
    setValue(String(d.value));
    setMinSubtotal(String(d.minSubtotal));
    setMinItems(String(d.minItems));
    setPriority(String(d.priority));
    setActive(d.active !== false);
    setEditingId(d.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setId("");
    setName("");
    setType("percentage");
    setValue("10");
    setMinSubtotal("500");
    setMinItems("2");
    setPriority("2");
    setActive(true);
    setEditingId(null);
  };

  const submit = async () => {
    if (!name.trim() || !id.trim()) { toast.error("Discount Tier ID and Name are required."); return; }
    const data = {
      id: id.trim(),
      name: name.trim(),
      type,
      value: Number(value) || 0,
      minSubtotal: Number(minSubtotal) || 0,
      minItems: Number(minItems) || 2,
      priority: Number(priority) || 1,
      active,
    };
    const existingId = managedIdById.get(id.trim());
    const ok = await mutate(
      () => (existingId ? updateManaged("designDiscounts", existingId, data) : addManaged("designDiscounts", data)),
      editingId ? `Discount tier "${name}" updated — live now` : `Discount tier "${name}" added — live now`
    );
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: editingId ? "discount_updated" : "discount_created", entity: `discount:${id.trim()}`, after: data });
      cancelEdit();
      reload();
    }
  };

  const toggleActive = async (d: DesignDiscount) => {
    const nextActive = d.active === false;
    const existingId = managedIdById.get(d.id);
    const data = { ...d, active: nextActive };
    const ok = await mutate(
      () => (existingId ? updateManaged("designDiscounts", existingId, data) : addManaged("designDiscounts", data)),
      nextActive ? `"${d.name}" activated` : `"${d.name}" hidden`
    );
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: "discount_toggled", entity: `discount:${d.id}`, after: { active: nextActive } });
      reload();
    }
  };

  const revertOrDelete = async (d: DesignDiscount) => {
    const existingId = managedIdById.get(d.id);
    if (!existingId) {
      await toggleActive(d);
      return;
    }
    const ok = await mutate(() => removeManaged("designDiscounts", existingId), "Removed override — reverted to default");
    if (ok) {
      logAudit({ user: user?.email ?? "studio", action: "discount_reverted", entity: `discount:${d.id}` });
      reload();
    }
  };

  const filtered = discounts.filter((d) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <p className="font-meta text-[10px] text-[var(--muted)] max-w-2xl">
        Automatic bundle discounts (PRD §20) — applied automatically in Custom Package Builder and Checkout when order subtotal and item count criteria are met.
      </p>

      {/* Editor Card */}
      <div className="border border-[var(--line-strong)] p-5 rounded-2xl bg-[var(--panel)] shadow-xs">
        <div className="flex items-center justify-between">
          <span className="idx">/{editingId ? `edit-discount-tier (${editingId})` : "add-discount-tier"}</span>
          {editingId && (
            <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]" onClick={cancelEdit}>
              Cancel ✕
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <label className={labelCls}>
            TIER ID *
            <input className={`${inputCls} mt-1`} placeholder="e.g. tier-250" value={id} onChange={(e) => setId(e.target.value)} disabled={!!editingId} />
          </label>
          <label className={labelCls}>
            TIER NAME *
            <input className={`${inputCls} mt-1`} placeholder="e.g. Starter Bundle Savings" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={labelCls}>
            DISCOUNT TYPE
            <select className={`${inputCls} mt-1`} value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="percentage">Percentage Off (%)</option>
              <option value="fixed">Fixed Dollar Off ($)</option>
            </select>
          </label>
          <label className={labelCls}>
            DISCOUNT VALUE ({type === "percentage" ? "%" : "USD $"}) *
            <input type="number" min="0" className={`${inputCls} mt-1`} value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <label className={labelCls}>
            MIN SUBTOTAL (USD $) *
            <input type="number" min="0" className={`${inputCls} mt-1`} value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} />
          </label>
          <label className={labelCls}>
            MIN ITEMS COUNT *
            <input type="number" min="1" className={`${inputCls} mt-1`} value={minItems} onChange={(e) => setMinItems(e.target.value)} />
          </label>
          <label className={labelCls}>
            TIER PRIORITY (HIGHER WINS) *
            <input type="number" min="1" className={`${inputCls} mt-1`} value={priority} onChange={(e) => setPriority(e.target.value)} />
          </label>
          <div className="flex items-center pt-6">
            <label className="font-meta text-[10px] flex items-center gap-2 cursor-pointer font-bold">
              <input type="checkbox" className="accent-[var(--dept)] w-4 h-4 rounded" checked={active} onChange={(e) => setActive(e.target.checked)} />
              ACTIVE / AUTOMATIC
            </label>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-dept !py-2 !px-4 text-xs font-bold rounded-xl" onClick={submit}>
            {editingId ? "Save Discount Changes" : "+ Add Discount Tier"}
          </button>
          {editingId && (
            <button className="btn btn-ghost !py-2 !px-4 text-xs font-bold rounded-xl" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-meta text-[10px] text-[var(--muted)] font-semibold">
          {discounts.length} Discount Tiers ({discounts.filter((d) => d.active !== false).length} Active)
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search discount tiers by name, ID..."
          className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded-xl w-full sm:w-64"
        />
      </div>

      {/* Discounts Cards Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((d) => {
          const isOverridden = managedIdById.has(d.id);
          const isLive = d.active !== false;
          return (
            <div key={d.id} className="border border-[var(--line)] p-4 rounded-2xl bg-[var(--panel)] flex flex-col justify-between gap-3 shadow-xs">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-meta text-[8.5px] px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--bg)] font-bold uppercase text-[var(--muted)]">
                    Priority #{d.priority ?? 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={`font-meta text-[8px] px-2 py-0.5 rounded-full border font-bold ${
                      isLive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" : "bg-neutral-500/10 text-neutral-400 border-neutral-500/30"
                    }`}>
                      {isLive ? "ACTIVE" : "DISABLED"}
                    </span>
                    {isOverridden && (
                      <span className="font-meta text-[8px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                        OVERRIDE
                      </span>
                    )}
                  </div>
                </div>

                <h4 className="font-display text-sm font-bold uppercase">{d.name}</h4>
                <p className="font-display font-bold text-lg text-emerald-600 mt-1">
                  {d.type === "percentage" ? `${d.value}% OFF` : `${money(d.value)} OFF`}
                </p>
                <span className="font-meta text-[8.5px] text-[var(--muted)] block mt-0.5">Tier ID: {d.id}</span>
                <div className="mt-3 p-2.5 rounded-xl bg-[var(--bg)] border border-[var(--line)] font-meta text-[9.5px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Minimum Subtotal:</span>
                    <span className="font-bold text-[var(--ink)]">{money(d.minSubtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Minimum Items:</span>
                    <span className="font-bold text-[var(--ink)]">{d.minItems}+ services</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => startEdit(d)}
                  className="font-meta text-[10px] dept-accent font-bold hover:underline"
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(d)}
                  className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  {isLive ? "Disable" : "Activate"}
                </button>
                {isOverridden && (
                  <button
                    type="button"
                    onClick={() => revertOrDelete(d)}
                    className="font-meta text-[10px] text-red-500 hover:underline"
                  >
                    Revert
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============ SERVICES MANAGER (PRD §33–§35, §38–§39) ============ */

interface ServiceDraft {
  slug: string; name: string; category: string; short: string; price: string;
  pricingType: string; purchaseMode: string; tiers: string; variations: string;
  minQty: string; maxQty: string; turnaround: string; revisions: string;
  sizeIds: string; defaultSize: string; optionIds: string; recommended: string;
  allowCustomSize: boolean; customLimits: string;
  featured: boolean; popular: boolean; packageEligible: boolean; active: boolean;
}

const blankDraft: ServiceDraft = {
  slug: "", name: "", category: "social-media", short: "", price: "65",
  pricingType: "fixed", purchaseMode: "", tiers: "", variations: "",
  minQty: "1", maxQty: "50", turnaround: "3–5 days", revisions: "2",
  sizeIds: "", defaultSize: "", optionIds: "", recommended: "",
  allowCustomSize: false, customLimits: "",
  featured: false, popular: false, packageEligible: true, active: true,
};

function ServicesManager() {
  const { user } = useAuth();
  const money = useMoney();
  const { services, categories, sizes, options } = useDesignCatalog();
  const [managed, setManaged] = useState<ManagedItem[]>([]);
  const [draft, setDraft] = useState<ServiceDraft>(blankDraft);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [priceEdit, setPriceEdit] = useState<{ slug: string; value: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkPct, setBulkPct] = useState("10");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("ALL");
  const [varEditorMode, setVarEditorMode] = useState<"visual" | "json">("visual");

  const reload = () => listManaged("designServices").then(setManaged);
  useEffect(() => { reload(); }, []);

  const managedIdBySlug = useMemo(() => {
    const m = new Map<string, string>();
    managed.forEach((x) => m.set(String(x.slug ?? ""), x.id));
    return m;
  }, [managed]);

  /** Save an override for a service keyed by slug. */
  const saveOverride = async (slug: string, data: Record<string, unknown>, action: string, before?: unknown) => {
    const existingId = managedIdBySlug.get(slug);
    const ok = await mutate(
      () => (existingId ? updateManaged("designServices", existingId, { slug, ...data }) : addManaged("designServices", { slug, ...data })),
      "Saved — live now"
    );
    if (ok) { logAudit({ user: user?.email ?? "studio", action, entity: `service:${slug}`, before, after: data }); reload(); }
    return ok;
  };

  /* inline price editing */
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
      tiers: s.tiers?.length ? JSON.stringify(s.tiers, null, 2) : "",
      variations: s.variations?.length ? JSON.stringify(s.variations, null, 2) : "",
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
    let variations: unknown;
    if (draft.variations.trim()) {
      try {
        const parsed = JSON.parse(draft.variations);
        if (!Array.isArray(parsed) || parsed.some((g) => !g?.name || !Array.isArray(g?.options))) {
          toast.error('Variations must be a JSON array of groups like [{"id":"folding","name":"Folding Style","options":[{"id":"tri-fold","name":"Tri-Fold (6 Panels)","price":220}]}]'); return;
        }
        variations = parsed;
      } catch { toast.error("Variations must be valid JSON."); return; }
    }
    const sizeIds = draft.sizeIds.split(",").map((x) => x.trim()).filter(Boolean);
    const data: Record<string, unknown> = {
      slug: draft.slug.trim(), name: draft.name.trim(), category: draft.category,
      short: draft.short.trim(), price: Number(draft.price) || 0, pricingType: draft.pricingType,
      purchaseMode: draft.purchaseMode || null,
      tiers: tiers ?? null,
      variations: variations ?? null,
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

  /* bulk operations */
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

  /* CSV export / import */
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

  const filteredServices = services.filter((s) => {
    if (filterCat !== "ALL" && s.category !== filterCat) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q) || s.short.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost !py-1.5 !px-3 font-meta text-[10px] rounded-xl" onClick={exportCsv}>
            ⬇️ Export CSV
          </button>
          <label className="btn btn-ghost !py-1.5 !px-3 font-meta text-[10px] rounded-xl cursor-pointer">
            ⬆️ Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0])} />
          </label>
        </div>
        <span className="font-meta text-[10px] text-[var(--muted)] font-semibold">
          {services.length} Total Services ({services.filter((s) => s.active !== false).length} Active)
        </span>
      </div>

      {/* Bulk Toolbar */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border border-[var(--dept)] p-3.5 rounded-2xl bg-[var(--dept-soft)] shadow-xs">
          <span className="font-meta text-[10px] font-bold">{selected.length} Selected</span>
          <button className="btn btn-dept !py-1 !px-3 font-meta text-[9px] rounded-lg" onClick={() => bulk("activate")}>Activate</button>
          <button className="btn btn-dept !py-1 !px-3 font-meta text-[9px] rounded-lg" onClick={() => bulk("deactivate")}>Deactivate</button>
          <span className="inline-flex items-center gap-1">
            <input className={`${inputCls} !w-16 !py-1 text-xs`} value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} aria-label="Bulk price percent" />
            <button className="btn btn-dept !py-1 !px-3 font-meta text-[9px] rounded-lg" onClick={() => bulk("price")}>Price % (preview)</button>
          </span>
          <button className="btn btn-ghost !py-1 !px-3 font-meta text-[9px] !text-red-500 rounded-lg" onClick={() => bulk("delete")}>Delete</button>
          <button className="font-meta text-[10px] text-[var(--muted)] hover:underline ml-auto" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      {/* Service Editor */}
      <div className="border border-[var(--line-strong)] p-5 rounded-2xl bg-[var(--panel)] shadow-xs">
        <div className="flex items-center justify-between">
          <span className="idx">/{editingSlug ? `edit-service (${editingSlug})` : "add-service"}</span>
          {editingSlug && (
            <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]" onClick={() => { setEditingSlug(null); setDraft(blankDraft); }}>
              Cancel ✕
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          <label className={labelCls}>SERVICE NAME *<input className={`${inputCls} mt-1`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className={labelCls}>SLUG *<input className={`${inputCls} mt-1`} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} disabled={!!editingSlug} /></label>
          <label className={labelCls}>CATEGORY
            <select className={`${inputCls} mt-1`} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
          <label className={`${labelCls} sm:col-span-2 lg:col-span-3`}>SHORT DESCRIPTION<input className={`${inputCls} mt-1`} value={draft.short} onChange={(e) => setDraft({ ...draft, short: e.target.value })} /></label>
          <label className={labelCls}>BASE PRICE USD (0 = quote)<input type="number" min="0" className={`${inputCls} mt-1`} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></label>
          <label className={labelCls}>PRICING TYPE
            <select className={`${inputCls} mt-1`} value={draft.pricingType} onChange={(e) => setDraft({ ...draft, pricingType: e.target.value })}>
              {["fixed", "starting_at", "per_quantity", "custom_quote"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className={labelCls}>PURCHASE MODE
            <select className={`${inputCls} mt-1`} value={draft.purchaseMode} onChange={(e) => setDraft({ ...draft, purchaseMode: e.target.value })}>
              <option value="">Auto (from price/type)</option>
              <option value="DIRECT_PURCHASE">DIRECT_PURCHASE</option>
              <option value="QUOTE_ONLY">QUOTE_ONLY</option>
            </select>
          </label>
          <label className={`${labelCls} lg:col-span-3`}>PACKAGE TIERS (JSON, optional — replaces base price when picked)
            <textarea rows={2} className={`${inputCls} mt-1`} placeholder='[{"id":"basic","name":"Basic","price":45,"blurb":"1 concept, 1 revision"},{"id":"standard","name":"Standard","price":65,"blurb":"2 concepts, 2 revisions"}]'
              value={draft.tiers} onChange={(e) => setDraft({ ...draft, tiers: e.target.value })} />
            <span className="block font-meta text-[8px] normal-case tracking-normal mt-1">Each tier: id, name, price (USD), blurb; optional turnaround + revisions. Leave empty to sell at base price only.</span>
          </label>

          {/* Design Variations & Individual Pricing */}
          <div className="lg:col-span-3 border border-[var(--line)] p-4 sm:p-5 rounded-2xl bg-[var(--bg)] shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <span className={labelCls}>DESIGN VARIATIONS &amp; INDIVIDUAL PRICING</span>
                <span className="block font-meta text-[8.5px] text-[var(--muted)] mt-0.5">
                  Define multi-option variant groups (e.g. Folding formats, Print Sides, Color Schemes, Page counts) with individual prices and specs.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVarEditorMode((m) => (m === "visual" ? "json" : "visual"))}
                  className="font-meta text-[9px] px-2.5 py-1 rounded-lg border border-[var(--line-strong)] hover:border-[var(--dept)] bg-[var(--panel)] transition-colors font-bold"
                >
                  {varEditorMode === "visual" ? "Switch to JSON Mode 📝" : "Switch to Visual Form 🎨"}
                </button>
              </div>
            </div>

            {/* 1-Click Presets Bar */}
            <div className="flex flex-wrap items-center gap-1.5 font-meta text-[8.5px] pb-3 border-b border-[var(--line)]/60 mb-3">
              <span className="text-[var(--muted)] font-bold mr-1">1-Click Presets:</span>
              <button
                type="button"
                onClick={() => setDraft({
                  ...draft,
                  variations: JSON.stringify([
                    {
                      id: "folding",
                      name: "Folding & Panel Structure",
                      options: [
                        { id: "flat", name: "Flat Flyer / Insert (2 Sides)", price: 95, icon: "📄", blurb: "Two-sided flat sell sheet." },
                        { id: "bi-fold", name: "Bi-Fold / Half Fold (4 Panels)", price: 160, icon: "📖", blurb: "4-panel booklet presentation." },
                        { id: "tri-fold", name: "Tri-Fold / Letter Fold (6 Panels)", price: 220, isDefault: true, icon: "🗂️", blurb: "Standard 3-panel roll or letter fold." },
                        { id: "z-fold", name: "Z-Fold (6 Panels Accordion)", price: 240, icon: "⚡", blurb: "Accordion fold opening sequentially." },
                        { id: "gate-fold", name: "Gate Fold / Double Parallel (8 Panels)", price: 290, icon: "🚪", blurb: "Executive inward-opening gatefold." }
                      ]
                    }
                  ], null, 2)
                })}
                className="px-2 py-1 rounded-lg border border-[var(--line)] hover:border-[var(--dept)] bg-[var(--panel)] transition-colors font-medium"
              >
                + Folding
              </button>
              <button
                type="button"
                onClick={() => setDraft({
                  ...draft,
                  variations: JSON.stringify([
                    {
                      id: "sides",
                      name: "Print Sides",
                      options: [
                        { id: "single", name: "Single-Sided (Front Only)", price: 65, icon: "📄", blurb: "Front-only layout." },
                        { id: "double", name: "Double-Sided (Front & Back)", price: 95, isDefault: true, icon: "📑", blurb: "Front branding + back details & QR code." },
                        { id: "team-suite", name: "Multi-Person Team Suite (3 Names)", price: 160, icon: "👥", blurb: "Individualized print files for 3 team members." }
                      ]
                    }
                  ], null, 2)
                })}
                className="px-2 py-1 rounded-lg border border-[var(--line)] hover:border-[var(--dept)] bg-[var(--panel)] transition-colors font-medium"
              >
                + Sides
              </button>
              <button
                type="button"
                onClick={() => setDraft({
                  ...draft,
                  variations: JSON.stringify([
                    {
                      id: "color_mode",
                      name: "Color & Style Edition",
                      options: [
                        { id: "bw", name: "Black & White / Monochrome Vector", price: 250, icon: "⚫", blurb: "Clean single-color monochrome mark." },
                        { id: "full-color", name: "Full Color Dynamic Vector Suite", price: 350, isDefault: true, icon: "🎨", blurb: "Full brand palette & dark/light lockups." },
                        { id: "metallic-3d", name: "3D Metallic / Luxury Edition", price: 495, icon: "✨", blurb: "Gold/silver embossed 3D photoreal textures." }
                      ]
                    }
                  ], null, 2)
                })}
                className="px-2 py-1 rounded-lg border border-[var(--line)] hover:border-[var(--dept)] bg-[var(--panel)] transition-colors font-medium"
              >
                + Color Modes
              </button>
              <button
                type="button"
                onClick={() => setDraft({
                  ...draft,
                  variations: JSON.stringify([
                    {
                      id: "page_structure",
                      name: "Page & Booklet Structure",
                      options: [
                        { id: "2-page", name: "Single Sheet 2-Page Card", price: 90, icon: "📄", blurb: "Front photo + back order of service." },
                        { id: "4-page", name: "Bi-Fold 4-Page Program", price: 140, isDefault: true, icon: "📖", blurb: "Cover, obituary, order of service & tributes." },
                        { id: "8-page", name: "8-Page Memorial Booklet", price: 220, icon: "📚", blurb: "Photo collage spreads and reflections." },
                        { id: "12-page", name: "12-Page Deluxe Keepsake Book", price: 320, icon: "🕊️", blurb: "Comprehensive life celebration keepsake." }
                      ]
                    }
                  ], null, 2)
                })}
                className="px-2 py-1 rounded-lg border border-[var(--line)] hover:border-[var(--dept)] bg-[var(--panel)] transition-colors font-medium"
              >
                + Page Scope
              </button>
              {draft.variations && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, variations: "" })}
                  className="px-2 py-1 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 ml-auto transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Visual Variation Form Mode */}
            {varEditorMode === "visual" ? (
              <div className="space-y-4">
                {(() => {
                  let groups: Array<{ id: string; name: string; options: Array<{ id: string; name: string; price: number; icon?: string; blurb?: string; turnaround?: string; revisions?: number; isDefault?: boolean }> }> = [];
                  try {
                    if (draft.variations.trim()) {
                      groups = JSON.parse(draft.variations);
                      if (!Array.isArray(groups)) groups = [];
                    }
                  } catch {
                    groups = [];
                  }

                  const updateGroups = (newGroups: typeof groups) => {
                    setDraft({ ...draft, variations: newGroups.length > 0 ? JSON.stringify(newGroups, null, 2) : "" });
                  };

                  if (groups.length === 0) {
                    return (
                      <div className="text-center py-6 border border-dashed border-[var(--line)] rounded-xl">
                        <p className="font-meta text-[11px] text-[var(--muted)]">No variations defined yet for this service.</p>
                        <p className="font-meta text-[9px] text-[var(--muted)] mt-1">Click a 1-click preset above, or add a custom variation group below.</p>
                        <button
                          type="button"
                          onClick={() => {
                            updateGroups([
                              {
                                id: "variation_group",
                                name: "Design Variations",
                                options: [
                                  { id: "opt-1", name: "Standard Edition", price: Number(draft.price) || 65, icon: "🎨", isDefault: true }
                                ]
                              }
                            ]);
                          }}
                          className="btn btn-ghost !py-1.5 !px-3 font-meta text-[9px] rounded-lg mt-3"
                        >
                          + Add New Variation Group
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {groups.map((grp, gi) => (
                        <div key={gi} className="border border-[var(--line-strong)] rounded-xl p-3 sm:p-4 bg-[var(--panel)] space-y-3">
                          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="font-meta text-[9px] font-bold text-[var(--dept)] uppercase">Group #{gi + 1}</span>
                              <input
                                className={`${inputCls} !py-1 !px-2 text-xs font-bold w-full max-w-xs`}
                                placeholder="Group Name (e.g. Folding Style)"
                                value={grp.name}
                                onChange={(e) => {
                                  const next = [...groups];
                                  next[gi].name = e.target.value;
                                  next[gi].id = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
                                  updateGroups(next);
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const next = groups.filter((_, idx) => idx !== gi);
                                updateGroups(next);
                              }}
                              className="font-meta text-[9px] text-red-500 hover:underline"
                            >
                              Remove Group ✕
                            </button>
                          </div>

                          {/* Options Table */}
                          <div className="space-y-2">
                            {grp.options.map((opt, oi) => (
                              <div key={oi} className="grid grid-cols-12 gap-2 items-start p-2.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-xs">
                                <div className="col-span-2 sm:col-span-1">
                                  <label className="font-meta text-[7.5px] text-[var(--muted)] block">ICON</label>
                                  <input
                                    className={`${inputCls} !py-1 !px-1 text-center text-sm mt-0.5`}
                                    value={opt.icon || ""}
                                    placeholder="🎨"
                                    onChange={(e) => {
                                      const next = [...groups];
                                      next[gi].options[oi].icon = e.target.value;
                                      updateGroups(next);
                                    }}
                                  />
                                </div>
                                <div className="col-span-6 sm:col-span-4">
                                  <label className="font-meta text-[7.5px] text-[var(--muted)] block">OPTION NAME *</label>
                                  <input
                                    className={`${inputCls} !py-1 !px-2 text-xs font-semibold mt-0.5`}
                                    value={opt.name}
                                    placeholder="Option Title"
                                    onChange={(e) => {
                                      const next = [...groups];
                                      next[gi].options[oi].name = e.target.value;
                                      if (!next[gi].options[oi].id || next[gi].options[oi].id.startsWith("opt-")) {
                                        next[gi].options[oi].id = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                                      }
                                      updateGroups(next);
                                    }}
                                  />
                                </div>
                                <div className="col-span-4 sm:col-span-2">
                                  <label className="font-meta text-[7.5px] text-[var(--muted)] block">PRICE USD ($) *</label>
                                  <input
                                    type="number"
                                    min="0"
                                    className={`${inputCls} !py-1 !px-2 text-xs font-mono font-bold dept-accent mt-0.5`}
                                    value={opt.price}
                                    onChange={(e) => {
                                      const next = [...groups];
                                      next[gi].options[oi].price = Number(e.target.value) || 0;
                                      updateGroups(next);
                                    }}
                                  />
                                </div>
                                <div className="col-span-4 sm:col-span-2">
                                  <label className="font-meta text-[7.5px] text-[var(--muted)] block">TURNAROUND</label>
                                  <input
                                    className={`${inputCls} !py-1 !px-2 text-[10px] mt-0.5`}
                                    value={opt.turnaround || ""}
                                    placeholder="3–5 days"
                                    onChange={(e) => {
                                      const next = [...groups];
                                      next[gi].options[oi].turnaround = e.target.value || undefined;
                                      updateGroups(next);
                                    }}
                                  />
                                </div>
                                <div className="col-span-4 sm:col-span-2">
                                  <label className="font-meta text-[7.5px] text-[var(--muted)] block">REVISIONS</label>
                                  <input
                                    type="number"
                                    min="0"
                                    className={`${inputCls} !py-1 !px-2 text-[10px] mt-0.5`}
                                    value={opt.revisions ?? ""}
                                    placeholder="2"
                                    onChange={(e) => {
                                      const next = [...groups];
                                      next[gi].options[oi].revisions = e.target.value !== "" ? Number(e.target.value) : undefined;
                                      updateGroups(next);
                                    }}
                                  />
                                </div>
                                <div className="col-span-4 sm:col-span-1 flex flex-col items-center justify-start gap-1 pt-4">
                                  {/* isDefault toggle */}
                                  <label className="flex flex-col items-center gap-0.5 cursor-pointer" title="Set as default pre-selected option">
                                    <input
                                      type="checkbox"
                                      className="accent-[var(--dept)]"
                                      checked={!!opt.isDefault}
                                      onChange={(e) => {
                                        const next = [...groups];
                                        // Unset isDefault on all other options in the group first
                                        next[gi].options = next[gi].options.map((o, idx) => ({ ...o, isDefault: idx === oi ? e.target.checked : false }));
                                        updateGroups(next);
                                      }}
                                    />
                                    <span className="font-meta text-[7px] text-[var(--muted)] font-bold">DEFAULT</span>
                                  </label>
                                  <button
                                    type="button"
                                    title="Delete Option"
                                    onClick={() => {
                                      const next = [...groups];
                                      next[gi].options = next[gi].options.filter((_, idx) => idx !== oi);
                                      updateGroups(next);
                                    }}
                                    className="text-red-500 hover:text-red-700 font-bold text-sm mt-1"
                                  >
                                    ✕
                                  </button>
                                </div>
                                <div className="col-span-12 mt-1">
                                  <textarea
                                    rows={2}
                                    className={`${inputCls} !py-1.5 !px-2 text-[10px] text-[var(--muted)] resize-none`}
                                    value={opt.blurb || ""}
                                    placeholder="Short description or blurb for this variation option..."
                                    onChange={(e) => {
                                      const next = [...groups];
                                      next[gi].options[oi].blurb = e.target.value || undefined;
                                      updateGroups(next);
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const next = [...groups];
                              next[gi].options.push({
                                id: `opt-${next[gi].options.length + 1}`,
                                name: "New Variant Option",
                                price: Number(draft.price) || 65,
                                icon: "✨",
                                blurb: "Specification description.",
                              });
                              updateGroups(next);
                            }}
                            className="font-meta text-[9px] text-[var(--dept)] hover:underline font-bold"
                          >
                            + Add Option to {grp.name || "Group"}
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          const next = [
                            ...groups,
                            {
                              id: `group_${groups.length + 1}`,
                              name: "Additional Variation Group",
                              options: [
                                { id: "opt-a", name: "Option A", price: Number(draft.price) || 65, icon: "📄" },
                                { id: "opt-b", name: "Option B", price: (Number(draft.price) || 65) + 30, icon: "📑" }
                              ]
                            }
                          ];
                          updateGroups(next);
                        }}
                        className="btn btn-ghost !py-1.5 !px-3 font-meta text-[9px] rounded-lg"
                      >
                        + Add Another Variation Group
                      </button>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* Raw JSON Mode */
              <div className="space-y-2">
                <textarea
                  rows={5}
                  className={`${inputCls} font-mono text-xs`}
                  placeholder='[{"id":"folding","name":"Folding Style","options":[{"id":"tri-fold","name":"Tri-Fold (6 Panels)","price":220,"icon":"🗂️","blurb":"Standard 3-panel roll or letter fold"}]}]'
                  value={draft.variations}
                  onChange={(e) => setDraft({ ...draft, variations: e.target.value })}
                />
                <span className="block font-meta text-[8px] text-[var(--muted)]">
                  Edit JSON directly or switch back to Visual Form Mode above.
                </span>
              </div>
            )}
          </div>
          <label className={labelCls}>TURNAROUND<input className={`${inputCls} mt-1`} value={draft.turnaround} onChange={(e) => setDraft({ ...draft, turnaround: e.target.value })} /></label>
          <label className={labelCls}>MIN QTY<input type="number" min="1" className={`${inputCls} mt-1`} value={draft.minQty} onChange={(e) => setDraft({ ...draft, minQty: e.target.value })} /></label>
          <label className={labelCls}>MAX QTY<input type="number" min="1" className={`${inputCls} mt-1`} value={draft.maxQty} onChange={(e) => setDraft({ ...draft, maxQty: e.target.value })} /></label>
          <label className={labelCls}>REVISIONS<input type="number" min="0" className={`${inputCls} mt-1`} value={draft.revisions} onChange={(e) => setDraft({ ...draft, revisions: e.target.value })} /></label>
          <label className={`${labelCls} lg:col-span-2`}>SIZE IDS (comma-separated)
            <input className={`${inputCls} mt-1`} placeholder="d-square, d-story, p-letter" value={draft.sizeIds} onChange={(e) => setDraft({ ...draft, sizeIds: e.target.value })} />
            <span className="block font-meta text-[8px] normal-case tracking-normal mt-1">Available: {sizes.map((z) => z.id).join(", ")}</span>
          </label>
          <label className={labelCls}>DEFAULT SIZE ID<input className={`${inputCls} mt-1`} value={draft.defaultSize} onChange={(e) => setDraft({ ...draft, defaultSize: e.target.value })} /></label>
          <label className={`${labelCls} lg:col-span-2`}>OPTION IDS (comma-separated)
            <input className={`${inputCls} mt-1`} placeholder="double-sided, rush, source-file" value={draft.optionIds} onChange={(e) => setDraft({ ...draft, optionIds: e.target.value })} />
            <span className="block font-meta text-[8px] normal-case tracking-normal mt-1">Available: {options.map((o) => o.id).join(", ")}</span>
          </label>
          <label className={labelCls}>RECOMMENDED (service slugs)<input className={`${inputCls} mt-1`} value={draft.recommended} onChange={(e) => setDraft({ ...draft, recommended: e.target.value })} /></label>
          <div className="flex flex-wrap gap-4 lg:col-span-3 pt-2">
            {([["featured", "Featured"], ["popular", "Popular"], ["packageEligible", "Package eligible"], ["allowCustomSize", "Custom size allowed"], ["active", "Active"]] as const).map(([k, label]) => (
              <label key={k} className="font-meta text-[10px] flex items-center gap-2 cursor-pointer font-bold">
                <input type="checkbox" className="accent-[var(--dept)] w-4 h-4 rounded" checked={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} /> {label.toUpperCase()}
              </label>
            ))}
          </div>
          {draft.allowCustomSize && (
            <label className={`${labelCls} lg:col-span-3`}>CUSTOM LIMITS (JSON)
              <input className={`${inputCls} mt-1`} placeholder='{"minW":4,"maxW":40,"minH":4,"maxH":12,"unit":"ft"}' value={draft.customLimits} onChange={(e) => setDraft({ ...draft, customLimits: e.target.value })} />
            </label>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-dept !py-2 !px-4 text-xs font-bold rounded-xl" onClick={submitEditor}>{editingSlug ? "Save Service Changes" : "+ Add Service"}</button>
          {editingSlug && (
            <button className="btn btn-ghost !py-2 !px-4 text-xs font-bold rounded-xl" onClick={() => { setEditingSlug(null); setDraft(blankDraft); }}>Cancel</button>
          )}
        </div>
      </div>

      {/* Category Pills & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => setFilterCat("ALL")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
              filterCat === "ALL" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            All ({services.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.slug}
              onClick={() => setFilterCat(c.slug)}
              className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
                filterCat === c.slug ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
              }`}
            >
              {c.name} ({services.filter((s) => s.category === c.slug).length})
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services by name, slug..."
          className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded-xl w-full sm:w-64"
        />
      </div>

      {/* Services Table */}
      <div className="overflow-x-auto border border-[var(--line)] rounded-2xl bg-[var(--panel)]">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="font-meta text-[9px] text-[var(--muted)] text-left border-b border-[var(--line)] bg-[var(--bg)]">
              <th className="p-3 w-8"></th>
              <th className="p-3">Service</th>
              <th className="p-3">Category</th>
              <th className="p-3">Price (click to edit)</th>
              <th className="p-3">Type</th>
              <th className="p-3">Turnaround</th>
              <th className="p-3">Flags</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredServices.map((s) => (
              <tr key={s.slug} className="border-b border-[var(--line)] hover:bg-[var(--dept-soft)] transition-colors">
                <td className="p-3">
                  <input type="checkbox" className="accent-[var(--dept)]" aria-label={`Select ${s.name}`}
                    checked={selected.includes(s.slug)}
                    onChange={(e) => setSelected((xs) => (e.target.checked ? [...xs, s.slug] : xs.filter((x) => x !== s.slug)))} />
                </td>
                <td className="p-3 font-semibold">{s.name}<span className="block font-meta text-[8px] text-[var(--muted)] font-normal">/{s.slug}</span></td>
                <td className="p-3 font-meta text-[10px]">{s.category}</td>
                <td className="p-3">
                  {priceEdit?.slug === s.slug ? (
                    <span className="inline-flex items-center gap-2">
                      <input autoFocus type="number" min="0" className={`${inputCls} !w-24 !py-1 text-xs`} value={priceEdit.value}
                        onChange={(e) => setPriceEdit({ slug: s.slug, value: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") commitPrice(s.slug, s.price); if (e.key === "Escape") setPriceEdit(null); }} />
                      <button className="font-meta text-[10px] dept-accent font-bold" onClick={() => commitPrice(s.slug, s.price)}>Save</button>
                    </span>
                  ) : (
                    <button className="font-display-wide font-bold hover:text-[var(--dept)] transition-colors" onClick={() => setPriceEdit({ slug: s.slug, value: String(s.price) })}>
                      {isQuoteOnly(s) ? "Quote" : money(s.price)}
                    </button>
                  )}
                </td>
                <td className="p-3 font-meta text-[10px]">{s.pricingType}</td>
                <td className="p-3 font-meta text-[10px]">{s.turnaround}</td>
                <td className="p-3 font-meta text-[9px]">
                  {(() => {
                    const flags: string[] = [];
                    if (s.featured) flags.push("FEAT");
                    if (s.popular) flags.push("POP");
                    if ((s.variations?.length ?? 0) > 0) {
                      const allVarPrices = (s.variations ?? []).flatMap((g) => g.options.map((o) => o.price));
                      const minV = Math.min(...allVarPrices), maxV = Math.max(...allVarPrices);
                      const count = (s.variations ?? []).reduce((acc, g) => acc + g.options.length, 0);
                      flags.push(`VARIANTS (${count}) ${minV === maxV ? money(minV) : `${money(minV)}–${money(maxV)}`}`);
                    }
                    if ((s.tiers?.length ?? 0) > 0) {
                      const tierPrices = (s.tiers ?? []).map((t) => t.price);
                      flags.push(`TIERS (${tierPrices.length}) ${money(Math.min(...tierPrices))}–${money(Math.max(...tierPrices))}`);
                    }
                    if (isQuoteOnly(s)) flags.push("QUOTE-ONLY");
                    else if (s.packageEligible !== false) flags.push("PKG");
                    if (s.active === false) flags.push("OFF");
                    return flags.join(" · ");
                  })()}
                </td>
                <td className="p-3">
                  <span className="flex gap-3 font-meta text-[10px]">
                    <button className="text-[var(--muted)] hover:text-[var(--dept)] transition-colors font-bold" onClick={() => startEdit(s.slug)}>Edit</button>
                    <a className="text-[var(--muted)] hover:text-[var(--dept)] transition-colors" href={`/design-services/${s.slug}`} target="_blank" rel="noopener noreferrer">View →</a>
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

/* ============ AUDIT LOG (PRD §41) ============ */

function AuditLog() {
  const [entries, setEntries] = useState<ManagedItem[]>([]);
  useEffect(() => { listManaged("designAudit").then(setEntries); }, []);
  return (
    <div className="space-y-6">
      <p className="font-meta text-[10px] text-[var(--muted)] max-w-2xl">
        Every catalog change is recorded — user, action, before/after, timestamp (PRD §31/§41). Price history is the stream of <em>price_changed</em> entries.
      </p>
      <div className="flex flex-col gap-2">
        {entries.slice(0, 100).map((e) => (
          <div key={e.id} className="border border-[var(--line)] px-5 py-3 text-sm flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-2xl" style={{ background: "var(--panel)" }}>
            <span className="font-meta text-[9px] dept-accent font-bold">{String(e.action ?? "")}</span>
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

/* ============ STUDIO SHELL ============ */

const SUBS = ["Services", "Categories", "Sizes", "Options", "Packages", "Discounts", "Audit"] as const;

export function DesignStudio() {
  const [sub, setSub] = useState<(typeof SUBS)[number]>("Services");
  return (
    <div className="space-y-6">
      <div className="border-b border-[var(--line)] pb-4">
        <p className="font-meta text-[10px] text-[var(--muted)] max-w-2xl">
          Graphic Design commerce control (PRD §32) — every service, category, size preset, production add-on, bundle package, and discount tier is database-driven. Changes go live instantly site-wide.
        </p>
        <div className="flex flex-wrap gap-1.5 overflow-x-auto no-scrollbar pt-3" role="tablist" aria-label="Design studio sections">
          {SUBS.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={sub === s}
              onClick={() => setSub(s)}
              className={`font-meta text-[10px] sm:text-[10.5px] px-3.5 py-2 rounded-xl border transition-all shrink-0 active:scale-95 ${
                sub === s
                  ? "bg-[var(--dept)] text-[var(--on-dept)] border-[var(--dept)] font-bold shadow-xs"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--dept)] hover:text-[var(--ink)]"
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {sub === "Services" && <ServicesManager />}
      {sub === "Categories" && <CategoriesManager />}
      {sub === "Sizes" && <SizesManager />}
      {sub === "Options" && <OptionsManager />}
      {sub === "Packages" && <PackagesManager />}
      {sub === "Discounts" && <DiscountsManager />}
      {sub === "Audit" && <AuditLog />}
    </div>
  );
}
