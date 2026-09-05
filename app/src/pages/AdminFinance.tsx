import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy,
} from "firebase/firestore";
import { db, firebaseReady } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import {
  getNextDocNumber, logFinanceAudit,
  listManaged, addManaged, updateManaged, removeManaged,
  getSettings, saveSettings, type SiteSettings,
  listAllOrders, listLeads,
} from "../lib/backend";
import { sendEmail } from "../lib/email";
import { CONTACT, SERVICES } from "../lib/data";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

/* ──────────────────────────────────────────────────────────────────────────────
   TYPES
────────────────────────────────────────────────────────────────────────────── */

export type FinDocType = "quote" | "invoice" | "receipt" | "credit_note";
export type FinDocStatus = "draft" | "sent" | "accepted" | "paid" | "overdue" | "void";

export interface FinLineItem {
  id: string;
  description: string;
  serviceId?: string;
  qty: number;
  unitPriceCents: number;
  discountPct: number;
  lineTotalCents: number;
}

export interface FinDocument {
  id: string;
  number: string;
  type: FinDocType;
  status: FinDocStatus;
  clientId?: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientAddress?: string;
  clientCity?: string;
  issueDate: string;
  dueDate?: string;
  paidDate?: string;
  items: FinLineItem[];
  subtotalCents: number;
  discountCents: number;
  taxRatePercent: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  notes?: string;
  terms?: string;
  internalNotes?: string;
  currency: string;
  convertedFromId?: string;
  relatedOrderId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  voidedAt?: string;
  voidReason?: string;
}

export interface FinPayment {
  id: string;
  documentId: string;
  documentNumber: string;
  amountCents: number;
  method: "cash" | "check" | "bank_transfer" | "card" | "zelle" | "paypal" | "other";
  reference?: string;
  paidDate: string;
  notes?: string;
  recordedBy: string;
  recordedAt: string;
}

export interface FinClient {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  notes?: string;
  source?: string;
  docCount?: number;
  orderCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinTaxRate {
  id: string;
  name: string;
  percent: number;
  isDefault: boolean;
  active: boolean;
}

export interface FinanceProfile {
  businessName: string;
  email: string;
  phone: string;
  whatsapp: string;
  location: string;
  website: string;
  logoUrl: string;
  bankingDetails: string;
  defaultTerms: string;
  jmdExchangeRate: number;
}

/* ──────────────────────────────────────────────────────────────────────────────
   DEFAULT BANKING DETAILS & TEMPLATES
────────────────────────────────────────────────────────────────────────────── */

export const DEFAULT_BANKING_NOTE = `Note
Thank you for choosing Socialkon10 Jamaica, 
we appreciate your business

Here are my CIBC Caribbean account details for the purpose of online transfer.
Account Holder: DAAN SUTHERLAND
Bank Name: FCIB
Branch: NEW KINGSTON
23-27 Knutsford Blvd, Kingston
Branch Transit: 09676
Account Type: Savings
Account Number: 1002141453
Swift Code: FCIBJMKN
(NB) All prices are quoted in USD
When transfer is complete, please send a copy of the confirmation receipt to my whatsapp 1(876)255-4848`;

export function getFinanceProfile(s: SiteSettings): FinanceProfile {
  return {
    businessName: s.financeSettings?.businessName?.trim() || "Socialkon10 Jamaica",
    email: s.financeSettings?.businessEmail?.trim() || s.email?.trim() || CONTACT.email || "socialkon10@gmail.com",
    phone: s.financeSettings?.businessPhone?.trim() || s.phone?.trim() || CONTACT.phone || "1 (876) 255-4848",
    whatsapp: CONTACT.whatsapp || "1 (876) 255-4848",
    location: s.financeSettings?.businessAddress?.trim() || s.location?.trim() || "23-27 Knutsford Blvd, Kingston, Jamaica",
    website: s.financeSettings?.websiteUrl?.trim() || "https://socialkon10.com",
    logoUrl: s.financeSettings?.logoUrl?.trim() || "/assets/sk-logo-full.png",
    bankingDetails: s.financeSettings?.bankingDetails?.trim() || DEFAULT_BANKING_NOTE,
    defaultTerms: s.financeSettings?.defaultTerms?.trim() || "Payment due within 14 days of invoice date. All prices are in USD.",
    jmdExchangeRate: s.financeSettings?.jmdExchangeRate || 158.50,
  };
}

/* ──────────────────────────────────────────────────────────────────────────────
   CONSTANTS & HELPERS
────────────────────────────────────────────────────────────────────────────── */

const DOC_TYPE_LABELS: Record<FinDocType, string> = {
  quote: "Quote",
  invoice: "Invoice",
  receipt: "Receipt",
  credit_note: "Credit Note",
};

const DOC_TYPE_PREFIX: Record<FinDocType, "QT" | "INV" | "RCT" | "CN"> = {
  quote: "QT",
  invoice: "INV",
  receipt: "RCT",
  credit_note: "CN",
};

const STATUS_COLORS: Record<FinDocStatus, string> = {
  draft:    "bg-[var(--line)] text-[var(--muted)]",
  sent:     "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  paid:     "bg-green-100 text-green-700",
  overdue:  "bg-red-100 text-red-700",
  void:     "bg-gray-100 text-gray-400 line-through",
};

const STATUS_LABELS: Record<FinDocStatus, string> = {
  draft: "Draft", sent: "Sent", accepted: "Accepted",
  paid: "Paid", overdue: "Overdue", void: "Void",
};

const PAYMENT_METHODS = ["cash", "check", "bank_transfer", "card", "zelle", "paypal", "other"] as const;

/** Format cents → "$1,234.56" */
function centsToDisplay(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function centsToJmd(cents: number, rate = 158.50): string {
  const usd = cents / 100;
  const jmd = usd * rate;
  return new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD" }).format(jmd);
}

/** Parse a dollar string → cents (integer). Returns 0 on bad input. */
function parseDollarsToCents(str: string): number {
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function calcLineItem(item: Omit<FinLineItem, "lineTotalCents">): number {
  const gross = item.qty * item.unitPriceCents;
  const disc = Math.round(gross * (item.discountPct / 100));
  return gross - disc;
}

function calcTotals(items: FinLineItem[], taxRatePercent: number) {
  const subtotalCents = items.reduce((s, i) => s + i.lineTotalCents, 0);
  const taxCents = Math.round(subtotalCents * (taxRatePercent / 100));
  const totalCents = subtotalCents + taxCents;
  return { subtotalCents, discountCents: 0, taxCents, totalCents };
}

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* ──────────────────────────────────────────────────────────────────────────────
   SHARED STYLE CONSTANTS (matches Admin.tsx design system)
────────────────────────────────────────────────────────────────────────────── */

const inputCls = "w-full bg-transparent border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--dept)] transition-colors";
const labelCls = "font-meta text-[9px] text-[var(--muted)] block font-semibold mb-1 uppercase tracking-wider";
const panelCls = "border border-[var(--line)] p-5";
const btnDept  = "btn btn-dept text-xs px-4 py-2";
const btnGhost = "btn btn-ghost text-xs px-4 py-2";

/* ──────────────────────────────────────────────────────────────────────────────
   FIRESTORE HELPERS & SANITIZATION (Prevents undefined field errors)
────────────────────────────────────────────────────────────────────────────── */

/**
 * Recursively strips undefined keys and normalizes values so Firestore never
 * throws "Unsupported field value: undefined"
 */
function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) return null as unknown as T;
  if (data === null || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean as T;
}

async function loadDocs(): Promise<FinDocument[]> {
  if (!firebaseReady || !db) return [];
  try {
    const snap = await getDocs(query(collection(db, "financeDocuments"), orderBy("createdAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FinDocument));
  } catch { return []; }
}

async function saveDoc(finDoc: Omit<FinDocument, "id">): Promise<string> {
  if (!firebaseReady || !db) return `local-${Date.now()}`;
  const clean = sanitizeForFirestore(finDoc);
  const ref = await addDoc(collection(db, "financeDocuments"), clean);
  return ref.id;
}

async function patchDoc(id: string, data: Partial<FinDocument>): Promise<void> {
  if (!firebaseReady || !db) return;
  const clean = sanitizeForFirestore({ ...data, updatedAt: new Date().toISOString() });
  await updateDoc(doc(db, "financeDocuments", id), clean);
}

async function savePayment(payment: Omit<FinPayment, "id">): Promise<string> {
  if (!firebaseReady || !db) return `local-${Date.now()}`;
  const ref = await addDoc(collection(db, "financePayments"), payment);
  return ref.id;
}

async function loadClients(): Promise<FinClient[]> {
  const clientMap = new Map<string, FinClient>();

  const getOrInitKey = (name?: string, email?: string): string | null => {
    const cleanEmail = email?.trim().toLowerCase();
    if (cleanEmail) return `email:${cleanEmail}`;
    const cleanName = name?.trim().toLowerCase();
    if (cleanName) return `name:${cleanName}`;
    return null;
  };

  // 1. Fetch explicitly saved clients from financeClients
  if (firebaseReady && db) {
    try {
      const snap = await getDocs(query(collection(db, "financeClients"), orderBy("name")));
      snap.docs.forEach((d) => {
        const data = d.data();
        const key = getOrInitKey(data.name, data.email);
        if (key) {
          clientMap.set(key, {
            id: d.id,
            name: (data.name || "").trim() || "Valued Client",
            email: (data.email || "").trim(),
            phone: data.phone || "",
            company: data.company || "",
            address: data.address || "",
            city: data.city || "",
            state: data.state || "",
            zip: data.zip || "",
            country: data.country || "Jamaica",
            notes: data.notes || "",
            source: "Saved Client",
            docCount: 0,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
          });
        }
      });
    } catch (err) {
      console.warn("loadClients: financeClients fetch failed:", err);
    }
  }

  // 2. Aggregate from past financeDocuments (invoices, quotes, receipts)
  try {
    const docs = await loadDocs();
    docs.forEach((d) => {
      if (!d.clientName && !d.clientEmail) return;
      const key = getOrInitKey(d.clientName, d.clientEmail);
      if (!key) return;
      const existing = clientMap.get(key);
      if (existing) {
        existing.docCount = (existing.docCount || 0) + 1;
        if (!existing.phone && d.clientPhone) existing.phone = d.clientPhone;
        if (!existing.address && d.clientAddress) existing.address = d.clientAddress;
        if (!existing.city && d.clientCity) existing.city = d.clientCity;
        if (!existing.source || existing.source.startsWith("Past Invoice")) {
          existing.source = `Past Invoices (${existing.docCount})`;
        }
      } else {
        clientMap.set(key, {
          id: `doc-client-${d.id}`,
          name: (d.clientName || "").trim() || "Valued Client",
          email: (d.clientEmail || "").trim(),
          phone: d.clientPhone || "",
          address: d.clientAddress || "",
          city: d.clientCity || "",
          country: "Jamaica",
          source: "Past Invoices",
          docCount: 1,
          createdAt: d.issueDate || new Date().toISOString(),
          updatedAt: d.issueDate || new Date().toISOString(),
        });
      }
    });
  } catch (err) {
    console.warn("loadClients: financeDocuments aggregate failed:", err);
  }

  // 3. Aggregate from past studio/web orders (listAllOrders)
  try {
    const orders = await listAllOrders();
    orders.forEach((o) => {
      if (!o.name && !o.email) return;
      const key = getOrInitKey(o.name, o.email);
      if (!key) return;
      const existing = clientMap.get(key);
      if (existing) {
        existing.orderCount = (existing.orderCount || 0) + 1;
        if (!existing.company && o.company) existing.company = o.company;
      } else {
        clientMap.set(key, {
          id: `order-client-${o.id}`,
          name: (o.name || "").trim() || "Studio Client",
          email: (o.email || "").trim(),
          company: o.company || "",
          country: "Jamaica",
          source: "Past Order",
          orderCount: 1,
          createdAt: o.createdAt || new Date().toISOString(),
          updatedAt: o.createdAt || new Date().toISOString(),
        });
      }
    });
  } catch (err) {
    console.warn("loadClients: orders aggregate failed:", err);
  }

  // 4. Aggregate from past leads / inquiries (listLeads)
  try {
    const leads = await listLeads();
    leads.forEach((l) => {
      if (!l.name && !l.email) return;
      const key = getOrInitKey(l.name, l.email);
      if (!key) return;
      const existing = clientMap.get(key);
      if (existing) {
        if (!existing.company && l.company) existing.company = l.company;
      } else {
        clientMap.set(key, {
          id: `lead-client-${l.id}`,
          name: (l.name || "").trim() || "Lead",
          email: (l.email || "").trim(),
          company: l.company || "",
          country: "Jamaica",
          source: "Past Inquiry",
          createdAt: l.createdAt || new Date().toISOString(),
          updatedAt: l.createdAt || new Date().toISOString(),
        });
      }
    });
  } catch (err) {
    console.warn("loadClients: leads aggregate failed:", err);
  }

  return Array.from(clientMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function loadTaxRates(): Promise<FinTaxRate[]> {
  if (!firebaseReady || !db) return [];
  try {
    const snap = await getDocs(collection(db, "financeTaxRates"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FinTaxRate));
  } catch { return []; }
}

/* ──────────────────────────────────────────────────────────────────────────────
   PDF GENERATION (Branded with Admin Business Info & Banking Notes)
────────────────────────────────────────────────────────────────────────────── */

function generatePDF(finDoc: FinDocument, profile?: FinanceProfile): void {
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
    jmdExchangeRate: 158.50,
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
  pdf.text(`${p.email}  ·  ${p.website.replace(/^https?:\/\//, "")}  ·  ${p.phone}`, W - margin, 32, { align: "right" });
  pdf.text(p.location, W - margin, 46, { align: "right" });
  y = 85;

  // Document type & number
  pdf.setTextColor(17, 17, 17);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(DOC_TYPE_LABELS[finDoc.type].toUpperCase(), margin, y);
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
  pdf.text(finDoc.clientName || "—", margin, y);
  pdf.text(`Issue Date: ${finDoc.issueDate}`, colR, y);
  y += 14;
  if (finDoc.clientEmail) { pdf.text(finDoc.clientEmail, margin, y); }
  if (finDoc.dueDate) { pdf.text(`Due Date: ${finDoc.dueDate}`, colR, y); }
  y += 14;
  if (finDoc.clientPhone) { pdf.text(finDoc.clientPhone, margin, y); }
  pdf.text(`Status: ${STATUS_LABELS[finDoc.status]}`, colR, y);
  y += 14;
  if (finDoc.clientAddress) { pdf.text(finDoc.clientAddress, margin, y); }
  if (finDoc.clientCity) {
    y += 13;
    pdf.text(finDoc.clientCity, margin, y);
  }
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

  // Line items rows
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(17, 17, 17);
  finDoc.items.forEach((item, idx) => {
    const rowBg = idx % 2 === 0;
    if (rowBg) {
      pdf.setFillColor(252, 251, 249);
      pdf.rect(margin, y, W - margin * 2, 20, "F");
    }
    const desc = item.description.length > 55
      ? item.description.slice(0, 52) + "…"
      : item.description;
    pdf.text(desc, margin + 8, y + 13);
    pdf.text(String(item.qty), W - margin - 200, y + 13, { align: "right" });
    pdf.text(centsToDisplay(item.unitPriceCents), W - margin - 130, y + 13, { align: "right" });
    pdf.text(item.discountPct > 0 ? `${item.discountPct}%` : "—", W - margin - 65, y + 13, { align: "right" });
    pdf.text(centsToDisplay(item.lineTotalCents), W - margin - 8, y + 13, { align: "right" });
    y += 20;
  });
  y += 14;

  // Totals block (right-aligned)
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
  row("Est. JMD", centsToJmd(finDoc.totalCents, p.jmdExchangeRate));
  if (finDoc.amountPaidCents > 0) {
    row("Amount Paid", centsToDisplay(finDoc.amountPaidCents));
    row("Balance Due (USD)", centsToDisplay(finDoc.balanceDueCents), true);
  }
  y += 18;

  // CIBC Caribbean Bank Transfer & Notes Block
  const noteContent = finDoc.notes?.trim() || p.bankingDetails;
  if (noteContent) {
    pdf.setFillColor(249, 248, 246);
    pdf.setDrawColor(220, 216, 208);
    const splitNotes = pdf.splitTextToSize(noteContent, W - margin * 2 - 20);
    const boxH = Math.min(220, splitNotes.length * 11 + 24);
    
    // Check if new page is needed
    if (y + boxH > 730) {
      pdf.addPage();
      y = 44;
    }
    
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

  // Terms
  if (finDoc.terms) {
    if (y + 40 > 730) { pdf.addPage(); y = 44; }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text("TERMS", margin, y);
    y += 12;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    const termLines = pdf.splitTextToSize(finDoc.terms, W - margin * 2);
    pdf.text(termLines, margin, y);
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
}

/* ──────────────────────────────────────────────────────────────────────────────
   EMAIL TEMPLATES (with WhatsApp confirmation link & banking instructions)
────────────────────────────────────────────────────────────────────────────── */

function buildFinanceEmail(finDoc: FinDocument, profile?: FinanceProfile): { subject: string; html: string } {
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
    jmdExchangeRate: 158.50,
  };

  const typeLabel = DOC_TYPE_LABELS[finDoc.type];
  const subject = finDoc.type === "quote"
    ? `Your quote is ready — ${finDoc.number}`
    : finDoc.type === "receipt"
    ? `Payment confirmed — ${finDoc.number}`
    : `Invoice ${finDoc.number} — ${centsToDisplay(finDoc.balanceDueCents)} due${finDoc.dueDate ? ` ${finDoc.dueDate}` : ""}`;

  const itemRows = finDoc.items.map((i) =>
    `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px">${i.description}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px;text-align:right">${centsToDisplay(i.lineTotalCents)}</td>
    </tr>`
  ).join("");

  const waReceiptText = encodeURIComponent(`Hi, here is the payment confirmation receipt for ${finDoc.number} (${centsToDisplay(finDoc.totalCents)}).`);
  const waUrl = `https://wa.me/18762554848?text=${waReceiptText}`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f2ee">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e3ded6">
        <tr><td style="background:#111111;padding:18px 28px">
          <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:3px;color:#ffffff">${p.businessName.toUpperCase()}</span>
        </td></tr>
        <tr><td style="padding:32px 28px;font-family:Arial,sans-serif;color:#222222">
          <h1 style="font-size:20px;margin:0 0 8px">${typeLabel} ${finDoc.number}</h1>
          <p style="margin:0 0 20px;font-size:14px;color:#555">Hi ${finDoc.clientName || "there"},</p>
          ${finDoc.type === "receipt"
            ? `<p style="font-size:14px;line-height:1.6">Payment of <strong>${centsToDisplay(finDoc.amountPaidCents)}</strong> has been received — thank you!</p>`
            : finDoc.type === "quote"
            ? `<p style="font-size:14px;line-height:1.6">Please review your quote below. Reply to accept or ask any questions.</p>`
            : `<p style="font-size:14px;line-height:1.6">Please find your invoice details below.${finDoc.dueDate ? ` Payment is due by <strong>${finDoc.dueDate}</strong>.` : ""}</p>`
          }
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0">
            ${itemRows}
            ${finDoc.taxRatePercent > 0 ? `<tr><td style="padding:6px 0;font-size:13px;color:#777">Tax (${finDoc.taxRatePercent}%)</td><td style="text-align:right;font-size:13px;color:#777">${centsToDisplay(finDoc.taxCents)}</td></tr>` : ""}
            <tr><td style="padding:10px 0;font-size:14px;font-weight:bold">Total</td><td style="text-align:right;font-size:14px;font-weight:bold">${centsToDisplay(finDoc.totalCents)}</td></tr>
            ${finDoc.amountPaidCents > 0 ? `<tr><td style="padding:4px 0;font-size:13px;color:#777">Amount Paid</td><td style="text-align:right;font-size:13px;color:#777">${centsToDisplay(finDoc.amountPaidCents)}</td></tr>` : ""}
            ${finDoc.balanceDueCents > 0 ? `<tr><td style="padding:4px 0;font-size:14px;font-weight:bold;color:#c0392b">Balance Due</td><td style="text-align:right;font-size:14px;font-weight:bold;color:#c0392b">${centsToDisplay(finDoc.balanceDueCents)}</td></tr>` : ""}
          </table>

          <!-- Banking & Transfer Instructions Card -->
          <div style="background:#f9f8f6;border:1px solid #e5e1d8;border-radius:6px;padding:16px;margin:24px 0;font-size:12.5px;line-height:1.6;color:#333">
            <strong style="color:#111;display:block;margin-bottom:8px">BANK TRANSFER INSTRUCTIONS</strong>
            <pre style="font-family:Arial,sans-serif;white-space:pre-wrap;margin:0;font-size:12px;color:#444">${finDoc.notes?.trim() || p.bankingDetails}</pre>
            <div style="margin-top:14px">
              <a href="${waUrl}" style="background:#25D366;color:#ffffff;text-decoration:none;font-size:12px;font-weight:bold;padding:9px 18px;display:inline-block;border-radius:4px">
                Send Receipt to WhatsApp 1(876)255-4848 →
              </a>
            </div>
          </div>

          ${finDoc.terms ? `<p style="font-size:12px;color:#777;margin-top:16px"><em>Terms: ${finDoc.terms}</em></p>` : ""}
          <p style="font-size:13px;color:#888;margin-top:20px">Reference: <strong>${finDoc.number}</strong></p>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #e3ded6;font-family:Arial,sans-serif;font-size:11px;color:#8a857c;line-height:1.6">
          ${p.businessName} · ${p.location} · Questions? Reply to this email or contact us at ${p.phone}.
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;

  return { subject, html };
}

/* ──────────────────────────────────────────────────────────────────────────────
   LIVE DOCUMENT PREVIEW COMPONENT (Client-Facing Visual Sheet)
────────────────────────────────────────────────────────────────────────────── */

interface DocumentPreviewProps {
  finDoc: FinDocument;
  profile: FinanceProfile;
  onClose?: () => void;
  onEdit?: () => void;
  onDownloadPdf?: () => void;
}

function DocumentPreview({ finDoc, profile, onClose, onEdit, onDownloadPdf }: DocumentPreviewProps) {
  const [copied, setCopied] = useState(false);

  // Keyboard shortcut: Press Escape to exit preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onClose) onClose();
        else if (onEdit) onEdit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onEdit]);

  const bankNote = finDoc.notes?.trim() || profile.bankingDetails;

  const copyBankDetails = () => {
    navigator.clipboard.writeText(bankNote);
    setCopied(true);
    toast.success("Bank details copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const waReceiptText = encodeURIComponent(`Hi, here is the payment confirmation receipt for ${finDoc.number} (${centsToDisplay(finDoc.totalCents)}).`);
  const waUrl = `https://wa.me/18762554848?text=${waReceiptText}`;

  return (
    <div className="bg-white text-neutral-900 shadow-2xl rounded-sm border border-neutral-200 max-w-3xl mx-auto overflow-hidden font-sans w-full">
      {/* Top Action Ribbon (Sticky on Screen, Responsive on Mobile, Hidden on Print) */}
      <div className="sticky top-0 z-40 bg-neutral-900 text-white px-3 sm:px-6 py-2.5 sm:py-3 border-b border-neutral-800 shadow-md flex flex-wrap items-center justify-between gap-2 text-xs print:hidden">
        {/* Prominent Exit Button (Always visible on mobile & desktop) */}
        <div className="flex items-center gap-2">
          {(onClose || onEdit) && (
            <button
              type="button"
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              onClick={onClose || onEdit}
              title="Exit preview (Esc)"
              aria-label="Exit preview"
            >
              <span>✕</span>
              <span>Exit Preview</span>
            </button>
          )}
          <span className="font-mono text-[11px] text-neutral-300 hidden md:inline">
            {DOC_TYPE_LABELS[finDoc.type]} #{finDoc.number}
          </span>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xs transition-colors flex items-center gap-1 cursor-pointer text-xs"
            onClick={() => {
              const url = `${window.location.origin}/invoice/${finDoc.number}`;
              navigator.clipboard.writeText(url);
              toast.success(`Client link copied: ${url}`);
            }}
            title="Copy client share link"
          >
            <span>🔗</span> <span className="hidden sm:inline">Client Link</span>
          </button>
          {onEdit && (
            <button
              type="button"
              className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xs transition-colors flex items-center gap-1 cursor-pointer text-xs"
              onClick={onEdit}
            >
              <span>✏️</span> <span className="hidden sm:inline">Edit</span>
            </button>
          )}
          <button
            type="button"
            className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xs transition-colors flex items-center gap-1 cursor-pointer text-xs"
            onClick={onDownloadPdf ?? (() => generatePDF(finDoc, profile))}
            title="Download PDF document"
          >
            <span>📥</span> <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            type="button"
            className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xs transition-colors hidden md:flex items-center gap-1 cursor-pointer text-xs"
            onClick={() => window.print()}
          >
            <span>🖨</span> Print
          </button>
        </div>
      </div>

      {/* Printable Sheet Body */}
      <div className="p-4 sm:p-8 md:p-12 space-y-6 sm:space-y-8">
        {/* Header: Logo + Business Info + Document Number */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 sm:gap-6 border-b border-neutral-200 pb-6 sm:pb-8">
          <div className="w-full sm:w-auto">
            {profile.logoUrl ? (
              <img
                src={profile.logoUrl}
                alt={profile.businessName}
                className="h-10 sm:h-12 w-auto max-w-[180px] sm:max-w-[200px] object-contain mb-3"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            ) : null}
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-950 uppercase break-words">{profile.businessName}</h1>
            <p className="text-xs text-neutral-500 mt-1 break-words">{profile.location}</p>
            <p className="text-xs text-neutral-500 break-words">{profile.email} · {profile.phone}</p>
            <p className="text-xs text-neutral-400 mt-0.5 break-words">{profile.website.replace(/^https?:\/\//, "")}</p>
          </div>

          <div className="w-full sm:w-auto sm:text-right pt-3 sm:pt-0 border-t sm:border-t-0 border-neutral-100">
            <span className={`inline-block text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-2 ${STATUS_COLORS[finDoc.status]}`}>
              {STATUS_LABELS[finDoc.status]}
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-neutral-950 uppercase">
              {DOC_TYPE_LABELS[finDoc.type]}
            </h2>
            <p className="font-mono text-sm text-neutral-600 font-semibold mt-1">#{finDoc.number}</p>
            <div className="mt-3 text-xs text-neutral-500 space-y-1">
              <p>Issue Date: <strong className="text-neutral-800">{finDoc.issueDate}</strong></p>
              {finDoc.dueDate && <p>Due Date: <strong className="text-neutral-800">{finDoc.dueDate}</strong></p>}
              {finDoc.paidDate && <p>Paid Date: <strong className="text-green-700">{finDoc.paidDate}</strong></p>}
            </div>
          </div>
        </div>

        {/* Bill To */}
        <div className="bg-neutral-50 p-4 sm:p-5 rounded-sm border border-neutral-200/70">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-2">Billed To</p>
          <p className="text-base font-bold text-neutral-950 break-words">{finDoc.clientName || "Valued Client"}</p>
          {finDoc.clientEmail && <p className="text-xs text-neutral-600 mt-0.5 break-words">{finDoc.clientEmail}</p>}
          {finDoc.clientPhone && <p className="text-xs text-neutral-600 break-words">{finDoc.clientPhone}</p>}
          {(finDoc.clientAddress || finDoc.clientCity) && (
            <p className="text-xs text-neutral-500 mt-1 break-words">
              {[finDoc.clientAddress, finDoc.clientCity].filter(Boolean).join(", ")}
            </p>
          )}
        </div>

        {/* Line Items Table with smooth touch scrolling */}
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-left border-collapse text-xs min-w-[460px]">
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

        {/* Totals Breakdown */}
        <div className="flex justify-end pt-4 border-t border-neutral-200">
          <div className="w-full sm:w-80 space-y-2 text-xs">
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
            <div className="flex justify-between text-[11px] text-neutral-500 pt-0.5">
              <span>Est. Jamaican Dollars (JMD)</span>
              <span className="font-mono font-medium text-neutral-700">{centsToJmd(finDoc.totalCents, profile.jmdExchangeRate)}</span>
            </div>
            <p className="text-[9px] text-neutral-400 text-right italic">
              *Prices in USD. Est. @ 1 USD = {profile.jmdExchangeRate} JMD for CIBC transfer.
            </p>
            {finDoc.amountPaidCents > 0 && (
              <div className="flex justify-between text-xs text-neutral-600">
                <span>Amount Paid</span>
                <span className="font-mono text-green-700">{centsToDisplay(finDoc.amountPaidCents)}</span>
              </div>
            )}
            {finDoc.balanceDueCents > 0 && (
              <div className="flex justify-between text-sm font-bold text-red-600 pt-1 border-t border-dashed border-neutral-300">
                <span>Balance Due (USD)</span>
                <span className="font-mono">{centsToDisplay(finDoc.balanceDueCents)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment Instructions & CIBC Caribbean Details Card */}
        <div className="bg-amber-50/50 border border-amber-200/80 rounded-sm p-4 sm:p-6 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <span>🏦</span> CIBC Caribbean Bank Transfer & Payment Details
            </span>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={copyBankDetails}
                className="text-[11px] font-semibold bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 px-2.5 py-1.5 rounded transition-colors shadow-xs cursor-pointer"
              >
                {copied ? "✓ Copied!" : "📋 Copy Bank Details"}
              </button>
              <a
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded transition-colors flex items-center gap-1 shadow-xs"
              >
                <span>💬</span> WhatsApp Receipt
              </a>
            </div>
          </div>

          <pre className="text-xs text-neutral-800 font-sans whitespace-pre-wrap break-words leading-relaxed">
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
          <p>Thank you for choosing {profile.businessName} — we appreciate your business!</p>
          <p className="mt-0.5">{profile.website} · {profile.email} · {profile.phone}</p>
        </div>
      </div>

      {/* Bottom Action Ribbon (Always reachable on mobile & desktop) */}
      <div className="bg-neutral-100 border-t border-neutral-200 p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-3 print:hidden">
        {(onClose || onEdit) && (
          <button
            type="button"
            className="w-full sm:w-auto px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            onClick={onClose || onEdit}
          >
            ← Back to Editor / Exit Preview
          </button>
        )}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            className="flex-1 sm:flex-initial px-3 py-2 bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 font-semibold text-xs rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            onClick={onDownloadPdf ?? (() => generatePDF(finDoc, profile))}
          >
            📥 Download PDF
          </button>
          <button
            type="button"
            className="flex-1 sm:flex-initial px-3 py-2 bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 font-semibold text-xs rounded transition-colors hidden sm:flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            onClick={() => window.print()}
          >
            🖨 Print
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   DOCUMENT PREVIEW MODAL
────────────────────────────────────────────────────────────────────────────── */

function DocumentPreviewModal({
  finDoc,
  profile,
  onClose,
  onEdit,
}: {
  finDoc: FinDocument;
  profile: FinanceProfile;
  onClose: () => void;
  onEdit: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-2 sm:p-4 md:p-6 flex items-start justify-center backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl my-2 sm:my-6">
        {/* Floating Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-1 sm:-top-4 sm:-right-4 z-50 w-9 h-9 rounded-full bg-neutral-900 text-white border-2 border-white flex items-center justify-center font-bold text-sm shadow-xl hover:bg-red-600 transition-colors cursor-pointer"
          title="Close preview (Esc)"
          aria-label="Close preview"
        >
          ✕
        </button>
        <DocumentPreview
          finDoc={finDoc}
          profile={profile}
          onClose={onClose}
          onEdit={onEdit}
          onDownloadPdf={() => generatePDF(finDoc, profile)}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   LINE ITEM ROW (with manual editing + quick dropdown)
────────────────────────────────────────────────────────────────────────────── */

interface LineItemRowProps {
  item: FinLineItem;
  onChange: (updated: FinLineItem) => void;
  onRemove: () => void;
}

function LineItemRow({ item, onChange, onRemove }: LineItemRowProps) {
  const update = (patch: Partial<FinLineItem>) => {
    const next = { ...item, ...patch };
    next.lineTotalCents = calcLineItem(next);
    onChange(next);
  };

  return (
    <div className="grid gap-2 items-end border-b border-[var(--line)] pb-3 mb-3" style={{ gridTemplateColumns: "1fr 56px 110px 72px 100px 32px" }}>
      {/* Description */}
      <div>
        <label className={labelCls}>Description</label>
        <input
          className={inputCls}
          value={item.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Service or item description"
        />
      </div>
      {/* Qty */}
      <div>
        <label className={labelCls}>Qty</label>
        <input
          type="number" min="1" step="1"
          className={inputCls}
          value={item.qty}
          onChange={(e) => update({ qty: Math.max(1, parseInt(e.target.value) || 1) })}
        />
      </div>
      {/* Unit Price */}
      <div>
        <label className={labelCls}>Unit Price ($)</label>
        <input
          className={inputCls}
          value={(item.unitPriceCents / 100).toFixed(2)}
          onChange={(e) => update({ unitPriceCents: parseDollarsToCents(e.target.value) })}
          placeholder="0.00"
        />
      </div>
      {/* Discount */}
      <div>
        <label className={labelCls}>Disc %</label>
        <input
          type="number" min="0" max="100" step="1"
          className={inputCls}
          value={item.discountPct}
          onChange={(e) => update({ discountPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
        />
      </div>
      {/* Line Total */}
      <div>
        <label className={labelCls}>Total</label>
        <div className="px-3 py-2 text-sm font-semibold text-right border border-[var(--line)] bg-[var(--panel)]">
          {centsToDisplay(item.lineTotalCents)}
        </div>
      </div>
      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="text-[var(--muted)] hover:text-red-500 text-lg leading-none self-end pb-2 transition-colors"
        aria-label="Remove line item"
      >×</button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   RECORD PAYMENT MODAL
────────────────────────────────────────────────────────────────────────────── */

interface PaymentModalProps {
  finDoc: FinDocument;
  actor: string;
  onClose: () => void;
  onSaved: (updated: FinDocument) => void;
}

function PaymentModal({ finDoc, actor, onClose, onSaved }: PaymentModalProps) {
  const [amountStr, setAmountStr] = useState((finDoc.balanceDueCents / 100).toFixed(2));
  const [method, setMethod] = useState<FinPayment["method"]>("bank_transfer");
  const [reference, setReference] = useState("");
  const [paidDate, setPaidDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const amountCents = parseDollarsToCents(amountStr);
    if (amountCents <= 0) { toast.error("Enter a valid payment amount."); return; }
    setBusy(true);
    try {
      const payment: Omit<FinPayment, "id"> = {
        documentId: finDoc.id,
        documentNumber: finDoc.number,
        amountCents,
        method,
        reference: reference.trim() || undefined,
        paidDate,
        notes: notes.trim() || undefined,
        recordedBy: actor,
        recordedAt: new Date().toISOString(),
      };
      await savePayment(payment);
      const newPaid = finDoc.amountPaidCents + amountCents;
      const newBalance = Math.max(0, finDoc.totalCents - newPaid);
      const newStatus: FinDocStatus = newBalance === 0 ? "paid" : "sent";
      const patch: Partial<FinDocument> = {
        amountPaidCents: newPaid,
        balanceDueCents: newBalance,
        status: newStatus,
        ...(newBalance === 0 ? { paidDate } : {}),
      };
      await patchDoc(finDoc.id, patch);
      await logFinanceAudit({
        documentId: finDoc.id,
        documentNumber: finDoc.number,
        action: "payment_recorded",
        actor,
        after: { amountCents, method, paidDate },
      });
      const updated = { ...finDoc, ...patch };
      toast.success(`Payment of ${centsToDisplay(amountCents)} recorded.`);
      onSaved(updated);
    } catch (err) {
      console.error(err);
      toast.error("Failed to record payment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="w-full max-w-md border border-[var(--line)] p-6" style={{ background: "var(--panel)" }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold uppercase tracking-tight text-sm">Record Payment</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)] text-lg">×</button>
        </div>
        <p className="font-meta text-[10px] text-[var(--muted)] mb-4">
          {finDoc.number} · Balance due: <strong>{centsToDisplay(finDoc.balanceDueCents)}</strong>
        </p>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Amount Received (USD)</label>
            <input className={inputCls} value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className={labelCls}>Payment Method</label>
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as FinPayment["method"])}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Reference / Check # / Transfer ID</label>
            <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className={labelCls}>Date Received</label>
            <input type="date" className={inputCls} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button className={btnDept} onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Record Payment"}
          </button>
          <button className={btnGhost} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   DOCUMENT EDITOR (with Live Preview & Catalog Dropdown)
────────────────────────────────────────────────────────────────────────────── */

interface ServiceOption {
  id: string;
  name: string;
  priceCents: number;
  category: string;
}

interface DocEditorProps {
  initial?: FinDocument | null;
  clients: FinClient[];
  taxRates: FinTaxRate[];
  services: ServiceOption[];
  profile: FinanceProfile;
  actor: string;
  onSaved: (doc: FinDocument) => void;
  onCancel: () => void;
}

function DocEditor({ initial, clients, taxRates, services, profile, actor, onSaved, onCancel }: DocEditorProps) {
  const defaultTax = taxRates.find((t) => t.isDefault && t.active)?.percent ?? 0;

  const [type, setType] = useState<FinDocType>(initial?.type ?? "invoice");
  const [status, setStatus] = useState<FinDocStatus>(initial?.status ?? "draft");
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [clientEmail, setClientEmail] = useState(initial?.clientEmail ?? "");
  const [clientPhone, setClientPhone] = useState(initial?.clientPhone ?? "");
  const [clientAddress, setClientAddress] = useState(initial?.clientAddress ?? "");
  const [clientCity, setClientCity] = useState(initial?.clientCity ?? "");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearchQuery, setClientSearchQuery] = useState<string>("");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? today());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? addDays(today(), 14));
  const [items, setItems] = useState<FinLineItem[]>(initial?.items ?? []);
  const [taxRatePct, setTaxRatePct] = useState(initial?.taxRatePercent ?? defaultTax);
  const [notes, setNotes] = useState(initial?.notes ?? profile.bankingDetails);
  const [terms, setTerms] = useState(initial?.terms ?? profile.defaultTerms);
  const [internalNotes, setInternalNotes] = useState(initial?.internalNotes ?? "");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Client autocomplete & search filter
  const matchedClient = useMemo(() =>
    clientEmail ? clients.find((c) => c.email.toLowerCase() === clientEmail.toLowerCase()) : null,
    [clientEmail, clients]
  );

  const filteredClients = useMemo(() => {
    if (!clientSearchQuery.trim()) return clients;
    const q = clientSearchQuery.toLowerCase().trim();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.company && c.company.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
    );
  }, [clients, clientSearchQuery]);

  const fillFromClient = (c: FinClient) => {
    setSelectedClientId(c.id);
    setClientName(c.name || "");
    setClientEmail(c.email || "");
    setClientPhone(c.phone ?? "");
    setClientAddress(c.address ?? "");
    const cityParts = [c.city, c.country && c.country !== "Jamaica" ? c.country : null].filter(Boolean);
    setClientCity(c.city ? cityParts.join(", ") : (c.country || "Kingston, Jamaica"));
    toast.success(`Loaded client "${c.name}" into Bill To.`);
  };

  const totals = useMemo(() => calcTotals(items, taxRatePct), [items, taxRatePct]);

  // Construct draft FinDocument for Live Preview
  const previewDoc: FinDocument = useMemo(() => ({
    id: initial?.id ?? "preview-draft",
    number: initial?.number ?? `${DOC_TYPE_PREFIX[type]}-${new Date().getFullYear()}-XXXX`,
    type,
    status,
    clientId: matchedClient?.id,
    clientName: clientName || "Valued Client",
    clientEmail,
    clientPhone,
    clientAddress,
    clientCity,
    issueDate,
    dueDate,
    items,
    ...totals,
    taxRatePercent: taxRatePct,
    amountPaidCents: initial?.amountPaidCents ?? 0,
    balanceDueCents: initial?.amountPaidCents ? Math.max(0, totals.totalCents - initial.amountPaidCents) : totals.totalCents,
    notes,
    terms,
    currency: "USD",
    createdBy: initial?.createdBy ?? actor,
    createdAt: initial?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }), [initial, type, status, matchedClient, clientName, clientEmail, clientPhone, clientAddress, clientCity, issueDate, dueDate, items, totals, taxRatePct, notes, terms, actor]);

  const addEmptyItem = () => {
    setItems((prev) => [...prev, {
      id: uid(), description: "", qty: 1, unitPriceCents: 0, discountPct: 0, lineTotalCents: 0,
    }]);
  };

  const addServiceItem = (svc: ServiceOption) => {
    setItems((prev) => {
      const item: FinLineItem = {
        id: uid(),
        description: svc.name,
        serviceId: svc.id,
        qty: 1,
        unitPriceCents: svc.priceCents,
        discountPct: 0,
        lineTotalCents: svc.priceCents,
      };
      return [...prev, item];
    });
  };

  const updateItem = (idx: number, updated: FinLineItem) => {
    setItems((prev) => prev.map((it, i) => i === idx ? updated : it));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCatalogSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;
    const found = services.find((s) => s.id === val);
    if (found) {
      addServiceItem(found);
      setSelectedServiceId("");
    }
  };

  const save = async (sendNow = false) => {
    if (!clientName.trim()) { toast.error("Client name is required."); return; }
    if (items.length === 0) { toast.error("Add at least one line item."); return; }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const number = initial?.number ?? await getNextDocNumber(DOC_TYPE_PREFIX[type]);
      const finalStatus: FinDocStatus = sendNow ? "sent" : status;
      const docData: Omit<FinDocument, "id"> = {
        number,
        type,
        status: finalStatus,
        clientId: matchedClient?.id || (null as any),
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        clientPhone: clientPhone.trim() || (null as any),
        clientAddress: clientAddress.trim() || (null as any),
        clientCity: clientCity.trim() || (null as any),
        issueDate,
        dueDate: dueDate || (null as any),
        items,
        ...totals,
        taxRatePercent: taxRatePct,
        amountPaidCents: initial?.amountPaidCents ?? 0,
        balanceDueCents: initial?.amountPaidCents ? Math.max(0, totals.totalCents - initial.amountPaidCents) : totals.totalCents,
        notes: notes.trim() || (null as any),
        terms: terms.trim() || (null as any),
        internalNotes: internalNotes.trim() || (null as any),
        currency: "USD",
        convertedFromId: initial?.convertedFromId || (null as any),
        relatedOrderId: initial?.relatedOrderId || (null as any),
        createdBy: initial?.createdBy ?? actor,
        createdAt: initial?.createdAt ?? now,
        updatedAt: now,
        ...(sendNow ? { sentAt: now } : {}),
      };

      let savedId: string;
      if (initial?.id) {
        await patchDoc(initial.id, docData);
        savedId = initial.id;
      } else {
        savedId = await saveDoc(docData);
      }

      await logFinanceAudit({
        documentId: savedId,
        documentNumber: number,
        action: initial ? "updated" : "created",
        actor,
        after: { type, status: finalStatus, totalCents: totals.totalCents },
      });

      // Optionally save new client
      if (!matchedClient && clientEmail && clientName && firebaseReady && db) {
        const existing = clients.find((c) => c.email.toLowerCase() === clientEmail.toLowerCase());
        if (!existing) {
          await addDoc(collection(db, "financeClients"), sanitizeForFirestore({
            name: clientName.trim(), email: clientEmail.trim(),
            phone: clientPhone.trim() || null,
            address: clientAddress.trim() || null,
            city: clientCity.trim() || null,
            createdAt: now, updatedAt: now,
          }));
        }
      }

      if (sendNow && clientEmail) {
        const { subject, html } = buildFinanceEmail({ ...docData, id: savedId }, profile);
        await sendEmail({ to: clientEmail, subject, html, type: "proposal_sent" });
        await logFinanceAudit({ documentId: savedId, documentNumber: number, action: "sent", actor });
        toast.success(`${DOC_TYPE_LABELS[type]} sent to ${clientEmail}`);
      } else {
        toast.success(`${DOC_TYPE_LABELS[type]} ${initial ? "updated" : "created"}.`);
      }

      onSaved({ ...docData, id: savedId });
    } catch (err) {
      console.error(err);
      toast.error("Failed to save document.");
    } finally {
      setBusy(false);
    }
  };

  // Group services by category for clean dropdown
  const groupedServices = useMemo(() => {
    const map = new Map<string, ServiceOption[]>();
    for (const s of services) {
      const cat = s.category || "General Services";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return Array.from(map.entries());
  }, [services]);

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnGhost} onClick={onCancel}>← Back</button>
        <h2 className="font-display font-bold uppercase tracking-tight text-sm flex-1">
          {initial ? `Edit ${DOC_TYPE_LABELS[initial.type]} ${initial.number}` : "New Document"}
        </h2>

        {/* View Mode Toggle */}
        <div className="flex border border-[var(--line)] p-0.5 rounded-sm bg-[var(--panel)]">
          <button
            type="button"
            className={`text-xs px-3 py-1 font-medium transition-colors ${!showPreview ? "bg-[var(--dept)] text-[var(--on-dept)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
            onClick={() => setShowPreview(false)}
          >
            ✏️ Edit Form
          </button>
          <button
            type="button"
            className={`text-xs px-3 py-1 font-medium transition-colors ${showPreview ? "bg-[var(--dept)] text-[var(--on-dept)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
            onClick={() => setShowPreview(true)}
          >
            👁 Live Preview
          </button>
        </div>

        <button className={btnGhost} onClick={() => save(false)} disabled={busy}>
          {busy ? "Saving…" : "Save Draft"}
        </button>
        <button className={btnDept} onClick={() => save(true)} disabled={busy}>
          {busy ? "…" : `Save & Send`}
        </button>
      </div>

      {/* When in Live Preview Mode */}
      {showPreview ? (
        <div className="space-y-4 py-2">
          {/* Quick Sticky Back Bar */}
          <div className="sticky top-2 z-30 flex items-center justify-between gap-2 p-3 bg-[var(--dept)] text-[var(--on-dept)] rounded-sm shadow-lg">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs">👁 Live Document Preview</span>
              <span className="text-[10px] opacity-80 font-mono">({previewDoc.number})</span>
            </div>
            <button
              type="button"
              className="px-3 py-1.5 bg-black/30 hover:bg-black/50 text-white font-bold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer"
              onClick={() => setShowPreview(false)}
            >
              ← Exit Preview & Edit Form
            </button>
          </div>

          <DocumentPreview
            finDoc={previewDoc}
            profile={profile}
            onClose={() => setShowPreview(false)}
            onEdit={() => setShowPreview(false)}
            onDownloadPdf={() => generatePDF(previewDoc, profile)}
          />

          {/* Bottom Back / Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 pb-6 border-t border-[var(--line)]">
            <button
              type="button"
              className="w-full sm:w-auto btn btn-dept px-6 py-2.5 text-xs font-bold inline-flex items-center justify-center gap-2 shadow-md cursor-pointer"
              onClick={() => setShowPreview(false)}
            >
              ← Back to Editor & Make Changes
            </button>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                className="w-full sm:w-auto btn btn-ghost px-4 py-2.5 text-xs font-semibold"
                onClick={() => save(false)}
                disabled={busy}
              >
                {busy ? "Saving…" : "Save Draft"}
              </button>
              <button
                type="button"
                className="w-full sm:w-auto btn btn-dept px-4 py-2.5 text-xs font-semibold"
                onClick={() => save(true)}
                disabled={busy}
              >
                {busy ? "…" : "Save & Send"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Edit Form */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — Type, Status, Dates, Tax */}
          <div className="lg:col-span-1 space-y-4">
            {/* Document type */}
            {!initial && (
              <div className={panelCls} style={{ background: "var(--panel)" }}>
                <label className={labelCls}>Document Type</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(["quote","invoice","receipt","credit_note"] as FinDocType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`text-xs px-3 py-1.5 border transition-colors ${type === t ? "border-[var(--dept)] bg-[var(--dept)] text-[var(--on-dept)] font-bold" : "border-[var(--line)] text-[var(--muted)]"}`}
                    >
                      {DOC_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Status */}
            <div className={panelCls} style={{ background: "var(--panel)" }}>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as FinDocStatus)}>
                {(["draft","sent","accepted","paid","overdue","void"] as FinDocStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div className={panelCls} style={{ background: "var(--panel)" }}>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Issue Date</label>
                  <input type="date" className={inputCls} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Due Date</label>
                  <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Tax rate */}
            <div className={panelCls} style={{ background: "var(--panel)" }}>
              <label className={labelCls}>Tax Rate %</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number" min="0" max="100" step="0.1"
                  className={`${inputCls} flex-1`}
                  value={taxRatePct}
                  onChange={(e) => setTaxRatePct(parseFloat(e.target.value) || 0)}
                />
                {taxRates.filter((t) => t.active).length > 0 && (
                  <select
                    className="border border-[var(--line)] px-2 py-2 text-xs bg-transparent"
                    onChange={(e) => setTaxRatePct(parseFloat(e.target.value))}
                    defaultValue=""
                  >
                    <option value="">Presets</option>
                    {taxRates.filter((t) => t.active).map((t) => (
                      <option key={t.id} value={t.percent}>{t.name} ({t.percent}%)</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Quick Live Preview Card Button */}
            <div className={`${panelCls} text-center`} style={{ background: "var(--panel)" }}>
              <p className="font-meta text-[10px] text-[var(--muted)] mb-3">Want to verify before sending?</p>
              <button
                type="button"
                className="btn btn-ghost w-full text-xs py-2"
                onClick={() => setShowPreview(true)}
              >
                👁 Preview Client Sheet
              </button>
            </div>
          </div>

          {/* Right column — Client, Line Items, Banking Notes */}
          <div className="lg:col-span-2 space-y-4">
            {/* Client info */}
            <div className={panelCls} style={{ background: "var(--panel)" }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-[var(--line)]">
                <div>
                  <span className={labelCls}>Bill To</span>
                  <p className="font-meta text-[9px] text-[var(--muted)]">Choose any past client or enter new recipient details.</p>
                </div>
                {clients.length > 0 && (
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[var(--dept-soft)] text-[var(--dept)] border border-[var(--dept)]/30 self-start sm:self-auto">
                    👥 {clients.length} Past Clients Found
                  </span>
                )}
              </div>

              {/* Past Client Quick-Picker Bar */}
              <div className="mb-4 p-3 rounded-sm border border-[var(--dept)]/40 bg-[var(--dept-soft)]/20 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-display text-[10px] font-bold uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
                    <span>👤</span> Choose from Past Clients:
                  </label>
                  {selectedClientId && (
                    <button
                      type="button"
                      className="text-[10px] font-bold uppercase text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedClientId("");
                        setClientName("");
                        setClientEmail("");
                        setClientPhone("");
                        setClientAddress("");
                        setClientCity("");
                        toast.info("Cleared Bill To details.");
                      }}
                    >
                      ✕ Clear / New Client
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-1">
                    <input
                      type="text"
                      className="w-full text-xs border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] px-2.5 py-2 placeholder-[var(--muted)] outline-none focus:border-[var(--dept)]"
                      placeholder="🔍 Filter past clients…"
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <select
                      className="w-full text-xs font-medium border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] px-3 py-2 cursor-pointer outline-none focus:border-[var(--dept)] focus:ring-1 focus:ring-[var(--dept)]"
                      value={selectedClientId}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          setSelectedClientId("");
                          return;
                        }
                        const c = clients.find((cl) => cl.id === val);
                        if (c) fillFromClient(c);
                      }}
                    >
                      <option value="">
                        {filteredClients.length === 0
                          ? "No matching past clients"
                          : `-- Select a past client (${filteredClients.length} available) --`}
                      </option>
                      {filteredClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.company ? `(${c.company})` : ""} {c.email ? `• ${c.email}` : ""} {c.source ? `[${c.source}]` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Full Name / Business</label>
                  <input className={inputCls} value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name" />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" className={inputCls} value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@email.com" />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input className={inputCls} value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <label className={labelCls}>Address</label>
                  <input className={inputCls} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Street address" />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>City, State, Country</label>
                  <input className={inputCls} value={clientCity} onChange={(e) => setClientCity(e.target.value)} placeholder="Kingston, Jamaica" />
                </div>
              </div>
            </div>

            {/* Line items + Services Catalog Dropdown */}
            <div className={panelCls} style={{ background: "var(--panel)" }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[var(--line)]">
                <div>
                  <span className={labelCls}>Line Items</span>
                  <p className="font-meta text-[9px] text-[var(--muted)]">Select from your service catalog or add custom rows manually.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Prominent Service Catalog Dropdown */}
                  <div className="relative">
                    <select
                      className="text-xs border border-[var(--dept)] bg-[var(--dept-soft)] text-[var(--ink)] font-semibold px-3 py-1.5 cursor-pointer outline-none focus:ring-1 focus:ring-[var(--dept)]"
                      value={selectedServiceId}
                      onChange={handleCatalogSelect}
                    >
                      <option value="">+ Add from Service Catalog ▾</option>
                      {groupedServices.map(([category, itemsList]) => (
                        <optgroup key={category} label={category} className="bg-[var(--panel)] text-[var(--ink)]">
                          {itemsList.map((svc) => (
                            <option key={svc.id} value={svc.id}>
                              {svc.name} — {centsToDisplay(svc.priceCents)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <button type="button" className={btnGhost} onClick={addEmptyItem}>
                    + Add Custom Item
                  </button>
                </div>
              </div>

              {items.length === 0 && (
                <div className="text-center py-6 border border-dashed border-[var(--line)] rounded-sm">
                  <p className="text-xs text-[var(--muted)] mb-2">No line items added yet.</p>
                  <p className="font-meta text-[9px] text-[var(--muted)]">Pick a service from the dropdown above or click "+ Add Custom Item".</p>
                </div>
              )}

              {items.map((item, idx) => (
                <LineItemRow
                  key={item.id}
                  item={item}
                  onChange={(updated) => updateItem(idx, updated)}
                  onRemove={() => removeItem(idx)}
                />
              ))}

              {/* Totals */}
              {items.length > 0 && (
                <div className="mt-4 ml-auto w-64 space-y-1 text-sm border-t border-[var(--line)] pt-4">
                  <div className="flex justify-between text-[var(--muted)]">
                    <span>Subtotal</span><span>{centsToDisplay(totals.subtotalCents)}</span>
                  </div>
                  {taxRatePct > 0 && (
                    <div className="flex justify-between text-[var(--muted)]">
                      <span>Tax ({taxRatePct}%)</span><span>{centsToDisplay(totals.taxCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-1 border-t border-[var(--line)]">
                    <span>Total (USD)</span><span>{centsToDisplay(totals.totalCents)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* CIBC Caribbean Bank Transfer & Notes (Pre-populated from Settings) */}
            <div className={panelCls} style={{ background: "var(--panel)" }}>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={labelCls}>
                      🏦 Payment Instructions & CIBC Caribbean Bank Details (Client Visible)
                    </label>
                    <button
                      type="button"
                      className="text-[9px] font-meta text-[var(--dept)] hover:underline"
                      onClick={() => setNotes(profile.bankingDetails)}
                    >
                      Reset to Default Bank Note
                    </button>
                  </div>
                  <textarea
                    className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
                    rows={8}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Bank details and transfer instructions..."
                  />
                  <span className="block font-meta text-[8px] text-[var(--muted)] mt-1">
                    This note is automatically included on the invoice preview, PDF, and client emails.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--line)]">
                  <div>
                    <label className={labelCls}>Terms & Conditions</label>
                    <textarea className={`${inputCls} resize-none`} rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Internal Notes (Admin Only)</label>
                    <textarea className={`${inputCls} resize-none`} rows={3} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Not visible to the client..." />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button className={btnDept} onClick={() => save(false)} disabled={busy}>
          {busy ? "Saving…" : "Save Draft"}
        </button>
        <button className={btnDept} onClick={() => save(true)} disabled={busy || !clientEmail}>
          Save & Send Email
        </button>
        <button
          className={btnGhost}
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? "✏️ Back to Editor" : "👁 Live Preview"}
        </button>
        {initial && (
          <button
            className={btnGhost}
            onClick={() => { generatePDF(initial, profile); }}
          >
            Download PDF
          </button>
        )}
        <button className={btnGhost} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   DOCUMENT LIST (with Preview Modal & Batch Operations)
────────────────────────────────────────────────────────────────────────────── */

type FilterType = "all" | FinDocType | "overdue" | "unpaid" | "paid" | "draft";

interface DocListProps {
  docs: FinDocument[];
  profile: FinanceProfile;
  onEdit: (d: FinDocument) => void;
  onNew: () => void;
  onRefresh: () => void;
  actor: string;
}

function DocList({ docs, profile, onEdit, onNew, onRefresh, actor }: DocListProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [payTarget, setPayTarget] = useState<FinDocument | null>(null);
  const [previewTarget, setPreviewTarget] = useState<FinDocument | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedNum, setCopiedNum] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastClickedIdx = useRef<number>(-1);

  // Keyboard shortcut: Press '/' to jump to search, 'Esc' to clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        setSearch("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const copyDocNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopiedNum(num);
    toast.success(`Copied #${num} to clipboard`);
    setTimeout(() => setCopiedNum(null), 2000);
  };

  const exportFilteredCSV = () => {
    if (filtered.length === 0) { toast.error("No documents to export."); return; }
    const headers = ["Number", "Type", "Status", "Client Name", "Client Email", "Client Phone", "Issue Date", "Due Date", "Total (USD)", "Balance Due (USD)"];
    const rows = filtered.map((d) => [
      d.number,
      DOC_TYPE_LABELS[d.type] || d.type,
      STATUS_LABELS[d.status] || d.status,
      `"${(d.clientName || "").replace(/"/g, '""')}"`,
      `"${(d.clientEmail || "").replace(/"/g, '""')}"`,
      `"${(d.clientPhone || "").replace(/"/g, '""')}"`,
      d.issueDate,
      d.dueDate || "",
      (d.totalCents / 100).toFixed(2),
      (d.balanceDueCents / 100).toFixed(2),
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `socialkon_finance_docs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filtered.length} documents to CSV.`);
  };

  const filtered = useMemo(() => {
    let list = docs;
    // Status / Type presets
    if (filter === "overdue") list = list.filter((d) => d.status === "overdue");
    else if (filter === "paid") list = list.filter((d) => d.status === "paid");
    else if (filter === "unpaid") list = list.filter((d) => d.status === "sent" || d.status === "overdue" || (d.type === "invoice" && d.balanceDueCents > 0));
    else if (filter === "draft") list = list.filter((d) => d.status === "draft");
    else if (filter !== "all") list = list.filter((d) => d.type === filter);

    // Multi-field deep search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((d) => {
        // 1. Document Number (e.g. "INV-2026-0001", "0001", "INV")
        if (d.number?.toLowerCase().includes(q)) return true;
        // 2. Client Details: Name, Email, Phone, Address, City
        if (d.clientName?.toLowerCase().includes(q)) return true;
        if (d.clientEmail?.toLowerCase().includes(q)) return true;
        if (d.clientPhone?.toLowerCase().includes(q)) return true;
        if (d.clientAddress?.toLowerCase().includes(q)) return true;
        if (d.clientCity?.toLowerCase().includes(q)) return true;
        // 3. Status or Document Type
        if (STATUS_LABELS[d.status]?.toLowerCase().includes(q)) return true;
        if (DOC_TYPE_LABELS[d.type]?.toLowerCase().includes(q)) return true;
        // 4. Line Items description
        if (d.items?.some((it) => it.description?.toLowerCase().includes(q))) return true;
        // 5. Notes / Terms
        if (d.notes?.toLowerCase().includes(q)) return true;
        if (d.terms?.toLowerCase().includes(q)) return true;
        // 6. Dollar Amounts
        const dollars = (d.totalCents / 100).toFixed(2);
        if (dollars.includes(q) || String(Math.round(d.totalCents / 100)).includes(q)) return true;

        return false;
      });
    }
    return list;
  }, [docs, filter, search]);

  const toggleSelect = (id: string, shiftKey: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const idx = filtered.findIndex((d) => d.id === id);
      if (shiftKey && lastClickedIdx.current >= 0) {
        const lo = Math.min(idx, lastClickedIdx.current);
        const hi = Math.max(idx, lastClickedIdx.current);
        filtered.slice(lo, hi + 1).forEach((d) => next.add(d.id));
      } else {
        if (next.has(id)) next.delete(id); else next.add(id);
      }
      lastClickedIdx.current = idx;
      return next;
    });
  };

  const voidDoc = async (d: FinDocument) => {
    if (!confirm(`Void ${d.number}? This cannot be undone.`)) return;
    await patchDoc(d.id, { status: "void", voidedAt: new Date().toISOString() });
    await logFinanceAudit({ documentId: d.id, documentNumber: d.number, action: "voided", actor });
    toast.success(`${d.number} voided.`);
    onRefresh();
  };

  const deleteDoc_ = async (d: FinDocument) => {
    if (!confirm(`Permanently delete ${d.number}?`)) return;
    if (firebaseReady && db) {
      await deleteDoc(doc(db, "financeDocuments", d.id));
    }
    await logFinanceAudit({ documentId: d.id, documentNumber: d.number, action: "deleted", actor });
    toast.success(`${d.number} deleted.`);
    onRefresh();
  };

  const sendDoc = async (d: FinDocument) => {
    if (!d.clientEmail) { toast.error("No client email set."); return; }
    const { subject, html } = buildFinanceEmail(d, profile);
    await sendEmail({ to: d.clientEmail, subject, html, type: "proposal_sent" });
    await patchDoc(d.id, { status: "sent", sentAt: new Date().toISOString() });
    await logFinanceAudit({ documentId: d.id, documentNumber: d.number, action: "sent", actor });
    toast.success(`Sent to ${d.clientEmail}`);
    onRefresh();
  };

  const convertToInvoice = async (d: FinDocument) => {
    const number = await getNextDocNumber("INV");
    const now = new Date().toISOString();
    const newDoc: Omit<FinDocument, "id"> = {
      ...d,
      type: "invoice",
      status: "draft",
      number,
      convertedFromId: d.id,
      createdAt: now,
      updatedAt: now,
      sentAt: undefined,
    };
    const id = await saveDoc(newDoc);
    await patchDoc(d.id, { status: "accepted" });
    await logFinanceAudit({ documentId: id, documentNumber: number, action: "converted_from_quote", actor, before: { quoteId: d.id } });
    toast.success(`Invoice ${number} created from quote ${d.number}.`);
    onRefresh();
  };

  const copyClientLink = (d: FinDocument) => {
    const url = `${window.location.origin}/invoice/${d.number}`;
    navigator.clipboard.writeText(url);
    toast.success(`Client link copied: ${url}`);
  };

  const splitDepositInvoices = async (d: FinDocument) => {
    if (!confirm(`Split ${d.number} (${centsToDisplay(d.totalCents)}) into 2 linked invoices:\n1. 50% Upfront Deposit (Due Now)\n2. 50% Final Balance (Upon Completion)?`)) return;
    try {
      const now = new Date().toISOString();
      const num1 = await getNextDocNumber("INV");
      const num2 = await getNextDocNumber("INV");

      const halfTotalCents = Math.round(d.totalCents / 2);
      const itemsSummary = d.items.map((i) => i.description).filter(Boolean).join(", ") || "Creative Services";

      const depositDoc: Omit<FinDocument, "id"> = {
        ...d,
        type: "invoice",
        status: "draft",
        number: num1,
        items: [{
          id: uid(),
          description: `50% Upfront Project Deposit: ${itemsSummary}`,
          qty: 1,
          unitPriceCents: halfTotalCents,
          discountPct: 0,
          lineTotalCents: halfTotalCents,
        }],
        subtotalCents: halfTotalCents,
        discountCents: 0,
        taxRatePercent: 0,
        taxCents: 0,
        totalCents: halfTotalCents,
        amountPaidCents: 0,
        balanceDueCents: halfTotalCents,
        issueDate: today(),
        dueDate: today(),
        terms: `50% upfront deposit required to commence project work. Linked with final balance invoice ${num2}.`,
        createdAt: now,
        updatedAt: now,
      };

      const balanceDoc: Omit<FinDocument, "id"> = {
        ...d,
        type: "invoice",
        status: "draft",
        number: num2,
        items: [{
          id: uid(),
          description: `50% Final Project Balance: ${itemsSummary}`,
          qty: 1,
          unitPriceCents: d.totalCents - halfTotalCents,
          discountPct: 0,
          lineTotalCents: d.totalCents - halfTotalCents,
        }],
        subtotalCents: d.totalCents - halfTotalCents,
        discountCents: 0,
        taxRatePercent: 0,
        taxCents: 0,
        totalCents: d.totalCents - halfTotalCents,
        amountPaidCents: 0,
        balanceDueCents: d.totalCents - halfTotalCents,
        issueDate: today(),
        dueDate: addDays(today(), 30),
        terms: `50% final balance payable upon completion and delivery of all finalized design files. Linked with deposit invoice ${num1}.`,
        createdAt: now,
        updatedAt: now,
      };

      await saveDoc(depositDoc);
      await saveDoc(balanceDoc);
      if (d.type === "quote") {
        await patchDoc(d.id, { status: "accepted" });
      }

      await logFinanceAudit({
        documentId: d.id,
        documentNumber: d.number,
        action: "split_50_50",
        actor,
        after: { depositInvoice: num1, balanceInvoice: num2 },
      });

      toast.success(`Generated Deposit ${num1} ($${(halfTotalCents / 100).toFixed(2)}) and Balance ${num2}!`);
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to split invoice.");
    }
  };

  const sendReminder = async (d: FinDocument) => {
    if (!d.clientEmail) { toast.error("No client email found."); return; }
    const url = `${window.location.origin}/invoice/${d.number}`;
    const subject = `Friendly Reminder: ${DOC_TYPE_LABELS[d.type]} ${d.number} is due (${centsToDisplay(d.balanceDueCents)})`;
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f2ee;padding:24px 0">
      <table width="560" align="center" style="background:#fff;border:1px solid #e3ded6;padding:28px">
        <tr><td>
          <h2 style="margin:0 0 12px;font-size:18px;color:#111">Payment Reminder: ${d.number}</h2>
          <p style="font-size:14px;color:#444">Hi ${d.clientName || "there"},</p>
          <p style="font-size:14px;color:#444;line-height:1.6">
            This is a friendly reminder that your balance of <strong>${centsToDisplay(d.balanceDueCents)}</strong> for ${DOC_TYPE_LABELS[d.type]} <strong>#${d.number}</strong> ${d.dueDate ? `was due on <strong>${d.dueDate}</strong>` : "is pending"}.
          </p>
          <div style="text-align:center;margin:24px 0">
            <a href="${url}" style="background:#111;color:#fff;padding:12px 24px;text-decoration:none;font-weight:bold;font-size:13px;border-radius:4px;display:inline-block">
              View Invoice & Banking Details Online →
            </a>
          </div>
          <div style="background:#f9f8f6;border:1px solid #e5e1d8;padding:14px;border-radius:4px;font-size:12px;line-height:1.6">
            <strong style="display:block;margin-bottom:6px">CIBC Caribbean Bank Transfer Details:</strong>
            <pre style="margin:0;font-family:Arial,sans-serif;white-space:pre-wrap">${d.notes?.trim() || profile.bankingDetails}</pre>
          </div>
          <p style="font-size:12px;color:#888;margin-top:20px">
            If payment has already been sent, please disregard this reminder or confirm via WhatsApp at ${profile.phone}.
          </p>
        </td></tr>
      </table>
    </body></html>`;

    try {
      await sendEmail({ to: d.clientEmail, subject, html, type: "proposal_sent" });
      await patchDoc(d.id, { updatedAt: new Date().toISOString() });
      await logFinanceAudit({ documentId: d.id, documentNumber: d.number, action: "reminder_sent", actor });
      toast.success(`Payment reminder sent to ${d.clientEmail}`);
    } catch {
      toast.error("Failed to send reminder.");
    }
  };

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "all",         label: "All" },
    { key: "invoice",     label: "Invoices" },
    { key: "quote",       label: "Quotes" },
    { key: "receipt",     label: "Receipts" },
    { key: "credit_note", label: "Credit Notes" },
    { key: "overdue",     label: "🔴 Overdue" },
    { key: "unpaid",      label: "🟡 Unpaid / Due" },
    { key: "paid",        label: "🟢 Paid" },
    { key: "draft",       label: "📝 Drafts" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display font-bold uppercase tracking-tight text-sm flex-1">Documents</h2>
        <button className={btnDept} onClick={onNew}>+ New Document</button>
      </div>

      {/* Filter strip + deep search bar + CSV Export */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        {/* Quick filter pills */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`text-[11px] px-2.5 py-1 border transition-colors cursor-pointer ${
                filter === f.key
                  ? "border-[var(--dept)] bg-[var(--dept)] text-[var(--on-dept)] font-bold shadow-xs"
                  : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] bg-[var(--panel)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search input + export button */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] pointer-events-none">🔍</span>
            <input
              ref={searchInputRef}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-[var(--panel)] border border-[var(--line)] text-[var(--ink)] placeholder-[var(--muted)] outline-none focus:border-[var(--dept)] focus:ring-1 focus:ring-[var(--dept)]"
              placeholder="Search #, client, email, phone, items… (Press /)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                onClick={() => { setSearch(""); searchInputRef.current?.focus(); }}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-ghost text-[11px] px-2.5 py-1.5 whitespace-nowrap"
            onClick={exportFilteredCSV}
            title="Export matching documents as CSV spreadsheet"
          >
            📥 CSV
          </button>
        </div>
      </div>

      {/* Results active summary bar */}
      {(search.trim() || filter !== "all") && (
        <div className="flex items-center justify-between text-[11px] px-3 py-2 bg-[var(--dept-soft)]/30 border border-[var(--line)] text-[var(--muted)]">
          <div>
            Showing <strong className="text-[var(--ink)]">{filtered.length}</strong> of {docs.length} documents
            {search.trim() && <span> matching "<strong>{search}</strong>"</span>}
            {filter !== "all" && <span> with filter <strong>{FILTERS.find((f) => f.key === filter)?.label}</strong></span>}
          </div>
          <button
            type="button"
            className="text-[10px] font-bold uppercase text-[var(--dept)] hover:underline cursor-pointer"
            onClick={() => { setSearch(""); setFilter("all"); }}
          >
            ✕ Reset Filters
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className={`${panelCls} text-center py-12`} style={{ background: "var(--panel)" }}>
          <p className="text-[var(--muted)] text-sm">
            {search.trim() || filter !== "all" ? "No matching documents found." : "No documents found."}
          </p>
          {search.trim() || filter !== "all" ? (
            <button className={`${btnGhost} mt-3`} onClick={() => { setSearch(""); setFilter("all"); }}>
              Clear Search & Filter
            </button>
          ) : (
            <button className={`${btnDept} mt-4`} onClick={onNew}>Create your first document</button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((d) => selected.has(d.id))}
                    ref={(el) => {
                      if (el) el.indeterminate = filtered.some((d) => selected.has(d.id)) && !filtered.every((d) => selected.has(d.id));
                    }}
                    onChange={(e) => {
                      if (e.target.checked) setSelected(new Set(filtered.map((d) => d.id)));
                      else setSelected(new Set());
                    }}
                    className="accent-[var(--dept)]"
                  />
                </th>
                <th className="text-left font-meta text-[9px] text-[var(--muted)] px-3 py-2 uppercase tracking-wider">Number</th>
                <th className="text-left font-meta text-[9px] text-[var(--muted)] px-3 py-2 uppercase tracking-wider">Type</th>
                <th className="text-left font-meta text-[9px] text-[var(--muted)] px-3 py-2 uppercase tracking-wider">Client</th>
                <th className="text-left font-meta text-[9px] text-[var(--muted)] px-3 py-2 uppercase tracking-wider">Date</th>
                <th className="text-right font-meta text-[9px] text-[var(--muted)] px-3 py-2 uppercase tracking-wider">Total</th>
                <th className="text-right font-meta text-[9px] text-[var(--muted)] px-3 py-2 uppercase tracking-wider">Balance</th>
                <th className="text-left font-meta text-[9px] text-[var(--muted)] px-3 py-2 uppercase tracking-wider">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  className={`border-b border-[var(--line)] transition-colors hover:bg-[var(--dept-soft)] ${selected.has(d.id) ? "bg-[var(--dept-soft)]" : ""}`}
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={(e) => toggleSelect(d.id, e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey)}
                      className="accent-[var(--dept)]"
                      aria-label={`Select ${d.number}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <button
                      type="button"
                      className="font-mono text-xs font-semibold text-[var(--ink)] hover:text-[var(--dept)] hover:underline flex items-center gap-1 cursor-pointer"
                      onClick={() => copyDocNumber(d.number)}
                      title="Click to copy document number"
                    >
                      <span>#{d.number}</span>
                      {copiedNum === d.number ? (
                        <span className="text-[9px] text-green-600 font-bold">✓</span>
                      ) : (
                        <span className="text-[9px] text-[var(--muted)] opacity-50">📋</span>
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">{DOC_TYPE_LABELS[d.type]}</td>
                  <td className="px-3 py-2">
                    <div className="text-xs font-medium">{d.clientName}</div>
                    <div className="font-meta text-[9px] text-[var(--muted)]">{d.clientEmail}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">{d.issueDate}</td>
                  <td className="px-3 py-2 text-xs text-right font-mono">{centsToDisplay(d.totalCents)}</td>
                  <td className="px-3 py-2 text-xs text-right font-mono">
                    {d.balanceDueCents > 0 ? (
                      <span className="text-red-600 font-semibold">{centsToDisplay(d.balanceDueCents)}</span>
                    ) : (
                      <span className="text-green-600 font-semibold">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`font-meta text-[9px] px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status]}`}>
                      {STATUS_LABELS[d.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end flex-wrap">
                      <button
                        className="text-[10px] font-semibold text-[var(--ink)] bg-[var(--dept-soft)] hover:bg-[var(--dept)] hover:text-[var(--on-dept)] px-2.5 py-1 border border-[var(--line)] transition-colors"
                        onClick={() => setPreviewTarget(d)}
                        title="View client-facing preview"
                      >
                        👁 Preview
                      </button>
                      <button
                        className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 border border-[var(--line)] transition-colors"
                        onClick={() => copyClientLink(d)}
                        title="Copy direct client invoice link"
                      >
                        🔗 Link
                      </button>
                      <button className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 border border-[var(--line)] transition-colors" onClick={() => onEdit(d)}>Edit</button>
                      <button className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 border border-[var(--line)] transition-colors" onClick={() => generatePDF(d, profile)}>PDF</button>
                      {d.status !== "paid" && d.status !== "void" && (
                        <button className="text-[10px] text-[var(--muted)] hover:text-green-600 px-2 py-1 border border-[var(--line)] transition-colors" onClick={() => setPayTarget(d)}>$ Pay</button>
                      )}
                      {d.status !== "paid" && d.status !== "void" && (
                        <button
                          className="text-[10px] text-[var(--muted)] hover:text-amber-600 px-2 py-1 border border-[var(--line)] transition-colors"
                          onClick={() => sendReminder(d)}
                          title="Send polite email payment reminder"
                        >
                          🔔 Remind
                        </button>
                      )}
                      {d.totalCents > 0 && d.status !== "paid" && d.status !== "void" && (
                        <button
                          className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 border border-[var(--line)] transition-colors"
                          onClick={() => splitDepositInvoices(d)}
                          title="Split into 50% upfront deposit and 50% final balance invoices"
                        >
                          ⚡ 50/50
                        </button>
                      )}
                      {d.type === "quote" && d.status !== "void" && (
                        <button className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 border border-[var(--line)] transition-colors" onClick={() => convertToInvoice(d)}>→ Invoice</button>
                      )}
                      {d.status !== "void" && (
                        <button className="text-[10px] text-[var(--muted)] hover:text-blue-600 px-2 py-1 border border-[var(--line)] transition-colors" onClick={() => sendDoc(d)}>Send</button>
                      )}
                      {d.status !== "void" && (
                        <button className="text-[10px] text-[var(--muted)] hover:text-orange-500 px-2 py-1 border border-[var(--line)] transition-colors" onClick={() => voidDoc(d)}>Void</button>
                      )}
                      <button className="text-[10px] text-[var(--muted)] hover:text-red-500 px-2 py-1 border border-[var(--line)] transition-colors" onClick={() => deleteDoc_(d)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating batch HUD */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 border border-[var(--line)] shadow-2xl" style={{ background: "var(--panel)", backdropFilter: "blur(16px)" }}>
          <span className="font-meta text-[10px] text-[var(--muted)]">{selected.size} selected</span>
          <button
            className={btnGhost}
            onClick={() => {
              filtered.filter((d) => selected.has(d.id)).forEach((d) => generatePDF(d, profile));
            }}
          >
            Download PDFs
          </button>
          <button className={btnGhost} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Record Payment Modal */}
      {payTarget && (
        <PaymentModal
          finDoc={payTarget}
          actor={actor}
          onClose={() => setPayTarget(null)}
          onSaved={(_updated) => {
            setPayTarget(null);
            onRefresh();
          }}
        />
      )}

      {/* Full-Screen Document Preview Modal */}
      {previewTarget && (
        <DocumentPreviewModal
          finDoc={previewTarget}
          profile={profile}
          onClose={() => setPreviewTarget(null)}
          onEdit={() => {
            const target = previewTarget;
            setPreviewTarget(null);
            onEdit(target);
          }}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   BUSINESS & BANKING SETTINGS SUB-VIEW
────────────────────────────────────────────────────────────────────────────── */

function BusinessSettingsManager({
  profile,
  onSaved,
}: {
  profile: FinanceProfile;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile.businessName);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [address, setAddress] = useState(profile.location);
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl);
  const [websiteUrl, setWebsiteUrl] = useState(profile.website);
  const [bankingDetails, setBankingDetails] = useState(profile.bankingDetails);
  const [defaultTerms, setDefaultTerms] = useState(profile.defaultTerms);
  const [jmdExchangeRate, setJmdExchangeRate] = useState(profile.jmdExchangeRate);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const current = await getSettings();
      const updated: SiteSettings = {
        ...current,
        financeSettings: {
          ...current.financeSettings,
          businessName: name.trim(),
          businessEmail: email.trim(),
          businessPhone: phone.trim(),
          businessAddress: address.trim(),
          logoUrl: logoUrl.trim(),
          websiteUrl: websiteUrl.trim(),
          bankingDetails: bankingDetails.trim(),
          defaultTerms: defaultTerms.trim(),
          jmdExchangeRate: Number(jmdExchangeRate) || 158.50,
        },
      };
      await saveSettings(updated);
      toast.success("Business info & CIBC banking details saved.");
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save settings.");
    } finally {
      setBusy(false);
    }
  };

  const resetToDefaultBankNote = () => {
    setBankingDetails(DEFAULT_BANKING_NOTE);
    toast.success("Reset banking note to CIBC Caribbean default template.");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="font-display font-bold uppercase tracking-tight text-sm">Business & CIBC Caribbean Banking Settings</h2>
        <p className="font-meta text-[10px] text-[var(--muted)] mt-1">
          This information and banking instruction note is automatically pulled into every Quote, Invoice, Receipt, PDF, and Email.
        </p>
      </div>

      {/* Business Details */}
      <div className={`${panelCls} space-y-4`} style={{ background: "var(--panel)" }}>
        <h3 className="font-display font-bold uppercase text-xs">Business Identity</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Business Name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Socialkon10 Jamaica" />
          </div>
          <div>
            <label className={labelCls}>Logo Image URL</label>
            <input className={inputCls} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="/assets/sk-logo-full.png" />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="socialkon10@gmail.com" />
          </div>
          <div>
            <label className={labelCls}>Phone / WhatsApp</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="1 (876) 255-4848" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Business Address / Location</label>
            <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="23-27 Knutsford Blvd, Kingston, Jamaica" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Website URL</label>
            <input className={inputCls} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://socialkon10.com" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>JMD Exchange Rate (J$ per 1 USD)</label>
            <input
              type="number" step="0.5"
              className={inputCls}
              value={jmdExchangeRate}
              onChange={(e) => setJmdExchangeRate(parseFloat(e.target.value) || 158.5)}
              placeholder="158.50"
            />
            <span className="block font-meta text-[8px] text-[var(--muted)] mt-1">
              Used for the estimated JMD conversion display on invoices, PDFs, and client web portal.
            </span>
          </div>
        </div>
      </div>

      {/* CIBC Caribbean Banking Details Note */}
      <div className={`${panelCls} space-y-3`} style={{ background: "var(--panel)" }}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold uppercase text-xs">🏦 CIBC Caribbean Bank Transfer Note</h3>
          <button
            type="button"
            className="text-[9px] font-meta text-[var(--dept)] hover:underline"
            onClick={resetToDefaultBankNote}
          >
            Reset to CIBC Template
          </button>
        </div>
        <p className="font-meta text-[9px] text-[var(--muted)]">
          This exact message appears at the bottom of all new invoices and quotes for wire transfer instructions. You can edit any details below.
        </p>
        <textarea
          className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
          rows={12}
          value={bankingDetails}
          onChange={(e) => setBankingDetails(e.target.value)}
        />
      </div>

      {/* Default Terms */}
      <div className={`${panelCls} space-y-3`} style={{ background: "var(--panel)" }}>
        <h3 className="font-display font-bold uppercase text-xs">Default Terms & Conditions</h3>
        <textarea
          className={`${inputCls} resize-y text-xs`}
          rows={3}
          value={defaultTerms}
          onChange={(e) => setDefaultTerms(e.target.value)}
        />
      </div>

      {/* Save Button */}
      <button className={btnDept} onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save Business & Banking Settings"}
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   CLIENTS SUB-VIEW
────────────────────────────────────────────────────────────────────────────── */

function ClientsManager() {
  const [clients, setClients] = useState<FinClient[]>([]);
  const [editing, setEditing] = useState<FinClient | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<Partial<FinClient>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setClients(await loadClients());
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ country: "Jamaica" });
    setIsNew(true);
    setEditing(null);
  };

  const openEdit = (c: FinClient) => {
    setForm({ ...c });
    setEditing(c);
    setIsNew(false);
  };

  const saveClient = async () => {
    if (!form.name?.trim() || !form.email?.trim()) { toast.error("Name and email required."); return; }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      if (isNew || editing?.id.startsWith("doc-client-") || editing?.id.startsWith("order-client-") || editing?.id.startsWith("lead-client-")) {
        await addManaged("financeClients", { ...form, createdAt: now, updatedAt: now });
        toast.success("Client saved to permanent directory.");
      } else if (editing) {
        await updateManaged("financeClients", editing.id, { ...form, updatedAt: now });
        toast.success("Client updated.");
      }
      setIsNew(false); setEditing(null);
      await load();
    } catch { toast.error("Save failed."); }
    finally { setBusy(false); }
  };

  const deleteClient = async (c: FinClient) => {
    if (c.id.startsWith("doc-client-") || c.id.startsWith("order-client-") || c.id.startsWith("lead-client-")) {
      toast.info(`"${c.name}" is linked to past history (${c.source}). To store as custom contact, click Edit and Save.`);
      return;
    }
    if (!confirm(`Delete client ${c.name}?`)) return;
    await removeManaged("financeClients", c.id);
    toast.success("Client deleted.");
    await load();
  };

  const set = (k: keyof FinClient, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (isNew || editing) {
    return (
      <div className="space-y-5 max-w-xl">
        <div className="flex items-center gap-3">
          <button className={btnGhost} onClick={() => { setIsNew(false); setEditing(null); }}>← Back</button>
          <h3 className="font-display font-bold uppercase tracking-tight text-xs">{isNew ? "New Client" : `Edit ${editing?.name}`}</h3>
        </div>
        <div className={`${panelCls} space-y-3`} style={{ background: "var(--panel)" }}>
          {([
            ["name", "Full Name / Business", "text"],
            ["email", "Email", "email"],
            ["phone", "Phone", "tel"],
            ["company", "Company", "text"],
            ["address", "Street Address", "text"],
            ["city", "City / Parish", "text"],
            ["country", "Country", "text"],
          ] as [keyof FinClient, string, string][]).map(([k, label, t]) => (
            <div key={k}>
              <label className={labelCls}>{label}</label>
              <input type={t} className={inputCls} value={(form[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3">
          <button className={btnDept} onClick={saveClient} disabled={busy}>{busy ? "Saving…" : "Save Client"}</button>
          <button className={btnGhost} onClick={() => { setIsNew(false); setEditing(null); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="font-display font-bold uppercase tracking-tight text-sm">Past & Saved Clients</h2>
          <p className="font-meta text-[10px] text-[var(--muted)]">All clients compiled across your invoices, website orders, leads, and saved contacts.</p>
        </div>
        <div className="flex-1" />
        <button className={btnDept} onClick={openNew}>+ New Client</button>
      </div>
      {clients.length === 0 ? (
        <div className={`${panelCls} text-center py-10`} style={{ background: "var(--panel)" }}>
          <p className="text-sm text-[var(--muted)]">No clients yet. Clients are auto-compiled when you create documents or receive orders.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--line)]">
                {["Client", "Email", "Phone", "City", "Source", ""].map((h) => (
                  <th key={h} className="text-left font-meta text-[9px] text-[var(--muted)] px-3 py-2 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-[var(--line)] hover:bg-[var(--dept-soft)] transition-colors">
                  <td className="px-3 py-2">
                    <div className="font-medium text-xs text-[var(--ink)]">{c.name}</div>
                    {c.company && <div className="text-[10px] text-[var(--muted)]">{c.company}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">{c.email}</td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">{c.phone || "—"}</td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">{c.city || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--dept-soft)] text-[var(--dept)] border border-[var(--dept)]/20">
                      {c.source || "Client"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 justify-end">
                      <button className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 border border-[var(--line)]" onClick={() => openEdit(c)}>Edit</button>
                      <button className="text-[10px] text-[var(--muted)] hover:text-red-500 px-2 py-1 border border-[var(--line)]" onClick={() => deleteClient(c)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   TAX RATES SUB-VIEW
────────────────────────────────────────────────────────────────────────────── */

function TaxRatesManager() {
  const [rates, setRates] = useState<FinTaxRate[]>([]);
  const [newName, setNewName] = useState("");
  const [newPct, setNewPct] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setRates(await loadTaxRates()), []);
  useEffect(() => { load(); }, [load]);

  const addRate = async () => {
    if (!newName.trim()) { toast.error("Enter a tax rate name."); return; }
    const pct = parseFloat(newPct);
    if (isNaN(pct) || pct < 0) { toast.error("Enter a valid percentage."); return; }
    setBusy(true);
    try {
      await addManaged("financeTaxRates", {
        name: newName.trim(), percent: pct, isDefault: rates.length === 0, active: true,
      });
      toast.success("Tax rate added.");
      setNewName(""); setNewPct("");
      await load();
    } catch { toast.error("Failed to add tax rate."); }
    finally { setBusy(false); }
  };

  const toggle = async (r: FinTaxRate) => {
    await updateManaged("financeTaxRates", r.id, { active: !r.active });
    await load();
  };

  const setDefault = async (r: FinTaxRate) => {
    for (const rate of rates) {
      if (rate.id !== r.id && rate.isDefault) {
        await updateManaged("financeTaxRates", rate.id, { isDefault: false });
      }
    }
    await updateManaged("financeTaxRates", r.id, { isDefault: true });
    await load();
    toast.success(`${r.name} set as default.`);
  };

  const del = async (r: FinTaxRate) => {
    if (!confirm(`Delete tax rate "${r.name}"?`)) return;
    await removeManaged("financeTaxRates", r.id);
    await load();
    toast.success("Deleted.");
  };

  return (
    <div className="space-y-5 max-w-xl">
      <h2 className="font-display font-bold uppercase tracking-tight text-sm">Tax Rates</h2>
      <div className={`${panelCls} space-y-3`} style={{ background: "var(--panel)" }}>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls}>Name (e.g. Jamaica GCT / Sales Tax)</label>
            <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tax description" />
          </div>
          <div className="w-28">
            <label className={labelCls}>Percent %</label>
            <input type="number" min="0" max="100" step="0.01" className={inputCls} value={newPct} onChange={(e) => setNewPct(e.target.value)} placeholder="0.0" />
          </div>
          <div className="self-end">
            <button className={btnDept} onClick={addRate} disabled={busy}>Add</button>
          </div>
        </div>
        {rates.length === 0 && (
          <p className="text-xs text-[var(--muted)]">No tax rates configured. Documents default to 0% tax.</p>
        )}
        {rates.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-t border-[var(--line)] pt-3">
            <span className="flex-1 text-sm">{r.name}</span>
            <span className="font-mono text-sm">{r.percent}%</span>
            {r.isDefault && <span className="font-meta text-[9px] px-2 py-0.5 bg-[var(--dept)] text-[var(--on-dept)] font-bold">Default</span>}
            <button className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 border border-[var(--line)]" onClick={() => setDefault(r)}>Set Default</button>
            <button className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] px-2 py-1 border border-[var(--line)]" onClick={() => toggle(r)}>{r.active ? "Disable" : "Enable"}</button>
            <button className="text-[10px] text-[var(--muted)] hover:text-red-500 px-2 py-1 border border-[var(--line)]" onClick={() => del(r)}>Del</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   REPORTS SUB-VIEW
────────────────────────────────────────────────────────────────────────────── */

function ReportsView({ docs }: { docs: FinDocument[] }) {
  const paid = docs.filter((d) => d.status === "paid");
  const outstanding = docs.filter((d) => d.status === "sent" || d.status === "overdue");
  const totalRevenue = paid.reduce((s, d) => s + d.totalCents, 0);
  const totalOutstanding = outstanding.reduce((s, d) => s + d.balanceDueCents, 0);
  const totalOverdue = docs.filter((d) => d.status === "overdue").reduce((s, d) => s + d.balanceDueCents, 0);

  // Monthly revenue chart (last 6 months)
  const monthlyData = useMemo(() => {
    const months: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
      const revenue = paid
        .filter((doc) => doc.paidDate?.startsWith(key) || doc.issueDate.startsWith(key))
        .reduce((s, doc) => s + doc.totalCents, 0) / 100;
      months.push({ month: label, revenue });
    }
    return months;
  }, [paid]);

  const StatCard = ({ label, value, sub, color = "var(--ink)" }: { label: string; value: string; sub?: string; color?: string }) => (
    <div className={panelCls} style={{ background: "var(--panel)" }}>
      <p className={labelCls}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
      {sub && <p className="font-meta text-[9px] text-[var(--muted)] mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="font-display font-bold uppercase tracking-tight text-sm">Reports</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Revenue (Paid)" value={centsToDisplay(totalRevenue)} sub={`${paid.length} paid invoices`} color="var(--dept)" />
        <StatCard label="Outstanding" value={centsToDisplay(totalOutstanding)} sub={`${outstanding.length} open`} />
        <StatCard label="Overdue" value={centsToDisplay(totalOverdue)} color="var(--dept)" />
        <StatCard label="Total Documents" value={String(docs.length)} sub={`${docs.filter((d) => d.type === "quote").length} quotes, ${docs.filter((d) => d.type === "invoice").length} invoices`} />
      </div>

      <div className={panelCls} style={{ background: "var(--panel)" }}>
        <p className={`${labelCls} mb-4`}>Monthly Revenue (USD)</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} />
            <Bar dataKey="revenue" fill="var(--dept)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent paid invoices */}
      <div className={panelCls} style={{ background: "var(--panel)" }}>
        <p className={`${labelCls} mb-4`}>Recent Paid Documents</p>
        {paid.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No paid documents yet.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--line)]">
                {["Number", "Client", "Paid Date", "Amount"].map((h) => (
                  <th key={h} className="text-left font-meta text-[9px] text-[var(--muted)] px-2 py-1 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paid.slice(0, 10).map((d) => (
                <tr key={d.id} className="border-b border-[var(--line)]">
                  <td className="px-2 py-1.5 font-mono">{d.number}</td>
                  <td className="px-2 py-1.5">{d.clientName}</td>
                  <td className="px-2 py-1.5 text-[var(--muted)]">{d.paidDate ?? d.issueDate}</td>
                  <td className="px-2 py-1.5 font-semibold">{centsToDisplay(d.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   ROOT FINANCE MANAGER
────────────────────────────────────────────────────────────────────────────── */

type FinanceView = "documents" | "new" | "edit" | "clients" | "tax" | "reports" | "settings";

export function FinanceManager() {
  const { user } = useAuth();
  const actor = user?.email ?? "admin";

  const [view, setView] = useState<FinanceView>("documents");
  const [docs, setDocs] = useState<FinDocument[]>([]);
  const [clients, setClients] = useState<FinClient[]>([]);
  const [taxRates, setTaxRates] = useState<FinTaxRate[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({});
  const [editTarget, setEditTarget] = useState<FinDocument | null>(null);
  const [loading, setLoading] = useState(true);

  const profile = useMemo(() => getFinanceProfile(siteSettings), [siteSettings]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [d, c, t, s] = await Promise.all([
      loadDocs(),
      loadClients(),
      loadTaxRates(),
      getSettings(),
    ]);
    setDocs(d);
    setClients(c);
    setTaxRates(t);
    setSiteSettings(s);
    setLoading(false);
  }, []);

  // Load complete service catalog: agencyServices + websiteAddons + core SERVICES
  useEffect(() => {
    Promise.all([
      listManaged("agencyServices"),
      listManaged("websiteAddons"),
    ]).then(([svcs, addons]) => {
      const catalog: ServiceOption[] = [];

      // 1. Agency services from Firestore
      for (const s of svcs) {
        if (s.name) {
          catalog.push({
            id: s.id,
            name: String(s.name),
            priceCents: s.price != null ? Math.round(Number(s.price) * 100) : 0,
            category: "Agency Services",
          });
        }
      }

      // 2. Website Addons & Power-Ups from Firestore
      for (const a of addons) {
        if (a.name) {
          catalog.push({
            id: a.id,
            name: String(a.name),
            priceCents: a.price != null ? Math.round(Number(a.price) * 100) : 0,
            category: "Website Add-Ons & Features",
          });
        }
      }

      // 3. Built-in Core Design & Marketing Services from data.ts
      for (const sp of SERVICES) {
        catalog.push({
          id: `builtin-${sp.id}`,
          name: sp.name,
          priceCents: Math.round(sp.price * 100),
          category: "Design & Website Packages",
        });
      }

      setServices(catalog);
    }).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const SUB_TABS: { key: FinanceView; label: string }[] = [
    { key: "documents", label: "📄 Documents" },
    { key: "clients",   label: "👥 Clients" },
    { key: "tax",       label: "🧾 Tax Rates" },
    { key: "reports",   label: "📊 Reports" },
    { key: "settings",  label: "⚙️ Business & Banking" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="font-meta text-[10px] text-[var(--muted)] animate-pulse">Loading finance module…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Module header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold uppercase tracking-tight text-base">{profile.businessName} Finance</h1>
            <span className="font-meta text-[9px] px-2 py-0.5 bg-[var(--dept-soft)] text-[var(--ink)] font-bold">2026 Engine</span>
          </div>
          <p className="font-meta text-[10px] text-[var(--muted)] mt-0.5">
            Create, manage, preview and send professional Quotes, Invoices, Receipts & Credit Notes with CIBC Caribbean wire details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {view === "documents" && (
            <button className={btnDept} onClick={() => { setEditTarget(null); setView("new"); }}>
              + Create Document
            </button>
          )}
        </div>
      </div>

      {/* Sub-tab nav (only when not in editor) */}
      {view !== "new" && view !== "edit" && (
        <div className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-0">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.key)}
              className={`text-xs px-4 py-2 transition-colors border-b-2 -mb-px ${view === t.key ? "border-[var(--dept)] text-[var(--ink)] font-bold" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* View routing */}
      {view === "documents" && (
        <DocList
          docs={docs}
          profile={profile}
          actor={actor}
          onNew={() => { setEditTarget(null); setView("new"); }}
          onEdit={(d) => { setEditTarget(d); setView("edit"); }}
          onRefresh={refresh}
        />
      )}

      {(view === "new" || view === "edit") && (
        <DocEditor
          initial={view === "edit" ? editTarget : null}
          clients={clients}
          taxRates={taxRates}
          services={services}
          profile={profile}
          actor={actor}
          onSaved={(_saved) => {
            refresh();
            setView("documents");
          }}
          onCancel={() => setView("documents")}
        />
      )}

      {view === "clients"  && <ClientsManager />}
      {view === "tax"      && <TaxRatesManager />}
      {view === "reports"  && <ReportsView docs={docs} />}
      {view === "settings" && (
        <BusinessSettingsManager
          profile={profile}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
