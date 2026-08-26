import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { packageValue, priceLabel } from "../lib/design";
import { useDesignCatalog, useDesignPackage } from "../lib/design-shop";
import { useDepartment } from "../lib/dept";
import { useSEO, track } from "../lib/seo";
import { useAuth } from "../lib/auth";
import { attachFiles, createOrder } from "../lib/backend";
import { activeProviders } from "../lib/payments";
import { Reveal } from "../lib/motion";
import { useMoney } from "../lib/money";

/* ------------------------------------------------------------------
   CUSTOM PACKAGE BUILDER (PRD §17–§23, §26–§30, §52–§53)
   Left: predefined packages + compact catalog. Right: sticky summary
   with live pricing and auto bundle discounts. Submit as quote request
   or paid order — both reuse the existing order + upload + payment
   infrastructure, with full price snapshots (PRD §30).
------------------------------------------------------------------- */

const inputCls = "bg-transparent border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:border-[var(--dept)] transition-colors w-full";
const labelCls = "font-meta text-[9px] text-[var(--muted)] block";

interface Brief {
  name: string; business: string; email: string; phone: string; whatsapp: string;
  deadline: string; brief: string; colors: string; socials: string; notes: string;
}
const emptyBrief: Brief = { name: "", business: "", email: "", phone: "", whatsapp: "", deadline: "", brief: "", colors: "", socials: "", notes: "" };

/* playful empty-package lines — funny, on-brand, still professional */
const DODGE_LINES = [
  "Add a service first — then we'll talk.",
  "Nice try. Empty packages don't make it to checkout.",
  "I can sidestep all day. The store is right there.",
  "Still empty. Pick anything — even a business card.",
  "Okay, this is just cardio now. One service and I cooperate.",
];

/* dodge positions — wide enough for the button to truly escape the cursor */
const DODGE_SPOTS = [
  { x: -110, y: 0 }, { x: 110, y: 0 }, { x: -60, y: -12 }, { x: 60, y: -12 }, { x: 0, y: -16 }, { x: 0, y: 0 },
];

/** Gamified bundle-savings meter — nudges toward the next discount tier. */
function DiscountMeter({
  subtotal,
  itemCount,
  money,
  discounts,
}: {
  subtotal: number;
  itemCount: number;
  money: (n: number) => string;
  discounts?: { id: string; name: string; value: number; minSubtotal: number; minItems: number; active?: boolean }[];
}) {
  const activeDiscounts = (discounts && discounts.length > 0 ? discounts : [
    { id: "tier-250", name: "5% Tier", value: 5, minSubtotal: 250, minItems: 2 },
    { id: "tier-500", name: "10% Tier", value: 10, minSubtotal: 500, minItems: 2 },
    { id: "tier-1000", name: "15% Tier", value: 15, minSubtotal: 1000, minItems: 2 },
  ])
    .filter((d) => d.active !== false)
    .sort((a, b) => a.minSubtotal - b.minSubtotal);

  const next = activeDiscounts.find((t) => subtotal < t.minSubtotal);
  const target = next ? next.minSubtotal : (activeDiscounts[activeDiscounts.length - 1]?.minSubtotal ?? 1000);
  const pct = Math.min(100, Math.round((subtotal / Math.max(1, target)) * 100));
  const topTier = activeDiscounts[activeDiscounts.length - 1];

  const label = !next
    ? `Top bundle tier unlocked — ${topTier ? `${topTier.value}%` : "15%"} off. Nicely done.`
    : itemCount < (next.minItems ?? 2)
      ? `Add ${next.minItems ?? 2}+ services and bundle discounts start at ${money(next.minSubtotal)}.`
      : `You're ${money(next.minSubtotal - subtotal)} away from ${next.value}% off.`;

  return (
    <div className="mb-5" aria-label="Bundle savings progress">
      <div className="flex justify-between font-meta text-[9px] text-[var(--muted)] mb-1.5">
        <span>/bundle-savings</span>
        <span className={next ? "" : "dept-accent"}>{next ? `${next.value}% next` : "MAX TIER"}</span>
      </div>
      <div className="h-1 w-full" style={{ background: "var(--line)" }}>
        <div className="h-full dept-bg transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="font-meta text-[9px] mt-2 text-[var(--muted)]">{label}</p>
    </div>
  );
}

/** Grid-square burst when a bundle discount tier unlocks — brand confetti, not generic confetti. */
function TierBurst({ tierId }: { tierId: string | null }) {
  const [bursts, setBursts] = useState<number[]>([]);
  const prev = useRef<string | null>(tierId);
  useEffect(() => {
    if (tierId && tierId !== prev.current) {
      const id = Date.now();
      setBursts((b) => [...b, id]);
      setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 1_000);
      track("package_tier_unlock", { tier: tierId });
    }
    prev.current = tierId;
  }, [tierId]);

  const pieces = useMemo(
    () => Array.from({ length: 18 }, (_, i) => ({
      bx: (Math.random() - 0.5) * 260,
      by: -40 - Math.random() * 180,
      br: (Math.random() - 0.5) * 540,
      size: 4 + Math.random() * 6,
      delay: Math.random() * 80,
      accent: i % 3 !== 0,
    })),
    // regenerate per burst
    [bursts.length]
  );

  if (!bursts.length) return null;
  return (
    <div className="absolute left-1/2 top-2 pointer-events-none z-10" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={`${bursts[bursts.length - 1]}-${i}`}
          className="sk-burst absolute"
          style={{
            width: p.size,
            height: p.size,
            background: p.accent ? "var(--dept)" : "var(--ink)",
            ["--bx" as string]: `${p.bx}px`,
            ["--by" as string]: `${p.by}px`,
            ["--br" as string]: `${p.br}deg`,
            animationDelay: `${p.delay}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export default function CustomPackage() {
  useDepartment("brand");
  const { packages, services, categories, discounts } = useDesignCatalog();
  const pkg = useDesignPackage();
  const { user } = useAuth();
  const money = useMoney();
  const [cat, setCat] = useState("all");
  const [step, setStep] = useState<"build" | "brief" | "done">("build");
  const [brief, setBrief] = useState<Brief>(emptyBrief);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [mode, setMode] = useState<"quote" | "purchase">("quote");
  const briefRef = useRef<HTMLDivElement>(null);

  /* playful empty-package continue button state */
  const [dodge, setDodge] = useState({ x: 0, y: 0 });
  const [dodges, setDodges] = useState(0);
  const [shaking, setShaking] = useState(false);
  const dodgeBtnRef = useRef<HTMLButtonElement>(null);

  /** Sidestep to a spot whose resulting rect won't contain the cursor. */
  const dodgeAway = (clientX: number, clientY: number) => {
    const el = dodgeBtnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const safe = DODGE_SPOTS.filter((s) => {
      const dx = s.x - dodge.x, dy = s.y - dodge.y;
      const nx = r.left + dx, ny = r.top + dy;
      return !(clientX >= nx - 12 && clientX <= nx + r.width + 12 && clientY >= ny - 12 && clientY <= ny + r.height + 12);
    });
    const pool = safe.length ? safe : DODGE_SPOTS;
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (next.x === dodge.x && next.y === dodge.y) return;
    setDodge(next);
    setDodges((d) => d + 1);
    track("package_continue_dodge", { dodges: dodges + 1 });
  };

  useSEO({
    title: "Build Your Design Package — Live Pricing | Social Kon10",
    description: "Bundle graphic design services into a custom package with live pricing and automatic bundle discounts. Quote or checkout.",
    path: "/custom-package",
  });

  const visible = services.filter((s) => (cat === "all" || s.category === cat));

  const submit = async (m: "quote" | "purchase") => {
    if (!brief.name.trim() || !brief.email.trim()) { toast.error("Name and email are required."); return; }
    if (pkg.lines.length === 0) { toast.error("Add at least one service first."); return; }
    setMode(m);
    setBusy(true);
    try {
      // immutable price snapshot (PRD §30) — current catalog values are frozen into the order
      const items = pkg.lines.map((l) => ({
        name: `${l.service.name}${l.tier ? ` (${l.tier.name})` : ""}${l.sizeLabel ? ` — ${l.sizeLabel}` : ""} × ${l.qty}`,
        tierLabel: "Design package",
        unitPrice: Math.round((l.unitBase + l.optionsPerDesign) * 100) / 100,
        addons: [
          ...l.options.map((o) => ({ name: o.name, price: Math.round(o.amount * 100) / 100 })),
          ...(l.projectFees > 0 ? [{ name: "Project fees", price: Math.round(l.projectFees * 100) / 100 }] : []),
        ],
        rush: l.options.some((o) => o.id === "rush"),
        billing: "one_time",
      }));
      const id = await createOrder({
        email: brief.email.trim(),
        name: brief.name.trim(),
        company: brief.business.trim(),
        items,
        subtotal: Math.round(pkg.subtotal * 100) / 100,
        discount: Math.round((pkg.discount?.amount ?? 0) * 100) / 100,
        total: Math.round(pkg.total * 100) / 100,
        payMode: "full",
        amountPaid: 0,
        balanceDue: Math.round(pkg.total * 100) / 100,
        promo: pkg.discount ? `PACKAGE:${pkg.discount.name}` : null,
        details: {
          flow: "graphic-design-package",
          mode: m,
          deadline: brief.deadline,
          brief: brief.brief,
          colors: brief.colors,
          socials: brief.socials,
          notes: brief.notes,
          whatsapp: brief.whatsapp,
          phone: brief.phone,
        },
        files: [],
      }, user);
      if (files.length) await attachFiles(id, files);

      if (m === "purchase") {
        // reuse the existing payment provider abstraction (PRD §53)
        const provider = activeProviders()[0];
        if (provider) {
          const res = await provider.pay({ orderId: id, amountUsd: pkg.total, description: "Design package", kind: "full" });
          if (!res.ok) toast.error(res.error ?? "Payment failed — order saved as quote request.");
          else toast.success(`Payment received (${res.provider} ${res.transactionId})`);
        }
      }

      setOrderId(id);
      setStep("done");
      pkg.clear();
      track(m === "quote" ? "design_quote_submit" : "design_order_submit", { value: pkg.total });
      window.dispatchEvent(new CustomEvent("sk-order-complete"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed — please try again.");
    }
    setBusy(false);
  };

  /* ---------- success ---------- */
  if (step === "done") {
    return (
      <section className="wrap pt-24 pb-32 max-w-2xl">
        <span className="idx">/{mode === "quote" ? "quote-received" : "order-received"}</span>
        <h1 className="display-section mt-6">We've got it.</h1>
        <p className="mt-6 text-[var(--muted)] leading-relaxed">
          Reference <span className="font-display-wide font-bold text-[var(--ink)]">{orderId}</span>.
          {mode === "quote"
            ? " Our studio reviews every package quote within one business day — you'll receive pricing confirmation and next steps by email."
            : " Your project is in the queue — we'll confirm kickoff details by email within one business day."}
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link to="/graphic-design-branding/design-store" className="btn btn-ghost">Back to the store</Link>
          <Link to="/client" className="btn btn-fill">Track in client portal <span className="btn-arrow" aria-hidden>→</span></Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="wrap pt-14 md:pt-20 pb-10">
        <Reveal>
          <div className="flex flex-wrap justify-between gap-3 font-meta text-[10px] text-[var(--muted)]">
            <span className="idx">/graphic-design /custom-package</span>
            <span>{pkg.count} item{pkg.count === 1 ? "" : "s"} · {money(pkg.total)}</span>
          </div>
        </Reveal>
        <h1 className="display-hero mt-6 max-w-[12ch]">Build your package.</h1>
        <Reveal delay={200}>
          <p className="mt-6 max-w-xl text-[var(--muted)]">
            Bundle services and the package discount applies itself — 5% over $250, 10% over $500, 15% over $1,000. Quote or checkout at the end.
          </p>
        </Reveal>
      </section>

      <section className="wrap pb-32 grid lg:grid-cols-12 gap-10">
        {/* LEFT — catalog (PRD §17) */}
        <div className="lg:col-span-7">
          {/* predefined packages */}
          {packages.length > 0 && (
            <>
              <Reveal><span className="idx">/start-from-a-package</span></Reveal>
              <div className="mt-5 grid sm:grid-cols-2 gap-4">
                {packages.map((p) => {
                  const v = packageValue(p, services);
                  return (
                    <div key={p.slug} className="border border-[var(--line-strong)] p-5 flex flex-col" style={{ background: "var(--panel)" }}>
                      {p.featured && <span className="font-meta text-[8px] dept-accent mb-2">FEATURED</span>}
                      <h3 className="font-display text-lg font-bold uppercase">{p.name}</h3>
                      <p className="text-[13px] text-[var(--muted)] mt-2 flex-1">{p.blurb}</p>
                      <p className="font-meta text-[9px] text-[var(--muted)] mt-3">{p.items.map((i) => `${i.qty}× ${services.find((s) => s.slug === i.slug)?.name ?? i.slug}`).join(" · ")}</p>
                      <div className="flex items-baseline gap-3 mt-4">
                        {v.savings > 0 && <span className="font-meta text-[10px] text-[var(--muted)] line-through">{money(v.regular)}</span>}
                        <span className="font-display-wide text-2xl font-bold">{money(v.price)}</span>
                        {v.savings > 0 && <span className="font-meta text-[9px] dept-accent">SAVE {money(v.savings)}</span>}
                      </div>
                      <button className="btn btn-ghost !py-2.5 mt-4 justify-center" onClick={() => { pkg.loadPackage(p); toast.success(`${p.name} loaded — configure or continue below`); }}>
                        Load package
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* compact catalog */}
          <div className="mt-14">
            <Reveal><span className="idx">/or-add-services</span></Reveal>
            <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
              {[{ slug: "all", name: "All" }, ...categories].map((c) => (
                <button key={c.slug} onClick={() => setCat(c.slug)} aria-pressed={cat === c.slug}
                  className="font-meta text-[9px] px-2.5 py-1.5 border transition-colors"
                  style={cat === c.slug ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}>
                  {c.name.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-col">
              {visible.map((s) => (
                <div key={s.slug} className="file-row !grid-cols-[1fr_auto_auto]">
                  <span>
                    <Link to={`/design-services/${s.slug}`} className="font-display text-base md:text-lg font-bold uppercase hover:text-[var(--dept)] transition-colors">{s.name}</Link>
                    <span className="block font-meta text-[8px] text-[var(--muted)] mt-1">{priceLabel(s, money)} · {s.turnaround}</span>
                  </span>
                  <Link to={`/design-services/${s.slug}`} className="font-meta text-[9px] text-[var(--muted)] u-line hidden md:inline">CONFIGURE</Link>
                  {s.packageEligible !== false && s.price > 0 && (
                    <button className="font-meta text-[9px] px-3 py-2 border border-[var(--line-strong)] hover:bg-[var(--ink)] hover:text-[var(--bg)] transition-colors"
                      onClick={() => { pkg.add(s.slug); toast.success(`${s.name} added`); }}
                      aria-label={`Add ${s.name} to package`}>
                      Add +
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — sticky summary (PRD §17/§19) */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28 border border-[var(--line-strong)] relative" style={{ background: "var(--panel)" }}>
            <TierBurst tierId={pkg.discount?.name ?? null} />
            <div className="p-6 border-b border-[var(--line-strong)]">
              <span className="idx">/your-custom-package</span>
            </div>
            <div className="p-6 max-h-[40vh] overflow-y-auto">
              {pkg.lines.length === 0 && (
                <p className="font-meta text-[10px] text-[var(--muted)]">
                  Empty — add services below, load a package above, or{" "}
                  <Link to="/graphic-design-branding/design-store" className="dept-accent u-line">browse the full store →</Link>
                </p>
              )}
              {pkg.lines.map((l) => (
                <div key={l.key} className="py-3 border-b border-[var(--line)] last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-display text-sm font-bold uppercase">{l.service.name}</span>
                      {l.tier && <span className="block font-meta text-[8px] dept-accent mt-0.5">{l.tier.name} package</span>}
                      {l.sizeLabel && <span className="block font-meta text-[8px] text-[var(--muted)] mt-0.5">{l.sizeLabel}</span>}
                      {l.options.length > 0 && <span className="block font-meta text-[8px] text-[var(--muted)]">{l.options.map((o) => o.name).join(" · ")}</span>}
                    </div>
                    <span className="font-display-wide font-bold shrink-0">{l.isQuote ? "Quote" : money(l.lineTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="inline-flex items-center border border-[var(--line)]">
                      <button className="px-2.5 py-1 disabled:opacity-30" onClick={() => pkg.setQty(l.key, l.qty - 1)} disabled={l.qty <= l.service.minQty} aria-label="Decrease quantity">−</button>
                      <span className="px-2 font-meta text-[10px]">{l.qty}</span>
                      <button className="px-2.5 py-1 disabled:opacity-30" onClick={() => pkg.setQty(l.key, l.qty + 1)} disabled={l.qty >= l.service.maxQty} aria-label="Increase quantity">+</button>
                    </span>
                    <button className="font-meta text-[9px] text-[var(--muted)] hover:text-red-600 transition-colors" onClick={() => pkg.remove(l.key)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-[var(--line-strong)]">
              <DiscountMeter subtotal={pkg.subtotal} itemCount={pkg.count} money={money} discounts={discounts} />
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-[var(--muted)]">Subtotal</dt><dd>{money(pkg.subtotal)}</dd></div>
                {pkg.discount && (
                  <div className="flex justify-between dept-accent"><dt>Package discount — {pkg.discount.name}</dt><dd>−{money(pkg.discount.amount)}</dd></div>
                )}
                <div className="flex justify-between items-baseline border-t border-[var(--line)] pt-3 mt-1">
                  <dt className="font-meta text-[10px]">TOTAL</dt>
                  <dd className="font-display-wide text-3xl font-bold">{pkg.hasQuoteOnly && pkg.subtotal === 0 ? "Quote" : money(pkg.total)}</dd>
                </div>
              </dl>
              {/* Continue — sidesteps the cursor while the package is empty */}
              <div
                className="relative mt-6"
                onPointerMove={(e) => {
                  if (pkg.lines.length > 0) return;
                  const el = dodgeBtnRef.current;
                  if (!el) return;
                  const r = el.getBoundingClientRect();
                  // proximity trigger — dodge before the cursor lands
                  if (e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6) {
                    dodgeAway(e.clientX, e.clientY);
                  }
                }}
              >
                {pkg.lines.length === 0 && dodges > 0 && (
                  <div
                    key={dodges}
                    className="sk-pop absolute bottom-full left-1/2 mb-3 w-max max-w-[230px] border border-[var(--line-strong)] px-3.5 py-2.5 font-meta text-[10px] leading-relaxed z-10 pointer-events-none"
                    style={{ background: "var(--bg)", transform: "translateX(-50%)" }}
                    role="status"
                  >
                    {DODGE_LINES[Math.min(dodges - 1, DODGE_LINES.length - 1)]}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-[7px] border-transparent" style={{ borderTopColor: "var(--line-strong)" }} aria-hidden />
                  </div>
                )}
                <button
                  ref={dodgeBtnRef}
                  className={`btn btn-dept justify-center transition-transform duration-200 ease-out ${pkg.lines.length === 0 ? "flex w-[62%] mx-auto opacity-60" : "w-full disabled:opacity-40"} ${shaking ? "sk-shake" : ""}`}
                  style={pkg.lines.length === 0 ? { transform: `translate(${dodge.x}px, ${dodge.y}px)` } : undefined}
                  aria-disabled={pkg.lines.length === 0}
                  onPointerEnter={(e) => { if (pkg.lines.length === 0) dodgeAway(e.clientX, e.clientY); }}
                  onClick={() => {
                    if (pkg.lines.length > 0) {
                      setStep("brief");
                      setTimeout(() => briefRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
                      return;
                    }
                    setDodges((d) => Math.max(d, 1));
                    setDodge({ x: 0, y: 0 });
                    setShaking(true);
                    setTimeout(() => setShaking(false), 400);
                    toast.error("Your package is empty — add a service first.");
                  }}
                >
                  Continue to Brief <span className="btn-arrow" aria-hidden>→</span>
                </button>
                {pkg.lines.length > 0 && (
                  <Link to="/checkout" className="btn btn-ghost w-full justify-center mt-2.5 font-meta text-[10px]">
                    Proceed to Unified Checkout →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STEP — project brief (PRD §26/§27) */}
      {step === "brief" && (
        <section ref={briefRef} className="rule-t" style={{ background: "var(--panel)" }} aria-label="Project brief">
          <div className="wrap py-16 max-w-3xl">
            <span className="idx">/project-brief</span>
            <h2 className="display-sub mt-4">Tell us about the project.</h2>
            <div className="grid sm:grid-cols-2 gap-4 mt-8">
              <label className={labelCls}>NAME *<input className={`${inputCls} mt-1.5`} value={brief.name} onChange={(e) => setBrief({ ...brief, name: e.target.value })} /></label>
              <label className={labelCls}>BUSINESS NAME<input className={`${inputCls} mt-1.5`} value={brief.business} onChange={(e) => setBrief({ ...brief, business: e.target.value })} /></label>
              <label className={labelCls}>EMAIL *<input type="email" className={`${inputCls} mt-1.5`} value={brief.email} onChange={(e) => setBrief({ ...brief, email: e.target.value })} /></label>
              <label className={labelCls}>PHONE<input className={`${inputCls} mt-1.5`} value={brief.phone} onChange={(e) => setBrief({ ...brief, phone: e.target.value })} /></label>
              <label className={labelCls}>WHATSAPP<input className={`${inputCls} mt-1.5`} value={brief.whatsapp} onChange={(e) => setBrief({ ...brief, whatsapp: e.target.value })} /></label>
              <label className={labelCls}>PREFERRED DEADLINE<input type="date" className={`${inputCls} mt-1.5`} value={brief.deadline} onChange={(e) => setBrief({ ...brief, deadline: e.target.value })} /></label>
              <label className={`${labelCls} sm:col-span-2`}>DESIGN BRIEF — what are we making, for whom, and what must it say?
                <textarea rows={4} className={`${inputCls} mt-1.5`} value={brief.brief} onChange={(e) => setBrief({ ...brief, brief: e.target.value })} /></label>
              <label className={labelCls}>BRAND COLOURS<input className={`${inputCls} mt-1.5`} placeholder="e.g. navy + gold" value={brief.colors} onChange={(e) => setBrief({ ...brief, colors: e.target.value })} /></label>
              <label className={labelCls}>SOCIAL MEDIA LINKS<input className={`${inputCls} mt-1.5`} value={brief.socials} onChange={(e) => setBrief({ ...brief, socials: e.target.value })} /></label>
              <label className={`${labelCls} sm:col-span-2`}>ADDITIONAL NOTES<textarea rows={2} className={`${inputCls} mt-1.5`} value={brief.notes} onChange={(e) => setBrief({ ...brief, notes: e.target.value })} /></label>
              <div className="sm:col-span-2">
                <span className={labelCls}>LOGO, REFERENCES &amp; FILES (max 8MB each)</span>
                <input type="file" multiple className="mt-1.5 text-sm" aria-label="Upload project files"
                  onChange={(e) => {
                    const fs = [...(e.target.files ?? [])].filter((f) => f.size <= 8 * 1024 * 1024);
                    if (fs.length !== (e.target.files?.length ?? 0)) toast.error("Some files were over 8MB and were skipped.");
                    setFiles(fs);
                  }} />
                {files.length > 0 && <p className="font-meta text-[9px] text-[var(--muted)] mt-2">{files.map((f) => f.name).join(" · ")}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-4 mt-8">
              <button className="btn btn-ghost disabled:opacity-40" disabled={busy} onClick={() => submit("quote")}>
                {busy && mode === "quote" ? "Sending…" : "Get a quote"}
              </button>
              {!pkg.hasQuoteOnly && (
                <button className="btn btn-dept disabled:opacity-40" disabled={busy} onClick={() => submit("purchase")}>
                  {busy && mode === "purchase" ? "Processing…" : <>Checkout — {money(pkg.total)} <span className="btn-arrow" aria-hidden>→</span></>}
                </button>
              )}
            </div>
            <p className="font-meta text-[8px] text-[var(--muted)] mt-4">
              Prices are validated server-side at submission and frozen into your order — later catalog changes never affect it.
            </p>
          </div>
        </section>
      )}

      {/* mobile sticky bar */}
      {pkg.count > 0 && step === "build" && (
        <button
          onClick={() => { setStep("brief"); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }}
          className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-between px-5 py-4 border-t border-[var(--line-strong)] lg:hidden"
          style={{ background: "var(--ink)", color: "var(--bg)" }}
        >
          <span className="font-meta text-[10px]">{pkg.count} item{pkg.count === 1 ? "" : "s"} · {money(pkg.total)}</span>
          <span className="font-meta text-[10px] dept-accent">CONTINUE →</span>
        </button>
      )}
    </>
  );
}
