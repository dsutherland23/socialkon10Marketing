import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import { formatMoney } from "../lib/data";
import { useMoney } from "../lib/money";
import { track } from "../lib/seo";
import { sendEmail, intakeReceivedEmail, adminIntakeEmail } from "../lib/email";
import {
  CONTRACT_VERSION,
  EMPTY_PROFILE,
  INTAKE_ADDONS,
  RECURRING_SERVICES,
  buildContractText,
  buildScopeSections,
  computeEstimate,
  computeLeadScore,
  coveredByOrder,
  detectScopeShift,
  fieldVisible,
  intakePackageFor,
  intakeSteps,
  recommendedAddons,
  resolveIntakePrefill,
  saveIntake,
  saveProfile,
  uploadIntakeAsset,
  validateIntakeFile,
  type ClientProfile,
  type IntakeField,
  type IntakePackage,
  type IntakeRecord,
  type PaymentLedger,
} from "../lib/intake";

/* ------------------------------------------------------------------
   WEBSITE INTAKE WIZARD (spec v2.0 §ux)
   Multi-step, mobile-first, autosaving project brief that doubles as
   the signed project agreement between the client and Socialkon10.
   Steps: Business → Project → Design → Add-ons → Review & Sign → Done
------------------------------------------------------------------- */

const inputCls = "w-full bg-transparent border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--dept)] transition-colors";
const labelCls = "font-meta text-[10px] text-[var(--muted)] block mb-1.5";

const COLOR_PRESETS: { name: string; colors: string[] }[] = [
  { name: "Ocean Trust", colors: ["#0B3C5D", "#1D70A2", "#F2A541"] },
  { name: "Bold Sunset", colors: ["#E4572E", "#F3A712", "#29335C"] },
  { name: "Fresh Market", colors: ["#2E7D32", "#8BC34A", "#FFEB3B"] },
  { name: "Luxe Noir", colors: ["#111111", "#C9A227", "#F5F1E8"] },
  { name: "Island Vibe", colors: ["#0077B6", "#00B4D8", "#FFB703"] },
  { name: "Berry Punch", colors: ["#6A0572", "#AB83A1", "#F15BB5"] },
];

/** What the wizard needs to know about the paid order (no re-asking, no double-billing). */
export interface IntakeOrderContext {
  id: string;
  amountPaid: number;          // USD received with the order
  packageUnitPrice: number;    // USD the website package line itself cost
  addonNames: string[];        // configurator add-on names already purchased
  details?: Record<string, string>;
  files?: { name: string; size: number }[];
}

export interface IntakeWizardProps {
  user: User | null;
  pkg: IntakePackage;
  orderId?: string | null;
  existing?: IntakeRecord | null;   // resume a draft, or view a submitted brief
  prefill?: { name?: string; email?: string; business?: string };
  order?: IntakeOrderContext | null;
  profile?: ClientProfile | null;
  priceFor?: (slug: string) => number;   // live CMS-aware package prices
  onClose: () => void;
  onSubmitted?: (rec: { id: string }) => void;
}

type Answers = Record<string, string | string[]>;

export function IntakeWizard({ user, pkg, orderId = null, existing = null, prefill, order = null, profile = null, priceFor, onClose, onSubmitted }: IntakeWizardProps) {
  const readOnly = !!existing && existing.status !== "draft";
  const money = useMoney();
  const steps = useMemo(() => intakeSteps(pkg), [pkg]);
  const TOTAL = steps.length + 2; // + add-ons + review

  // zero-repeat: resolve everything the system already knows (order → profile → account)
  const pre = useMemo(
    () => resolveIntakePrefill({ orderDetails: order?.details, profile, user }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const prefilledIds = useMemo(() => new Set(pre.prefilled), [pre]);

  const [stepIdx, setStepIdx] = useState(() => (existing && existing.status === "draft" ? Math.min(existing.step, TOTAL - 2) : 0));
  const [answers, setAnswers] = useState<Answers>(() => ({
    ...pre.answers,
    business_name: prefill?.business || pre.answers.business_name || "",
    contact_name: prefill?.name || pre.answers.contact_name || user?.displayName || "",
    email: prefill?.email || pre.answers.email || user?.email || "",
    website_type: pkg.defaultType,
    ...(existing?.answers ?? {}),
  }));
  const [colors, setColors] = useState<string[]>(() => {
    const raw = existing?.answers.brand_colors_hex;
    return Array.isArray(raw) ? (raw as string[]) : [];
  });
  const [addons, setAddons] = useState<string[]>(existing?.selectedAddons ?? []);
  const [recurring, setRecurring] = useState<string[]>(existing?.selectedRecurring ?? []);
  const [assets, setAssets] = useState(existing?.assets ?? []);
  const [intakeId, setIntakeId] = useState<string | null>(existing?.id ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [shiftAck, setShiftAck] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragKind, setDragKind] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<string>("asset");
  const scrollRef = useRef<HTMLDivElement>(null);

  const websiteType = String(answers.website_type ?? pkg.defaultType);
  const recommended = useMemo(() => recommendedAddons(pkg, websiteType), [pkg, websiteType]);

  /* ----- scope-shift engine: paid package vs chosen website_type ----- */
  const shift = useMemo(
    () => detectScopeShift(pkg.slug, websiteType, priceFor, order?.packageUnitPrice),
    [pkg.slug, websiteType, priceFor, order],
  );
  // upgrades & custom-quote types: estimate + scope describe the REQUIRED package
  const scopePkg = useMemo(
    () => (shift && shift.direction !== "downgrade" ? intakePackageFor(shift.requiredPackage) : pkg),
    [shift, pkg],
  );
  const covered = useMemo(() => coveredByOrder(order?.addonNames ?? []), [order]);

  const estimate = useMemo(() => computeEstimate(scopePkg, addons, recurring), [scopePkg, addons, recurring]);
  const addonsTotal = useMemo(
    () => addons.reduce((s, id) => s + (INTAKE_ADDONS.find((a) => a.id === id)?.price ?? 0), 0),
    [addons],
  );
  const scope = useMemo(() => buildScopeSections(pkg, answers, addons, recurring, scopePkg), [pkg, answers, addons, recurring, scopePkg]);

  /* ----- payment ledger: paid / scope difference / estimated balance ----- */
  const ledger = useMemo<PaymentLedger | null>(() => {
    if (!order) return null;
    const difference = shift?.direction === "upgrade" ? shift.difference : 0;
    return {
      paid: order.amountPaid,
      difference,
      balance: difference + addonsTotal,
      shiftLabel: shift?.direction === "upgrade" ? `${shift.paidPackageName} → ${shift.requiredPackageName}` : undefined,
    };
  }, [order, shift, addonsTotal]);

  const contractText = useMemo(
    () => buildContractText(scope, estimate, String(answers.contact_name ?? ""), String(answers.business_name ?? ""), ledger),
    [scope, estimate, answers.contact_name, answers.business_name, ledger],
  );

  /* ---------- autosave (spec §ux autosave + save_and_continue) ---------- */
  const persist = useCallback(
    async (status: "draft" | "submitted", step: number, contract?: IntakeRecord["contract"]) => {
      const lead = computeLeadScore(answers, addons, recurring);
      const id = await saveIntake({
        id: intakeId ?? undefined,
        uid: user?.uid ?? existing?.uid ?? null,
        email: String(answers.email ?? prefill?.email ?? user?.email ?? ""),
        orderId: orderId ?? existing?.orderId ?? null,
        packageSlug: pkg.slug,
        packageName: pkg.name,
        status,
        step,
        answers: { ...answers, brand_colors_hex: colors },
        selectedAddons: addons,
        selectedRecurring: recurring,
        estimate: { ...estimate, currency: "USD" },
        scopeShift: shift
          ? { ...shift, ...(shiftAck ? { acknowledgedAt: new Date().toISOString() } : {}) }
          : null,
        leadScore: lead.score,
        leadCategory: lead.category,
        assets,
        contract: contract ?? existing?.contract ?? null,
        ...(status === "submitted" ? { submittedAt: new Date().toISOString() } : {}),
      });
      setIntakeId(id);
      return id;
    },
    [answers, addons, recurring, assets, colors, estimate, existing, intakeId, orderId, pkg, prefill, user, shift, shiftAck],
  );

  // debounced draft autosave while editing
  const dirty = useRef(false);
  useEffect(() => {
    if (readOnly || done) return;
    if (!dirty.current) return;
    const t = setTimeout(() => {
      void persist("draft", stepIdx);
      dirty.current = false;
    }, 1800);
    return () => clearTimeout(t);
  }, [answers, addons, recurring, colors, assets, stepIdx, persist, readOnly, done]);

  const mark = () => { dirty.current = true; };

  useEffect(() => { track("intake_started", { package: pkg.slug, resumed: !!existing }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- field helpers ---------- */
  const setA = (id: string, v: string | string[]) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    setErrors((e) => ({ ...e, [id]: "" }));
    mark();
  };
  const toggleMulti = (id: string, v: string) => {
    const cur = answers[id];
    const arr = Array.isArray(cur) ? cur : [];
    setA(id, arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const visibleFields = (stepFields: IntakeField[]) => stepFields.filter((f) => fieldVisible(f, answers));

  const validateStep = (idx: number): boolean => {
    if (idx >= steps.length) return true; // add-ons / review have their own gates
    const e: Record<string, string> = {};
    for (const f of visibleFields(steps[idx].fields)) {
      if (!f.required) continue;
      const v = answers[f.id];
      const empty = Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();
      if (empty) e[f.id] = "Required";
      else if (f.kind === "email" && !/.+@.+\..+/.test(String(v))) e[f.id] = "Enter a valid email";
    }
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error("A few required answers are missing on this step.");
      return false;
    }
    return true;
  };

  const goNext = async () => {
    // read-only (signed) briefs: free navigation, no validation, no writes
    if (readOnly) {
      setStepIdx((i) => Math.min(i + 1, TOTAL - 1));
      scrollRef.current?.scrollTo({ top: 0 });
      return;
    }
    if (!validateStep(stepIdx)) return;
    setSaving(true);
    await persist("draft", stepIdx + 1);
    setSaving(false);
    setStepIdx((i) => Math.min(i + 1, TOTAL - 1));
    scrollRef.current?.scrollTo({ top: 0 });
    track("intake_step_complete", { package: pkg.slug, step: stepIdx });
  };
  const goBack = () => { setStepIdx((i) => Math.max(0, i - 1)); scrollRef.current?.scrollTo({ top: 0 }); };

  /* ---------- uploads ---------- */
  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    setUploadError(null);
    let id = intakeId;
    if (!id) { id = await persist("draft", stepIdx); }
    setUploadingKind(pendingKind.current);
    for (const f of Array.from(list)) {
      const err = validateIntakeFile(f);
      if (err) { setUploadError(err); continue; }
      const asset = await uploadIntakeAsset(id, f, pendingKind.current);
      setAssets((xs) => [...xs, asset]);
    }
    setUploadingKind(null);
    mark();
  };
  const pickFiles = (kind: string) => {
    pendingKind.current = kind;
    fileRef.current?.click();
  };

  /* ---------- submit (sign the agreement) ---------- */
  const signatureOk = signedName.trim().length >= 3;
  // a paid client who chose a higher tier must acknowledge the scope change before signing
  const needsShiftAck = !!order && shift?.direction === "upgrade" && !readOnly;
  const canSubmit = agreed && signatureOk && !submitting && (!needsShiftAck || shiftAck);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const contract = {
      agreed: true,
      signedName: signedName.trim(),
      signedAt: new Date().toISOString(),
      version: CONTRACT_VERSION,
      scopeText: contractText,
    };
    const id = await persist("submitted", TOTAL - 1, contract);
    setSubmitting(false);
    setDone(true);
    track("intake_submitted", { package: pkg.slug, value: estimate.oneTime, monthly: estimate.monthly, addons: addons.length, scope_shift: shift?.direction ?? "none" });
    toast.success("Project brief submitted — agreement signed.");
    onSubmitted?.({ id });

    // write confirmed details back to the saved profile (one home, kept fresh — never clobbers)
    if (user) {
      const keep = (v: unknown, old: string) => (String(v ?? "").trim() ? String(v ?? "").trim() : old);
      const base = profile ?? { ...EMPTY_PROFILE };
      void saveProfile(user.uid, {
        name: keep(answers.contact_name, base.name),
        company: keep(answers.business_name, base.company),
        email: keep(answers.email, base.email),
        phone: keep(answers.phone, base.phone),
        website: keep(answers.existing_website, base.website),
        industry: keep(answers.industry, base.industry),
        address: base.address, city: base.city, country: base.country,
      });
    }

    // transactional email: client confirmation + studio alert (fire-and-forget)
    const portalUrl = `${window.location.origin}/client`;
    const lead = computeLeadScore(answers, addons, recurring);
    const shiftInfo = shift && order
      ? { direction: shift.direction, summary: `${shift.paidPackageName} → ${shift.requiredPackageName}`, difference: shift.difference }
      : undefined;
    void sendEmail(intakeReceivedEmail({
      to: String(answers.email ?? ""), name: String(answers.contact_name ?? ""),
      packageName: pkg.name, intakeId: id, portalUrl, scopeShift: shiftInfo,
    }));
    void sendEmail(adminIntakeEmail({
      business: String(answers.business_name ?? ""), contact: String(answers.contact_name ?? ""),
      email: String(answers.email ?? ""), packageName: pkg.name, websiteType,
      oneTime: estimate.oneTime, monthly: estimate.monthly,
      leadScore: lead.score, leadCategory: lead.category, intakeId: id,
      adminUrl: `${window.location.origin}/admin`, scopeShift: shiftInfo,
    }));
  };

  const close = async () => {
    if (!readOnly && !done && dirty.current) await persist("draft", stepIdx);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") void close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const stepLabels = [...steps.map((s) => s.title), "Add-ons", "Review & sign"];
  const completedPct = Math.round((stepIdx / (TOTAL - 1)) * 100);

  /* ---------- field renderer ---------- */
  const renderField = (f: IntakeField) => {
    const v = answers[f.id];
    const str = Array.isArray(v) ? "" : String(v ?? "");
    const err = errors[f.id];
    const common = { id: `in-${f.id}`, disabled: readOnly };
    return (
      <div key={f.id} className={f.kind === "textarea" || f.kind === "cards" || f.kind === "multicards" ? "sm:col-span-2" : ""}>
        <label className={labelCls} htmlFor={`in-${f.id}`}>
          {f.label} {f.required && <span className="dept-accent">*</span>}
          {prefilledIds.has(f.id) && str && !readOnly && (
            <span className="dept-accent ml-2 text-[8px]">✓ FROM YOUR ORDER</span>
          )}
        </label>

        {f.kind === "textarea" ? (
          <textarea {...common} rows={3} className={inputCls} value={str} placeholder={f.placeholder}
            onChange={(e) => setA(f.id, e.target.value)} aria-invalid={!!err} />
        ) : f.kind === "select" ? (
          <select {...common} className={inputCls} value={str} onChange={(e) => setA(f.id, e.target.value)} aria-invalid={!!err}>
            <option value="">Select…</option>
            {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : f.kind === "cards" ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2" role="radiogroup" aria-label={f.label}>
            {f.options?.map((o) => {
              const active = str === o.value;
              return (
                <button key={o.value} type="button" role="radio" aria-checked={active} disabled={readOnly}
                  onClick={() => setA(f.id, o.value)}
                  className="px-4 py-3 text-left border transition-colors"
                  style={active ? { borderColor: "var(--dept)", background: "var(--dept-soft)" } : { borderColor: "var(--line)" }}>
                  <span className="font-display text-[13px] font-bold uppercase block">{o.label}</span>
                  {o.desc && <span className="font-meta text-[9px] text-[var(--muted)] block mt-0.5">{o.desc}</span>}
                </button>
              );
            })}
          </div>
        ) : f.kind === "multicards" ? (
          <div className="flex flex-wrap gap-2">
            {f.options?.map((o) => {
              const arr = Array.isArray(v) ? v : [];
              const active = arr.includes(o.value);
              return (
                <button key={o.value} type="button" aria-pressed={active} disabled={readOnly}
                  onClick={() => toggleMulti(f.id, o.value)}
                  className="font-meta text-[10px] px-3 py-2 border transition-colors"
                  style={active ? { borderColor: "var(--dept)", background: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}>
                  {o.label}
                </button>
              );
            })}
          </div>
        ) : (
          <input {...common} type={f.kind === "email" ? "email" : f.kind === "tel" ? "tel" : f.kind === "url" ? "url" : "text"}
            className={inputCls} value={str} placeholder={f.placeholder}
            onChange={(e) => setA(f.id, e.target.value)} aria-invalid={!!err} autoComplete="off" />
        )}

        {f.help && <p className="font-meta text-[9px] text-[var(--muted)] mt-1">{f.help}</p>}
        {err && <p className="font-meta text-[10px] text-red-600 mt-1" role="alert">{err}</p>}
      </div>
    );
  };

  /* ============================ UI ============================ */
  return (
    <div className="fixed inset-0 z-[80] flex items-stretch sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Website project brief">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default" onClick={() => void close()} aria-label="Close brief" />
      <div className="relative w-full max-w-3xl max-h-full sm:max-h-[92vh] flex flex-col border border-[var(--line-strong)] shadow-2xl" style={{ background: "var(--bg)" }}>

        {/* header + progress */}
        <div className="px-5 sm:px-8 pt-5 pb-4 border-b border-[var(--line)] shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="idx">/project-brief · {pkg.name}</span>
              <p className="font-meta text-[9px] text-[var(--muted)] mt-1">
                {done ? "Submitted" : readOnly ? "Signed brief — read only" : "Autosaves as you go · about 5 minutes"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!done && !readOnly && (
                <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors underline" onClick={() => void close()}>
                  Save &amp; finish later
                </button>
              )}
              <button className="font-meta text-[10px] px-3 py-1.5 border border-[var(--line)] hover:border-[var(--dept)] transition-colors" onClick={() => void close()} aria-label="Close">
                {done || readOnly ? "CLOSE" : "✕"}
              </button>
            </div>
          </div>
          {!done && (
            <>
              <div className="mt-4 h-1 w-full" style={{ background: "var(--line)" }} role="progressbar" aria-valuenow={completedPct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full transition-all duration-300" style={{ width: `${completedPct}%`, background: "var(--dept)" }} />
              </div>
              <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-meta text-[9px] text-[var(--muted)]">
                {stepLabels.map((l, i) => (
                  <li key={l} style={i === stepIdx ? { color: "var(--dept)" } : i < stepIdx ? { color: "var(--ink)" } : {}}>
                    {i < stepIdx ? "✓ " : `${i + 1}. `}{l}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        {/* body */}
        <div ref={scrollRef} className="overflow-y-auto px-5 sm:px-8 py-6 grow">

          {/* DONE */}
          {done && (
            <div className="text-center py-8">
              <span className="idx">/brief-{intakeId?.slice(-6)}</span>
              <h2 className="display-sub mt-4">Brief received. Agreement signed.</h2>
              <p className="mt-4 text-sm text-[var(--muted)] max-w-md mx-auto leading-relaxed">
                Thank you — your project brief and signed agreement are with the studio.
                We review every brief personally and reply with your confirmed scope and next steps within 1 business day.
              </p>
              <div className="mt-8 max-w-sm mx-auto text-left">
                {["Studio reviews your brief & signed scope", "You receive the final proposal / confirmation", "Kickoff call scheduled — build begins"].map((s, i) => (
                  <div key={s} className="file-row grid-cols-[36px_1fr] !py-3 !cursor-default">
                    <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-sm">{s}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-dept mt-8" onClick={() => void close()}>Done <span className="btn-arrow" aria-hidden>→</span></button>
            </div>
          )}

          {/* QUESTION STEPS */}
          {!done && stepIdx < steps.length && (
            <div>
              <h2 className="display-sub">{steps[stepIdx].title}</h2>
              <p className="text-sm text-[var(--muted)] mt-2 mb-6">{steps[stepIdx].sub}</p>

              {/* zero-repeat banner: prefilled from the order / account — confirm, don't retype */}
              {steps[stepIdx].id === "business" && prefilledIds.size > 0 && !readOnly && (
                <p className="mb-5 border border-[var(--dept)] px-4 py-3 font-meta text-[10px]" style={{ background: "var(--dept-soft)" }} data-prefill-banner>
                  ✓ WE PREFILLED WHAT WE ALREADY KNOW from your order and account — confirm or adjust below. Nothing to retype.
                </p>
              )}

              <div className="grid sm:grid-cols-2 gap-5">
                {visibleFields(steps[stepIdx].fields).map(renderField)}
              </div>

              {/* scope-shift card: surface the price implication at the moment of choice */}
              {steps[stepIdx].id === "project" && shift && (
                <div
                  className={`mt-6 border px-5 py-4 ${shift.direction === "upgrade" ? "border-amber-500/50 bg-amber-500/10" : "border-[var(--dept)]"}`}
                  style={shift.direction !== "upgrade" ? { background: "var(--dept-soft)" } : undefined}
                  role="status"
                  data-scope-shift={shift.direction}
                >
                  {shift.direction === "upgrade" && (
                    <>
                      <p className="font-meta text-[10px] font-bold text-amber-700 dark:text-amber-300">HEADS-UP — THIS CHANGES YOUR PROJECT SCOPE</p>
                      <p className="text-sm mt-2 leading-relaxed">
                        A <strong>{websiteType}</strong> is scoped as our <strong>{shift.requiredPackageName} ({money(shift.requiredBase)})</strong>.
                        {order ? (
                          <> You've already paid <strong>{money(shift.paidBase)}</strong> for the {shift.paidPackageName} — the <strong>{money(shift.difference)} difference</strong> will be itemised in your final proposal. <strong>Nothing is charged now</strong>, and your payment is credited in full.</>
                        ) : (
                          <> Your estimate on the next steps now reflects that package.</>
                        )}
                      </p>
                      {order && (
                        <p className="font-meta text-[9px] text-[var(--muted)] mt-2">
                          Prefer to stay with your paid package? Re-select {pkg.defaultType} above.
                        </p>
                      )}
                    </>
                  )}
                  {shift.direction === "downgrade" && (
                    <>
                      <p className="font-meta text-[10px] font-bold dept-accent">ALREADY COVERED BY YOUR PACKAGE</p>
                      <p className="text-sm mt-2 leading-relaxed">
                        Your paid <strong>{shift.paidPackageName}</strong> already covers a {websiteType.toLowerCase()} build.
                        The studio will confirm added value (extra pages or features) or a credit in your proposal — payments are never auto-refunded.
                      </p>
                    </>
                  )}
                  {shift.direction === "custom-quote" && (
                    <>
                      <p className="font-meta text-[10px] font-bold dept-accent">CUSTOM-SCOPED PROJECT</p>
                      <p className="text-sm mt-2 leading-relaxed">
                        {websiteType === "Custom" ? "A unique build" : `A ${websiteType.toLowerCase()}`} is scoped individually with the studio.
                        {order ? <> Your paid <strong>{money(shift.paidBase)}</strong> is credited in full toward the final proposal.</> : null}
                        {" "}The estimate shown is indicative — the final proposal governs scope and price.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* design step extras: colour picker + uploads */}
              {steps[stepIdx].id === "design" && (
                <>
                  <div className="mt-8 pt-6 rule-t">
                    <span className={labelCls}>Colour scheme — tap to refine (up to 4)</span>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      {colors.map((c, i) => (
                        <div key={`${c}-${i}`} className="relative group">
                          <input type="color" value={c} disabled={readOnly} aria-label={`Colour ${i + 1}`}
                            onChange={(e) => { setColors((xs) => xs.map((x, j) => (j === i ? e.target.value : x))); mark(); }}
                            className="w-12 h-12 border border-[var(--line-strong)] cursor-pointer bg-transparent p-0.5" />
                          {!readOnly && (
                            <button type="button" aria-label={`Remove colour ${i + 1}`}
                              onClick={() => { setColors((xs) => xs.filter((_, j) => j !== i)); mark(); }}
                              className="absolute -top-2 -right-2 w-5 h-5 text-[10px] leading-none border border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                          )}
                        </div>
                      ))}
                      {!readOnly && colors.length < 4 && (
                        <button type="button" onClick={() => { setColors((xs) => [...xs, "#111111"]); mark(); }}
                          className="w-12 h-12 border border-dashed border-[var(--line-strong)] font-meta text-[10px] text-[var(--muted)] hover:border-[var(--dept)] hover:text-[var(--dept)] transition-colors">
                          + ADD
                        </button>
                      )}
                      {colors.length > 0 && (
                        <span className="font-meta text-[9px] text-[var(--muted)]">{colors.join("  ")}</span>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {COLOR_PRESETS.map((p) => (
                          <button key={p.name} type="button" title={p.name}
                            onClick={() => { setColors(p.colors.slice(0, 4)); mark(); }}
                            className="flex items-center gap-2 border border-[var(--line)] px-2.5 py-1.5 hover:border-[var(--dept)] transition-colors">
                            <span className="flex">
                              {p.colors.map((c) => <span key={c} className="w-3.5 h-3.5 -ml-0.5 first:ml-0 border border-black/10" style={{ background: c }} />)}
                            </span>
                            <span className="font-meta text-[9px]">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-8 pt-6 rule-t">
                    <span className={labelCls}>Files &amp; materials — logo, photos, brand guide, content docs</span>
                    {(order?.files?.length ?? 0) > 0 && (
                      <div className="mb-3 border border-[var(--line)] px-4 py-3" style={{ background: "var(--panel)" }} data-order-files>
                        <p className="font-meta text-[9px] dept-accent">✓ ALREADY RECEIVED WITH YOUR ORDER</p>
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {order!.files!.map((f, i) => (
                            <li key={`${f.name}-${i}`} className="flex justify-between gap-3 text-[12px]">
                              <span className="truncate">{f.name}</span>
                              <span className="font-meta text-[9px] text-[var(--muted)] whitespace-nowrap">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                            </li>
                          ))}
                        </ul>
                        <p className="font-meta text-[8.5px] text-[var(--muted)] mt-2">No need to upload these again — add anything new below.</p>
                      </div>
                    )}
                    <div className="grid sm:grid-cols-2 gap-3 mt-2">
                      {[
                        { kind: "logo", title: "Logo & brand assets", sub: "Logo files, brand guide, fonts" },
                        { kind: "content", title: "Photos & content", sub: "Team photos, product shots, text docs" },
                      ].map((z) => (
                        <button key={z.kind} type="button" disabled={readOnly || uploadingKind !== null}
                          onClick={() => pickFiles(z.kind)}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!readOnly) setDragKind(z.kind); }}
                          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!readOnly) setDragKind(z.kind); }}
                          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragKind((k) => (k === z.kind ? null : k)); }}
                          onDrop={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            setDragKind(null);
                            if (readOnly || uploadingKind !== null) return;
                            pendingKind.current = z.kind;
                            void onFiles(e.dataTransfer.files);
                          }}
                          className={`border border-dashed px-5 py-8 text-center transition-colors disabled:opacity-60 ${
                            dragKind === z.kind
                              ? "border-[var(--dept)] bg-[var(--dept-soft)] shadow-[inset_0_0_0_1px_var(--dept)]"
                              : "border-[var(--line-strong)] hover:border-[var(--dept)] hover:bg-[var(--dept-soft)]"
                          }`}>
                          <span className="font-display text-sm font-bold uppercase block">
                            {uploadingKind === z.kind ? "Uploading…" : dragKind === z.kind ? "Release to upload" : z.title}
                          </span>
                          <span className="font-meta text-[9px] text-[var(--muted)]">{z.sub} · drag &amp; drop or click · max 25MB each</span>
                        </button>
                      ))}
                    </div>
                    <input ref={fileRef} type="file" multiple className="sr-only" aria-label="Upload brief files"
                      onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
                    {uploadError && <p className="font-meta text-[10px] text-red-600 mt-2" role="alert">{uploadError}</p>}
                    {assets.length > 0 && (
                      <ul className="mt-4">
                        {assets.map((a, i) => (
                          <li key={`${a.name}-${i}`} className="file-row grid-cols-[1fr_auto_auto] !py-2.5">
                            <span className="text-sm truncate">{a.name}</span>
                            <span className="font-meta text-[9px] text-[var(--muted)]">{a.kind} · {(a.size / 1024 / 1024).toFixed(1)}MB</span>
                            {!readOnly ? (
                              <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)]"
                                onClick={() => { setAssets((xs) => xs.filter((_, j) => j !== i)); mark(); }}
                                aria-label={`Remove ${a.name}`}>Remove</button>
                            ) : <span />}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ADD-ONS (revenue step — recommended first) */}
          {!done && stepIdx === steps.length && (
            <div>
              <h2 className="display-sub">Power it up</h2>
              <p className="text-sm text-[var(--muted)] mt-2 mb-6">
                Optional add-ons for your {websiteType.toLowerCase()}. Recommended picks are based on your answers — skip anything you don't need.
              </p>

              <div className="grid lg:grid-cols-[1fr_280px] gap-8 items-start">
                <div className="flex flex-col gap-6">
                  <div>
                    <span className={labelCls}>One-time add-ons</span>
                    <div className="flex flex-col gap-2">
                      {INTAKE_ADDONS.filter((a) => {
                        if (a.excludeFor?.includes(pkg.slug)) return false;
                        if (a.onlyForTypes && !a.onlyForTypes.includes(websiteType)) return false;
                        return true;
                      }).map((a) => {
                        const active = addons.includes(a.id);
                        const isRec = recommended.includes(a.id);
                        const isCovered = covered.addons.includes(a.id);
                        return (
                          <button key={a.id} type="button" disabled={readOnly || isCovered} aria-pressed={active}
                            onClick={() => { setAddons((xs) => active ? xs.filter((x) => x !== a.id) : [...xs, a.id]); mark(); }}
                            className="flex items-center justify-between gap-4 border px-4 py-3 text-left transition-colors disabled:cursor-default"
                            style={active ? { borderColor: "var(--dept)", background: "var(--dept-soft)" } : { borderColor: "var(--line)" }}>
                            <span className="flex items-start gap-3">
                              <span className="mt-0.5 w-4 h-4 border flex items-center justify-center text-[10px] shrink-0"
                                style={active || isCovered ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line-strong)" }}>
                                {active || isCovered ? "✓" : ""}
                              </span>
                              <span>
                                <span className="font-display text-[13px] font-bold uppercase flex items-center gap-2 flex-wrap">
                                  <span>{a.name}</span>
                                  {isCovered && <span className="dept-bg font-meta text-[8px] px-2 py-0.5" data-covered>In your order ✓</span>}
                                  {!isCovered && isRec && <span className="dept-bg font-meta text-[8px] px-2 py-0.5">Recommended</span>}
                                </span>
                                <span className="font-meta text-[9px] text-[var(--muted)] block mt-0.5">{a.desc}</span>
                              </span>
                            </span>
                            {!isCovered && <span className="font-meta text-[10px] whitespace-nowrap">+{money(a.price)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className={labelCls}>Monthly services — protect &amp; grow after launch</span>
                    <div className="flex flex-col gap-2">
                      {RECURRING_SERVICES.map((r) => {
                        const active = recurring.includes(r.id);
                        const isCovered = covered.recurring.includes(r.id);
                        return (
                          <button key={r.id} type="button" disabled={readOnly || isCovered} aria-pressed={active}
                            onClick={() => { setRecurring((xs) => active ? xs.filter((x) => x !== r.id) : [...xs, r.id]); mark(); }}
                            className="flex items-center justify-between gap-4 border px-4 py-3 text-left transition-colors disabled:cursor-default"
                            style={active ? { borderColor: "var(--dept)", background: "var(--dept-soft)" } : { borderColor: "var(--line)" }}>
                            <span className="flex items-start gap-3">
                              <span className="mt-0.5 w-4 h-4 border flex items-center justify-center text-[10px] shrink-0"
                                style={active || isCovered ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line-strong)" }}>
                                {active || isCovered ? "✓" : ""}
                              </span>
                              <span>
                                <span className="font-display text-[13px] font-bold uppercase flex items-center gap-2 flex-wrap">
                                  <span>{r.name}</span>
                                  {isCovered && <span className="dept-bg font-meta text-[8px] px-2 py-0.5" data-covered>In your order ✓</span>}
                                </span>
                                <span className="font-meta text-[9px] text-[var(--muted)] block mt-0.5">{r.desc}</span>
                              </span>
                            </span>
                            {!isCovered && <span className="font-meta text-[10px] whitespace-nowrap">+{money(r.monthly)}/mo</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* live estimate — a payment ledger when the package is already paid */}
                <aside className="border border-[var(--line-strong)] p-5 lg:sticky lg:top-0" style={{ background: "var(--panel)" }} aria-live="polite">
                  <span className="idx">/estimate</span>
                  {order ? (
                    <div className="mt-3 flex flex-col gap-2 text-sm" data-ledger>
                      <div className="flex justify-between gap-3">
                        <span className="text-[var(--muted)]">Paid with your order</span>
                        <span className="font-display font-bold">{money(order.amountPaid)} ✓</span>
                      </div>
                      {(ledger?.difference ?? 0) > 0 && (
                        <div className="flex justify-between gap-3">
                          <span className="text-amber-700 dark:text-amber-300">Scope upgrade difference</span>
                          <span className="font-display font-bold text-amber-700 dark:text-amber-300" data-ledger-difference>+{money(ledger!.difference)}</span>
                        </div>
                      )}
                      {addonsTotal > 0 && (
                        <div className="flex justify-between gap-3">
                          <span className="text-[var(--muted)]">New add-ons selected</span>
                          <span className="font-display font-bold">+{money(addonsTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-3 rule-t pt-2 mt-1">
                        <span className="font-meta text-[10px]">ESTIMATED BALANCE</span>
                        <span className="font-display-wide text-2xl font-bold" data-ledger-balance>{money(ledger?.balance ?? 0)}</span>
                      </div>
                      <span className="font-meta text-[8.5px] text-[var(--muted)]">payable only on approval of the final proposal — nothing is charged now</span>
                      {estimate.monthly > 0 && (
                        <div className="flex justify-between gap-3 rule-t pt-2 mt-1">
                          <span className="text-[var(--muted)]">Recurring services</span>
                          <span className="font-display font-bold">{money(estimate.monthly)}/mo</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="font-display-wide text-3xl font-bold mt-3" data-estimate-total>{money(estimate.oneTime)}</p>
                      <span className="font-meta text-[9px] text-[var(--muted)]">one-time project estimate{scopePkg.slug !== pkg.slug ? ` — reflects ${scopePkg.name}` : ""}</span>
                      {estimate.monthly > 0 && (
                        <>
                          <p className="font-display text-xl font-bold mt-4">{money(estimate.monthly)}<span className="text-xs font-meta font-normal text-[var(--muted)]">/mo</span></p>
                          <span className="font-meta text-[9px] text-[var(--muted)]">recurring services</span>
                        </>
                      )}
                    </>
                  )}
                  <p className="font-meta text-[8.5px] text-[var(--muted)] mt-4 leading-relaxed">
                    Estimate only — the studio confirms your final quote after reviewing this brief. Third-party fees (hosting, processors, subscriptions) are separate.
                  </p>
                </aside>
              </div>
            </div>
          )}

          {/* REVIEW & SIGN */}
          {!done && stepIdx === steps.length + 1 && (
            <div>
              <h2 className="display-sub">Review &amp; sign</h2>
              <p className="text-sm text-[var(--muted)] mt-2 mb-6">
                This summary is your project scope — signing below makes it the working agreement between you and Socialkon10 Marketing Agency.
              </p>

              <div className="grid lg:grid-cols-2 gap-6 items-start">
                <div className="flex flex-col gap-4">
                  {scope.map((s) => (
                    <div key={s.title} className="border border-[var(--line)] p-5">
                      <span className="font-meta text-[10px] dept-accent">{s.title.toUpperCase()}</span>
                      <ul className="mt-2 flex flex-col gap-1">
                        {s.items.map((i) => <li key={i} className="text-[13px] flex gap-2"><span className="dept-accent">•</span>{i}</li>)}
                      </ul>
                    </div>
                  ))}
                  <div className="border border-[var(--line-strong)] p-5" style={{ background: "var(--panel)" }}>
                    {order ? (
                      <div className="flex flex-col gap-1.5 text-sm" data-review-ledger>
                        <div className="flex justify-between items-baseline">
                          <span className="font-meta text-[10px] text-[var(--muted)]">PAID TO DATE</span>
                          <span className="font-display font-bold">{formatMoney(order.amountPaid, "USD")} ✓</span>
                        </div>
                        {(ledger?.difference ?? 0) > 0 && (
                          <div className="flex justify-between items-baseline">
                            <span className="font-meta text-[10px] text-amber-700 dark:text-amber-300">SCOPE UPGRADE ({ledger!.shiftLabel})</span>
                            <span className="font-display font-bold text-amber-700 dark:text-amber-300">{formatMoney(ledger!.difference, "USD")}</span>
                          </div>
                        )}
                        {addonsTotal > 0 && (
                          <div className="flex justify-between items-baseline">
                            <span className="font-meta text-[10px] text-[var(--muted)]">NEW ADD-ONS</span>
                            <span className="font-display font-bold">{formatMoney(addonsTotal, "USD")}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-baseline rule-t pt-2 mt-1">
                          <span className="font-meta text-[10px]">ESTIMATED BALANCE DUE</span>
                          <span className="font-display text-xl font-bold" data-review-balance>{formatMoney(ledger?.balance ?? 0, "USD")}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-baseline">
                        <span className="font-meta text-[10px] text-[var(--muted)]">ESTIMATED PROJECT VALUE</span>
                        <span className="font-display text-xl font-bold">{formatMoney(estimate.oneTime, "USD")}</span>
                      </div>
                    )}
                    {estimate.monthly > 0 && (
                      <div className="flex justify-between items-baseline mt-1">
                        <span className="font-meta text-[10px] text-[var(--muted)]">RECURRING</span>
                        <span className="font-display text-base font-bold">{formatMoney(estimate.monthly, "USD")}/mo</span>
                      </div>
                    )}
                    <p className="font-meta text-[8.5px] text-[var(--muted)] mt-3 leading-relaxed">
                      Agreement figures are quoted in USD — your currency selector converts for display only. Subject to final project review. Third-party software, hosting, payment processing, subscriptions and external service fees are not included unless specifically stated.
                    </p>
                  </div>
                </div>

                <div>
                  <div className="border border-[var(--line)]">
                    <div className="px-5 py-3 border-b border-[var(--line)] flex justify-between items-center">
                      <span className="font-meta text-[10px]">PROJECT AGREEMENT</span>
                      <span className="font-meta text-[9px] text-[var(--muted)]">{CONTRACT_VERSION}</span>
                    </div>
                    <pre className="px-5 py-4 text-[11px] leading-relaxed whitespace-pre-wrap font-sans max-h-72 overflow-y-auto" tabIndex={0} aria-label="Project agreement text">
                      {contractText}
                    </pre>
                  </div>

                  {!readOnly && (
                    <div className="mt-4 flex flex-col gap-3">
                      {needsShiftAck && (
                        <label className="flex items-start gap-3 cursor-pointer text-[13px] border border-amber-500/50 bg-amber-500/10 px-4 py-3" data-shift-ack>
                          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[var(--dept)]"
                            checked={shiftAck} onChange={(e) => setShiftAck(e.target.checked)} />
                          <span>
                            I understand this brief changes my project scope from <strong>{shift!.paidPackageName}</strong> to <strong>{shift!.requiredPackageName}</strong>,
                            and the <strong>{formatMoney(shift!.difference, "USD")}</strong> difference (plus any new add-ons) will be proposed by the studio before work begins.
                            Nothing is charged without my approval.
                          </span>
                        </label>
                      )}
                      <label className="flex items-start gap-3 cursor-pointer text-[13px]">
                        <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[var(--dept)]"
                          checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                        <span>I have read and agree to the project scope and terms above, and I confirm the information in this brief is accurate.</span>
                      </label>
                      <div>
                        <label className={labelCls} htmlFor="in-signature">Electronic signature — type your full legal name</label>
                        <input id="in-signature" className={inputCls} value={signedName}
                          onChange={(e) => setSignedName(e.target.value)} placeholder="e.g. Jordan Reid" autoComplete="off" />
                        {signedName.trim() && !signatureOk && <p className="font-meta text-[10px] text-red-600 mt-1" role="alert">Type your full name to sign.</p>}
                      </div>
                    </div>
                  )}
                  {readOnly && existing?.contract && (
                    <div className="mt-4 border border-[var(--dept)] p-4" style={{ background: "var(--dept-soft)" }}>
                      <p className="font-meta text-[9px] dept-accent">SIGNED</p>
                      <p className="text-sm mt-1">{existing.contract.signedName} — {new Date(existing.contract.signedAt).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* footer nav */}
        {!done && (
          <div className="px-5 sm:px-8 py-4 border-t border-[var(--line)] flex items-center justify-between gap-3 shrink-0">
            <button className="btn btn-ghost !py-2.5" onClick={goBack} disabled={stepIdx === 0}>
              ← Back
            </button>
            <span className="font-meta text-[9px] text-[var(--muted)] hidden sm:block">
              {saving ? "Saving…" : "Saved automatically"}
            </span>
            {stepIdx < steps.length + 1 ? (
              <button className="btn btn-fill !py-2.5" onClick={() => void goNext()} disabled={saving}>
                {stepIdx === steps.length ? "Review & sign" : "Continue"} <span className="btn-arrow" aria-hidden>→</span>
              </button>
            ) : readOnly ? (
              <span className="font-meta text-[10px] dept-accent">Brief signed &amp; submitted — view only</span>
            ) : (
              <button className="btn btn-dept !py-2.5" onClick={() => void submit()} disabled={!canSubmit}
                title={!agreed ? "Tick the agreement box first" : !signatureOk ? "Type your full name to sign" : undefined}>
                {submitting ? "Submitting…" : "Sign & submit brief"} <span className="btn-arrow" aria-hidden>→</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
