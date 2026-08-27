"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Check, Sparkles, Clock, RefreshCw, ArrowRight, Layers, X } from "lucide-react";
import { formatMoney, type CurrencyCode } from "../lib/data";
import { useShop } from "../lib/shop";

export interface DeliverablesPopoverProps {
  title: string;
  tagline?: string;
  deliverables: string[];
  timeline?: string;
  revisions?: number | string;
  depositPct?: number;
  addons?: { id: string; name: string; price: number; priceType?: string }[];
  serviceSlug?: string;
  price?: number;
  currency?: CurrencyCode;
  billing?: string;
  triggerText?: string;
  countExtra?: number;
  className?: string;
}

/**
 * Automatically converts any hardcoded dollar values (e.g. "$750", "$1,500") embedded in deliverable strings
 * to the currently selected active currency (e.g. "J$118,793", "C$1,020", "$750").
 */
function formatCurrencyInText(text: string, code: CurrencyCode): string {
  if (code === "USD" || code === "BMD") return text;
  return text.replace(/\$([0-9,]+)/g, (match, rawAmount) => {
    const num = Number(rawAmount.replace(/,/g, ""));
    if (isNaN(num)) return match;
    return formatMoney(num, code);
  });
}

export function DeliverablesPopover({
  title,
  tagline,
  deliverables,
  timeline,
  revisions,
  depositPct = 50,
  addons = [],
  serviceSlug,
  price,
  currency,
  billing,
  triggerText,
  countExtra,
  className = "",
}: DeliverablesPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { currency: shopCurrency } = useShop();
  const curr: CurrencyCode = currency || shopCurrency || "USD";

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(380, window.innerWidth - 32);
    const popoverHeight = 420; // safe estimation for auto-flip

    // Horizontal centering relative to trigger button with viewport edge guards
    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    if (left < 16) left = 16;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }

    // Vertical placement: prefer below trigger; if too close to bottom, place above
    let top = rect.bottom + 8;
    if (top + popoverHeight > window.innerHeight && rect.top > popoverHeight) {
      top = Math.max(16, rect.top - popoverHeight - 8);
    } else if (top + popoverHeight > window.innerHeight) {
      // If fits neither cleanly, clamp within viewport
      top = Math.max(16, window.innerHeight - popoverHeight - 16);
    }

    setCoords({ top, left });
  }, []);

  const handleMouseEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    updatePosition();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimer.current = setTimeout(() => {
      setIsOpen(false);
    }, 220);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updatePosition();
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      document.removeEventListener("mousedown", handleClickOutside);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [isOpen, updatePosition]);

  const defaultTrigger = countExtra
    ? `+ ${countExtra} more included`
    : "View full inclusions";

  const popoverContent = isOpen && mounted ? (
    <div
      ref={popoverRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        zIndex: 999999,
      }}
      className="w-[340px] sm:w-[380px] max-w-[calc(100vw-32px)] bg-[var(--panel)]/95 backdrop-blur-2xl border border-[var(--line-strong)] rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] p-5 animate-in fade-in zoom-in-95 duration-200 text-[var(--ink)] select-text"
      role="dialog"
      aria-label={`Inclusions for ${title}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--line)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[var(--dept-soft)] text-[var(--dept)] font-mono text-[9px] font-bold uppercase tracking-wider">
              COMPLETE SCOPE
            </span>
            {billing === "monthly" && (
              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono text-[9px] font-bold uppercase">
                MONTHLY RETAINER
              </span>
            )}
          </div>
          <h4 className="font-display text-base font-bold uppercase tracking-tight mt-1.5 text-[var(--ink)]">
            {title}
          </h4>
          {tagline && (
            <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2 leading-relaxed">
              {tagline}
            </p>
          )}
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 rounded-full text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--line)] transition-colors"
          aria-label="Close popup"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Specs Badges */}
      <div className="grid grid-cols-2 gap-2 my-3 py-2 px-3 rounded-lg bg-[var(--bg)] border border-[var(--line)] text-[11px] font-meta">
        {timeline && (
          <div className="flex items-center gap-1.5 text-[var(--muted)]">
            <Clock className="w-3.5 h-3.5 text-[var(--dept)]" />
            <span>{timeline}</span>
          </div>
        )}
        {revisions !== undefined && (
          <div className="flex items-center gap-1.5 text-[var(--muted)]">
            <RefreshCw className="w-3.5 h-3.5 text-[var(--dept)]" />
            <span>{revisions} revision rounds</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[var(--muted)] col-span-2">
          <Layers className="w-3.5 h-3.5 text-[var(--dept)]" />
          <span>{depositPct}% deposit to kick off · Master vector files</span>
        </div>
      </div>

      {/* All Deliverables List with dynamic currency conversion */}
      <div className="mt-3">
        <p className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>What's inside this package ({deliverables.length})</span>
          <span className="text-[var(--dept)] font-bold">100% Guaranteed</span>
        </p>
        <ul className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs scrollbar-thin">
          {deliverables.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 p-1.5 rounded-md hover:bg-[var(--line)]/40 transition-colors"
            >
              <div className="w-4 h-4 rounded-full bg-[var(--dept-soft)] text-[var(--dept)] flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3 h-3 stroke-[2.5]" />
              </div>
              <span className="text-[var(--ink)] leading-snug font-medium">
                {formatCurrencyInText(item, curr)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Optional Add-Ons Summary with dynamic currency conversion */}
      {addons.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--line)]">
          <p className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider mb-1.5">
            Available Add-Ons
          </p>
          <div className="flex flex-wrap gap-1.5">
            {addons.slice(0, 3).map((addon) => (
              <span
                key={addon.id}
                className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[var(--muted)]"
              >
                + {addon.name} ({addon.priceType === "quote" ? "Quote" : formatMoney(addon.price, curr)})
              </span>
            ))}
            {addons.length > 3 && (
              <span className="text-[10px] px-1.5 py-0.5 text-[var(--muted)] font-meta">
                +{addons.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer CTA with dynamic currency conversion */}
      <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center justify-between gap-3">
        {price !== undefined && (
          <div>
            <span className="font-meta text-[9px] text-[var(--muted)] block">Total Investment</span>
            <span className="font-display font-bold text-sm text-[var(--ink)]">
              {formatMoney(price, curr)}
              {billing === "monthly" ? "/mo" : ""}
            </span>
          </div>
        )}

        {serviceSlug ? (
          <Link
            to={`/services/${serviceSlug}`}
            onClick={() => setIsOpen(false)}
            className="btn btn-dept !py-1.5 !px-3 text-[11px] font-meta flex items-center gap-1.5 ml-auto"
          >
            <span>View Full Page</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <button
            onClick={() => setIsOpen(false)}
            className="btn btn-ghost !py-1.5 !px-3 text-[11px] font-meta ml-auto"
          >
            Got it
          </button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative inline-block ${className}`} onMouseLeave={handleMouseLeave}>
      {/* Interactive Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        onMouseEnter={handleMouseEnter}
        className="group/more inline-flex items-center gap-1.5 font-meta text-[10px] text-[var(--dept)] hover:text-[var(--ink)] bg-[var(--dept-soft)] hover:bg-[var(--line)] px-2 py-0.5 rounded transition-all duration-200 border border-[var(--dept)]/30 hover:border-[var(--dept)]"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Sparkles className="w-3 h-3 text-[var(--dept)] animate-pulse" />
        <span className="font-semibold underline decoration-dotted underline-offset-2">
          {triggerText || defaultTrigger}
        </span>
      </button>

      {/* Render popover via React Portal directly into document.body to break free of parent transforms & z-index stacking */}
      {mounted && typeof document !== "undefined" && popoverContent && createPortal(popoverContent, document.body)}
    </div>
  );
}

export default DeliverablesPopover;
