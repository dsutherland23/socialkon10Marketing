import { useEffect, useState } from "react";

export interface BatchActionBarProps {
  selectedCount: number;
  totalCount?: number;
  onClearSelection: () => void;
  onSelectAll?: () => void;
  onDelete?: () => Promise<void> | void;
  onExportCsv?: () => void;
  onExportJson?: () => void;
  statusOptions?: { label: string; value: string }[];
  onStatusChange?: (status: string) => Promise<void> | void;
  statusLabel?: string;
  customActions?: {
    label: string;
    icon?: string;
    onClick: () => Promise<void> | void;
    tone?: "dept" | "ghost" | "amber" | "emerald";
  }[];
  deleteLabel?: string;
  isDeleting?: boolean;
}

export function BatchActionBar({
  selectedCount,
  totalCount,
  onClearSelection,
  onSelectAll,
  onDelete,
  onExportCsv,
  onExportJson,
  statusOptions,
  onStatusChange,
  statusLabel = "Set Status",
  customActions = [],
  deleteLabel = "Delete Selected",
  isDeleting = false,
}: BatchActionBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Press ESC to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedCount > 0) {
        onClearSelection();
        setConfirmDelete(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCount, onClearSelection]);

  // Reset delete confirmation if selection changes
  useEffect(() => {
    setConfirmDelete(false);
  }, [selectedCount]);

  if (selectedCount === 0) return null;

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await onDelete();
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      role="region"
      aria-label="Batch operations toolbar"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-4xl animate-in fade-in slide-in-from-bottom-5 duration-200"
    >
      <div className="bg-[var(--panel)]/95 backdrop-blur-md border border-[var(--line-strong)] dark:border-[var(--dept)]/40 p-3 sm:p-3.5 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Count & Deselect */}
        <div className="flex items-center gap-2.5">
          <span className="font-display text-xs font-bold uppercase tracking-wider bg-[var(--dept)] text-[var(--on-dept)] px-2.5 py-1 rounded-xl shadow-xs">
            {selectedCount} Selected
          </span>

          {totalCount !== undefined && onSelectAll && selectedCount < totalCount && (
            <button
              type="button"
              onClick={onSelectAll}
              className="font-meta text-[10px] text-[var(--dept)] hover:underline hidden sm:inline-block"
            >
              Select all ({totalCount})
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              onClearSelection();
            }}
            className="font-meta text-[10.5px] text-[var(--muted)] hover:text-[var(--ink)] transition-colors flex items-center gap-1"
            title="Deselect all (Esc)"
          >
            <span>✕</span>
            <span className="hidden sm:inline">Deselect</span>
            <kbd className="hidden md:inline-block text-[9px] px-1 py-0.5 bg-[var(--bg)] border border-[var(--line)] rounded">Esc</kbd>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {/* Status Changer */}
          {statusOptions && statusOptions.length > 0 && onStatusChange && (
            <div className="flex items-center gap-1 bg-[var(--bg)] border border-[var(--line)] rounded-xl px-2 py-0.5">
              <label htmlFor="batch-status-select" className="font-meta text-[9px] text-[var(--muted)] uppercase font-bold hidden sm:inline">
                {statusLabel}:
              </label>
              <select
                id="batch-status-select"
                aria-label={statusLabel}
                defaultValue=""
                onChange={async (e) => {
                  if (!e.target.value) return;
                  setBusy(true);
                  try {
                    await onStatusChange(e.target.value);
                  } finally {
                    e.target.value = "";
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="bg-transparent font-meta text-[10px] font-bold outline-none py-1 cursor-pointer"
              >
                <option value="" disabled>Change Status →</option>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom Actions */}
          {customActions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              disabled={busy}
              onClick={action.onClick}
              className={`btn !py-1.5 !px-3 font-meta text-[10px] font-bold rounded-xl transition-all ${
                action.tone === "dept"
                  ? "btn-dept"
                  : action.tone === "emerald"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : action.tone === "amber"
                  ? "bg-amber-500 text-black hover:bg-amber-600"
                  : "btn-ghost border border-[var(--line)]"
              }`}
            >
              {action.icon && <span className="mr-1">{action.icon}</span>}
              {action.label}
            </button>
          ))}

          {/* Export CSV / JSON */}
          {onExportCsv && (
            <button
              type="button"
              disabled={busy}
              onClick={onExportCsv}
              className="btn btn-ghost !py-1.5 !px-2.5 font-meta text-[10px] rounded-xl border border-[var(--line)] hover:border-[var(--dept)]"
              title="Export selected as CSV"
            >
              📥 CSV
            </button>
          )}

          {onExportJson && (
            <button
              type="button"
              disabled={busy}
              onClick={onExportJson}
              className="btn btn-ghost !py-1.5 !px-2.5 font-meta text-[10px] rounded-xl border border-[var(--line)] hover:border-[var(--dept)]"
              title="Export selected as JSON"
            >
              📄 JSON
            </button>
          )}

          {/* Destructive Delete Button */}
          {onDelete && (
            confirmDelete ? (
              <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/40 p-1 rounded-xl animate-in fade-in">
                <button
                  type="button"
                  disabled={busy || isDeleting}
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700 text-white font-meta text-[10px] font-bold px-3 py-1 rounded-lg transition-colors shadow-xs"
                >
                  {busy || isDeleting ? "Deleting…" : `Confirm Delete (${selectedCount})`}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="font-meta text-[9.5px] text-[var(--muted)] hover:text-[var(--ink)] px-1.5 py-1"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy || isDeleting}
                onClick={handleDelete}
                className="btn btn-ghost !py-1.5 !px-3 font-meta text-[10px] !text-red-500 hover:!bg-red-500/10 rounded-xl border border-red-500/20 transition-colors"
              >
                🗑️ {deleteLabel}
              </button>
            )
          )}
        </div>
      </div>
    </aside>
  );
}
