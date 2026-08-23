import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CONTACT, formatMoney, waLink } from "../lib/data";
import { useDepartment } from "../lib/dept";
import { useSEO, track } from "../lib/seo";
import { Reveal } from "../lib/motion";
import { useAuth } from "../lib/auth";
import { claimOrders, listMyOrders, recordPayment, ORDER_STATUSES, type OrderRecord } from "../lib/backend";
import { activeProviders } from "../lib/payments";
import { firebaseReady } from "../lib/firebase";
import { MessageThread } from "../components/messages";
import {
  currentVersion, downloadTemplate, entitlementsFromOrders, useTemplateFavorites, useTemplates,
  type Entitlement, type Template,
} from "../lib/templates";
import { deleteDesign, listDesigns, type CustomerDesign } from "../lib/editor-store";
import { TemplateCard, TemplatePreview } from "../components/Watermark";

/* ------------------------------------------------------------------
   CLIENT PORTAL (PRD §32)
   Dashboard: project status pipeline, payment, files, next step.
   Clients see only their own orders (enforced by Firestore rules).
------------------------------------------------------------------- */

const inputCls = "w-full bg-transparent border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--dept)] transition-colors";
const labelCls = "font-meta text-[10px] text-[var(--muted)] block mb-1.5";

function SignIn() {
  const { signIn, signUp, signInGoogle, resetPassword } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const forgot = async () => {
    if (!/.+@.+\..+/.test(email)) { setError("Enter your email above first."); return; }
    setBusy(true); setError(null);
    const err = await resetPassword(email);
    setBusy(false);
    if (err) setError(err);
    else setNotice(`Reset link sent to ${email} — check your inbox.`);
  };

  const go = async (fn: (e: string, p: string) => Promise<string | null>) => {
    setBusy(true); setError(null);
    const err = await fn(email, pass);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="max-w-md mx-auto border border-[var(--line-strong)] p-8" style={{ background: "var(--panel)" }}>
      <span className="idx">/client-portal</span>
      <h2 className="display-sub mt-3">{mode === "in" ? "Sign in" : "Create account"}</h2>
      <p className="text-sm text-[var(--muted)] mt-2">Your projects, files, payments and messages — in one place.</p>
      <div className="mt-6 flex flex-col gap-4">
        <div><label className={labelCls} htmlFor="p-email">Email</label><input id="p-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className={labelCls} htmlFor="p-pass">Password</label><input id="p-pass" type="password" className={inputCls} value={pass} onChange={(e) => setPass(e.target.value)} /></div>
        {error && <p className="font-meta text-[10px] text-red-600" role="alert">{error}</p>}
        {notice && <p className="font-meta text-[10px] dept-accent" role="status">{notice}</p>}
        <button className="btn btn-dept justify-center" disabled={busy} onClick={() => go(mode === "in" ? signIn : signUp)}>
          {busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"} <span className="btn-arrow" aria-hidden>→</span>
        </button>
        <button className="btn btn-ghost justify-center" disabled={busy} onClick={async () => { setBusy(true); setError(await signInGoogle()); setBusy(false); }}>
          Continue with Google
        </button>
        <div className="flex justify-between">
          <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
          {mode === "in" && (
            <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors" disabled={busy} onClick={forgot}>
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPipeline({ status }: { status: OrderRecord["status"] }) {
  const idx = ORDER_STATUSES.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-1.5 font-meta text-[8.5px]" aria-label={`Project status: ${status}`}>
      {ORDER_STATUSES.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span style={{ color: i < idx ? "var(--muted)" : i === idx ? "var(--dept)" : "var(--muted)", opacity: i > idx ? 0.45 : 1, fontWeight: i === idx ? 700 : 400 }}>
            {s}
          </span>
          {i < ORDER_STATUSES.length - 1 && <span style={{ opacity: 0.3 }} aria-hidden>→</span>}
        </li>
      ))}
    </ol>
  );
}

function PayBalance({ order, onPaid }: { order: OrderRecord; onPaid: () => void }) {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = activeProviders()[0];
  if (!provider || order.balanceDue <= 0) return null;

  const label = order.amountPaid === 0
    ? `Pay deposit — ${formatMoney(Math.round(order.total * 0.5))}`
    : `Pay balance — ${formatMoney(order.balanceDue)}`;

  const pay = async () => {
    setPaying(true); setError(null);
    const amount = order.amountPaid === 0 ? Math.round(order.total * 0.5) : order.balanceDue;
    track("payment_start", { value: amount, mode: "balance", order: order.id });
    const res = await provider.pay({ orderId: order.id, amountUsd: amount, description: `Social Kon10 order ${order.id}`, kind: order.amountPaid === 0 ? "deposit" : "balance" });
    if (!res.ok) {
      setPaying(false);
      setError(res.error ?? "Payment failed — no charge was made. Try again.");
      track("payment_failed", {});
      return;
    }
    try {
      await recordPayment(order.id, amount);
    } catch {
      // live mode: payment recording happens via the provider webhook —
      // the client write is denied by Firestore rules by design.
    }
    track("purchase", { value: amount, transaction_id: res.transactionId });
    setPaying(false);
    onPaid();
  };

  return (
    <div className="mt-3">
      {order.amountPaid === 0 && <p className="font-meta text-[9px] dept-accent mb-2">PROPOSAL READY — ACCEPT BY PAYING THE DEPOSIT</p>}
      <button className="btn btn-dept !py-2.5" onClick={pay} disabled={paying}>
        {paying ? "Processing…" : label} <span className="btn-arrow" aria-hidden>→</span>
      </button>
      {error && <p className="font-meta text-[10px] text-red-600 mt-2" role="alert">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------
   MY TEMPLATE LIBRARY (Templates PRD §21–§29, §56–§58)
   Permanent digital library generated from purchase entitlements —
   never from product-name matching.
------------------------------------------------------------------- */

function ReceiptModal({ order, onClose }: { order: OrderRecord; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={`Receipt for order ${order.id}`}
      style={{ background: "rgb(0 0 0 / 0.7)" }} onClick={onClose}>
      {/* print: only the receipt is visible */}
      <style>{`@media print { body * { visibility: hidden !important; } .sk-receipt, .sk-receipt * { visibility: visible !important; } .sk-receipt { position: absolute !important; inset: 0 !important; width: 100% !important; background: #fff !important; color: #000 !important; } .sk-no-print { display: none !important; } }`}</style>
      <div className="sk-receipt w-full max-w-lg border border-[var(--line-strong)] p-8 max-h-[85vh] overflow-auto"
        style={{ background: "var(--bg)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <p className="font-display font-bold text-lg">SOCIAL KON10 MARKETING</p>
            <p className="font-meta text-[9px] text-[var(--muted)] mt-1">{CONTACT.email} · {CONTACT.phone} · {CONTACT.location}</p>
          </div>
          <span className="font-meta text-[10px]">RECEIPT</span>
        </div>
        <div className="rule-t mt-6 pt-4 grid grid-cols-2 gap-4 text-sm">
          <div><span className="font-meta text-[9px] text-[var(--muted)] block">Order</span><strong>#{order.id.slice(0, 8).toUpperCase()}</strong></div>
          <div><span className="font-meta text-[9px] text-[var(--muted)] block">Date</span>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "—"}</div>
          <div><span className="font-meta text-[9px] text-[var(--muted)] block">Customer</span>{order.name}</div>
          <div><span className="font-meta text-[9px] text-[var(--muted)] block">Email</span>{order.email}</div>
        </div>
        <table className="w-full text-sm mt-6">
          <thead>
            <tr className="font-meta text-[9px] text-[var(--muted)] text-left">
              <th className="pb-2 font-normal">Item</th><th className="pb-2 font-normal">License</th><th className="pb-2 font-normal text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i, idx) => (
              <tr key={idx} className="border-t border-[var(--line)]">
                <td className="py-2 pr-3">{i.name}{i.addons.map((a) => <span key={a.name} className="block text-[12px] text-[var(--muted)]">+ {a.name}</span>)}</td>
                <td className="py-2 pr-3 text-[12px] text-[var(--muted)]">{i.license ?? i.tierLabel ?? "—"}</td>
                <td className="py-2 text-right">{formatMoney(i.unitPrice + i.addons.reduce((s, a) => s + a.price, 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rule-t mt-4 pt-4 text-sm flex flex-col gap-1">
          <p className="flex justify-between"><span className="text-[var(--muted)]">Subtotal</span>{formatMoney(order.subtotal)}</p>
          {order.discount > 0 && <p className="flex justify-between"><span className="text-[var(--muted)]">Discount{order.promo ? ` (${order.promo})` : ""}</span>−{formatMoney(order.discount)}</p>}
          <p className="flex justify-between font-bold text-base"><span>Total</span>{formatMoney(order.total)}</p>
          <p className="font-meta text-[10px] mt-2" style={{ color: order.balanceDue <= 0 ? "var(--dept)" : "var(--muted)" }}>
            {order.balanceDue <= 0 ? "PAID IN FULL" : `PAID ${formatMoney(order.amountPaid)} — BALANCE ${formatMoney(order.balanceDue)}`}
          </p>
        </div>
        <div className="sk-no-print flex gap-2 mt-8">
          <button className="btn btn-dept !py-2.5 grow justify-center" onClick={() => window.print()}>Print / Save PDF</button>
          <button className="btn btn-ghost !py-2.5" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function LibraryCard({ ent, tpl, orders }: { ent: Entitlement; tpl: Template | undefined; orders: OrderRecord[] }) {
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "preparing" | "failed">("idle");
  const [receipt, setReceipt] = useState(false);
  const order = orders.find((o) => o.id === ent.orderId);
  const ver = tpl ? currentVersion(tpl) : undefined;
  const updateAvailable = ver && ver.version !== ent.version;

  const download = async () => {
    if (!tpl) return;
    setState("preparing");
    const res = await downloadTemplate(tpl, ent.orderId, user?.email ?? order?.email ?? "customer");
    setState(res.ok ? "idle" : "failed");
  };

  return (
    <article className="border border-[var(--line-strong)] grid sm:grid-cols-[140px_1fr]" style={{ background: "var(--panel)" }}>
      <div className="relative aspect-[4/5] sm:aspect-auto">
        {tpl ? (
          <TemplatePreview tpl={tpl} className="absolute inset-0" noWatermark />
        ) : (
          <div className="absolute inset-0 grid place-items-center" style={{ background: "var(--dept-soft)" }}>
            <span className="font-meta text-[9px] text-[var(--muted)] px-3 text-center">TEMPLATE RETIRED</span>
          </div>
        )}
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold uppercase leading-tight">{tpl?.name ?? ent.name}</h3>
            <p className="font-meta text-[9px] text-[var(--muted)] mt-1">
              Purchased {ent.purchasedAt ? new Date(ent.purchasedAt).toLocaleDateString() : "—"} · Order #{ent.orderId.slice(0, 8).toUpperCase()}
            </p>
          </div>
          {updateAvailable && <span className="font-meta text-[8.5px] px-2 py-1 dept-bg" style={{ color: "var(--on-dept)" }}>NEW VERSION {ver?.version}</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 text-[13px]">
          <p><span className="text-[var(--muted)]">License:</span> {ent.license}</p>
          <p><span className="text-[var(--muted)]">Version:</span> {ver?.version ?? ent.version}</p>
        </div>
        {tpl?.status === "archived" && (
          <p className="font-meta text-[9px] text-[var(--muted)] mt-2">This template was retired from the store — your purchase and downloads are unaffected.</p>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          {tpl && (
            <button className="btn btn-dept !py-2 !px-3.5" disabled={state === "preparing"} onClick={download}>
              {state === "preparing" ? "Preparing your download…" : updateAvailable ? "Download Latest Version" : "Download"}
            </button>
          )}
          {state === "failed" && (
            <button className="btn btn-ghost !py-2 !px-3.5" onClick={download}>Download failed — Try Again</button>
          )}
          {order && <button className="btn btn-ghost !py-2 !px-3.5" onClick={() => setReceipt(true)}>View Receipt</button>}
          {tpl && <Link to={`/editor/${tpl.slug}`} className="btn btn-fill !py-2 !px-3.5">Edit with Kon10</Link>}
          {tpl && <Link to={`/templates/${tpl.slug}`} className="btn btn-ghost !py-2 !px-3.5">{ent.customized ? "View Template" : "Customize Template"}</Link>}
          {tpl && (
            <a className="btn btn-ghost !py-2 !px-3.5" target="_blank" rel="noreferrer"
              href={waLink(`Hi! I need help with my "${tpl.name}" purchase (order ${ent.orderId.slice(0, 8).toUpperCase()}).`)}>
              Need help?
            </a>
          )}
        </div>
      </div>
      {receipt && order && <ReceiptModal order={order} onClose={() => setReceipt(false)} />}
    </article>
  );
}

function TemplateLibrary({ orders }: { orders: OrderRecord[] }) {
  const { templates, bundles } = useTemplates();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "updated">("all");
  const ents = entitlementsFromOrders(orders, bundles);

  const rows = ents
    .map((e) => ({ e, tpl: templates.find((t) => t.slug === e.templateSlug) }))
    .filter(({ e, tpl }) => {
      if (filter === "updated") {
        const ver = tpl ? currentVersion(tpl) : undefined;
        if (!ver || ver.version === e.version) return false;
      }
      if (!q.trim()) return true;
      const hay = `${e.name} ${tpl?.name ?? ""} ${tpl?.category ?? ""} ${e.orderId}`.toLowerCase();
      return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
    });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <label className="grow max-w-sm">
          <span className="sr-only">Search your library</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, category or order #…"
            className="w-full bg-transparent border border-[var(--line)] px-4 py-2.5 text-sm outline-none focus:border-[var(--dept)] transition-colors" />
        </label>
        <div className="flex gap-2" role="group" aria-label="Library filters">
          {([["all", "All"], ["updated", "Updated"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className="font-meta text-[10px] px-3 py-2 border transition-colors"
              style={filter === v ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {ents.length === 0 ? (
        <div className="border border-[var(--line)] p-10 text-center" style={{ background: "var(--panel)" }}>
          <p className="font-display text-xl font-bold uppercase">Your template library is empty</p>
          <p className="text-sm text-[var(--muted)] mt-2">Explore our professionally designed templates — purchased files land here, forever.</p>
          <Link to="/templates" className="btn btn-fill mt-6">Browse Templates</Link>
        </div>
      ) : rows.length === 0 ? (
        <p className="font-meta text-[11px] text-[var(--muted)]">Nothing matches that search.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {rows.map(({ e, tpl }, i) => <Reveal key={`${e.orderId}-${e.templateSlug}-${i}`}><LibraryCard ent={e} tpl={tpl} orders={orders} /></Reveal>)}
        </div>
      )}
    </div>
  );
}

function FavoritesTab() {
  const { favs } = useTemplateFavorites();
  const { templates, categories } = useTemplates();
  const favTemplates = favs.map((s) => templates.find((t) => t.slug === s)).filter(Boolean) as Template[];

  if (favTemplates.length === 0) {
    return (
      <div className="border border-[var(--line)] p-10 text-center" style={{ background: "var(--panel)" }}>
        <p className="font-display text-xl font-bold uppercase">No favorites yet</p>
        <p className="text-sm text-[var(--muted)] mt-2">Save templates you love and find them here later — tap the heart on any template.</p>
        <Link to="/templates" className="btn btn-fill mt-6">Browse Templates</Link>
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {favTemplates.map((t) => (
        <TemplateCard key={t.slug} tpl={t} categoryName={categories.find((c) => c.slug === t.category)?.name} />
      ))}
    </div>
  );
}

/* ---------------- MY DESIGNS (Kon10 Editor PRD §40) ---------------- */

function MyDesigns() {
  const { user } = useAuth();
  const { templates } = useTemplates();
  const [designs, setDesigns] = useState<CustomerDesign[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setDesigns(await listDesigns(user?.email ?? "demo@local"));
    setLoading(false);
  };
  useEffect(() => { void reload(); }, [user]);

  if (loading) return <p className="font-meta text-[11px] text-[var(--muted)]">Loading your designs…</p>;

  if (designs.length === 0) {
    return (
      <div className="border border-[var(--line)] p-10 text-center" style={{ background: "var(--panel)" }}>
        <p className="font-display text-xl font-bold uppercase">No designs yet</p>
        <p className="text-sm text-[var(--muted)] mt-2">Open any template you own — or a free one — in Kon10 Editor and your work saves here automatically.</p>
        <Link to="/templates" className="btn btn-fill mt-6">Browse Templates</Link>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {designs.map((d) => {
        const tpl = templates.find((t) => t.slug === d.templateSlug);
        return (
          <article key={d.id} className="border border-[var(--line-strong)] flex flex-col" style={{ background: "var(--panel)" }}>
            <div className="aspect-[4/5] relative" style={{ background: "var(--dept-soft)" }}>
              {d.thumbnail ? (
                <img src={d.thumbnail} alt={`${d.title} thumbnail`} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
              ) : tpl ? (
                <TemplatePreview tpl={tpl} className="absolute inset-0" noWatermark />
              ) : null}
            </div>
            <div className="p-4 flex flex-col gap-1 grow">
              <h3 className="font-display text-sm font-bold uppercase leading-tight">{d.title}</h3>
              <p className="font-meta text-[9px] text-[var(--muted)]">
                {tpl?.name ?? d.templateSlug} · edited {d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : "—"}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Link to={`/editor/${d.templateSlug}`} className="btn btn-dept !py-1.5 !px-3">Edit</Link>
                {tpl && <Link to={`/templates/${tpl.slug}`} className="btn btn-ghost !py-1.5 !px-3">Template</Link>}
                <button className="btn btn-ghost !py-1.5 !px-3 !text-red-600" onClick={async () => {
                  if (!confirm(`Delete "${d.title}"? This can't be undone.`)) return;
                  await deleteDesign(d.id);
                  reload();
                }}>Delete</button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Dashboard() {
  const { user, signOut, isAdmin } = useAuth();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"Projects" | "My Templates" | "My Designs" | "Favorites">("Projects");

  useEffect(() => {
    if (firebaseReady && !user) return;
    (async () => {
      if (user) await claimOrders(user);
      setOrders(await listMyOrders(user));
      setLoading(false);
    })();
  }, [user]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
        <div>
          <span className="idx">/dashboard</span>
          <p className="font-meta text-[10px] text-[var(--muted)] mt-1">{user?.email}</p>
        </div>
        <div className="flex gap-3">
          {isAdmin && <Link to="/admin" className="btn btn-dept !py-2.5">Admin</Link>}
          {user && <button className="btn btn-ghost !py-2.5" onClick={signOut}>Sign out</button>}
        </div>
      </div>

      {/* account navigation (Templates PRD §55) */}
      <div className="flex flex-wrap gap-2 mb-10" role="tablist" aria-label="Account sections">
        {(["Projects", "My Templates", "My Designs", "Favorites"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className="font-meta text-[10px] px-4 py-2 border transition-colors"
            style={tab === t ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "My Templates" && (loading ? (
        <p className="font-meta text-[11px] text-[var(--muted)]">Loading your library…</p>
      ) : (
        <TemplateLibrary orders={orders} />
      ))}

      {tab === "Favorites" && <FavoritesTab />}

      {tab === "My Designs" && <MyDesigns />}

      {tab === "Projects" && (loading ? (
        <p className="font-meta text-[11px] text-[var(--muted)]">Loading your projects…</p>
      ) : orders.length === 0 ? (
        <div className="border border-[var(--line)] p-10 text-center" style={{ background: "var(--panel)" }}>
          <p className="font-display text-xl font-bold uppercase">No projects yet</p>
          <p className="text-sm text-[var(--muted)] mt-2">When you purchase a package, it appears here with live status, files and next steps.</p>
          <div className="mt-6 flex justify-center gap-4">
            <Link to="/packages" className="btn btn-fill">Browse packages</Link>
            <Link to="/start" className="btn btn-ghost">Start a project</Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {orders.map((o) => (
            <Reveal key={o.id}>
              <article className="border border-[var(--line-strong)]" style={{ background: "var(--panel)" }}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 rule-b">
                  <div>
                    <span className="idx">/order-{o.id.slice(0, 8).toUpperCase()}</span>
                    <h3 className="font-display text-lg font-bold uppercase mt-1">{o.items.map((i) => i.name).join(" · ")}</h3>
                  </div>
                  <span className="font-meta text-[9px] text-[var(--muted)]">{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : ""}</span>
                </div>
                <div className="px-6 py-5">
                  <StatusPipeline status={o.status} />
                  <div className="grid sm:grid-cols-3 gap-6 mt-6 text-sm">
                    <div>
                      <span className="font-meta text-[9px] text-[var(--muted)] block mb-1.5">Payment</span>
                      <p>Paid: <strong>{formatMoney(o.amountPaid)}</strong></p>
                      {o.balanceDue > 0 && <p className="text-[var(--muted)]">Balance on approval: {formatMoney(o.balanceDue)}</p>}
                      {o.balanceDue === 0 && <p className="dept-accent font-meta text-[10px] mt-1">PAID IN FULL</p>}
                      <PayBalance order={o} onPaid={() => listMyOrders(user).then(setOrders)} />
                    </div>
                    <div>
                      <span className="font-meta text-[9px] text-[var(--muted)] block mb-1.5">Files ({o.files.length})</span>
                      {o.files.length === 0 ? <p className="text-[var(--muted)]">None uploaded yet</p> : (
                        <ul className="flex flex-col gap-1">
                          {o.files.map((f, i) => <li key={i} className="text-[13px] truncate">{f.name}</li>)}
                        </ul>
                      )}
                    </div>
                    <div>
                      <span className="font-meta text-[9px] text-[var(--muted)] block mb-1.5">Next step</span>
                      <p className="text-[13px]">
                        {o.status === "ORDER RECEIVED" && "Complete your project questionnaire — we're scheduling kickoff."}
                        {o.status === "DISCOVERY" && "We're researching your market and preparing direction."}
                        {o.status === "CONCEPT" && "First concepts are in production."}
                        {o.status === "CLIENT REVIEW" && "Your review is needed — check your email for the review link."}
                        {o.status === "REVISION" && "Revisions are being applied."}
                        {o.status === "FINAL APPROVAL" && "Approve the final files to release delivery."}
                        {o.status === "DELIVERED" && "Your final files are ready in your delivery folder."}
                        {o.status === "COMPLETED" && "Project complete — thank you. Ready for the next one?"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-6">
                    <span className="font-meta text-[9px] text-[var(--muted)] block mb-1.5">Messages</span>
                    <MessageThread orderId={o.id} from="client" author={user?.email ?? o.email} />
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      ))}

      <p className="font-meta text-[10px] text-[var(--muted)] mt-10">
        Need help? {CONTACT.phone} · {CONTACT.email} — reference your order number.
      </p>
    </div>
  );
}

export default function ClientPortal() {
  useDepartment(null);
  const { user, loading } = useAuth();
  useSEO({ title: "Client Portal — Social Kon10 Marketing", description: "Track your project status, payments, files and next steps.", path: "/client" });

  return (
    <section className="wrap pt-14 md:pt-20 pb-24 min-h-[70vh]">
      <Reveal>
        <div className="flex justify-between font-meta text-[10px] text-[var(--muted)]">
          <span className="idx">/client</span>
          <span>{firebaseReady ? "Secure sign-in" : "Demo mode"}</span>
        </div>
      </Reveal>
      <h1 className="display-section mt-6 mb-12">Client portal</h1>

      {!firebaseReady && (
        <div className="mb-10 border border-[var(--line)] p-6 max-w-2xl" style={{ background: "var(--dept-soft)" }}>
          <p className="font-meta text-[10px]">
            Firebase isn't connected yet — copy <code>.env.example</code> to <code>.env.local</code> and add your project keys
            to enable accounts, live orders and file storage. Demo orders placed in this browser appear below.
          </p>
        </div>
      )}

      {firebaseReady && loading ? (
        <p className="font-meta text-[11px] text-[var(--muted)]">Loading…</p>
      ) : firebaseReady && !user ? (
        <SignIn />
      ) : (
        <Dashboard />
      )}
    </section>
  );
}
