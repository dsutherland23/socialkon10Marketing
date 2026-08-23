import { useEffect, useRef, useState } from "react";
import { listMessages, postMessage, type MessageRecord } from "../lib/backend";

/* ------------------------------------------------------------------
   PROJECT MESSAGING (PRD §66)
   Communications tied to the project — used in the client portal
   (from "client") and admin dashboard (from "studio").
------------------------------------------------------------------- */

export function MessageThread({ orderId, from, author }: { orderId: string; from: "studio" | "client"; author: string }) {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const reload = () => listMessages(orderId).then(setMessages);
  useEffect(() => { reload(); }, [orderId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    await postMessage(orderId, from, t, author);
    setText("");
    await reload();
    setBusy(false);
  };

  return (
    <div className="border border-[var(--line)]" style={{ background: "var(--bg)" }}>
      <div className="max-h-56 overflow-y-auto px-4 py-3 flex flex-col gap-2.5" aria-live="polite">
        {messages.length === 0 && (
          <p className="font-meta text-[10px] text-[var(--muted)] py-2">No messages yet — questions and updates about this project land here.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] px-3.5 py-2.5 text-[13px] leading-relaxed ${m.from === from ? "self-end" : "self-start"}`}
            style={{
              background: m.from === from ? "var(--dept)" : "var(--panel)",
              color: m.from === from ? "var(--on-dept)" : "var(--ink)",
              border: m.from === from ? "none" : "1px solid var(--line)",
            }}>
            <p>{m.text}</p>
            <p className="font-meta text-[8px] mt-1.5 opacity-60">
              {m.from === "studio" ? "SOCIAL KON10" : m.author} · {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 px-3 py-3 rule-t">
        <label className="sr-only" htmlFor={`msg-${orderId}`}>Message about this project</label>
        <input
          id={`msg-${orderId}`}
          className="flex-1 bg-transparent border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--dept)] transition-colors"
          placeholder="Write a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        <button className="btn btn-dept !py-2 !px-4" onClick={send} disabled={busy || !text.trim()}>Send</button>
      </div>
    </div>
  );
}
