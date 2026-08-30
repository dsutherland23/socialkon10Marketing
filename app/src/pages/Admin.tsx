import { useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import { CONTACT, FAQS, PROJECTS, PROMO_CODES, SERVICES, SOCIAL_LINKS, TESTIMONIALS, CURRENCIES, type CurrencyCode } from "../lib/data";
import { useDepartment } from "../lib/dept";
import { useSEO } from "../lib/seo";
import { useAuth } from "../lib/auth";
import { useMoney } from "../lib/money";
import { useShop } from "../lib/shop";
import {
  ORDER_STATUSES, listAllOrders, subscribeAllOrders, listLeads, subscribeLeads, setLeadStatus, setLeadsStatus, deleteLead, deleteLeads, setOrderStatus, setOrdersStatus, deleteOrder, deleteOrders, deleteOrderFile, isOrderHistory,
  resetAccountingLedger,
  getServiceOverrides, saveServiceOverride, deleteServiceOverride,
  listManaged, addManaged, removeManaged, updateManaged,
  getSettings, saveSettings, convertLeadToOrder, recordPayment, createOrder,
  uploadImage, getFileUrl, attachFiles, postMessage,
  markThreadReadForStudio, orderHasUnreadClientMessage,
  type LeadRecord, type ManagedItem, type OrderRecord, type ServiceOverride, type SiteSettings,
} from "../lib/backend";
import { HOME_SECTIONS } from "../lib/content";
import { firebaseReady } from "../lib/firebase";
import { MessageThread } from "../components/messages";
import {
  createMeeting, deleteMeeting, deleteMeetings, setMeetingsStatus, listAllMeetings,
  recordCallHistory, listCallHistory, deleteCallHistory, deleteCalls, downloadCalendarIcs,
  generatePasscode, getMeetingShareDetails,
  type MeetingRecord, type CallHistoryRecord, type SessionType,
} from "../lib/meetings";
import { PasswordEyeToggle } from "../components/PasswordEyeToggle";
import { DesignStudio } from "./AdminDesign";
import { TemplateStudio } from "./AdminTemplates";
import { listAllCustomerDesigns, deleteDesign, deleteDesigns, findDesignForOrder, listDesigns, createDesign, type CustomerDesign } from "../lib/editor-store";
import { useTemplates } from "../lib/templates";
import {
  listAllIntakes, subscribeAllIntakes, setIntakeStatus, setIntakesStatus, deleteIntake, deleteIntakes, INTAKE_STATUSES,
  intakePackageFor, intakeSteps, fieldVisible,
  INTAKE_ADDONS, RECURRING_SERVICES,
  type IntakeRecord,
} from "../lib/intake";
import { sendEmail, proposalEmail } from "../lib/email";
import { BatchActionBar } from "../components/BatchActionBar";
import { exportToCsv, exportToJson } from "../lib/export-utils";
import { GeoWorldMap } from "../components/analytics/GeoWorldMap";
import { ExecutiveBriefingModal } from "../components/analytics/ExecutiveBriefingModal";
import {
  getSessionCount, getTopPages, getTrafficSources,
  getServiceInterestRanking, getFunnelCounts, getRecentSessions,
  getCampaignPerformance, getActiveLiveVisitors, getSessionEvents,
  getGeographicDistribution, getActivityHeatmap, getTechnologyDistribution,
  getEntryAndExitPages,
  type SessionData, type AnalyticsEvent, type GeoDistributionRecord,
  type HeatmapCell, type TechDistribution, type EntryExitPageRecord,
} from "../lib/analytics";

/* ------------------------------------------------------------------
   ADMIN DASHBOARD (PRD §33, §67, §68, §85)
   Full CMS editability — 2026 patterns: edit-in-place (not just
   add/remove), optimistic toast feedback, two-step destructive
   confirms, image uploads with preview, payment recording, filters.
------------------------------------------------------------------- */

const inputCls = "bg-transparent border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--dept)] transition-colors w-full";
const labelCls = "font-meta text-[9px] text-[var(--muted)] block";

/** Run an async mutation with toast feedback (2026 UX standard). */
async function mutate(fn: () => Promise<unknown>, ok: string) {
  try {
    await fn();
    toast.success(ok);
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Something went wrong — try again.");
    return false;
  }
}

/* ================= ORDERS (Studio Operations Cockpit 2026) ================= */

/** Two-step destructive confirm (2026: no blocking window.confirm). */
function RemoveButton({ onRemove, onDone }: { onRemove: () => Promise<void>; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <button className="font-meta text-[10px] text-[var(--muted)] hover:text-red-600 transition-colors shrink-0" onClick={() => setConfirming(true)}>Remove</button>;
  }
  return (
    <span className="flex gap-2 shrink-0">
      <button className="font-meta text-[10px] text-red-600 font-bold" onClick={async () => { const ok = await mutate(onRemove, "Removed"); if (ok) onDone(); setConfirming(false); }}>Confirm remove</button>
      <button className="font-meta text-[10px] text-[var(--muted)]" onClick={() => setConfirming(false)}>Cancel</button>
    </span>
  );
}

function RecordPayment({ order, onDone }: { order: OrderRecord; onDone: () => void }) {
  const money = useMoney();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(order.balanceDue));
  const [busy, setBusy] = useState(false);
  if (order.balanceDue <= 0) return <span className="font-meta text-[9px] dept-accent font-bold">PAID IN FULL</span>;
  if (!open) return (
    <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors mt-2 block" onClick={() => setOpen(true)}>
      + Record payment ({money(order.balanceDue)} due) →
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-[var(--line)]">
      <input type="number" min="1" max={order.balanceDue} className={`${inputCls} !w-24 !py-1.5`} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount received (USD)" />
      <button className="btn btn-dept !py-1.5 !px-3 font-meta text-[10px]" disabled={busy || !Number(amount)}
        onClick={async () => {
          setBusy(true);
          const okDone = await mutate(() => recordPayment(order.id, Math.min(Number(amount), order.balanceDue)), "Payment recorded");
          setBusy(false);
          if (okDone) { setOpen(false); onDone(); }
        }}>
        {busy ? "…" : "Mark received"}
      </button>
      <button className="font-meta text-[10px] text-[var(--muted)]" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

function AdminDeliverableItem({
  file,
  orderId,
  onDelete,
}: {
  file: { name: string; size: number; path?: string };
  orderId: string;
  onDelete?: () => void;
}) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const isImage = ["png", "jpg", "jpeg", "webp", "svg", "gif", "avif"].includes(ext);

  // Preload and resolve download / preview URL
  useEffect(() => {
    let active = true;
    if (file.path) {
      getFileUrl(file.path).then((url) => {
        if (active && url && url !== "#") setDownloadUrl(url);
      });
    }
    return () => {
      active = false;
    };
  }, [file.path]);

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

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to remove "${file.name}" from this order?`)) return;
    setIsDeleting(true);
    try {
      await deleteOrderFile(orderId, file.path || file.name);
      toast.success(`Removed "${file.name}" from vault.`);
      onDelete?.();
    } catch {
      toast.error("Failed to delete file.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="group relative flex flex-col border border-[var(--line)] bg-[var(--bg)] rounded-xl overflow-hidden hover:border-[var(--dept)] transition-all shadow-sm">
        {/* Preview Thumbnail for Images */}
        {isImage ? (
          <div
            onClick={() => downloadUrl && setShowLightbox(true)}
            className="relative aspect-video w-full bg-neutral-900 overflow-hidden cursor-pointer flex items-center justify-center border-b border-[var(--line)]"
          >
            {downloadUrl ? (
              <img
                src={downloadUrl}
                alt={file.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-neutral-400 gap-1">
                <span className="text-2xl animate-pulse">🖼️</span>
                <span className="font-meta text-[9px]">Loading preview…</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <span className="bg-black/80 text-white font-meta text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md">
                🔍 Preview High-Res
              </span>
            </div>
            <span className="absolute top-2 right-2 bg-black/70 text-white font-meta text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shadow">
              {ext}
            </span>
          </div>
        ) : (
          <div className="p-4 bg-[var(--dept-soft)]/40 border-b border-[var(--line)] flex items-center gap-3">
            <span className="text-2xl">📁</span>
            <div>
              <span className="font-meta text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-[var(--dept)] text-[var(--on-dept)] rounded">
                {ext.toUpperCase() || "FILE"}
              </span>
            </div>
          </div>
        )}

        {/* Content & Actions */}
        <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
          <div className="min-w-0">
            <p className="font-display text-xs font-bold uppercase truncate" title={file.name}>
              {file.name}
            </p>
            <p className="font-meta text-[9px] text-[var(--muted)] mt-0.5">
              {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Ready"}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-[var(--line)]">
            <button
              type="button"
              onClick={handleDownload}
              disabled={loading}
              className="flex-1 font-meta text-[9.5px] font-bold py-1.5 px-2.5 rounded border border-[var(--dept)] dept-accent hover:bg-[var(--dept)] hover:text-[var(--on-dept)] transition-colors flex items-center justify-center gap-1"
            >
              {loading ? "Preparing…" : "⬇ Download"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="font-meta text-[9px] p-1.5 rounded border border-[var(--line-strong)] text-[var(--muted)] hover:text-red-500 hover:border-red-500/40 transition-colors"
              title="Delete File from Vault"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>

      {/* High-Resolution Lightbox Modal */}
      {showLightbox && downloadUrl && (
        <div
          className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowLightbox(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between">
              <span className="font-display text-xs font-bold uppercase text-white truncate max-w-md">
                {file.name}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="font-meta text-[10px] px-3 py-1 bg-[var(--dept)] text-[var(--on-dept)] font-bold rounded"
                >
                  ⬇ Download High-Res
                </button>
                <button
                  type="button"
                  onClick={() => setShowLightbox(false)}
                  className="text-neutral-400 hover:text-white px-2 py-1 text-sm font-bold"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-2 flex-1 flex items-center justify-center overflow-auto max-h-[75vh] bg-neutral-950">
              <img src={downloadUrl} alt={file.name} className="max-w-full max-h-[70vh] object-contain rounded" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function OrderStudioWorkspace({ order, onReload }: { order: OrderRecord; onReload: () => void }) {
  const [design, setDesign] = useState<CustomerDesign | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { templates } = useTemplates();

  // Find candidate template slug from order items
  const templateItem = order.items.find(
    (it) => it.templateSlug || it.name.toLowerCase().includes("template")
  );
  const templateSlug = templateItem?.templateSlug || "custom";

  useEffect(() => {
    let active = true;
    setLoading(true);
    findDesignForOrder(order.id).then(async (found) => {
      if (!active) return;
      if (found) {
        setDesign(found);
        setLoading(false);
      } else {
        const clientDesigns = await listDesigns(order.email, null);
        const match = clientDesigns.find((d) => d.templateSlug === templateSlug) || clientDesigns[0];
        if (active) {
          setDesign(match ?? null);
          setLoading(false);
        }
      }
    });
    return () => {
      active = false;
    };
  }, [order.id, order.email, templateSlug]);

  const initializeCanvas = async () => {
    setCreating(true);
    try {
      const tpl = templates.find((t) => t.slug === templateSlug) || templates[0];
      const newDesign = await createDesign({
        uid: null,
        email: order.email,
        templateSlug: tpl?.slug || "custom",
        orderId: order.id,
        title: `${order.name} — ${tpl?.name || "Custom Design"}`,
        canvasJson: tpl?.canvasJson || "",
        thumbnail: tpl?.thumbnail || "",
      });
      setDesign(newDesign);
      toast.success("Studio design canvas initialized for this order!");
      window.open(
        `/editor/${newDesign.templateSlug}?designId=${newDesign.id}&orderId=${order.id}&client=${encodeURIComponent(order.email)}`,
        "_blank"
      );
      onReload();
    } catch (err) {
      toast.error("Failed to initialize canvas: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="border border-[var(--line-strong)] rounded-xl p-5 bg-[var(--bg)] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎨</span>
          <div>
            <h4 className="font-display text-xs font-bold uppercase tracking-wider">KON10 Studio Workspace</h4>
            <p className="font-meta text-[9px] text-[var(--muted)]">
              Design &amp; deliver custom vector artwork directly for this order.
            </p>
          </div>
        </div>
        {design && (
          <span className="font-meta text-[8.5px] px-2.5 py-1 bg-[var(--dept)] text-[var(--on-dept)] font-bold uppercase rounded-full">
            v{design.version || 1} · Connected
          </span>
        )}
      </div>

      {loading ? (
        <p className="font-meta text-[10px] text-[var(--muted)] py-3">Connecting to Studio canvas…</p>
      ) : design ? (
        <div className="flex flex-col sm:flex-row gap-4 items-center bg-[var(--panel)] border border-[var(--line)] p-4 rounded-lg">
          <div className="w-24 h-24 bg-neutral-900 rounded border border-[var(--line)] overflow-hidden shrink-0 flex items-center justify-center">
            {design.thumbnail && design.thumbnail.length > 50 ? (
              <img src={design.thumbnail} alt={design.title} className="w-full h-full object-contain" />
            ) : (
              <span className="text-2xl">📐</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h5 className="font-display text-sm font-bold uppercase truncate">{design.title}</h5>
            <p className="font-meta text-[9.5px] text-[var(--muted)] mt-0.5">
              Template: <strong className="text-[var(--ink)]">{design.templateSlug}</strong> · Last edited:{" "}
              {design.updatedAt ? new Date(design.updatedAt).toLocaleString() : "—"}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <a
                href={`/editor/${design.templateSlug || "custom"}?designId=${design.id}&orderId=${order.id}&client=${encodeURIComponent(order.email)}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-dept !py-1.5 !px-3 font-display text-[9.5px] font-bold uppercase flex items-center gap-1 shadow-sm"
              >
                <span>✏️</span> Open in Studio (Designer Mode)
              </a>
              <a
                href={`/meet?topic=${encodeURIComponent(`Live Co-Design: ${order.name}`)}&orderId=${order.id}&designId=${design.id}&template=${design.templateSlug}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost !py-1.5 !px-3 font-display text-[9.5px] font-bold uppercase flex items-center gap-1"
              >
                <span>🎥</span> Launch Live Co-Design
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--panel)] border border-dashed border-[var(--line-strong)] p-5 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <p className="font-display text-xs font-bold uppercase">No Design Canvas Initialized Yet</p>
            <p className="font-meta text-[9.5px] text-[var(--muted)] mt-0.5">
              Start editing {templateSlug !== "custom" ? `the "${templateSlug}" template` : "custom vector artwork"} for {order.name}.
            </p>
          </div>
          <button
            type="button"
            disabled={creating}
            onClick={initializeCanvas}
            className="btn btn-dept !py-2 !px-4 font-display text-[10px] font-bold uppercase shrink-0 shadow-sm"
          >
            {creating ? "Initializing…" : "✨ Initialize Design Canvas"}
          </button>
        </div>
      )}
    </div>
  );
}

function ResetAccountingModal({
  orders,
  isOpen,
  onClose,
  onResetComplete,
}: {
  orders: OrderRecord[];
  isOpen: boolean;
  onClose: () => void;
  onResetComplete?: () => void;
}) {
  const money = useMoney();
  const [confirmText, setConfirmText] = useState("");
  const [exportBackup, setExportBackup] = useState(true);
  const [busy, setBusy] = useState(false);

  const totalRevenue = orders.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const totalOutstanding = orders.reduce((s, o) => s + (o.balanceDue || 0), 0);

  if (!isOpen) return null;

  const handleExecuteReset = async () => {
    if (confirmText.trim().toUpperCase() !== "RESET") {
      toast.error("Please type RESET to confirm accounting reset.");
      return;
    }

    setBusy(true);
    try {
      if (exportBackup && orders.length > 0) {
        exportToCsv<OrderRecord>(
          `Financial_Ledger_Archive_${new Date().toISOString().slice(0, 10)}`,
          [
            { key: "id", header: "Order ID" },
            { key: "name", header: "Client Name" },
            { key: "email", header: "Email" },
            { key: "company", header: "Company", format: (o) => o.company || "" },
            { key: "status", header: "Status" },
            { key: "total", header: "Total Price (USD)", format: (o) => o.total || 0 },
            { key: "amountPaid", header: "Amount Paid (USD)", format: (o) => o.amountPaid || 0 },
            { key: "balanceDue", header: "Balance Due (USD)", format: (o) => o.balanceDue || 0 },
            { key: "items", header: "Items", format: (o) => o.items.map((i) => i.name).join("; ") },
            { key: "createdAt", header: "Created Date", format: (o) => o.createdAt || "" },
            { key: "completedAt", header: "Archived Date", format: (o) => o.completedAt || "" },
          ],
          orders
        );
      }

      await resetAccountingLedger(orders.map((o) => o.id));
      toast.success("Financial ledger & accounting zeroed out ($0.00)");
      onResetComplete?.();
      onClose();
    } catch (err) {
      toast.error("Failed to reset accounting: " + String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[var(--panel)] border border-red-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-[var(--ink)]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center font-bold text-xl border border-red-500/30">
              ⚠️
            </div>
            <div>
              <h3 className="font-display text-lg sm:text-xl font-bold uppercase tracking-tight text-red-400">
                Zero Out Accounting Ledger
              </h3>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                2026 Audit-Compliant Financial Reset & Metrics Zeroing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--line)] transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Ledger Impact Summary */}
        <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--line)] text-center">
          <div>
            <span className="font-meta text-[9px] text-[var(--muted)] uppercase block">Revenue Wiped</span>
            <span className="font-display font-bold text-base text-red-400">{money(totalRevenue)}</span>
          </div>
          <div>
            <span className="font-meta text-[9px] text-[var(--muted)] uppercase block">Balances Cleared</span>
            <span className="font-display font-bold text-base text-amber-400">{money(totalOutstanding)}</span>
          </div>
          <div>
            <span className="font-meta text-[9px] text-[var(--muted)] uppercase block">Transactions</span>
            <span className="font-display font-bold text-base text-[var(--ink)]">{orders.length}</span>
          </div>
        </div>

        {/* Compliance Safety Notice */}
        <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-[var(--muted)] space-y-1.5">
          <p className="font-semibold text-amber-400 flex items-center gap-1.5">
            <span>🛡️ Enterprise Accounting Safety</span>
          </p>
          <p className="text-[11px] leading-relaxed">
            This action purges all order receipts and resets studio gross revenue, accounts receivable, and order tallies to $0.00.
          </p>
        </div>

        {/* Audit Backup Checkbox */}
        <label className="flex items-center gap-2.5 cursor-pointer text-xs select-none">
          <input
            type="checkbox"
            checked={exportBackup}
            onChange={(e) => setExportBackup(e.target.checked)}
            className="w-4 h-4 accent-red-500 rounded cursor-pointer"
          />
          <span className="font-medium text-[var(--ink)]">
            Automatically download financial audit archive (CSV) before wiping
          </span>
        </label>

        {/* Guard Input */}
        <div>
          <label className="block font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-1.5">
            Type <span className="font-mono font-bold text-red-400">RESET</span> to confirm zero-out:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="RESET"
            className="w-full px-3.5 py-2.5 rounded-xl border border-red-500/40 bg-[var(--bg)] font-mono text-sm uppercase tracking-widest text-red-400 placeholder:text-red-900/40 outline-none focus:border-red-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost !py-2 !px-4 text-xs cursor-pointer"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExecuteReset}
            disabled={confirmText.trim().toUpperCase() !== "RESET" || busy}
            className="btn !py-2 !px-4 text-xs font-bold bg-red-600 hover:bg-red-500 text-white border-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md flex items-center gap-2 cursor-pointer"
          >
            {busy ? "Zeroing Out Ledger..." : "Zero Out Accounting ($0.00)"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Orders() {
  const money = useMoney();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [mobileCockpitOpen, setMobileCockpitOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "REVIEW" | "HISTORY">("ACTIVE");
  const [search, setSearch] = useState("");
  const [cockpitTab, setCockpitTab] = useState<"overview" | "chat" | "vault">("overview");
  const [uploadingVault, setUploadingVault] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [dragOverVault, setDragOverVault] = useState(false);
  const vaultInputRef = useRef<HTMLInputElement>(null);

  const reload = () => listAllOrders().then((data) => {
    setOrders(data);
    if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
  });

  useEffect(() => {
    const unsub = subscribeAllOrders((data) => {
      setOrders(data);
      setSelectedId((curr) => {
        if (curr && data.some((o) => o.id === curr)) return curr;
        return data[0]?.id ?? "";
      });
    });
    return unsub;
  }, []);

  // Active = everything not yet COMPLETED (DELIVERED still needs final sign-off).
  // History = auto-archive — the moment an order is tagged COMPLETED it lands here.
  const activeOrders = orders.filter((o) => !isOrderHistory(o));
  const reviewOrders = orders.filter((o) => ["CLIENT REVIEW", "FINAL APPROVAL"].includes(o.status));
  const historyOrders = orders
    .filter(isOrderHistory)
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));

  const filteredOrders = (filter === "HISTORY" ? historyOrders : orders).filter((o) => {
    if (filter === "ACTIVE" && isOrderHistory(o)) return false;
    if (filter === "REVIEW" && !["CLIENT REVIEW", "FINAL APPROVAL"].includes(o.status)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchId = o.id.toLowerCase().includes(q);
      const matchName = o.name.toLowerCase().includes(q);
      const matchEmail = o.email.toLowerCase().includes(q);
      const matchItem = o.items.some((i) => i.name.toLowerCase().includes(q));
      return matchId || matchName || matchEmail || matchItem;
    }
    return true;
  });

  const current = orders.find((o) => o.id === selectedId) ?? filteredOrders[0] ?? orders[0];
  const currentId = current?.id;

  // opening a chat thread marks it read for the studio (clears alert badges)
  useEffect(() => {
    if (cockpitTab === "chat" && currentId) void markThreadReadForStudio(currentId);
  }, [cockpitTab, currentId]);

  const toggleOrderSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    setSelectedOrderIds(filteredOrders.map((o) => o.id));
  };

  const clearSelection = () => {
    setSelectedOrderIds([]);
  };

  const handleBatchStatus = async (status: string) => {
    const nextStatus = status as OrderRecord["status"];
    const ok = await mutate(
      () => setOrdersStatus(selectedOrderIds, nextStatus),
      `Updated ${selectedOrderIds.length} orders to ${nextStatus}`
    );
    if (ok) {
      clearSelection();
      reload();
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedOrderIds.length;
    const ok = await mutate(
      () => deleteOrders(selectedOrderIds),
      `Deleted ${count} orders`
    );
    if (ok) {
      clearSelection();
      reload();
    }
  };

  const handleExportCsv = () => {
    const exportData = orders.filter((o) => selectedOrderIds.includes(o.id));
    exportToCsv<OrderRecord>(
      "Orders_Export",
      [
        { key: "id", header: "Order ID" },
        { key: "name", header: "Client Name" },
        { key: "email", header: "Email" },
        { key: "company", header: "Company", format: (o) => o.company || "" },
        { key: "status", header: "Status" },
        { key: "total", header: "Total Price (USD)", format: (o) => o.total || 0 },
        { key: "amountPaid", header: "Amount Paid (USD)", format: (o) => o.amountPaid || 0 },
        { key: "balanceDue", header: "Balance Due (USD)", format: (o) => o.balanceDue || 0 },
        { key: "items", header: "Items", format: (o) => o.items.map((i) => i.name).join("; ") },
        { key: "createdAt", header: "Created Date", format: (o) => o.createdAt || "" },
        { key: "completedAt", header: "Archived/Completed Date", format: (o) => o.completedAt || "" },
      ],
      exportData
    );
    toast.success(`Exported ${exportData.length} orders to CSV`);
  };

  const handleExportJson = () => {
    const exportData = orders.filter((o) => selectedOrderIds.includes(o.id));
    exportToJson("Orders_Export", exportData);
    toast.success(`Exported ${exportData.length} orders to JSON`);
  };

  const getStatusColor = (status: OrderRecord["status"]) => {
    if (["DELIVERED", "COMPLETED"].includes(status)) return "bg-emerald-500/10 text-emerald-500 border-emerald-500/30";
    if (["CLIENT REVIEW", "FINAL APPROVAL"].includes(status)) return "bg-amber-500/10 text-amber-500 border-amber-500/30";
    if (["CONCEPT", "REVISION"].includes(status)) return "bg-purple-500/10 text-purple-500 border-purple-500/30";
    return "bg-cyan-500/10 text-cyan-500 border-cyan-500/30";
  };

  const processVaultFiles = async (fileList: FileList | File[]) => {
    if (!current) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setUploadingVault(true);
    setUploadProgress({ current: 1, total: files.length, filename: files[0].name });
    try {
      const uploaded = await attachFiles(current.id, files, (curr, tot, name) => {
        setUploadProgress({ current: curr, total: tot, filename: name });
      });
      setOrders((prev) =>
        prev.map((o) =>
          o.id === current.id
            ? { ...o, files: [...(o.files || []), ...uploaded] }
            : o
        )
      );
      await postMessage(current.id, "studio", `📂 Studio added ${files.length} new deliverable file(s) to the project vault.`, "Social Kon10 Studio");
      toast.success(`${files.length} deliverable(s) attached to order.`);
      reload();
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
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverVault(false);
  };

  const advanceNextStatus = async () => {
    if (!current) return;
    const sIdx = ORDER_STATUSES.indexOf(current.status);
    if (sIdx < ORDER_STATUSES.length - 1) {
      const next = ORDER_STATUSES[sIdx + 1];
      const ok = await mutate(() => setOrderStatus(current.id, next), `Status → ${next}`);
      if (ok) {
        await postMessage(current.id, "studio", `🚀 Project status updated to: ${next}`, "Social Kon10 Studio");
        reload();
      }
    }
  };

  const isAllFilteredSelected = filteredOrders.length > 0 && filteredOrders.every((o) => selectedOrderIds.includes(o.id));

  return (
    <div className="flex flex-col gap-6 relative">
      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedOrderIds.length}
        totalCount={filteredOrders.length}
        onClearSelection={clearSelection}
        onSelectAll={selectAllFiltered}
        statusOptions={ORDER_STATUSES.map((s) => ({ label: s, value: s }))}
        onStatusChange={handleBatchStatus}
        onDelete={handleBatchDelete}
        deleteLabel="Delete Orders"
        onExportCsv={handleExportCsv}
        onExportJson={handleExportJson}
        customActions={[
          {
            label: "Mark Completed",
            icon: "✓",
            tone: "emerald",
            onClick: () => handleBatchStatus("COMPLETED"),
          },
        ]}
      />

      {/* volume + revenue summary — 2026 modern glass metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {[
          { label: "All orders", value: String(orders.length), icon: "📦", tone: "var(--ink)", sub: `${activeOrders.length} active in production` },
          { label: "Revenue collected", value: money(orders.reduce((s, o) => s + (o.amountPaid || 0), 0)), icon: "💰", tone: "rgb(16 185 129)", sub: "Verified receipts" },
          { label: "Outstanding due", value: money(orders.reduce((s, o) => s + (o.balanceDue || 0), 0)), icon: "⏳", tone: orders.some((o) => o.balanceDue > 0) ? "#f59e0b" : "var(--muted)", sub: "Due upon completion" },
          { label: "Needs action", value: String(orders.filter((o) => ["ORDER RECEIVED", "CLIENT REVIEW", "REVISION", "FINAL APPROVAL"].includes(o.status)).length), icon: "⚡", tone: orders.some((o) => ["ORDER RECEIVED", "CLIENT REVIEW", "REVISION", "FINAL APPROVAL"].includes(o.status)) ? "#ef4444" : "var(--muted)", sub: "Awaiting studio review" },
        ].map((s) => (
          <div key={s.label} className="p-3.5 sm:p-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold truncate mr-1">{s.label}</span>
              <span className="text-base sm:text-lg shrink-0">{s.icon}</span>
            </div>
            <p className="font-display text-lg sm:text-xl font-bold mt-0.5 truncate" style={{ color: s.tone }}>{s.value}</p>
            <span className="font-meta text-[8px] sm:text-[8.5px] text-[var(--muted)] mt-1 truncate">{s.sub}</span>
          </div>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5" role="tablist" aria-label="Filter orders">
          <button
            onClick={() => setFilter("ACTIVE")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
              filter === "ACTIVE" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            Active ({activeOrders.length})
          </button>
          <button
            onClick={() => setFilter("ALL")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
              filter === "ALL" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            All ({orders.length})
          </button>
          <button
            onClick={() => setFilter("REVIEW")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
              filter === "REVIEW" ? "bg-amber-500 text-black border-amber-500 font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-amber-500"
            }`}
          >
            Action ({reviewOrders.length})
          </button>
          <button
            onClick={() => setFilter("HISTORY")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
              filter === "HISTORY" ? "bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-emerald-600"
            }`}
          >
            Archive ({historyOrders.length})
          </button>

          {filteredOrders.length > 0 && (
            <label className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-meta text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer select-none ml-1 bg-[var(--panel)] border border-[var(--line)] rounded-xl">
              <input
                type="checkbox"
                checked={isAllFilteredSelected}
                onChange={(e) => {
                  if (e.target.checked) selectAllFiltered();
                  else clearSelection();
                }}
                className="w-3.5 h-3.5 accent-[var(--dept)] rounded cursor-pointer"
              />
              <span>Select all ({filteredOrders.length})</span>
            </label>
          )}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client, ID, email, item…"
          className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded-xl w-full sm:w-64"
        />
      </div>

      {/* Closed-business report — visible in the History archive */}
      {filter === "HISTORY" && <HistoryReport orders={historyOrders} />}

      {orders.length === 0 ? (
        <div className="border border-[var(--line)] p-8 sm:p-12 text-center rounded-2xl" style={{ background: "var(--panel)" }}>
          <p className="font-display text-lg sm:text-xl font-bold uppercase">No orders received yet</p>
          <p className="text-sm text-[var(--muted)] mt-2">When clients purchase or accept proposals, they will appear here.</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="border border-[var(--line)] p-8 sm:p-12 text-center rounded-2xl" style={{ background: "var(--panel)" }}>
          <p className="font-display text-lg sm:text-xl font-bold uppercase">No matching orders</p>
          <p className="text-sm text-[var(--muted)] mt-2">Try clearing your search or filter.</p>
          <button onClick={() => { setFilter("ALL"); setSearch(""); }} className="btn btn-ghost mt-4">Reset Filters</button>
        </div>
      ) : (
        /* Split-View Master-Detail Studio Cockpit */
        <div className="grid lg:grid-cols-12 gap-5 items-start">
          {/* LEFT COLUMN: Order Master List */}
          <div className={`${mobileCockpitOpen ? "hidden lg:flex" : "flex"} lg:col-span-4 flex-col gap-2.5 max-h-[750px] overflow-y-auto pr-0.5`}>
            {filteredOrders.map((o) => {
              const isSelected = current && o.id === current.id;
              const isChecked = selectedOrderIds.includes(o.id);
              const sIdx = ORDER_STATUSES.indexOf(o.status);
              const pct = Math.round(((sIdx + 1) / ORDER_STATUSES.length) * 100);
              return (
                <div
                  key={o.id}
                  onClick={() => {
                    setSelectedId(o.id);
                    setMobileCockpitOpen(true);
                  }}
                  className={`p-3.5 sm:p-4 border text-left cursor-pointer transition-all duration-150 rounded-2xl active:scale-[0.99] relative ${
                    isChecked
                      ? "border-[var(--dept)] bg-[var(--dept-soft)]/60 ring-1 ring-[var(--dept)] shadow-xs"
                      : isSelected
                      ? "border-[var(--dept)] bg-[var(--dept-soft)] ring-1 ring-[var(--dept)] shadow-sm"
                      : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--line-strong)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleOrderSelection(o.id)}
                        className="w-3.5 h-3.5 accent-[var(--dept)] rounded cursor-pointer shrink-0"
                        aria-label={`Select order ${o.id}`}
                      />
                      <span className="font-meta text-[9px] text-[var(--muted)]">
                        #ORD-{o.id.slice(0, 7).toUpperCase()}
                      </span>
                    </div>
                    <span className={`font-meta text-[8.5px] px-2 py-0.5 rounded-full border ${getStatusColor(o.status)}`}>
                      {o.status}
                    </span>
                  </div>

                  <h4 className="font-display text-xs sm:text-sm font-bold uppercase line-clamp-1 leading-snug">
                    {o.items.map((i) => i.name).join(" · ")}
                  </h4>

                  <p className="font-meta text-[9.5px] sm:text-[10px] text-[var(--muted)] mt-1 truncate flex items-center gap-1.5">
                    {orderHasUnreadClientMessage(o) && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" role="img" aria-label="Unread client message" title="Unread client message" />
                    )}
                    {o.name} {o.company ? `(${o.company})` : ""} · {o.email}
                  </p>

                  {isOrderHistory(o) && (
                    <p className="font-meta text-[9px] text-emerald-600 mt-1">
                      ✓ Archived {o.completedAt ? new Date(o.completedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}
                    </p>
                  )}

                  <div className="mt-2.5 flex items-center justify-between text-[10px] sm:text-[11px] font-meta text-[var(--muted)]">
                    <span>Step {sIdx + 1}/8 · {pct}%</span>
                    <span className="font-semibold text-[var(--ink)]">
                      {o.balanceDue > 0 ? (
                        <span className="text-amber-600">Balance {money(o.balanceDue)}</span>
                      ) : (
                        <span className="dept-accent">Paid {money(o.amountPaid)}</span>
                      )}
                    </span>
                  </div>

                  {/* Micro progress bar */}
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

          {/* RIGHT COLUMN: Interactive Studio Operations Cockpit */}
          {current && (
            <div className={`${!mobileCockpitOpen ? "hidden lg:block" : "block"} lg:col-span-8 border border-[var(--line-strong)] bg-[var(--panel)] rounded-2xl overflow-hidden shadow-sm`}>
              {/* Mobile Back to List Button Bar */}
              <div className="lg:hidden p-3 bg-[var(--bg)] border-b border-[var(--line)] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMobileCockpitOpen(false)}
                  className="flex items-center gap-1.5 font-meta text-[10px] font-bold dept-accent hover:underline py-1 px-3 rounded-xl bg-[var(--dept-soft)] border border-[var(--dept)]/30 active:scale-95 transition-transform"
                >
                  <span>←</span>
                  <span>Back to Orders List</span>
                </button>
                <span className="font-meta text-[9px] text-[var(--muted)]">#ORD-{current.id.slice(0, 7).toUpperCase()}</span>
              </div>

              {/* Cockpit Header */}
              <div className="p-4 sm:p-6 border-b border-[var(--line)] bg-[var(--bg)] flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="idx">/studio-operations</span>
                    <span className="font-meta text-[10px] text-[var(--muted)]">· #ORD-{current.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <h2 className="font-display text-lg sm:text-xl font-bold uppercase truncate">
                    {current.items.map((i) => i.name).join(" · ")}
                  </h2>
                  <p className="font-meta text-[10px] text-[var(--muted)] mt-1 truncate">
                    Client: <strong className="text-[var(--ink)]">{current.name}</strong> ({current.email}) {current.company ? `· ${current.company}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <label htmlFor="admin-order-status-select" className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold">Status:</label>
                    <select
                      id="admin-order-status-select"
                      aria-label="Order status"
                      value={current.status}
                      onChange={async (e) => {
                        const next = e.target.value as OrderRecord["status"];
                        const ok = await mutate(() => setOrderStatus(current.id, next), `Status → ${next}`);
                        if (ok) {
                          await postMessage(current.id, "studio", `🚀 Project status updated to: ${next}`, "Social Kon10 Studio");
                          reload();
                        }
                      }}
                      className={`${inputCls} !w-auto !py-1.5 font-meta text-[10px] font-bold rounded-xl`}
                    >
                      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <RemoveButton onRemove={() => deleteOrder(current.id)} onDone={reload} />
                </div>
              </div>

              {/* Visual Milestone Progress Tracker & Step Advancer */}
              <div className="px-4 sm:px-6 py-3.5 border-b border-[var(--line)] bg-[var(--dept-soft)]/50">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <span className="font-meta text-[9.5px] sm:text-[10px] uppercase font-bold text-[var(--dept)] tracking-wider truncate">
                    Phase {ORDER_STATUSES.indexOf(current.status) + 1} of 8: {current.status}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-meta text-[10px] text-[var(--muted)]">
                      {Math.round(((ORDER_STATUSES.indexOf(current.status) + 1) / ORDER_STATUSES.length) * 100)}%
                    </span>
                    {ORDER_STATUSES.indexOf(current.status) < ORDER_STATUSES.length - 1 && (
                      <button
                        onClick={advanceNextStatus}
                        className="btn btn-dept !py-1 !px-2.5 font-meta text-[9px] rounded-lg"
                      >
                        Advance →
                      </button>
                    )}
                  </div>
                </div>

                <div className="w-full bg-[var(--line)] h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${Math.round(((ORDER_STATUSES.indexOf(current.status) + 1) / ORDER_STATUSES.length) * 100)}%`,
                      background: current.status === "COMPLETED" ? "rgb(16 185 129)" : "var(--dept)",
                    }}
                  />
                </div>
              </div>

              {/* Responsive Segmented Sub-Tabs Navigation */}
              <div className="grid grid-cols-3 border-b border-[var(--line)] bg-[var(--bg)] p-1.5 gap-1" role="tablist">
                <button
                  onClick={() => setCockpitTab("overview")}
                  className={`font-meta text-[9px] sm:text-[10px] uppercase py-2.5 px-2 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1 ${
                    cockpitTab === "overview" ? "bg-[var(--dept)] text-[var(--on-dept)] shadow-xs" : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel)]"
                  }`}
                >
                  <span>📌</span>
                  <span className="truncate">Scope &amp; Balance</span>
                </button>
                <button
                  onClick={() => setCockpitTab("chat")}
                  className={`relative font-meta text-[9px] sm:text-[10px] uppercase py-2.5 px-2 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1 ${
                    cockpitTab === "chat" ? "bg-[var(--dept)] text-[var(--on-dept)] shadow-xs" : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel)]"
                  }`}
                >
                  <span>💬</span>
                  <span className="truncate">Client Chat</span>
                  {current && orderHasUnreadClientMessage(current) && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-0.5" role="img" aria-label="Unread" />
                  )}
                </button>
                <button
                  onClick={() => setCockpitTab("vault")}
                  className={`font-meta text-[9px] sm:text-[10px] uppercase py-2.5 px-2 rounded-xl font-bold transition-all text-center flex items-center justify-center gap-1 ${
                    cockpitTab === "vault" ? "bg-[var(--dept)] text-[var(--on-dept)] shadow-xs" : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel)]"
                  }`}
                >
                  <span>📂</span>
                  <span className="truncate">Vault ({current.files.length})</span>
                </button>
              </div>

              {/* Sub-Tab Content */}
              <div className="p-4 sm:p-6">
                {/* TAB 1: Client, Scope & Financials */}
                {cockpitTab === "overview" && (
                  <div className="flex flex-col gap-6">
                    {/* Studio Vector Workspace & Canvas */}
                    <OrderStudioWorkspace order={current} onReload={reload} />

                    {/* Client Intake & Contact */}
                    <div>
                      <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-2">Client Details &amp; Brief</h4>
                      <div className="border border-[var(--line)] p-4 rounded-xl bg-[var(--bg)] space-y-2 text-xs">
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <span className="font-meta text-[9px] text-[var(--muted)] block">Contact Name</span>
                            <p className="font-bold">{current.name}</p>
                          </div>
                          <div>
                            <span className="font-meta text-[9px] text-[var(--muted)] block">Email</span>
                            <a href={`mailto:${current.email}`} className="dept-accent hover:underline">{current.email}</a>
                          </div>
                        </div>
                        {current.company && (
                          <div>
                            <span className="font-meta text-[9px] text-[var(--muted)] block">Company / Brand</span>
                            <p>{current.company}</p>
                          </div>
                        )}
                        {current.details?.goals && (
                          <div className="pt-2 border-t border-[var(--line)]">
                            <span className="font-meta text-[9px] text-[var(--muted)] block mb-1">Project Goals &amp; Intake Notes</span>
                            <p className="p-3 bg-[var(--panel)] border border-[var(--line)] rounded text-[12px] whitespace-pre-wrap leading-relaxed">
                              {current.details.goals}
                            </p>
                          </div>
                        )}

                        {/* First-Party Marketing Attribution */}
                        {Boolean((current as any).first_touch_source || (current as any).utm_source) && (
                          <div className="pt-2 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[var(--dept)]/10 text-[var(--dept)] border border-[var(--dept)]/30 font-meta">
                              <span>🎯 Acquired via {(current as any).first_touch_source || (current as any).utm_source}</span>
                              {((current as any).first_touch_campaign || (current as any).utm_campaign) && (
                                <span>· "{((current as any).first_touch_campaign || (current as any).utm_campaign)}"</span>
                              )}
                            </span>
                            {(current as any).session_id && (
                              <span className="font-meta text-[9px] text-[var(--muted)] font-mono">
                                Session: #{(current as any).session_id.slice(0, 10)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Scope of Work */}
                    <div>
                      <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-2">Scope of Work</h4>
                      <div className="border border-[var(--line)] rounded-xl divide-y divide-[var(--line)] bg-[var(--bg)]">
                        {current.items.map((it, idx) => (
                          <div key={idx} className="p-3.5 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold font-display uppercase">
                                {it.name} {it.rush ? <span className="text-amber-500 font-meta text-[9px]">(Rush)</span> : ""}
                              </p>
                              {Boolean((it as any).variantLabel || it.tierLabel) && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  {(it as any).variantLabel && (
                                    <span className="font-meta text-[8.5px] px-2 py-0.5 rounded-full bg-[var(--dept)]/10 text-[var(--dept)] border border-[var(--dept)]/30 font-semibold">
                                      {(it as any).variantLabel}
                                    </span>
                                  )}
                                  {it.tierLabel && (
                                    <span className="font-meta text-[8.5px] text-[var(--muted)]">
                                      {it.tierLabel} Tier
                                    </span>
                                  )}
                                </div>
                              )}
                              {it.addons.length > 0 && (
                                <p className="font-meta text-[9px] dept-accent mt-0.5">
                                  Add-ons: {it.addons.map((a) => a.name).join(" · ")}
                                </p>
                              )}
                            </div>
                            <span className="font-display font-bold">{money(it.unitPrice)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Financial Summary & Payment Recording */}
                    <div>
                      <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-2">Financials &amp; Balance</h4>
                      <div className="border border-[var(--line)] p-4 rounded-xl bg-[var(--bg)] space-y-2 text-xs">
                        <div className="flex justify-between text-[var(--muted)]">
                          <span>Total Engagement</span>
                          <span className="font-bold text-[var(--ink)]">{money(current.total)}</span>
                        </div>
                        {current.discount > 0 && (
                          <div className="flex justify-between text-emerald-600">
                            <span>Discount {current.promo ? `(${current.promo})` : ""}</span>
                            <span>−{money(current.discount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-[var(--muted)]">
                          <span>Amount Received</span>
                          <span className="text-emerald-600 font-bold">{money(current.amountPaid)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-[var(--line)]">
                          <div>
                            <span className="font-bold">Remaining Balance</span>
                            <p className="font-meta text-[9px] text-[var(--muted)]">Due upon deliverable completion</p>
                          </div>
                          <span className="font-display text-base font-bold text-[var(--ink)]">
                            {current.balanceDue > 0 ? money(current.balanceDue) : "PAID IN FULL"}
                          </span>
                        </div>

                        <RecordPayment order={current} onDone={reload} />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Studio / Client Chat */}
                {cockpitTab === "chat" && (
                  <div>
                    <MessageThread orderId={current.id} from="studio" author="Social Kon10" />
                  </div>
                )}

                {/* TAB 3: Deliverables Vault & Upload Engine */}
                {cockpitTab === "vault" && (
                  <div
                    className="relative"
                    onDragOver={handleVaultDragOver}
                    onDragEnter={handleVaultDragOver}
                    onDragLeave={handleVaultDragLeave}
                    onDrop={handleVaultDrop}
                  >
                    {/* Full-Tab Drop Overlay */}
                    {dragOverVault && (
                      <div className="absolute inset-0 z-30 bg-[var(--dept)]/15 backdrop-blur-sm border-2 border-dashed border-[var(--dept)] rounded-xl flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-150">
                        <span className="text-4xl mb-2 animate-bounce">📥</span>
                        <p className="font-display text-sm font-bold uppercase text-[var(--dept)]">
                          Drop deliverables to upload to order
                        </p>
                        <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
                          Proofs, vector packages, exported PDFs, PSD/AI masters
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider">
                          Deliverables &amp; Assets
                        </h4>
                        <p className="text-xs text-[var(--muted)] mt-0.5">
                          Upload proofs or final master files for the client to review and download.
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
                          className="btn btn-dept !py-1.5 !px-3 font-meta text-[10px]"
                        >
                          {uploadingVault ? "Uploading…" : "+ Upload Deliverable"}
                        </button>
                      </div>
                    </div>

                    {/* Animated Upload Spinner & Live Progress Card */}
                    {uploadingVault && (
                      <div className="mb-5 p-4 border border-[var(--dept)] bg-[var(--dept-soft)] rounded-xl flex items-center justify-between gap-4 animate-in fade-in">
                        <div className="flex items-center gap-3">
                          <svg
                            className="animate-spin h-6 w-6 text-[var(--dept)] shrink-0"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          <div>
                            <p className="font-display text-xs font-bold uppercase text-[var(--dept)]">
                              Uploading Deliverables… {uploadProgress ? `(${uploadProgress.current} of ${uploadProgress.total})` : ""}
                            </p>
                            <p className="font-meta text-[10px] text-[var(--muted)] truncate max-w-xs sm:max-w-md mt-0.5">
                              {uploadProgress?.filename ? uploadProgress.filename : "Storing asset in Cloud Storage…"}
                            </p>
                          </div>
                        </div>
                        <span className="font-meta text-[9px] px-2 py-1 bg-[var(--bg)] border border-[var(--dept)]/40 rounded dept-accent shrink-0 animate-pulse">
                          Uploading
                        </span>
                      </div>
                    )}

                    {/* Interactive Dropzone */}
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
                          {uploadingVault ? "Uploading to vault…" : "Drag & drop deliverable files here, or click to browse"}
                        </p>
                        <p className="font-meta text-[9px] text-[var(--muted)]">
                          Supports PNG, JPG, WebP, SVG, PDF, AI, PSD, EPS, ZIP up to 25MB each
                        </p>
                      </div>
                    </div>

                    {current.files.length === 0 ? (
                      <div className="p-8 border border-dashed border-[var(--line)] text-center rounded-lg">
                        <span className="text-3xl block mb-2">📂</span>
                        <p className="font-display text-xs font-bold uppercase">No files attached to this order</p>
                        <p className="font-meta text-[10px] text-[var(--muted)] mt-1 max-w-xs mx-auto">
                          Upload design proofs or final files above so the client can access them in their portal.
                        </p>
                      </div>
                    ) : (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {current.files.map((file, i) => (
                          <AdminDeliverableItem key={`${file.name}-${i}`} file={file} orderId={current.id} onDelete={reload} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================= LEADS ================= */

/** PRD §70 — convert a quote/consultation lead into a payable proposal. */
function ConvertLead({ lead, onDone }: { lead: LeadRecord; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState(lead.service ? `Custom ${lead.service}` : "Custom project");
  const [busy, setBusy] = useState(false);

  if (lead.status === "converted") return <span className="font-meta text-[9px] dept-accent">CONVERTED → ORDER</span>;
  if (!open) return <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors" onClick={() => setOpen(true)}>Convert to proposal →</button>;

  return (
    <div className="flex flex-col gap-2">
      <input className={`${inputCls} !py-1.5`} placeholder="Proposal title" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <input className={`${inputCls} !py-1.5`} type="number" min="1" placeholder="Amount USD" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn btn-dept !py-1.5 !px-3 font-meta text-[10px]" disabled={busy || !Number(amount)}
          onClick={async () => {
            setBusy(true);
            const okDone = await mutate(() => convertLeadToOrder(lead, Number(amount), desc), "Proposal created — client can pay in their portal");
            setBusy(false);
            if (okDone) onDone();
          }}>
          {busy ? "Creating…" : "Create payable order"}
        </button>
        <button className="font-meta text-[10px] text-[var(--muted)]" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="font-meta text-[8.5px] text-[var(--muted)]">Client sees it in their portal and pays the deposit to accept.</p>
    </div>
  );
}

function Leads() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<"ALL" | "new" | "contacted" | "converted" | "closed">("ALL");
  const [leadJourneySession, setLeadJourneySession] = useState<{ id: string; events: AnalyticsEvent[]; loading: boolean } | null>(null);

  const openLeadJourney = async (sessionId: string) => {
    setLeadJourneySession({ id: sessionId, events: [], loading: true });
    const evs = await getSessionEvents(sessionId);
    setLeadJourneySession({ id: sessionId, events: evs, loading: false });
  };

  const reload = () => listLeads().then(setLeads);
  useEffect(() => {
    const unsub = subscribeLeads(setLeads);
    return unsub;
  }, []);

  const filteredLeads = leads.filter((l) => {
    if (filter !== "ALL" && l.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = l.name.toLowerCase().includes(q);
      const matchEmail = l.email.toLowerCase().includes(q);
      const matchIntent = (l.intent || "").toLowerCase().includes(q);
      const matchMsg = (l.message || "").toLowerCase().includes(q);
      const matchService = (l.service || "").toLowerCase().includes(q);
      return matchName || matchEmail || matchIntent || matchMsg || matchService;
    }
    return true;
  });

  const toggleLeadSelection = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    setSelectedLeadIds(filteredLeads.map((l) => l.id));
  };

  const clearSelection = () => {
    setSelectedLeadIds([]);
  };

  const handleBatchStatus = async (status: string) => {
    const nextStatus = status as LeadRecord["status"];
    const ok = await mutate(
      () => setLeadsStatus(selectedLeadIds, nextStatus),
      `Updated ${selectedLeadIds.length} leads to ${nextStatus}`
    );
    if (ok) {
      clearSelection();
      reload();
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedLeadIds.length;
    const ok = await mutate(
      () => deleteLeads(selectedLeadIds),
      `Deleted ${count} leads`
    );
    if (ok) {
      clearSelection();
      reload();
    }
  };

  const handleExportCsv = () => {
    const exportData = leads.filter((l) => selectedLeadIds.includes(l.id));
    exportToCsv<LeadRecord>(
      "Leads_Export",
      [
        { key: "id", header: "Lead ID" },
        { key: "name", header: "Name" },
        { key: "email", header: "Email" },
        { key: "intent", header: "Intent" },
        { key: "status", header: "Status" },
        { key: "dept", header: "Department", format: (l) => l.dept || "" },
        { key: "service", header: "Service", format: (l) => l.service || "" },
        { key: "budget", header: "Budget", format: (l) => l.budget || "" },
        { key: "timeline", header: "Timeline", format: (l) => l.timeline || "" },
        { key: "message", header: "Message", format: (l) => l.message || "" },
        { key: "createdAt", header: "Received Date", format: (l) => l.createdAt || "" },
      ],
      exportData
    );
    toast.success(`Exported ${exportData.length} leads to CSV`);
  };

  const handleExportJson = () => {
    const exportData = leads.filter((l) => selectedLeadIds.includes(l.id));
    exportToJson("Leads_Export", exportData);
    toast.success(`Exported ${exportData.length} leads to JSON`);
  };

  return (
    <div className="space-y-6">
      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedLeadIds.length}
        totalCount={filteredLeads.length}
        onSelectAll={selectAllFiltered}
        onClearSelection={clearSelection}
        onExportCsv={handleExportCsv}
        onExportJson={handleExportJson}
        onDelete={handleBatchDelete}
        deleteLabel="Delete Leads"
        statusOptions={[
          { label: "NEW", value: "new" },
          { label: "CONTACTED", value: "contacted" },
          { label: "CONVERTED", value: "converted" },
          { label: "CLOSED", value: "closed" },
        ]}
        onStatusChange={handleBatchStatus}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {(["ALL", "new", "contacted", "converted", "closed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all ${
                filter === s
                  ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-bold shadow-xs"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--dept)] hover:text-[var(--ink)]"
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search leads by name, email, service..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded-xl w-full sm:w-64"
        />
      </div>

      {leads.length === 0 ? (
        <div className="border border-[var(--line)] p-8 sm:p-12 text-center rounded-2xl" style={{ background: "var(--panel)" }}>
          <p className="font-display text-lg sm:text-xl font-bold uppercase">No leads yet</p>
          <p className="text-sm text-[var(--muted)] mt-2">Quote requests, consultations and client questions land here.</p>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="border border-[var(--line)] p-8 sm:p-12 text-center rounded-2xl" style={{ background: "var(--panel)" }}>
          <p className="font-display text-lg sm:text-xl font-bold uppercase">No matching leads</p>
          <p className="text-sm text-[var(--muted)] mt-2">Try clearing your search or filter.</p>
          <button onClick={() => { setFilter("ALL"); setSearch(""); }} className="btn btn-ghost mt-4">Reset Filters</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredLeads.map((l) => {
            const isChecked = selectedLeadIds.includes(l.id);
            const attribution = (l as any).first_touch_source || (l as any).utm_source;
            const campaign = (l as any).first_touch_campaign || (l as any).utm_campaign;
            const sessionId = (l as any).session_id;

            return (
              <div
                key={l.id}
                className={`border px-5 py-4 grid md:grid-cols-[40px_120px_1fr_180px_200px] gap-4 items-start rounded-2xl transition-all ${
                  isChecked ? "border-[var(--dept)] bg-[var(--dept-soft)]/60 ring-1 ring-[var(--dept)] shadow-xs" : "border-[var(--line)] bg-[var(--panel)]"
                }`}
              >
                <div className="pt-0.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleLeadSelection(l.id)}
                    className="w-3.5 h-3.5 accent-[var(--dept)] rounded cursor-pointer"
                    aria-label={`Select lead ${l.name}`}
                  />
                </div>
                <span className="font-meta text-[10px] dept-accent uppercase font-bold">{l.intent}</span>
                <div className="text-sm">
                  <p className="font-medium">{l.name} <span className="text-[var(--muted)] font-normal">· {l.email}</span></p>
                  <p className="text-[13px] text-[var(--muted)] mt-1">{l.message}</p>
                  <p className="font-meta text-[9px] text-[var(--muted)] mt-2">
                    {[l.dept, l.service, l.budget, l.timeline, l.date && `${l.date} ${l.time ?? ""}`].filter(Boolean).join(" · ") || "—"}
                  </p>

                  {/* Direct CRM Attribution Linkage */}
                  {attribution && (
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-wider bg-[var(--dept)]/10 text-[var(--dept)] border border-[var(--dept)]/30 font-meta">
                        <span>🎯 Acquired via {attribution}</span>
                        {campaign && <span>· "{campaign}"</span>}
                      </span>
                      {sessionId && (
                        <button
                          type="button"
                          onClick={() => openLeadJourney(sessionId)}
                          className="font-meta text-[9px] text-[var(--muted)] hover:text-[var(--ink)] underline cursor-pointer"
                        >
                          Inspect Visitor Journey 🔍
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-3"><ConvertLead lead={l} onDone={reload} /></div>
                </div>
                <span className="font-meta text-[9px] text-[var(--muted)]">{l.createdAt ? new Date(l.createdAt).toLocaleDateString() : ""}</span>
                <div className="flex flex-col gap-2">
                  <select
                    value={l.status}
                    onChange={async (e) => {
                      const okDone = await mutate(() => setLeadStatus(l.id, e.target.value as LeadRecord["status"]), "Lead updated");
                      if (okDone) reload();
                    }}
                    className={`${inputCls} !py-1.5 font-meta text-[10px] rounded-xl`}
                    aria-label="Lead status"
                  >
                    {["new", "contacted", "converted", "closed"].map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                  </select>
                  <div className="self-end">
                    <RemoveButton onRemove={() => deleteLead(l.id)} onDone={reload} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lead Journey Inspection Modal */}
      {leadJourneySession && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto border border-[var(--line-strong)] rounded-2xl p-6 shadow-2xl space-y-4"
            style={{ background: "var(--panel)", color: "var(--ink)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3">
              <div>
                <h3 className="font-display text-sm font-bold uppercase tracking-tight">Lead Session History</h3>
                <p className="font-meta text-[9px] text-[var(--muted)] mt-0.5">Session #{leadJourneySession.id.slice(0, 12)}</p>
              </div>
              <button
                type="button"
                onClick={() => setLeadJourneySession(null)}
                className="btn btn-ghost !py-1 !px-2 text-xs rounded-xl"
              >
                ✕ Close
              </button>
            </div>

            {leadJourneySession.loading ? (
              <p className="font-meta text-[10px] text-[var(--muted)] py-8 text-center animate-pulse">Loading journey events…</p>
            ) : leadJourneySession.events.length === 0 ? (
              <p className="font-meta text-[10px] text-[var(--muted)] py-6 text-center">No individual page events recorded for this session.</p>
            ) : (
              <div className="space-y-2 relative border-l border-[var(--line)] ml-3 pl-4">
                {leadJourneySession.events.map((ev, idx) => (
                  <div key={`${ev.event_name}-${idx}`} className="relative font-meta text-[10px]">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[var(--dept)]" />
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold uppercase text-[var(--ink)]">{ev.event_name.replace("_", " ")}</span>
                      <span className="text-[8.5px] text-[var(--muted)]">
                        {new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                    <code className="text-[8.5px] text-[var(--muted)] block mt-0.5">{ev.path}</code>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= CLIENT INTAKES (website briefs + signed agreements) ================= */

const LEAD_BADGE: Record<string, string> = {
  "Enterprise / Priority": "#7c3aed",
  "High Value": "#059669",
  "Standard": "#2563eb",
  "Low Priority": "#6b7280",
};

function IntakeAssetLink({ asset }: { asset: IntakeRecord["assets"][number] }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (asset.path) getFileUrl(asset.path).then(setUrl); }, [asset.path]);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="font-meta text-[10px] dept-accent u-line">{asset.name} ({(asset.size / 1024 / 1024).toFixed(1)}MB)</a>
  ) : (
    <span className="font-meta text-[10px] text-[var(--muted)]">{asset.name} ({(asset.size / 1024 / 1024).toFixed(1)}MB)</span>
  );
}

/** Convert a signed brief into a payable proposal order (spec: final quote requires admin approval). */
/** Closed-business report for the History archive — totals + per-month breakdown. */
function HistoryReport({ orders }: { orders: OrderRecord[] }) {
  const revenue = orders.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const outstanding = orders.reduce((s, o) => s + Math.max(0, o.balanceDue || 0), 0);
  const avg = orders.length ? revenue / orders.length : 0;

  // Last 6 calendar months (including empty ones) — grouped by completion date
  const months: { key: string; label: string; count: number; revenue: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString(undefined, { month: "short" }),
      count: 0,
      revenue: 0,
    });
  }
  for (const o of orders) {
    const d = new Date(o.completedAt ?? o.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = months.find((m) => m.key === key);
    if (bucket) { bucket.count++; bucket.revenue += o.amountPaid || 0; }
  }
  const money = useMoney();
  const maxRev = Math.max(...months.map((m) => m.revenue), 1);

  return (
    <div className="mb-6 border border-emerald-600/30 bg-emerald-500/5 rounded-2xl p-5 md:p-6" aria-label="Closed business report">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="idx">/closed-business</span>
          <p className="font-display text-2xl font-bold mt-1">{money(revenue)}</p>
          <p className="font-meta text-[9px] text-[var(--muted)] mt-0.5">
            collected across {orders.length} completed order{orders.length === 1 ? "" : "s"} · avg {money(Math.round(avg))}
            {outstanding > 0 && <span className="text-amber-600"> · {money(outstanding)} still outstanding</span>}
          </p>
        </div>
        <div className="flex items-end gap-3" role="img" aria-label="Monthly completed revenue, last 6 months">
          {months.map((m) => (
            <div key={m.key} className="flex flex-col items-center gap-1 w-12" title={`${m.label}: ${money(m.revenue)} across ${m.count} order(s)`}>
              <span className="font-meta text-[8px] text-[var(--muted)]">{m.revenue > 0 ? money(m.revenue) : ""}</span>
              <div className="w-6 bg-emerald-600/15 rounded-sm flex items-end" style={{ height: 56 }}>
                <div className="w-full bg-emerald-600 rounded-sm transition-all" style={{ height: `${Math.max(m.revenue > 0 ? 6 : 0, (m.revenue / maxRev) * 100)}%` }} />
              </div>
              <span className="font-meta text-[9px] text-[var(--muted)]">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProposalButton({ intake, onDone }: { intake: IntakeRecord; onDone: () => void }) {
  const money = useMoney();
  const addonsTotal = intake.selectedAddons.reduce((s, id) => s + (INTAKE_ADDONS.find((a) => a.id === id)?.price ?? 0), 0);
  const isAddonOnly = !!intake.orderId; // package already paid → bill only the extras
  // scope-shift: client chose a higher tier in the brief — the difference is part of the proposal
  const shiftDiff = intake.scopeShift?.direction === "upgrade" ? intake.scopeShift.difference : 0;
  const defaultAmount = isAddonOnly ? addonsTotal + shiftDiff : (intake.estimate?.oneTime ?? 0);
  const monthly = intake.estimate?.monthly ?? 0;
  const [amount, setAmount] = useState(String(defaultAmount));
  const [busy, setBusy] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);

  if (sentId) {
    return (
      <p className="mt-4 border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 px-4 py-3 font-meta text-[10px] rounded-xl">
        ✓ PROPOSAL SENT — order #ORD-{sentId.slice(0, 7).toUpperCase()} is now payable in the client's portal. Status → QUOTED.
      </p>
    );
  }
  if (isAddonOnly && addonsTotal === 0 && shiftDiff === 0 && intake.status !== "quoted") {
    return (
      <p className="mt-4 font-meta text-[9px] text-[var(--muted)]">
        Package already paid via linked order — no add-ons selected, nothing further to bill.
      </p>
    );
  }

  const send = async () => {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) { toast.error("Enter a valid proposal amount."); return; }
    setBusy(true);
    try {
      const shiftLabel = shiftDiff > 0 && intake.scopeShift
        ? `Scope upgrade ${intake.scopeShift.paidPackageName} → ${intake.scopeShift.requiredPackageName} (${money(shiftDiff)})`
        : null;
      const desc = isAddonOnly
        ? [shiftLabel, addonsTotal > 0 ? `Add-ons per signed brief (${money(addonsTotal)})` : null].filter(Boolean).join(" + ") + ` — ${intake.packageName}`
        : `Website project per signed brief — ${intake.packageName}`;
      const oid = await createOrder({
        email: intake.email,
        name: String(intake.answers?.contact_name ?? ""),
        company: String(intake.answers?.business_name ?? ""),
        items: [{ name: desc, serviceSlug: intake.packageSlug, unitPrice: amt, addons: [], rush: false, billing: "one_time" }],
        subtotal: amt, discount: 0, total: amt,
        payMode: "deposit", amountPaid: 0, balanceDue: amt,
        promo: null,
        details: {
          source: `intake:${intake.id}`,
          ...(intake.orderId ? { linkedOrder: intake.orderId } : {}),
          ...(monthly > 0 ? { recurring: `${money(monthly)}/mo recurring services selected — set up at kickoff` } : {}),
        },
        files: [],
      }, null);
      await setIntakeStatus(intake.id, "quoted");
      void sendEmail(proposalEmail({
        to: intake.email,
        name: String(intake.answers?.contact_name ?? ""),
        description: desc,
        amount: amt,
        orderId: oid,
        portalUrl: `${window.location.origin}/client`,
      }));
      toast.success("Proposal sent — now payable in the client's portal.");
      setSentId(oid);
      onDone();
    } catch (err) {
      console.warn("Proposal order failed:", err);
      toast.error("Failed to create the proposal order.");
    }
    setBusy(false);
  };

  return (
    <div className="mt-4 border border-[var(--line)] p-4 rounded-xl">
      <span className={labelCls}>FINAL PROPOSAL — admin-approved quote</span>
      <p className="font-meta text-[9px] text-[var(--muted)] mt-1">
        {isAddonOnly
          ? shiftDiff > 0
            ? `Client paid the package — this bills the scope-upgrade difference (${money(shiftDiff)})${addonsTotal > 0 ? ` + selected add-ons (${money(addonsTotal)})` : ""}.`
            : "Client already paid the package — this bills the selected add-ons only."
          : "No payment linked yet — this bills the full project estimate."}
        {monthly > 0 && ` Recurring (${money(monthly)}/mo) is noted on the order, not charged here.`}
      </p>
      <div className="flex items-end gap-3 mt-3">
        <div className="grow">
          <label className={labelCls} htmlFor={`prop-amt-${intake.id}`}>Amount (USD)</label>
          <input id={`prop-amt-${intake.id}`} type="number" min="0" className={inputCls}
            value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button className="btn btn-dept !py-2.5 whitespace-nowrap" disabled={busy} onClick={() => void send()}>
          {busy ? "Sending…" : "Send proposal"} <span className="btn-arrow" aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}

function IntakeDetail({ intake, onDone }: { intake: IntakeRecord; onDone: () => void }) {
  const money = useMoney();
  const pkg = intakePackageFor(intake.packageSlug);
  const a = intake.answers ?? {};
  const colors = Array.isArray(a.brand_colors_hex) ? (a.brand_colors_hex as string[]) : [];

  // internal brief: required-but-empty answers = missing info flags
  const missing = intakeSteps(pkg)
    .flatMap((s) => s.fields)
    .filter((f) => f.required && fieldVisible(f, a))
    .filter((f) => {
      const v = a[f.id];
      return Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();
    })
    .map((f) => f.label);

  const answerRow = (label: string, key: string) => {
    const v = a[key];
    const text = Array.isArray(v) ? v.join(", ") : String(v ?? "").trim();
    if (!text) return null;
    return (
      <div className="grid sm:grid-cols-[180px_1fr] gap-1 py-1.5 border-b border-[var(--line)] last:border-0">
        <span className="font-meta text-[9px] text-[var(--muted)] uppercase">{label}</span>
        <span className="text-[13px]">{text}</span>
      </div>
    );
  };

  const pickedAddons = intake.selectedAddons.map((id) => INTAKE_ADDONS.find((x) => x.id === id)).filter(Boolean);
  const pickedRecurring = intake.selectedRecurring.map((id) => RECURRING_SERVICES.find((x) => x.id === id)).filter(Boolean);

  return (
    <div className="grid lg:grid-cols-2 gap-6 mt-4 pt-4 border-t border-[var(--line)]">
      <div>
        <span className={labelCls}>CONTACT &amp; BUSINESS</span>
        <div className="border border-[var(--line)] px-4 py-2 mt-1 rounded-xl">
          {answerRow("Business", "business_name")}
          {answerRow("Contact", "contact_name")}
          {answerRow("Email", "email")}
          {answerRow("Phone / WhatsApp", "phone")}
          {answerRow("Industry", "industry")}
          {answerRow("About", "business_description")}
          {answerRow("Current site", "existing_website")}
          {answerRow("Socials", "socials")}
        </div>

        <span className={`${labelCls} mt-5`}>PROJECT</span>
        <div className="border border-[var(--line)] px-4 py-2 mt-1 rounded-xl">
          {answerRow("Type", "website_type")}
          {answerRow("Main goal", "primary_goal")}
          {answerRow("#1 visitor action", "visitor_action")}
          {answerRow("Target audience", "target_audience")}
          {answerRow("Pages", "pages_needed")}
          {answerRow("Products", "product_count")}
          {answerRow("Selling", "product_options")}
          {answerRow("Shipping", "shipping")}
          {answerRow("Payment methods", "payment_methods")}
          {answerRow("Booking", "booking_type")}
          {answerRow("User roles", "user_roles")}
          {answerRow("Integrations", "integrations")}
          {answerRow("Timeline", "timeline")}
          {answerRow("Budget", "budget")}
        </div>

        <span className={`${labelCls} mt-5`}>DESIGN DIRECTION</span>
        <div className="border border-[var(--line)] px-4 py-2 mt-1 rounded-xl">
          {answerRow("Style", "style_direction")}
          {answerRow("Brand colours", "brand_colors")}
          {colors.length > 0 && (
            <div className="grid sm:grid-cols-[180px_1fr] gap-1 py-1.5 border-b border-[var(--line)]">
              <span className="font-meta text-[9px] text-[var(--muted)] uppercase">Picked palette</span>
              <span className="flex items-center gap-2 flex-wrap">
                {colors.map((c) => (
                  <span key={c} className="flex items-center gap-1">
                    <span className="w-4 h-4 inline-block border border-black/10 rounded" style={{ background: c }} />
                    <span className="font-meta text-[9px]">{c}</span>
                  </span>
                ))}
              </span>
            </div>
          )}
          {answerRow("Inspiration", "inspiration_sites")}
          {answerRow("Avoid", "dislikes")}
          {answerRow("Logo status", "logo_status")}
          {answerRow("Content readiness", "content_ready")}
        </div>
      </div>

      <div>
        <span className={labelCls}>SCOPE &amp; COMMERCIAL</span>
        <div className="border border-[var(--line)] p-4 mt-1 rounded-xl" style={{ background: "var(--panel)" }}>
          <div className="flex justify-between text-sm"><span className="text-[var(--muted)]">Estimated one-time</span><span className="font-display font-bold">{money(intake.estimate?.oneTime ?? 0)}</span></div>
          {(intake.estimate?.monthly ?? 0) > 0 && (
            <div className="flex justify-between text-sm mt-1"><span className="text-[var(--muted)]">Recurring</span><span className="font-display font-bold">{money(intake.estimate!.monthly)}/mo</span></div>
          )}
          {intake.scopeShift && (
            <div className={`mt-2 border px-3 py-2 rounded-lg ${intake.scopeShift.direction === "upgrade" ? "border-amber-500/50 bg-amber-500/10" : "border-[var(--line-strong)]"}`} data-admin-shift={intake.scopeShift.direction}>
              <p className={`font-meta text-[9px] font-bold ${intake.scopeShift.direction === "upgrade" ? "text-amber-700 dark:text-amber-300" : ""}`}>
                {intake.scopeShift.direction === "upgrade" ? "⚠ SCOPE SHIFT — UPGRADE" : intake.scopeShift.direction === "downgrade" ? "⚠ SCOPE SHIFT — DOWNGRADE (REVIEW CREDIT/VALUE)" : "CUSTOM-QUOTE SCOPE"}
              </p>
              <p className="font-meta text-[10px] mt-1">
                {intake.scopeShift.paidPackageName} (paid {money(intake.scopeShift.paidBase)}) → {intake.scopeShift.requiredPackageName}
                {intake.scopeShift.direction === "upgrade" && <> · difference <strong>{money(intake.scopeShift.difference)}</strong></>}
              </p>
              <p className="font-meta text-[8.5px] text-[var(--muted)] mt-0.5">
                {intake.scopeShift.acknowledgedAt
                  ? `Client acknowledged ${new Date(intake.scopeShift.acknowledgedAt).toLocaleString()}`
                  : "Client acknowledgment on file at signing"}
              </p>
            </div>
          )}
          <div className="flex justify-between text-sm mt-1"><span className="text-[var(--muted)]">Lead score</span>
            <span className="font-meta text-[10px] px-2 py-0.5 text-white rounded" style={{ background: LEAD_BADGE[intake.leadCategory] ?? "#6b7280" }}>
              {intake.leadScore} · {intake.leadCategory}
            </span>
          </div>
          {intake.orderId && <div className="flex justify-between text-sm mt-1"><span className="text-[var(--muted)]">Linked order</span><span className="font-meta text-[10px]">{intake.orderId}</span></div>}
          {missing.length > 0 && (
            <p className="font-meta text-[9px] text-amber-600 mt-3">⚠ Missing: {missing.join(", ")}</p>
          )}
        </div>

        <ProposalButton intake={intake} onDone={onDone} />

        {pickedAddons.length > 0 && (
          <>
            <span className={`${labelCls} mt-5`}>SELECTED ADD-ONS</span>
            <ul className="border border-[var(--line)] px-4 py-2 mt-1 rounded-xl">
              {pickedAddons.map((x) => x && (
                <li key={x.id} className="flex justify-between py-1.5 border-b border-[var(--line)] last:border-0 text-[13px]">
                  <span>{x.name}</span><span className="font-meta text-[10px]">+{money(x.price)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {pickedRecurring.length > 0 && (
          <>
            <span className={`${labelCls} mt-5`}>RECURRING SERVICES</span>
            <ul className="border border-[var(--line)] px-4 py-2 mt-1 rounded-xl">
              {pickedRecurring.map((x) => x && (
                <li key={x.id} className="flex justify-between py-1.5 border-b border-[var(--line)] last:border-0 text-[13px]">
                  <span>{x.name}</span><span className="font-meta text-[10px]">+{money(x.monthly)}/mo</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {intake.assets.length > 0 && (
          <>
            <span className={`${labelCls} mt-5`}>CLIENT FILES ({intake.assets.length})</span>
            <div className="border border-[var(--line)] px-4 py-3 mt-1 flex flex-col gap-1.5 rounded-xl">
              {intake.assets.map((asset, i) => <IntakeAssetLink key={`${asset.name}-${i}`} asset={asset} />)}
            </div>
          </>
        )}

        {intake.contract && (
          <>
            <span className={`${labelCls} mt-5`}>SIGNED AGREEMENT</span>
            <div className="border border-[var(--dept)] p-4 mt-1 rounded-xl" style={{ background: "var(--dept-soft)" }}>
              <p className="text-sm">{intake.contract.signedName} — {new Date(intake.contract.signedAt).toLocaleString()}</p>
              <p className="font-meta text-[9px] text-[var(--muted)] mt-1">{intake.contract.version}</p>
              <details className="mt-3">
                <summary className="font-meta text-[10px] dept-accent cursor-pointer">View signed scope text</summary>
                <pre className="mt-2 text-[10.5px] leading-relaxed whitespace-pre-wrap font-sans max-h-64 overflow-y-auto bg-[var(--bg)] border border-[var(--line)] p-3 rounded-lg">
                  {intake.contract.scopeText}
                </pre>
              </details>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IntakesManager() {
  const money = useMoney();
  const [intakes, setIntakes] = useState<IntakeRecord[]>([]);
  const [selectedIntakeIds, setSelectedIntakeIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "SUBMITTED" | "IN_REVIEW" | "QUOTED" | "APPROVED" | "DRAFT">("ALL");
  const [search, setSearch] = useState("");

  const reload = () => listAllIntakes().then((xs) => { setIntakes(xs); setLoaded(true); });
  useEffect(() => {
    const unsub = subscribeAllIntakes((xs) => {
      setIntakes(xs);
      setLoaded(true);
    });
    return unsub;
  }, []);

  const submitted = intakes.filter((x) => x.status === "submitted");
  const inReview = intakes.filter((x) => x.status === "in_review");
  const quoted = intakes.filter((x) => x.status === "quoted");
  const approved = intakes.filter((x) => x.status === "approved");
  const drafts = intakes.filter((x) => x.status === "draft");
  const pipeline = intakes.filter((x) => x.status !== "draft");
  const oneTime = pipeline.reduce((s, x) => s + (x.estimate?.oneTime ?? 0), 0);
  const monthly = pipeline.reduce((s, x) => s + (x.estimate?.monthly ?? 0), 0);

  const filteredIntakes = intakes.filter((x) => {
    if (filter === "SUBMITTED" && x.status !== "submitted") return false;
    if (filter === "IN_REVIEW" && x.status !== "in_review") return false;
    if (filter === "QUOTED" && x.status !== "quoted") return false;
    if (filter === "APPROVED" && x.status !== "approved") return false;
    if (filter === "DRAFT" && x.status !== "draft") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = String(x.answers?.contact_name ?? "").toLowerCase().includes(q);
      const matchBiz = String(x.answers?.business_name ?? "").toLowerCase().includes(q);
      const matchEmail = (x.email ?? "").toLowerCase().includes(q);
      const matchPkg = (x.packageName ?? "").toLowerCase().includes(q);
      const matchType = String(x.answers?.website_type ?? "").toLowerCase().includes(q);
      return matchName || matchBiz || matchEmail || matchPkg || matchType;
    }
    return true;
  });

  const toggleIntakeSelection = (id: string) => {
    setSelectedIntakeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    setSelectedIntakeIds(filteredIntakes.map((x) => x.id));
  };

  const clearSelection = () => {
    setSelectedIntakeIds([]);
  };

  const handleBatchStatus = async (status: string) => {
    const nextStatus = status as IntakeRecord["status"];
    const ok = await mutate(
      () => setIntakesStatus(selectedIntakeIds, nextStatus),
      `Updated ${selectedIntakeIds.length} briefs to ${nextStatus}`
    );
    if (ok) {
      clearSelection();
      reload();
    }
  };

  const handleBatchDelete = async () => {
    const count = selectedIntakeIds.length;
    const ok = await mutate(
      () => deleteIntakes(selectedIntakeIds),
      `Deleted ${count} briefs`
    );
    if (ok) {
      clearSelection();
      reload();
    }
  };

  const handleExportCsv = () => {
    const exportData = intakes.filter((x) => selectedIntakeIds.includes(x.id));
    exportToCsv<IntakeRecord>(
      "Briefs_Export",
      [
        { key: "id", header: "Intake ID" },
        { key: "business_name", header: "Business Name", format: (x) => String(x.answers?.business_name ?? "") },
        { key: "contact_name", header: "Contact Name", format: (x) => String(x.answers?.contact_name ?? "") },
        { key: "email", header: "Email", format: (x) => x.email || "" },
        { key: "packageName", header: "Package Name", format: (x) => x.packageName || "" },
        { key: "status", header: "Status" },
        { key: "oneTime", header: "Est. One-Time (USD)", format: (x) => x.estimate?.oneTime ?? 0 },
        { key: "monthly", header: "Est. Monthly (USD)", format: (x) => x.estimate?.monthly ?? 0 },
        { key: "leadScore", header: "Lead Score", format: (x) => x.leadScore ?? 0 },
        { key: "leadCategory", header: "Lead Category", format: (x) => x.leadCategory || "" },
        { key: "website_type", header: "Website Type", format: (x) => String(x.answers?.website_type ?? "") },
        { key: "updatedAt", header: "Last Updated", format: (x) => x.updatedAt || "" },
      ],
      exportData
    );
    toast.success(`Exported ${exportData.length} briefs to CSV`);
  };

  const handleExportJson = () => {
    const exportData = intakes.filter((x) => selectedIntakeIds.includes(x.id));
    exportToJson("Briefs_Export", exportData);
    toast.success(`Exported ${exportData.length} briefs to JSON`);
  };

  const isAllFilteredSelected = filteredIntakes.length > 0 && filteredIntakes.every((x) => selectedIntakeIds.includes(x.id));

  return (
    <div className="space-y-6 relative">
      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedIntakeIds.length}
        totalCount={filteredIntakes.length}
        onClearSelection={clearSelection}
        onSelectAll={selectAllFiltered}
        statusOptions={INTAKE_STATUSES.map((s) => ({
          label: s.replace("_", " ").toUpperCase(),
          value: s,
        }))}
        onStatusChange={handleBatchStatus}
        onDelete={handleBatchDelete}
        deleteLabel="Delete Briefs"
        onExportCsv={handleExportCsv}
        onExportJson={handleExportJson}
      />

      {/* Metrics Header */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {[
          { label: "Needs review", value: String(submitted.length), icon: "⚡", tone: submitted.length > 0 ? "#ef4444" : "var(--ink)", sub: "New client submissions" },
          { label: "Active briefs", value: String(pipeline.length), icon: "📋", tone: "var(--ink)", sub: "In scope pipeline" },
          { label: "Est. one-time", value: money(oneTime), icon: "💰", tone: "rgb(16 185 129)", sub: "Non-draft estimates" },
          { label: "Est. monthly", value: `${money(monthly)}/mo`, icon: "🔄", tone: "var(--ink)", sub: "Recurring services" },
        ].map((s) => (
          <div key={s.label} className="p-3.5 sm:p-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider font-semibold truncate mr-1">{s.label}</span>
              <span className="text-base sm:text-lg shrink-0">{s.icon}</span>
            </div>
            <p className="font-display text-lg sm:text-xl font-bold mt-0.5 truncate" style={{ color: s.tone }}>{s.value}</p>
            <span className="font-meta text-[8px] sm:text-[8.5px] text-[var(--muted)] mt-1 truncate">{s.sub}</span>
          </div>
        ))}
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5" role="tablist" aria-label="Filter briefs">
          <button
            onClick={() => setFilter("ALL")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
              filter === "ALL" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            All ({intakes.length})
          </button>
          <button
            onClick={() => setFilter("SUBMITTED")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
              filter === "SUBMITTED" ? "bg-amber-500 text-black border-amber-500 font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-amber-500"
            }`}
          >
            Needs Review ({submitted.length})
          </button>
          <button
            onClick={() => setFilter("IN_REVIEW")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
              filter === "IN_REVIEW" ? "bg-cyan-600 text-white border-cyan-600 font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-cyan-600"
            }`}
          >
            In Review ({inReview.length})
          </button>
          <button
            onClick={() => setFilter("QUOTED")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
              filter === "QUOTED" ? "bg-purple-600 text-white border-purple-600 font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-purple-600"
            }`}
          >
            Quoted ({quoted.length})
          </button>
          <button
            onClick={() => setFilter("APPROVED")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
              filter === "APPROVED" ? "bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-emerald-600"
            }`}
          >
            Approved ({approved.length})
          </button>
          <button
            onClick={() => setFilter("DRAFT")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all shrink-0 ${
              filter === "DRAFT" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-bold shadow-xs" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            Drafts ({drafts.length})
          </button>

          {filteredIntakes.length > 0 && (
            <label className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-meta text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer select-none ml-1 bg-[var(--panel)] border border-[var(--line)] rounded-xl">
              <input
                type="checkbox"
                checked={isAllFilteredSelected}
                onChange={(e) => {
                  if (e.target.checked) selectAllFiltered();
                  else clearSelection();
                }}
                className="w-3.5 h-3.5 accent-[var(--dept)] rounded cursor-pointer"
              />
              <span>Select all ({filteredIntakes.length})</span>
            </label>
          )}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search briefs by client, business, package…"
          className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded-xl w-full sm:w-72"
        />
      </div>

      {loaded && intakes.length === 0 ? (
        <div className="border border-[var(--line)] p-8 sm:p-12 text-center rounded-2xl" style={{ background: "var(--panel)" }}>
          <p className="font-display text-lg sm:text-xl font-bold uppercase">No client briefs yet</p>
          <p className="text-sm text-[var(--muted)] mt-2">Website buyers complete their project brief (and sign the agreement) right after checkout or from their portal.</p>
        </div>
      ) : filteredIntakes.length === 0 ? (
        <div className="border border-[var(--line)] p-8 sm:p-12 text-center rounded-2xl" style={{ background: "var(--panel)" }}>
          <p className="font-display text-lg sm:text-xl font-bold uppercase">No matching briefs</p>
          <p className="text-sm text-[var(--muted)] mt-2">Try clearing your search or filter.</p>
          <button onClick={() => { setFilter("ALL"); setSearch(""); }} className="btn btn-ghost mt-4">Reset Filters</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredIntakes.map((x) => {
            const open = openId === x.id;
            const isChecked = selectedIntakeIds.includes(x.id);
            return (
              <div
                key={x.id}
                className={`border px-4 sm:px-5 py-4 rounded-2xl transition-all ${
                  isChecked ? "border-[var(--dept)] bg-[var(--dept-soft)]/60 ring-1 ring-[var(--dept)] shadow-xs" : "border-[var(--line)] bg-[var(--panel)]"
                }`}
              >
                <div className="grid md:grid-cols-[36px_1fr_160px_140px_130px_140px] gap-3 sm:gap-4 items-center">
                  <div>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleIntakeSelection(x.id)}
                      className="w-3.5 h-3.5 accent-[var(--dept)] rounded cursor-pointer"
                      aria-label={`Select brief for ${x.packageName}`}
                    />
                  </div>
                  <div>
                    <p className="font-display text-sm font-bold uppercase">{String(x.answers?.business_name ?? "") || x.packageName}</p>
                    <p className="font-meta text-[9px] sm:text-[9.5px] text-[var(--muted)] mt-0.5">
                      {String(x.answers?.contact_name ?? "")} · {x.email} · {x.packageName}
                      {x.answers?.website_type ? ` · ${x.answers.website_type}` : ""}
                    </p>
                    {x.scopeShift?.direction === "upgrade" && (
                      <span className="inline-block mt-1 font-meta text-[8px] px-2 py-0.5 rounded-full border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300" data-shift-badge>
                        ⚠ SCOPE SHIFT +{money(x.scopeShift.difference)}
                      </span>
                    )}
                    {x.scopeShift?.direction === "downgrade" && (
                      <span className="inline-block mt-1 font-meta text-[8px] px-2 py-0.5 rounded-full border border-red-500/50 bg-red-500/10 text-red-600" data-shift-badge>
                        ⚠ DOWNGRADE — REVIEW
                      </span>
                    )}
                  </div>
                  <span className="font-meta text-[10px]">
                    {x.status === "draft" ? "Draft in progress" : `${money(x.estimate?.oneTime ?? 0)}${(x.estimate?.monthly ?? 0) > 0 ? ` + ${money(x.estimate!.monthly)}/mo` : ""}`}
                  </span>
                  <span className="font-meta text-[10px] px-2.5 py-1 text-white text-center rounded-lg font-bold" style={{ background: LEAD_BADGE[x.leadCategory] ?? "#6b7280" }}>
                    {x.leadScore ?? 0} · {x.leadCategory ?? "—"}
                  </span>
                  <select
                    value={x.status}
                    onChange={async (e) => {
                      const okDone = await mutate(() => setIntakeStatus(x.id, e.target.value as IntakeRecord["status"]), "Brief status updated");
                      if (okDone) reload();
                    }}
                    className={`${inputCls} !py-1.5 font-meta text-[10px] rounded-xl`}
                    aria-label="Brief status"
                  >
                    {INTAKE_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ").toUpperCase()}</option>)}
                  </select>
                  <div className="flex items-center justify-end gap-2.5">
                    <button className="font-meta text-[10px] dept-accent u-line font-bold" onClick={() => setOpenId(open ? null : x.id)}>
                      {open ? "Close" : "View brief"}
                    </button>
                    <RemoveButton onRemove={() => deleteIntake(x.id)} onDone={reload} />
                  </div>
                </div>
                {open && <IntakeDetail intake={x} onDone={reload} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================= PRODUCTS (full editor + add new) ================= */

const blankService = { name: "", dept: "brand", price: "", billing: "one_time", depositPct: "50", timeline: "", revisions: "3", tagline: "", description: "", deliverables: "" };

function Products() {
  const [overrides, setOverrides] = useState<Record<string, ServiceOverride>>({});
  const [custom, setCustom] = useState<ManagedItem[]>([]);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ServiceOverride & { deliverablesText?: string }>>({});
  const [adding, setAdding] = useState(false);
  const [newSvc, setNewSvc] = useState({ ...blankService });
  const [busy, setBusy] = useState(false);

  const reload = () => Promise.all([getServiceOverrides(), listManaged("services")]).then(([o, c]) => { setOverrides(o); setCustom(c); });
  useEffect(() => { reload(); }, []);

  const openEditor = (slug: string) => {
    if (openSlug === slug) { setOpenSlug(null); return; }
    const s = SERVICES.find((x) => x.slug === slug)!;
    const o = overrides[slug] ?? {};
    setDrafts((d) => ({
      ...d,
      [slug]: {
        price: o.price ?? s.price,
        depositPct: o.depositPct ?? s.depositPct,
        revisions: o.revisions ?? s.revisions,
        enabled: o.enabled !== false,
        featured: o.featured ?? s.featured ?? false,
        name: o.name ?? s.name,
        tagline: o.tagline ?? s.tagline,
        description: o.description ?? s.description,
        timeline: o.timeline ?? s.timeline,
        deliverablesText: (o.deliverables ?? s.deliverables).join("\n"),
      },
    }));
    setOpenSlug(slug);
  };

  const setDraft = (slug: string, k: string, v: unknown) =>
    setDrafts((d) => ({ ...d, [slug]: { ...d[slug], [k]: v } }));

  const save = async (slug: string) => {
    const d = drafts[slug];
    setBusy(true);
    const okDone = await mutate(() => saveServiceOverride(slug, {
      price: d.price, depositPct: d.depositPct, revisions: d.revisions,
      enabled: d.enabled, featured: d.featured,
      name: d.name, tagline: d.tagline, description: d.description, timeline: d.timeline,
      deliverables: (d.deliverablesText ?? "").split("\n").map((x) => x.trim()).filter(Boolean),
    }), "Product saved — live now");
    setBusy(false);
    if (okDone) { setOpenSlug(null); reload(); }
  };

  const reset = async (slug: string) => {
    setBusy(true);
    const okDone = await mutate(() => deleteServiceOverride(slug), "Overrides cleared — back to defaults");
    setBusy(false);
    if (okDone) { setOpenSlug(null); reload(); }
  };

  const addService = async () => {
    setBusy(true);
    const okDone = await mutate(() => addManaged("services", { ...newSvc, price: Number(newSvc.price) || 0, depositPct: Number(newSvc.depositPct) || 50, revisions: Number(newSvc.revisions) || 3 }), "Service added — live now");
    setBusy(false);
    if (okDone) { setAdding(false); setNewSvc({ ...blankService }); reload(); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <p className="font-meta text-[10px] text-[var(--muted)] max-w-2xl">
          Full product CMS — edit any field of any service, or add entirely new ones. Changes apply site-wide immediately.
        </p>
        <button className="btn btn-dept !py-2.5" onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "+ Add new service"}</button>
      </div>

      {adding && (
        <div className="border border-[var(--line-strong)] p-5 mb-8" style={{ background: "var(--panel)" }}>
          <span className="idx">/new-service</span>
          <div className="grid sm:grid-cols-3 gap-3 mt-4">
            <label className={labelCls}>NAME *<input className={`${inputCls} mt-1.5`} value={newSvc.name} onChange={(e) => setNewSvc({ ...newSvc, name: e.target.value })} /></label>
            <label className={labelCls}>DEPARTMENT
              <select className={`${inputCls} mt-1.5`} value={newSvc.dept} onChange={(e) => setNewSvc({ ...newSvc, dept: e.target.value })}>
                <option value="brand">Graphic + Brand</option><option value="social">Social + Marketing</option><option value="web">Web + Digital</option>
              </select>
            </label>
            <label className={labelCls}>PRICE USD (0 = request quote)<input type="number" min="0" className={`${inputCls} mt-1.5`} value={newSvc.price} onChange={(e) => setNewSvc({ ...newSvc, price: e.target.value })} /></label>
            <label className={labelCls}>BILLING
              <select className={`${inputCls} mt-1.5`} value={newSvc.billing} onChange={(e) => setNewSvc({ ...newSvc, billing: e.target.value })}>
                <option value="one_time">One-time</option><option value="monthly">Monthly</option>
              </select>
            </label>
            <label className={labelCls}>DEPOSIT %
              <select className={`${inputCls} mt-1.5`} value={newSvc.depositPct} onChange={(e) => setNewSvc({ ...newSvc, depositPct: e.target.value })}>
                {[25, 30, 40, 50, 100].map((p) => <option key={p} value={p}>{p}%</option>)}
              </select>
            </label>
            <label className={labelCls}>REVISIONS<input type="number" min="0" className={`${inputCls} mt-1.5`} value={newSvc.revisions} onChange={(e) => setNewSvc({ ...newSvc, revisions: e.target.value })} /></label>
            <label className={labelCls}>TIMELINE<input className={`${inputCls} mt-1.5`} placeholder="e.g. 2–3 weeks" value={newSvc.timeline} onChange={(e) => setNewSvc({ ...newSvc, timeline: e.target.value })} /></label>
            <label className={labelCls}>TAGLINE<input className={`${inputCls} mt-1.5`} value={newSvc.tagline} onChange={(e) => setNewSvc({ ...newSvc, tagline: e.target.value })} /></label>
            <label className={`${labelCls} sm:col-span-3`}>DESCRIPTION<textarea rows={2} className={`${inputCls} mt-1.5`} value={newSvc.description} onChange={(e) => setNewSvc({ ...newSvc, description: e.target.value })} /></label>
            <label className={`${labelCls} sm:col-span-3`}>DELIVERABLES (one per line)<textarea rows={4} className={`${inputCls} mt-1.5`} value={newSvc.deliverables} onChange={(e) => setNewSvc({ ...newSvc, deliverables: e.target.value })} /></label>
          </div>
          <button className="btn btn-dept !py-2.5 mt-4" disabled={busy || !newSvc.name.trim()} onClick={addService}>{busy ? "Saving…" : "Add service"}</button>
        </div>
      )}

      {custom.length > 0 && (
        <div className="mb-8">
          <span className="idx">/custom-services</span>
          <div className="flex flex-col gap-2 mt-3">
            {custom.map((c) => (
              <div key={c.id} className="border border-[var(--line)] px-5 py-3 flex items-center justify-between gap-4 text-sm" style={{ background: "var(--panel)" }}>
                <span>{String(c.name)} <span className="font-meta text-[9px] text-[var(--muted)] ml-2">{String(c.dept).toUpperCase()} · ${String(c.price)}</span></span>
                <RemoveButton onRemove={() => removeManaged("services", c.id)} onDone={reload} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {SERVICES.map((s) => {
          const o = overrides[s.slug] ?? {};
          const enabled = o.enabled !== false;
          const isOpen = openSlug === s.slug;
          const d = drafts[s.slug];
          const overridden = Object.keys(o).length > 0;
          return (
            <div key={s.id} className="border border-[var(--line)]" style={{ background: "var(--panel)", opacity: enabled ? 1 : 0.55 }}>
              <div className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="min-w-[220px]">
                  <span className="font-meta text-[9px] text-[var(--muted)]">{s.id}{overridden && <span className="dept-accent ml-2">EDITED</span>}</span>
                  <p className="font-display text-sm font-bold uppercase">{o.name ?? s.name}</p>
                </div>
                <span className="font-meta text-[10px] text-[var(--muted)]">${o.price ?? s.price} · {o.depositPct ?? s.depositPct}% dep · {o.revisions ?? s.revisions} rev{enabled ? "" : " · DISABLED"}</span>
                <button className="btn btn-ghost !py-2 !px-4 ml-auto" onClick={() => openEditor(s.slug)}>{isOpen ? "Close" : "Edit"}</button>
              </div>

              {isOpen && d && (
                <div className="px-5 pb-5 pt-4 rule-t grid sm:grid-cols-3 gap-3">
                  <label className={labelCls}>NAME<input className={`${inputCls} mt-1.5`} value={d.name ?? ""} onChange={(e) => setDraft(s.slug, "name", e.target.value)} /></label>
                  <label className={labelCls}>PRICE USD<input type="number" min="0" className={`${inputCls} mt-1.5`} value={d.price ?? 0} onChange={(e) => setDraft(s.slug, "price", Number(e.target.value))} /></label>
                  <label className={labelCls}>DEPOSIT %
                    <select className={`${inputCls} mt-1.5`} value={d.depositPct ?? 50} onChange={(e) => setDraft(s.slug, "depositPct", Number(e.target.value))}>
                      {[25, 30, 40, 50, 100].map((p) => <option key={p} value={p}>{p}%</option>)}
                    </select>
                  </label>
                  <label className={labelCls}>REVISIONS<input type="number" min="0" className={`${inputCls} mt-1.5`} value={d.revisions ?? 0} onChange={(e) => setDraft(s.slug, "revisions", Number(e.target.value))} /></label>
                  <label className={labelCls}>TIMELINE<input className={`${inputCls} mt-1.5`} value={d.timeline ?? ""} onChange={(e) => setDraft(s.slug, "timeline", e.target.value)} /></label>
                  <label className={labelCls}>TAGLINE<input className={`${inputCls} mt-1.5`} value={d.tagline ?? ""} onChange={(e) => setDraft(s.slug, "tagline", e.target.value)} /></label>
                  <label className={`${labelCls} sm:col-span-3`}>DESCRIPTION<textarea rows={2} className={`${inputCls} mt-1.5`} value={d.description ?? ""} onChange={(e) => setDraft(s.slug, "description", e.target.value)} /></label>
                  <label className={`${labelCls} sm:col-span-3`}>DELIVERABLES (one per line)<textarea rows={5} className={`${inputCls} mt-1.5`} value={d.deliverablesText ?? ""} onChange={(e) => setDraft(s.slug, "deliverablesText", e.target.value)} /></label>
                  <div className="sm:col-span-3 flex flex-wrap items-center gap-5">
                    <label className="font-meta text-[9px] text-[var(--muted)] flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="accent-[var(--dept)] w-4 h-4" checked={d.enabled !== false} onChange={(e) => setDraft(s.slug, "enabled", e.target.checked)} /> ENABLED
                    </label>
                    <label className="font-meta text-[9px] text-[var(--muted)] flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="accent-[var(--dept)] w-4 h-4" checked={!!d.featured} onChange={(e) => setDraft(s.slug, "featured", e.target.checked)} /> FEATURED
                    </label>
                    <div className="flex gap-3 ml-auto">
                      <button className="btn btn-dept !py-2 !px-4" disabled={busy} onClick={() => save(s.slug)}>{busy ? "Saving…" : "Save"}</button>
                      {overridden && <button className="btn btn-ghost !py-2 !px-4" disabled={busy} onClick={() => reset(s.slug)}>Reset to defaults</button>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= CONTENT MANAGER (edit-in-place + uploads) ================= */


interface Field { key: string; label: string; area?: boolean; optional?: boolean; hint?: string }

function ContentManager({ kind, fields, image }: { kind: "testimonials" | "faqs" | "portfolio" | "promos"; fields: Field[]; image?: boolean }) {
  const [items, setItems] = useState<ManagedItem[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reload = () => listManaged(kind).then(setItems);
  useEffect(() => { reload(); }, [kind]);

  const defaultCount = kind === "testimonials" ? TESTIMONIALS.length : kind === "faqs" ? FAQS.length : 0;
  const noun = kind === "faqs" ? "faq" : kind === "portfolio" ? "project" : kind === "promos" ? "code" : "testimonial";

  const startEdit = (it: ManagedItem) => {
    const d: Record<string, string> = {};
    fields.forEach((f) => { d[f.key] = String(it[f.key] ?? ""); });
    if (image && it.image) d.image = String(it.image);
    setDraft(d);
    setEditingId(it.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "portfolio");
      setDraft((d) => ({ ...d, image: url }));
      toast.success(firebaseReady ? "Image uploaded" : "Image attached (demo preview)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
    setUploading(false);
  };

  const submit = async () => {
    if (fields.some((f) => !f.optional && !draft[f.key]?.trim())) { toast.error("Fill in every field first."); return; }
    const live = draft.liveUrl?.trim();
    if (live && !/^https:\/\/\S+\.\S+/.test(live)) { toast.error("Live preview URL must be a full https:// address."); return; }
    const ok = await mutate(
      () => (editingId ? updateManaged(kind, editingId, draft) : addManaged(kind, draft)),
      editingId ? "Updated — live now" : "Added — live now"
    );
    if (ok) { setDraft({}); setEditingId(null); if (fileRef.current) fileRef.current.value = ""; reload(); }
  };

  return (
    <div>
      <div className="border border-[var(--line-strong)] p-5 mb-6" style={{ background: "var(--panel)" }}>
        <div className="flex items-center justify-between">
          <span className="idx">/{editingId ? `edit-${noun}` : `add-${noun}`}</span>
          {editingId && <button className="font-meta text-[10px] text-[var(--muted)]" onClick={() => { setEditingId(null); setDraft({}); }}>Cancel edit ✕</button>}
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          {fields.map((f) => (
            <label key={f.key} className={`${labelCls} ${f.area ? "sm:col-span-2" : ""}`}>{f.label.toUpperCase()}{f.optional ? " (OPTIONAL)" : ""}
              {f.area ? (
                <textarea rows={3} className={`${inputCls} mt-1.5`} value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
              ) : (
                <input className={`${inputCls} mt-1.5`} value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
              )}
              {f.hint && <span className="block font-meta text-[9px] normal-case tracking-normal text-[var(--muted)] mt-1">{f.hint}</span>}
            </label>
          ))}
          {image && (
            <div className="sm:col-span-2">
              <span className={labelCls}>COVER IMAGE (JPG/PNG/WebP/AVIF/SVG, max 8MB)</span>
              <div className="mt-1.5 flex items-center gap-4">
                <input ref={fileRef} type="file" accept="image/*" className="text-sm" onChange={(e) => pickImage(e.target.files?.[0])} aria-label="Upload cover image" />
                {uploading && <span className="font-meta text-[10px] text-[var(--muted)]">Uploading…</span>}
              </div>
              {draft.image && (
                <div className="mt-3 flex items-center gap-4">
                  <img src={draft.image} alt="Cover preview" className="w-24 h-32 object-cover border border-[var(--line)]" />
                  <button className="font-meta text-[10px] text-[var(--muted)] hover:text-red-600 transition-colors" onClick={() => setDraft((d) => { const { image: _i, ...rest } = d; return rest; })}>Remove image</button>
                </div>
              )}
            </div>
          )}
        </div>
        <button className="btn btn-dept !py-2.5 mt-4" onClick={submit}>{editingId ? "Update" : "Add"}</button>
      </div>

      <p className="font-meta text-[9px] text-[var(--muted)] mb-3">Default content ships with the site; items you add here appear alongside it. Click Edit to change any entry.</p>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.id} className="border border-[var(--line)] px-5 py-3 flex items-center justify-between gap-4 text-sm" style={{ background: "var(--panel)" }}>
            <span className="truncate flex items-center gap-3">
              {typeof it.image === "string" && it.image && <img src={it.image} alt="" className="w-8 h-10 object-cover border border-[var(--line)]" />}
              {String(it[fields[0].key] ?? "")}
            </span>
            <span className="flex gap-4 shrink-0">
              <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors" onClick={() => startEdit(it)}>Edit</button>
              <RemoveButton onRemove={() => removeManaged(kind, it.id)} onDone={reload} />
            </span>
          </div>
        ))}
        {items.length === 0 && <p className="font-meta text-[10px] text-[var(--muted)]">Nothing added yet{defaultCount ? ` — ${defaultCount} default entries live on the site` : ""}.</p>}
      </div>
    </div>
  );
}

/* ================= PORTFOLIO & WORK CMS MANAGER ================= */

interface UnifiedProject {
  id: string;
  cmsId?: string;
  slug: string;
  title: string;
  client: string;
  categories: string[];
  dept: "brand" | "social" | "web";
  industry: string;
  year: string;
  services: string[];
  summary: string;
  liveUrl?: string;
  image?: string;
  featured?: boolean;
  enabled: boolean;
  isBuiltIn: boolean;
  isCustomized: boolean;
  caseStudy?: {
    challenge?: string;
    strategy?: string;
    creative?: string;
    execution?: string;
    result?: string;
  };
}

function PortfolioManager() {
  const [managedItems, setManagedItems] = useState<ManagedItem[]>([]);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("ALL");
  const [editingSlug, setEditingSlug] = useState<string | null>(null); // null | "new" | project slug
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState(false);
  const [showCaseStudy, setShowCaseStudy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => listManaged("portfolio").then(setManagedItems);
  useEffect(() => { reload(); }, []);

  // Merge built-in sample projects with CMS Firestore overrides and custom entries
  const projects: UnifiedProject[] = useMemo(() => {
    const list: UnifiedProject[] = [];
    const cmsMap = new Map<string, ManagedItem>();
    managedItems.forEach((m) => {
      const slug = String(m.slug || m.id);
      cmsMap.set(slug, m);
    });

    // 1. Built-in sample projects from data.ts
    PROJECTS.forEach((bp) => {
      const cmsOverride = cmsMap.get(bp.slug) || cmsMap.get(bp.id);
      if (cmsOverride) {
        list.push({
          id: bp.id,
          cmsId: cmsOverride.id,
          slug: bp.slug,
          title: String(cmsOverride.title ?? bp.title),
          client: String(cmsOverride.client ?? bp.client),
          categories: cmsOverride.categories ? String(cmsOverride.categories).split(",").map((c) => c.trim().toUpperCase()).filter(Boolean) : bp.categories,
          dept: ((cmsOverride.dept as any) || bp.dept) as "brand" | "social" | "web",
          industry: String(cmsOverride.industry ?? bp.industry),
          year: String(cmsOverride.year ?? bp.year),
          services: cmsOverride.services ? String(cmsOverride.services).split(",").map((s) => s.trim()).filter(Boolean) : bp.services,
          summary: String(cmsOverride.summary ?? bp.summary),
          liveUrl: cmsOverride.liveUrl !== undefined ? String(cmsOverride.liveUrl) : bp.liveUrl,
          image: cmsOverride.image ? String(cmsOverride.image) : bp.image,
          featured: cmsOverride.featured !== undefined ? !!cmsOverride.featured : bp.featured,
          enabled: cmsOverride.enabled !== false,
          isBuiltIn: true,
          isCustomized: true,
          caseStudy: {
            challenge: String(cmsOverride.challenge ?? bp.caseStudy?.challenge ?? ""),
            strategy: String(cmsOverride.strategy ?? bp.caseStudy?.strategy ?? ""),
            creative: String(cmsOverride.creative ?? bp.caseStudy?.creative ?? ""),
            execution: String(cmsOverride.execution ?? bp.caseStudy?.execution ?? ""),
            result: String(cmsOverride.result ?? bp.caseStudy?.result ?? ""),
          },
        });
      } else {
        list.push({
          id: bp.id,
          slug: bp.slug,
          title: bp.title,
          client: bp.client,
          categories: bp.categories,
          dept: bp.dept,
          industry: bp.industry,
          year: bp.year,
          services: bp.services,
          summary: bp.summary,
          liveUrl: bp.liveUrl,
          image: bp.image,
          featured: bp.featured,
          enabled: true,
          isBuiltIn: true,
          isCustomized: false,
          caseStudy: bp.caseStudy,
        });
      }
    });

    // 2. Custom websites / projects created in CMS
    const builtInSlugs = new Set(PROJECTS.map((p) => p.slug).concat(PROJECTS.map((p) => p.id)));
    managedItems.forEach((m, i) => {
      const slug = String(m.slug || m.id);
      if (!builtInSlugs.has(slug)) {
        list.unshift({
          id: String(m.pid ?? m.id ?? `CMS-${i + 1}`),
          cmsId: m.id,
          slug,
          title: String(m.title ?? "Untitled"),
          client: String(m.client ?? ""),
          categories: String(m.categories ?? "BRANDING").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
          dept: (((m.dept as any) || "brand") as "brand" | "social" | "web"),
          industry: String(m.industry ?? ""),
          year: String(m.year ?? new Date().getFullYear()),
          services: String(m.services ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          summary: String(m.summary ?? ""),
          liveUrl: m.liveUrl ? String(m.liveUrl) : undefined,
          image: m.image ? String(m.image) : undefined,
          featured: !!m.featured,
          enabled: m.enabled !== false,
          isBuiltIn: false,
          isCustomized: false,
          caseStudy: {
            challenge: String(m.challenge ?? ""),
            strategy: String(m.strategy ?? ""),
            creative: String(m.creative ?? ""),
            execution: String(m.execution ?? ""),
            result: String(m.result ?? ""),
          },
        });
      }
    });

    return list;
  }, [managedItems]);

  const filtered = useMemo(() => {
    let xs = projects;
    if (deptFilter !== "ALL") {
      xs = xs.filter((p) => p.dept.toUpperCase() === deptFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.categories.some((c) => c.toLowerCase().includes(q)) ||
        (p.liveUrl && p.liveUrl.toLowerCase().includes(q))
      );
    }
    return xs;
  }, [projects, search, deptFilter]);

  const startNew = () => {
    setDraft({
      title: "",
      client: "",
      slug: "",
      dept: "web",
      categories: "WEB",
      industry: "Business & Commerce",
      year: String(new Date().getFullYear()),
      services: "Website Design, Mobile Optimization, Lead Capture",
      summary: "",
      liveUrl: "https://",
      image: "",
      featured: false,
      challenge: "",
      strategy: "",
      creative: "",
      execution: "",
      result: "",
    });
    setEditingSlug("new");
    setShowCaseStudy(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEdit = (p: UnifiedProject) => {
    setDraft({
      id: p.id,
      cmsId: p.cmsId,
      slug: p.slug,
      title: p.title,
      client: p.client,
      dept: p.dept,
      categories: p.categories.join(", "),
      industry: p.industry,
      year: p.year,
      services: p.services.join(", "),
      summary: p.summary,
      liveUrl: p.liveUrl ?? "",
      image: p.image ?? "",
      featured: !!p.featured,
      challenge: p.caseStudy?.challenge ?? "",
      strategy: p.caseStudy?.strategy ?? "",
      creative: p.caseStudy?.creative ?? "",
      execution: p.caseStudy?.execution ?? "",
      result: p.caseStudy?.result ?? "",
    });
    setEditingSlug(p.slug);
    setShowCaseStudy(!!(p.caseStudy?.challenge || p.caseStudy?.strategy || p.caseStudy?.creative));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "portfolio");
      setDraft((d) => ({ ...d, image: url }));
      toast.success(firebaseReady ? "Cover image uploaded" : "Image attached (demo preview)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
    setUploading(false);
  };

  const save = async () => {
    if (!draft.title?.trim()) { toast.error("Project title is required."); return; }
    const slug = draft.slug?.trim() || draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const live = draft.liveUrl?.trim();
    if (live && live !== "https://" && !/^https?:\/\//i.test(live)) {
      toast.error("Live preview URL must be a valid https:// address (e.g. https://pinstripesrentals.com)");
      return;
    }

    const payload: Record<string, any> = {
      title: draft.title.trim(),
      client: draft.client?.trim() || "",
      slug,
      dept: draft.dept || "web",
      categories: draft.categories || "WEB",
      industry: draft.industry || "",
      year: draft.year || String(new Date().getFullYear()),
      services: draft.services || "",
      summary: draft.summary || "",
      liveUrl: live && live !== "https://" ? live : "",
      image: draft.image || "",
      featured: !!draft.featured,
      enabled: true,
      challenge: draft.challenge || "",
      strategy: draft.strategy || "",
      creative: draft.creative || "",
      execution: draft.execution || "",
      result: draft.result || "",
    };

    let ok = false;
    if (draft.cmsId) {
      ok = await mutate(() => updateManaged("portfolio", draft.cmsId, payload), "Project updated — live now");
    } else {
      ok = await mutate(() => addManaged("portfolio", payload), "Project saved — live now");
    }

    if (ok) {
      setDraft({});
      setEditingSlug(null);
      if (fileRef.current) fileRef.current.value = "";
      reload();
    }
  };

  const toggleVisibility = async (p: UnifiedProject) => {
    const nextState = !p.enabled;
    if (p.cmsId) {
      await mutate(() => updateManaged("portfolio", p.cmsId!, { enabled: nextState }), nextState ? "Project visible on Work" : "Project hidden from Work");
    } else {
      await mutate(() => addManaged("portfolio", {
        slug: p.slug,
        title: p.title,
        client: p.client,
        dept: p.dept,
        categories: p.categories.join(", "),
        industry: p.industry,
        year: p.year,
        services: p.services.join(", "),
        summary: p.summary,
        liveUrl: p.liveUrl || "",
        image: p.image || "",
        enabled: nextState,
      }), nextState ? "Project visible on Work" : "Project hidden from Work");
    }
    reload();
  };

  const removeOrReset = async (p: UnifiedProject) => {
    if (p.cmsId) {
      const ok = await mutate(() => removeManaged("portfolio", p.cmsId!), p.isBuiltIn ? "Reset to original default" : "Project deleted");
      if (ok) reload();
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-xl font-bold uppercase tracking-tight">Creative Archive & Websites CMS</h2>
          <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
            Manage your sample websites, case studies, and live project embeds displayed on <a href="/work" target="_blank" rel="noreferrer" className="dept-accent underline">/work</a>.
          </p>
        </div>
        {!editingSlug && (
          <button className="btn btn-dept !py-2.5" onClick={startNew}>
            + Add New Website / Project <span className="btn-arrow" aria-hidden>→</span>
          </button>
        )}
      </div>

      {/* EDIT / CREATE FORM */}
      {editingSlug && (
        <div className="border border-[var(--line-strong)] p-6 mb-8" style={{ background: "var(--panel)" }}>
          <div className="flex items-center justify-between pb-4 border-b border-[var(--line)]">
            <div>
              <span className="idx">/{editingSlug === "new" ? "new-website-project" : `edit-${draft.slug || editingSlug}`}</span>
              <h3 className="font-display text-lg font-bold uppercase mt-1">
                {editingSlug === "new" ? "Add New Website / Portfolio Item" : `Edit Project: ${draft.title || draft.slug}`}
              </h3>
            </div>
            <button className="font-meta text-[10px] text-[var(--muted)] hover:text-red-500 transition-colors" onClick={() => { setEditingSlug(null); setDraft({}); }}>
              Cancel ✕
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
            <div>
              <label className={labelCls}>PROJECT TITLE *</label>
              <input className={`${inputCls} mt-1`} value={draft.title ?? ""} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="e.g. Pinstripes Rentals" />
            </div>
            <div>
              <label className={labelCls}>CLIENT / BRAND NAME</label>
              <input className={`${inputCls} mt-1`} value={draft.client ?? ""} onChange={(e) => setDraft((d) => ({ ...d, client: e.target.value }))} placeholder="e.g. Pinstripes Party & Event Rentals" />
            </div>
            <div>
              <label className={labelCls}>URL SLUG (/work/:slug)</label>
              <input className={`${inputCls} mt-1`} value={draft.slug ?? ""} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))} placeholder="e.g. pinstripes-rentals" />
            </div>

            <div>
              <label className={labelCls}>DEPARTMENT</label>
              <select className={`${inputCls} mt-1`} value={draft.dept ?? "web"} onChange={(e) => setDraft((d) => ({ ...d, dept: e.target.value }))}>
                <option value="web" className="text-black">Web Design & Ecommerce (web)</option>
                <option value="brand" className="text-black">Branding & Identity (brand)</option>
                <option value="social" className="text-black">Social Media & Marketing (social)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>CATEGORIES (COMMA-SEPARATED)</label>
              <input className={`${inputCls} mt-1`} value={draft.categories ?? ""} onChange={(e) => setDraft((d) => ({ ...d, categories: e.target.value }))} placeholder="e.g. WEB, BRANDING, ECOMMERCE" />
            </div>
            <div>
              <label className={labelCls}>INDUSTRY & YEAR</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <input className={inputCls} value={draft.industry ?? ""} onChange={(e) => setDraft((d) => ({ ...d, industry: e.target.value }))} placeholder="Industry" />
                <input className={inputCls} value={draft.year ?? ""} onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))} placeholder="Year" />
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>DELIVERED SERVICES (COMMA-SEPARATED)</label>
              <input className={`${inputCls} mt-1`} value={draft.services ?? ""} onChange={(e) => setDraft((d) => ({ ...d, services: e.target.value }))} placeholder="e.g. Business Website, Mobile Optimization, Booking Engine, Brand Identity" />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>SUMMARY / VALUE PROPOSITION</label>
              <textarea rows={2} className={`${inputCls} mt-1`} value={draft.summary ?? ""} onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))} placeholder="A short 1-2 sentence description of what was built and why it helped the business." />
            </div>

            <div className="sm:col-span-2 lg:col-span-3 border border-[var(--dept)] p-4" style={{ background: "var(--dept-soft)" }}>
              <label className={labelCls}>🌐 LIVE PREVIEW URL (INTERACTIVE WINDOW ON /WORK)</label>
              <div className="mt-1 flex gap-2">
                <input className={`${inputCls} bg-white text-zinc-900`} value={draft.liveUrl ?? ""} onChange={(e) => setDraft((d) => ({ ...d, liveUrl: e.target.value }))} placeholder="https://pinstripesrentals.com/" />
                {draft.liveUrl && /^https?:\/\//i.test(draft.liveUrl) && (
                  <a href={draft.liveUrl} target="_blank" rel="noreferrer" className="btn btn-ghost !py-2 shrink-0">
                    Test Link ↗
                  </a>
                )}
              </div>
              <span className="font-meta text-[9px] text-[var(--muted)] block mt-1.5 leading-relaxed">
                Adding a live URL embeds an interactive browser window right on the Work archive and case study page so visitors can scroll and click your actual website!
              </span>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <span className={labelCls}>COVER / PREVIEW IMAGE</span>
              <div className="mt-1 flex flex-wrap items-center gap-4">
                <input ref={fileRef} type="file" accept="image/*" className="text-sm" onChange={(e) => pickImage(e.target.files?.[0])} aria-label="Upload cover image" />
                {uploading && <span className="font-meta text-[10px] text-[var(--muted)]">Uploading to storage…</span>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="font-meta text-[9px] text-[var(--muted)]">OR Image URL:</span>
                <input className={`${inputCls} !py-1 text-xs`} value={draft.image ?? ""} onChange={(e) => setDraft((d) => ({ ...d, image: e.target.value }))} placeholder="/covers/pinstripes-rentals.webp or https://..." />
              </div>
              {draft.image && (
                <div className="mt-3 flex items-center gap-4">
                  <img src={draft.image} alt="Cover preview" className="w-32 h-20 object-cover border border-[var(--line)]" />
                  <button className="font-meta text-[10px] text-[var(--muted)] hover:text-red-600 transition-colors" onClick={() => setDraft((d) => ({ ...d, image: "" }))}>Remove image</button>
                </div>
              )}
            </div>

            {/* Case Study Details Toggle */}
            <div className="sm:col-span-2 lg:col-span-3 mt-2">
              <button type="button" className="font-meta text-[10px] dept-accent underline" onClick={() => setShowCaseStudy(!showCaseStudy)}>
                {showCaseStudy ? "▼ Hide Full Case Study Fields (Challenge, Strategy, Creative, Execution, Result)" : "▶ Show Full Case Study Fields (Challenge, Strategy, Creative, Execution, Result)"}
              </button>
            </div>

            {showCaseStudy && (
              <div className="sm:col-span-2 lg:col-span-3 grid sm:grid-cols-2 gap-4 border border-[var(--line)] p-4" style={{ background: "var(--bg)" }}>
                <div>
                  <label className={labelCls}>1. THE CHALLENGE</label>
                  <textarea rows={2} className={`${inputCls} mt-1`} value={draft.challenge ?? ""} onChange={(e) => setDraft((d) => ({ ...d, challenge: e.target.value }))} placeholder="What problem did the client have?" />
                </div>
                <div>
                  <label className={labelCls}>2. THE STRATEGY</label>
                  <textarea rows={2} className={`${inputCls} mt-1`} value={draft.strategy ?? ""} onChange={(e) => setDraft((d) => ({ ...d, strategy: e.target.value }))} placeholder="How was the project approached?" />
                </div>
                <div>
                  <label className={labelCls}>3. CREATIVE APPROACH</label>
                  <textarea rows={2} className={`${inputCls} mt-1`} value={draft.creative ?? ""} onChange={(e) => setDraft((d) => ({ ...d, creative: e.target.value }))} placeholder="Design language, visual choices, colors..." />
                </div>
                <div>
                  <label className={labelCls}>4. EXECUTION & ROLLOUT</label>
                  <textarea rows={2} className={`${inputCls} mt-1`} value={draft.execution ?? ""} onChange={(e) => setDraft((d) => ({ ...d, execution: e.target.value }))} placeholder="Deliverables built and launched." />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>5. MEASURABLE RESULT</label>
                  <textarea rows={2} className={`${inputCls} mt-1`} value={draft.result ?? ""} onChange={(e) => setDraft((d) => ({ ...d, result: e.target.value }))} placeholder="Client outcome, bookings, feedback..." />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t border-[var(--line)]">
            <button className="btn btn-dept !py-2.5" onClick={save}>
              Save & Publish to Work <span className="btn-arrow" aria-hidden>→</span>
            </button>
            <button className="btn btn-ghost !py-2.5" onClick={() => { setEditingSlug(null); setDraft({}); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {["ALL", "WEB", "BRAND", "SOCIAL"].map((d) => (
            <button
              key={d}
              onClick={() => setDeptFilter(d)}
              className="font-meta text-[10px] px-3 py-1.5 border transition-colors"
              style={deptFilter === d ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}
            >
              {d}
            </button>
          ))}
          <span className="font-meta text-[10px] text-[var(--muted)] ml-2">{filtered.length} projects</span>
        </div>
        <input
          className={`${inputCls} !w-64 !py-1.5 text-xs`}
          placeholder="Search by title, client, url..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* PROJECTS LIST */}
      <div className="flex flex-col gap-3">
        {filtered.map((p: UnifiedProject) => (
          <div
            key={p.slug}
            className={`border border-[var(--line)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${!p.enabled ? "opacity-50 bg-black/10" : ""}`}
            style={{ background: "var(--panel)" }}
          >
            <div className="flex items-start gap-4 grow min-w-0">
              {p.image ? (
                <img src={p.image} alt="" className="w-16 h-12 object-cover border border-[var(--line)] shrink-0 rounded-sm" />
              ) : (
                <div className="w-16 h-12 border border-[var(--line)] bg-[var(--dept-soft)] flex items-center justify-center font-meta text-[9px] shrink-0">
                  {p.dept.toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-bold text-base truncate">{p.title}</span>
                  {p.isBuiltIn && !p.isCustomized && (
                    <span className="font-meta text-[8px] px-1.5 py-0.5 border border-[var(--line)] text-[var(--muted)]">DEFAULT SAMPLE</span>
                  )}
                  {p.isBuiltIn && p.isCustomized && (
                    <span className="font-meta text-[8px] px-1.5 py-0.5 border border-[var(--dept)] dept-accent">CUSTOMIZED</span>
                  )}
                  {!p.isBuiltIn && (
                    <span className="font-meta text-[8px] px-1.5 py-0.5 bg-[var(--dept)] text-[var(--on-dept)]">CUSTOM WEBSITE</span>
                  )}
                  {!p.enabled && (
                    <span className="font-meta text-[8px] px-1.5 py-0.5 bg-red-600/20 text-red-500 border border-red-500/30">HIDDEN FROM WORK</span>
                  )}
                  {p.liveUrl && (
                    <span className="font-meta text-[8px] px-1.5 py-0.5 border border-cyan-500/40 text-cyan-400">🌐 LIVE PREVIEW</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-meta text-[9px] text-[var(--muted)] mt-1">
                  <span>Client: {p.client || "Self"}</span>
                  <span>·</span>
                  <span>Dept: {p.dept}</span>
                  <span>·</span>
                  <span>Categories: {p.categories.join(", ")}</span>
                  {p.liveUrl && (
                    <>
                      <span>·</span>
                      <a href={p.liveUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline truncate max-w-[200px]">
                        {p.liveUrl}
                      </a>
                    </>
                  )}
                </div>

                {p.summary && (
                  <p className="text-xs text-[var(--muted)] mt-1 line-clamp-1">{p.summary}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 self-end md:self-center">
              <a
                href={`/work/${p.slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost !py-1 !px-3 text-xs"
              >
                View ↗
              </a>
              <button
                className="btn btn-dept !py-1 !px-3 text-xs"
                onClick={() => startEdit(p)}
              >
                Edit
              </button>
              <button
                className={`btn btn-ghost !py-1 !px-3 text-xs ${p.enabled ? "text-amber-500" : "dept-accent"}`}
                onClick={() => toggleVisibility(p)}
              >
                {p.enabled ? "Hide" : "Show"}
              </button>
              {p.cmsId && (
                <button
                  className="btn btn-ghost !py-1 !px-3 text-xs !text-red-500 hover:!border-red-500"
                  onClick={() => removeOrReset(p)}
                >
                  {p.isBuiltIn ? "Reset" : "Delete"}
                </button>
              )}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="border border-[var(--line)] p-8 text-center" style={{ background: "var(--panel)" }}>
            <p className="text-sm text-[var(--muted)]">No projects match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= SETTINGS ================= */

function SettingsManager() {
  const money = useMoney();
  const [s, setS] = useState<SiteSettings>({});
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [resetAccountingOpen, setResetAccountingOpen] = useState(false);

  useEffect(() => {
    getSettings().then(setS);
    const unsub = subscribeAllOrders(setOrders);
    return () => { unsub(); };
  }, []);

  const socials = SOCIAL_LINKS.map((d) => s.socials?.find((x) => x.id === d.id) ?? d);
  const setSocial = (id: string, href: string) =>
    setS((prev) => ({ ...prev, socials: socials.map((x) => (x.id === id ? { ...x, href } : x)) }));

  return (
    <div className="max-w-2xl">
      <p className="font-meta text-[10px] text-[var(--muted)] mb-6">
        Contact details and social links shown in the footer and contact points site-wide (PRD §74/§85). Blank fields keep the defaults.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className={labelCls}>PHONE
          <input className={`${inputCls} mt-1.5`} placeholder={CONTACT.phone} value={s.phone ?? ""} onChange={(e) => setS({ ...s, phone: e.target.value })} />
        </label>
        <label className={labelCls}>EMAIL
          <input className={`${inputCls} mt-1.5`} placeholder={CONTACT.email} value={s.email ?? ""} onChange={(e) => setS({ ...s, email: e.target.value })} />
        </label>
        <label className={`${labelCls} sm:col-span-2`}>LOCATION
          <input className={`${inputCls} mt-1.5`} placeholder={CONTACT.location} value={s.location ?? ""} onChange={(e) => setS({ ...s, location: e.target.value })} />
        </label>
        <label className={labelCls}>"CATCH ME" EASTER EGG — DISCOUNT %
          <input className={`${inputCls} mt-1.5`} type="number" min={0} max={50} placeholder="e.g. 10 — 0 or blank disables the egg"
            value={s.catchDiscountPct ?? ""} onChange={(e) => setS({ ...s, catchDiscountPct: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} />
          <span className="block font-meta text-[8px] text-[var(--muted)] mt-1">Visitors who catch the running token get this % off — with a 2-minute countdown to use it.</span>
        </label>
        {socials.map((x) => (
          <label key={x.id} className={labelCls}>{x.label.toUpperCase()} URL
            <input className={`${inputCls} mt-1.5`} value={x.href} onChange={(e) => setSocial(x.id, e.target.value)} />
          </label>
        ))}
      </div>
      <button className="btn btn-dept !py-2.5 mt-6" onClick={() => mutate(() => saveSettings({ ...s, socials }), "Settings saved — live now")}>Save settings</button>
      <p className="font-meta text-[9px] text-[var(--muted)] mt-4">Changes apply site-wide immediately.</p>

      {/* 2026 Website Intelligence & Analytics Engine Configuration Card */}
      <div className="mt-10 pt-8 border-t border-[var(--line)] space-y-6">
        <div className="flex items-center gap-2">
          <span className="text-lg">📡</span>
          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-tight text-[var(--ink)]">
              Analytics, Tracking & Attribution Engine
            </h4>
            <p className="font-meta text-[10px] text-[var(--muted)] mt-0.5">
              Manage GA4, Meta Pixel, Google Ads, and First-Party Firestore visitor intelligence tracking (PRD §1-5).
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-[var(--line)] space-y-5" style={{ background: "var(--panel)" }}>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className={labelCls}>
              GOOGLE ANALYTICS 4 (GA4 ID)
              <input
                className={`${inputCls} mt-1.5`}
                placeholder="G-XXXXXXXXXX (overrides env)"
                value={s.analyticsSettings?.ga4MeasurementId ?? ""}
                onChange={(e) =>
                  setS((prev) => ({
                    ...prev,
                    analyticsSettings: { ...prev.analyticsSettings, ga4MeasurementId: e.target.value },
                  }))
                }
              />
              <span className="block font-meta text-[8px] text-[var(--muted)] mt-1">Leave blank to use default environment config.</span>
            </label>

            <label className={labelCls}>
              META PIXEL ID
              <input
                className={`${inputCls} mt-1.5`}
                placeholder="e.g. 123456789012345"
                value={s.analyticsSettings?.metaPixelId ?? ""}
                onChange={(e) =>
                  setS((prev) => ({
                    ...prev,
                    analyticsSettings: { ...prev.analyticsSettings, metaPixelId: e.target.value },
                  }))
                }
              />
              <span className="block font-meta text-[8px] text-[var(--muted)] mt-1">Fires standard PageView, ViewContent, and Lead events.</span>
            </label>

            <label className={labelCls}>
              GOOGLE ADS CONVERSION ID
              <input
                className={`${inputCls} mt-1.5`}
                placeholder="AW-XXXXXXXXXX"
                value={s.analyticsSettings?.googleAdsId ?? ""}
                onChange={(e) =>
                  setS((prev) => ({
                    ...prev,
                    analyticsSettings: { ...prev.analyticsSettings, googleAdsId: e.target.value },
                  }))
                }
              />
            </label>

            <label className={labelCls}>
              GOOGLE ADS PURCHASE CONVERSION LABEL
              <input
                className={`${inputCls} mt-1.5`}
                placeholder="e.g. AbCdEfGhIjKlMnOp"
                value={s.analyticsSettings?.googleAdsConversionLabel ?? ""}
                onChange={(e) =>
                  setS((prev) => ({
                    ...prev,
                    analyticsSettings: { ...prev.analyticsSettings, googleAdsConversionLabel: e.target.value },
                  }))
                }
              />
            </label>
          </div>

          <div className="pt-4 border-t border-[var(--line)]">
            <span className={labelCls}>FIRST-PARTY TRACKING CAPABILITIES</span>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              <label className="font-meta text-[10px] flex items-center gap-2.5 border border-[var(--line)] px-3 py-2.5 cursor-pointer rounded-xl bg-[var(--bg)]">
                <input
                  type="checkbox"
                  className="accent-[var(--dept)] w-4 h-4"
                  checked={s.analyticsSettings?.firstPartyTracking !== false}
                  onChange={(e) =>
                    setS((prev) => ({
                      ...prev,
                      analyticsSettings: { ...prev.analyticsSettings, firstPartyTracking: e.target.checked },
                    }))
                  }
                />
                <div>
                  <span className="font-bold block">First-Party Event Streaming</span>
                  <span className="text-[8.5px] text-[var(--muted)]">Stream sessions & events to Firestore analytics_ collections</span>
                </div>
              </label>

              <label className="font-meta text-[10px] flex items-center gap-2.5 border border-[var(--line)] px-3 py-2.5 cursor-pointer rounded-xl bg-[var(--bg)]">
                <input
                  type="checkbox"
                  className="accent-[var(--dept)] w-4 h-4"
                  checked={s.analyticsSettings?.trackServiceViews !== false}
                  onChange={(e) =>
                    setS((prev) => ({
                      ...prev,
                      analyticsSettings: { ...prev.analyticsSettings, trackServiceViews: e.target.checked },
                    }))
                  }
                />
                <div>
                  <span className="font-bold block">Service Interest Tracking</span>
                  <span className="text-[8.5px] text-[var(--muted)]">Log high-intent service & department page visits</span>
                </div>
              </label>

              <label className="font-meta text-[10px] flex items-center gap-2.5 border border-[var(--line)] px-3 py-2.5 cursor-pointer rounded-xl bg-[var(--bg)]">
                <input
                  type="checkbox"
                  className="accent-[var(--dept)] w-4 h-4"
                  checked={s.analyticsSettings?.trackFormFunnels !== false}
                  onChange={(e) =>
                    setS((prev) => ({
                      ...prev,
                      analyticsSettings: { ...prev.analyticsSettings, trackFormFunnels: e.target.checked },
                    }))
                  }
                />
                <div>
                  <span className="font-bold block">Form Funnel Analytics</span>
                  <span className="text-[8.5px] text-[var(--muted)]">Track form_start and form_submit conversion drop-offs</span>
                </div>
              </label>

              <label className="font-meta text-[10px] flex items-center gap-2.5 border border-[var(--line)] px-3 py-2.5 cursor-pointer rounded-xl bg-[var(--bg)]">
                <input
                  type="checkbox"
                  className="accent-[var(--dept)] w-4 h-4"
                  checked={s.analyticsSettings?.trackScrollDepth !== false}
                  onChange={(e) =>
                    setS((prev) => ({
                      ...prev,
                      analyticsSettings: { ...prev.analyticsSettings, trackScrollDepth: e.target.checked },
                    }))
                  }
                />
                <div>
                  <span className="font-bold block">Scroll Depth & Engagement</span>
                  <span className="text-[8.5px] text-[var(--muted)]">Capture engagement metrics for long-form landing pages</span>
                </div>
              </label>
            </div>
          </div>

          <div className="p-3 bg-[var(--bg)] border border-[var(--line)] rounded-xl text-[10px] font-meta space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-[var(--ink)]">
              <span>🔒</span>
              <span>Server-Side Conversions API (Meta CAPI & GA4 MP)</span>
            </div>
            <p className="text-[var(--muted)] text-[9px] leading-relaxed">
              For 100% ad-block resilient server-side tracking, server secrets (Meta System User Access Token, GA4 API Secret) are secured via Firebase Cloud Functions endpoints rather than exposing them client-side.
            </p>
          </div>

          <button
            className="btn btn-dept !py-2.5 w-full justify-center"
            onClick={() => mutate(() => saveSettings(s), "Analytics configuration saved — live now")}
          >
            Save Analytics Configuration
          </button>
        </div>
      </div>

      {/* 2026 Audit-Compliant Financial Ledger & Accounting Reset Card */}
      <div className="mt-10 pt-8 border-t border-[var(--line)] space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">💰</span>
          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-tight text-[var(--ink)]">
              Financial Ledger & Accounting Reset
            </h4>
            <p className="font-meta text-[10px] text-[var(--muted)] mt-0.5">
              Zero out studio revenue tallies, order accounting, and receivable metrics following 2026 enterprise compliance standards.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-4 text-xs font-meta">
              <span>Current Revenue: <strong className="text-[var(--ink)] font-mono">{money(orders.reduce((s, o) => s + (o.amountPaid || 0), 0))}</strong></span>
              <span>Outstanding: <strong className="text-[var(--ink)] font-mono">{money(orders.reduce((s, o) => s + (o.balanceDue || 0), 0))}</strong></span>
              <span>Recorded Orders: <strong className="text-[var(--ink)] font-mono">{orders.length}</strong></span>
            </div>
            <p className="text-[10px] text-[var(--muted)]">
              Wipes revenue records across all dashboards. An automated audit archive (CSV) will be downloaded prior to reset.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setResetAccountingOpen(true)}
            className="btn !py-2 !px-4 text-xs font-bold bg-red-600 hover:bg-red-500 text-white border-red-600 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <span>⚠️</span>
            <span>Zero Out Accounting ($0.00)</span>
          </button>
        </div>

        <ResetAccountingModal
          orders={orders}
          isOpen={resetAccountingOpen}
          onClose={() => setResetAccountingOpen(false)}
        />
      </div>
    </div>
  );
}

/* ================= ANALYTICS — WEBSITE INTELLIGENCE DASHBOARD ================= */

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="border border-[var(--line)] p-5 rounded-2xl" style={{ background: "var(--panel)" }}>
      <span className={labelCls}>{label}</span>
      <p className="font-display-wide text-2xl sm:text-3xl font-bold mt-2 truncate" style={tone ? { color: tone } : undefined}>{value}</p>
      {sub && <p className="font-meta text-[9px] text-[var(--muted)] mt-1">{sub}</p>}
    </div>
  );
}

function Bar({ label, value, max, pct }: { label: string; value: number; max: number; pct?: string }) {
  const width = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="font-meta text-[9px] w-36 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 h-4 border border-[var(--line)] overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
        <div className="h-full dept-bg transition-all duration-500 rounded-full" style={{ width: `${width}%` }} />
      </div>
      <span className="font-meta text-[10px] w-10 text-right shrink-0 font-mono">{pct ?? value}</span>
    </div>
  );
}

type AnalyticsTab = "overview" | "geo" | "visitors" | "traffic" | "services" | "rhythm" | "tech" | "funnel" | "campaigns" | "ai";

const ANALYTICS_TABS: { id: AnalyticsTab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "geo", label: "Geo & Map", icon: "🗺️" },
  { id: "visitors", label: "Live Visitors", icon: "👥" },
  { id: "traffic", label: "Traffic & Sources", icon: "🌐" },
  { id: "services", label: "Service Demand", icon: "🎯" },
  { id: "rhythm", label: "24×7 Heatmap", icon: "⏰" },
  { id: "tech", label: "Tech & Devices", icon: "💻" },
  { id: "funnel", label: "Funnel & Journeys", icon: "🔽" },
  { id: "campaigns", label: "Campaigns", icon: "📣" },
  { id: "ai", label: "AI Insights", icon: "✨" },
];

function getSegmentBadge(segment: string, score: number) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    hot: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", border: "rgba(239, 68, 68, 0.3)" },
    high_intent: { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b", border: "rgba(245, 158, 11, 0.3)" },
    engaged: { bg: "rgba(139, 92, 246, 0.15)", text: "#8b5cf6", border: "rgba(139, 92, 246, 0.3)" },
    interested: { bg: "rgba(6, 182, 212, 0.15)", text: "#06b6d4", border: "rgba(6, 182, 212, 0.3)" },
    cold: { bg: "rgba(156, 163, 175, 0.15)", text: "#9ca3af", border: "rgba(156, 163, 175, 0.3)" },
  };
  const c = colors[segment] || colors.cold;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8.5px] font-bold uppercase tracking-wider border font-mono"
      style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
    >
      <span>{segment.replace("_", " ")}</span>
      <span className="opacity-80">({score})</span>
    </span>
  );
}

function Analytics() {
  const money = useMoney();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [tab, setTab] = useState<AnalyticsTab>("overview");
  const [days, setDays] = useState(30);

  // Funnel switcher: lead vs booking
  const [selectedFunnel, setSelectedFunnel] = useState<"lead" | "booking">("lead");

  // Geo view mode: map vs list
  const [geoView, setGeoView] = useState<"map" | "list">("map");

  // Executive briefing modal
  const [showExecutiveBriefing, setShowExecutiveBriefing] = useState(false);

  // Visitor Journey Inspection Modal
  const [inspectSession, setInspectSession] = useState<SessionData | null>(null);
  const [sessionEvents, setSessionEvents] = useState<AnalyticsEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Revenue / pipeline from orders (always available)
  const revenue = orders.reduce((s, o) => s + o.amountPaid, 0);
  const aov = orders.length ? Math.round(orders.reduce((s, o) => s + o.total, 0) / orders.length) : 0;
  const outstanding = orders.reduce((s, o) => s + o.balanceDue, 0);
  const byStatus = ORDER_STATUSES.map((s) => ({ label: s, value: orders.filter((o) => o.status === s).length }));
  const statusMax = Math.max(1, ...byStatus.map((x) => x.value));
  const serviceCount = new Map<string, number>();
  orders.forEach((o) => o.items.forEach((i) => serviceCount.set(i.name, (serviceCount.get(i.name) ?? 0) + 1)));
  const topOrderServices = [...serviceCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const svcMax = Math.max(1, ...topOrderServices.map(([, v]) => v));
  const byIntent = ["quote", "consultation", "question"].map((i) => ({ label: i.toUpperCase(), value: leads.filter((l) => l.intent === i).length }));
  const intentMax = Math.max(1, ...byIntent.map((x) => x.value));

  // Telemetry & Platform Analytics state
  const [sessionCount, setSessionCount] = useState(0);
  const [liveVisitors, setLiveVisitors] = useState<SessionData[]>([]);
  const [topPages, setTopPages] = useState<{ path: string; views: number }[]>([]);
  const [trafficSources, setTrafficSources] = useState<{ source: string; sessions: number }[]>([]);
  const [serviceInterest, setServiceInterest] = useState<{ service_name: string; service_slug: string; views: number }[]>([]);
  const [funnelCounts, setFunnelCounts] = useState<Record<string, number>>({});
  const [campaigns, setCampaigns] = useState<{ campaign: string; source: string; medium: string; sessions: number }[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionData[]>([]);
  const [geoData, setGeoData] = useState<GeoDistributionRecord[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapCell[]>([]);
  const [techData, setTechData] = useState<TechDistribution>({ devices: [], browsers: [], osList: [] });
  const [entryExitData, setEntryExitData] = useState<EntryExitPageRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // AI Q&A interactive state
  const [aiQuery, setAiQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState<{ query: string; answer: string; insight: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Live count by country for map pulsating dots
  const liveCountByCountry = useMemo(() => {
    const counts: Record<string, number> = {};
    liveVisitors.forEach((v) => {
      const code = v.country_code || "JM";
      counts[code] = (counts[code] || 0) + 1;
    });
    return counts;
  }, [liveVisitors]);

  // Lead source attribution breakdown from lead records
  const leadSources = useMemo(() => {
    const counts = new Map<string, number>();
    leads.forEach((l) => {
      const src = (l as any).first_touch_source || "direct";
      counts.set(src, (counts.get(src) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count }));
  }, [leads]);

  useEffect(() => {
    const unsubOrders = subscribeAllOrders(setOrders);
    const unsubLeads = subscribeLeads(setLeads);
    return () => { unsubOrders(); unsubLeads(); };
  }, []);

  const refreshAnalytics = () => {
    setLoading(true);
    Promise.all([
      getSessionCount(days).then(setSessionCount),
      getActiveLiveVisitors(15).then(setLiveVisitors),
      getTopPages(days, 10).then(setTopPages),
      getTrafficSources(days).then(setTrafficSources),
      getServiceInterestRanking(days).then(setServiceInterest),
      getFunnelCounts(days).then(setFunnelCounts),
      getCampaignPerformance(days).then(setCampaigns),
      getRecentSessions(25).then(setRecentSessions),
      getGeographicDistribution(days).then(setGeoData),
      getActivityHeatmap(days).then(setHeatmapData),
      getTechnologyDistribution(days).then(setTechData),
      getEntryAndExitPages(days).then(setEntryExitData),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshAnalytics();
    const handleUpdate = () => refreshAnalytics();
    window.addEventListener("sk-analytics-updated", handleUpdate);
    // Heartbeat auto-poll for live telemetry & visitor updates every 10 seconds
    const interval = setInterval(() => {
      void getActiveLiveVisitors(15).then(setLiveVisitors);
      void getGeographicDistribution(days).then(setGeoData);
      void getRecentSessions(25).then(setRecentSessions);
      void getSessionCount(days).then(setSessionCount);
    }, 10_000);
    return () => {
      window.removeEventListener("sk-analytics-updated", handleUpdate);
      clearInterval(interval);
    };
  }, [days]);

  // Open visitor session journey
  const openVisitorJourney = async (session: SessionData) => {
    setInspectSession(session);
    setLoadingEvents(true);
    const evs = await getSessionEvents(session.session_id);
    setSessionEvents(evs);
    setLoadingEvents(false);
  };

  // Predefined AI Questions Grounded Resolver
  const answerNaturalQuery = (q: string) => {
    setAiQuery(q);
    setAiLoading(true);
    setTimeout(() => {
      let answer = "";
      let insight = "";

      const lower = q.toLowerCase();
      if (lower.includes("where") || lower.includes("source") || lower.includes("come from")) {
        const topSrc = trafficSources[0] ? trafficSources[0].source : "Direct traffic";
        const topSessions = trafficSources[0] ? trafficSources[0].sessions : sessionCount;
        answer = `Your top acquisition channel is "${topSrc}", accounting for ${topSessions.toLocaleString()} sessions. Other active sources include ${trafficSources.slice(1, 4).map(s => `"${s.source}" (${s.sessions})`).join(", ") || "search and direct visits"}.`;
        insight = `Recommendation: Increase marketing investment on "${topSrc}" and test UTM-tagged campaign links on secondary channels to improve source diversification.`;
      } else if (lower.includes("service") || lower.includes("attention") || lower.includes("interest")) {
        const topSvc = serviceInterest[0] ? serviceInterest[0].service_name : (topOrderServices[0] ? topOrderServices[0][0] : "Branding & Identity");
        const views = serviceInterest[0] ? serviceInterest[0].views : (funnelCounts["service_view"] || 12);
        answer = `"${topSvc}" is currently your highest-interest service with ${views} recorded visitor views across the last ${days} days.`;
        insight = `Recommendation: Ensure the "${topSvc}" page features clear client testimonials, deposit pricing transparency, and a high-contrast kickoff CTA.`;
      } else if (lower.includes("campaign") || lower.includes("most leads")) {
        const topCamp = campaigns[0] ? campaigns[0].campaign : "Direct / Organic";
        answer = `Campaign "${topCamp}" is driving the strongest conversion momentum, with ${campaigns[0]?.sessions ?? sessionCount} tracked visits and multiple engaged sessions.`;
        insight = `Recommendation: Scale budget for "${topCamp}" and duplicate its ad creative hook across other promotional channels.`;
      } else if (lower.includes("drop") || lower.includes("dropping off")) {
        const sv = funnelCounts["service_view"] || 0;
        const fs = funnelCounts["form_start"] || 0;
        const dropPct = sv > 0 ? Math.round(((sv - fs) / sv) * 100) : 0;
        answer = `The largest drop-off in your conversion funnel occurs between Service Views (${sv}) and Form Starts (${fs}), representing a ${dropPct}% abandonment rate.`;
        insight = `Recommendation: Add an instant "Get a Quote in 60s" mini-form or the interactive Service Matcher directly on high-traffic service pages to lower initial commitment friction.`;
      } else if (lower.includes("improve") || lower.includes("pages")) {
        const topP = topPages[0]?.path || "/services";
        answer = `High-traffic landing pages "${topP}" and "/packages" receive the bulk of your visitor flow.`;
        insight = `Recommendation: Optimize mobile scroll speed, add clear pricing tiers, and embed social proof tokens on "${topP}".`;
      } else {
        answer = `Based on ${sessionCount} visits over the last ${days} days, your studio has captured ${leads.length} leads and generated ${money(revenue)} in collected revenue with an average order value of ${money(aov)}.`;
        insight = `Recommendation: Focus on converting the ${recentSessions.filter(s => s.segment === "high_intent" || s.segment === "hot").length} high-intent visitors through fast proposal turnarounds.`;
      }

      setAiAnswer({ query: q, answer, insight });
      setAiLoading(false);
    }, 300);
  };

  const sourceMax = Math.max(1, ...trafficSources.map((s) => s.sessions));
  const interestMax = Math.max(1, ...serviceInterest.map((s) => s.views));
  const pagesMax = Math.max(1, ...topPages.map((p) => p.views));

  // Funnel calculations
  const leadFunnelSteps = [
    { key: "page_view", label: "Page Views", icon: "👁️", color: "var(--dept)" },
    { key: "service_view", label: "Service Views", icon: "🎯", color: "#8b5cf6" },
    { key: "pricing_view", label: "Pricing Views", icon: "🏷️", color: "#3b82f6" },
    { key: "cta_click", label: "CTA Clicks", icon: "⚡", color: "#ec4899" },
    { key: "form_start", label: "Form Started", icon: "✏️", color: "#f59e0b" },
    { key: "form_submit", label: "Form Submitted", icon: "📨", color: "#06b6d4" },
    { key: "lead_submit", label: "Leads Captured", icon: "🧲", color: "#10b981" },
  ];

  const bookingFunnelSteps = [
    { key: "page_view", label: "Page Views", icon: "👁️", color: "var(--dept)" },
    { key: "service_view", label: "Service / Shop Views", icon: "🎯", color: "#8b5cf6" },
    { key: "cta_click", label: "Add to Cart", icon: "🛒", color: "#ec4899" },
    { key: "checkout_start", label: "Checkout Started", icon: "💳", color: "#f59e0b" },
    { key: "checkout_complete", label: "Orders Paid", icon: "✅", color: "#22c55e" },
  ];

  const activeFunnelSteps = selectedFunnel === "lead" ? leadFunnelSteps : bookingFunnelSteps;
  const funnelValues = activeFunnelSteps.map((s) => s.key === "page_view" ? (funnelCounts[s.key] ?? Math.max(sessionCount * 2, 1)) : (funnelCounts[s.key] ?? 0));
  const funnelMax = Math.max(1, ...funnelValues);

  // Peak heatmap cell
  const peakHeatmapCell = useMemo(() => {
    if (heatmapData.length === 0) return null;
    return heatmapData.reduce((prev, current) => (current.sessions > prev.sessions ? current : prev), heatmapData[0]);
  }, [heatmapData]);

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const FULL_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <div className="space-y-8">
      {/* Analytics top toolbar: day range, executive brief, export menu, live status */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--line)]">
        <div className="flex items-center gap-2">
          {(["7", "14", "30", "90"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(Number(d))}
              className={`font-meta text-[10px] px-3 py-1.5 rounded-xl border transition-all ${
                days === Number(d)
                  ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-bold shadow-xs"
                  : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)] hover:text-[var(--ink)]"
              }`}
            >
              {d}d
            </button>
          ))}
          {loading && <span className="font-meta text-[9px] text-[var(--muted)] animate-pulse ml-2">Refreshing…</span>}
        </div>

        {/* Action buttons: Briefing, Exports & Live badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 font-meta text-[9px] font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{liveVisitors.length} ACTIVE NOW</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--line)] bg-[var(--panel)] font-meta text-[8.5px] text-[var(--muted)]">
            <span className={`w-1.5 h-1.5 rounded-full ${firebaseReady ? "bg-emerald-500" : "bg-cyan-500"}`} />
            <span>{firebaseReady ? "FIREBASE CONNECTED" : "LOCAL BUFFER ACTIVE"}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowExecutiveBriefing(true)}
            className="btn btn-dept !py-1 !px-3 font-meta text-[9px] rounded-xl flex items-center gap-1.5 font-bold shadow-xs"
            title="Generate 1-Click Executive Summary & PDF Briefing"
          >
            <span>📊</span>
            <span>Executive Briefing</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const columns = [
                  { key: "sessionId", header: "Session ID" },
                  { key: "startedAt", header: "Started At" },
                  { key: "lastActive", header: "Last Active" },
                  { key: "country", header: "Country" },
                  { key: "source", header: "Traffic Source" },
                  { key: "campaign", header: "Campaign" },
                  { key: "landingPage", header: "Landing Page" },
                  { key: "pages", header: "Pages Viewed" },
                  { key: "score", header: "Engagement Score" },
                  { key: "segment", header: "Visitor Segment" },
                  { key: "converted", header: "Converted" },
                ];
                exportToCsv(
                  "sessions-analytics",
                  columns,
                  recentSessions.map((s) => ({
                    sessionId: s.session_id,
                    startedAt: s.started_at,
                    lastActive: s.last_active,
                    country: s.country_name || "Jamaica",
                    source: s.utm_source || "direct",
                    campaign: s.utm_campaign || "(none)",
                    landingPage: s.landing_page,
                    pages: s.page_count,
                    score: s.engagement_score,
                    segment: s.segment,
                    converted: s.converted ? "YES" : "NO",
                  }))
                );
                toast.success("Sessions exported to CSV");
              }}
              className="btn btn-ghost !py-1 !px-2.5 font-meta text-[9px] rounded-xl"
              title="Export Session Telemetry to CSV"
            >
              📥 Export CSV
            </button>

            <button
              type="button"
              onClick={() => {
                exportToJson("analytics-data", [
                  {
                    revenue,
                    ordersCount: orders.length,
                    leadsCount: leads.length,
                    sessionsCount: sessionCount,
                    topPages,
                    trafficSources,
                    serviceInterest,
                    funnelCounts,
                    geoData,
                    techData,
                    entryExitData,
                  },
                ]);
                toast.success("Analytics JSON archive downloaded");
              }}
              className="btn btn-ghost !py-1 !px-2.5 font-meta text-[9px] rounded-xl"
              title="Export Full Analytics Data to JSON"
            >
              📄 JSON
            </button>
          </div>
        </div>
      </div>

      {/* Sub-tab navigation strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {ANALYTICS_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`font-meta text-[10px] sm:text-[10.5px] px-3.5 py-2 rounded-xl border transition-all shrink-0 flex items-center gap-1.5 active:scale-95 ${
              tab === t.id
                ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-bold shadow-xs"
                : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--dept)] hover:text-[var(--ink)]"
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label.toUpperCase()}</span>
            {t.id === "visitors" && liveVisitors.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-white text-[8px] font-bold">
                {liveVisitors.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── 1. OVERVIEW TAB ─── */}
      {tab === "overview" && (
        <div className="space-y-10">
          {/* KPI row 1 — revenue */}
          <div>
            <span className="idx">/studio-financial-kpis</span>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
              <Stat label="REVENUE COLLECTED" value={money(revenue)} sub={`${orders.length} orders`} tone="#22c55e" />
              <Stat label="OUTSTANDING BALANCES" value={money(outstanding)} sub="deposits → final approval" />
              <Stat label="AVERAGE ORDER VALUE" value={money(aov)} />
              <Stat label="LEADS" value={String(leads.length)} sub={`${leads.filter((l) => l.status === "converted").length} converted`} />
            </div>
          </div>

          {/* KPI row 2 — web intelligence */}
          <div>
            <span className="idx">/web-telemetry ({days}d)</span>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
              <Stat label="TOTAL SESSIONS" value={sessionCount.toLocaleString()} sub={`last ${days} days`} tone="var(--dept)" />
              <Stat label="SERVICE VIEWS" value={(funnelCounts["service_view"] ?? 0).toLocaleString()} sub="interested visitors" />
              <Stat label="INTENT SIGNALS" value={(funnelCounts["form_start"] ?? 0).toLocaleString()} sub="form started" />
              <Stat label="CONVERSIONS" value={((funnelCounts["form_submit"] ?? 0) + (funnelCounts["checkout_complete"] ?? 0)).toLocaleString()} sub="leads + orders" tone="#22c55e" />
            </div>
          </div>

          {/* Pipeline + popular services + lead intents */}
          <div className="grid lg:grid-cols-3 gap-8">
            <div>
              <span className="idx">/order-pipeline</span>
              <div className="flex flex-col gap-2.5 mt-4">
                {byStatus.map((x) => <Bar key={x.label} label={x.label} value={x.value} max={statusMax} />)}
              </div>
            </div>
            <div>
              <span className="idx">/top-ordered-services</span>
              <div className="flex flex-col gap-2.5 mt-4">
                {topOrderServices.length === 0 && <p className="font-meta text-[10px] text-[var(--muted)]">No orders yet.</p>}
                {topOrderServices.map(([name, v]) => <Bar key={name} label={name.toUpperCase()} value={v} max={svcMax} />)}
              </div>
            </div>
            <div>
              <span className="idx">/lead-intents</span>
              <div className="flex flex-col gap-2.5 mt-4">
                {byIntent.map((x) => <Bar key={x.label} label={x.label} value={x.value} max={intentMax} />)}
              </div>
              {leadSources.length > 0 && (
                <div className="mt-6 pt-4 border-t border-[var(--line)]">
                  <span className="idx">/lead-attribution-sources</span>
                  <div className="flex flex-col gap-2 mt-3">
                    {leadSources.slice(0, 5).map((s) => (
                      <div key={s.source} className="flex items-center justify-between font-meta text-[10px]">
                        <span className="text-[var(--muted)] truncate max-w-[140px]">{s.source}</span>
                        <span className="font-bold dept-accent">{s.count} lead{s.count !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── 2. GEOGRAPHIC INTELLIGENCE & MAP TAB ─── */}
      {tab === "geo" && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="idx">/geographic-visitor-intelligence ({days}d)</span>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
                Visual spatial distribution and country-level conversion performance.
              </p>
            </div>
            {/* View Mode Toggle: Map vs List */}
            <div className="flex items-center gap-1 bg-[var(--panel)] p-1 border border-[var(--line)] rounded-xl">
              <button
                type="button"
                onClick={() => setGeoView("map")}
                className={`font-meta text-[9.5px] px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  geoView === "map" ? "bg-[var(--dept)] text-[var(--on-dept)] font-bold" : "text-[var(--muted)]"
                }`}
              >
                <span>🗺️</span>
                <span>Interactive Map</span>
              </button>
              <button
                type="button"
                onClick={() => setGeoView("list")}
                className={`font-meta text-[9.5px] px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  geoView === "list" ? "bg-[var(--dept)] text-[var(--on-dept)] font-bold" : "text-[var(--muted)]"
                }`}
              >
                <span>📋</span>
                <span>Ranked Country List</span>
              </button>
            </div>
          </div>

          {/* Interactive World Map View */}
          {geoView === "map" && (
            <div className="space-y-6">
              <GeoWorldMap data={geoData} liveCountByCountry={liveCountByCountry} />

              {/* Geographic KPI Summary Chips */}
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
                  <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider block">DOMINANT MARKET</span>
                  <p className="font-display text-base font-bold mt-1 flex items-center gap-1.5">
                    {geoData[0] ? (
                      <>
                        <span>{geoData[0].flag}</span>
                        <span>{geoData[0].country_name}</span>
                      </>
                    ) : (
                      <span className="text-[var(--muted)] font-normal text-sm">No traffic recorded yet</span>
                    )}
                  </p>
                  <span className="font-meta text-[9px] text-[var(--muted)] mt-0.5 block">
                    {geoData[0] ? `${geoData[0].share_pct}% of all visitors` : "0% total share"}
                  </span>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
                  <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider block">ACTIVE REGIONS</span>
                  <p className="font-display text-base font-bold mt-1 font-mono">
                    {geoData.length} Countr{geoData.length === 1 ? "y" : "ies"}
                  </p>
                  <span className="font-meta text-[9px] text-[var(--muted)] mt-0.5 block">Global reach</span>
                </div>

                <div className="p-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
                  <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider block">TOP REGIONAL CVR</span>
                  <p className="font-display text-base font-bold mt-1 font-mono text-emerald-500">
                    {geoData.length > 0 ? `${Math.max(0, ...geoData.map((g) => g.cvr))}% CVR` : "0% CVR"}
                  </p>
                  <span className="font-meta text-[9px] text-[var(--muted)] mt-0.5 block">Highest converting region</span>
                </div>
              </div>
            </div>
          )}

          {/* Country Leaderboard Table View */}
          {geoView === "list" && (
            <div className="border border-[var(--line)] overflow-hidden rounded-2xl" style={{ background: "var(--panel)" }}>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--bg)]">
                    {["Country", "Code", "Sessions", "Traffic Share", "Conversions", "CVR %", "Top Cities"].map((h) => (
                      <th key={h} className="px-4 py-3 font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {geoData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center font-meta text-[10px] text-[var(--muted)]">
                        No geographic telemetry recorded yet.
                      </td>
                    </tr>
                  ) : (
                    geoData.map((g, i) => (
                      <tr key={g.country_code} className={`border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg)] transition-colors ${i % 2 === 0 ? "" : "bg-[var(--bg)]/50"}`}>
                        <td className="px-4 py-3 font-display text-[11px] font-bold">
                          <span className="mr-1.5">{g.flag}</span>
                          <span>{g.country_name}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[9px] text-[var(--muted)] font-bold">{g.country_code}</td>
                        <td className="px-4 py-3 font-mono text-[10px] font-bold">{g.sessions.toLocaleString()}</td>
                        <td className="px-4 py-3 font-meta text-[10px]">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 rounded-full bg-[var(--line)] overflow-hidden">
                              <div className="h-full rounded-full dept-bg" style={{ width: `${g.share_pct}%` }} />
                            </div>
                            <span className="font-bold">{g.share_pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-emerald-500 font-bold">{g.conversions}</td>
                        <td className="px-4 py-3 font-mono text-[10px] font-bold text-emerald-500">{g.cvr}%</td>
                        <td className="px-4 py-3 font-meta text-[9.5px] text-[var(--muted)]">
                          {g.top_cities.join(", ") || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── 3. LIVE VISITORS & JOURNEYS TAB (PRD §Live Visitor Dashboard) ─── */}
      {tab === "visitors" && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="idx">/realtime-active-visitors</span>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
                Visitors active in the last 15 minutes. Click any visitor to inspect their journey map.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshAnalytics}
              className="btn btn-ghost !py-1 !px-3 text-[9.5px] rounded-xl flex items-center gap-1.5"
            >
              <span>🔄</span>
              <span>Refresh Realtime</span>
            </button>
          </div>

          {/* Live Visitors Table */}
          <div className="border border-[var(--line)] overflow-hidden rounded-2xl" style={{ background: "var(--panel)" }}>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--bg)]">
                  {["Status / Score", "Last Active", "Origin", "Device & OS", "Source / Campaign", "Current Page", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center font-meta text-[10px] text-[var(--muted)]">
                      No visitor telemetry recorded yet. Browse any page to record your visit in real time!
                    </td>
                  </tr>
                ) : (
                  recentSessions.map((s, i) => {
                    const isLive = new Date().getTime() - new Date(s.last_active).getTime() < 15 * 60_000;
                    return (
                      <tr key={s.session_id} className={`border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg)] transition-colors ${i % 2 === 0 ? "" : "bg-[var(--bg)]/50"}`}>
                        <td className="px-4 py-3 font-meta text-[10px]">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isLive ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} title={isLive ? "Active now" : "Recent"} />
                            {getSegmentBadge(s.segment || "cold", s.engagement_score || 0)}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-meta text-[9.5px] text-[var(--muted)]">
                          {new Date(s.last_active).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="px-4 py-3 font-meta text-[10px]">
                          <span className="flex items-center gap-1">
                            <span>{s.country_flag || "🇯🇲"}</span>
                            <span>{s.country_name || "Jamaica"}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 font-meta text-[10px] capitalize">
                          <span className="flex items-center gap-1">
                            <span>{s.device_type === "mobile" ? "📱" : s.device_type === "tablet" ? "📟" : "💻"}</span>
                            <span>{s.browser || "Chrome"} · {s.os || "macOS"}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 font-meta text-[10px]">
                          <span className="font-bold dept-accent block">{s.utm_source || "direct"}</span>
                          {s.utm_campaign && <span className="text-[8.5px] text-[var(--muted)] block">{s.utm_campaign}</span>}
                        </td>
                        <td className="px-4 py-3 font-meta text-[10px] truncate max-w-[180px]" title={s.current_page || s.landing_page}>
                          <code className="text-[9px] bg-[var(--bg)] px-1.5 py-0.5 rounded border border-[var(--line)]">{s.current_page || s.landing_page}</code>
                        </td>
                        <td className="px-4 py-3 font-meta text-[10px]">
                          <button
                            type="button"
                            onClick={() => openVisitorJourney(s)}
                            className="btn btn-dept !py-1 !px-2.5 text-[9px] rounded-xl"
                          >
                            View Journey 🔍
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── 4. TRAFFIC & SOURCES TAB (with Entry vs. Exit Bounce Analysis) ─── */}
      {tab === "traffic" && (
        <div className="space-y-10">
          <div className="grid lg:grid-cols-2 gap-8">
            <div>
              <span className="idx">/traffic-acquisition-sources ({days}d)</span>
              <div className="flex flex-col gap-2.5 mt-4">
                {trafficSources.length === 0 && <p className="font-meta text-[10px] text-[var(--muted)]">No source data yet.</p>}
                {trafficSources.map((s) => (
                  <Bar key={s.source} label={s.source.toUpperCase()} value={s.sessions} max={sourceMax} />
                ))}
              </div>
            </div>
            <div>
              <span className="idx">/top-visited-pages ({days}d)</span>
              <div className="flex flex-col gap-2.5 mt-4">
                {topPages.length === 0 && <p className="font-meta text-[10px] text-[var(--muted)]">No page view data yet.</p>}
                {topPages.map((p) => (
                  <Bar key={p.path} label={p.path} value={p.views} max={pagesMax} />
                ))}
              </div>
            </div>
          </div>

          {/* Top Entry vs. Exit & Bounce Rate Table */}
          <div>
            <span className="idx">/entry-vs-exit-and-bounce-rates</span>
            <p className="font-meta text-[10px] text-[var(--muted)] mt-1 mb-4">
              Identifies landing pages that capture visits vs drop-off bounce pages needing CTA optimization.
            </p>
            <div className="border border-[var(--line)] overflow-hidden rounded-2xl" style={{ background: "var(--panel)" }}>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--bg)]">
                    {["Page Path", "Landing Entries", "Exits", "Bounces", "Bounce Rate %", "Performance"].map((h) => (
                      <th key={h} className="px-4 py-3 font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entryExitData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center font-meta text-[10px] text-[var(--muted)]">
                        No page entry/exit telemetry recorded yet.
                      </td>
                    </tr>
                  ) : (
                    entryExitData.map((p, i) => (
                      <tr key={p.path} className={`border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg)] transition-colors ${i % 2 === 0 ? "" : "bg-[var(--bg)]/50"}`}>
                        <td className="px-4 py-3 font-mono text-[10px] font-bold truncate max-w-[200px]">
                          <code>{p.path}</code>
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px]">{p.entry_count}</td>
                        <td className="px-4 py-3 font-mono text-[10px] text-[var(--muted)]">{p.exit_count}</td>
                        <td className="px-4 py-3 font-mono text-[10px]">{p.bounce_count}</td>
                        <td className="px-4 py-3 font-mono text-[10px] font-bold" style={{ color: p.bounce_rate > 50 ? "#ef4444" : "#22c55e" }}>
                          {p.bounce_rate}%
                        </td>
                        <td className="px-4 py-3 font-meta text-[9px]">
                          {p.bounce_rate <= 30 ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 font-bold">
                              ✓ High Engagement
                            </span>
                          ) : p.bounce_rate <= 60 ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 font-bold">
                              ⚡ Standard
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/30 font-bold">
                              ⚠️ Optimize CTA
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── 5. SERVICE DEMAND INTELLIGENCE TAB ─── */}
      {tab === "services" && (
        <div className="space-y-10">
          <div className="grid lg:grid-cols-2 gap-8">
            <div>
              <span className="idx">/service-demand-interest ({days}d)</span>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-1 mb-4">Services receiving the most visitor engagement</p>
              <div className="flex flex-col gap-2.5">
                {serviceInterest.length === 0 && <p className="font-meta text-[10px] text-[var(--muted)]">No service view data yet. Visit any service page to generate telemetry.</p>}
                {serviceInterest.map((s) => (
                  <Bar key={s.service_slug} label={s.service_name} value={s.views} max={interestMax} />
                ))}
              </div>
            </div>
            <div>
              <span className="idx">/completed-service-orders</span>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-1 mb-4">Services converted into paid studio orders</p>
              <div className="flex flex-col gap-2.5">
                {topOrderServices.length === 0 && <p className="font-meta text-[10px] text-[var(--muted)]">No orders yet.</p>}
                {topOrderServices.map(([name, v]) => <Bar key={name} label={name} value={v} max={svcMax} />)}
              </div>
            </div>
          </div>

          {/* Interest vs Conversion insight */}
          {serviceInterest.length > 0 && (
            <div>
              <span className="idx">/opportunity-matrix (Interest vs Conversion)</span>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-1 mb-4">High interest + low conversion = highest ROI optimization opportunity</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {serviceInterest.slice(0, 6).map((s) => {
                  const orderedCount = serviceCount.get(s.service_name) ?? 0;
                  const cvr = s.views > 0 ? Math.round((orderedCount / s.views) * 100) : 0;
                  return (
                    <div key={s.service_slug} className="border border-[var(--line)] p-4 rounded-2xl" style={{ background: "var(--panel)" }}>
                      <p className="font-display text-[11px] font-bold uppercase truncate">{s.service_name}</p>
                      <div className="flex items-center justify-between mt-2 font-meta text-[10px]">
                        <span className="text-[var(--muted)]">{s.views} views · {orderedCount} orders</span>
                        <span className="font-bold font-mono" style={{ color: cvr > 5 ? "#22c55e" : cvr > 0 ? "#f59e0b" : "#ef4444" }}>
                          {cvr}% CVR
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[var(--line)] mt-2.5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full dept-bg" style={{ width: `${Math.min(100, Math.max(cvr * 5, 8))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 6. 24×7 PEAK ACTIVITY HEATMAP TAB ("Studio Rhythm Grid") ─── */}
      {tab === "rhythm" && (
        <div className="space-y-8">
          <div>
            <span className="idx">/24x7-peak-activity-heatmap ({days}d)</span>
            <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
              Time-matrix analysis illustrating exactly when visitors and potential clients browse and convert.
            </p>
          </div>

          {/* Peak Recommendation Banner */}
          {peakHeatmapCell && peakHeatmapCell.sessions > 0 && (
            <div className="p-4 rounded-2xl border border-[var(--dept)]/40 bg-[var(--dept)]/10 flex items-center gap-3">
              <span className="text-2xl">🔥</span>
              <div>
                <p className="font-display text-xs font-bold uppercase text-[var(--ink)]">
                  Peak Studio Activity: {FULL_DAY_NAMES[peakHeatmapCell.day]} at {String(peakHeatmapCell.hour).padStart(2, "0")}:00
                </p>
                <p className="font-meta text-[10px] text-[var(--muted)] mt-0.5">
                  Optimal timing to launch Instagram campaigns, send proposals, or schedule live consultative broadcasts.
                </p>
              </div>
            </div>
          )}

          {/* 7-Day x 24-Hour Matrix Grid */}
          <div className="border border-[var(--line)] p-4 sm:p-6 rounded-2xl overflow-x-auto" style={{ background: "var(--panel)" }}>
            <div className="min-w-[680px]">
              {/* Hour Headers */}
              <div className="grid grid-cols-[60px_repeat(24,1fr)] gap-1 mb-2 text-center">
                <span className="font-meta text-[8.5px] text-[var(--muted)] text-left">DAY</span>
                {Array.from({ length: 24 }).map((_, h) => (
                  <span key={h} className="font-mono text-[7.5px] text-[var(--muted)]">
                    {h % 3 === 0 ? `${h}h` : ""}
                  </span>
                ))}
              </div>

              {/* Day Rows */}
              {DAY_NAMES.map((dayName, dIdx) => (
                <div key={dayName} className="grid grid-cols-[60px_repeat(24,1fr)] gap-1 mb-1.5 items-center">
                  <span className="font-display text-[9.5px] font-bold uppercase text-[var(--muted)]">{dayName}</span>
                  {Array.from({ length: 24 }).map((_, hIdx) => {
                    const cell = heatmapData.find((c) => c.day === dIdx && c.hour === hIdx) || { sessions: 0, intensity: 0 };
                    const isHot = cell.sessions > 0;
                    return (
                      <div
                        key={hIdx}
                        className="h-6 rounded-xs transition-transform hover:scale-125 cursor-pointer relative group"
                        style={{
                          backgroundColor: isHot
                            ? `rgba(var(--dept-rgb, 124, 58, 237), ${Math.max(0.15, cell.intensity)})`
                            : "var(--bg)",
                          border: "1px solid var(--line)",
                        }}
                      >
                        {/* Hover Tooltip */}
                        <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block pointer-events-none p-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-lg font-meta text-[8px] whitespace-nowrap text-[var(--ink)]">
                          {FULL_DAY_NAMES[dIdx]} {String(hIdx).padStart(2, "0")}:00 · <strong>{cell.sessions} visits</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Heatmap Legend */}
            <div className="flex items-center justify-between text-[9px] font-meta text-[var(--muted)] mt-4 pt-3 border-t border-[var(--line)]">
              <span>Low Visitor Traffic</span>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-xs bg-[var(--bg)] border border-[var(--line)]" />
                <span className="w-3 h-3 rounded-xs bg-[var(--dept)]/20 border border-[var(--line)]" />
                <span className="w-3 h-3 rounded-xs bg-[var(--dept)]/50 border border-[var(--line)]" />
                <span className="w-3 h-3 rounded-xs bg-[var(--dept)] border border-[var(--line)]" />
              </div>
              <span>Peak Concentrated Traffic</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── 7. TECHNOLOGY, BROWSER & OS MATRIX TAB ─── */}
      {tab === "tech" && (
        <div className="space-y-8">
          <div>
            <span className="idx">/technology-and-client-environment ({days}d)</span>
            <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
              Device hardware, browser engine, and operating system breakdown.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Device Form Factors */}
            <div className="p-5 rounded-2xl border border-[var(--line)] space-y-4" style={{ background: "var(--panel)" }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">📱</span>
                <h3 className="font-display text-xs font-bold uppercase tracking-wide">Device Forms</h3>
              </div>
              <div className="space-y-3">
                {techData.devices.map((d) => (
                  <div key={d.label}>
                    <div className="flex justify-between font-meta text-[10px] mb-1">
                      <span className="capitalize">{d.label}</span>
                      <span className="font-mono font-bold">{d.count} ({d.pct}%)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[var(--line)] overflow-hidden">
                      <div className="h-full rounded-full dept-bg" style={{ width: `${d.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Browsers */}
            <div className="p-5 rounded-2xl border border-[var(--line)] space-y-4" style={{ background: "var(--panel)" }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">🌐</span>
                <h3 className="font-display text-xs font-bold uppercase tracking-wide">Browsers</h3>
              </div>
              <div className="space-y-3">
                {techData.browsers.map((b) => (
                  <div key={b.label}>
                    <div className="flex justify-between font-meta text-[10px] mb-1">
                      <span>{b.label}</span>
                      <span className="font-mono font-bold">{b.count} ({b.pct}%)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[var(--line)] overflow-hidden">
                      <div className="h-full rounded-full dept-bg" style={{ width: `${b.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Operating Systems */}
            <div className="p-5 rounded-2xl border border-[var(--line)] space-y-4" style={{ background: "var(--panel)" }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">💻</span>
                <h3 className="font-display text-xs font-bold uppercase tracking-wide">Operating Systems</h3>
              </div>
              <div className="space-y-3">
                {techData.osList.map((o) => (
                  <div key={o.label}>
                    <div className="flex justify-between font-meta text-[10px] mb-1">
                      <span>{o.label}</span>
                      <span className="font-mono font-bold">{o.count} ({o.pct}%)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[var(--line)] overflow-hidden">
                      <div className="h-full rounded-full dept-bg" style={{ width: `${o.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 8. FUNNEL & JOURNEYS TAB (PRD §Funnel Builder) ─── */}
      {tab === "funnel" && (
        <div className="space-y-8">
          {/* Funnel Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="idx">/multi-funnel-analysis ({days}d)</span>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
                Step-by-step conversion drop-off analysis across primary studio pathways.
              </p>
            </div>
            <div className="flex items-center gap-1 bg-[var(--panel)] p-1 border border-[var(--line)] rounded-xl">
              <button
                type="button"
                onClick={() => setSelectedFunnel("lead")}
                className={`font-meta text-[9.5px] px-3 py-1.5 rounded-lg transition-all ${
                  selectedFunnel === "lead" ? "bg-[var(--dept)] text-[var(--on-dept)] font-bold" : "text-[var(--muted)]"
                }`}
              >
                🧲 Lead Funnel
              </button>
              <button
                type="button"
                onClick={() => setSelectedFunnel("booking")}
                className={`font-meta text-[9.5px] px-3 py-1.5 rounded-lg transition-all ${
                  selectedFunnel === "booking" ? "bg-[var(--dept)] text-[var(--on-dept)] font-bold" : "text-[var(--muted)]"
                }`}
              >
                🛒 Booking / Checkout Funnel
              </button>
            </div>
          </div>

          {/* Conversion Funnel Bar Stages */}
          <div className="p-6 border border-[var(--line)] rounded-2xl space-y-4" style={{ background: "var(--panel)" }}>
            {activeFunnelSteps.map((step, i) => {
              const v = funnelValues[i];
              const prevV = i > 0 ? funnelValues[i - 1] : null;
              const dropPct = prevV && prevV > 0 ? Math.round(((prevV - v) / prevV) * 100) : null;
              return (
                <div key={step.key} className="relative">
                  {i > 0 && dropPct !== null && (
                    <div className="flex items-center gap-2 mb-1 ml-36">
                      <div className="h-px w-4 bg-[var(--line)]" />
                      <span className={`font-meta text-[8.5px] ${dropPct > 50 ? "text-red-500 font-bold" : "text-[var(--muted)]"}`}>
                        {dropPct > 0 ? `↓ ${dropPct}% drop-off` : "→ maintained"}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-base shrink-0 w-6 text-center">{step.icon}</span>
                    <span className="font-meta text-[10px] w-36 shrink-0 text-[var(--muted)] truncate">{step.label}</span>
                    <div className="flex-1 h-6 border border-[var(--line)] overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
                      <div
                        className="h-full transition-all duration-700 rounded-full"
                        style={{
                          width: `${funnelMax ? Math.round((v / funnelMax) * 100) : 0}%`,
                          background: step.color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <span className="font-display text-xs font-bold w-12 text-right shrink-0 font-mono">{v.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Funnel KPI Summary Cards */}
          <div className="grid sm:grid-cols-3 gap-3">
            {(() => {
              const sv = funnelCounts["service_view"] ?? 0;
              const fs = funnelCounts["form_start"] ?? 0;
              const ls = funnelCounts["lead_submit"] ?? 0;
              const cc = funnelCounts["checkout_complete"] ?? 0;
              const formCvr = sv > 0 ? ((fs / sv) * 100).toFixed(1) : "0.0";
              const leadCvr = fs > 0 ? ((ls / fs) * 100).toFixed(1) : "0.0";
              const orderCvr = ls > 0 ? ((cc / ls) * 100).toFixed(1) : "0.0";
              return (
                <>
                  <Stat label="VIEW → FORM CVR" value={`${formCvr}%`} sub="Service views starting a form" />
                  <Stat label="FORM → LEAD CVR" value={`${leadCvr}%`} sub="Form starts completing submission" />
                  <Stat label="LEAD → ORDER CVR" value={`${orderCvr}%`} sub="Leads converting to paid orders" />
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ─── 9. CAMPAIGNS TAB ─── */}
      {tab === "campaigns" && (
        <div className="space-y-8">
          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[var(--line)] rounded-2xl" style={{ background: "var(--panel)" }}>
              <span className="text-4xl mb-4">📣</span>
              <p className="font-display text-sm font-bold uppercase">No UTM Campaign Data</p>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-2 max-w-sm">
                Add UTM parameters to your marketing links to track campaigns here.
                Example: <code className="text-[9px] bg-[var(--bg)] px-1 py-0.5 rounded">?utm_source=instagram&utm_medium=social&utm_campaign=aug2026</code>
              </p>
            </div>
          ) : (
            <>
              <div>
                <span className="idx">/utm-campaign-performance ({days}d)</span>
                <div className="mt-4 border border-[var(--line)] overflow-hidden rounded-2xl" style={{ background: "var(--panel)" }}>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[var(--line)] bg-[var(--bg)]">
                        {["Campaign Name", "Source", "Medium", "Sessions Generated"].map((h) => (
                          <th key={h} className="px-4 py-3 font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c, i) => (
                        <tr key={`${c.campaign}-${i}`} className={`border-b border-[var(--line)] last:border-0 ${i % 2 === 0 ? "" : "bg-[var(--bg)]"}`}>
                          <td className="px-4 py-2.5 font-display text-[11px] font-bold">{c.campaign}</td>
                          <td className="px-4 py-2.5 font-meta text-[10px] dept-accent font-bold">{c.source}</td>
                          <td className="px-4 py-2.5 font-meta text-[10px] text-[var(--muted)]">{c.medium}</td>
                          <td className="px-4 py-2.5 font-meta text-[10px] font-bold font-mono">{c.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <span className="idx">/campaign-rankings</span>
                <div className="flex flex-col gap-2.5 mt-4">
                  {campaigns.slice(0, 8).map((c) => (
                    <Bar
                      key={`${c.campaign}|${c.source}`}
                      label={`${c.campaign} (${c.source})`}
                      value={c.sessions}
                      max={Math.max(1, ...campaigns.map((x) => x.sessions))}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── 10. AI INSIGHTS & NATURAL LANGUAGE QUERY TAB (PRD §AI Analytics) ─── */}
      {tab === "ai" && (
        <div className="space-y-8">
          {/* AI Assistant Interactive Q&A Engine */}
          <div className="border border-[var(--line)] p-6 md:p-8 rounded-2xl shadow-xs" style={{ background: "var(--panel)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">✨</span>
              <h3 className="font-display text-sm font-bold uppercase tracking-wide">Studio AI Intelligence Assistant</h3>
            </div>
            <p className="font-meta text-[10px] text-[var(--muted)] max-w-xl">
              Ask natural-language business questions about your visitor traffic, conversion bottlenecks, campaign ROI, and service demand.
            </p>

            {/* Predefined PRD Questions Quick Chips */}
            <div className="mt-5">
              <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider block mb-2">Frequently Asked Intelligence Queries:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Where are my visitors coming from?",
                  "What service is getting the most attention?",
                  "Which campaign generated the most leads?",
                  "Where are visitors dropping off?",
                  "What pages should I improve?",
                  "Which service has the highest buying intent?",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => answerNaturalQuery(q)}
                    className="font-meta text-[9.5px] px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:border-[var(--dept)] text-[var(--ink)] transition-colors text-left"
                  >
                    💡 {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Query Input */}
            <div className="mt-5 flex gap-2">
              <input
                className={`${inputCls} rounded-xl`}
                placeholder="Ask anything about your website analytics..."
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && aiQuery.trim() && answerNaturalQuery(aiQuery)}
              />
              <button
                type="button"
                onClick={() => aiQuery.trim() && answerNaturalQuery(aiQuery)}
                disabled={aiLoading || !aiQuery.trim()}
                className="btn btn-dept !py-2 !px-4 text-xs font-bold rounded-xl shrink-0"
              >
                {aiLoading ? "Analyzing…" : "Ask AI ✨"}
              </button>
            </div>

            {/* Answer Display */}
            {aiAnswer && (
              <div className="mt-6 p-5 rounded-2xl border border-[var(--dept)]/40 bg-[var(--dept)]/5 space-y-3 animate-fade-in">
                <div className="flex items-center gap-2 font-display text-xs font-bold uppercase text-[var(--ink)]">
                  <span>✨</span>
                  <span>{aiAnswer.query}</span>
                </div>
                <p className="font-meta text-[11px] leading-relaxed text-[var(--ink)]">
                  {aiAnswer.answer}
                </p>
                <div className="pt-2 border-t border-[var(--line)] text-[10px] font-meta text-[var(--muted)] italic">
                  {aiAnswer.insight}
                </div>
              </div>
            )}
          </div>

          {/* Strategic Automated Smart Insight Cards */}
          <div>
            <span className="idx">/automated-intelligence-signals</span>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              {[
                {
                  icon: "🔥",
                  title: "Top Conversion Opportunity",
                  body: `Your most viewed service${serviceInterest[0] ? ` (${serviceInterest[0].service_name})` : ""} has visitors showing high intent. Consider adding a prominent CTA or special bundle offer to this page.`,
                  tone: "#ef4444",
                },
                {
                  icon: "🌱",
                  title: "Traffic Source to Grow",
                  body: trafficSources.length > 0
                    ? `"${trafficSources[0].source}" drives your highest session volume. Double down on this channel for the strongest organic ROI.`
                    : "Add UTM parameters to your Instagram and social posts to identify top-performing acquisition channels.",
                  tone: "#22c55e",
                },
                {
                  icon: "⚡",
                  title: "Funnel Optimization",
                  body: "Most visitor drop-off happens between service views and form submissions. A time-limited deposit offer or live chat nudge could bridge this gap.",
                  tone: "#f59e0b",
                },
                {
                  icon: "📈",
                  title: "Lead Quality Signal",
                  body: leads.filter((l) => (l as any).first_touch_source).length > 0
                    ? `${leads.filter((l) => (l as any).first_touch_source).length} of your leads have first-party UTM attribution. Prioritize channels driving booked discovery calls.`
                    : "First-party tracking is capturing lead attribution automatically on every new submission.",
                  tone: "var(--dept)",
                },
              ].map((insight) => (
                <div key={insight.title} className="border border-[var(--line)] p-5 rounded-2xl" style={{ background: "var(--panel)" }}>
                  <div className="flex items-center gap-3 mb-2.5">
                    <span className="text-xl">{insight.icon}</span>
                    <p className="font-display text-[12px] font-bold uppercase" style={{ color: insight.tone }}>{insight.title}</p>
                  </div>
                  <p className="font-meta text-[11px] text-[var(--muted)] leading-relaxed">{insight.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── EXECUTIVE BRIEFING REPORT MODAL ─── */}
      {showExecutiveBriefing && (
        <ExecutiveBriefingModal
          days={days}
          revenue={revenue}
          aov={aov}
          sessionCount={sessionCount}
          leadsCount={leads.length}
          ordersCount={orders.length}
          topPages={topPages}
          trafficSources={trafficSources}
          serviceInterest={serviceInterest}
          geoData={geoData}
          techData={techData}
          recentSessions={recentSessions}
          onClose={() => setShowExecutiveBriefing(false)}
        />
      )}

      {/* ─── VISITOR JOURNEY MAP MODAL ─── */}
      {inspectSession && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto border border-[var(--line-strong)] rounded-2xl p-6 shadow-2xl space-y-5"
            style={{ background: "var(--panel)", color: "var(--ink)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🗺️</span>
                  <h3 className="font-display text-sm font-bold uppercase tracking-tight">Visitor Journey Map</h3>
                </div>
                <p className="font-meta text-[9px] text-[var(--muted)] mt-0.5">Session #{inspectSession.session_id.slice(0, 12)}</p>
              </div>
              <button
                type="button"
                onClick={() => { setInspectSession(null); setSessionEvents([]); }}
                className="btn btn-ghost !py-1 !px-2 text-xs rounded-xl"
              >
                ✕ Close
              </button>
            </div>

            {/* Session Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-meta">
              <div className="p-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)]">
                <span className="text-[var(--muted)] block text-[8.5px]">SOURCE</span>
                <span className="font-bold dept-accent">{inspectSession.utm_source || "direct"}</span>
              </div>
              <div className="p-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)]">
                <span className="text-[var(--muted)] block text-[8.5px]">ORIGIN</span>
                <span className="font-bold">{inspectSession.country_flag || "🇯🇲"} {inspectSession.country_name || "Jamaica"}</span>
              </div>
              <div className="p-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)]">
                <span className="text-[var(--muted)] block text-[8.5px]">DEVICE & OS</span>
                <span className="font-bold capitalize">{inspectSession.device_type} · {inspectSession.os || "macOS"}</span>
              </div>
              <div className="p-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)]">
                <span className="text-[var(--muted)] block text-[8.5px]">SCORE & SEGMENT</span>
                <span className="font-bold capitalize">{inspectSession.segment} ({inspectSession.engagement_score})</span>
              </div>
            </div>

            {/* Chronological Timeline */}
            <div>
              <span className="idx">/interaction-timeline</span>
              {loadingEvents ? (
                <p className="font-meta text-[10px] text-[var(--muted)] py-6 text-center animate-pulse">Loading journey events…</p>
              ) : sessionEvents.length === 0 ? (
                <div className="mt-3 p-4 rounded-xl border border-[var(--line)] text-center font-meta text-[10px] text-[var(--muted)]">
                  Landing page: <code className="text-[var(--ink)] font-bold">{inspectSession.landing_page}</code>
                  <p className="mt-1">Pages viewed: {inspectSession.page_count}</p>
                </div>
              ) : (
                <div className="mt-3 space-y-2 relative border-l border-[var(--line)] ml-3 pl-4">
                  {sessionEvents.map((ev, idx) => (
                    <div key={`${ev.event_name}-${idx}`} className="relative font-meta text-[10px]">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[var(--dept)]" />
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold uppercase text-[var(--ink)]">{ev.event_name.replace("_", " ")}</span>
                        <span className="text-[8.5px] text-[var(--muted)]">
                          {new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                      <code className="text-[8.5px] text-[var(--muted)] block mt-0.5">{ev.path}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ================= HOMEPAGE CMS (PRD §85) ================= */

function HomepageManager() {
  const [s, setS] = useState<SiteSettings>({});
  useEffect(() => { getSettings().then(setS); }, []);

  const home = s.home ?? {};
  const setHome = (patch: Partial<NonNullable<SiteSettings["home"]>>) =>
    setS((prev) => ({ ...prev, home: { ...prev.home, ...patch } }));
  const sections = home.sections ?? {};

  return (
    <div className="max-w-2xl">
      <p className="font-meta text-[10px] text-[var(--muted)] mb-6">
        Edit the front page without code (PRD §85). Blank headline/sub keep the defaults. Changes go live immediately.
      </p>
      <div className="flex flex-col gap-4">
        <label className={labelCls}>HERO HEADLINE
          <input className={`${inputCls} mt-1.5`} placeholder="We build brands that get noticed." value={home.headline ?? ""} onChange={(e) => setHome({ headline: e.target.value })} />
        </label>
        <label className={labelCls}>HERO SUB-STATEMENT
          <textarea rows={2} className={`${inputCls} mt-1.5`} placeholder="Branding. Social Media. Websites. Creative strategy built to help businesses look better, connect better and grow." value={home.sub ?? ""} onChange={(e) => setHome({ sub: e.target.value })} />
        </label>
        <label className={labelCls}>MARQUEE ITEMS (one per line)
          <textarea rows={4} className={`${inputCls} mt-1.5`} placeholder={`Branding\nSocial Media\nWebsites`} value={home.marquee ?? ""} onChange={(e) => setHome({ marquee: e.target.value })} />
        </label>
        <div>
          <span className={labelCls}>SECTIONS</span>
          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            {HOME_SECTIONS.map((sec) => (
              <label key={sec.key} className="font-meta text-[10px] flex items-center gap-2.5 border border-[var(--line)] px-3 py-2.5 cursor-pointer" style={{ background: "var(--panel)" }}>
                <input type="checkbox" className="accent-[var(--dept)] w-4 h-4"
                  checked={sections[sec.key] !== false}
                  onChange={(e) => setHome({ sections: { ...sections, [sec.key]: e.target.checked } })} />
                {sec.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <button className="btn btn-dept !py-2.5 mt-6" onClick={() => mutate(() => saveSettings({ ...s, home }), "Homepage saved — live now")}>Save homepage</button>
    </div>
  );
}

/* ================= COMMUNICATIONS & MEETINGS (communication-meetings-v1) ================= */

function AdminCommunications() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [calls, setCalls] = useState<CallHistoryRecord[]>([]);
  const [clientDirectory, setClientDirectory] = useState<{ email: string; name: string; info: string }[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<"meetings" | "calendar" | "calls" | "intelligence">("meetings");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // Modals
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [instantCallModalOpen, setInstantCallModalOpen] = useState(false);

  // Schedule Form State
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formTime, setFormTime] = useState("14:00");
  const [formDuration, setFormDuration] = useState(30);
  const [formTimezone, setFormTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [formParticipants, setFormParticipants] = useState("");
  const formType: SessionType = "scheduled_meeting";
  const [formPasscode, setFormPasscode] = useState(() => generatePasscode());
  const [formWaitingRoom, setFormWaitingRoom] = useState(true);
  const [formAuthReq, setFormAuthReq] = useState(true);
  const [formAiSummary, setFormAiSummary] = useState(true);
  const [formRecording, setFormRecording] = useState(true);
  const formScreenShare = "everyone";
  const [savingMeeting, setSavingMeeting] = useState(false);

  // Instant Call Form State
  const [instantName, setInstantName] = useState("");
  const [instantEmail, setInstantEmail] = useState("");
  const [instantType, setInstantType] = useState<"video" | "voice">("video");
  const [ordersList, setOrdersList] = useState<OrderRecord[]>([]);
  const [startingCall, setStartingCall] = useState(false);

  // Email typeahead (searches the client directory built from orders & leads)
  const [emailPicked, setEmailPicked] = useState(false);
  const [emailSugOpen, setEmailSugOpen] = useState(false);
  const [emailSugIdx, setEmailSugIdx] = useState(0);
  const emailBoxRef = useRef<HTMLDivElement>(null);

  const instantEmailQuery = instantEmail.trim().toLowerCase();
  const emailSuggestions = (!instantEmailQuery || emailPicked)
    ? []
    : clientDirectory
        .filter((c) => c.email.includes(instantEmailQuery) || c.name.toLowerCase().includes(instantEmailQuery))
        .slice(0, 6);

  const pickEmailSuggestion = (c: { email: string; name: string }) => {
    setInstantEmail(c.email);
    setInstantName(c.name);
    setEmailPicked(true);
    setEmailSugOpen(false);
  };

  // close the suggestion list on outside click
  useEffect(() => {
    if (!emailSugOpen) return;
    const fn = (e: MouseEvent) => {
      if (emailBoxRef.current && !emailBoxRef.current.contains(e.target as Node)) setEmailSugOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [emailSugOpen]);

  const reloadData = async () => {
    const [m, c, ords, lds] = await Promise.all([
      listAllMeetings(),
      listCallHistory(),
      listAllOrders(),
      listLeads(),
    ]);
    setMeetings(m);
    setCalls(c);
    setOrdersList(ords);

    // Build directory of clients from orders & leads
    const clientMap = new Map<string, { email: string; name: string; info: string }>();
    ords.forEach((o) => {
      if (o.email) {
        clientMap.set(o.email.toLowerCase(), {
          email: o.email.toLowerCase(),
          name: o.name || o.email.split("@")[0],
          info: o.company ? `${o.company} · #${o.id.slice(0, 6)}` : `Order #${o.id.slice(0, 6)}`,
        });
      }
    });
    lds.forEach((l) => {
      if (l.email && !clientMap.has(l.email.toLowerCase())) {
        clientMap.set(l.email.toLowerCase(), {
          email: l.email.toLowerCase(),
          name: l.name || l.email.split("@")[0],
          info: `Lead · ${l.service || "General"}`,
        });
      }
    });
    setClientDirectory(Array.from(clientMap.values()));
  };

  useEffect(() => {
    reloadData();
  }, []);

  const filteredMeetings = meetings.filter((m) => {
    if (filterStatus !== "ALL" && m.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchHost = m.hostName.toLowerCase().includes(q);
      const matchPart = m.participants.some((p) => p.displayName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
      return matchTitle || matchHost || matchPart;
    }
    return true;
  });

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDate || !formTime) {
      toast.error("Please fill in the meeting title, date, and start time.");
      return;
    }

    setSavingMeeting(true);
    try {
      const startIso = new Date(`${formDate}T${formTime}:00`).toISOString();
      const endIso = new Date(new Date(startIso).getTime() + formDuration * 60000).toISOString();

      const parsedParticipants = formParticipants
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((pStr) => {
          const isEmail = pStr.includes("@");
          return {
            id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            meetingId: "",
            email: isEmail ? pStr : `${pStr.toLowerCase().replace(/\s+/g, ".")}@client.local`,
            displayName: isEmail ? pStr.split("@")[0] : pStr,
            role: "participant" as const,
            status: "invited" as const,
          };
        });

      const newM = await createMeeting({
        title: formTitle.trim(),
        description: formDesc.trim(),
        hostId: user?.uid || "admin",
        hostName: user?.displayName || "Social Kon10 Studio",
        hostEmail: user?.email || "admin@socialkon10.pro",
        type: formType,
        status: "scheduled",
        scheduledStart: startIso,
        scheduledEnd: endIso,
        durationMinutes: formDuration,
        timezone: formTimezone,
        passcode: formPasscode,
        waitingRoomEnabled: formWaitingRoom,
        authenticationRequired: formAuthReq,
        meetingLocked: false,
        allowGuests: !formAuthReq,
        recordingEnabled: formRecording,
        transcriptionEnabled: true,
        aiSummaryEnabled: formAiSummary,
        chatEnabled: true,
        reactionsEnabled: true,
        screenShareMode: formScreenShare,
        allowCamera: true,
        allowMicrophone: true,
        participants: parsedParticipants,
      });

      // Automatically post invitation into any matching client project threads
      for (const p of parsedParticipants) {
        const matchingOrders = ordersList.filter((o) => o.email?.toLowerCase() === p.email.toLowerCase());
        for (const o of matchingOrders) {
          try {
            await postMessage(
              o.id,
              "studio",
              `📅 Studio scheduled a meeting: "${newM.title}" for ${new Date(startIso).toLocaleDateString()} at ${new Date(startIso).toLocaleTimeString()}.\n\n🔑 Meeting Code: ${newM.roomId}\n🚀 Join Link: ${window.location.origin}/meet/${newM.roomId}${newM.passcode ? `\n🔒 Passcode PIN: ${newM.passcode}` : ""}`,
              "Social Kon10 Studio"
            );
          } catch {
            // non-blocking
          }
        }
      }

      toast.success(`Meeting "${newM.title}" scheduled and invites prepared.`);
      setScheduleModalOpen(false);
      setFormTitle("");
      setFormDesc("");
      setFormParticipants("");
      reloadData();
    } catch (err) {
      console.error("Schedule meeting failed:", err);
      toast.error("Failed to schedule meeting.");
    } finally {
      setSavingMeeting(false);
    }
  };

  const handleStartInstantCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instantEmail.trim()) {
      toast.error("Please enter the client's email address.");
      return;
    }

    setStartingCall(true);
    try {
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 60 * 60000).toISOString();
      const title = `Instant ${instantType === "video" ? "Video" : "Voice"} Call with ${instantName || instantEmail}`;

      const meet = await createMeeting({
        title,
        description: "Studio initiated instant consultation session.",
        hostId: user?.uid || "admin",
        hostName: user?.displayName || "Social Kon10 Studio",
        hostEmail: user?.email || "admin@socialkon10.pro",
        type: instantType === "video" ? "instant_video_call" : "instant_voice_call",
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
        allowCamera: instantType === "video",
        allowMicrophone: true,
        participants: [
          {
            id: `p_admin_${Date.now()}`,
            meetingId: "",
            email: user?.email || "admin@socialkon10.pro",
            displayName: user?.displayName || "Social Kon10 Studio",
            role: "host",
            status: "joined",
          },
          {
            id: `p_client_${Date.now()}`,
            meetingId: "",
            email: instantEmail.trim().toLowerCase(),
            displayName: instantName.trim() || instantEmail.split("@")[0],
            role: "participant",
            status: "waiting",
          },
        ],
      });

      // Record in call history with ringing state
      await recordCallHistory({
        sessionId: meet.roomId,
        callerId: user?.uid || "admin",
        callerName: user?.displayName || "Social Kon10 Studio",
        callerEmail: user?.email || "admin@socialkon10.pro",
        recipientId: instantEmail.trim(),
        recipientName: instantName.trim() || instantEmail.split("@")[0],
        recipientEmail: instantEmail.trim().toLowerCase(),
        type: instantType,
        status: "ringing",
        startedAt: now,
        durationSeconds: 0,
      });

      setInstantCallModalOpen(false);
      window.open(`/meet/${meet.roomId}`, "_blank");
      reloadData();
    } catch (err) {
      console.error("Instant call error:", err);
      toast.error("Failed to initiate instant call.");
    } finally {
      setStartingCall(false);
    }
  };

  const [selectedMeetingIds, setSelectedMeetingIds] = useState<string[]>([]);
  const [selectedCallIds, setSelectedCallIds] = useState<string[]>([]);

  const toggleMeetingSelection = (id: string) => {
    setSelectedMeetingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllFilteredMeetings = () => {
    setSelectedMeetingIds(filteredMeetings.map((m) => m.id));
  };

  const clearMeetingSelection = () => {
    setSelectedMeetingIds([]);
  };

  const handleBatchMeetingStatus = async (status: string) => {
    const nextStatus = status as MeetingRecord["status"];
    const ok = await mutate(
      () => setMeetingsStatus(selectedMeetingIds, nextStatus),
      `Updated ${selectedMeetingIds.length} meetings to ${nextStatus}`
    );
    if (ok) {
      clearMeetingSelection();
      reloadData();
    }
  };

  const handleBatchMeetingDelete = async () => {
    const count = selectedMeetingIds.length;
    const ok = await mutate(
      () => deleteMeetings(selectedMeetingIds),
      `Deleted ${count} meetings`
    );
    if (ok) {
      clearMeetingSelection();
      reloadData();
    }
  };

  const handleMeetingExportCsv = () => {
    const exportData = meetings.filter((m) => selectedMeetingIds.includes(m.id));
    exportToCsv<MeetingRecord>(
      "Meetings_Export",
      [
        { key: "id", header: "Meeting ID" },
        { key: "roomId", header: "Room Code" },
        { key: "title", header: "Title" },
        { key: "hostName", header: "Host" },
        { key: "status", header: "Status" },
        { key: "scheduledStart", header: "Scheduled Start", format: (m) => m.scheduledStart || "" },
        { key: "durationMinutes", header: "Duration (Mins)", format: (m) => m.durationMinutes || 30 },
        { key: "timezone", header: "Timezone", format: (m) => m.timezone || "" },
        { key: "participants", header: "Participants", format: (m) => m.participants.map((p) => `${p.displayName} (${p.email})`).join("; ") },
        { key: "createdAt", header: "Created Date", format: (m) => m.createdAt || "" },
      ],
      exportData
    );
    toast.success(`Exported ${exportData.length} meetings to CSV`);
  };

  const handleMeetingExportJson = () => {
    const exportData = meetings.filter((m) => selectedMeetingIds.includes(m.id));
    exportToJson("Meetings_Export", exportData);
    toast.success(`Exported ${exportData.length} meetings to JSON`);
  };

  const toggleCallSelection = (id: string) => {
    setSelectedCallIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllCalls = () => {
    setSelectedCallIds(calls.map((c) => c.id));
  };

  const clearCallSelection = () => {
    setSelectedCallIds([]);
  };

  const handleBatchCallDelete = async () => {
    const count = selectedCallIds.length;
    const ok = await mutate(
      () => deleteCalls(selectedCallIds),
      `Deleted ${count} call logs`
    );
    if (ok) {
      clearCallSelection();
      reloadData();
    }
  };

  const handleCallExportCsv = () => {
    const exportData = calls.filter((c) => selectedCallIds.includes(c.id));
    exportToCsv<CallHistoryRecord>(
      "Call_Logs_Export",
      [
        { key: "id", header: "Call ID" },
        { key: "type", header: "Call Type" },
        { key: "callerName", header: "Caller Name" },
        { key: "callerEmail", header: "Caller Email" },
        { key: "recipientName", header: "Recipient Name", format: (c) => c.recipientName || "" },
        { key: "recipientEmail", header: "Recipient Email", format: (c) => c.recipientEmail || "" },
        { key: "status", header: "Status" },
        { key: "durationSeconds", header: "Duration (Sec)", format: (c) => c.durationSeconds || 0 },
        { key: "startedAt", header: "Started At", format: (c) => c.startedAt || "" },
      ],
      exportData
    );
    toast.success(`Exported ${exportData.length} call logs to CSV`);
  };

  const handleCallExportJson = () => {
    const exportData = calls.filter((c) => selectedCallIds.includes(c.id));
    exportToJson("Call_Logs_Export", exportData);
    toast.success(`Exported ${exportData.length} call logs to JSON`);
  };

  const isAllFilteredMeetingsSelected = filteredMeetings.length > 0 && filteredMeetings.every((m) => selectedMeetingIds.includes(m.id));
  const isAllCallsSelected = calls.length > 0 && calls.every((c) => selectedCallIds.includes(c.id));

  return (
    <div className="space-y-6 relative">
      {/* Batch Action Bar for Meetings */}
      {activeSubTab === "meetings" && (
        <BatchActionBar
          selectedCount={selectedMeetingIds.length}
          totalCount={filteredMeetings.length}
          onClearSelection={clearMeetingSelection}
          onSelectAll={selectAllFilteredMeetings}
          statusOptions={[
            { label: "SCHEDULED", value: "scheduled" },
            { label: "LIVE", value: "live" },
            { label: "COMPLETED", value: "completed" },
            { label: "CANCELLED", value: "cancelled" },
          ]}
          onStatusChange={handleBatchMeetingStatus}
          onDelete={handleBatchMeetingDelete}
          deleteLabel="Delete Meetings"
          onExportCsv={handleMeetingExportCsv}
          onExportJson={handleMeetingExportJson}
          customActions={[
            {
              label: "Cancel Selected",
              icon: "✕",
              tone: "amber",
              onClick: () => handleBatchMeetingStatus("cancelled"),
            },
          ]}
        />
      )}

      {/* Batch Action Bar for Calls */}
      {activeSubTab === "calls" && (
        <BatchActionBar
          selectedCount={selectedCallIds.length}
          totalCount={calls.length}
          onClearSelection={clearCallSelection}
          onSelectAll={selectAllCalls}
          onDelete={handleBatchCallDelete}
          deleteLabel="Delete Call Logs"
          onExportCsv={handleCallExportCsv}
          onExportJson={handleCallExportJson}
        />
      )}

      {/* Hero Header & Instant Call Launcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-[var(--panel)] border border-[var(--line)] rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🎙️</span>
            <h2 className="font-display text-base font-bold uppercase tracking-wider">
              Studio Communications &amp; Video Ops
            </h2>
          </div>
          <p className="font-meta text-[11px] text-[var(--muted)] mt-1">
            Zero-friction WebRTC video meetings, screen sharing, call history, and AI meeting intelligence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setInstantCallModalOpen(true)}
            className="btn btn-dept !py-2 !px-4 font-meta text-[10px] uppercase font-bold flex items-center gap-1.5 shadow-sm"
          >
            <span>⚡</span> Direct Instant Call
          </button>
        </div>
      </div>

      {/* Sub-Tabs Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          <button
            onClick={() => setActiveSubTab("meetings")}
            className={`font-meta text-[10px] px-3.5 py-1.5 rounded-xl border transition-colors ${
              activeSubTab === "meetings" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            Scheduled Meetings ({meetings.length})
          </button>
          <button
            onClick={() => setActiveSubTab("calendar")}
            className={`font-meta text-[10px] px-3.5 py-1.5 rounded-xl border transition-colors ${
              activeSubTab === "calendar" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            Studio Calendar
          </button>
          <button
            onClick={() => setActiveSubTab("calls")}
            className={`font-meta text-[10px] px-3.5 py-1.5 rounded-xl border transition-colors ${
              activeSubTab === "calls" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            Call History ({calls.length})
          </button>
          <button
            onClick={() => setActiveSubTab("intelligence")}
            className={`font-meta text-[10px] px-3.5 py-1.5 rounded-xl border transition-colors ${
              activeSubTab === "intelligence" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            ✨ Meeting Intelligence ({meetings.filter((m) => m.intelligence).length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setScheduleModalOpen(true)}
            className="btn btn-dept !py-1.5 !px-3 font-meta text-[10px] uppercase font-bold"
          >
            + Schedule Meeting
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: MEETINGS LIST */}
      {activeSubTab === "meetings" && (
        <div className="flex flex-col gap-4">
          {/* Status filter & search */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {["ALL", "scheduled", "live", "completed", "cancelled"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`font-meta text-[9px] uppercase px-2.5 py-1 rounded-xl border transition-colors ${
                    filterStatus === s ? "bg-[var(--dept)] text-[var(--on-dept)] border-[var(--dept)] font-bold" : "border-[var(--line)] text-[var(--muted)]"
                  }`}
                >
                  {s}
                </button>
              ))}

              {filteredMeetings.length > 0 && (
                <label className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-meta text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer select-none ml-1 bg-[var(--panel)] border border-[var(--line)] rounded-xl">
                  <input
                    type="checkbox"
                    checked={isAllFilteredMeetingsSelected}
                    onChange={(e) => {
                      if (e.target.checked) selectAllFilteredMeetings();
                      else clearMeetingSelection();
                    }}
                    className="w-3.5 h-3.5 accent-[var(--dept)] rounded cursor-pointer"
                  />
                  <span>Select all ({filteredMeetings.length})</span>
                </label>
              )}
            </div>

            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meetings by title or participant…"
              className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded-xl w-full sm:w-64"
            />
          </div>

          {filteredMeetings.length === 0 ? (
            <div className="p-12 border border-[var(--line)] rounded-2xl text-center bg-[var(--panel)]">
              <span className="text-3xl block mb-2">📅</span>
              <p className="font-display text-sm font-bold uppercase">No meetings found</p>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-1">Schedule a consultation or review meeting to get started.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filteredMeetings.map((m) => {
                const isLive = m.status === "live";
                const isChecked = selectedMeetingIds.includes(m.id);
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
                    className={`p-5 border rounded-2xl flex flex-col justify-between gap-4 shadow-sm transition-all ${
                      isChecked
                        ? "border-[var(--dept)] bg-[var(--dept-soft)]/60 ring-1 ring-[var(--dept)]"
                        : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--dept)]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleMeetingSelection(m.id)}
                            className="w-3.5 h-3.5 accent-[var(--dept)] rounded cursor-pointer"
                            aria-label={`Select meeting ${m.title}`}
                          />
                          <span className={`font-meta text-[8.5px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                            isLive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 animate-pulse" :
                            m.status === "scheduled" ? "bg-cyan-500/10 text-cyan-500 border-cyan-500/30" :
                            m.status === "completed" ? "bg-neutral-500/10 text-neutral-400 border-neutral-500/30" :
                            "bg-red-500/10 text-red-500 border-red-500/30"
                          }`}>
                            {m.status}
                          </span>
                        </div>
                        <span className="font-meta text-[9px] text-[var(--muted)]">
                          {m.durationMinutes} mins · {m.timezone}
                        </span>
                      </div>

                      <h3 className="font-display text-base font-bold uppercase line-clamp-1">{m.title}</h3>
                      {m.description && <p className="text-xs text-[var(--muted)] line-clamp-2 mt-1">{m.description}</p>}

                      <div className="mt-3 p-2.5 bg-[var(--bg)] border border-[var(--line)] rounded-xl text-[11px] space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-[var(--ink)]">
                            📅 {dateStr} at {timeStr}
                          </p>
                          <button
                            type="button"
                            onClick={async () => {
                              const share = getMeetingShareDetails(m);
                              await share.copyRoomId();
                              toast.success(`Meeting code "${m.roomId}" copied!`);
                            }}
                            className="font-mono text-[9px] font-bold px-2 py-0.5 rounded-lg bg-[var(--dept-soft)] border border-[var(--dept)] text-[var(--dept)] hover:bg-[var(--dept)] hover:text-[var(--on-dept)] transition-colors"
                            title="Click to copy meeting code"
                          >
                            📋 {m.roomId}
                          </button>
                        </div>
                        <p className="font-meta text-[9.5px] text-[var(--muted)] truncate">
                          👥 {m.participants.length > 0 ? m.participants.map((p) => p.displayName).join(", ") : "Open invitation"}
                        </p>
                        {m.passcode && (
                          <div className="flex items-center justify-between">
                            <span className="font-meta text-[9.5px] text-[var(--muted)]">
                              🔑 Passcode: <code className="text-[var(--ink)] font-bold">{m.passcode}</code>
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                const share = getMeetingShareDetails(m);
                                await share.copyPasscode();
                                toast.success("Passcode copied!");
                              }}
                              className="font-meta text-[8.5px] text-[var(--muted)] hover:text-[var(--ink)]"
                            >
                              Copy PIN
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--line)]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={async () => {
                            const share = getMeetingShareDetails(m);
                            await share.copyInviteLink();
                            toast.success("Meeting link copied!");
                          }}
                          className="font-meta text-[9px] px-2.5 py-1 border border-[var(--dept)] dept-accent rounded-lg hover:bg-[var(--dept)] hover:text-[var(--on-dept)] bg-[var(--bg)] transition-colors font-bold"
                          title="Copy direct meeting join link"
                        >
                          🔗 Link
                        </button>
                        <button
                          onClick={async () => {
                            const share = getMeetingShareDetails(m);
                            await share.copyFullInvitation();
                            toast.success("Full invitation details copied!");
                          }}
                          className="font-meta text-[9px] px-2.5 py-1 border border-[var(--line)] rounded-lg hover:border-[var(--dept)] bg-[var(--bg)] transition-colors"
                          title="Copy full invitation for email or message"
                        >
                          ✉️ Text
                        </button>
                        <button
                          onClick={() => downloadCalendarIcs(m)}
                          className="font-meta text-[9px] px-2.5 py-1 border border-[var(--line)] rounded-lg hover:border-[var(--dept)] bg-[var(--bg)] transition-colors"
                          title="Download Calendar .ICS file"
                        >
                          📥 .ICS
                        </button>
                        <RemoveButton
                          onRemove={async () => {
                            await deleteMeeting(m.id);
                          }}
                          onDone={reloadData}
                        />
                      </div>

                      <button
                        onClick={() => window.open(`/meet/${m.roomId}`, "_blank")}
                        className="btn btn-dept !py-1.5 !px-3 font-display text-[10px] font-bold uppercase tracking-wider shadow-sm rounded-xl"
                      >
                        🚀 Join Room →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: VISUAL CALENDAR */}
      {activeSubTab === "calendar" && (
        <div className="p-6 border border-[var(--line)] rounded-2xl bg-[var(--panel)] space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold uppercase">Scheduled Studio Calendar</h3>
            <span className="font-meta text-[9px] text-[var(--muted)]">
              Timezone: <strong className="text-[var(--ink)]">{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>
            </span>
          </div>

          <div className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-xl bg-[var(--bg)]">
            {meetings.length === 0 ? (
              <p className="p-8 text-center text-xs text-[var(--muted)]">No meetings currently on the calendar.</p>
            ) : (
              meetings.map((m) => (
                <div key={m.id} className="p-4 flex flex-wrap items-center justify-between gap-4 text-xs hover:bg-[var(--dept-soft)]/20 transition-colors">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-display uppercase">{m.title}</span>
                      <span className="font-meta text-[8.5px] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--muted)]">{m.status}</span>
                    </div>
                    <p className="font-meta text-[10px] text-[var(--muted)]">
                      {new Date(m.scheduledStart).toLocaleString()} · {m.durationMinutes} mins · Room #{m.roomId}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadCalendarIcs(m)}
                      className="font-meta text-[9px] px-2.5 py-1 rounded-lg border border-[var(--line)] hover:border-[var(--dept)]"
                    >
                      Export .ICS
                    </button>
                    <button
                      onClick={() => window.open(`/meet/${m.roomId}`, "_blank")}
                      className="btn btn-dept !py-1 !px-2.5 font-meta text-[9px] rounded-lg"
                    >
                      Open Room
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: CALL HISTORY */}
      {activeSubTab === "calls" && (
        <div className="p-6 border border-[var(--line)] rounded-2xl bg-[var(--panel)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-bold uppercase">Instant Voice &amp; Video Call Logs</h3>
              <span className="font-meta text-[9px] text-[var(--muted)]">{calls.length} entries</span>
            </div>

            {calls.length > 0 && (
              <label className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-meta text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer select-none bg-[var(--bg)] border border-[var(--line)] rounded-xl">
                <input
                  type="checkbox"
                  checked={isAllCallsSelected}
                  onChange={(e) => {
                    if (e.target.checked) selectAllCalls();
                    else clearCallSelection();
                  }}
                  className="w-3.5 h-3.5 accent-[var(--dept)] rounded cursor-pointer"
                />
                <span>Select all ({calls.length})</span>
              </label>
            )}
          </div>

          <div className="border border-[var(--line)] rounded-xl divide-y divide-[var(--line)] bg-[var(--bg)] text-xs">
            {calls.length === 0 ? (
              <p className="p-8 text-center text-[var(--muted)]">No instant calls placed yet.</p>
            ) : (
              calls.map((c) => {
                const isChecked = selectedCallIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className={`p-3.5 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                      isChecked ? "bg-[var(--dept-soft)]/60" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCallSelection(c.id)}
                        className="w-3.5 h-3.5 accent-[var(--dept)] rounded cursor-pointer"
                        aria-label={`Select call with ${c.recipientName || c.recipientEmail}`}
                      />
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{c.type === "video" ? "🎥" : "📞"}</span>
                          <span className="font-bold">{c.recipientName || c.recipientEmail}</span>
                          <span className={`font-meta text-[8.5px] px-2 py-0.5 rounded border ${
                            c.status === "completed" || c.status === "accepted" ? "text-emerald-500 border-emerald-500/30" : "text-amber-500 border-amber-500/30"
                          }`}>
                            {c.status}
                          </span>
                        </div>
                        <p className="font-meta text-[9px] text-[var(--muted)]">
                          {new Date(c.startedAt).toLocaleString()} · Caller: {c.callerName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setInstantName(c.recipientName);
                          setInstantEmail(c.recipientEmail);
                          setInstantType(c.type);
                          setInstantCallModalOpen(true);
                        }}
                        className="font-meta text-[9px] px-3 py-1 border border-[var(--dept)] dept-accent rounded-lg hover:bg-[var(--dept)] hover:text-[var(--on-dept)] transition-colors"
                      >
                        Call Back ↻
                      </button>
                      <RemoveButton
                        onRemove={async () => {
                          await deleteCallHistory(c.id);
                        }}
                        onDone={reloadData}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: AI INTELLIGENCE & TRANSCRIPTS */}
      {activeSubTab === "intelligence" && (
        <div className="space-y-4">
          {meetings.filter((m) => m.intelligence).length === 0 ? (
            <div className="p-12 border border-[var(--line)] rounded-xl text-center bg-[var(--panel)]">
              <span className="text-3xl block mb-2">✨</span>
              <p className="font-display text-sm font-bold uppercase">No AI Summaries Generated Yet</p>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
                During or after a meeting, launch the "AI" panel inside the meeting room to generate structured decisions and action items.
              </p>
            </div>
          ) : (
            meetings.filter((m) => m.intelligence).map((m) => (
              <div key={m.id} className="p-6 border border-[var(--line)] rounded-xl bg-[var(--panel)] space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold uppercase">✨ {m.title}</h3>
                  <span className="font-meta text-[9px] text-[var(--muted)]">
                    Generated {new Date(m.intelligence!.generatedAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="p-4 bg-[var(--bg)] border border-[var(--line)] rounded-lg text-xs space-y-2">
                  <p className="font-display font-bold uppercase dept-accent text-[11px]">Executive Summary</p>
                  <p className="text-[var(--muted)] leading-relaxed">{m.intelligence!.summary}</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 bg-[var(--bg)] border border-[var(--line)] rounded-lg space-y-2">
                    <p className="font-display font-bold uppercase text-emerald-600 text-[11px]">Key Decisions</p>
                    <ul className="list-disc pl-4 space-y-1 text-[var(--muted)]">
                      {m.intelligence!.decisions.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 bg-[var(--bg)] border border-[var(--line)] rounded-lg space-y-2">
                    <p className="font-display font-bold uppercase text-amber-600 text-[11px]">Action Items</p>
                    <div className="space-y-1.5">
                      {m.intelligence!.actionItems.map((act, i) => (
                        <div key={i} className="p-2 border border-[var(--line)] rounded bg-[var(--panel)]">
                          <p className="font-bold text-[var(--ink)]">{act.task}</p>
                          <p className="font-meta text-[9px] text-[var(--muted)]">
                            Assignee: {act.assignee} · Due: {act.dueDate}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MODAL 1: SCHEDULE MEETING */}
      {scheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto p-3 sm:p-6">
          <div className="min-h-full flex items-start sm:items-center justify-center py-6 sm:py-10">
            <div className="bg-[var(--panel)] border border-[var(--line-strong)] rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-5 my-auto">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h3 className="font-display text-base font-bold uppercase">Schedule Studio Meeting</h3>
              <button onClick={() => setScheduleModalOpen(false)} className="text-[var(--muted)] hover:text-[var(--ink)]">✕</button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Meeting Title *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Brand Identity Kickoff & Vector Review"
                  className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 rounded outline-none focus:border-[var(--dept)]"
                />
              </div>

              <div>
                <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Description / Agenda</label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Outline key review goals or items to discuss…"
                  className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 rounded outline-none focus:border-[var(--dept)]"
                />
              </div>

              {/* Quick Client / Lead Selector */}
              {clientDirectory.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold">
                      Quick-Select Client from Orders &amp; Leads
                    </label>
                    <span className="font-meta text-[8.5px] text-[var(--muted)]">Click client to add to meeting</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-[var(--bg)] border border-[var(--line)] rounded-lg">
                    {clientDirectory.map((c) => {
                      const isSelected = formParticipants.toLowerCase().includes(c.email.toLowerCase());
                      return (
                        <button
                          key={c.email}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              // Remove email
                              const updated = formParticipants
                                .split(",")
                                .map((s) => s.trim())
                                .filter((s) => s.toLowerCase() !== c.email.toLowerCase())
                                .join(", ");
                              setFormParticipants(updated);
                            } else {
                              // Append email
                              const updated = formParticipants.trim()
                                ? `${formParticipants.trim()}, ${c.email}`
                                : c.email;
                              setFormParticipants(updated);
                              if (!formTitle.trim()) {
                                setFormTitle(`${c.name} — Studio Design & Strategy Review`);
                              }
                            }
                          }}
                          className={`font-meta text-[9px] px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition-all ${
                            isSelected
                              ? "bg-[var(--dept)] text-[var(--on-dept)] border-[var(--dept)] font-bold shadow-sm"
                              : "bg-[var(--panel)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--dept)]"
                          }`}
                        >
                          <span>{isSelected ? "✓" : "+"}</span>
                          <span className="font-medium">{c.name}</span>
                          <span className="opacity-70 text-[8px]">({c.info})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">
                  Invite Participants (Emails / Names)
                </label>
                <input
                  type="text"
                  value={formParticipants}
                  onChange={(e) => setFormParticipants(e.target.value)}
                  placeholder="e.g. client@brand.com, artdirector@studio.com"
                  className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 rounded outline-none focus:border-[var(--dept)]"
                />
                <p className="font-meta text-[8.5px] text-[var(--muted)] mt-1">
                  ℹ️ Meeting will automatically appear on the client's dashboard under "Meetings &amp; Calls".
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 rounded outline-none focus:border-[var(--dept)]"
                  />
                </div>

                <div>
                  <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 rounded outline-none focus:border-[var(--dept)]"
                  />
                </div>

                <div>
                  <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Duration</label>
                  <select
                    value={formDuration}
                    onChange={(e) => setFormDuration(Number(e.target.value))}
                    className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 rounded outline-none focus:border-[var(--dept)]"
                  >
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins (1 hr)</option>
                    <option value={90}>90 mins</option>
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Timezone</label>
                  <input
                    type="text"
                    value={formTimezone}
                    onChange={(e) => setFormTimezone(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 rounded outline-none focus:border-[var(--dept)]"
                  />
                </div>

                <div>
                  <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Meeting Passcode</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formPasscode}
                      onChange={(e) => setFormPasscode(e.target.value)}
                      className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 rounded outline-none focus:border-[var(--dept)]"
                    />
                    <button
                      type="button"
                      onClick={() => setFormPasscode(generatePasscode())}
                      className="px-2.5 py-1 border border-[var(--line)] rounded font-meta text-[9px]"
                      title="Generate new passcode"
                    >
                      🎲
                    </button>
                  </div>
                </div>
              </div>

              {/* Security & Features Toggles */}
              <div className="pt-2 border-t border-[var(--line)] space-y-2">
                <span className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block">Security &amp; Intelligence Controls</span>
                <div className="grid sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 border border-[var(--line)] rounded bg-[var(--bg)] cursor-pointer">
                    <input type="checkbox" checked={formWaitingRoom} onChange={(e) => setFormWaitingRoom(e.target.checked)} className="accent-[var(--dept)]" />
                    <span>Waiting Room Enabled</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 border border-[var(--line)] rounded bg-[var(--bg)] cursor-pointer">
                    <input type="checkbox" checked={formAiSummary} onChange={(e) => setFormAiSummary(e.target.checked)} className="accent-[var(--dept)]" />
                    <span>AI Meeting Intelligence</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 border border-[var(--line)] rounded bg-[var(--bg)] cursor-pointer">
                    <input type="checkbox" checked={formRecording} onChange={(e) => setFormRecording(e.target.checked)} className="accent-[var(--dept)]" />
                    <span>Cloud Recording</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 border border-[var(--line)] rounded bg-[var(--bg)] cursor-pointer">
                    <input type="checkbox" checked={formAuthReq} onChange={(e) => setFormAuthReq(e.target.checked)} className="accent-[var(--dept)]" />
                    <span>Require Authentication</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMeeting}
                  className="btn btn-dept !py-2 !px-5 font-display text-xs font-bold uppercase tracking-wider"
                >
                  {savingMeeting ? "Scheduling…" : "Confirm &amp; Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      )}

      {/* MODAL 2: INSTANT CALL */}
      {instantCallModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--panel)] border border-[var(--line-strong)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h3 className="font-display text-base font-bold uppercase">
                Instant {instantType === "video" ? "Video" : "Voice"} Call
              </h3>
              <button onClick={() => setInstantCallModalOpen(false)} className="text-[var(--muted)] hover:text-[var(--ink)]">✕</button>
            </div>

            <form onSubmit={handleStartInstantCall} className="space-y-4 text-xs">
              <div ref={emailBoxRef} className="relative">
                <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1" htmlFor="instant-email">
                  Client Email Address *
                </label>
                <input
                  id="instant-email"
                  type="email"
                  required
                  autoComplete="off"
                  value={instantEmail}
                  onChange={(e) => { setInstantEmail(e.target.value); setEmailPicked(false); setEmailSugIdx(0); setEmailSugOpen(true); }}
                  onFocus={() => setEmailSugOpen(true)}
                  onKeyDown={(e) => {
                    if (!emailSuggestions.length) return;
                    if (e.key === "ArrowDown") { e.preventDefault(); setEmailSugIdx((i) => (i + 1) % emailSuggestions.length); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setEmailSugIdx((i) => (i - 1 + emailSuggestions.length) % emailSuggestions.length); }
                    else if (e.key === "Enter" && emailSugOpen) { e.preventDefault(); pickEmailSuggestion(emailSuggestions[emailSugIdx]); }
                    else if (e.key === "Escape") setEmailSugOpen(false);
                  }}
                  placeholder="client@domain.com"
                  role="combobox"
                  aria-expanded={emailSugOpen && emailSuggestions.length > 0}
                  aria-controls="instant-email-suggestions"
                  aria-autocomplete="list"
                  className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 rounded outline-none focus:border-[var(--dept)]"
                />
                {emailSugOpen && emailSuggestions.length > 0 && (
                  <div
                    id="instant-email-suggestions"
                    role="listbox"
                    aria-label="Matching clients"
                    className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-[var(--panel)] border border-[var(--line-strong)] rounded-xl shadow-2xl overflow-hidden"
                  >
                    <p className="font-meta text-[8px] uppercase tracking-wider text-[var(--muted)] px-3 pt-2 pb-1">
                      From your clients — select to autofill
                    </p>
                    {emailSuggestions.map((c, i) => (
                      <button
                        key={c.email}
                        type="button"
                        role="option"
                        aria-selected={i === emailSugIdx}
                        onMouseEnter={() => setEmailSugIdx(i)}
                        onClick={() => pickEmailSuggestion(c)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2.5 border-t border-[var(--line)] transition-colors ${
                          i === emailSugIdx ? "bg-[var(--dept-soft)]" : "hover:bg-[var(--dept-soft)]"
                        }`}
                      >
                        <span className="w-6 h-6 rounded-full bg-[var(--dept)] text-[var(--on-dept)] flex items-center justify-center font-meta text-[9px] font-bold shrink-0">
                          {c.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11.5px] font-semibold truncate">{c.email}</span>
                          <span className="block font-meta text-[8.5px] text-[var(--muted)] truncate">{c.name} · {c.info}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {emailSugOpen && instantEmailQuery.includes("@") && !emailPicked && emailSuggestions.length === 0 && clientDirectory.length > 0 && (
                  <p className="font-meta text-[8.5px] text-[var(--muted)] mt-1">
                    No matching client — this will start a call with a new contact.
                  </p>
                )}
              </div>

              <div>
                <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Client Name (Optional)</label>
                <input
                  type="text"
                  value={instantName}
                  onChange={(e) => setInstantName(e.target.value)}
                  placeholder="e.g. Alex Henderson"
                  className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 rounded outline-none focus:border-[var(--dept)]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setInstantType("video")}
                  className={`flex-1 py-2 rounded border font-meta text-[10px] uppercase font-bold transition-colors ${
                    instantType === "video" ? "bg-[var(--dept)] text-[var(--on-dept)] border-[var(--dept)]" : "border-[var(--line)]"
                  }`}
                >
                  🎥 Video Call
                </button>
                <button
                  type="button"
                  onClick={() => setInstantType("voice")}
                  className={`flex-1 py-2 rounded border font-meta text-[10px] uppercase font-bold transition-colors ${
                    instantType === "voice" ? "bg-[var(--dept)] text-[var(--on-dept)] border-[var(--dept)]" : "border-[var(--line)]"
                  }`}
                >
                  📞 Voice Call
                </button>
              </div>

              <p className="font-meta text-[9px] text-[var(--muted)]">
                The client will receive an animated incoming call alert with ringtone in their portal and can accept immediately.
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setInstantCallModalOpen(false)}
                  className="font-meta text-[10px] text-[var(--muted)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={startingCall}
                  className="btn btn-dept !py-2 !px-5 font-display text-xs font-bold uppercase tracking-wider"
                >
                  {startingCall ? "Dialing…" : "Start Call →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= CLIENT DESIGNS & CO-WORKING (2026 Studio Operations) ================= */

function ClientDesignsManager() {
  const [designs, setDesigns] = useState<CustomerDesign[]>([]);
  const [selectedDesignIds, setSelectedDesignIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<string>("all");

  const loadData = async () => {
    setLoading(true);
    const list = await listAllCustomerDesigns();
    setDesigns(list);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const uniqueClients = useMemo(() => {
    const emails = new Set<string>();
    designs.forEach((d) => {
      if (d.email) emails.add(d.email.toLowerCase());
    });
    return Array.from(emails).sort();
  }, [designs]);

  const filtered = useMemo(() => {
    return designs.filter((d) => {
      const matchSearch =
        !search.trim() ||
        (d.title && d.title.toLowerCase().includes(search.toLowerCase())) ||
        (d.templateSlug && d.templateSlug.toLowerCase().includes(search.toLowerCase())) ||
        (d.email && d.email.toLowerCase().includes(search.toLowerCase()));
      const matchClient =
        selectedClient === "all" || (d.email && d.email.toLowerCase() === selectedClient.toLowerCase());
      return matchSearch && matchClient;
    });
  }, [designs, search, selectedClient]);

  const toggleDesignSelection = (id: string) => {
    setSelectedDesignIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    setSelectedDesignIds(filtered.map((d) => d.id));
  };

  const clearSelection = () => {
    setSelectedDesignIds([]);
  };

  const handleBatchDelete = async () => {
    const count = selectedDesignIds.length;
    const ok = await mutate(
      () => deleteDesigns(selectedDesignIds),
      `Deleted ${count} client designs`
    );
    if (ok) {
      clearSelection();
      loadData();
    }
  };

  const handleExportCsv = () => {
    const exportData = designs.filter((d) => selectedDesignIds.includes(d.id));
    exportToCsv<CustomerDesign>(
      "Client_Designs_Export",
      [
        { key: "id", header: "Design ID" },
        { key: "title", header: "Title", format: (d) => d.title || "Untitled" },
        { key: "templateSlug", header: "Template Slug", format: (d) => d.templateSlug || "custom" },
        { key: "email", header: "Client Email", format: (d) => d.email || "" },
        { key: "orderId", header: "Linked Order ID", format: (d) => d.orderId || "" },
        { key: "version", header: "Version", format: (d) => d.version || 1 },
        { key: "updatedAt", header: "Last Updated", format: (d) => d.updatedAt || "" },
      ],
      exportData
    );
    toast.success(`Exported ${exportData.length} designs to CSV`);
  };

  const handleExportJson = () => {
    const exportData = designs.filter((d) => selectedDesignIds.includes(d.id));
    exportToJson("Client_Designs_Export", exportData);
    toast.success(`Exported ${exportData.length} designs to JSON`);
  };

  const isAllFilteredSelected = filtered.length > 0 && filtered.every((d) => selectedDesignIds.includes(d.id));

  return (
    <div className="space-y-6 relative">
      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedDesignIds.length}
        totalCount={filtered.length}
        onClearSelection={clearSelection}
        onSelectAll={selectAllFiltered}
        onDelete={handleBatchDelete}
        deleteLabel="Delete Designs"
        onExportCsv={handleExportCsv}
        onExportJson={handleExportJson}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-[var(--panel)] border border-[var(--line-strong)] rounded-2xl">
        <div>
          <h2 className="font-display text-base font-bold uppercase tracking-wider">
            Client Designs &amp; Live Co-Working Hub
          </h2>
          <p className="font-meta text-[11px] text-[var(--muted)] mt-1">
            Real customer vector graphics &amp; templates created in KON10 Studio. Open any design to edit for the client or launch live co-design.
          </p>
        </div>
        <button
          onClick={loadData}
          className="btn btn-ghost !py-1.5 !px-3 font-meta text-[10px] uppercase font-bold shrink-0 flex items-center gap-1.5"
        >
          <span>🔄</span> Refresh Designs
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by design title, template slug, or client email…"
          className={`${inputCls} flex-1 rounded-xl`}
        />

        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="bg-[var(--panel)] border border-[var(--line)] px-3 py-2 text-xs rounded-xl outline-none focus:border-[var(--dept)] font-meta w-full sm:w-auto"
        >
          <option value="all">All Clients ({uniqueClients.length})</option>
          {uniqueClients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {filtered.length > 0 && (
          <label className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-meta text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer select-none bg-[var(--panel)] border border-[var(--line)] rounded-xl shrink-0">
            <input
              type="checkbox"
              checked={isAllFilteredSelected}
              onChange={(e) => {
                if (e.target.checked) selectAllFiltered();
                else clearSelection();
              }}
              className="w-3.5 h-3.5 accent-[var(--dept)] rounded cursor-pointer"
            />
            <span>Select all ({filtered.length})</span>
          </label>
        )}
      </div>

      {loading ? (
        <p className="font-meta text-xs text-[var(--muted)] py-8 text-center">Loading real client designs from Firestore…</p>
      ) : filtered.length === 0 ? (
        <div className="border border-[var(--line)] p-12 text-center rounded-2xl bg-[var(--panel)]">
          <span className="text-3xl block mb-2">🎨</span>
          <p className="font-display text-sm font-bold uppercase">No Client Designs Found</p>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-md mx-auto">
            {search || selectedClient !== "all"
              ? "No designs match your filter criteria."
              : "When customers open or edit templates in KON10 Studio, their live designs appear here for admin review and co-designing."}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((d) => {
            const isChecked = selectedDesignIds.includes(d.id);
            return (
              <article
                key={d.id}
                className={`border rounded-2xl overflow-hidden flex flex-col shadow-sm transition-all group relative ${
                  isChecked ? "border-[var(--dept)] bg-[var(--dept-soft)]/50 ring-1 ring-[var(--dept)]" : "border-[var(--line-strong)] bg-[var(--panel)] hover:border-[var(--dept)]"
                }`}
              >
                {/* Live Canvas Thumbnail */}
                <div className="aspect-[4/3] relative overflow-hidden bg-neutral-900 flex items-center justify-center border-b border-[var(--line)]">
                  {d.thumbnail && d.thumbnail.length > 50 ? (
                    <img
                      src={d.thumbnail}
                      alt={d.title}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 text-neutral-500 p-4 text-center">
                      <span className="text-3xl">📐</span>
                      <span className="font-meta text-[9px] uppercase font-bold">Vector Canvas</span>
                    </div>
                  )}

                  <div className="absolute top-2 left-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleDesignSelection(d.id)}
                      className="w-4 h-4 accent-[var(--dept)] rounded cursor-pointer shadow-md"
                      aria-label={`Select design ${d.title}`}
                    />
                    <span className="bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-full border border-neutral-700 font-meta text-[8px] font-bold text-white">
                      v{d.version || 1}
                    </span>
                  </div>

                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-[var(--dept)] text-black px-2 py-0.5 rounded-full font-meta text-[8px] font-bold uppercase">
                    {d.templateSlug || "Custom"}
                  </div>
                </div>

                {/* Design Details & Client Info */}
                <div className="p-4 flex flex-col gap-2 flex-1 justify-between">
                  <div>
                    <h3 className="font-display text-sm font-bold uppercase leading-tight truncate text-[var(--ink)]">
                      {d.title || "Untitled Design"}
                    </h3>
                    <div className="mt-1 space-y-0.5">
                      <p className="font-meta text-[9.5px] text-[var(--dept)] truncate font-bold">
                        👤 {d.email || "Guest Client"}
                      </p>
                      {d.orderId && (
                        <p className="font-meta text-[8.5px] text-emerald-500 font-bold truncate">
                          📦 Linked to Order #{d.orderId.slice(0, 8).toUpperCase()}
                        </p>
                      )}
                      <p className="font-meta text-[8.5px] text-[var(--muted)]">
                        Updated: {d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Admin Actions */}
                  <div className="pt-3 border-t border-[var(--line)] flex flex-wrap items-center gap-1.5">
                    <a
                      href={`/editor/${d.templateSlug || d.id}?designId=${d.id}&client=${encodeURIComponent(d.email || "")}${d.orderId ? `&orderId=${d.orderId}` : ""}&admin=true`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-dept !py-1.5 !px-3 font-display text-[9.5px] font-bold uppercase flex items-center gap-1 shadow-sm rounded-xl"
                      title="Open this exact customer design in KON10 Studio"
                    >
                      <span>✏️</span> Open in Studio
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        toast.info(`Design ID: ${d.id}`);
                        navigator.clipboard.writeText(d.id);
                        toast.success("Design ID copied!");
                      }}
                      className="btn btn-ghost !py-1.5 !px-2.5 font-meta text-[9px] rounded-xl"
                      title="Copy Design ID"
                    >
                      📋 ID
                    </button>

                    <RemoveButton
                      onRemove={async () => {
                        await deleteDesign(d.id);
                      }}
                      onDone={loadData}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================= PAGE ================= */

const ADMIN_SECTIONS = [
  {
    id: "operations",
    label: "Operations",
    icon: "⚡",
    tabs: ["Orders", "Communications", "Client Designs", "Intakes", "Leads"] as const,
  },
  {
    id: "studio",
    label: "Studio & Catalog",
    icon: "🎨",
    tabs: ["Design", "Templates", "Portfolio", "Analytics"] as const,
  },
  {
    id: "cms",
    label: "Site & CMS",
    icon: "⚙️",
    tabs: ["Homepage", "Promos", "Testimonials", "FAQs", "Settings"] as const,
  },
] as const;

const TABS = ["Orders", "Client Designs", "Communications", "Leads", "Intakes", "Analytics", "Portfolio", "Design", "Templates", "Promos", "Testimonials", "FAQs", "Homepage", "Settings"] as const;

const inputCls2 = "w-full bg-transparent border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--dept)] transition-colors";
const labelCls2 = "font-meta text-[10px] text-[var(--muted)] block mb-1.5";

function AdminSignIn() {
  const { signIn, signInGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!email.trim() || !pass) { setError("Enter your admin email and password."); return; }
    setBusy(true); setError(null);
    const err = await signIn(email, pass);
    setBusy(false);
    if (err) setError(err);
  };

  const goGoogle = async () => {
    setBusy(true); setError(null);
    const err = await signInGoogle();
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="max-w-sm mx-auto mt-4">
      <div className="border border-[var(--line-strong)] p-8" style={{ background: "var(--panel)" }}>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">🔐</span>
          <div>
            <p className="font-display text-sm font-bold uppercase tracking-wider">Studio Admin</p>
            <p className="font-meta text-[10px] text-[var(--muted)] mt-0.5">Authorised personnel only</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label className={labelCls2} htmlFor="adm-email">Admin Email</label>
            <input id="adm-email" type="email" autoComplete="email" className={inputCls2} value={email} onChange={e => setEmail(e.target.value)} placeholder="socialkon10@gmail.com" />
          </div>
          <div>
            <label className={labelCls2} htmlFor="adm-pass">Password</label>
            <div className="relative flex items-center">
              <input
                id="adm-pass"
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                className={`${inputCls2} pr-12`}
                value={pass}
                onChange={e => setPass(e.target.value)}
                onKeyDown={e => e.key === "Enter" && go()}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <PasswordEyeToggle
                  show={showPass}
                  onToggle={() => setShowPass(v => !v)}
                />
              </div>
            </div>
          </div>
          {error && <p className="font-meta text-[10px] text-red-500" role="alert">{error}</p>}
          <button className="btn btn-dept justify-center" disabled={busy} onClick={go}>
            {busy ? "Signing in…" : "Sign in to Studio"} <span className="btn-arrow" aria-hidden>→</span>
          </button>
          <button className="btn btn-ghost justify-center" disabled={busy} onClick={goGoogle}>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   STUDIO ALERT CENTER
   Live visual alerts for anything that needs the studio's attention:
   new orders, review/approval requests, signed briefs, fresh leads.
------------------------------------------------------------------- */
interface AdminAlerts { newOrders: number; reviewReqs: number; newBriefs: number; newLeads: number; unreadMsgs: number }

function AlertStrip({ data, onNavigate }: { data: AdminAlerts; onNavigate: (t: (typeof TABS)[number]) => void }) {
  const alerts = [
    data.newOrders > 0 && {
      key: "orders", tone: "#ef4444",
      label: `${data.newOrders} new order${data.newOrders > 1 ? "s" : ""} received`,
      sub: "Confirm payment & schedule kickoff", tab: "Orders" as const,
    },
    data.unreadMsgs > 0 && {
      key: "msgs", tone: "#f43f5e",
      label: `${data.unreadMsgs} unread client message${data.unreadMsgs > 1 ? "s" : ""}`,
      sub: "Project chat is waiting for a reply", tab: "Orders" as const,
    },
    data.reviewReqs > 0 && {
      key: "review", tone: "#f59e0b",
      label: `${data.reviewReqs} project${data.reviewReqs > 1 ? "s" : ""} waiting on the studio`,
      sub: "Client submitted a review, revision or approval", tab: "Orders" as const,
    },
    data.newBriefs > 0 && {
      key: "briefs", tone: "#8b5cf6",
      label: `${data.newBriefs} signed website brief${data.newBriefs > 1 ? "s" : ""} to review`,
      sub: "Scope signed — send the final proposal", tab: "Intakes" as const,
    },
    data.newLeads > 0 && {
      key: "leads", tone: "#06b6d4",
      label: `${data.newLeads} new lead${data.newLeads > 1 ? "s" : ""}`,
      sub: "Respond while they're hot", tab: "Leads" as const,
    },
  ].filter(Boolean) as { key: string; tone: string; label: string; sub: string; tab: (typeof TABS)[number] }[];

  if (alerts.length === 0) {
    return (
      <div className="mb-8 border border-[var(--line)] px-5 py-3 flex items-center gap-3" style={{ background: "var(--panel)" }}>
        <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden />
        <span className="font-meta text-[10px] text-[var(--muted)]">ALL CLEAR — no client requests waiting on the studio right now.</span>
      </div>
    );
  }

  return (
    <div className="mb-8" role="alert" aria-live="polite" aria-label="Studio alerts">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex w-2.5 h-2.5" aria-hidden>
          <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-60 animate-ping" />
          <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-red-500" />
        </span>
        <span className="font-meta text-[10px] font-bold tracking-wider">NEEDS YOUR ATTENTION</span>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2">
        {alerts.map((a) => (
          <button key={a.key} onClick={() => onNavigate(a.tab)}
            className="border px-4 py-3 text-left transition-colors hover:border-[var(--dept)] group"
            style={{ borderColor: a.tone, background: "var(--panel)" }}>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: a.tone }} aria-hidden />
              <span className="font-display text-[13px] font-bold uppercase leading-tight">{a.label}</span>
            </span>
            <span className="font-meta text-[9px] text-[var(--muted)] block mt-1">{a.sub}</span>
            <span className="font-meta text-[9px] dept-accent mt-2 inline-block group-hover:underline">OPEN {a.tab.toUpperCase()} →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Admin() {
  useDepartment(null);
  const { user, loading, isAdmin, signOut } = useAuth();
  const { currency, setCurrency, fxLive } = useShop();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Orders");
  useSEO({ title: "Admin — Social Kon10 Marketing", description: "Studio admin dashboard." });

  const allowed = firebaseReady ? isAdmin : true; // demo mode: open for preview

  /* studio alert center — real-time reactive updates */
  const [alerts, setAlerts] = useState<AdminAlerts | null>(null);
  useEffect(() => {
    if (!allowed) return;
    let stop = false;
    let currOrders: OrderRecord[] = [];
    let currIntakes: IntakeRecord[] = [];
    let currLeads: LeadRecord[] = [];

    const updateAlerts = () => {
      if (stop) return;
      setAlerts({
        newOrders: currOrders.filter((o) => o.status === "ORDER RECEIVED").length,
        reviewReqs: currOrders.filter((o) => ["CLIENT REVIEW", "REVISION", "FINAL APPROVAL"].includes(o.status)).length,
        newBriefs: currIntakes.filter((i) => i.status === "submitted").length,
        newLeads: currLeads.filter((l) => l.status === "new").length,
        unreadMsgs: currOrders.filter(orderHasUnreadClientMessage).length,
      });
    };

    const unsubOrders = subscribeAllOrders((orders) => {
      currOrders = orders;
      updateAlerts();
    });
    const unsubIntakes = subscribeAllIntakes((intakes) => {
      currIntakes = intakes;
      updateAlerts();
    });
    const unsubLeads = subscribeLeads((leads) => {
      currLeads = leads;
      updateAlerts();
    });

    return () => {
      stop = true;
      unsubOrders();
      unsubIntakes();
      unsubLeads();
    };
  }, [allowed]);

  const tabBadge = (t: (typeof TABS)[number]): number => {
    if (!alerts) return 0;
    if (t === "Orders") return alerts.newOrders + alerts.reviewReqs + alerts.unreadMsgs;
    if (t === "Intakes") return alerts.newBriefs;
    if (t === "Leads") return alerts.newLeads;
    return 0;
  };

  const sectionBadge = (sectionTabs: readonly string[]): number => {
    return sectionTabs.reduce((sum, t) => sum + tabBadge(t as (typeof TABS)[number]), 0);
  };

  const currentSec = ADMIN_SECTIONS.find((s) => s.tabs.some((t) => t === tab)) || ADMIN_SECTIONS[0];

  return (
    <section className="wrap pt-14 md:pt-20 pb-24 min-h-[70vh]">
      <div className="flex flex-wrap items-center justify-between gap-3 font-meta text-[10px] text-[var(--muted)] pb-3 mb-2 border-b border-[var(--line)]">
        <div className="flex items-center gap-3">
          <span className="idx">/admin</span>
          <span>{firebaseReady ? (isAdmin ? `Admin: ${user?.email}` : user ? "Not authorised" : "Signed out") : "Demo mode"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-[var(--ink)]">Display Currency:</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            aria-label="Studio display currency"
            className="bg-[var(--panel)] border border-[var(--line)] px-2.5 py-1 rounded-xl text-[10px] font-bold text-[var(--ink)] cursor-pointer hover:border-[var(--dept)] transition-colors outline-none"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code} className="text-black">
                {c.code} ({c.symbol})
              </option>
            ))}
          </select>
          {currency !== "USD" && currency !== "BMD" && (
            <span
              className={`w-2 h-2 rounded-full ${fxLive ? "bg-emerald-500" : "bg-amber-500"}`}
              title={fxLive ? "Live conversion active" : "Estimated rate active"}
            />
          )}
        </div>
      </div>
      <h1 className="display-section mt-6 mb-8">Studio admin</h1>

      {loading ? (
        <p className="font-meta text-[11px] text-[var(--muted)]">Loading…</p>
      ) : !allowed ? (
        <>
          {user ? (
            <div className="border border-[var(--line)] p-8 max-w-sm text-center rounded-2xl" style={{ background: "var(--panel)" }}>
              <p className="font-meta text-[10px] text-red-500">⛔ {user.email} is not an admin account.</p>
              <p className="text-sm text-[var(--muted)] mt-2">Sign in with an authorised admin email to continue.</p>
              <button className="btn btn-fill mt-5" onClick={signOut}>Sign out</button>
            </div>
          ) : (
            <AdminSignIn />
          )}
        </>
      ) : (
        <>
          {/* studio alert center — every client request that needs attention */}
          {alerts && <AlertStrip data={alerts} onNavigate={setTab} />}

          {/* 2026 CATEGORIZED STUDIO ADMIN NAVIGATION */}
          <div className="space-y-3 mb-8">
            {/* Top Tier: Primary Studio Pillar Segments + Sign Out */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 bg-[var(--panel)] border border-[var(--line)] rounded-2xl shadow-xs">
              <div className="flex flex-wrap items-center gap-1 flex-1">
                {ADMIN_SECTIONS.map((sec) => {
                  const isSecActive = sec.tabs.some((t) => t === tab);
                  const totalBadges = sectionBadge(sec.tabs);
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        if (!isSecActive) setTab(sec.tabs[0]);
                      }}
                      className={`relative px-3.5 py-2 rounded-xl font-display text-xs font-bold uppercase transition-all flex items-center gap-2 active:scale-95 ${
                        isSecActive
                          ? "bg-[var(--dept)] text-[var(--on-dept)] shadow-xs"
                          : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--bg)]"
                      }`}
                    >
                      <span>{sec.icon}</span>
                      <span>{sec.label}</span>
                      {totalBadges > 0 && (
                        <span
                          className={`min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center animate-pulse ${
                            isSecActive
                              ? "bg-black text-white"
                              : "bg-red-500 text-white"
                          }`}
                        >
                          {totalBadges}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={signOut}
                className="font-meta text-[10px] px-3 py-1.5 rounded-xl border border-[var(--line)] text-[var(--muted)] hover:border-red-500 hover:text-red-500 transition-colors ml-auto flex items-center gap-1.5 active:scale-95"
              >
                <span>🚪</span>
                <span className="hidden sm:inline">SIGN OUT</span>
              </button>
            </div>

            {/* Sub-Tier: Horizontal Sub-Tab Strip with Touch Scrolling */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-0.5" role="tablist" aria-label="Section Tabs">
              {currentSec.tabs.map((t) => {
                const badge = tabBadge(t);
                const isSelected = tab === t;
                return (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setTab(t)}
                    className={`font-meta text-[10px] sm:text-[10.5px] px-3.5 py-2 rounded-xl border transition-all relative shrink-0 flex items-center gap-1.5 active:scale-95 ${
                      isSelected
                        ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)] font-bold shadow-xs"
                        : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--dept)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span>{t.toUpperCase()}</span>
                    {badge > 0 && (
                      <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[8.5px] font-bold flex items-center justify-center">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {tab === "Orders" && <Orders />}
          {tab === "Client Designs" && <ClientDesignsManager />}
          {tab === "Communications" && <AdminCommunications />}
          {tab === "Leads" && <Leads />}
          {tab === "Intakes" && <IntakesManager />}
          {tab === "Portfolio" && <PortfolioManager />}
          {tab === "Promos" && (
            <>
              <p className="font-meta text-[10px] text-[var(--muted)] mb-6 max-w-2xl">
                Promotional codes (PRD §34) — active at checkout immediately.
                Type: pct (percentage) or fixed (USD off). Built-in codes: {Object.keys(PROMO_CODES).join(", ")}.
              </p>
              <ContentManager kind="promos" fields={[
                { key: "code", label: "Code (e.g. SUMMER15)" }, { key: "type", label: "Type (pct / fixed)" },
                { key: "value", label: "Value (e.g. 15)" }, { key: "label", label: "Label (e.g. 15% off everything)" },
              ]} />
            </>
          )}
          {tab === "Testimonials" && <ContentManager kind="testimonials" fields={[{ key: "name", label: "Client name" }, { key: "company", label: "Company" }, { key: "quote", label: "Testimonial", area: true }, { key: "service", label: "Department (brand/social/web)" }]} />}
          {tab === "FAQs" && <ContentManager kind="faqs" fields={[{ key: "q", label: "Question" }, { key: "a", label: "Answer", area: true }, { key: "dept", label: "Department (brand/social/web/checkout)" }]} />}
          {tab === "Analytics" && <Analytics />}
          {tab === "Design" && <DesignStudio />}
          {tab === "Templates" && <TemplateStudio />}
          {tab === "Homepage" && <HomepageManager />}
          {tab === "Settings" && <SettingsManager />}
        </>
      )}
    </section>
  );
}

