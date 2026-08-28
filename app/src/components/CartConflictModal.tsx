import { Link } from "react-router-dom";
import { AlertCircle, PlusCircle, ArrowRight, X } from "lucide-react";

interface CartConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  packageName: string;
  onAddAnyway: () => void;
  packageUrl?: string;
}

export function CartConflictModal({
  isOpen,
  onClose,
  itemName,
  packageName,
  onAddAnyway,
  packageUrl = "/custom-package",
}: CartConflictModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
    >
      <div className="relative w-full max-w-md border border-[var(--line-strong)] rounded-2xl bg-[var(--panel)] p-6 sm:p-7 shadow-2xl space-y-5">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--line)]/40 transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Badge & Icon */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="font-meta text-[9px] uppercase tracking-wider text-amber-500 font-bold">
              Package Conflict Detected
            </span>
            <h3 id="conflict-modal-title" className="font-display text-lg font-bold leading-snug">
              Already in your package!
            </h3>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
          <strong className="text-[var(--ink)]">{itemName}</strong> is already included as a core deliverable in your{" "}
          <strong className="text-[var(--dept)]">{packageName}</strong>.
        </p>

        <p className="font-meta text-[10px] text-[var(--muted)] bg-[var(--bg)] p-3 rounded-xl border border-[var(--line)]">
          💡 You do not need to purchase this separately unless you intentionally require a second, distinct design concept or extra set.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              onAddAnyway();
              onClose();
            }}
            className="btn btn-dept w-full justify-center !py-2.5 font-meta text-[11px] rounded-xl flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            Add as Additional Deliverable (+1)
          </button>

          <Link
            to={packageUrl}
            onClick={onClose}
            className="btn btn-ghost w-full justify-center !py-2.5 font-meta text-[11px] rounded-xl flex items-center gap-2"
          >
            Review Package Details
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)] transition-colors text-center py-1 mt-1"
          >
            Cancel & Keep Package Only
          </button>
        </div>
      </div>
    </div>
  );
}
