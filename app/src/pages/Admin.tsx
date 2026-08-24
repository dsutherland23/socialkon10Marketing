import { useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import { CONTACT, FAQS, PROJECTS, PROMO_CODES, SERVICES, SOCIAL_LINKS, TESTIMONIALS, formatMoney } from "../lib/data";
import { useDepartment } from "../lib/dept";
import { useSEO } from "../lib/seo";
import { useAuth } from "../lib/auth";
import {
  ORDER_STATUSES, listAllOrders, listLeads, setLeadStatus, setOrderStatus, deleteOrder,
  getServiceOverrides, saveServiceOverride, deleteServiceOverride,
  listManaged, addManaged, removeManaged, updateManaged,
  getSettings, saveSettings, convertLeadToOrder, recordPayment,
  uploadImage, getFileUrl, attachFiles, postMessage,
  type LeadRecord, type ManagedItem, type OrderRecord, type ServiceOverride, type SiteSettings,
} from "../lib/backend";
import { HOME_SECTIONS } from "../lib/content";
import { firebaseReady } from "../lib/firebase";
import { MessageThread } from "../components/messages";
import {
  createMeeting, deleteMeeting, listAllMeetings,
  recordCallHistory, listCallHistory, downloadCalendarIcs,
  generatePasscode, getMeetingShareDetails,
  type MeetingRecord, type CallHistoryRecord, type SessionType,
} from "../lib/meetings";
import { PasswordEyeToggle } from "../components/PasswordEyeToggle";
import { DesignStudio } from "./AdminDesign";
import { TemplateStudio } from "./AdminTemplates";

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
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(order.balanceDue));
  const [busy, setBusy] = useState(false);
  if (order.balanceDue <= 0) return <span className="font-meta text-[9px] dept-accent font-bold">PAID IN FULL</span>;
  if (!open) return (
    <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors mt-2 block" onClick={() => setOpen(true)}>
      + Record payment ({formatMoney(order.balanceDue)} due) →
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

function AdminDeliverableItem({ file }: { file: { name: string; size: number; path?: string } }) {
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

function Orders() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "REVIEW" | "COMPLETED">("ALL");
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

  useEffect(() => { reload(); }, []);

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
    if (filter === "ACTIVE" && ["DELIVERED", "COMPLETED"].includes(o.status)) return false;
    if (filter === "REVIEW" && !["CLIENT REVIEW", "FINAL APPROVAL"].includes(o.status)) return false;
    if (filter === "COMPLETED" && !["DELIVERED", "COMPLETED"].includes(o.status)) return false;
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
      await attachFiles(current.id, files, (curr, tot, name) => {
        setUploadProgress({ current: curr, total: tot, filename: name });
      });
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

  return (
    <div className="flex flex-col gap-6">
      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter orders">
          <button
            onClick={() => setFilter("ALL")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-full border transition-colors ${
              filter === "ALL" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            All Orders ({orders.length})
          </button>
          <button
            onClick={() => setFilter("ACTIVE")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-full border transition-colors ${
              filter === "ACTIVE" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            Active ({activeOrders.length})
          </button>
          <button
            onClick={() => setFilter("REVIEW")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-full border transition-colors ${
              filter === "REVIEW" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            Action / Review ({reviewOrders.length})
          </button>
          <button
            onClick={() => setFilter("COMPLETED")}
            className={`font-meta text-[10px] px-3 py-1.5 rounded-full border transition-colors ${
              filter === "COMPLETED" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            Delivered ({completedOrders.length})
          </button>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client, ID, email, or item…"
          className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded w-full sm:w-72"
        />
      </div>

      {orders.length === 0 ? (
        <div className="border border-[var(--line)] p-12 text-center" style={{ background: "var(--panel)" }}>
          <p className="font-display text-xl font-bold uppercase">No orders received yet</p>
          <p className="text-sm text-[var(--muted)] mt-2">When clients purchase or accept proposals, they will appear here.</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="border border-[var(--line)] p-12 text-center" style={{ background: "var(--panel)" }}>
          <p className="font-display text-xl font-bold uppercase">No matching orders</p>
          <p className="text-sm text-[var(--muted)] mt-2">Try clearing your search or filter.</p>
          <button onClick={() => { setFilter("ALL"); setSearch(""); }} className="btn btn-ghost mt-4">Reset Filters</button>
        </div>
      ) : (
        /* Split-View Master-Detail Studio Cockpit */
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Order Master List */}
          <div className="lg:col-span-4 flex flex-col gap-2.5 max-h-[750px] overflow-y-auto pr-1">
            {filteredOrders.map((o) => {
              const isSelected = current && o.id === current.id;
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

                  <p className="font-meta text-[10px] text-[var(--muted)] mt-1 truncate">
                    {o.name} {o.company ? `(${o.company})` : ""} · {o.email}
                  </p>

                  <div className="mt-3 flex items-center justify-between text-[11px] font-meta text-[var(--muted)]">
                    <span>Step {sIdx + 1}/8 · {pct}%</span>
                    <span className="font-semibold text-[var(--ink)]">
                      {o.balanceDue > 0 ? (
                        <span className="text-amber-600">Balance {formatMoney(o.balanceDue)}</span>
                      ) : (
                        <span className="dept-accent">Paid {formatMoney(o.amountPaid)}</span>
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
            <div className="lg:col-span-8 border border-[var(--line-strong)] bg-[var(--panel)] rounded-xl overflow-hidden shadow-sm">
              {/* Cockpit Header */}
              <div className="p-6 border-b border-[var(--line)] bg-[var(--bg)] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="idx">/studio-operations</span>
                    <span className="font-meta text-[10px] text-[var(--muted)]">· #ORD-{current.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <h2 className="font-display text-xl font-bold uppercase">
                    {current.items.map((i) => i.name).join(" · ")}
                  </h2>
                  <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
                    Client: <strong className="text-[var(--ink)]">{current.name}</strong> ({current.email}) {current.company ? `· ${current.company}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
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
                      className={`${inputCls} !w-auto !py-1.5 font-meta text-[10px] font-bold rounded`}
                    >
                      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <RemoveButton onRemove={() => deleteOrder(current.id)} onDone={reload} />
                </div>
              </div>

              {/* Visual Milestone Progress Tracker & Step Advancer */}
              <div className="px-6 py-4 border-b border-[var(--line)] bg-[var(--dept-soft)]/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-meta text-[10px] uppercase font-bold text-[var(--dept)] tracking-wider">
                    Phase {ORDER_STATUSES.indexOf(current.status) + 1} of 8: {current.status}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-meta text-[10px] text-[var(--muted)]">
                      {Math.round(((ORDER_STATUSES.indexOf(current.status) + 1) / ORDER_STATUSES.length) * 100)}%
                    </span>
                    {ORDER_STATUSES.indexOf(current.status) < ORDER_STATUSES.length - 1 && (
                      <button
                        onClick={advanceNextStatus}
                        className="btn btn-dept !py-1 !px-2.5 font-meta text-[9px]"
                      >
                        Advance Phase →
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

              {/* Sub-Tabs Navigation */}
              <div className="flex border-b border-[var(--line)] bg-[var(--bg)] px-4" role="tablist">
                <button
                  onClick={() => setCockpitTab("overview")}
                  className={`font-meta text-[10px] uppercase px-4 py-3 border-b-2 font-bold transition-colors ${
                    cockpitTab === "overview" ? "border-[var(--dept)] text-[var(--dept)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  📌 Client, Scope &amp; Financials
                </button>
                <button
                  onClick={() => setCockpitTab("chat")}
                  className={`font-meta text-[10px] uppercase px-4 py-3 border-b-2 font-bold transition-colors ${
                    cockpitTab === "chat" ? "border-[var(--dept)] text-[var(--dept)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  💬 Client Chat Thread
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

              {/* Sub-Tab Content */}
              <div className="p-6">
                {/* TAB 1: Client, Scope & Financials */}
                {cockpitTab === "overview" && (
                  <div className="flex flex-col gap-6">
                    {/* Client Intake & Contact */}
                    <div>
                      <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-2">Client Details &amp; Brief</h4>
                      <div className="border border-[var(--line)] p-4 rounded-lg bg-[var(--bg)] space-y-2 text-xs">
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
                      </div>
                    </div>

                    {/* Scope of Work */}
                    <div>
                      <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-2">Scope of Work</h4>
                      <div className="border border-[var(--line)] rounded-lg divide-y divide-[var(--line)] bg-[var(--bg)]">
                        {current.items.map((it, idx) => (
                          <div key={idx} className="p-3.5 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold font-display uppercase">
                                {it.name} {it.rush ? <span className="text-amber-500 font-meta text-[9px]">(Rush)</span> : ""}
                              </p>
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

                    {/* Financial Summary & Payment Recording */}
                    <div>
                      <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-2">Financials &amp; Balance</h4>
                      <div className="border border-[var(--line)] p-4 rounded-lg bg-[var(--bg)] space-y-2 text-xs">
                        <div className="flex justify-between text-[var(--muted)]">
                          <span>Total Engagement</span>
                          <span className="font-bold text-[var(--ink)]">{formatMoney(current.total)}</span>
                        </div>
                        {current.discount > 0 && (
                          <div className="flex justify-between text-emerald-600">
                            <span>Discount {current.promo ? `(${current.promo})` : ""}</span>
                            <span>−{formatMoney(current.discount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-[var(--muted)]">
                          <span>Amount Received</span>
                          <span className="text-emerald-600 font-bold">{formatMoney(current.amountPaid)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-[var(--line)]">
                          <div>
                            <span className="font-bold">Remaining Balance</span>
                            <p className="font-meta text-[9px] text-[var(--muted)]">Due upon deliverable completion</p>
                          </div>
                          <span className="font-display text-base font-bold text-[var(--ink)]">
                            {current.balanceDue > 0 ? formatMoney(current.balanceDue) : "PAID IN FULL"}
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
                      <div className="grid sm:grid-cols-2 gap-3">
                        {current.files.map((file, i) => (
                          <AdminDeliverableItem key={i} file={file} />
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
  const reload = () => listLeads().then(setLeads);
  useEffect(() => { reload(); }, []);

  return (
    <div>
      {leads.length === 0 && <p className="font-meta text-[11px] text-[var(--muted)]">No leads yet — quote requests, consultations and questions land here.</p>}
      <div className="flex flex-col gap-3">
        {leads.map((l) => (
          <div key={l.id} className="border border-[var(--line)] px-5 py-4 grid md:grid-cols-[140px_1fr_200px_190px] gap-4 items-start" style={{ background: "var(--panel)" }}>
            <span className="font-meta text-[10px] dept-accent uppercase">{l.intent}</span>
            <div className="text-sm">
              <p className="font-medium">{l.name} <span className="text-[var(--muted)] font-normal">· {l.email}</span></p>
              <p className="text-[13px] text-[var(--muted)] mt-1">{l.message}</p>
              <p className="font-meta text-[9px] text-[var(--muted)] mt-2">
                {[l.dept, l.service, l.budget, l.timeline, l.date && `${l.date} ${l.time ?? ""}`].filter(Boolean).join(" · ") || "—"}
              </p>
              <div className="mt-3"><ConvertLead lead={l} onDone={reload} /></div>
            </div>
            <span className="font-meta text-[9px] text-[var(--muted)]">{l.createdAt ? new Date(l.createdAt).toLocaleDateString() : ""}</span>
            <select value={l.status}
              onChange={async (e) => {
                const okDone = await mutate(() => setLeadStatus(l.id, e.target.value as LeadRecord["status"]), "Lead updated");
                if (okDone) reload();
              }}
              className={`${inputCls} !py-1.5 font-meta text-[10px]`}>
              {["new", "contacted", "converted", "closed"].map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
            </select>
          </div>
        ))}
      </div>
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
  const [s, setS] = useState<SiteSettings>({});
  useEffect(() => { getSettings().then(setS); }, []);

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
    </div>
  );
}

/* ================= ANALYTICS (PRD §33) ================= */

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-[var(--line)] p-5" style={{ background: "var(--panel)" }}>
      <span className={labelCls}>{label}</span>
      <p className="font-display-wide text-3xl font-bold mt-2">{value}</p>
      {sub && <p className="font-meta text-[9px] text-[var(--muted)] mt-1">{sub}</p>}
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-meta text-[9px] w-36 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-4 border border-[var(--line)]" style={{ background: "var(--bg)" }}>
        <div className="h-full dept-bg" style={{ width: `${max ? Math.round((value / max) * 100) : 0}%` }} />
      </div>
      <span className="font-meta text-[10px] w-8 text-right">{value}</span>
    </div>
  );
}

function Analytics() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  useEffect(() => { listAllOrders().then(setOrders); listLeads().then(setLeads); }, []);

  const revenue = orders.reduce((s, o) => s + o.amountPaid, 0);
  const aov = orders.length ? Math.round(orders.reduce((s, o) => s + o.total, 0) / orders.length) : 0;
  const outstanding = orders.reduce((s, o) => s + o.balanceDue, 0);

  const byStatus = ORDER_STATUSES.map((s) => ({ label: s, value: orders.filter((o) => o.status === s).length }));
  const statusMax = Math.max(1, ...byStatus.map((x) => x.value));

  const serviceCount = new Map<string, number>();
  orders.forEach((o) => o.items.forEach((i) => serviceCount.set(i.name, (serviceCount.get(i.name) ?? 0) + 1)));
  const topServices = [...serviceCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const svcMax = Math.max(1, ...topServices.map(([, v]) => v));

  const byIntent = ["quote", "consultation", "question"].map((i) => ({ label: i.toUpperCase(), value: leads.filter((l) => l.intent === i).length }));
  const intentMax = Math.max(1, ...byIntent.map((x) => x.value));

  return (
    <div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-10">
        <Stat label="REVENUE COLLECTED" value={formatMoney(revenue)} sub={`${orders.length} orders`} />
        <Stat label="OUTSTANDING BALANCES" value={formatMoney(outstanding)} sub="deposits → final approval" />
        <Stat label="AVERAGE ORDER VALUE" value={formatMoney(aov)} />
        <Stat label="LEADS" value={String(leads.length)} sub={`${leads.filter((l) => l.status === "converted").length} converted`} />
      </div>
      <div className="grid lg:grid-cols-3 gap-8">
        <div>
          <span className="idx">/pipeline</span>
          <div className="flex flex-col gap-2.5 mt-4">
            {byStatus.map((x) => <Bar key={x.label} label={x.label} value={x.value} max={statusMax} />)}
          </div>
        </div>
        <div>
          <span className="idx">/popular-services</span>
          <div className="flex flex-col gap-2.5 mt-4">
            {topServices.length === 0 && <p className="font-meta text-[10px] text-[var(--muted)]">No orders yet.</p>}
            {topServices.map(([name, v]) => <Bar key={name} label={name.toUpperCase()} value={v} max={svcMax} />)}
          </div>
        </div>
        <div>
          <span className="idx">/lead-intents</span>
          <div className="flex flex-col gap-2.5 mt-4">
            {byIntent.map((x) => <Bar key={x.label} label={x.label} value={x.value} max={intentMax} />)}
          </div>
          <p className="font-meta text-[9px] text-[var(--muted)] mt-6">Traffic + funnel visualizations live in GA4 once VITE_GA_ID is set.</p>
        </div>
      </div>
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
  const [startingCall, setStartingCall] = useState(false);

  const reloadData = async () => {
    const [m, c, ords, lds] = await Promise.all([
      listAllMeetings(),
      listCallHistory(),
      listAllOrders(),
      listLeads(),
    ]);
    setMeetings(m);
    setCalls(c);

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

  const activeMeetings = meetings.filter((m) => m.status === "live" || m.status === "scheduled");
  const liveMeetings = meetings.filter((m) => m.status === "live");

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

      toast.success(`Meeting "${newM.title}" scheduled successfully.`);
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

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header & Overview Metric Widgets */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 border border-[var(--line)] rounded-xl bg-[var(--panel)]">
          <span className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block">Upcoming Meetings</span>
          <p className="font-display text-2xl font-bold mt-1 text-[var(--ink)]">{activeMeetings.length}</p>
          <span className="font-meta text-[9px] text-emerald-600 mt-1 block">● Real-time synced</span>
        </div>

        <div className="p-4 border border-[var(--line)] rounded-xl bg-[var(--panel)]">
          <span className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block">Live Sessions</span>
          <p className="font-display text-2xl font-bold mt-1 dept-accent">{liveMeetings.length}</p>
          <span className="font-meta text-[9px] text-[var(--muted)] mt-1 block">Active video rooms</span>
        </div>

        <div className="p-4 border border-[var(--line)] rounded-xl bg-[var(--panel)]">
          <span className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block">Call Logs Recorded</span>
          <p className="font-display text-2xl font-bold mt-1 text-[var(--ink)]">{calls.length}</p>
          <span className="font-meta text-[9px] text-[var(--muted)] mt-1 block">Instant voice &amp; video</span>
        </div>

        <div className="p-4 border border-[var(--line)] rounded-xl bg-[var(--panel)] flex flex-col justify-between">
          <span className="font-meta text-[9px] uppercase font-bold text-[var(--muted)] block">Instant Launch</span>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { setInstantType("video"); setInstantCallModalOpen(true); }}
              className="flex-1 btn btn-dept !py-1.5 font-meta text-[9px] font-bold"
            >
              🎥 Call
            </button>
            <button
              onClick={() => setScheduleModalOpen(true)}
              className="flex-1 font-meta text-[9px] font-bold px-2 py-1.5 border border-[var(--line)] rounded hover:border-[var(--dept)] bg-[var(--bg)] transition-colors"
            >
              + Schedule
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Tabs Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          <button
            onClick={() => setActiveSubTab("meetings")}
            className={`font-meta text-[10px] px-3.5 py-1.5 rounded-full border font-bold transition-colors ${
              activeSubTab === "meetings" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            📅 Meetings ({meetings.length})
          </button>
          <button
            onClick={() => setActiveSubTab("calendar")}
            className={`font-meta text-[10px] px-3.5 py-1.5 rounded-full border font-bold transition-colors ${
              activeSubTab === "calendar" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            📆 Visual Calendar
          </button>
          <button
            onClick={() => setActiveSubTab("calls")}
            className={`font-meta text-[10px] px-3.5 py-1.5 rounded-full border font-bold transition-colors ${
              activeSubTab === "calls" ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--dept)]"
            }`}
          >
            📞 Call History ({calls.length})
          </button>
          <button
            onClick={() => setActiveSubTab("intelligence")}
            className={`font-meta text-[10px] px-3.5 py-1.5 rounded-full border font-bold transition-colors ${
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
            <div className="flex gap-1.5">
              {["ALL", "scheduled", "live", "completed", "cancelled"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`font-meta text-[9px] uppercase px-2.5 py-1 rounded border transition-colors ${
                    filterStatus === s ? "bg-[var(--dept)] text-[var(--on-dept)] border-[var(--dept)] font-bold" : "border-[var(--line)] text-[var(--muted)]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search meetings by title or participant…"
              className="bg-transparent border border-[var(--line)] px-3 py-1.5 text-xs outline-none focus:border-[var(--dept)] transition-colors rounded w-full sm:w-64"
            />
          </div>

          {filteredMeetings.length === 0 ? (
            <div className="p-12 border border-[var(--line)] rounded-xl text-center bg-[var(--panel)]">
              <span className="text-3xl block mb-2">📅</span>
              <p className="font-display text-sm font-bold uppercase">No meetings found</p>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-1">Schedule a consultation or review meeting to get started.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filteredMeetings.map((m) => {
                const isLive = m.status === "live";
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
                          m.status === "scheduled" ? "bg-cyan-500/10 text-cyan-500 border-cyan-500/30" :
                          m.status === "completed" ? "bg-neutral-500/10 text-neutral-400 border-neutral-500/30" :
                          "bg-red-500/10 text-red-500 border-red-500/30"
                        }`}>
                          {m.status}
                        </span>
                        <span className="font-meta text-[9px] text-[var(--muted)]">
                          {m.durationMinutes} mins · {m.timezone}
                        </span>
                      </div>

                      <h3 className="font-display text-base font-bold uppercase line-clamp-1">{m.title}</h3>
                      {m.description && <p className="text-xs text-[var(--muted)] line-clamp-2 mt-1">{m.description}</p>}

                      <div className="mt-3 p-2.5 bg-[var(--bg)] border border-[var(--line)] rounded-lg text-[11px] space-y-1">
                        <p className="font-medium text-[var(--ink)]">
                          📅 {dateStr} at {timeStr}
                        </p>
                        <p className="font-meta text-[9.5px] text-[var(--muted)] truncate">
                          👥 {m.participants.length > 0 ? m.participants.map((p) => p.displayName).join(", ") : "Open invitation"}
                        </p>
                        {m.passcode && (
                          <p className="font-meta text-[9.5px] text-[var(--muted)]">
                            🔑 Passcode: <code className="text-[var(--ink)] font-bold">{m.passcode}</code>
                          </p>
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
                          className="font-meta text-[9px] px-2.5 py-1 border border-[var(--dept)] dept-accent rounded hover:bg-[var(--dept)] hover:text-[var(--on-dept)] bg-[var(--bg)] transition-colors font-bold"
                          title="Copy direct meeting join link"
                        >
                          📋 Copy Link
                        </button>
                        <button
                          onClick={async () => {
                            const share = getMeetingShareDetails(m);
                            await share.copyFullInvitation();
                            toast.success("Full invitation details copied!");
                          }}
                          className="font-meta text-[9px] px-2.5 py-1 border border-[var(--line)] rounded hover:border-[var(--dept)] bg-[var(--bg)] transition-colors"
                          title="Copy full invitation for email or message"
                        >
                          ✉️ Invite Text
                        </button>
                        <button
                          onClick={() => downloadCalendarIcs(m)}
                          className="font-meta text-[9px] px-2.5 py-1 border border-[var(--line)] rounded hover:border-[var(--dept)] bg-[var(--bg)] transition-colors"
                          title="Download Calendar .ICS file"
                        >
                          📥 .ICS
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm("Delete this meeting?")) {
                              await deleteMeeting(m.id);
                              toast.success("Meeting deleted.");
                              reloadData();
                            }
                          }}
                          className="font-meta text-[9px] text-[var(--muted)] hover:text-red-500 px-2 py-1"
                        >
                          Delete
                        </button>
                      </div>

                      <button
                        onClick={() => window.open(`/meet/${m.roomId}`, "_blank")}
                        className="btn btn-dept !py-1.5 !px-3 font-display text-[10px] font-bold uppercase tracking-wider shadow-sm"
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
        <div className="p-6 border border-[var(--line)] rounded-xl bg-[var(--panel)] space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold uppercase">Scheduled Studio Calendar</h3>
            <span className="font-meta text-[9px] text-[var(--muted)]">
              Timezone: <strong className="text-[var(--ink)]">{Intl.DateTimeFormat().resolvedOptions().timeZone}</strong>
            </span>
          </div>

          <div className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-lg bg-[var(--bg)]">
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
                      className="font-meta text-[9px] px-2.5 py-1 rounded border border-[var(--line)] hover:border-[var(--dept)]"
                    >
                      Export .ICS
                    </button>
                    <button
                      onClick={() => window.open(`/meet/${m.roomId}`, "_blank")}
                      className="btn btn-dept !py-1 !px-2.5 font-meta text-[9px]"
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
        <div className="p-6 border border-[var(--line)] rounded-xl bg-[var(--panel)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold uppercase">Instant Voice &amp; Video Call Logs</h3>
            <span className="font-meta text-[9px] text-[var(--muted)]">{calls.length} entries</span>
          </div>

          <div className="border border-[var(--line)] rounded-lg divide-y divide-[var(--line)] bg-[var(--bg)] text-xs">
            {calls.length === 0 ? (
              <p className="p-8 text-center text-[var(--muted)]">No instant calls placed yet.</p>
            ) : (
              calls.map((c) => (
                <div key={c.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{c.type === "video" ? "🎥" : "📞"}</span>
                      <span className="font-bold">{c.recipientName || c.recipientEmail}</span>
                      <span className={`font-meta text-[8.5px] px-2 py-0.2 rounded border ${
                        c.status === "completed" || c.status === "accepted" ? "text-emerald-500 border-emerald-500/30" : "text-amber-500 border-amber-500/30"
                      }`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="font-meta text-[9px] text-[var(--muted)]">
                      {new Date(c.startedAt).toLocaleString()} · Caller: {c.callerName}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setInstantName(c.recipientName);
                      setInstantEmail(c.recipientEmail);
                      setInstantType(c.type);
                      setInstantCallModalOpen(true);
                    }}
                    className="font-meta text-[9px] px-3 py-1 border border-[var(--dept)] dept-accent rounded hover:bg-[var(--dept)] hover:text-[var(--on-dept)] transition-colors"
                  >
                    Call Back ↻
                  </button>
                </div>
              ))
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--panel)] border border-[var(--line-strong)] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 my-8">
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
              <div>
                <label className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold block mb-1">Client Email Address *</label>
                <input
                  type="email"
                  required
                  value={instantEmail}
                  onChange={(e) => setInstantEmail(e.target.value)}
                  placeholder="client@domain.com"
                  className="w-full bg-[var(--bg)] border border-[var(--line)] px-3 py-2 rounded outline-none focus:border-[var(--dept)]"
                />
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

/* ================= PAGE ================= */

const TABS = ["Orders", "Communications", "Leads", "Analytics", "Products", "Portfolio", "Design", "Templates", "Promos", "Testimonials", "FAQs", "Homepage", "Settings"] as const;

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

export default function Admin() {
  useDepartment(null);
  const { user, loading, isAdmin, signOut } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Orders");
  useSEO({ title: "Admin — Social Kon10 Marketing", description: "Studio admin dashboard." });

  const allowed = firebaseReady ? isAdmin : true; // demo mode: open for preview

  return (
    <section className="wrap pt-14 md:pt-20 pb-24 min-h-[70vh]">
      <div className="flex justify-between font-meta text-[10px] text-[var(--muted)]">
        <span className="idx">/admin</span>
        <span>{firebaseReady ? (isAdmin ? `Admin: ${user?.email}` : user ? "Not authorised" : "Signed out") : "Demo mode"}</span>
      </div>
      <h1 className="display-section mt-6 mb-10">Studio admin</h1>

      {loading ? (
        <p className="font-meta text-[11px] text-[var(--muted)]">Loading…</p>
      ) : !allowed ? (
        <>
          {user ? (
            <div className="border border-[var(--line)] p-8 max-w-sm text-center" style={{ background: "var(--panel)" }}>
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
          <div className="flex flex-wrap gap-2 mb-10" role="tablist" aria-label="Admin sections">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className="font-meta text-[10px] px-4 py-2 border transition-colors"
                style={tab === t ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}>
                {t.toUpperCase()}
              </button>
            ))}
            <button
              onClick={signOut}
              className="font-meta text-[10px] px-4 py-2 border border-[var(--line)] text-[var(--muted)] hover:border-red-500 hover:text-red-500 transition-colors ml-auto"
            >
              SIGN OUT
            </button>
          </div>
          {tab === "Orders" && <Orders />}
          {tab === "Communications" && <AdminCommunications />}
          {tab === "Leads" && <Leads />}
          {tab === "Products" && <Products />}
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

