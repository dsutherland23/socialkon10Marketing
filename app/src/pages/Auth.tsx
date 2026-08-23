import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useSEO } from "../lib/seo";
import { firebaseReady } from "../lib/firebase";

/* ------------------------------------------------------------------
   AUTH PAGE — 2026 Design
   Routes: /auth?mode=signin | signup | reset | verify
   Used by: customers creating accounts, accessing client portal.
   Admin auth is handled separately via /admin with its own gate.
------------------------------------------------------------------- */

type Mode = "signin" | "signup" | "reset" | "verify";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

const inputCls = `
  w-full rounded-xl border border-white/10 bg-white/5
  px-4 py-3 text-sm text-white placeholder:text-zinc-500
  outline-none focus:border-cyan-500/60 focus:bg-white/8
  transition-all duration-200 backdrop-blur-sm
`.trim();
const labelCls = "block text-[11px] font-medium text-zinc-400 mb-1.5 tracking-wide";
const errCls = "text-[11px] text-red-400 mt-1";
const noticeCls = "text-[11px] text-cyan-400 mt-1";

export default function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = (searchParams.get("mode") ?? "signin") as Mode;
  const redirectTo = searchParams.get("redirect") ?? "/client";

  const { user, loading, isAdmin, emailVerified, signIn, signUp, signInGoogle, resetPassword, resendVerification, signOut } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [passShow, setPassShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useSEO({
    title: mode === "signup" ? "Create Account — Social Kon10" : "Sign In — Social Kon10",
    description: "Access your client portal, track projects, manage your designs.",
  });

  // Redirect if already signed in + verified (or admin)
  useEffect(() => {
    if (!loading && user && (emailVerified || isAdmin || !firebaseReady)) {
      navigate(isAdmin ? "/admin" : redirectTo, { replace: true });
    }
  }, [user, loading, emailVerified, isAdmin, navigate, redirectTo]);

  const setMode = (m: Mode) => {
    setError(null); setNotice(null);
    setSearchParams({ mode: m, ...(redirectTo !== "/client" ? { redirect: redirectTo } : {}) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setNotice(null);
    if (!email.trim()) { setError("Please enter your email."); return; }
    if (mode !== "reset" && pass.length < 6) { setError("Password must be at least 6 characters."); return; }

    setBusy(true);
    if (mode === "reset") {
      const err = await resetPassword(email);
      setBusy(false);
      if (err) setError(err);
      else setNotice(`Password reset link sent to ${email} — check your inbox.`);
      return;
    }
    const err = mode === "signin"
      ? await signIn(email, pass)
      : await signUp(email, pass, name);
    setBusy(false);
    if (err) setError(err);
    else if (mode === "signup") setMode("verify");
  };

  const handleGoogle = async () => {
    setBusy(true); setError(null);
    const err = await signInGoogle();
    setBusy(false);
    if (err) setError(err);
  };

  // ── Verify email screen ──────────────────────────────────────────
  if (mode === "verify" || (user && !emailVerified && !isAdmin && firebaseReady)) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-[#08080c]">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-3xl mx-auto mb-5">📬</div>
            <h1 className="text-xl font-bold text-white tracking-tight">Check your inbox</h1>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
              We sent a verification link to <span className="text-white font-medium">{user?.email ?? email}</span>.
              Click the link in that email to activate your account.
            </p>
            <p className="text-[11px] text-zinc-500 mt-4">
              Didn't receive it? Check spam, or resend below.
            </p>
            {notice && <p className={noticeCls + " mt-2"}>{notice}</p>}
            {error && <p className={errCls + " mt-2"}>{error}</p>}
            <button
              className="mt-5 w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm text-zinc-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
              disabled={busy}
              onClick={async () => {
                setBusy(true); setError(null);
                const err = await resendVerification();
                setBusy(false);
                if (err) setError(err);
                else setNotice("Verification email resent!");
              }}
            >
              {busy ? "Sending…" : "Resend verification email"}
            </button>
            <button
              className="mt-3 w-full rounded-xl py-2.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              onClick={async () => { await signOut(); setMode("signin"); }}
            >
              Sign out & use a different account
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#08080c]">
        <div className="w-5 h-5 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
      </main>
    );
  }

  // ── Auth form ────────────────────────────────────────────────────
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-[#08080c] relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-cyan-600/5 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[300px] rounded-full bg-violet-600/5 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 group">
            <span className="text-[10px] font-mono text-zinc-500 tracking-[0.2em] uppercase group-hover:text-cyan-400 transition-colors">Social Kon10 Studio</span>
          </Link>
          <h1 className="text-2xl font-bold text-white mt-3 tracking-tight">
            {mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back"}
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5">
            {mode === "signup" ? "Track projects, access designs and more." : mode === "reset" ? "We'll send you a reset link." : "Sign in to your client portal."}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-xl shadow-2xl">
          {/* Google button — shown on signin & signup */}
          {mode !== "reset" && (
            <>
              <button
                onClick={handleGoogle}
                disabled={busy}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all duration-200 disabled:opacity-50"
              >
                <GoogleIcon />
                Continue with Google
              </button>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-white/8" />
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            {mode === "signup" && (
              <div>
                <label className={labelCls} htmlFor="auth-name">Full Name</label>
                <input id="auth-name" type="text" autoComplete="name" placeholder="Alex Johnson" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls} htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
            </div>
            {mode !== "reset" && (
              <div>
                <label className={labelCls} htmlFor="auth-pass">Password</label>
                <div className="relative">
                  <input
                    id="auth-pass"
                    type={passShow ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    placeholder="••••••••"
                    value={pass}
                    onChange={e => setPass(e.target.value)}
                    className={inputCls + " pr-12"}
                  />
                  <button type="button" tabIndex={-1} onClick={() => setPassShow(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-[11px] transition-colors">
                    {passShow ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}

            {error && <p className={errCls} role="alert">{error}</p>}
            {notice && <p className={noticeCls} role="status">{notice}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-black font-semibold py-2.5 text-sm transition-all duration-200 disabled:opacity-50 mt-1"
            >
              {busy ? "One moment…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </button>
          </form>

          {/* Footer links */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/5">
            {mode === "signin" ? (
              <>
                <button onClick={() => setMode("signup")} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                  New here? Create account
                </button>
                <button onClick={() => setMode("reset")} className="text-[11px] text-zinc-500 hover:text-cyan-400 transition-colors">
                  Forgot password?
                </button>
              </>
            ) : mode === "signup" ? (
              <button onClick={() => setMode("signin")} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                Already have an account? Sign in
              </button>
            ) : (
              <button onClick={() => setMode("signin")} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-zinc-600 mt-5">
          By continuing you agree to our{" "}
          <Link to="/about" className="hover:text-zinc-400 transition-colors underline underline-offset-2">Terms of Service</Link>
          {" "}and{" "}
          <Link to="/about" className="hover:text-zinc-400 transition-colors underline underline-offset-2">Privacy Policy</Link>
        </p>
      </div>
    </main>
  );
}
