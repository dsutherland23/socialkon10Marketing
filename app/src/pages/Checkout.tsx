import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CONTACT, formatMoney } from "../lib/data";
import { useDepartment } from "../lib/dept";
import { depositFor, useShop } from "../lib/shop";
import { activeProviders } from "../lib/payments";
import { useSEO, track } from "../lib/seo";
import { Reveal } from "../lib/motion";
import { useAuth } from "../lib/auth";
import { attachFiles, cartToOrderItems, claimOrders, createOrder } from "../lib/backend";
import { auth as fbAuth, firebaseReady } from "../lib/firebase";

/* ------------------------------------------------------------------
   CHECKOUT (PRD §29–31)
   PROJECT → DETAILS → FILES → PAYMENT → DONE
   Streamlined, accessible, no traditional ecommerce sprawl.
------------------------------------------------------------------- */

const STEPS = ["Project", "Details", "Files", "Payment", "Done"] as const;
const ACCEPTED = [".pdf", ".jpg", ".jpeg", ".png", ".svg", ".docx", ".zip", ".mp4", ".mp3"];
const MAX_MB = 25;

interface Details { name: string; company: string; email: string; phone: string; website: string; industry: string; audience: string; goals: string; deadline: string; colors: string; style: string; extra: string }

export default function Checkout() {
  useDepartment(null);
  const { items, remove, currency, promo, applyPromo, clearPromo, subtotal, discount, total, clear } = useShop();
  const [step, setStep] = useState(0);
  const [payMode, setPayMode] = useState<"deposit" | "full">("deposit");
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [details, setDetails] = useState<Details>({ name: "", company: "", email: "", phone: "", website: "", industry: "", audience: "", goals: "", deadline: "", colors: "", style: "", extra: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Details, string>>>({});
  const [files, setFiles] = useState<{ file: File; name: string; size: number }[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [acctPass, setAcctPass] = useState("");
  const [acctError, setAcctError] = useState<string | null>(null);
  const [acctDone, setAcctDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user, signUp } = useAuth();

  useSEO({ title: "Checkout — Social Kon10 Marketing", description: "Configure, pay your deposit and start your project.", path: "/checkout" });

  const depositTotal = useMemo(() => items.reduce((s, i) => s + depositFor(i), 0), [items]);
  const dueToday = payMode === "deposit" ? Math.max(0, depositTotal - discount) : total;

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDetails((d) => ({ ...d, [k]: e.target.value }));

  const validateDetails = () => {
    const e: typeof errors = {};
    if (!details.name.trim()) e.name = "Your name is required.";
    if (!/.+@.+\..+/.test(details.email)) e.email = "A valid email is required.";
    if (!details.goals.trim()) e.goals = "Tell us the goal in a sentence or two.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    setFileError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      const ext = `.${f.name.split(".").pop()?.toLowerCase()}`;
      if (!ACCEPTED.includes(ext)) { setFileError(`${f.name}: file type not accepted (${ACCEPTED.join(" ")})`); continue; }
      if (f.size > MAX_MB * 1024 * 1024) { setFileError(`${f.name}: exceeds ${MAX_MB}MB limit`); continue; }
      next.push({ file: f, name: f.name, size: f.size });
      track("file_upload", { name: f.name, size: f.size });
    }
    setFiles(next);
  };

  const pay = async () => {
    setPaying(true);
    setPayError(null);
    track("payment_start", { value: dueToday, mode: payMode });
    const provider = activeProviders()[0];
    const res = await provider.pay({
      orderId: `SK-${Date.now()}`,
      amountUsd: dueToday,
      description: items.map((i) => i.name).join(", "),
      kind: payMode === "deposit" ? "deposit" : "full",
    });
    if (!res.ok) {
      setPaying(false);
      setPayError(res.error ?? "Payment failed — no charge was made. Try again.");
      track("payment_failed", {});
      return;
    }
    // persist the order (Firestore when configured, local demo otherwise)
    try {
      const oid = await createOrder(
        {
          email: details.email,
          name: details.name,
          company: details.company,
          items: cartToOrderItems(items),
          subtotal,
          discount,
          total,
          payMode,
          amountPaid: dueToday,
          balanceDue: Math.max(0, total - dueToday),
          promo,
          details: { ...details },
          files: files.map((f) => ({ name: f.name, size: f.size })),
        },
        user
      );
      if (firebaseReady && files.length > 0) await attachFiles(oid, files.map((f) => f.file));
      setOrderId(oid);
      window.dispatchEvent(new CustomEvent("sk-order-complete"));
    } catch {
      // order persistence must not block a paid confirmation
      setOrderId(`SK-${String(Date.now()).slice(-6)}`);
    }
    setPaying(false);
    track("purchase", { value: dueToday, transaction_id: res.transactionId });
    setStep(4);
    clear();
  };

  /** Post-purchase: create the client account and claim this order. */
  const createAccount = async () => {
    setAcctError(null);
    const err = await signUp(details.email, acctPass);
    if (err) { setAcctError(err); return; }
    setAcctDone(true);
    // claimOrders runs on next portal visit too; try immediately
    if (fbAuth?.currentUser) await claimOrders(fbAuth.currentUser);
  };

  const inputCls = "w-full bg-transparent border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--dept)] transition-colors";
  const labelCls = "font-meta text-[10px] text-[var(--muted)] block mb-1.5";

  return (
    <section className="wrap pt-14 md:pt-20 pb-24 max-w-5xl">
      <Reveal>
        <div className="flex justify-between font-meta text-[10px] text-[var(--muted)]">
          <span className="idx">/checkout</span>
          <span>Secure · provider-agnostic</span>
        </div>
      </Reveal>
      <h1 className="display-section mt-6">Checkout</h1>

      {/* progress indicator */}
      <ol className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 font-meta text-[10px]" aria-label="Checkout progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-3">
            <span style={{ color: i < step ? "var(--muted)" : i === step ? "var(--dept)" : "var(--muted)" }}>
              {i < step ? "✓" : String(i + 1).padStart(2, "0")} {s.toUpperCase()}
            </span>
            {i < STEPS.length - 1 && <span className="text-[var(--muted)]" aria-hidden>→</span>}
          </li>
        ))}
      </ol>

      <div className="mt-12">
        {/* STEP 1 — project summary */}
        {step === 0 && (
          <div>
            {items.length === 0 ? (
              <div className="border border-[var(--line)] p-10 text-center" style={{ background: "var(--panel)" }}>
                <p className="font-display text-xl font-bold uppercase">Your cart is empty</p>
                <p className="text-sm text-[var(--muted)] mt-2">Browse packages or build your own — prices are published, no surprises.</p>
                <div className="mt-6 flex justify-center gap-4">
                  <Link to="/packages" className="btn btn-fill">Browse packages</Link>
                  <Link to="/start?intent=quote" className="btn btn-ghost">Request a quote</Link>
                </div>
              </div>
            ) : (
              <>
                <ul>
                  {items.map((i) => (
                    <li key={i.key} className="file-row grid-cols-[1fr_auto_auto]">
                      <div>
                        <span className="font-display text-base font-bold uppercase">{i.name}</span>
                        <span className="block font-meta text-[9px] text-[var(--muted)] mt-1">
                          {i.addons.length > 0 && `+ ${i.addons.map((a) => a.name).join(", ")} · `}
                          {i.rush && "Rush +25% · "}
                          {i.billing === "monthly" ? "Monthly retainer" : "One-time"} · {i.depositPct}% deposit
                        </span>
                      </div>
                      <span className="font-display font-bold">{formatMoney(depositFor(i) / (i.depositPct / 100), currency)}</span>
                      <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors" onClick={() => remove(i.key)} aria-label={`Remove ${i.name}`}>Remove</button>
                    </li>
                  ))}
                </ul>

                {/* promo */}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <label htmlFor="promo" className="font-meta text-[10px] text-[var(--muted)]">Promo code</label>
                  <input id="promo" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} className={`${inputCls} !w-44`} placeholder="WELCOME10" />
                  <button className="btn btn-ghost !py-2.5" onClick={() => setPromoError(applyPromo(promoInput))}>Apply</button>
                  {promo && <span className="font-meta text-[10px] dept-accent">{promo} applied <button onClick={clearPromo} className="underline ml-1">remove</button></span>}
                  {promoError && <span className="font-meta text-[10px] text-red-600" role="alert">{promoError}</span>}
                </div>

                <div className="mt-8 pt-6 rule-t max-w-md ml-auto flex flex-col gap-2 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--muted)]">Subtotal</span><span>{formatMoney(subtotal, currency)}</span></div>
                  {discount > 0 && <div className="flex justify-between dept-accent"><span>Discount</span><span>−{formatMoney(discount, currency)}</span></div>}
                  <div className="flex justify-between font-display text-lg font-bold"><span>Project total</span><span>{formatMoney(total, currency)}</span></div>
                </div>
                <div className="mt-8 flex justify-end">
                  <button className="btn btn-fill" onClick={() => { setStep(1); track("checkout_start", { value: total }); }}>Your details <span className="btn-arrow" aria-hidden>→</span></button>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 2 — client information + project questionnaire */}
        {step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); if (validateDetails()) setStep(2); }} noValidate>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={labelCls} htmlFor="f-name">Name *</label>
                <input id="f-name" className={inputCls} value={details.name} onChange={set("name")} aria-invalid={!!errors.name} aria-describedby={errors.name ? "e-name" : undefined} />
                {errors.name && <p id="e-name" className="font-meta text-[10px] text-red-600 mt-1" role="alert">{errors.name}</p>}
              </div>
              <div><label className={labelCls} htmlFor="f-company">Company</label><input id="f-company" className={inputCls} value={details.company} onChange={set("company")} /></div>
              <div>
                <label className={labelCls} htmlFor="f-email">Email *</label>
                <input id="f-email" type="email" className={inputCls} value={details.email} onChange={set("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "e-email" : undefined} />
                {errors.email && <p id="e-email" className="font-meta text-[10px] text-red-600 mt-1" role="alert">{errors.email}</p>}
              </div>
              <div><label className={labelCls} htmlFor="f-phone">Phone</label><input id="f-phone" type="tel" className={inputCls} value={details.phone} onChange={set("phone")} /></div>
              <div><label className={labelCls} htmlFor="f-website">Current website</label><input id="f-website" type="url" className={inputCls} value={details.website} onChange={set("website")} placeholder="https://" /></div>
              <div><label className={labelCls} htmlFor="f-industry">Industry</label><input id="f-industry" className={inputCls} value={details.industry} onChange={set("industry")} /></div>
              <div><label className={labelCls} htmlFor="f-audience">Target audience</label><input id="f-audience" className={inputCls} value={details.audience} onChange={set("audience")} /></div>
              <div><label className={labelCls} htmlFor="f-deadline">Required deadline</label><input id="f-deadline" type="date" className={inputCls} value={details.deadline} onChange={set("deadline")} /></div>
              <div><label className={labelCls} htmlFor="f-colors">Preferred colors</label><input id="f-colors" className={inputCls} value={details.colors} onChange={set("colors")} placeholder="e.g. navy + gold, brand palette" /></div>
              <div><label className={labelCls} htmlFor="f-style">Preferred style / references</label><input id="f-style" className={inputCls} value={details.style} onChange={set("style")} placeholder="e.g. minimal, bold, like example.com" /></div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="f-goals">Project goals *</label>
                <textarea id="f-goals" rows={3} className={inputCls} value={details.goals} onChange={set("goals")} aria-invalid={!!errors.goals} aria-describedby={errors.goals ? "e-goals" : undefined} placeholder="What should this project achieve for the business?" />
                {errors.goals && <p id="e-goals" className="font-meta text-[10px] text-red-600 mt-1" role="alert">{errors.goals}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="f-extra">Competitors, preferred style, anything else</label>
                <textarea id="f-extra" rows={3} className={inputCls} value={details.extra} onChange={set("extra")} />
              </div>
            </div>
            <div className="mt-8 flex justify-between">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>← Back</button>
              <button type="submit" className="btn btn-fill">Files <span className="btn-arrow" aria-hidden>→</span></button>
            </div>
          </form>
        )}

        {/* STEP 3 — file uploads */}
        {step === 2 && (
          <div>
            <p className="text-sm text-[var(--muted)] max-w-xl">Existing logos, brand assets, content, references — anything that helps us start sharp. Accepted: {ACCEPTED.join(" ")} · max {MAX_MB}MB each.</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-6 w-full border border-dashed border-[var(--line-strong)] px-6 py-14 text-center hover:border-[var(--dept)] hover:bg-[var(--dept-soft)] transition-colors"
            >
              <span className="font-display text-lg font-bold uppercase block">Drop files or browse</span>
              <span className="font-meta text-[10px] text-[var(--muted)]">Stored securely · linked to your project</span>
            </button>
            <input ref={fileRef} type="file" multiple accept={ACCEPTED.join(",")} className="sr-only" onChange={(e) => onFiles(e.target.files)} aria-label="Upload project files" />
            {fileError && <p className="font-meta text-[10px] text-red-600 mt-3" role="alert">{fileError}</p>}
            {files.length > 0 && (
              <ul className="mt-6">
                {files.map((f, i) => (
                  <li key={i} className="file-row grid-cols-[1fr_auto_auto] !py-3">
                    <span className="text-sm">{f.name}</span>
                    <span className="font-meta text-[9px] text-[var(--muted)]">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                    <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)]" onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-8 flex justify-between">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-fill" onClick={() => setStep(3)}>Payment <span className="btn-arrow" aria-hidden>→</span></button>
            </div>
          </div>
        )}

        {/* STEP 4 — payment */}
        {step === 3 && (
          <div className="grid md:grid-cols-2 gap-10">
            <div>
              <span className="idx">/payment-mode</span>
              <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="Payment mode">
                {(["deposit", "full"] as const).map((m) => (
                  <label key={m} className="flex items-center justify-between border border-[var(--line)] px-5 py-4 cursor-pointer has-[:checked]:border-[var(--dept)] has-[:checked]:bg-[var(--dept-soft)] transition-colors">
                    <span className="flex items-center gap-3">
                      <input type="radio" name="paymode" checked={payMode === m} onChange={() => setPayMode(m)} className="accent-[var(--dept)] w-4 h-4" />
                      <span className="font-display text-sm font-bold uppercase">{m === "deposit" ? "Pay deposit" : "Pay in full"}</span>
                    </span>
                    <span className="font-display font-bold">{formatMoney(m === "deposit" ? Math.max(0, depositTotal - discount) : total, currency)}</span>
                  </label>
                ))}
              </div>
              <p className="font-meta text-[9px] text-[var(--muted)] mt-4 leading-relaxed">
                Deposits are non-refundable and secure your kickoff. The balance is due upon final approval, before files are delivered.
              </p>
            </div>
            <div>
              <span className="idx">/provider</span>
              <div className="mt-4 border border-[var(--line-strong)] p-6" style={{ background: "var(--panel)" }}>
                <div className="flex justify-between text-sm"><span className="text-[var(--muted)]">Due today</span><span className="font-display text-2xl font-bold">{formatMoney(dueToday, currency)}</span></div>
                {payMode === "deposit" && <div className="flex justify-between text-sm mt-1"><span className="text-[var(--muted)]">Balance on approval</span><span>{formatMoney(total - dueToday, currency)}</span></div>}
                <div className="mt-6 flex flex-col gap-2">
                  {activeProviders().map((p) => (
                    <button key={p.id} disabled={paying} onClick={pay} className="btn btn-dept justify-center disabled:opacity-60">
                      {paying ? "Processing…" : `Pay with ${p.name}`} <span className="btn-arrow" aria-hidden>→</span>
                    </button>
                  ))}
                </div>
                {payError && <p className="font-meta text-[10px] text-red-600 mt-3" role="alert">{payError}</p>}
                <p className="font-meta text-[8.5px] text-[var(--muted)] mt-5 leading-relaxed">
                  Cards are processed by the payment provider — we never see or store card data. PayPal (cards + PayPal balance) is being configured for production; the demo gateway is active in this build.
                </p>
              </div>
              <div className="mt-6"><button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button></div>
            </div>
          </div>
        )}

        {/* STEP 5 — confirmation */}
        {step === 4 && (
          <div className="border border-[var(--line-strong)] p-8 md:p-14 text-center" style={{ background: "var(--panel)" }}>
            <span className="idx">/order-{orderId}</span>
            <h2 className="display-section mt-4">Order confirmed.</h2>
            <p className="mt-4 text-[var(--muted)] max-w-md mx-auto">
              {payMode === "deposit" ? "Deposit received." : "Payment received."} Your project is in the queue —
              next step: complete your project questionnaire.
            </p>
            <div className="mt-8 max-w-sm mx-auto text-left">
              {["Confirmation email with your receipt", "Project questionnaire link", "Onboarding instructions + file upload access", "Kickoff scheduling within 1 business day"].map((s, i) => (
                <div key={s} className="file-row grid-cols-[36px_1fr] !py-3 !cursor-default">
                  <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-sm">{s}</span>
                </div>
              ))}
            </div>
            <p className="font-meta text-[10px] text-[var(--muted)] mt-8">Questions? {CONTACT.phone} · {CONTACT.email}</p>

            {/* client account creation / portal access */}
            {firebaseReady && !user && !acctDone && (
              <div className="mt-8 max-w-sm mx-auto border border-[var(--line)] p-6 text-left">
                <span className="idx">/client-portal</span>
                <p className="font-display text-base font-bold uppercase mt-2">Track this project</p>
                <p className="text-[13px] text-[var(--muted)] mt-1">Set a password to create your client account — your order, files and messages live there.</p>
                <label className="font-meta text-[10px] text-[var(--muted)] block mt-4 mb-1.5" htmlFor="acct-email">Email</label>
                <input id="acct-email" className="w-full bg-transparent border border-[var(--line)] px-4 py-3 text-sm" value={details.email} readOnly />
                <label className="font-meta text-[10px] text-[var(--muted)] block mt-3 mb-1.5" htmlFor="acct-pass">Choose a password</label>
                <input id="acct-pass" type="password" className="w-full bg-transparent border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--dept)]" value={acctPass} onChange={(e) => setAcctPass(e.target.value)} />
                {acctError && <p className="font-meta text-[10px] text-red-600 mt-2" role="alert">{acctError}</p>}
                <button className="btn btn-dept w-full justify-center mt-4" onClick={createAccount}>Create account <span className="btn-arrow" aria-hidden>→</span></button>
              </div>
            )}
            {firebaseReady && (user || acctDone) && (
              <div className="mt-8">
                <Link to="/client" className="btn btn-dept">Open your client portal <span className="btn-arrow" aria-hidden>→</span></Link>
              </div>
            )}

            <div className="mt-8 flex justify-center gap-4">
              <Link to="/work" className="btn btn-ghost">Browse the archive</Link>
              <Link to="/" className="btn btn-fill">Back home</Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
