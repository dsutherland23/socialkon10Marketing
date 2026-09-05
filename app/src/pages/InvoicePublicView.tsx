import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "../lib/firebase";
import { getSettings, type SiteSettings } from "../lib/backend";
import {
  type FinDocument,
  type FinanceProfile,
  getFinanceProfile,
  DEFAULT_BANKING_NOTE,
} from "./AdminFinance";
import { jsPDF } from "jspdf";
import { toast } from "sonner";

function centsToDisplay(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function centsToJmd(cents: number, rate = 158.50): string {
  const usd = cents / 100;
  const jmd = usd * rate;
  return new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD" }).format(jmd);
}

export default function InvoicePublicView() {
  const { id } = useParams<{ id: string }>();
  const [finDoc, setFinDoc] = useState<FinDocument | null>(null);
  const [profile, setProfile] = useState<FinanceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) { setLoading(false); return; }
      setLoading(true);
      try {
        const s: SiteSettings = await getSettings();
        const prof = getFinanceProfile(s);
        setProfile(prof);

        if (firebaseReady && db) {
          // 1. Try fetching by doc ID
          const docRef = doc(db, "financeDocuments", id);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            setFinDoc({ id: snap.id, ...snap.data() } as FinDocument);
            setLoading(false);
            return;
          }

          // 2. Try fetching by document number (e.g. INV-2026-0001)
          const q = query(collection(db, "financeDocuments"), where("number", "==", id.toUpperCase()));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            const first = qSnap.docs[0];
            setFinDoc({ id: first.id, ...first.data() } as FinDocument);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to load invoice:", err);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const copyBankDetails = () => {
    const text = finDoc?.notes?.trim() || profile?.bankingDetails || DEFAULT_BANKING_NOTE;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Bank details copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const downloadPdf = () => {
    if (!finDoc) return;
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
    };

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const W = 612;
    const margin = 44;
    let y = 0;

    // Header bar
    pdf.setFillColor(17, 17, 17);
    pdf.rect(0, 0, W, 58, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(255, 255, 255);
    pdf.text(p.businessName.toUpperCase(), margin, 32);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.text(`${p.email} · ${p.phone}`, W - margin, 32, { align: "right" });
    pdf.text(p.location, W - margin, 46, { align: "right" });
    y = 85;

    // Document type & number
    pdf.setTextColor(17, 17, 17);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text(finDoc.type.toUpperCase(), margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(90, 90, 90);
    pdf.text(`#${finDoc.number}`, margin, y + 18);
    pdf.setTextColor(17, 17, 17);
    y += 48;

    // Two-column: Bill To / Details
    const colR = W / 2 + 24;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text("BILL TO", margin, y);
    pdf.text("DOCUMENT DETAILS", colR, y);
    y += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(17, 17, 17);
    pdf.text(finDoc.clientName || "Valued Client", margin, y);
    pdf.text(`Issue Date: ${finDoc.issueDate}`, colR, y);
    y += 14;
    if (finDoc.clientEmail) { pdf.text(finDoc.clientEmail, margin, y); }
    if (finDoc.dueDate) { pdf.text(`Due Date: ${finDoc.dueDate}`, colR, y); }
    y += 14;
    if (finDoc.clientPhone) { pdf.text(finDoc.clientPhone, margin, y); }
    pdf.text(`Status: ${finDoc.status.toUpperCase()}`, colR, y);
    y += 28;

    // Line items header
    pdf.setFillColor(245, 244, 241);
    pdf.rect(margin, y, W - margin * 2, 22, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(80, 80, 80);
    pdf.text("DESCRIPTION", margin + 8, y + 14);
    pdf.text("QTY", W - margin - 200, y + 14, { align: "right" });
    pdf.text("UNIT PRICE", W - margin - 130, y + 14, { align: "right" });
    pdf.text("DISC %", W - margin - 65, y + 14, { align: "right" });
    pdf.text("TOTAL", W - margin - 8, y + 14, { align: "right" });
    y += 22;

    // Items
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(17, 17, 17);
    finDoc.items.forEach((item, idx) => {
      const rowBg = idx % 2 === 0;
      if (rowBg) {
        pdf.setFillColor(252, 251, 249);
        pdf.rect(margin, y, W - margin * 2, 20, "F");
      }
      const desc = item.description.length > 55 ? item.description.slice(0, 52) + "…" : item.description;
      pdf.text(desc, margin + 8, y + 13);
      pdf.text(String(item.qty), W - margin - 200, y + 13, { align: "right" });
      pdf.text(centsToDisplay(item.unitPriceCents), W - margin - 130, y + 13, { align: "right" });
      pdf.text(item.discountPct > 0 ? `${item.discountPct}%` : "—", W - margin - 65, y + 13, { align: "right" });
      pdf.text(centsToDisplay(item.lineTotalCents), W - margin - 8, y + 13, { align: "right" });
      y += 20;
    });
    y += 14;

    // Totals block
    const totW = 230;
    const totX = W - margin - totW;
    const row = (label: string, value: string, bold = false) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(80, 80, 80);
      pdf.text(label, totX, y);
      pdf.setTextColor(17, 17, 17);
      pdf.text(value, W - margin - 8, y, { align: "right" });
      y += 15;
    };
    row("Subtotal", centsToDisplay(finDoc.subtotalCents));
    if (finDoc.taxRatePercent > 0) {
      row(`Tax (${finDoc.taxRatePercent}%)`, centsToDisplay(finDoc.taxCents));
    }
    pdf.setDrawColor(200, 200, 200);
    pdf.line(totX, y, W - margin, y);
    y += 7;
    row("TOTAL (USD)", centsToDisplay(finDoc.totalCents), true);
    row("Est. JMD", centsToJmd(finDoc.totalCents));
    if (finDoc.amountPaidCents > 0) {
      row("Amount Paid", centsToDisplay(finDoc.amountPaidCents));
      row("Balance Due (USD)", centsToDisplay(finDoc.balanceDueCents), true);
    }
    y += 18;

    // Banking Details Note
    const noteContent = finDoc.notes?.trim() || p.bankingDetails;
    if (noteContent) {
      pdf.setFillColor(249, 248, 246);
      pdf.setDrawColor(220, 216, 208);
      const splitNotes = pdf.splitTextToSize(noteContent, W - margin * 2 - 20);
      const boxH = Math.min(220, splitNotes.length * 11 + 24);
      if (y + boxH > 730) { pdf.addPage(); y = 44; }
      pdf.roundedRect(margin, y, W - margin * 2, boxH, 4, 4, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(40, 40, 40);
      pdf.text("PAYMENT INSTRUCTIONS & BANKING DETAILS", margin + 12, y + 16);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(60, 60, 60);
      pdf.text(splitNotes, margin + 12, y + 30);
      y += boxH + 16;
    }

    // Footer
    pdf.setFillColor(245, 244, 241);
    pdf.rect(0, 752, W, 40, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Thank you for choosing ${p.businessName} — We appreciate your business!`, W / 2, 770, { align: "center" });
    pdf.text(`${p.website} · ${p.email} · WhatsApp: ${p.whatsapp}`, W / 2, 782, { align: "center" });

    pdf.save(`${finDoc.number}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-8 h-8 border-2 border-[var(--dept)] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-meta text-xs text-[var(--muted)]">Loading document...</p>
      </div>
    );
  }

  if (!finDoc) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <span className="text-4xl mb-4">📄</span>
        <h1 className="font-display font-bold text-xl uppercase tracking-tight text-[var(--ink)]">Document Not Found</h1>
        <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">
          The requested invoice or quote link is invalid or may have been removed. Please contact Socialkon10 if you believe this is an error.
        </p>
        <Link to="/" className="btn btn-dept text-xs px-5 py-2.5 mt-6">
          Return to Socialkon10 Home
        </Link>
      </div>
    );
  }

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
  };

  const bankNote = finDoc.notes?.trim() || p.bankingDetails;
  const waReceiptText = encodeURIComponent(`Hi, here is the payment confirmation receipt for ${finDoc.number} (${centsToDisplay(finDoc.totalCents)}).`);
  const waUrl = `https://wa.me/18762554848?text=${waReceiptText}`;

  return (
    <div className="min-h-screen bg-[#f4f2ee] py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Floating Actions Bar */}
        <div className="bg-white border border-neutral-200 rounded-sm p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-neutral-900">{p.businessName}</span>
            <span className="text-neutral-400">·</span>
            <span className="text-xs font-mono text-neutral-600 font-semibold">{finDoc.number}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadPdf}
              className="text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
            >
              <span>📥</span> Download PDF
            </button>
            <button
              onClick={() => window.print()}
              className="text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-800 px-3 py-1.5 rounded transition-colors"
            >
              🖨 Print
            </button>
          </div>
        </div>

        {/* Status Notification Banner */}
        {finDoc.status === "paid" ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-sm p-4 flex items-center gap-3 text-emerald-900 text-xs">
            <span className="text-lg">✓</span>
            <div>
              <strong className="font-bold">PAID IN FULL: </strong>
              Thank you! Payment of {centsToDisplay(finDoc.amountPaidCents || finDoc.totalCents)} was confirmed on {finDoc.paidDate || finDoc.updatedAt.slice(0, 10)}.
            </div>
          </div>
        ) : finDoc.status === "overdue" ? (
          <div className="bg-red-50 border border-red-200 rounded-sm p-4 flex items-center gap-3 text-red-900 text-xs">
            <span className="text-lg">⚠️</span>
            <div>
              <strong className="font-bold">PAYMENT PAST DUE: </strong>
              This invoice was due on {finDoc.dueDate || "delivery"}. Please complete your transfer using the CIBC Caribbean details below.
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-sm p-4 flex items-center justify-between gap-3 text-amber-900 text-xs">
            <div className="flex items-center gap-2.5">
              <span>💳</span>
              <span>Payment is due{finDoc.dueDate ? ` by ${finDoc.dueDate}` : ""}. Balance due: <strong>{centsToDisplay(finDoc.balanceDueCents || finDoc.totalCents)}</strong></span>
            </div>
            <button
              onClick={copyBankDetails}
              className="text-[11px] font-bold bg-white text-amber-950 border border-amber-300 px-2.5 py-1 rounded hover:bg-amber-100 transition-colors shrink-0 print:hidden"
            >
              {copied ? "✓ Copied!" : "📋 Copy Bank Info"}
            </button>
          </div>
        )}

        {/* Main Printable White Sheet */}
        <div className="bg-white text-neutral-900 shadow-xl rounded-sm border border-neutral-200 p-8 sm:p-12 space-y-8 font-sans">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-neutral-200 pb-8">
            <div>
              {p.logoUrl && (
                <img
                  src={p.logoUrl}
                  alt={p.businessName}
                  className="h-12 w-auto max-w-[200px] object-contain mb-3"
                  onError={(e) => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                />
              )}
              <h1 className="text-xl font-bold tracking-tight text-neutral-950 uppercase">{p.businessName}</h1>
              <p className="text-xs text-neutral-500 mt-1">{p.location}</p>
              <p className="text-xs text-neutral-500">{p.email} · {p.phone}</p>
              <p className="text-xs text-neutral-400 mt-0.5">{p.website.replace(/^https?:\/\//, "")}</p>
            </div>

            <div className="sm:text-right">
              <span className={`inline-block text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-2 ${
                finDoc.status === "paid" ? "bg-green-100 text-green-700" :
                finDoc.status === "overdue" ? "bg-red-100 text-red-700" :
                "bg-blue-100 text-blue-700"
              }`}>
                {finDoc.status.toUpperCase()}
              </span>
              <h2 className="text-2xl font-black tracking-tight text-neutral-950 uppercase">
                {finDoc.type.toUpperCase()}
              </h2>
              <p className="font-mono text-sm text-neutral-600 font-semibold mt-1">#{finDoc.number}</p>
              <div className="mt-3 text-xs text-neutral-500 space-y-1">
                <p>Issue Date: <strong className="text-neutral-800">{finDoc.issueDate}</strong></p>
                {finDoc.dueDate && <p>Due Date: <strong className="text-neutral-800">{finDoc.dueDate}</strong></p>}
                {finDoc.paidDate && <p>Paid Date: <strong className="text-green-700">{finDoc.paidDate}</strong></p>}
              </div>
            </div>
          </div>

          {/* Billed To */}
          <div className="bg-neutral-50 p-5 rounded-sm border border-neutral-200/70">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">Billed To</p>
            <p className="text-base font-bold text-neutral-950">{finDoc.clientName || "Valued Client"}</p>
            {finDoc.clientEmail && <p className="text-xs text-neutral-600 mt-0.5">{finDoc.clientEmail}</p>}
            {finDoc.clientPhone && <p className="text-xs text-neutral-600">{finDoc.clientPhone}</p>}
            {(finDoc.clientAddress || finDoc.clientCity) && (
              <p className="text-xs text-neutral-500 mt-1">
                {[finDoc.clientAddress, finDoc.clientCity].filter(Boolean).join(", ")}
              </p>
            )}
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-neutral-950 text-[10px] font-bold uppercase text-neutral-500">
                  <th className="py-2.5 px-2">Description</th>
                  <th className="py-2.5 px-2 text-right">Qty</th>
                  <th className="py-2.5 px-2 text-right">Unit Price</th>
                  <th className="py-2.5 px-2 text-right">Disc %</th>
                  <th className="py-2.5 px-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {finDoc.items.map((it) => (
                  <tr key={it.id} className="hover:bg-neutral-50/60">
                    <td className="py-3 px-2 font-medium text-neutral-900">{it.description}</td>
                    <td className="py-3 px-2 text-right text-neutral-600">{it.qty}</td>
                    <td className="py-3 px-2 text-right font-mono text-neutral-600">{centsToDisplay(it.unitPriceCents)}</td>
                    <td className="py-3 px-2 text-right text-neutral-500">{it.discountPct > 0 ? `${it.discountPct}%` : "—"}</td>
                    <td className="py-3 px-2 text-right font-mono font-semibold text-neutral-950">{centsToDisplay(it.lineTotalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Breakdown (with JMD estimate) */}
          <div className="flex justify-end pt-4 border-t border-neutral-200">
            <div className="w-72 space-y-2 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span className="font-mono">{centsToDisplay(finDoc.subtotalCents)}</span>
              </div>
              {finDoc.taxRatePercent > 0 && (
                <div className="flex justify-between text-neutral-600">
                  <span>Tax ({finDoc.taxRatePercent}%)</span>
                  <span className="font-mono">{centsToDisplay(finDoc.taxCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-neutral-950 pt-2 border-t border-neutral-200">
                <span>Total (USD)</span>
                <span className="font-mono">{centsToDisplay(finDoc.totalCents)}</span>
              </div>
              {/* Dual Currency JMD Estimate */}
              <div className="flex justify-between text-[11px] text-neutral-500 pt-0.5">
                <span>Est. Jamaican Dollars (JMD)</span>
                <span className="font-mono font-medium text-neutral-700">{centsToJmd(finDoc.totalCents)}</span>
              </div>
              <p className="text-[9px] text-neutral-400 text-right italic">
                *Prices quoted in USD. JMD converted at est. 1 USD = 158.50 JMD for local CIBC transfer.
              </p>

              {finDoc.amountPaidCents > 0 && (
                <div className="flex justify-between text-xs text-neutral-600 pt-1">
                  <span>Amount Paid</span>
                  <span className="font-mono text-green-700 font-semibold">{centsToDisplay(finDoc.amountPaidCents)}</span>
                </div>
              )}
              {finDoc.balanceDueCents > 0 && (
                <div className="flex justify-between text-sm font-bold text-red-600 pt-2 border-t border-dashed border-neutral-300">
                  <span>Balance Due (USD)</span>
                  <span className="font-mono">{centsToDisplay(finDoc.balanceDueCents)}</span>
                </div>
              )}
            </div>
          </div>

          {/* CIBC Caribbean Bank Transfer Card */}
          <div className="bg-amber-50/50 border border-amber-200/80 rounded-sm p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <span>🏦</span> CIBC Caribbean Bank Transfer Instructions
              </span>
              <div className="flex items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={copyBankDetails}
                  className="text-[11px] font-semibold bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 px-2.5 py-1 rounded transition-colors shadow-xs"
                >
                  {copied ? "✓ Copied!" : "📋 Copy Bank Info"}
                </button>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded transition-colors flex items-center gap-1 shadow-xs"
                >
                  <span>💬</span> WhatsApp Receipt
                </a>
              </div>
            </div>

            <pre className="text-xs text-neutral-800 font-sans whitespace-pre-wrap leading-relaxed">
              {bankNote}
            </pre>
          </div>

          {/* Terms */}
          {finDoc.terms && (
            <div className="text-[11px] text-neutral-500 border-t border-neutral-200 pt-4">
              <strong className="text-neutral-700">Terms & Conditions: </strong>
              {finDoc.terms}
            </div>
          )}

          {/* Footer */}
          <div className="text-center pt-8 border-t border-neutral-100 text-[11px] text-neutral-400">
            <p>Thank you for choosing {p.businessName} — we appreciate your business!</p>
            <p className="mt-0.5">{p.website} · {p.email} · {p.phone}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
