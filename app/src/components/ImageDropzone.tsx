import { useRef, useState, type RefObject } from "react";

/* ------------------------------------------------------------------
   IMAGE DROPZONE — drag & drop / click / paste file upload surface.
   2026 best practices: full-zone drop target with depth counter (no
   flicker over child elements), keyboard + screen-reader accessible,
   clipboard paste support, inline busy state, format & size hints.
   Defaults to images; pass `accept` + `fileFilter` for other types.
------------------------------------------------------------------- */

const IMAGE_RE = /\.(jpe?g|png|webp|avif|svg|gif)$/i;

export function ImageDropzone({
  onFiles,
  multiple = false,
  busy = false,
  busyText,
  title,
  hint,
  compact = false,
  inputRef,
  accept = "image/*",
  fileFilter,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  busy?: boolean;
  busyText?: string;
  title: string;
  hint?: string;
  compact?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  accept?: string;
  fileFilter?: (f: File) => boolean;
}) {
  const [dragDepth, setDragDepth] = useState(0);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const active = dragDepth > 0;

  const matches = fileFilter ?? ((f: File) => f.type.startsWith("image/") || IMAGE_RE.test(f.name));

  const extract = (dt: DataTransfer | null): File[] => {
    if (!dt) return [];
    const files = Array.from(dt.files ?? []).filter(matches);
    return multiple ? files : files.slice(0, 1);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      aria-busy={busy}
      onClick={() => !busy && ref.current?.click()}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); ref.current?.click(); } }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragDepth((d) => d + 1); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragDepth((d) => Math.max(0, d - 1)); }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); setDragDepth(0);
        if (busy) return;
        const fs = extract(e.dataTransfer);
        if (fs.length) onFiles(fs);
      }}
      onPaste={(e) => {
        if (busy) return;
        const fs = extract(e.clipboardData);
        if (fs.length) { e.preventDefault(); onFiles(fs); }
      }}
      className={`relative flex flex-col items-center justify-center gap-1.5 text-center border-2 border-dashed rounded cursor-pointer select-none transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--dept)] ${
        compact ? "px-4 py-3" : "px-6 py-7"
      } ${active ? "border-[var(--dept)] bg-[var(--dept)]/10 scale-[1.01]" : "border-[var(--line-strong)]/50 hover:border-[var(--dept)]/70 hover:bg-[var(--panel)]"} ${busy ? "opacity-60 pointer-events-none" : ""}`}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length) onFiles(fs);
          e.target.value = "";
        }}
      />
      {busy ? (
        <>
          <span className="inline-block w-5 h-5 border-2 border-[var(--dept)] border-t-transparent rounded-full animate-spin" aria-hidden />
          <span className="font-meta text-[10px] text-[var(--muted)]">{busyText || "Uploading…"}</span>
        </>
      ) : (
        <>
          <svg width={compact ? 18 : 26} height={compact ? 18 : 26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={active ? "dept-accent" : "text-[var(--muted)]"} aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className={`font-meta ${compact ? "text-[10px]" : "text-[11px]"} font-bold ${active ? "dept-accent" : "text-[var(--ink)]"}`}>
            {active ? "Drop it right here!" : title}
          </span>
          {hint && !active && <span className="font-meta text-[9px] text-[var(--muted)]">{hint}</span>}
        </>
      )}
    </div>
  );
}
