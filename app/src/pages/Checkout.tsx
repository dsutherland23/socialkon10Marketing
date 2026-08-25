import { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CONTACT, formatMoney } from "../lib/data";
import { useDepartment } from "../lib/dept";
import { useShop } from "../lib/shop";
import { activeProviders } from "../lib/payments";
import { useSEO, track } from "../lib/seo";
import { Reveal } from "../lib/motion";
import { useAuth } from "../lib/auth";
import { attachFiles, cartToOrderItems, claimOrders, createOrder } from "../lib/backend";
import { auth as fbAuth, firebaseReady } from "../lib/firebase";
import { PasswordEyeToggle } from "../components/PasswordEyeToggle";
import { IntakeWizard, type IntakeOrderContext } from "../components/IntakeWizard";
import { getProfile, saveProfile, isIntakePackage, intakePackageFor, type IntakePackage, type ClientProfile } from "../lib/intake";
import { useContent } from "../lib/content";
import { sendEmail, orderConfirmationEmail, adminNewOrderEmail } from "../lib/email";

/* ------------------------------------------------------------------
   CHECKOUT (PRD §29–31)
   PROJECT → DETAILS → FILES → PAYMENT → DONE
   Streamlined, accessible, 100% full payment upfront.
------------------------------------------------------------------- */

const STEPS = ["Project", "Details", "Files", "Payment", "Done"] as const;
const ACCEPTED = [".pdf", ".jpg", ".jpeg", ".png", ".svg", ".docx", ".zip", ".mp4", ".mp3"];
const MAX_MB = 25;

/** Google G icon — used on the "Continue with Google" button */
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

/* 2026: checkout = payment, not interrogation. Contact basics only —
   the per-package project brief (goals, pages, colours, style) owns the
   deep questions right after payment, prefilled from what we know here. */
interface Details { name: string; company: string; email: string; phone: string; extra: string }

export default function Checkout() {
  useDepartment(null);
  const { items, remove, currency, promo, applyPromo, clearPromo, subtotal, discount, total, clear } = useShop();
  const [step, setStep] = useState(0);
  const payMode = "full" as const;
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [details, setDetails] = useState<Details>({ name: "", company: "", email: "", phone: "", extra: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Details, string>>>({});
  const [files, setFiles] = useState<{ file: File; name: string; size: number }[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [acctPass, setAcctPass] = useState("");
  const [showAcctPass, setShowAcctPass] = useState(false);
  const [acctError, setAcctError] = useState<string | null>(null);
  const [acctDone, setAcctDone] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [saveDetails, setSaveDetails] = useState(true);
  const [savedProfile, setSavedProfile] = useState<ClientProfile | null>(null);
  const [intakePkg, setIntakePkg] = useState<IntakePackage | null>(null);
  const [intakeOrderId, setIntakeOrderId] = useState<string | null>(null);
  const [intakeOrderCtx, setIntakeOrderCtx] = useState<IntakeOrderContext | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user, signUp, signInGoogle, sendMagicLink } = useAuth();
  const { services } = useContent();
  const priceFor = (slug: string) => services.find((s) => s.slug === slug)?.price ?? 0;

  // 2026 best practice: signed-in customers never retype saved details —
  // prefill from their account profile, only into fields still empty.
  useEffect(() => {
    if (!user) return;
    setDetails((d) => (d.email ? d : { ...d, email: user.email ?? d.email }));
    getProfile(user.uid).then((p) => {
      if (!p) return;
      setSavedProfile(p);
      setDetails((d) => ({
        ...d,
        name: d.name || p.name,
        company: d.company || p.company,
        email: d.email || p.email,
        phone: d.phone || p.phone,
      }));
    });
  }, [user]);

  // Enhancement 3: quick-checkout — set by "Buy Now" on template detail pages.
  // Skip the summary step, but NEVER skip contact details — an order without
  // name/email is anonymous and unfulfillable, and breaks guest order claiming.
  useEffect(() => {
    if (sessionStorage.getItem("sk_quick_checkout") === "1" && items.length > 0) {
      sessionStorage.removeItem("sk_quick_checkout");
      setStep(1); // straight to Your details
    }
  }, [items.length]);

  useSEO({ title: "Checkout — Social Kon10 Marketing", description: "Configure and complete payment for your project or template.", path: "/checkout" });

  const dueToday = total;

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDetails((d) => ({ ...d, [k]: e.target.value }));

  const validateDetails = () => {
    const e: typeof errors = {};
    if (!details.name.trim()) e.name = "Your name is required.";
    if (!/.+@.+\..+/.test(details.email)) e.email = "A valid email is required.";
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
    // hard guard: never charge without a reachable customer identity
    if (!details.name.trim() || !/.+@.+\..+/.test(details.email)) {
      setPayError("We need your name and a valid email before payment — so we can deliver your order and receipt.");
      setStep(1);
      return;
    }
    setPaying(true);
    setPayError(null);
    track("payment_start", { value: dueToday, mode: payMode });
    const provider = activeProviders()[0];
    const res = await provider.pay({
      orderId: `SK-${Date.now()}`,
      amountUsd: dueToday,
      description: items.map((i) => i.name).join(", "),
      kind: "full",
    });
    if (!res.ok) {
      setPaying(false);
      setPayError(res.error ?? "Payment failed — no charge was made. Try again.");
      track("payment_failed", {});
      return;
    }
    // persist the order (Firestore when configured, local demo otherwise)
    let finalOid = `SK-${String(Date.now()).slice(-6)}`;
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
      finalOid = oid;
      setOrderId(oid);
      window.dispatchEvent(new CustomEvent("sk-order-complete"));
    } catch {
      // order persistence must not block a paid confirmation
      setOrderId(finalOid);
    }

    // save details to the account for one-tap future checkouts (opt-out checkbox)
    // merge-safe: never clobbers profile fields checkout doesn't collect
    if (user && saveDetails) {
      const base = savedProfile;
      void saveProfile(user.uid, {
        name: details.name, company: details.company, email: details.email,
        phone: details.phone,
        website: base?.website ?? "", industry: base?.industry ?? "",
        address: base?.address ?? "", city: base?.city ?? "", country: base?.country ?? "",
      });
    }

    // website packages → the intake brief doubles as the project agreement;
    // pop it immediately post-purchase (highest-intent moment).
    // Snapshot the order BEFORE clear() so the brief can prefill + detect scope shifts.
    const webItem = items.find((i) => isIntakePackage(i.serviceSlug));
    if (webItem) {
      setIntakePkg(intakePackageFor(webItem.serviceSlug));
      setIntakeOrderId(finalOid);
      setIntakeOrderCtx({
        id: finalOid,
        amountPaid: dueToday,
        packageUnitPrice: webItem.unitPrice,
        addonNames: items.flatMap((i) => [
          ...i.addons.map((a) => a.name),
          ...(i.billing === "monthly" ? [i.name] : []),
        ]),
        details: { ...details },
        files: files.map((f) => ({ name: f.name, size: f.size })),
      });
    }

    // transactional email: client receipt + studio alert (fire-and-forget, never blocks)
    const portalUrl = `${window.location.origin}/client`;
    const lineItems = items.map((i) => ({
      name: i.name,
      price: Math.round((i.unitPrice + i.addons.reduce((s, a) => s + a.price, 0)) * (i.rush ? 1.25 : 1)),
    }));
    void sendEmail(orderConfirmationEmail({
      to: details.email, name: details.name, orderId: finalOid,
      items: lineItems, total: dueToday, portalUrl,
    }));
    void sendEmail(adminNewOrderEmail({
      name: details.name, email: details.email, orderId: finalOid,
      items: lineItems, total: dueToday,
      adminUrl: `${window.location.origin}/admin`,
    }));

    // Enhancement 4: Send magic access link so guest can log in from email
    if (firebaseReady && !user && details.email) {
      const err = await sendMagicLink(details.email);
      if (!err) setMagicSent(true);
    }

    setPaying(false);
    track("purchase", { value: dueToday, transaction_id: res.transactionId });
    setStep(4);
    if (webItem) setIntakeOpen(true);
    clear();
  };

  /** Post-purchase: create the client account with email + password and claim this order. */
  const createAccount = async () => {
    setAcctError(null);
    const err = await signUp(details.email, acctPass);
    if (err) { setAcctError(err); return; }
    setAcctDone(true);
    // claimOrders runs on next portal visit too; try immediately
    if (fbAuth?.currentUser) await claimOrders(fbAuth.currentUser);
  };

  /** Post-purchase: 1-tap Google sign-in and claim orders. Enhancement 2. */
  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    setAcctError(null);
    const err = await signInGoogle();
    if (err) { setAcctError(err); setGoogleBusy(false); return; }
    setAcctDone(true);
    if (fbAuth?.currentUser) await claimOrders(fbAuth.currentUser);
    setGoogleBusy(false);
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
                          {i.billing === "monthly" ? "Monthly retainer" : "Full payment upfront"}
                        </span>
                      </div>
                      <span className="font-display font-bold">
                        {formatMoney((i.unitPrice + i.addons.reduce((s, a) => s + a.price, 0)) * (i.rush ? 1.25 : 1), currency)}
                      </span>
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

        {/* STEP 2 — client information (the full project brief comes after payment) */}
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
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="f-extra">Anything we should know? <span className="text-[var(--muted)]">(optional)</span></label>
                <textarea id="f-extra" rows={2} className={inputCls} value={details.extra} onChange={set("extra")} placeholder="Quick notes only — your full project brief comes right after payment." />
              </div>
            </div>
            {items.some((i) => isIntakePackage(i.serviceSlug)) && (
              <p className="mt-5 border border-[var(--dept)] px-4 py-3 font-meta text-[10px]" style={{ background: "var(--dept-soft)" }}>
                ✓ GOALS, PAGES, COLOURS &amp; STYLE come next — your website project brief opens right after payment, prefilled with these details. It doubles as your signed project agreement.
              </p>
            )}
            {user && (
              <label className="mt-5 flex items-center gap-3 cursor-pointer text-[13px]">
                <input type="checkbox" className="w-4 h-4 accent-[var(--dept)]" checked={saveDetails} onChange={(e) => setSaveDetails(e.target.checked)} />
                Save these details to my account — prefill checkout and project forms next time
              </label>
            )}
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
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation();
                setDragActive(false);
                onFiles(e.dataTransfer.files);
              }}
              className={`mt-6 w-full border border-dashed px-6 py-14 text-center transition-colors ${
                dragActive
                  ? "border-[var(--dept)] bg-[var(--dept-soft)] shadow-[inset_0_0_0_1px_var(--dept)]"
                  : "border-[var(--line-strong)] hover:border-[var(--dept)] hover:bg-[var(--dept-soft)]"
              }`}
              aria-label="Drop files here or browse"
            >
              <span className="font-display text-lg font-bold uppercase block">
                {dragActive ? "Release to add files" : "Drop files or browse"}
              </span>
              <span className="font-meta text-[10px] text-[var(--muted)]">Drag &amp; drop works here · Stored securely · linked to your project</span>
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
              <span className="idx">/order-summary</span>
              <div className="mt-4 border border-[var(--line)] p-6 flex flex-col gap-4" style={{ background: "var(--panel)" }}>
                <div>
                  <h3 className="font-display text-base font-bold uppercase">Payment Breakdown</h3>
                  <p className="font-meta text-[9px] text-[var(--muted)] mt-1">100% full payment upfront · instant access & kickoff</p>
                </div>
                <div className="flex flex-col gap-2 rule-t pt-4 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--muted)]">Subtotal</span><span>{formatMoney(subtotal, currency)}</span></div>
                  {discount > 0 && <div className="flex justify-between dept-accent"><span>Discount</span><span>−{formatMoney(discount, currency)}</span></div>}
                  <div className="flex justify-between font-display text-lg font-bold rule-t pt-2 mt-1">
                    <span>Total Due Now</span>
                    <span className="dept-accent">{formatMoney(total, currency)}</span>
                  </div>
                </div>
                <div className="rule-t pt-3 flex flex-col gap-1.5 font-meta text-[9.5px] text-[var(--muted)]">
                  <p className="flex items-center gap-2"><span className="dept-accent">✓</span> Instant order confirmation & receipt</p>
                  <p className="flex items-center gap-2"><span className="dept-accent">✓</span> Immediate access to digital files & editor</p>
                  <p className="flex items-center gap-2"><span className="dept-accent">✓</span> Direct kickoff & project onboarding</p>
                </div>
              </div>
            </div>
            <div>
              <span className="idx">/provider</span>
              <div className="mt-4 border border-[var(--line-strong)] p-6" style={{ background: "var(--panel)" }}>
                <div className="flex justify-between items-baseline">
                  <span className="text-[var(--muted)] text-sm">Total Due Today</span>
                  <span className="font-display text-3xl font-bold">{formatMoney(dueToday, currency)}</span>
                </div>
                <div className="mt-6 flex flex-col gap-2">
                  {(!details.name.trim() || !/.+@.+\..+/.test(details.email)) && (
                    <button
                      onClick={() => setStep(1)}
                      className="border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-4 py-3 text-left text-[12px] font-medium"
                    >
                      ⚠ Add your name &amp; email first — we need them to deliver your order and receipt. <span className="underline font-bold">Fill in details →</span>
                    </button>
                  )}
                  {activeProviders().map((p) => (
                    <button key={p.id} disabled={paying} onClick={pay} className="btn btn-dept justify-center disabled:opacity-60">
                      {paying ? "Processing…" : `Pay with ${p.name}`} <span className="btn-arrow" aria-hidden>→</span>
                    </button>
                  ))}
                </div>
                {payError && <p className="font-meta text-[10px] text-red-600 mt-3" role="alert">{payError}</p>}
                <p className="font-meta text-[8.5px] text-[var(--muted)] mt-5 leading-relaxed">
                  Cards are processed securely by the payment provider — we never see or store card data. 256-bit SSL encryption.
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
              Payment received in full. Your project is in the queue — next step: complete your project questionnaire.
            </p>
            <div className="mt-8 max-w-sm mx-auto text-left">
              {["Confirmation email with your receipt", "Project questionnaire link", "Onboarding instructions + file upload access", "Kickoff scheduling within 1 business day"].map((s, i) => (
                <div key={s} className="file-row grid-cols-[36px_1fr] !py-3 !cursor-default">
                  <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-sm">{s}</span>
                </div>
              ))}
            </div>
            {/* website packages: the project brief is the next step (also the agreement) */}
            {intakePkg && (
              <div className="mt-8 max-w-sm mx-auto border border-[var(--dept)] p-5 text-left" style={{ background: "var(--dept-soft)" }}>
                <p className="font-meta text-[9px] dept-accent">NEXT STEP — WEBSITE PROJECT BRIEF</p>
                <p className="text-sm mt-1">
                  Tell the studio about your {intakePkg.name.toLowerCase()} — goals, pages, colours and files.
                  It doubles as your signed project agreement.
                </p>
                <button className="btn btn-dept w-full justify-center mt-4" onClick={() => setIntakeOpen(true)}>
                  Complete your brief <span className="btn-arrow" aria-hidden>→</span>
                </button>
                <p className="font-meta text-[8.5px] text-[var(--muted)] mt-2">Autosaves · about 5 minutes · also waiting in your client portal</p>
              </div>
            )}

            <p className="font-meta text-[10px] text-[var(--muted)] mt-8">Questions? {CONTACT.phone} · {CONTACT.email}</p>

            {/* Enhancement 4: Magic link notice */}
            {magicSent && (
              <div className="mt-6 max-w-sm mx-auto border border-[var(--dept)] p-4 text-left" style={{ background: "var(--dept-soft)" }}>
                <p className="font-meta text-[9px] dept-accent mb-1">✉ MAGIC ACCESS LINK SENT</p>
                <p className="text-sm">We emailed a 1-click sign-in link to <strong>{details.email}</strong> — click it to access your designs & order history instantly, no password needed.</p>
              </div>
            )}

            {/* client account creation / portal access */}
            {firebaseReady && !user && !acctDone && (
              <div className="mt-8 max-w-sm mx-auto border border-[var(--line)] p-6 text-left">
                <span className="idx">/client-portal</span>
                <p className="font-display text-base font-bold uppercase mt-2">Track this project</p>
                <p className="text-[13px] text-[var(--muted)] mt-1">Create your account to track orders, access files, and open templates in the editor.</p>

                {/* Enhancement 2: Google 1-tap sign-in */}
                <button
                  disabled={googleBusy}
                  onClick={signInWithGoogle}
                  className="mt-4 w-full flex items-center justify-center gap-3 border border-[var(--line)] bg-white text-zinc-800 px-4 py-3 text-sm font-medium hover:border-[var(--dept)] transition-colors disabled:opacity-60"
                >
                  <GoogleIcon /> {googleBusy ? "Signing in…" : "Continue with Google"}
                </button>

                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-[var(--line)]" />
                  <span className="font-meta text-[9px] text-[var(--muted)]">OR SET A PASSWORD</span>
                  <div className="flex-1 h-px bg-[var(--line)]" />
                </div>

                <label className="font-meta text-[10px] text-[var(--muted)] block mb-1.5" htmlFor="acct-email">Email</label>
                <input id="acct-email" className="w-full bg-transparent border border-[var(--line)] px-4 py-3 text-sm" value={details.email} readOnly />
                <label className="font-meta text-[10px] text-[var(--muted)] block mt-3 mb-1.5" htmlFor="acct-pass">Choose a password</label>
                <div className="relative flex items-center">
                  <input
                    id="acct-pass"
                    type={showAcctPass ? "text" : "password"}
                    className="w-full bg-transparent border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--dept)] pr-12"
                    value={acctPass}
                    onChange={(e) => setAcctPass(e.target.value)}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <PasswordEyeToggle
                      show={showAcctPass}
                      onToggle={() => setShowAcctPass((v) => !v)}
                    />
                  </div>
                </div>
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

      {/* website intake brief — pops automatically after a website purchase */}
      {intakeOpen && intakePkg && (
        <IntakeWizard
          user={user}
          pkg={intakePkg}
          orderId={intakeOrderId}
          prefill={{ name: details.name, email: details.email, business: details.company }}
          order={intakeOrderCtx}
          profile={savedProfile}
          priceFor={priceFor}
          onClose={() => setIntakeOpen(false)}
        />
      )}
    </section>
  );
}
