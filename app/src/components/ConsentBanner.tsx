import { useEffect, useState } from "react";
import { getConsentPreferences, setConsentPreferences, type ConsentPreferences } from "../lib/analytics";

/* ------------------------------------------------------------------
   CONSENT & PRIVACY MANAGER (PRD §Privacy & Consent)
   Non-intrusive 2026 consent bar with granular category controls:
   • Necessary (Core site functions)
   • Analytics (Anonymous first-party visitor telemetry)
   • Marketing (Campaign & lead attribution)
   • Advertising (Meta Pixel & Google Ads conversion tracking)
------------------------------------------------------------------- */

export function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [prefs, setPrefs] = useState<ConsentPreferences>(() => getConsentPreferences());

  useEffect(() => {
    // Show banner only if user hasn't made a choice yet
    try {
      const hasSaved = localStorage.getItem("sk_consent_preferences");
      if (!hasSaved) {
        // Small initial delay so page loads gracefully first
        const t = setTimeout(() => setOpen(true), 1200);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, []);

  if (!open) return null;

  const handleAcceptAll = () => {
    const all = { necessary: true, analytics: true, marketing: true, advertising: true };
    setConsentPreferences(all);
    setOpen(false);
  };

  const handleRejectOptional = () => {
    const min = { necessary: true, analytics: false, marketing: false, advertising: false };
    setConsentPreferences(min);
    setOpen(false);
  };

  const handleSaveCustom = () => {
    setConsentPreferences(prefs);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Privacy & Cookie Preferences"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 p-5 rounded-2xl border border-[var(--line-strong)] shadow-2xl backdrop-blur-md animate-fade-in"
      style={{ background: "var(--panel)", color: "var(--ink)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <h3 className="font-display text-xs font-bold uppercase tracking-wider">Privacy & Tracking</h3>
        </div>
        <button
          type="button"
          onClick={handleRejectOptional}
          className="text-[var(--muted)] hover:text-[var(--ink)] text-xs p-1"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <p className="font-meta text-[10px] text-[var(--muted)] leading-relaxed">
        We use first-party analytics to understand visitor interest, attribute campaigns, and improve our creative studio experience. No private credentials or payment details are ever tracked.
      </p>

      {customize ? (
        <div className="mt-4 space-y-2 border-t border-[var(--line)] pt-3">
          <label className="flex items-center justify-between text-[10px] font-meta py-1 opacity-70">
            <span>Necessary (Required)</span>
            <input type="checkbox" checked disabled className="accent-[var(--dept)]" />
          </label>
          <label className="flex items-center justify-between text-[10px] font-meta py-1 cursor-pointer">
            <span>First-Party Analytics</span>
            <input
              type="checkbox"
              checked={prefs.analytics}
              onChange={(e) => setPrefs((p) => ({ ...p, analytics: e.target.checked }))}
              className="accent-[var(--dept)] w-4 h-4 cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between text-[10px] font-meta py-1 cursor-pointer">
            <span>Marketing Attribution</span>
            <input
              type="checkbox"
              checked={prefs.marketing}
              onChange={(e) => setPrefs((p) => ({ ...p, marketing: e.target.checked }))}
              className="accent-[var(--dept)] w-4 h-4 cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between text-[10px] font-meta py-1 cursor-pointer">
            <span>Advertising Conversion Pixels</span>
            <input
              type="checkbox"
              checked={prefs.advertising}
              onChange={(e) => setPrefs((p) => ({ ...p, advertising: e.target.checked }))}
              className="accent-[var(--dept)] w-4 h-4 cursor-pointer"
            />
          </label>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleSaveCustom}
              className="btn btn-dept !py-1.5 !px-3 text-[9.5px] flex-1 justify-center rounded-xl"
            >
              Save Preferences
            </button>
            <button
              type="button"
              onClick={() => setCustomize(false)}
              className="btn btn-ghost !py-1.5 !px-2.5 text-[9px] rounded-xl"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAcceptAll}
            className="btn btn-dept !py-1.5 !px-3 text-[9.5px] flex-1 justify-center rounded-xl font-bold"
          >
            Accept All
          </button>
          <button
            type="button"
            onClick={handleRejectOptional}
            className="btn btn-ghost !py-1.5 !px-2.5 text-[9px] rounded-xl"
          >
            Reject Optional
          </button>
          <button
            type="button"
            onClick={() => setCustomize(true)}
            className="text-[9px] font-meta text-[var(--muted)] hover:underline ml-auto"
          >
            Customize
          </button>
        </div>
      )}
    </div>
  );
}
