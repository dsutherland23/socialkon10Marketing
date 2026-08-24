import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listMessages,
  postMessage,
  uploadChatAttachment,
  type MessageAttachment,
  type MessageRecord,
} from "../lib/backend";

/* ------------------------------------------------------------------
   PROJECT MESSAGING & ASSET COLLABORATION (2026 Best Practices)
   • Rich in-thread file uploads (logos, moodboards, PSD, AI, PDF)
   • Drag-and-drop & clipboard paste screenshot support
   • Inline image gallery & lightbox zoom
   • Multi-format downloadable vector/document asset chips
   • Real-time bi-directional messaging between Client & Studio
------------------------------------------------------------------- */

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(ext: string, type: MessageAttachment["type"]): string {
  if (type === "image") return "🖼️";
  if (type === "vector") return "📐";
  if (ext === "pdf") return "📄";
  if (["doc", "docx", "txt", "rtf"].includes(ext)) return "📝";
  return "📎";
}

export function MessageThread({
  orderId,
  from,
  author,
}: {
  orderId: string;
  from: "studio" | "client";
  author: string;
}) {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<{ url: string; name: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const reload = () => listMessages(orderId).then(setMessages);
  useEffect(() => { reload(); }, [orderId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, pendingFiles.length]);

  // Handle drag-and-drop over the chat thread
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragging) setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      queueFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Handle clipboard image pasting (Cmd+V / Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      queueFiles(pastedFiles);
      toast.info(`${pastedFiles.length} image pasted from clipboard`);
    }
  };

  const queueFiles = (files: File[]) => {
    const MAX_SIZE = 25 * 1024 * 1024; // 25MB
    const valid = files.filter((f) => {
      if (f.size > MAX_SIZE) {
        toast.error(`"${f.name}" exceeds 25MB limit.`);
        return false;
      }
      return true;
    });
    setPendingFiles((prev) => [...prev, ...valid]);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const send = async () => {
    const t = text.trim();
    if ((!t && pendingFiles.length === 0) || busy || uploading) return;

    setBusy(true);
    let attachments: MessageAttachment[] = [];

    // Upload pending files if any
    if (pendingFiles.length > 0) {
      setUploading(true);
      try {
        const uploadPromises = pendingFiles.map((f) => uploadChatAttachment(orderId, f));
        attachments = await Promise.all(uploadPromises);
      } catch (err) {
        console.error("Error uploading attachments:", err);
        toast.error("Failed to upload some files. Please try again.");
        setUploading(false);
        setBusy(false);
        return;
      }
      setUploading(false);
    }

    try {
      await postMessage(orderId, from, t, author, attachments);
      setText("");
      setPendingFiles([]);
      await reload();
      toast.success("Message sent");
    } catch (err) {
      console.error("Failed to post message:", err);
      toast.error("Failed to send message.");
    }
    setBusy(false);
  };

  return (
    <div
      ref={dropZoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative border border-[var(--line)] flex flex-col transition-all duration-200 ${
        dragging ? "ring-2 ring-[var(--dept)] bg-[var(--dept-soft)]" : ""
      }`}
      style={{ background: "var(--bg)" }}
    >
      {/* Drag & Drop Visual Overlay */}
      {dragging && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[var(--bg)]/90 backdrop-blur-sm pointer-events-none border-2 border-dashed border-[var(--dept)] m-1 rounded-lg">
          <span className="text-3xl mb-2 animate-bounce">📥</span>
          <p className="font-display text-sm font-bold uppercase tracking-wider text-[var(--dept)]">
            Drop materials & assets here
          </p>
          <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
            Logos, vectors (.ai, .psd), images, and documents
          </p>
        </div>
      )}

      {/* Message History List */}
      <div className="max-h-72 overflow-y-auto px-4 py-3.5 flex flex-col gap-3" aria-live="polite">
        {messages.length === 0 && (
          <div className="text-center py-6 px-4 border border-dashed border-[var(--line)] rounded-lg my-1">
            <span className="text-2xl block mb-2">💬</span>
            <p className="font-display text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
              Direct Project Communication
            </p>
            <p className="font-meta text-[10.5px] text-[var(--muted)] mt-1 max-w-sm mx-auto leading-relaxed">
              Share logos, brand assets, moodboards, or instructions directly with your designer. All files are securely saved to this order.
            </p>
          </div>
        )}

        {messages.map((m) => {
          const isMe = m.from === from;
          return (
            <div
              key={m.id}
              className={`max-w-[88%] flex flex-col gap-1.5 ${isMe ? "self-end items-end" : "self-start items-start"}`}
            >
              {/* Sender label */}
              <span className="font-meta text-[9px] text-[var(--muted)] px-1">
                {m.from === "studio" ? "🎨 SOCIAL KON10 STUDIO" : `👤 ${m.author || "Client"}`} · {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
              </span>

              {/* Message Bubble */}
              <div
                className="px-4 py-3 text-[13px] leading-relaxed rounded-xl shadow-sm"
                style={{
                  background: isMe ? "var(--dept)" : "var(--panel)",
                  color: isMe ? "var(--on-dept, #000)" : "var(--ink)",
                  border: isMe ? "none" : "1px solid var(--line)",
                }}
              >
                {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}

                {/* Attached Files & Gallery */}
                {m.attachments && m.attachments.length > 0 && (
                  <div className={`flex flex-col gap-2 ${m.text ? "mt-2.5 pt-2.5 border-t border-current/15" : ""}`}>
                    {/* Image / Logo Previews */}
                    <div className="grid grid-cols-2 gap-2">
                      {m.attachments
                        .filter((a) => a.type === "image")
                        .map((att) => (
                          <div
                            key={att.id || att.url}
                            onClick={() => setZoomUrl({ url: att.url, name: att.name })}
                            className="group relative cursor-pointer rounded-lg overflow-hidden border border-current/20 bg-black/10 aspect-video flex items-center justify-center transition-transform hover:scale-[1.02]"
                            title="Click to zoom preview"
                          >
                            <img
                              src={att.url}
                              alt={att.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-meta gap-1">
                              <span>🔍 Zoom</span>
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Non-image Documents & Vector Asset Cards */}
                    <div className="flex flex-col gap-1.5">
                      {m.attachments
                        .filter((a) => a.type !== "image")
                        .map((att) => {
                          const ext = att.name.split(".").pop()?.toUpperCase() || "FILE";
                          return (
                            <a
                              key={att.id || att.url}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={att.name}
                              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-current/20 bg-black/5 hover:bg-black/10 transition-colors text-[11px] font-mono font-medium"
                              style={{ textDecoration: "none", color: "inherit" }}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="text-base shrink-0">{getFileIcon(ext.toLowerCase(), att.type)}</span>
                                <div className="truncate text-left">
                                  <span className="truncate block font-sans font-medium text-[12px]">{att.name}</span>
                                  <span className="font-meta text-[9px] opacity-70">
                                    {ext} · {formatBytes(att.size)}
                                  </span>
                                </div>
                              </div>
                              <span className="shrink-0 px-2 py-0.5 rounded bg-current/10 text-[9px] font-bold">
                                ⬇ DOWNLOAD
                              </span>
                            </a>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Pending attachments tray */}
      {pendingFiles.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--line)] bg-[var(--panel)] flex flex-wrap gap-2 items-center animate-in fade-in duration-150">
          <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider mr-1">
            Attachments ({pendingFiles.length}):
          </span>
          {pendingFiles.map((file, i) => {
            const isImg = file.type.startsWith("image/");
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[var(--line-strong)] text-[11px] font-meta bg-[var(--bg)] shadow-sm"
              >
                <span>{isImg ? "🖼️" : "📎"}</span>
                <span className="truncate max-w-[120px]" title={file.name}>
                  {file.name}
                </span>
                <span className="text-[9px] text-[var(--muted)]">({formatBytes(file.size)})</span>
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  className="ml-1 text-[var(--muted)] hover:text-red-500 font-bold p-0.5 transition-colors"
                  aria-label={`Remove ${file.name}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Action Suggestion Chips */}
      <div className="px-3 pt-2 flex flex-wrap gap-1.5 border-t border-[var(--line)]/60">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="font-meta text-[9.5px] px-2.5 py-1 rounded-full border border-[var(--line)] hover:border-[var(--dept)] hover:text-[var(--dept)] bg-[var(--panel)] transition-colors flex items-center gap-1"
        >
          <span>📎</span> Upload Logo / Files
        </button>
        <button
          type="button"
          onClick={() => setText((t) => (t ? `${t}\nBrand Colors: #` : "Brand Colors: #"))}
          className="font-meta text-[9.5px] px-2.5 py-1 rounded-full border border-[var(--line)] hover:border-[var(--dept)] hover:text-[var(--dept)] bg-[var(--panel)] transition-colors flex items-center gap-1"
        >
          <span>🎨</span> Add Color Hex
        </button>
      </div>

      {/* Input Composer & Toolbar */}
      <div className="flex items-center gap-2 p-3">
        {/* Hidden File Picker */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.ai,.psd,.eps,.svg,.doc,.docx,.txt,.zip"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              queueFiles(Array.from(e.target.files));
            }
          }}
        />

        {/* Paperclip Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach logos, images, or documents (max 25MB)"
          aria-label="Attach files"
          className="p-2.5 rounded-lg border border-[var(--line)] hover:border-[var(--dept)] hover:bg-[var(--panel)] text-[var(--ink)] transition-colors active:scale-95 shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* Message Input with Clipboard Paste listener */}
        <div className="relative flex-1">
          <input
            id={`msg-${orderId}`}
            className="w-full bg-transparent border border-[var(--line)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--dept)] transition-colors rounded-md"
            placeholder="Type a message or paste a screenshot…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
        </div>

        {/* Send Button */}
        <button
          type="button"
          className="btn btn-dept !py-2.5 !px-4 shrink-0 flex items-center gap-1.5"
          onClick={send}
          disabled={busy || uploading || (!text.trim() && pendingFiles.length === 0)}
        >
          {uploading ? (
            <span>Uploading…</span>
          ) : busy ? (
            <span>Sending…</span>
          ) : (
            <>
              <span>Send</span>
              <span className="btn-arrow" aria-hidden>→</span>
            </>
          )}
        </button>
      </div>

      {/* Lightbox / Zoom Image Modal */}
      {zoomUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setZoomUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <div className="relative max-w-4xl max-h-[85vh] p-2 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex items-center justify-between pb-2 text-white font-meta text-xs">
              <span className="truncate max-w-md">{zoomUrl.name}</span>
              <div className="flex items-center gap-3">
                <a
                  href={zoomUrl.url}
                  download={zoomUrl.name}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded bg-white/20 hover:bg-white/30 text-white font-mono text-[10px] uppercase"
                >
                  ⬇ Download Full Res
                </a>
                <button
                  type="button"
                  onClick={() => setZoomUrl(null)}
                  className="p-1 text-white/80 hover:text-white text-lg font-bold"
                  aria-label="Close image preview"
                >
                  ✕
                </button>
              </div>
            </div>
            <img
              src={zoomUrl.url}
              alt={zoomUrl.name}
              className="max-h-[75vh] max-w-full object-contain rounded border border-white/20 shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
