import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  addManaged, getFileBuffer, getSettings, listAllOrders, listManaged, logAudit, removeManaged,
  saveSettings, updateManaged, uploadImage, uploadPrivateFile,
  type ManagedItem, type SiteSettings,
} from "../lib/backend";
import { firebaseReady } from "../lib/firebase";
import { parsePsdToFabricJson } from "../lib/psd-import";
import {
  LICENSES, TEMPLATE_FEATURES, currentVersion, effectivePrice, useTemplates,
  type Template, type TemplateReview, type TemplateStatus, type TemplateVersion,
} from "../lib/templates";
import { useMoney } from "../lib/money";

/* ------------------------------------------------------------------
   ADMIN — TEMPLATE STUDIO (Templates PRD §37–§43)
   Create / edit / duplicate / publish / unpublish / archive / delete,
   categories, bundles, review moderation, watermark controls,
   performance analytics. Writes merge over the seed catalog by slug.
------------------------------------------------------------------- */

const inputCls = "bg-transparent border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--dept)] transition-colors w-full";
const labelCls = "font-meta text-[9px] text-[var(--muted)] block mb-1";

async function mutate(fn: () => Promise<unknown>, ok: string) {
  try { await fn(); toast.success(ok); return true; }
  catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); return false; }
}

const blank: Template = {
  slug: "", name: "", description: "", category: "events", subcategory: "",
  tags: [], keywords: [], software: "Adobe Photoshop", fileFormat: "PSD",
  dimensions: "1080 × 1350 px", resolution: "300 DPI", colorMode: "CMYK", fileSize: "",
  orientation: "portrait", features: ["Editable", "Fully Layered"], fonts: [],
  price: 25, salePrice: undefined, licenseFees: { personal: 0, commercial: 10, extended: 25 },
  customizePrice: 75, customizeAvailable: true,
  versions: [{ version: "1.0", date: new Date().toISOString().slice(0, 10), notes: "Initial release.", status: "current" }],
  previewImages: [], thumbnail: undefined, privateFilePath: undefined,
  status: "draft", bestseller: false, isNew: true, sales: 0,
  hue: Math.floor(Math.random() * 360), createdAt: new Date().toISOString().slice(0, 10),
};

/* ---------------- template form ---------------- */

function TemplateForm({ initial, managedId, onDone }: {
  initial: Template;
  managedId?: string;   // existing managed doc id (override) when editing
  onDone: () => void;
}) {
  const [f, setF] = useState<Template>(initial);
  const [busy, setBusy] = useState(false);
  const { categories } = useTemplates();
  const set = <K extends keyof Template>(k: K, v: Template[K]) => setF((x) => ({ ...x, [k]: v }));
  const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  const uploadPreview = async (file: File) => {
    setBusy(true);
    try {
      const url = await uploadImage(file, "template-previews");
      set("previewImages", [...f.previewImages, url]);
      toast.success("Preview uploaded — remember to Save.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed."); }
    setBusy(false);
  };

  const uploadPrivate = async (file: File) => {
    setBusy(true);
    try {
      const path = await uploadPrivateFile(file, `template-files/${f.slug || "unassigned"}`);
      set("privateFilePath", path);
      
      const isPsd = /\.psd$|\.psb$/i.test(file.name) || file.type.includes("photoshop") || file.type.includes("psd");
      if (isPsd) {
        set("fileFormat", "PSD");
        set("software", "Adobe Photoshop");
        toast.info("Parsing PSD layers for Kon10 Editor…");
        try {
          const buffer = await file.arrayBuffer();
          const doc = await parsePsdToFabricJson(buffer, { ...f, slug: f.slug || "unassigned" });
          set("canvasJson", JSON.stringify(doc));
          if (doc.canvas) {
            set("dimensions", `${doc.canvas.width} x ${doc.canvas.height} px`);
          }
          toast.success("PSD layers parsed & saved to Kon10 Editor! Remember to Save.");
        } catch (parseErr) {
          console.error("PSD parse warning:", parseErr);
          toast.warning("PSD stored. (Layer parser: " + (parseErr instanceof Error ? parseErr.message : String(parseErr)) + ")");
        }
      } else {
        toast.success("Source file stored privately — remember to Save.");
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed."); }
    setBusy(false);
  };

  const reparsePrivatePsd = async () => {
    if (!f.privateFilePath) return;
    setBusy(true);
    try {
      toast.info("Fetching & parsing PSD layers…");
      const buffer = await getFileBuffer(f.privateFilePath);
      const doc = await parsePsdToFabricJson(buffer, { ...f, slug: f.slug || "unassigned" });
      set("canvasJson", JSON.stringify(doc));
      if (doc.canvas) {
        set("dimensions", `${doc.canvas.width} x ${doc.canvas.height} px`);
      }
      toast.success("PSD parsed & canvas updated! Remember to Save.");
    } catch (e) {
      toast.error("Re-parse failed: " + (e instanceof Error ? e.message : String(e)));
    }
    setBusy(false);
  };

  const save = async () => {
    if (!f.name.trim() || !f.slug.trim()) { toast.error("Name and slug are required."); return; }
    const payload: Record<string, unknown> = { ...f };
    delete (payload as { id?: unknown }).id;
    const ok = await mutate(async () => {
      if (managedId) await updateManaged("templates", managedId, payload);
      else await addManaged("templates", payload);
      await logAudit({ user: "admin", action: managedId ? "template_updated" : "template_created", entity: `template:${f.slug}`, after: { name: f.name, price: f.price, status: f.status } });
    }, managedId ? "Template updated — live immediately." : "Template created.");
    if (ok) onDone();
  };

  return (
    <div className="border border-[var(--line-strong)] p-6" style={{ background: "var(--panel)" }}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div><span className={labelCls}>Template name *</span><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><span className={labelCls}>Slug * (URL: /templates/…)</span><input className={inputCls} value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} /></div>
        <div><span className={labelCls}>Status</span>
          <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value as TemplateStatus)}>
            {["draft", "published", "unpublished", "archived"].map((s) => <option key={s} className="text-black">{s}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-3"><span className={labelCls}>Description</span>
          <textarea className={`${inputCls} min-h-20`} value={f.description} onChange={(e) => set("description", e.target.value)} /></div>

        <div><span className={labelCls}>Category</span>
          <select className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value)}>
            {categories.map((c) => <option key={c.slug} value={c.slug} className="text-black">{c.name}</option>)}
          </select>
        </div>
        <div><span className={labelCls}>Subcategory</span>
          <select className={inputCls} value={f.subcategory ?? ""} onChange={(e) => set("subcategory", e.target.value)}>
            <option value="" className="text-black">—</option>
            {(categories.find((c) => c.slug === f.category)?.subs ?? []).map((s) => <option key={s} className="text-black">{s}</option>)}
          </select>
        </div>
        <div><span className={labelCls}>Tags (comma-separated)</span><input className={inputCls} value={f.tags.join(", ")} onChange={(e) => set("tags", csv(e.target.value))} /></div>
        <div><span className={labelCls}>Keywords (comma-separated)</span><input className={inputCls} value={f.keywords.join(", ")} onChange={(e) => set("keywords", csv(e.target.value))} /></div>

        <div><span className={labelCls}>Price (USD, 0 = free)</span><input type="number" className={inputCls} value={f.price} onChange={(e) => set("price", Number(e.target.value))} /></div>
        <div><span className={labelCls}>Sale price (blank = none)</span><input type="number" className={inputCls} value={f.salePrice ?? ""} onChange={(e) => set("salePrice", e.target.value === "" ? undefined : Number(e.target.value))} /></div>
        <div><span className={labelCls}>Designer customization price</span><input type="number" className={inputCls} value={f.customizePrice} onChange={(e) => set("customizePrice", Number(e.target.value))} /></div>
        {LICENSES.map((l) => (
          <div key={l.id}><span className={labelCls}>{l.name} fee</span>
            <input type="number" className={inputCls} value={f.licenseFees[l.id]}
              onChange={(e) => set("licenseFees", { ...f.licenseFees, [l.id]: Number(e.target.value) })} /></div>
        ))}

        <div><span className={labelCls}>Software</span>
          <select className={inputCls} value={f.software} onChange={(e) => set("software", e.target.value)}>
            {["Adobe Photoshop", "Adobe Illustrator", "Adobe InDesign", "Canva", "Other"].map((s) => <option key={s} className="text-black">{s}</option>)}
          </select>
        </div>
        <div><span className={labelCls}>File format</span><input className={inputCls} value={f.fileFormat} onChange={(e) => set("fileFormat", e.target.value)} /></div>
        <div><span className={labelCls}>Dimensions</span><input className={inputCls} value={f.dimensions} onChange={(e) => set("dimensions", e.target.value)} /></div>
        <div><span className={labelCls}>Resolution</span><input className={inputCls} value={f.resolution} onChange={(e) => set("resolution", e.target.value)} /></div>
        <div><span className={labelCls}>Color mode</span>
          <select className={inputCls} value={f.colorMode} onChange={(e) => set("colorMode", e.target.value)}>
            {["CMYK", "RGB"].map((s) => <option key={s} className="text-black">{s}</option>)}
          </select>
        </div>
        <div><span className={labelCls}>File size</span><input className={inputCls} value={f.fileSize} onChange={(e) => set("fileSize", e.target.value)} /></div>
        <div><span className={labelCls}>Orientation</span>
          <select className={inputCls} value={f.orientation} onChange={(e) => set("orientation", e.target.value as Template["orientation"])}>
            {["portrait", "square", "landscape"].map((s) => <option key={s} className="text-black">{s}</option>)}
          </select>
        </div>
        <div><span className={labelCls}>Fonts (comma-separated)</span><input className={inputCls} value={f.fonts.join(", ")} onChange={(e) => set("fonts", csv(e.target.value))} /></div>

        <div className="sm:col-span-2 lg:col-span-3">
          <span className={labelCls}>Product features</span>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_FEATURES.map((feat) => (
              <button key={feat} type="button"
                onClick={() => set("features", f.features.includes(feat) ? f.features.filter((x) => x !== feat) : [...f.features, feat])}
                className="font-meta text-[9px] px-3 py-1.5 border transition-colors"
                style={f.features.includes(feat) ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}>
                {feat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--dept)]" checked={f.bestseller} onChange={(e) => set("bestseller", e.target.checked)} /> Bestseller</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--dept)]" checked={f.isNew} onChange={(e) => set("isNew", e.target.checked)} /> New</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--dept)]" checked={f.customizeAvailable} onChange={(e) => set("customizeAvailable", e.target.checked)} /> Customizable</label>
        </div>
        <div><span className={labelCls}>Preview hue (0–360, generated art)</span><input type="number" className={inputCls} value={f.hue} onChange={(e) => set("hue", Number(e.target.value))} /></div>
      </div>

      {/* media */}
      <div className="rule-t mt-6 pt-5 grid sm:grid-cols-2 gap-6">
        <div>
          <span className={labelCls}>Preview images (public, watermarked on-site)</span>
          <div className="flex flex-wrap gap-2 mb-2">
            {f.previewImages.map((_, i) => (
              <span key={i} className="font-meta text-[9px] border border-[var(--line)] px-2 py-1 flex items-center gap-2">
                Preview {i + 1}
                <button aria-label={`Remove preview ${i + 1}`} onClick={() => set("previewImages", f.previewImages.filter((_, x) => x !== i))}>✕</button>
              </span>
            ))}
          </div>
          <input type="file" accept="image/*" disabled={busy} onChange={(e) => e.target.files?.[0] && uploadPreview(e.target.files[0])} className="text-sm" />
          {!firebaseReady && <p className="font-meta text-[9px] text-[var(--muted)] mt-1">Demo mode — uploads preview locally only.</p>}
        </div>
        <div>
          <span className={labelCls}>Source file (PSD/AI/INDD/ZIP — PRIVATE, never public)</span>
          <p className="font-meta text-[9px] mt-1 mb-2" style={{ color: f.privateFilePath ? "var(--dept)" : "var(--muted)" }}>
            {f.privateFilePath ? `✓ Stored: ${f.privateFilePath.slice(0, 48)}…` : "No file uploaded yet — downloads deliver a readme stub."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept=".psd,.psb,.ai,.indd,.zip,.pdf" disabled={busy} onChange={(e) => e.target.files?.[0] && uploadPrivate(e.target.files[0])} className="text-sm" />
            {f.privateFilePath && (
              <button type="button" onClick={() => void reparsePrivatePsd()} disabled={busy} className="font-meta text-[9px] px-2 py-1 border border-[var(--dept)] text-[var(--dept)] hover:bg-[var(--dept)] hover:text-[var(--on-dept)] transition-colors">
                ↻ Re-parse PSD to Canvas
              </button>
            )}
          </div>
          {f.canvasJson && (
            <p className="font-meta text-[9px] text-[var(--dept)] mt-1.5">
              ✓ Kon10 Editor canvas document ready ({(() => { try { const parsed = JSON.parse(f.canvasJson); return (parsed.fabric?.objects?.length ?? 0) + " layers"; } catch { return "valid"; } })()})
            </p>
          )}
        </div>
      </div>

      {/* versions */}
      <div className="rule-t mt-6 pt-5">
        <span className={labelCls}>Versions (immutable — never overwrite a released file)</span>
        {f.versions.map((v, i) => (
          <div key={i} className="grid grid-cols-[80px_1fr_2fr_110px_32px] gap-2 mt-2 items-center">
            <input className={inputCls} value={v.version} aria-label="Version number"
              onChange={(e) => set("versions", f.versions.map((x, xi) => xi === i ? { ...x, version: e.target.value } : x))} />
            <input className={inputCls} type="date" value={v.date} aria-label="Release date"
              onChange={(e) => set("versions", f.versions.map((x, xi) => xi === i ? { ...x, date: e.target.value } : x))} />
            <input className={inputCls} value={v.notes} placeholder="Change notes" aria-label="Change notes"
              onChange={(e) => set("versions", f.versions.map((x, xi) => xi === i ? { ...x, notes: e.target.value } : x))} />
            <select className={inputCls} value={v.status} aria-label="Version status"
              onChange={(e) => set("versions", f.versions.map((x, xi) => xi === i ? { ...x, status: e.target.value as TemplateVersion["status"] } : x))}>
              <option className="text-black">current</option><option className="text-black">superseded</option>
            </select>
            <button aria-label="Remove version" onClick={() => set("versions", f.versions.filter((_, xi) => xi !== i))}>✕</button>
          </div>
        ))}
        <button className="btn btn-ghost !py-1.5 mt-3"
          onClick={() => set("versions", [...f.versions.map((v) => ({ ...v, status: "superseded" as const })), { version: "", date: new Date().toISOString().slice(0, 10), notes: "", status: "current" }])}>
          + Add version
        </button>
      </div>

      <div className="flex gap-3 mt-6">
        <button className="btn btn-dept" disabled={busy} onClick={save}>{managedId ? "Save changes" : "Create template"}</button>
        <button className="btn btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------------- templates list ---------------- */

function TemplatesManager() {
  const money = useMoney();
  const { templates } = useTemplates();
  const [managed, setManaged] = useState<ManagedItem[]>([]);
  const [editing, setEditing] = useState<{ tpl: Template; id?: string } | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = () => listManaged("templates").then(setManaged);
  useEffect(() => { reload(); }, []);
  const managedIdFor = (slug: string) => managed.find((m) => m.slug === slug)?.id;

  const write = async (tpl: Template, changes: Partial<Template>, action: string) => {
    const id = managedIdFor(tpl.slug);
    const payload: Record<string, unknown> = { ...tpl, ...changes };
    delete (payload as { id?: unknown }).id;
    await mutate(async () => {
      if (id) await updateManaged("templates", id, changes as Record<string, unknown>);
      else await addManaged("templates", payload);
      await logAudit({ user: "admin", action, entity: `template:${tpl.slug}` });
      await reload();
    }, `${tpl.name}: ${action.replaceAll("_", " ")}.`);
  };

  if (creating) return <TemplateForm initial={blank} onDone={() => { setCreating(false); reload(); }} />;
  if (editing) return <TemplateForm initial={editing.tpl} managedId={editing.id} onDone={() => { setEditing(null); reload(); }} />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="font-meta text-[10px] text-[var(--muted)]">{templates.length} templates · edits merge over the built-in catalog and go live instantly</p>
        <button className="btn btn-dept !py-2.5" onClick={() => setCreating(true)}>+ New template</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="font-meta text-[9px] text-[var(--muted)] text-left border-b border-[var(--line)]">
              <th className="py-2 pr-4 font-normal">Template</th><th className="py-2 pr-4 font-normal">Price</th>
              <th className="py-2 pr-4 font-normal">Status</th><th className="py-2 pr-4 font-normal">File</th>
              <th className="py-2 font-normal text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.slug} className="border-b border-[var(--line)]">
                <td className="py-3 pr-4">
                  <strong>{t.name}</strong>
                  <span className="font-meta text-[9px] text-[var(--muted)] block">/{t.slug} · v{currentVersion(t)?.version}</span>
                </td>
                <td className="py-3 pr-4">{effectivePrice(t) === 0 ? "Free" : money(effectivePrice(t))}</td>
                <td className="py-3 pr-4">
                  <span className="font-meta text-[9px] px-2 py-1 border" style={{
                    borderColor: t.status === "published" ? "var(--dept)" : "var(--line)",
                    color: t.status === "published" ? "var(--dept)" : "var(--muted)",
                  }}>{t.status.toUpperCase()}</span>
                </td>
                <td className="py-3 pr-4 font-meta text-[9px]">{t.privateFilePath ? "✓ PRIVATE" : "—"}</td>
                <td className="py-3 text-right whitespace-nowrap">
                  <Link to={`/editor/author/${t.slug}`} className="font-meta text-[9px] px-2 py-1 dept-accent hover:underline">STUDIO</Link>
                  <button className="font-meta text-[9px] px-2 py-1 hover:text-[var(--dept)]" onClick={() => setEditing({ tpl: t, id: managedIdFor(t.slug) })}>EDIT</button>
                  <button className="font-meta text-[9px] px-2 py-1 hover:text-[var(--dept)]"
                    onClick={() => setEditing({ tpl: { ...t, slug: `${t.slug}-copy`, name: `${t.name} (Copy)`, status: "draft" }, id: undefined })}>DUPLICATE</button>
                  {t.status !== "published" ? (
                    <button className="font-meta text-[9px] px-2 py-1 hover:text-[var(--dept)]" onClick={() => write(t, { status: "published" }, "template_published")}>PUBLISH</button>
                  ) : (
                    <button className="font-meta text-[9px] px-2 py-1 hover:text-[var(--dept)]" onClick={() => write(t, { status: "unpublished" }, "template_unpublished")}>UNPUBLISH</button>
                  )}
                  {t.status !== "archived" && (
                    <button className="font-meta text-[9px] px-2 py-1 hover:text-[var(--dept)]" onClick={() => write(t, { status: "archived" }, "template_archived")}>ARCHIVE</button>
                  )}
                  <button className="font-meta text-[9px] px-2 py-1 text-red-600"
                    onClick={async () => {
                      if (!confirm(`Delete "${t.name}"? Existing customers keep their downloads.`)) return;
                      const id = managedIdFor(t.slug);
                      if (id) await mutate(() => removeManaged("templates", id).then(reload), "Deleted.");
                      else await write(t, { status: "archived" }, "template_archived"); // seeds can't be hard-deleted — archive instead
                    }}>DELETE</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- categories + bundles ---------------- */

function CategoriesManager() {
  const { categories } = useTemplates();
  const [name, setName] = useState("");
  const [subs, setSubs] = useState("");

  return (
    <div>
      <p className="font-meta text-[10px] text-[var(--muted)] mb-6 max-w-2xl">
        Categories drive the marketplace filters. New categories appear in the filter dropdown immediately.
      </p>
      <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-3 max-w-3xl mb-8">
        <input className={inputCls} placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Category name" />
        <input className={inputCls} placeholder="Subcategories (comma-separated)" value={subs} onChange={(e) => setSubs(e.target.value)} aria-label="Subcategories" />
        <button className="btn btn-dept !py-2" onClick={async () => {
          if (!name.trim()) return;
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const ok = await mutate(() => addManaged("templateCategories", {
            slug, name: name.trim(), subs: subs.split(",").map((s) => s.trim()).filter(Boolean), sort: categories.length + 1, active: true,
          }), "Category added.");
          if (ok) { setName(""); setSubs(""); }
        }}>Add</button>
      </div>
      <div className="flex flex-col gap-2 max-w-3xl">
        {categories.map((c) => (
          <div key={c.slug} className="border border-[var(--line)] px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ background: "var(--panel)" }}>
            <div>
              <strong className="text-sm">{c.name}</strong>
              <span className="font-meta text-[9px] text-[var(--muted)] ml-3">{c.subs.join(" · ")}</span>
            </div>
            <button className="font-meta text-[9px] px-2 py-1 border transition-colors"
              style={{ borderColor: "var(--line)", color: c.active === false ? "var(--muted)" : "var(--dept)" }}
              onClick={() => mutate(() => addManaged("templateCategories", { ...c, active: c.active === false }), c.active === false ? "Category enabled." : "Category hidden.")}>
              {c.active === false ? "HIDDEN — ENABLE" : "VISIBLE — HIDE"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BundlesManager() {
  const money = useMoney();
  const { bundles, templates } = useTemplates();
  const [name, setName] = useState("");
  const [slugs, setSlugs] = useState("");
  const [price, setPrice] = useState("");

  return (
    <div>
      <p className="font-meta text-[10px] text-[var(--muted)] mb-6 max-w-2xl">
        Bundles sell several templates at one price — buyers get a library entitlement for every included template.
      </p>
      <div className="grid sm:grid-cols-[2fr_2fr_100px_auto] gap-3 mb-8">
        <input className={inputCls} placeholder="Bundle name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Bundle name" />
        <input className={inputCls} placeholder="Template slugs (comma-separated)" value={slugs} onChange={(e) => setSlugs(e.target.value)} aria-label="Template slugs" />
        <input className={inputCls} placeholder="Price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Bundle price" />
        <button className="btn btn-dept !py-2" onClick={async () => {
          if (!name.trim() || !slugs.trim()) return;
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const ok = await mutate(() => addManaged("templateBundles", {
            slug, name: name.trim(), description: "",
            templateSlugs: slugs.split(",").map((s) => s.trim()).filter(Boolean),
            price: Number(price) || 0, hue: Math.floor(Math.random() * 360), active: true,
          }), "Bundle added.");
          if (ok) { setName(""); setSlugs(""); setPrice(""); }
        }}>Add</button>
      </div>
      <div className="flex flex-col gap-2">
        {bundles.map((b) => (
          <div key={b.slug} className="border border-[var(--line)] px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ background: "var(--panel)" }}>
            <div>
              <strong className="text-sm">{b.name}</strong> <span className="font-meta text-[10px] dept-accent">{money(b.price)}</span>
              <span className="font-meta text-[9px] text-[var(--muted)] block">{b.templateSlugs.join(" · ")}</span>
            </div>
            <button className="font-meta text-[9px] px-2 py-1 border border-[var(--line)]"
              style={{ color: b.active === false ? "var(--muted)" : "var(--dept)" }}
              onClick={() => mutate(() => addManaged("templateBundles", { ...b, active: b.active === false }), "Bundle updated.")}>
              {b.active === false ? "HIDDEN — ENABLE" : "VISIBLE — HIDE"}
            </button>
          </div>
        ))}
      </div>
      <p className="font-meta text-[9px] text-[var(--muted)] mt-6">Available slugs: {templates.map((t) => t.slug).join(", ")}</p>
    </div>
  );
}

/* ---------------- review moderation (§35) ---------------- */

function ReviewModeration() {
  const [reviews, setReviews] = useState<(TemplateReview & { id: string })[]>([]);
  const reload = () => listManaged("templateReviews").then((r) => setReviews(r as unknown as (TemplateReview & { id: string })[]));
  useEffect(() => { reload(); }, []);

  if (reviews.length === 0) return <p className="font-meta text-[11px] text-[var(--muted)]">No reviews yet — only verified purchasers can leave one.</p>;
  return (
    <div className="flex flex-col gap-3">
      {reviews.map((r) => (
        <div key={r.id} className="border border-[var(--line)] px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ background: "var(--panel)" }}>
          <div>
            <span className="dept-accent font-meta text-[10px]">{"★".repeat(r.rating)}</span>
            <strong className="text-sm ml-2">{r.templateSlug}</strong>
            <p className="text-[13px] text-[var(--muted)] mt-1">“{r.review}” — {r.name} ({r.email})</p>
          </div>
          <div className="flex gap-2">
            {r.status === "pending" && (
              <button className="font-meta text-[9px] px-2 py-1 border border-[var(--dept)] dept-accent"
                onClick={() => mutate(() => updateManaged("templateReviews", r.id, { status: "approved" }).then(reload), "Review published.")}>APPROVE</button>
            )}
            <button className="font-meta text-[9px] px-2 py-1 border border-[var(--line)] text-red-600"
              onClick={() => mutate(() => removeManaged("templateReviews", r.id).then(reload), "Review removed.")}>REMOVE</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- watermark controls (§39) ---------------- */

function WatermarkSettings() {
  const [wm, setWm] = useState<NonNullable<SiteSettings["watermark"]>>({});
  useEffect(() => { getSettings().then((s) => setWm(s.watermark ?? {})); }, []);
  const num = (v: string, d: number) => (v === "" || !Number.isFinite(Number(v)) ? d : Number(v));

  return (
    <div className="max-w-xl">
      <p className="font-meta text-[10px] text-[var(--muted)] mb-6">
        Preview protection — a repeated diagonal watermark renders over every public preview. Source files are never public.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center gap-2 text-sm col-span-2">
          <input type="checkbox" className="accent-[var(--dept)]" checked={wm.enabled !== false} onChange={(e) => setWm({ ...wm, enabled: e.target.checked })} />
          Watermark enabled
        </label>
        <div className="col-span-2"><span className={labelCls}>Watermark text</span>
          <input className={inputCls} value={wm.text ?? ""} placeholder="SOCIAL KON10 • PREVIEW" onChange={(e) => setWm({ ...wm, text: e.target.value })} /></div>
        <div><span className={labelCls}>Opacity (0–1)</span>
          <input className={inputCls} type="number" step="0.01" min="0" max="1" value={wm.opacity ?? ""} placeholder="0.16" onChange={(e) => setWm({ ...wm, opacity: num(e.target.value, 0.16) })} /></div>
        <div><span className={labelCls}>Rotation (degrees)</span>
          <input className={inputCls} type="number" value={wm.rotation ?? ""} placeholder="-30" onChange={(e) => setWm({ ...wm, rotation: num(e.target.value, -30) })} /></div>
        <div><span className={labelCls}>Spacing (px)</span>
          <input className={inputCls} type="number" value={wm.spacing ?? ""} placeholder="220" onChange={(e) => setWm({ ...wm, spacing: num(e.target.value, 220) })} /></div>
      </div>
      <button className="btn btn-dept mt-6" onClick={() => mutate(async () => {
        const s = await getSettings();
        await saveSettings({ ...s, watermark: wm });
      }, "Watermark settings saved — live on all previews.")}>Save watermark settings</button>
    </div>
  );
}

/* ---------------- performance (§43) ---------------- */

function TemplatePerformance() {
  const money = useMoney();
  const { templates } = useTemplates();
  const [stats, setStats] = useState<Record<string, { revenue: number; sales: number }>>({});
  const [downloads, setDownloads] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const [orders, dls] = await Promise.all([listAllOrders(), listManaged("downloadRecords")]);
      const s: Record<string, { revenue: number; sales: number }> = {};
      orders.forEach((o) => o.items.forEach((i) => {
        if (!i.templateSlug) return;
        const k = i.templateSlug;
        const cur = s[k] ?? { revenue: 0, sales: 0 };
        cur.revenue += i.unitPrice + i.addons.reduce((x, a) => x + a.price, 0);
        cur.sales += 1;
        s[k] = cur;
      }));
      setStats(s);
      const d: Record<string, number> = {};
      dls.forEach((r) => { const k = String(r.templateSlug ?? ""); if (k) d[k] = (d[k] ?? 0) + 1; });
      setDownloads(d);
    })();
  }, []);

  const rows = useMemo(() => templates
    .map((t) => ({ t, ...(stats[t.slug] ?? { revenue: 0, sales: 0 }), dls: downloads[t.slug] ?? 0 }))
    .sort((a, b) => b.revenue - a.revenue), [templates, stats, downloads]);

  return (
    <div>
      <p className="font-meta text-[10px] text-[var(--muted)] mb-6">Template performance — revenue, sales and downloads from live orders.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="font-meta text-[9px] text-[var(--muted)] text-left border-b border-[var(--line)]">
              <th className="py-2 pr-4 font-normal">Template</th><th className="py-2 pr-4 font-normal">Revenue</th>
              <th className="py-2 pr-4 font-normal">Sales</th><th className="py-2 font-normal">Downloads</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, revenue, sales, dls }) => (
              <tr key={t.slug} className="border-b border-[var(--line)]">
                <td className="py-2.5 pr-4">{t.name}</td>
                <td className="py-2.5 pr-4 font-bold">{money(revenue)}</td>
                <td className="py-2.5 pr-4">{sales}</td>
                <td className="py-2.5">{dls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- root ---------------- */

const SECTIONS = ["Templates", "Categories", "Bundles", "Reviews", "Watermark", "Performance"] as const;

export function TemplateStudio() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Templates");
  return (
    <div>
      <p className="font-meta text-[10px] text-[var(--muted)] mb-6 max-w-3xl">
        Template marketplace manager — create templates, upload private source files and public previews,
        set pricing and licenses, manage versions, categories, bundles, reviews and watermark protection.
      </p>
      <div className="flex flex-wrap gap-2 mb-8" role="tablist" aria-label="Template studio sections">
        {SECTIONS.map((s) => (
          <button key={s} role="tab" aria-selected={section === s} onClick={() => setSection(s)}
            className="font-meta text-[10px] px-3.5 py-2 border transition-colors"
            style={section === s ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}>
            {s}
          </button>
        ))}
      </div>
      {section === "Templates" && <TemplatesManager />}
      {section === "Categories" && <CategoriesManager />}
      {section === "Bundles" && <BundlesManager />}
      {section === "Reviews" && <ReviewModeration />}
      {section === "Watermark" && <WatermarkSettings />}
      {section === "Performance" && <TemplatePerformance />}
    </div>
  );
}
