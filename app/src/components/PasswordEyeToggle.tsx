import { useState } from "react";

interface PasswordEyeToggleProps {
  show: boolean;
  onToggle: () => void;
  className?: string;
  ariaLabel?: string;
  size?: number;
}

/**
 * High-visibility, creative Eye Toggle for password fields.
 * Crisp SVG icons, bold high-contrast strokes, clear state badges,
 * and seamless light/dark readability.
 */
export function PasswordEyeToggle({
  show,
  onToggle,
  className = "",
  ariaLabel,
  size = 20,
}: PasswordEyeToggleProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      tabIndex={0}
      aria-label={ariaLabel || (show ? "Hide password" : "Show password")}
      aria-pressed={show}
      title={show ? "Hide password" : "Show password"}
      className={`group relative inline-flex items-center justify-center p-2 rounded-md text-[var(--ink)] hover:text-[var(--dept,#22d3ee)] hover:bg-[var(--line)]/30 focus-visible:outline-2 focus-visible:outline-[var(--dept,#22d3ee)] active:scale-95 transition-all duration-150 cursor-pointer select-none ${className}`}
    >
      <span className="sr-only">{show ? "Hide password" : "Show password"}</span>

      {show ? (
        /* Eye Open (Visible / Showing) */
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)] transition-transform duration-200 group-hover:scale-110"
          aria-hidden="true"
        >
          {/* Outer Eye Arch */}
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          {/* Luminous Pupil */}
          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
          <circle cx="13.2" cy="10.8" r="0.9" fill="var(--bg, #000)" />
        </svg>
      ) : (
        /* Eye Slashed (Concealed / Hidden) — Crisp, bold, high-contrast */
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-90 group-hover:opacity-100 text-[var(--ink)] group-hover:text-cyan-400 transition-all duration-200 group-hover:scale-110"
          aria-hidden="true"
        >
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          {/* Prominent High-Contrast Slash */}
          <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2.4" />
        </svg>
      )}

      {/* Floating High-Contrast Status Pill on hover */}
      {hovered && (
        <span
          className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md text-[10px] font-bold font-mono uppercase tracking-wider whitespace-nowrap pointer-events-none z-30 shadow-xl border transition-opacity duration-150"
          style={{
            background: show ? "#09090b" : "#18181b",
            color: show ? "#22d3ee" : "#f4f4f5",
            borderColor: show ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.25)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          {show ? "👁 SHOWING" : "🔒 HIDDEN"}
        </span>
      )}
    </button>
  );
}
