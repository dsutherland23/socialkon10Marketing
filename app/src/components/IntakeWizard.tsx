import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { toast } from "sonner";
import { formatMoney } from "../lib/data";
import { track } from "../lib/seo";
import { sendEmail, intakeReceivedEmail, adminIntakeEmail } from "../lib/email";
import {
  CONTRACT_VERSION,
  INTAKE_ADDONS,
  RECURRING_SERVICES,
  buildContractText,
  buildScopeSections,
  computeEstimate,
  computeLeadScore,
  fieldVisible,
  intakeSteps,
  recommendedAddons,
  saveIntake,
  uploadIntakeAsset,
  validateIntakeFile,
  type IntakeField,
  type IntakePackage,
  type IntakeRecord,
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

export interface IntakeWizardProps {
  user: User | null;
  pkg: IntakePackage;
  orderId?: string | null;
  existing?: IntakeRecord | null;   // resume a draft, or view a submitted brief
  prefill?: { name?: string; email?: string; business?: string };
  onClose: () => void;
  onSubmitted?: (rec: { id: string }) => void;
}

type Answers = Record<string, string | string[]>;

export function IntakeWizard({ user, pkg, orderId = null, existing = null, prefill, onClose, onSubmitted }: IntakeWizardProps) {
  const readOnly = !!existing && existing.status !== "draft";
  const steps = useMemo(() => intakeSteps(pkg), [pkg]);
  const TOTAL = steps.length + 2; // + add-ons + review

  const [stepIdx, setStepIdx] = useState(() => (existing && existing.status === "draft" ? Math.min(existing.step, TOTAL - 2) : 0));
  const [answers, setAnswers] = useState<Answers>(() => ({
    ...(existing?.answers ?? {}),
    business_name: existing?.answers.business_name ?? prefill?.business ?? "",
    contact_name: existing?.answers.contact_name ?? prefill?.name ?? user?.displayName ?? "",
    email: existing?.answers.email ?? prefill?.email ?? user?.email ?? "",
    website_type: existing?.answers.website_type ?? pkg.defaultType,
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
  const [signedName, setSignedName] = useState("");
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragKind, setDragKind] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<string>("asset");
  const scrollRef = useRef<HTMLDivElement>(null);

  const websiteType = String(answers.website_type ?? pkg.defaultType);
  const recommended = useMemo(() => recommendedAddons(pkg, websiteType), [pkg, websiteType]);
  const estimate = useMemo(() => computeEstimate(pkg, addons, recurring), [pkg, addons, recurring]);
  const scope = useMemo(() => buildScopeSections(pkg, answers, addons, recurring), [pkg, answers, addons, recurring]);
  const contractText = useMemo(
    () => buildContractText(scope, estimate, String(answers.contact_name ?? ""), String(answers.business_name ?? "")),
    [scope, estimate, answers.contact_name, answers.business_name],
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
        leadScore: lead.score,
        leadCategory: lead.category,
        assets,
        contract: contract ?? existing?.contract ?? null,
        ...(status === "submitted" ? { submittedAt: new Date().toISOString() } : {}),
      });
      setIntakeId(id);
      return id;
    },
    [answers, addons, recurring, assets, colors, estimate, existing, intakeId, orderId, pkg, prefill, user],
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
  const canSubmit = agreed && signatureOk && !submitting;

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
    track("intake_submitted", { package: pkg.slug, value: estimate.oneTime, monthly: estimate.monthly, addons: addons.length });
    toast.success("Project brief submitted — agreement signed.");
    onSubmitted?.({ id });

    // transactional email: client confirmation + studio alert (fire-and-forget)
    const portalUrl = `${window.location.origin}/client`;
    const lead = computeLeadScore(answers, addons, recurring);
    void sendEmail(intakeReceivedEmail({
      to: String(answers.email ?? ""), name: String(answers.contact_name ?? ""),
      packageName: pkg.name, intakeId: id, portalUrl,
    }));
    void sendEmail(adminIntakeEmail({
      business: String(answers.business_name ?? ""), contact: String(answers.contact_name ?? ""),
      email: String(answers.email ?? ""), packageName: pkg.name, websiteType,
      oneTime: estimate.oneTime, monthly: estimate.monthly,
      leadScore: lead.score, leadCategory: lead.category, intakeId: id,
      adminUrl: `${window.location.origin}/admin`,
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
              <div className="grid sm:grid-cols-2 gap-5">
                {visibleFields(steps[stepIdx].fields).map(renderField)}
              </div>

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
                        return (
                          <button key={a.id} type="button" disabled={readOnly} aria-pressed={active}
                            onClick={() => { setAddons((xs) => active ? xs.filter((x) => x !== a.id) : [...xs, a.id]); mark(); }}
                            className="flex items-center justify-between gap-4 border px-4 py-3 text-left transition-colors"
                            style={active ? { borderColor: "var(--dept)", background: "var(--dept-soft)" } : { borderColor: "var(--line)" }}>
                            <span className="flex items-start gap-3">
                              <span className="mt-0.5 w-4 h-4 border flex items-center justify-center text-[10px] shrink-0"
                                style={active ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line-strong)" }}>
                                {active ? "✓" : ""}
                              </span>
                              <span>
                                <span className="font-display text-[13px] font-bold uppercase flex items-center gap-2 flex-wrap">
                                  <span>{a.name}</span>
                                  {isRec && <span className="dept-bg font-meta text-[8px] px-2 py-0.5">Recommended</span>}
                                </span>
                                <span className="font-meta text-[9px] text-[var(--muted)] block mt-0.5">{a.desc}</span>
                              </span>
                            </span>
                            <span className="font-meta text-[10px] whitespace-nowrap">+{formatMoney(a.price, "USD")}</span>
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
                        return (
                          <button key={r.id} type="button" disabled={readOnly} aria-pressed={active}
                            onClick={() => { setRecurring((xs) => active ? xs.filter((x) => x !== r.id) : [...xs, r.id]); mark(); }}
                            className="flex items-center justify-between gap-4 border px-4 py-3 text-left transition-colors"
                            style={active ? { borderColor: "var(--dept)", background: "var(--dept-soft)" } : { borderColor: "var(--line)" }}>
                            <span className="flex items-start gap-3">
                              <span className="mt-0.5 w-4 h-4 border flex items-center justify-center text-[10px] shrink-0"
                                style={active ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line-strong)" }}>
                                {active ? "✓" : ""}
                              </span>
                              <span>
                                <span className="font-display text-[13px] font-bold uppercase">{r.name}</span>
                                <span className="font-meta text-[9px] text-[var(--muted)] block mt-0.5">{r.desc}</span>
                              </span>
                            </span>
                            <span className="font-meta text-[10px] whitespace-nowrap">+{formatMoney(r.monthly, "USD")}/mo</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* live estimate */}
                <aside className="border border-[var(--line-strong)] p-5 lg:sticky lg:top-0" style={{ background: "var(--panel)" }} aria-live="polite">
                  <span className="idx">/estimate</span>
                  <p className="font-display-wide text-3xl font-bold mt-3">{formatMoney(estimate.oneTime, "USD")}</p>
                  <span className="font-meta text-[9px] text-[var(--muted)]">one-time project estimate</span>
                  {estimate.monthly > 0 && (
                    <>
                      <p className="font-display text-xl font-bold mt-4">{formatMoney(estimate.monthly, "USD")}<span className="text-xs font-meta font-normal text-[var(--muted)]">/mo</span></p>
                      <span className="font-meta text-[9px] text-[var(--muted)]">recurring services</span>
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
                    <div className="flex justify-between items-baseline">
                      <span className="font-meta text-[10px] text-[var(--muted)]">ESTIMATED PROJECT VALUE</span>
                      <span className="font-display text-xl font-bold">{formatMoney(estimate.oneTime, "USD")}</span>
                    </div>
                    {estimate.monthly > 0 && (
                      <div className="flex justify-between items-baseline mt-1">
                        <span className="font-meta text-[10px] text-[var(--muted)]">RECURRING</span>
                        <span className="font-display text-base font-bold">{formatMoney(estimate.monthly, "USD")}/mo</span>
                      </div>
                    )}
                    <p className="font-meta text-[8.5px] text-[var(--muted)] mt-3 leading-relaxed">
                      Subject to final project review. Third-party software, hosting, payment processing, subscriptions and external service fees are not included unless specifically stated.
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
