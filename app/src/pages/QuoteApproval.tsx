/**
 * SECURE QUOTE APPROVAL — customer-facing quotation review.
 *
 * Access is granted by an unguessable, expiring token (/quote/:token) that
 * resolves through docAccess/{token} → financeDocuments/{id}. An order
 * reference or quote number alone never authorizes access. The decision
 * write is re-validated server-side by Firestore rules (token must exist,
 * match the doc, and be unexpired; only a sent→accepted/declined transition
 * with decision evidence fields is permitted).
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db, firebaseReady } from "../lib/firebase";
import { getSettings } from "../lib/backend";
import { loadApprovalGrant, submitQuoteDecision } from "../lib/phase2";
import { quoteDecisionBlocker } from "../lib/quote-approval";
import { getFinanceProfile, type FinDocument, type FinanceProfile, DEFAULT_BANKING_NOTE } from "./AdminFinance";
import { toast } from "sonner";
import { idbGet } from "../lib/backend";

type LoadState =
  | { phase: "loading" }
  | { phase: "invalid"; reason: string }
  | { phase: "ready"; quote: FinDocument; token: string };

function cents(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n / 100);
}

export default function QuoteApproval() {
  const { id: token } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [profile, setProfile] = useState<FinanceProfile | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    async function load() {
      if (!token) { setState({ phase: "invalid", reason: "This approval link is malformed." }); return; }
      const s = await getSettings();
      setProfile(getFinanceProfile(s));

      const grant = await loadApprovalGrant(token);
      if (!grant) {
        setState({ phase: "invalid", reason: "This approval link is invalid or has expired. Please ask the studio for a fresh link." });
        return;
      }
      let quote: FinDocument | null = null;
      if (firebaseReady && db) {
        try {
          const snap = await getDoc(doc(db, "financeDocuments", grant.docId));
          if (snap.exists()) quote = { id: snap.id, ...snap.data() } as FinDocument;
        } catch { /* fall through to demo */ }
      }
      if (!quote) {
        const docs = (await idbGet<FinDocument[]>("sk-fin-docs")) ?? [];
        quote = docs.find((d) => d.id === grant.docId) ?? null;
      }
      if (!quote || quote.type !== "quote") {
        setState({ phase: "invalid", reason: "The quotation behind this link could not be found." });
        return;
      }
      setState({ phase: "ready", quote, token });
      setName(quote.clientName ?? "");
    }
    void load();
  }, [token]);

  const decide = async (decision: "accepted" | "declined") => {
    if (state.phase !== "ready") return;
    if (!name.trim()) { toast.error("Please confirm your name before deciding."); return; }
    setBusy(true);
    const res = await submitQuoteDecision(state.token, state.quote.id, state.quote.status, state.quote.type, decision, name);
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? "Could not record your decision."); return; }
    setDecided(decision);
  };

  const p = profile ?? {
    businessName: "Socialkon10 Jamaica",
    email: "socialkon10@gmail.com",
    phone: "1 (876) 255-4848",
    whatsapp: "1 (876) 255-4848",
    location: "23-27 Knutsford Blvd, Kingston, Jamaica",
    website: "https://socialkon10.com",
    logoUrl: "/assets/sk-logo-full.png",
    bankingDetails: DEFAULT_BANKING_NOTE,
    defaultTerms: "Payment due within 14 days of invoice date.",
    jmdExchangeRate: 158.5,
  };

  if (state.phase === "loading") {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-8 h-8 border-2 border-[var(--dept)] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-meta text-xs text-[var(--muted)]">Loading your quotation…</p>
      </div>
    );
  }

  if (state.phase === "invalid") {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <span className="text-4xl mb-4">🔒</span>
        <h1 className="font-display font-bold text-xl uppercase tracking-tight text-[var(--ink)]">Link unavailable</h1>
        <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">{state.reason}</p>
        <Link to="/" className="btn btn-dept text-xs px-5 py-2.5 mt-6">Return to SocialKon10</Link>
      </div>
    );
  }

  const q = state.quote;
  const blocker = quoteDecisionBlocker(q, new Date(), q.dueDate ?? undefined);

  if (decided) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <span className="text-4xl mb-4">{decided === "accepted" ? "🎉" : "📝"}</span>
        <h1 className="font-display font-bold text-xl uppercase tracking-tight text-[var(--ink)]">
          {decided === "accepted" ? "Quotation accepted" : "Quotation declined"}
        </h1>
        <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">
          {decided === "accepted"
            ? `Thank you, ${name}! Your decision on ${q.number} (v${q.version ?? 1}) was recorded with a timestamp. The studio will follow up with next steps.`
            : `Your decision on ${q.number} was recorded. The studio will reach out to discuss adjustments.`}
        </p>
        <Link to="/" className="btn btn-dept text-xs px-5 py-2.5 mt-6">Back to SocialKon10</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f2ee] py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white border border-neutral-200 rounded-sm p-4 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-neutral-900">{p.businessName}</span>
            <span className="text-neutral-400">·</span>
            <span className="text-xs font-mono text-neutral-600 font-semibold">{q.number}{q.version ? ` · v${q.version}` : ""}</span>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-blue-100 text-blue-700">Quotation</span>
        </div>

        <div className="bg-white text-neutral-900 shadow-xl rounded-sm border border-neutral-200 p-4 sm:p-8 md:p-12 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between gap-4 border-b border-neutral-200 pb-6">
            <div>
              <h1 className="text-xl font-bold uppercase tracking-tight text-neutral-950">Quotation {q.number}</h1>
              <p className="text-xs text-neutral-500 mt-1">Issued {q.issueDate}{q.dueDate ? ` · valid until ${q.dueDate}` : ""}</p>
            </div>
            <div className="sm:text-right text-xs text-neutral-500">
              <p className="font-bold text-neutral-800">{p.businessName}</p>
              <p>{p.location}</p>
              <p>{p.email} · {p.phone}</p>
            </div>
          </div>

          <div className="bg-neutral-50 p-4 rounded-sm border border-neutral-200/70 text-xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Prepared for</p>
            <p className="text-sm font-bold text-neutral-950">{q.clientName}</p>
            {q.clientEmail && <p className="text-neutral-600">{q.clientEmail}</p>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[420px]">
              <thead>
                <tr className="border-b-2 border-neutral-950 text-[10px] font-bold uppercase text-neutral-500">
                  <th className="py-2 px-2">Description</th>
                  <th className="py-2 px-2 text-right">Qty</th>
                  <th className="py-2 px-2 text-right">Unit</th>
                  <th className="py-2 px-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {q.items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-3 px-2 font-medium text-neutral-900">{it.description}</td>
                    <td className="py-3 px-2 text-right text-neutral-600">{it.qty}</td>
                    <td className="py-3 px-2 text-right font-mono text-neutral-600">{cents(it.unitPriceCents, q.currency)}</td>
                    <td className="py-3 px-2 text-right font-mono font-semibold">{cents(it.lineTotalCents, q.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-3 border-t border-neutral-200">
            <div className="w-full sm:w-72 space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-600"><span>Subtotal</span><span className="font-mono">{cents(q.subtotalCents, q.currency)}</span></div>
              {q.discountCents > 0 && <div className="flex justify-between text-neutral-600"><span>Discount</span><span className="font-mono">−{cents(q.discountCents, q.currency)}</span></div>}
              {q.taxRatePercent > 0 && <div className="flex justify-between text-neutral-600"><span>Tax ({q.taxRatePercent}%)</span><span className="font-mono">{cents(q.taxCents, q.currency)}</span></div>}
              <div className="flex justify-between text-base font-bold text-neutral-950 pt-2 border-t border-neutral-200"><span>Total</span><span className="font-mono">{cents(q.totalCents, q.currency)}</span></div>
            </div>
          </div>

          {q.terms && (
            <div className="text-[11px] text-neutral-500 border-t border-neutral-200 pt-4">
              <strong className="text-neutral-700">Terms: </strong>{q.terms}
            </div>
          )}

          {/* Decision block */}
          {blocker ? (
            <div className="bg-neutral-50 border border-neutral-200 rounded-sm p-4 text-center text-xs text-neutral-600">
              <strong className="uppercase tracking-wider">{q.status}</strong> — {blocker}
            </div>
          ) : (
            <div className="bg-[var(--dept-soft,#f5f4f1)] border border-neutral-200 rounded-sm p-4 sm:p-6 space-y-3">
              <p className="text-xs text-neutral-700 leading-relaxed">
                Please review the quotation above. Accepting records your decision with a timestamp and notifies
                the studio — no payment is taken here.
              </p>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                Confirm your name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full bg-white border border-neutral-300 rounded px-3 py-2 text-sm font-normal normal-case tracking-normal"
                  placeholder="Your full name"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void decide("accepted")}
                  disabled={busy}
                  className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded transition-colors disabled:opacity-50"
                >
                  {busy ? "Recording…" : "✓ Accept quotation"}
                </button>
                <button
                  onClick={() => void decide("declined")}
                  disabled={busy}
                  className="text-xs font-bold bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 px-4 py-2 rounded transition-colors disabled:opacity-50"
                >
                  Decline / request changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
