import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CONTACT, waLink } from "../lib/data";
import { useDepartment } from "../lib/dept";
import { breadcrumbLd, track, useSEO } from "../lib/seo";
import { Reveal } from "../lib/motion";
import { useMoney } from "../lib/money";
import { useShop } from "../lib/shop";
import { useAuth } from "../lib/auth";
import { firebaseReady } from "../lib/firebase";
import { addManaged, createLead, createOrder, listManaged, listMyOrders } from "../lib/backend";
import {
  INCLUDED_CHECKLIST, LICENSES, bundleCartItem, bundleValue, currentVersion, effectivePrice,
  entitlementsFromOrders, templateCartItem, usePublishedTemplates,
  type LicenseId, type Template, type TemplateReview,
} from "../lib/templates";
import { TemplateCard, TemplatePreview } from "../components/Watermark";

/* ------------------------------------------------------------------
   TEMPLATE DETAIL (Templates PRD §8–§19, §25–§36, §47, §60, §65)
   /templates/:slug — the primary sales page.
------------------------------------------------------------------- */

const inputCls = "w-full bg-transparent border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--dept)] transition-colors";
const labelCls = "font-meta text-[10px] text-[var(--muted)] block mb-1.5";

/* ---------- preview gallery with fullscreen + zoom (§9) ---------- */

function Gallery({ tpl }: { tpl: Template }) {
  const count = Math.max(tpl.previewImages.length, 4); // uploaded previews or 4 generated views
  const [idx, setIdx] = useState(0);
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % count);
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + count) % count);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [full, count]);

  const labels = ["Main preview", "Detail shot", "Mockup", "Alternate layout"];

  return (
    <div>
      <button
        className="block w-full text-left cursor-zoom-in focus-visible:outline-2 focus-visible:outline-[var(--dept)]"
        onClick={() => { setFull(true); setZoom(false); }}
        aria-label={`Open ${tpl.name} preview fullscreen`}
      >
        <TemplatePreview tpl={tpl} variant={idx} className="aspect-[4/5] border border-[var(--line)]" />
      </button>
      <div className="grid grid-cols-4 gap-2 mt-2" role="tablist" aria-label="Preview images">
        {Array.from({ length: count }, (_, i) => (
          <button key={i} role="tab" aria-selected={idx === i} aria-label={labels[i] ?? `Preview ${i + 1}`}
            onClick={() => setIdx(i)}
            className="border transition-colors"
            style={{ borderColor: idx === i ? "var(--dept)" : "var(--line)" }}>
            <TemplatePreview tpl={tpl} variant={i} className="aspect-[4/5]" noWatermark={false} />
          </button>
        ))}
      </div>
      <p className="font-meta text-[9px] text-[var(--muted)] mt-3">
        PROTECTED PREVIEW — the purchased file is unwatermarked, full resolution.
      </p>

      {full && (
        <div className="fixed inset-0 z-[90] flex flex-col" role="dialog" aria-modal="true" aria-label={`${tpl.name} fullscreen preview`}
          style={{ background: "rgb(0 0 0 / 0.92)" }}>
          <div className="flex items-center justify-between px-5 py-4">
            <span className="font-meta text-[10px] text-white/70">{tpl.name} — {idx + 1}/{count}</span>
            <div className="flex gap-2">
              <button className="font-meta text-[10px] px-3 py-2 border border-white/30 text-white" onClick={() => setZoom((z) => !z)}>
                {zoom ? "FIT" : "ZOOM"}
              </button>
              <button className="font-meta text-[10px] px-3 py-2 border border-white/30 text-white" onClick={() => setFull(false)} aria-label="Close fullscreen preview">
                CLOSE ✕
              </button>
            </div>
          </div>
          <div className="grow overflow-auto grid place-items-center px-4 pb-4">
            <div className={zoom ? "w-[140%] max-w-none" : "max-w-lg w-full"} onClick={() => setZoom((z) => !z)}>
              <TemplatePreview tpl={tpl} variant={idx} className="aspect-[4/5] w-full" />
            </div>
          </div>
          <div className="flex justify-center gap-3 pb-6">
            <button className="font-meta text-[10px] px-4 py-2 border border-white/30 text-white" onClick={() => setIdx((i) => (i - 1 + count) % count)} aria-label="Previous preview">← PREV</button>
            <button className="font-meta text-[10px] px-4 py-2 border border-white/30 text-white" onClick={() => setIdx((i) => (i + 1) % count)} aria-label="Next preview">NEXT →</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- verified reviews (§35) ---------- */

function Reviews({ tpl, entitlement }: { tpl: Template; entitlement: { orderId: string } | null }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<TemplateReview[]>([]);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    (async () => {
      const rows = await listManaged("templateReviews") as unknown as TemplateReview[];
      setReviews(rows.filter((r) => r.templateSlug === tpl.slug && r.status === "approved"));
    })();
  }, [tpl.slug]);

  const submit = async () => {
    if (!entitlement || !text.trim()) return;
    await addManaged("templateReviews", {
      templateSlug: tpl.slug, orderId: entitlement.orderId,
      name: user?.email?.split("@")[0] ?? "Customer", email: user?.email ?? "",
      rating, review: text.trim(), status: "pending",
      createdAt: new Date().toISOString(),
    });
    setSent(true);
    track("template_review", { template: tpl.slug, rating });
  };

  return (
    <section className="rule-t" id="reviews">
      <div className="wrap py-14">
        <span className="idx">/reviews</span>
        <h2 className="display-sub mt-2 mb-8">Verified reviews</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-[var(--muted)] max-w-lg">
            No reviews yet. Only customers with a verified purchase can review — so when reviews appear here, they're real.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            {reviews.map((r, i) => (
              <blockquote key={r.id ?? i} className="border border-[var(--line)] p-6" style={{ background: "var(--panel)" }}>
                <p className="dept-accent font-meta text-[11px]" aria-label={`${r.rating} out of 5 stars`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
                <p className="text-sm mt-3 leading-relaxed">“{r.review}”</p>
                <footer className="font-meta text-[9px] text-[var(--muted)] mt-4">✓ VERIFIED PURCHASE — {r.name}</footer>
              </blockquote>
            ))}
          </div>
        )}

        {entitlement && !sent && (
          <div className="mt-8 max-w-xl border border-[var(--line)] p-6" style={{ background: "var(--panel)" }}>
            <p className="font-meta text-[10px] mb-4">YOU OWN THIS TEMPLATE — LEAVE A VERIFIED REVIEW</p>
            <label className={labelCls}>Rating
              <select className={inputCls} value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n} className="text-black">{n} star{n > 1 ? "s" : ""}</option>)}
              </select>
            </label>
            <label className={`${labelCls} mt-4`}>Review
              <textarea className={`${inputCls} min-h-24`} value={text} onChange={(e) => setText(e.target.value)} placeholder="How did the template work for you?" />
            </label>
            <button className="btn btn-dept mt-4" disabled={!text.trim()} onClick={submit}>Submit review</button>
          </div>
        )}
        {sent && <p className="font-meta text-[10px] dept-accent mt-6">Thanks — your review is pending moderation.</p>}
      </div>
    </section>
  );
}

/* ---------- report template (§36) ---------- */

function ReportTemplate({ tpl }: { tpl: Template }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Broken file");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async () => {
    await createLead({
      intent: "template-report", dept: "brand", service: `template:${tpl.slug}`,
      name: "Template report", email: "", company: "",
      message: `[${reason}] ${tpl.name} (${tpl.slug}) — ${note || "no details given"}`,
    });
    setSent(true);
    track("template_report", { template: tpl.slug, reason });
  };

  if (!open) {
    return (
      <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors"
        onClick={() => setOpen(true)}>
        Report this template
      </button>
    );
  }
  if (sent) return <p className="font-meta text-[10px] dept-accent">Report received — thank you. We'll review it shortly.</p>;
  return (
    <div className="border border-[var(--line)] p-4 max-w-sm" style={{ background: "var(--panel)" }}>
      <label className={labelCls}>Reason
        <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
          {["Broken file", "Missing asset", "Copyright concern", "Incorrect information", "Preview does not match file", "Other"].map((r) => (
            <option key={r} className="text-black">{r}</option>
          ))}
        </select>
      </label>
      <label className={`${labelCls} mt-3`}>Details (optional)
        <textarea className={`${inputCls} min-h-16`} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex gap-2 mt-3">
        <button className="btn btn-dept !py-2" onClick={submit}>Send report</button>
        <button className="btn btn-ghost !py-2" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------- page ---------- */

export default function TemplateDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { templates, categories, bundles, ready } = usePublishedTemplates();
  const tpl = templates.find((x) => x.slug === slug);
  const { add } = useShop();
  const { user } = useAuth();
  const money = useMoney();
  const [license, setLicense] = useState<LicenseId>("personal");
  const [claiming, setClaiming] = useState(false);
  const [entitlement, setEntitlement] = useState<{ orderId: string; version: string } | null>(null);

  useDepartment("brand");

  // entitlement check — does this customer already own it? (§26 update notice, §35 verified reviews)
  useEffect(() => {
    if (!tpl) return;
    track("template_view", { template: tpl.slug });
    (async () => {
      const orders = await listMyOrders(user);
      const hit = entitlementsFromOrders(orders, bundles).find((e) => e.templateSlug === tpl.slug);
      if (hit) setEntitlement({ orderId: hit.orderId, version: hit.version });
    })();
  }, [tpl, user, bundles]);

  const related = useMemo(() => {
    if (!tpl) return [];
    return templates
      .filter((x) => x.slug !== tpl.slug)
      .map((x) => ({
        x,
        score:
          (x.category === tpl.category ? 3 : 0) +
          (x.subcategory === tpl.subcategory ? 2 : 0) +
          x.tags.filter((tg) => tpl.tags.includes(tg)).length +
          (x.software === tpl.software ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((r) => r.x);
  }, [tpl, templates]);

  const campaignBundle = useMemo(
    () => bundles.find((b) => b.active !== false && tpl && b.templateSlugs.includes(tpl.slug)),
    [bundles, tpl]
  );

  const price = tpl ? effectivePrice(tpl) + (tpl.licenseFees[license] ?? 0) : 0;
  const free = tpl ? effectivePrice(tpl) === 0 : false;
  const onSale = tpl?.salePrice !== undefined && tpl.salePrice < tpl.price;
  const catName = tpl ? categories.find((c) => c.slug === tpl.category)?.name : undefined;
  const ver = tpl ? currentVersion(tpl) : undefined;
  const updateAvailable = entitlement && ver && ver.version !== entitlement.version;

  useSEO({
    title: tpl ? `${tpl.name} — Design Template | Social Kon10` : "Template — Social Kon10",
    description: tpl?.description.slice(0, 155) ?? "Design template",
    path: `/templates/${slug}`,
    jsonLd: tpl ? [
      {
        "@context": "https://schema.org", "@type": "Product",
        name: tpl.name, description: tpl.description, category: catName,
        brand: { "@type": "Brand", name: "Social Kon10 Marketing" },
        offers: {
          "@type": "Offer", price: effectivePrice(tpl), priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
      },
      breadcrumbLd([
        { name: "Templates", path: "/templates" },
        { name: catName ?? "Templates", path: "/templates" },
        { name: tpl.name, path: `/templates/${tpl.slug}` },
      ]),
    ] : undefined,
  });

  if (ready && !tpl) {
    return (
      <section className="wrap pt-24 pb-32 min-h-[60vh]">
        <span className="idx">/404</span>
        <h1 className="display-section mt-6">Template not found</h1>
        <p className="text-[var(--muted)] mt-4">It may have been unpublished or archived.</p>
        <Link to="/templates" className="btn btn-dept mt-8">Browse all templates</Link>
      </section>
    );
  }
  if (!tpl) return <div className="wrap pt-24 pb-32 min-h-[50vh]"><span className="font-meta text-[10px] text-[var(--muted)]">Loading…</span></div>;

  const buy = (withCustomization: boolean) => {
    add(templateCartItem(tpl, license, withCustomization));
    track("template_add_to_cart", { template: tpl.slug, license, customization: withCustomization });
    navigate("/checkout");
  };

  /* free templates — account required, same entitlement architecture (§34) */
  const claimFree = async () => {
    if (firebaseReady && !user) {
      toast("Create a free account to download", { description: "Free templates live in your library — sign in first." });
      navigate("/client");
      return;
    }
    setClaiming(true);
    try {
      const email = user?.email ?? "demo@local";
      const id = await createOrder({
        email, name: user?.displayName ?? email, company: "",
        items: [{ name: tpl.name, tierLabel: "Free — Personal License", unitPrice: 0, addons: [], rush: false, billing: "one_time", templateSlug: tpl.slug, license: "Personal License" }],
        subtotal: 0, discount: 0, total: 0, payMode: "full", amountPaid: 0, balanceDue: 0,
        promo: null, details: { source: "free-template", template: tpl.slug }, files: [],
      }, user);
      track("purchase", { value: 0, transaction_id: id, free: true });
      toast.success("Added to your library", { description: "Download it any time from the client portal." });
      navigate("/client");
    } catch {
      toast.error("Something went wrong — please try again.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="pb-24 md:pb-0">
      {/* breadcrumbs (§47) */}
      <div className="wrap pt-8">
        <nav className="font-meta text-[10px] text-[var(--muted)] flex gap-2" aria-label="Breadcrumb">
          <Link to="/templates" className="hover:text-[var(--dept)]">Templates</Link>
          <span aria-hidden>/</span>
          <span>{catName}</span>
          <span aria-hidden>/</span>
          <span className="text-[var(--ink)]">{tpl.name}</span>
        </nav>
      </div>

      <section className="wrap pt-8 pb-16 grid lg:grid-cols-2 gap-10">
        {/* gallery */}
        <Reveal><Gallery tpl={tpl} /></Reveal>

        {/* purchase panel */}
        <div>
          <Reveal>
            <span className="idx">/{tpl.slug}</span>
            <h1 className="display-section mt-3">{tpl.name}</h1>
            <p className="font-meta text-[10px] text-[var(--muted)] mt-3">
              {catName}{tpl.subcategory ? ` / ${tpl.subcategory}` : ""} · {tpl.software} · {tpl.fileFormat}
            </p>

            <div className="mt-5 flex items-baseline gap-3">
              <p className="font-display text-3xl font-bold">
                {free ? "Free" : money(price)}
              </p>
              {onSale && !free && <p className="text-[var(--muted)] line-through">{money(tpl.price + tpl.licenseFees[license])}</p>}
              {onSale && <span className="font-meta text-[9px] px-2 py-1 bg-red-600 text-white">SALE</span>}
            </div>
            <p className="font-meta text-[9px] text-[var(--muted)] mt-1">Instant digital download · Version {ver?.version}</p>

            {/* license picker (§16) */}
            {!free && (
              <fieldset className="mt-7">
                <legend className="font-meta text-[10px] text-[var(--muted)] mb-3">CHOOSE YOUR LICENSE</legend>
                <div className="flex flex-col gap-2">
                  {LICENSES.map((l) => (
                    <label key={l.id} className="flex items-start gap-3 border px-4 py-3 cursor-pointer transition-colors"
                      style={{ borderColor: license === l.id ? "var(--dept)" : "var(--line)", background: license === l.id ? "var(--dept-soft)" : "transparent" }}>
                      <input type="radio" name="license" className="mt-1 accent-[var(--dept)]"
                        checked={license === l.id} onChange={() => setLicense(l.id)} />
                      <span className="grow">
                        <span className="text-sm font-bold block">{l.name}</span>
                        <span className="text-[13px] text-[var(--muted)]">{l.blurb}</span>
                      </span>
                      <span className="font-meta text-[10px]">{tpl.licenseFees[l.id] ? `+${money(tpl.licenseFees[l.id])}` : "Included"}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {/* purchase options (§17) */}
            <div className="mt-7 flex flex-col gap-2.5">
              {free ? (
                <>
                  <button className="btn btn-dept justify-center" disabled={claiming} onClick={claimFree}>
                    {claiming ? "Adding to your library…" : "Download Free — Create Account"} <span className="btn-arrow" aria-hidden>→</span>
                  </button>
                  <Link to={`/editor/${tpl.slug}`} className="btn btn-ghost justify-center"
                    onClick={() => track("editor_launch", { template: tpl.slug, source: "detail_free" })}>
                    Edit online with Kon10 Editor
                  </Link>
                </>
              ) : (
                <button className="btn btn-dept justify-center" onClick={() => buy(false)}>
                  Buy Template — {money(price)} <span className="btn-arrow" aria-hidden>→</span>
                </button>
              )}
              {tpl.customizeAvailable && !free && (
                <button className="btn btn-fill justify-center" onClick={() => buy(true)}>
                  Template + Professional Customization — {money(price + tpl.customizePrice)}
                </button>
              )}
              <p className="font-meta text-[10px] text-[var(--muted)] text-center mt-1">
                Need something completely different?{" "}
                <Link to="/start" className="dept-accent underline underline-offset-2">Request Custom Design</Link>
              </p>
            </div>

            {/* entitlement / update notice (§26) */}
            {entitlement && (
              <div className="mt-6 border border-[var(--dept)] p-4" style={{ background: "var(--dept-soft)" }}>
                <p className="font-meta text-[10px] dept-accent">✓ IN YOUR LIBRARY — ORDER {entitlement.orderId.slice(0, 8).toUpperCase()}</p>
                <Link to={`/editor/${tpl.slug}`} className="btn btn-dept !py-2.5 mt-3"
                  onClick={() => track("editor_launch", { template: tpl.slug, source: "detail" })}>
                  Edit with Kon10 Editor <span className="btn-arrow" aria-hidden>→</span>
                </Link>
                {updateAvailable && (
                  <p className="text-sm mt-3">
                    <strong>New version available — {ver?.version}.</strong>{" "}
                    <Link to="/client" className="dept-accent underline underline-offset-2">Download the latest version</Link>
                  </p>
                )}
              </div>
            )}

            {/* description (§12) */}
            <p className="text-[15px] leading-relaxed mt-8 text-[var(--ink)]">{tpl.description}</p>

            {/* what's included (§13) */}
            <div className="mt-8">
              <h2 className="font-meta text-[10px] text-[var(--muted)] mb-3">WHAT'S INCLUDED</h2>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {INCLUDED_CHECKLIST.filter((c) => tpl.features.includes(c.feature)).map((c) => (
                  <li key={c.feature} className="flex gap-2"><span className="dept-accent" aria-hidden>✓</span>{c.label}</li>
                ))}
                <li className="flex gap-2"><span className="dept-accent" aria-hidden>✓</span>Editing instructions</li>
                <li className="flex gap-2"><span className="dept-accent" aria-hidden>✓</span>Professional layout</li>
              </ul>
            </div>

            {/* technical specs (§8/§14) */}
            <div className="mt-8">
              <h2 className="font-meta text-[10px] text-[var(--muted)] mb-3">TECHNICAL INFORMATION</h2>
              <dl className="grid grid-cols-2 gap-px border border-[var(--line)] text-sm" style={{ background: "var(--line)" }}>
                {[
                  ["Software", tpl.software], ["File type", tpl.fileFormat],
                  ["Dimensions", tpl.dimensions], ["Resolution", tpl.resolution],
                  ["Color mode", tpl.colorMode], ["File size", tpl.fileSize],
                  ["Editable", "Yes"], ["Layers", tpl.features.includes("Fully Layered") ? "Fully layered" : "Partially layered"],
                  ["Delivery", "Instant download"], ["Version", ver?.version ?? "1.0"],
                ].map(([k, v]) => (
                  <div key={k} className="px-4 py-2.5" style={{ background: "var(--bg)" }}>
                    <dt className="font-meta text-[9px] text-[var(--muted)]">{k}</dt>
                    <dd className="mt-0.5 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* fonts (§15) */}
            {tpl.fonts.length > 0 && (
              <div className="mt-8">
                <h2 className="font-meta text-[10px] text-[var(--muted)] mb-3">FONTS</h2>
                <ul className="text-sm flex flex-col gap-1.5">
                  {tpl.fonts.map((f) => <li key={f} className="flex gap-2"><span className="dept-accent" aria-hidden>◦</span>{f}</li>)}
                </ul>
              </div>
            )}

            {/* version history (§25) */}
            {tpl.versions.length > 0 && (
              <div className="mt-8">
                <h2 className="font-meta text-[10px] text-[var(--muted)] mb-3">VERSION HISTORY</h2>
                <ul className="text-sm flex flex-col gap-2">
                  {[...tpl.versions].reverse().map((v) => (
                    <li key={v.version} className="flex flex-wrap gap-x-3 border-b border-[var(--line)] pb-2">
                      <strong>v{v.version}</strong>
                      <span className="text-[var(--muted)]">{v.date}</span>
                      <span className="text-[var(--muted)]">{v.notes}</span>
                      {v.status === "current" && <span className="font-meta text-[9px] dept-accent">CURRENT</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-8"><ReportTemplate tpl={tpl} /></div>
          </Reveal>
        </div>
      </section>

      {/* customization CTA (§18/§19) */}
      {tpl.customizeAvailable && (
        <section className="rule-t" style={{ background: "var(--dept-soft)" }}>
          <div className="wrap py-14 grid md:grid-cols-2 gap-10 items-center">
            <Reveal>
              <span className="idx">/done-for-you</span>
              <h2 className="display-sub mt-2">Don't Want to Edit It Yourself?</h2>
              <p className="text-[var(--muted)] mt-4 leading-relaxed">
                Let our professional graphic designers customize this template for you — text, images,
                colors, logo, branding, event details and contact information.
              </p>
              <div className="flex flex-wrap gap-3 mt-6">
                <button className="btn btn-dept" onClick={() => buy(true)}>
                  Hire a Designer — {money(effectivePrice(tpl) + tpl.customizePrice)} <span className="btn-arrow" aria-hidden>→</span>
                </button>
                <a className="btn btn-ghost" target="_blank" rel="noreferrer"
                  href={waLink(`Hi! I'd like the "${tpl.name}" template customized by a designer.`)}>
                  WhatsApp a Designer
                </a>
              </div>
            </Reveal>
            <Reveal>
              <ul className="grid grid-cols-2 gap-px border border-[var(--line)]" style={{ background: "var(--line)" }}>
                {["Text & dates", "Your photos", "Logo placement", "Brand colors", "Layout tweaks", "Contact info"].map((x) => (
                  <li key={x} className="px-5 py-4 text-sm" style={{ background: "var(--bg)" }}>
                    <span className="dept-accent" aria-hidden>✓ </span>{x}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>
      )}

      {/* complete the campaign (§32) */}
      {campaignBundle && (
        <section className="rule-t">
          <div className="wrap py-14">
            <Reveal>
              <span className="idx">/upsell</span>
              <h2 className="display-sub mt-2">Complete Your Campaign</h2>
              <p className="text-sm text-[var(--muted)] mt-2 max-w-xl">
                This template is part of the <strong>{campaignBundle.name}</strong>
                {" "}— {money(bundleValue(campaignBundle, templates))} of templates for {money(campaignBundle.price)}.
              </p>
              <button className="btn btn-dept mt-6" onClick={() => {
                add(bundleCartItem(campaignBundle));
                toast.success(`${campaignBundle.name} added to cart`);
                track("template_add_to_cart", { bundle: campaignBundle.slug, source: "complete_campaign" });
                navigate("/checkout");
              }}>
                Add Bundle to Cart <span className="btn-arrow" aria-hidden>→</span>
              </button>
            </Reveal>
          </div>
        </section>
      )}

      {/* related (§31) */}
      {related.length > 0 && (
        <section className="rule-t">
          <div className="wrap py-14">
            <Reveal><span className="idx">/related</span><h2 className="display-sub mt-2 mb-8">You May Also Like</h2></Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {related.map((r) => (
                <Reveal key={r.slug}>
                  <TemplateCard tpl={r} categoryName={categories.find((c) => c.slug === r.category)?.name} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <Reviews tpl={tpl} entitlement={entitlement} />

      {/* support (§60) + final CTA (§65) */}
      <section className="rule-t">
        <div className="wrap py-16 text-center">
          <span className="idx">/ready</span>
          <h2 className="display-sub mt-2">Ready to Create Your Design?</h2>
          <p className="text-[var(--muted)] mt-3 max-w-xl mx-auto">
            Download the template and customize it yourself, or let our professional designers do it for you.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            {!free && <button className="btn btn-dept" onClick={() => buy(false)}>Buy Template</button>}
            {free && <button className="btn btn-dept" disabled={claiming} onClick={claimFree}>Download Free</button>}
            {tpl.customizeAvailable && <button className="btn btn-fill" onClick={() => buy(true)}>Hire a Designer</button>}
            <Link to="/start" className="btn btn-ghost">Request Custom Design</Link>
          </div>
          <p className="font-meta text-[10px] text-[var(--muted)] mt-10">
            Need help?{" "}
            <a className="dept-accent underline underline-offset-2" target="_blank" rel="noreferrer"
              href={waLink(`Hi! I need help with the "${tpl.name}" template.`)}>WhatsApp us</a>
            {" · "}{CONTACT.email}
          </p>
        </div>
      </section>

      {/* sticky mobile purchase bar (§49) */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[var(--line-strong)] px-4 py-3 flex items-center justify-between gap-3"
        style={{ background: "var(--bg)" }}>
        <p className="font-display font-bold">{free ? "Free" : money(price)}</p>
        {free ? (
          <button className="btn btn-dept !py-2.5 grow justify-center" disabled={claiming} onClick={claimFree}>Download Free</button>
        ) : (
          <button className="btn btn-dept !py-2.5 grow justify-center" onClick={() => buy(false)}>Buy Template</button>
        )}
      </div>
    </div>
  );
}
