import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CONTACT, formatMoney, waLink } from "../lib/data";
import { useDepartment } from "../lib/dept";
import { useSEO, track } from "../lib/seo";
import { Reveal } from "../lib/motion";
import { useAuth } from "../lib/auth";
import {
  claimOrders,
  listMyOrders,
  recordPayment,
  setOrderStatus,
  getFileUrl,
  attachFiles,
  postMessage,
  ORDER_STATUSES,
  type OrderRecord,
  type OrderStatus,
} from "../lib/backend";
import { activeProviders } from "../lib/payments";
import { firebaseReady } from "../lib/firebase";
import { MessageThread } from "../components/messages";
import {
  listUserMeetings,
  updateParticipant,
  createMeeting,
  recordCallHistory,
  downloadCalendarIcs,
  isMeetingJoinable,
  type MeetingRecord,
} from "../lib/meetings";
import {
  currentVersion, downloadTemplate, entitlementsFromOrders, useTemplateFavorites, useTemplates,
  type Entitlement, type Template,
} from "../lib/templates";
import { deleteDesign, listDesigns, type CustomerDesign } from "../lib/editor-store";
import { TemplateCard, TemplatePreview } from "../components/Watermark";
import { PasswordEyeToggle } from "../components/PasswordEyeToggle";

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
  const [showPass, setShowPass] = useState(false);
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
        <div>
          <label className={labelCls} htmlFor="p-pass">Password</label>
          <div className="relative flex items-center">
            <input
              id="p-pass"
              type={showPass ? "text" : "password"}
              className={`${inputCls} pr-12`}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <PasswordEyeToggle
                show={showPass}
                onToggle={() => setShowPass((v) => !v)}
              />
            </div>
          </div>
        </div>
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
      toast.success("Payment recorded successfully!");
    } catch {
      // live mode: payment recording confirmed by provider
      toast.success("Payment received! Updating project record…");
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
    setDesigns(await listDesigns(user?.email ?? "demo@local", user?.uid ?? null));
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
            <div className="aspect-[4/5] relative overflow-hidden" style={{ background: "var(--dept-soft)" }}>
              {d.thumbnail && d.thumbnail.length > 25000 ? (
                <img src={d.thumbnail} alt={`${d.title} thumbnail`} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
              ) : tpl ? (
                <TemplatePreview tpl={tpl} className="absolute inset-0" noWatermark />
              ) : d.thumbnail ? (
                <img src={d.thumbnail} alt={`${d.title} thumbnail`} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
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

/* ------------------------------------------------------------------
   MODERN 2026 CLIENT PROJECT COCKPIT (Split-View Workspace)
   • Master-Detail interactive layout
   • Real-time milestone tracker & progress bar
   • 1-Click "Approve Deliverables" & "Request Revision" flow
   • Deliverables Vault with direct file download links
   • Integrated Official PDF Receipt generator
------------------------------------------------------------------- */

function DeliverableFileItem({ file }: { file: { name: string; size: number; path?: string } }) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";

  const handleDownload = async () => {
    if (downloadUrl) {
      window.open(downloadUrl, "_blank");
      return;
    }
    setLoading(true);
    try {
      const url = file.path ? await getFileUrl(file.path) : "#";
      if (url && url !== "#") {
        setDownloadUrl(url);
        window.open(url, "_blank");
      } else {
        toast.info(`Preparing "${file.name}" for download…`);
      }
    } catch {
      toast.error("Failed to load file download URL.");
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-between p-3.5 border border-[var(--line)] bg-[var(--bg)] rounded-lg hover:border-[var(--dept)] transition-colors">
      <div className="flex items-center gap-3 truncate">
        <span className="text-xl">📁</span>
        <div className="truncate">
          <p className="font-display text-xs font-bold uppercase truncate">{file.name}</p>
          <p className="font-meta text-[9px] text-[var(--muted)] mt-0.5">
            {ext} · {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Ready to download"}
          </p>
        </div>
      </div>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="font-meta text-[9px] px-3 py-1.5 rounded border border-[var(--dept)] dept-accent hover:bg-[var(--dept)] hover:text-[var(--on-dept)] transition-colors shrink-0"
      >
        {loading ? "Loading…" : "⬇ Download"}
      </button>
    </div>
  );
}

function ProjectsWorkspace({ orders, onReload }: { orders: OrderRecord[]; onReload: () => void }) {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string>(orders[0]?.id ?? "");
  const [filter, setFilter] = useState<"all" | "active" | "review" | "completed">("all");
  const [search, setSearch] = useState("");
  const [cockpitTab, setCockpitTab] = useState<"overview" | "chat" | "vault">("overview");
  const [receiptOrder, setReceiptOrder] = useState<OrderRecord | null>(null);
  const [revisionPrompt, setRevisionPrompt] = useState(false);
  const [revisionText, setRevisionText] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [uploadingVault, setUploadingVault] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [dragOverVault, setDragOverVault] = useState(false);
  const vaultInputRef = useRef<HTMLInputElement>(null);

  // Keep selectedId valid
  useEffect(() => {
    if (orders.length > 0 && (!selectedId || !orders.some((o) => o.id === selectedId))) {
      setSelectedId(orders[0].id);
    }
  }, [orders, selectedId]);

  const activeOrders = orders.filter((o) => !["DELIVERED", "COMPLETED"].includes(o.status));
  const reviewOrders = orders.filter((o) => ["CLIENT REVIEW", "FINAL APPROVAL"].includes(o.status));
  const completedOrders = orders.filter((o) => ["DELIVERED", "COMPLETED"].includes(o.status));

  const filteredOrders = orders.filter((o) => {
    if (filter === "active" && ["DELIVERED", "COMPLETED"].includes(o.status)) return false;
    if (filter === "review" && !["CLIENT REVIEW", "FINAL APPROVAL"].includes(o.status)) return false;
    if (filter === "completed" && !["DELIVERED", "COMPLETED"].includes(o.status)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchId = o.id.toLowerCase().includes(q);
      const matchItem = o.items.some((i) => i.name.toLowerCase().includes(q));
      return matchId || matchItem;
    }
    return true;
  });

  const current = orders.find((o) => o.id === selectedId) ?? filteredOrders[0] ?? orders[0];

  if (!current) {
    return (
      <div className="border border-[var(--line)] p-12 text-center" style={{ background: "var(--panel)" }}>
        <p className="font-display text-xl font-bold uppercase">No matching projects</p>
        <p className="text-sm text-[var(--muted)] mt-2">Try clearing your search or filter.</p>
        <button onClick={() => { setFilter("all"); setSearch(""); }} className="btn btn-ghost mt-4">Reset Filters</button>
      </div>
    );
  }

  const stepIndex = ORDER_STATUSES.indexOf(current.status);
  const progressPct = Math.round(((stepIndex + 1) / ORDER_STATUSES.length) * 100);

  const getStatusColor = (status: OrderRecord["status"]) => {
    if (["DELIVERED", "COMPLETED"].includes(status)) return "bg-emerald-500/10 text-emerald-500 border-emerald-500/30";
    if (["CLIENT REVIEW", "FINAL APPROVAL"].includes(status)) return "bg-amber-500/10 text-amber-500 border-amber-500/30";
    if (["CONCEPT", "REVISION"].includes(status)) return "bg-purple-500/10 text-purple-500 border-purple-500/30";
    return "bg-cyan-500/10 text-cyan-500 border-cyan-500/30";
  };

  const approveDeliverable = async () => {
    if (!window.confirm("Approve this deliverable and proceed to final release?")) return;
    setBusyAction(true);
    try {
      const nextStatus: OrderStatus = current.status === "CLIENT REVIEW" ? "FINAL APPROVAL" : "COMPLETED";
      await setOrderStatus(current.id, nextStatus);
      await postMessage(current.id, "client", `✅ Deliverable approved by client. Ready for ${nextStatus.toLowerCase()}.`, user?.email ?? "Client");
      toast.success("Deliverable approved! Studio notified.");
      onReload();
    } catch {
      toast.error("Failed to approve. Please try again.");
    }
    setBusyAction(false);
  };

  const submitRevision = async () => {
    if (!revisionText.trim()) return;
    setBusyAction(true);
    try {
      await setOrderStatus(current.id, "REVISION");
      await postMessage(current.id, "client", `🔄 Revision requested:\n\n${revisionText.trim()}`, user?.email ?? "Client");
      toast.success("Revision request submitted to your designer.");
      setRevisionPrompt(false);
      setRevisionText("");
      onReload();
    } catch {
      toast.error("Failed to submit revision.");
    }
    setBusyAction(false);
  };

  const processVaultFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setUploadingVault(true);
    setUploadProgress({ current: 1, total: files.length, filename: files[0].name });
    try {
      await attachFiles(current.id, files, (curr, tot, name) => {
        setUploadProgress({ current: curr, total: tot, filename: name });
      });
      toast.success(`${files.length} file(s) added to project vault.`);
      onReload();
    } catch (err) {
      console.error("Vault upload failed:", err);
      toast.error("Failed to upload files. Please try again.");
    } finally {
      setUploadingVault(false);
      setUploadProgress(null);
    }
  };

  const handleVaultUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processVaultFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleVaultDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverVault(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processVaultFiles(e.dataTransfer.files);
    }
  };

  const handleVaultDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragOverVault) setDragOverVault(true);
  };

  const handleVaultDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if leaving the container
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverVault(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter projects">
          <button
            onClick={() => setFilter("all")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-full border transition-colors ${
              filter === "all" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            All ({orders.length})
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-full border transition-colors ${
              filter === "active" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            Active ({activeOrders.length})
          </button>
          <button
            onClick={() => setFilter("review")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-full border transition-colors ${
              filter === "review" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            Action Needed ({reviewOrders.length})
          </button>
          <button
            onClick={() => setFilter("completed")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-full border transition-colors ${
              filter === "completed" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            Delivered ({completedOrders.length})
          </button>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by name or ID…"
            className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded w-full sm:w-60"
          />
          <Link to="/start" className="btn btn-dept !py-1.5 !px-3 font-meta text-[10px] shrink-0">
            + New Project
          </Link>
        </div>
      </div>

      {/* Split-View Workspace */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Master Project List */}
        <div className="lg:col-span-4 flex flex-col gap-2.5 max-h-[750px] overflow-y-auto pr-1">
          {filteredOrders.map((o) => {
            const isSelected = o.id === current.id;
            const sIdx = ORDER_STATUSES.indexOf(o.status);
            const pct = Math.round(((sIdx + 1) / ORDER_STATUSES.length) * 100);
            return (
              <div
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={`p-4 border text-left cursor-pointer transition-all duration-150 rounded-lg ${
                  isSelected
                    ? "border-[var(--dept)] bg-[var(--dept-soft)] ring-1 ring-[var(--dept)] shadow-sm"
                    : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--line-strong)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-meta text-[9px] text-[var(--muted)]">
                    #ORD-{o.id.slice(0, 7).toUpperCase()}
                  </span>
                  <span className={`font-meta text-[8.5px] px-2 py-0.5 rounded-full border ${getStatusColor(o.status)}`}>
                    {o.status}
                  </span>
                </div>

                <h4 className="font-display text-sm font-bold uppercase line-clamp-1 leading-snug">
                  {o.items.map((i) => i.name).join(" · ")}
                </h4>

                <div className="mt-3 flex items-center justify-between text-[11px] font-meta text-[var(--muted)]">
                  <span>Step {sIdx + 1}/8 · {pct}%</span>
                  <span className="font-semibold text-[var(--ink)]">
                    {o.balanceDue > 0 ? (
                      <span className="text-amber-600">Balance {formatMoney(o.balanceDue)}</span>
                    ) : (
                      <span className="dept-accent">Paid in Full</span>
                    )}
                  </span>
                </div>

                {/* Micro progress line */}
                <div className="w-full bg-[var(--line)] h-1 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      background: o.status === "COMPLETED" ? "rgb(16 185 129)" : "var(--dept)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT COLUMN: Interactive Studio Cockpit */}
        <div className="lg:col-span-8 border border-[var(--line-strong)] bg-[var(--panel)] rounded-xl overflow-hidden shadow-sm">
          {/* Cockpit Header */}
          <div className="p-6 border-b border-[var(--line)] bg-[var(--bg)] flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="idx">/project-cockpit</span>
                <span className="font-meta text-[10px] text-[var(--muted)]">· #ORD-{current.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <h2 className="font-display text-xl font-bold uppercase">
                {current.items.map((i) => i.name).join(" · ")}
              </h2>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
                Ordered on {current.createdAt ? new Date(current.createdAt).toLocaleDateString(undefined, { dateStyle: "long" }) : "Recent"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setReceiptOrder(current)}
                className="btn btn-ghost !py-2 !px-3 font-meta text-[10px] flex items-center gap-1.5"
              >
                <span>🧾</span> Receipt / PDF
              </button>
              {current.balanceDue > 0 && (
                <button
                  onClick={() => setCockpitTab("overview")}
                  className="btn btn-dept !py-2 !px-3 font-meta text-[10px]"
                >
                  Pay Balance ({formatMoney(current.balanceDue)}) →
                </button>
              )}
            </div>
          </div>

          {/* Visual Milestone Progress Tracker */}
          <div className="px-6 py-4 border-b border-[var(--line)] bg-[var(--dept-soft)]/50">
            <div className="flex items-center justify-between mb-2">
              <span className="font-meta text-[10px] uppercase font-bold text-[var(--dept)] tracking-wider">
                Phase {stepIndex + 1} of 8: {current.status}
              </span>
              <span className="font-meta text-[10px] text-[var(--muted)]">{progressPct}% Completed</span>
            </div>

            <div className="w-full bg-[var(--line)] h-2 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: current.status === "COMPLETED" ? "rgb(16 185 129)" : "var(--dept)",
                }}
              />
            </div>

            <p className="font-meta text-[11px] text-[var(--muted)] mt-3 leading-relaxed">
              {current.status === "ORDER RECEIVED" && "📋 Questionnaire & intake received — studio is scheduling kickoff and resource allocation."}
              {current.status === "DISCOVERY" && "🔍 Creative discovery in progress — researching your market, audience, and visual positioning."}
              {current.status === "CONCEPT" && "🎨 First concept drafts & wireframes are actively being developed in the studio."}
              {current.status === "CLIENT REVIEW" && "👀 Your feedback is needed! Check the design proof below and approve or request revisions."}
              {current.status === "REVISION" && "✏️ Designer is applying your requested adjustments. Updated proof will arrive shortly."}
              {current.status === "FINAL APPROVAL" && "⭐ Design approved! Final master files, vectors, and export packages are being prepared."}
              {current.status === "DELIVERED" && "🚀 Project delivered! All final assets are packaged and ready in your Deliverables Vault."}
              {current.status === "COMPLETED" && "✅ Project successfully wrapped. Thank you for partnering with Social Kon10!"}
            </p>
          </div>

          {/* Client Action Banner (When status is in Review) */}
          {["CLIENT REVIEW", "FINAL APPROVAL"].includes(current.status) && (
            <div className="p-4 bg-amber-500/10 border-b border-amber-500/30 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔔</span>
                <div>
                  <p className="font-display text-xs font-bold uppercase text-amber-600">
                    Deliverable Review Requested
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    Review designer concepts in the chat or files tab. Ready to proceed?
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={busyAction}
                  onClick={() => setRevisionPrompt((p) => !p)}
                  className="btn btn-ghost !py-1.5 !px-3 font-meta text-[10px]"
                >
                  🔄 Request Revision
                </button>
                <button
                  disabled={busyAction}
                  onClick={approveDeliverable}
                  className="btn btn-dept !py-1.5 !px-3 font-meta text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  ✅ Approve Deliverable
                </button>
              </div>
            </div>
          )}

          {/* Revision Prompt Box */}
          {revisionPrompt && (
            <div className="p-5 border-b border-[var(--line)] bg-[var(--bg)] animate-in slide-in-from-top-2">
              <span className="font-meta text-[10px] text-amber-600 font-bold uppercase">Provide Revision Feedback</span>
              <p className="text-xs text-[var(--muted)] mt-1">Specify changes, wording tweaks, or adjustments for your designer:</p>
              <textarea
                rows={3}
                value={revisionText}
                onChange={(e) => setRevisionText(e.target.value)}
                placeholder="e.g. Please change the headline font to sans-serif and brighten the blue background…"
                className="w-full mt-2 bg-transparent border border-[var(--line)] p-3 text-xs outline-none focus:border-[var(--dept)] rounded"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => setRevisionPrompt(false)} className="btn btn-ghost !py-1 !px-3 font-meta text-[10px]">Cancel</button>
                <button disabled={busyAction || !revisionText.trim()} onClick={submitRevision} className="btn btn-dept !py-1 !px-3 font-meta text-[10px]">
                  Submit Feedback →
                </button>
              </div>
            </div>
          )}

          {/* Cockpit Sub-Tab Navigation */}
          <div className="flex border-b border-[var(--line)] bg-[var(--bg)] px-4" role="tablist">
            <button
              onClick={() => setCockpitTab("overview")}
              className={`font-meta text-[10px] uppercase px-4 py-3 border-b-2 font-bold transition-colors ${
                cockpitTab === "overview" ? "border-[var(--dept)] text-[var(--dept)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              📌 Overview & Invoices
            </button>
            <button
              onClick={() => setCockpitTab("chat")}
              className={`font-meta text-[10px] uppercase px-4 py-3 border-b-2 font-bold transition-colors ${
                cockpitTab === "chat" ? "border-[var(--dept)] text-[var(--dept)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              💬 Chat & Materials
            </button>
            <button
              onClick={() => setCockpitTab("vault")}
              className={`font-meta text-[10px] uppercase px-4 py-3 border-b-2 font-bold transition-colors ${
                cockpitTab === "vault" ? "border-[var(--dept)] text-[var(--dept)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              📂 Deliverables Vault ({current.files.length})
            </button>
          </div>

          {/* Cockpit Tab Content */}
          <div className="p-6">
            {/* SUB-TAB 1: Overview & Invoices */}
            {cockpitTab === "overview" && (
              <div className="flex flex-col gap-6">
                {/* Deliverables Scope */}
                <div>
                  <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-2">Scope of Work</h4>
                  <div className="border border-[var(--line)] rounded-lg divide-y divide-[var(--line)] bg-[var(--bg)]">
                    {current.items.map((it, idx) => (
                      <div key={idx} className="p-3.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold font-display uppercase">{it.name}</p>
                          {it.tierLabel && <p className="font-meta text-[9px] text-[var(--muted)] mt-0.5">{it.tierLabel} Tier</p>}
                          {it.addons.length > 0 && (
                            <p className="font-meta text-[9px] dept-accent mt-0.5">
                              Add-ons: {it.addons.map((a) => a.name).join(" · ")}
                            </p>
                          )}
                        </div>
                        <span className="font-display font-bold">{formatMoney(it.unitPrice)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Summary & Balance Payment */}
                <div>
                  <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-2">Invoice Breakdown</h4>
                  <div className="border border-[var(--line)] p-4 rounded-lg bg-[var(--bg)] space-y-2 text-xs">
                    <div className="flex justify-between text-[var(--muted)]">
                      <span>Subtotal</span>
                      <span>{formatMoney(current.subtotal)}</span>
                    </div>
                    {current.discount > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Discount {current.promo ? `(${current.promo})` : ""}</span>
                        <span>−{formatMoney(current.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-sm pt-2 border-t border-[var(--line)]">
                      <span>Total Engagement</span>
                      <span>{formatMoney(current.total)}</span>
                    </div>
                    <div className="flex justify-between text-[var(--muted)] pt-1">
                      <span>Amount Paid</span>
                      <span className="text-emerald-600 font-bold">{formatMoney(current.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-[var(--line)]">
                      <div>
                        <span className="font-bold">Remaining Balance</span>
                        <p className="font-meta text-[9px] text-[var(--muted)]">Due upon final deliverable approval</p>
                      </div>
                      <span className="font-display text-base font-bold text-[var(--ink)]">
                        {current.balanceDue > 0 ? formatMoney(current.balanceDue) : "PAID IN FULL"}
                      </span>
                    </div>

                    <PayBalance order={current} onPaid={onReload} />
                  </div>
                </div>
              </div>
            )}

            {/* SUB-TAB 2: Chat & Material Uploads */}
            {cockpitTab === "chat" && (
              <div>
                <MessageThread orderId={current.id} from="client" author={user?.email ?? current.email} />
              </div>
            )}

            {/* SUB-TAB 3: Deliverables Vault */}
            {cockpitTab === "vault" && (
              <div
                className="relative"
                onDragOver={handleVaultDragOver}
                onDragEnter={handleVaultDragOver}
                onDragLeave={handleVaultDragLeave}
                onDrop={handleVaultDrop}
              >
                {/* Drag & Drop Full-Tab Overlay */}
                {dragOverVault && (
                  <div className="absolute inset-0 z-30 bg-[var(--dept)]/15 backdrop-blur-sm border-2 border-dashed border-[var(--dept)] rounded-xl flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-150">
                    <span className="text-4xl mb-2 animate-bounce">📥</span>
                    <p className="font-display text-sm font-bold uppercase text-[var(--dept)]">
                      Drop files to upload to project vault
                    </p>
                    <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
                      Logos, graphics, brand briefs, fonts, or reference images
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider">
                      Master Files &amp; Proofs
                    </h4>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      All approved design files, mockups, and client uploads for this project.
                    </p>
                  </div>
                  <div>
                    <input
                      ref={vaultInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleVaultUpload}
                    />
                    <button
                      onClick={() => vaultInputRef.current?.click()}
                      disabled={uploadingVault}
                      className="btn btn-ghost !py-1.5 !px-3 font-meta text-[10px]"
                    >
                      {uploadingVault ? "Uploading…" : "+ Upload File"}
                    </button>
                  </div>
                </div>

                {/* Uploading Spinner & Progress Card */}
                {uploadingVault && (
                  <div className="mb-5 p-4 border border-[var(--dept)] bg-[var(--dept-soft)] rounded-xl flex items-center justify-between gap-4 animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <svg
                        className="animate-spin h-6 w-6 text-[var(--dept)] shrink-0"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                      </svg>
                      <div>
                        <p className="font-display text-xs font-bold uppercase text-[var(--dept)]">
                          Uploading to Vault… {uploadProgress ? `(${uploadProgress.current} of ${uploadProgress.total})` : ""}
                        </p>
                        <p className="font-meta text-[10px] text-[var(--muted)] truncate max-w-xs sm:max-w-md mt-0.5">
                          {uploadProgress?.filename ? uploadProgress.filename : "Encrypting and storing asset in Cloud Storage…"}
                        </p>
                      </div>
                    </div>
                    <span className="font-meta text-[9px] px-2 py-1 bg-[var(--bg)] border border-[var(--dept)]/40 rounded dept-accent shrink-0 animate-pulse">
                      Uploading
                    </span>
                  </div>
                )}

                {/* Interactive Drag & Drop Area */}
                <div
                  onClick={() => vaultInputRef.current?.click()}
                  className={`p-5 mb-5 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
                    dragOverVault
                      ? "border-[var(--dept)] bg-[var(--dept-soft)] shadow-inner"
                      : "border-[var(--line)] bg-[var(--bg)] hover:border-[var(--dept)] hover:bg-[var(--dept-soft)]/30"
                  }`}
                >
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <span className="text-2xl">☁️</span>
                    <p className="font-display text-xs font-bold uppercase">
                      {uploadingVault ? "Uploading to vault…" : "Drag & drop files here, or click to browse"}
                    </p>
                    <p className="font-meta text-[9px] text-[var(--muted)]">
                      Supports PNG, JPG, WebP, SVG, PDF, AI, PSD, EPS, DOCX up to 25MB each
                    </p>
                  </div>
                </div>

                {current.files.length === 0 ? (
                  <div className="p-8 border border-dashed border-[var(--line)] text-center rounded-lg">
                    <span className="text-3xl block mb-2">📂</span>
                    <p className="font-display text-xs font-bold uppercase">No files attached yet</p>
                    <p className="font-meta text-[10px] text-[var(--muted)] mt-1 max-w-xs mx-auto">
                      Files shared by your designer or uploaded in chat will automatically appear in this vault.
                    </p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {current.files.map((file, i) => (
                      <DeliverableFileItem key={i} file={file} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Official PDF / Printable Receipt Modal */}
      {receiptOrder && <ReceiptModal order={receiptOrder} onClose={() => setReceiptOrder(null)} />}
    </div>
  );
}

function ClientMeetingsHub({ userEmail }: { userEmail: string }) {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [callingStudio, setCallingStudio] = useState(false);

  const reload = async () => {
    const list = await listUserMeetings(userEmail);
    setMeetings(list);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, [userEmail]);

  const upcomingMeetings = meetings.filter((m) => m.status === "scheduled" || m.status === "live");
  const pastMeetings = meetings.filter((m) => m.status === "completed");

  const handleRsvp = async (meetingId: string, participantId: string, status: "accepted" | "declined") => {
    await updateParticipant(meetingId, participantId, { status });
    toast.success(`Meeting invitation ${status}.`);
    reload();
  };

  const handleInstantCallStudio = async () => {
    setCallingStudio(true);
    try {
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 60 * 60000).toISOString();
      const title = `Live Client Consultation (${userEmail})`;

      const meet = await createMeeting({
        title,
        description: "Client initiated instant video consultation.",
        hostId: "admin",
        hostName: "Social Kon10 Studio",
        hostEmail: "admin@socialkon10.pro",
        type: "instant_video_call",
        status: "live",
        scheduledStart: now,
        scheduledEnd: end,
        durationMinutes: 60,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        waitingRoomEnabled: false,
        authenticationRequired: false,
        meetingLocked: false,
        allowGuests: true,
        recordingEnabled: true,
        transcriptionEnabled: true,
        aiSummaryEnabled: true,
        chatEnabled: true,
        reactionsEnabled: true,
        screenShareMode: "everyone",
        allowCamera: true,
        allowMicrophone: true,
        participants: [
          {
            id: `p_admin_${Date.now()}`,
            meetingId: "",
            email: "admin@socialkon10.pro",
            displayName: "Social Kon10 Studio",
            role: "host",
            status: "waiting",
          },
          {
            id: `p_client_${Date.now()}`,
            meetingId: "",
            email: userEmail,
            displayName: userEmail.split("@")[0],
            role: "participant",
            status: "joined",
          },
        ],
      });

      // Record call history
      await recordCallHistory({
        sessionId: meet.roomId,
        callerId: userEmail,
        callerName: userEmail.split("@")[0],
        callerEmail: userEmail,
        recipientId: "admin",
        recipientName: "Social Kon10 Studio",
        recipientEmail: "admin@socialkon10.pro",
        type: "video",
        status: "ringing",
        startedAt: now,
        durationSeconds: 0,
      });

      window.open(`/meet/${meet.roomId}`, "_blank");
      reload();
    } catch (err) {
      console.error("Call error:", err);
      toast.error("Failed to connect to studio call.");
    } finally {
      setCallingStudio(false);
    }
  };

  if (loading) {
    return <p className="font-meta text-[11px] text-[var(--muted)]">Loading your meetings…</p>;
  }

  return (
    <div className="space-y-8">
      {/* Action Banner */}
      <div className="p-6 border border-[var(--dept)] bg-[var(--dept-soft)] rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-meta text-[9px] uppercase font-bold text-[var(--dept)] tracking-wider">
              Studio Video &amp; Voice Communications
            </span>
          </div>
          <h3 className="font-display text-lg font-bold uppercase">Connect with Your Creative Team</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Join scheduled milestone reviews, brief consultations, or place an instant live call to the studio.
          </p>
        </div>

        <button
          onClick={handleInstantCallStudio}
          disabled={callingStudio}
          className="btn btn-dept !py-2.5 !px-5 font-display text-xs font-bold uppercase tracking-wider shadow-md"
        >
          {callingStudio ? "Connecting…" : "📞 Instant Call Studio"}
        </button>
      </div>

      {/* Upcoming & Active Meetings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-display text-sm font-bold uppercase tracking-wider">
            Scheduled Sessions ({upcomingMeetings.length})
          </h4>
          <span className="font-meta text-[9px] text-[var(--muted)]">
            Local Time: <strong className="text-[var(--ink)]">{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>
          </span>
        </div>

        {upcomingMeetings.length === 0 ? (
          <div className="p-10 border border-[var(--line)] rounded-xl text-center bg-[var(--panel)]">
            <span className="text-3xl block mb-2">📅</span>
            <p className="font-display text-sm font-bold uppercase">No upcoming meetings scheduled</p>
            <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
              When our design team schedules a creative review or kickoff with you, it will appear here.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {upcomingMeetings.map((m) => {
              const myPart = m.participants.find((p) => p.email.toLowerCase() === userEmail.toLowerCase());
              const isLive = m.status === "live";
              const joinCheck = isMeetingJoinable(m);
              const dateStr = new Date(m.scheduledStart).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const timeStr = new Date(m.scheduledStart).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              });

              return (
                <div
                  key={m.id}
                  className="p-5 border border-[var(--line)] rounded-xl bg-[var(--panel)] flex flex-col justify-between gap-4 shadow-sm hover:border-[var(--dept)] transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`font-meta text-[8.5px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                        isLive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 animate-pulse" :
                        "bg-cyan-500/10 text-cyan-500 border-cyan-500/30"
                      }`}>
                        {isLive ? "● LIVE NOW" : m.status}
                      </span>
                      <span className="font-meta text-[9px] text-[var(--muted)]">
                        {m.durationMinutes} mins
                      </span>
                    </div>

                    <h4 className="font-display text-base font-bold uppercase line-clamp-1">{m.title}</h4>
                    {m.description && <p className="text-xs text-[var(--muted)] line-clamp-2 mt-1">{m.description}</p>}

                    <div className="mt-3 p-3 bg-[var(--bg)] border border-[var(--line)] rounded-lg text-xs space-y-1">
                      <p className="font-medium text-[var(--ink)]">
                        📅 {dateStr} at {timeStr}
                      </p>
                      <p className="font-meta text-[9.5px] text-[var(--muted)]">
                        Host: {m.hostName} · Room #{m.roomId}
                      </p>
                      {m.passcode && (
                        <p className="font-meta text-[9.5px] text-[var(--muted)]">
                          Passcode: <code className="text-[var(--ink)] font-bold">{m.passcode}</code>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--line)]">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => downloadCalendarIcs(m)}
                        className="font-meta text-[9px] px-2.5 py-1 border border-[var(--line)] rounded hover:border-[var(--dept)] bg-[var(--bg)] transition-colors"
                        title="Download Calendar .ICS file"
                      >
                        📥 Add to Cal
                      </button>

                      {/* RSVP Buttons */}
                      {myPart && myPart.status === "invited" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleRsvp(m.id, myPart.id, "accepted")}
                            className="font-meta text-[9px] px-2 py-1 bg-emerald-600/10 text-emerald-600 border border-emerald-500/30 rounded font-bold"
                          >
                            ✓ Accept
                          </button>
                          <button
                            onClick={() => handleRsvp(m.id, myPart.id, "declined")}
                            className="font-meta text-[9px] px-2 py-1 text-red-500 border border-red-500/20 rounded"
                          >
                            ✕ Decline
                          </button>
                        </div>
                      )}
                      {myPart && myPart.status === "accepted" && (
                        <span className="font-meta text-[8.5px] text-emerald-600 font-bold">✓ Accepted</span>
                      )}
                    </div>

                    <button
                      onClick={() => window.open(`/meet/${m.roomId}`, "_blank")}
                      disabled={!joinCheck.canJoin}
                      className={`btn btn-dept !py-1.5 !px-4 font-display text-[10px] font-bold uppercase tracking-wider ${
                        isLive ? "animate-pulse" : ""
                      }`}
                    >
                      {isLive ? "🚀 Join Live Call →" : "Join Room →"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past Completed Meetings & AI Summaries */}
      {pastMeetings.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-[var(--line)]">
          <h4 className="font-display text-sm font-bold uppercase tracking-wider">
            Past Meetings &amp; Action Items ({pastMeetings.length})
          </h4>
          <div className="space-y-4">
            {pastMeetings.map((m) => (
              <div key={m.id} className="p-5 border border-[var(--line)] rounded-xl bg-[var(--panel)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-display text-sm font-bold uppercase">{m.title}</h5>
                    <p className="font-meta text-[9px] text-[var(--muted)]">
                      Completed on {new Date(m.scheduledStart).toLocaleDateString()} · Host: {m.hostName}
                    </p>
                  </div>
                  <button
                    onClick={() => downloadCalendarIcs(m)}
                    className="font-meta text-[9px] px-2.5 py-1 rounded border border-[var(--line)] hover:border-[var(--dept)]"
                  >
                    .ICS
                  </button>
                </div>

                {m.intelligence && (
                  <div className="p-4 bg-[var(--bg)] border border-[var(--line)] rounded-lg text-xs space-y-3">
                    <div>
                      <p className="font-display font-bold uppercase dept-accent text-[10.5px]">✨ AI Summary</p>
                      <p className="text-[var(--muted)] mt-1 leading-relaxed">{m.intelligence.summary}</p>
                    </div>

                    {m.intelligence.actionItems.length > 0 && (
                      <div className="pt-2 border-t border-[var(--line)]">
                        <p className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] mb-1.5">Action Items</p>
                        <div className="space-y-1">
                          {m.intelligence.actionItems.map((act, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-[11px]">
                              <span className="text-emerald-500">✓</span>
                              <span className="text-[var(--ink)] font-medium">{act.task}</span>
                              <span className="font-meta text-[9px] text-[var(--muted)] ml-auto">({act.dueDate})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountPortal({ user, isAdmin, signOut }: { user: any; isAdmin: boolean; signOut: () => void }) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"Projects" | "Meetings & Calls" | "My Templates" | "My Designs" | "Favorites">("Projects");

  useEffect(() => {
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

      {/* account navigation */}
      <div className="flex flex-wrap gap-2 mb-10" role="tablist" aria-label="Account sections">
        {(["Projects", "Meetings & Calls", "My Templates", "My Designs", "Favorites"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className="font-meta text-[10px] px-4 py-2 border transition-colors"
            style={tab === t ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Meetings & Calls" && (
        <ClientMeetingsHub userEmail={user?.email || ""} />
      )}

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
        <ProjectsWorkspace orders={orders} onReload={() => listMyOrders(user).then(setOrders)} />
      ))}

      <p className="font-meta text-[10px] text-[var(--muted)] mt-10">
        Need help? {CONTACT.phone} · {CONTACT.email} — reference your order number.
      </p>
    </div>
  );
}

function Dashboard() {
  const { user, signOut, isAdmin } = useAuth();
  return <AccountPortal user={user} isAdmin={isAdmin} signOut={signOut} />;
}

export default function ClientPortal() {
  useDepartment(null);
  const { user, loading, completeMagicLink } = useAuth();
  useSEO({ title: "Client Portal — Social Kon10 Marketing", description: "Track your project status, payments, files and next steps.", path: "/client" });

  // Enhancement 4: complete passwordless magic-link sign-in when user lands here from email
  useEffect(() => {
    if (!firebaseReady) return;
    completeMagicLink().then(async (err: string | null) => {
      if (!err && firebaseReady) {
        // Give Firebase auth state a moment to update, then claim any guest orders
        setTimeout(async () => {
          const { auth } = await import("../lib/firebase");
          if (auth?.currentUser) await claimOrders(auth.currentUser);
        }, 800);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

