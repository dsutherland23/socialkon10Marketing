import { Link } from "react-router-dom";
import { ShieldAlert, ArrowRight, X, AlertTriangle } from "lucide-react";
import { type RecentOrderRecord } from "../lib/orderConflict";

interface DuplicateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  recentOrder: RecentOrderRecord;
  minutesAgo: number;
  onConfirmDuplicate: () => void;
}

export function DuplicateOrderModal({
  isOpen,
  onClose,
  recentOrder,
  minutesAgo,
  onConfirmDuplicate,
}: DuplicateOrderModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-modal-title"
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
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="font-meta text-[9px] uppercase tracking-wider text-red-500 font-bold">
              Duplicate Order Guard
            </span>
            <h3 id="duplicate-modal-title" className="font-display text-lg font-bold leading-snug">
              Identical Recent Order Detected
            </h3>
          </div>
        </div>

        {/* Description */}
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-amber-500 font-bold font-meta text-[10px]">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Order #{recentOrder.orderId} was placed {minutesAgo === 1 ? "1 minute ago" : `${minutesAgo} minutes ago`}</span>
          </div>
          <p className="text-[var(--muted)]">
            We noticed this checkout matches the exact items and total (${recentOrder.total.toLocaleString()}) for <strong className="text-[var(--ink)]">{recentOrder.email}</strong>.
          </p>
        </div>

        <p className="text-xs text-[var(--muted)] leading-relaxed">
          If you were charged or already received confirmation, submitting again may duplicate your payment.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2">
          <Link
            to="/client"
            onClick={onClose}
            className="btn btn-dept w-full justify-center !py-2.5 font-meta text-[11px] rounded-xl flex items-center gap-2"
          >
            Check Client Portal for Order #{recentOrder.orderId}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          <button
            type="button"
            onClick={() => {
              onClose();
              onConfirmDuplicate();
            }}
            className="btn btn-ghost w-full justify-center !py-2.5 font-meta text-[11px] rounded-xl text-red-500 hover:border-red-500/50"
          >
            Yes, Intentionally Place Order Again
          </button>

          <button
            type="button"
            onClick={onClose}
            className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--ink)] transition-colors text-center py-1 mt-1"
          >
            Cancel & Return to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
