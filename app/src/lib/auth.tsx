import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updateProfile,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { auth, firebaseReady, ADMIN_EMAILS } from "./firebase";

/* ------------------------------------------------------------------
   AUTH — 2026 Best Practices
   • Email/Password + Google Sign-In
   • Email verification on sign-up
   • Role-based: Customer | Admin (email allowlist)
   • Persistent session via Firebase onAuthStateChanged
------------------------------------------------------------------- */

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  emailVerified: boolean;
  signIn: (email: string, pass: string) => Promise<string | null>;
  signUp: (email: string, pass: string, displayName?: string) => Promise<string | null>;
  signInGoogle: () => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  resendVerification: () => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<string | null>;
  completeMagicLink: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null, loading: false, isAdmin: false, emailVerified: false,
  signIn: async () => "Auth unavailable",
  signUp: async () => "Auth unavailable",
  signInGoogle: async () => "Auth unavailable",
  resetPassword: async () => "Auth unavailable",
  resendVerification: async () => "Auth unavailable",
  sendMagicLink: async () => "Auth unavailable",
  completeMagicLink: async () => "Auth unavailable",
  signOut: async () => {},
});

const errMsg = (e: unknown): string => {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Email or password is incorrect.";
  if (code.includes("email-already-in-use")) return "That email already has an account — sign in instead.";
  if (code.includes("weak-password")) return "Password needs at least 6 characters.";
  if (code.includes("invalid-email")) return "That email address isn't valid.";
  if (code.includes("popup-closed")) return "Sign-in popup was closed.";
  if (code.includes("too-many-requests")) return "Too many attempts — please wait a moment and try again.";
  if (code.includes("network-request-failed")) return "Network error — check your connection and try again.";
  if (code.includes("operation-not-allowed")) return "This sign-in method is not enabled. Please sign in with email/password or Google.";
  if (code.includes("unauthorized-domain")) return "This domain is not authorized for passwordless sign-in in Firebase.";
  if (code.includes("expired-action-code")) return "This access link has expired. Please request a new one.";
  if (code.includes("invalid-action-code")) return "This access link is invalid or has already been used.";
  return (e as Error)?.message || "Something went wrong — please try again.";
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseReady);

  useEffect(() => {
    if (!firebaseReady || !auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const guard = () => (!firebaseReady || !auth ? "Firebase isn't configured yet." : null);

  const value: AuthState = {
    user,
    loading,
    isAdmin: !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()),
    emailVerified: user?.emailVerified ?? false,

    signIn: async (email, pass) => {
      const g = guard(); if (g) return g;
      try {
        await signInWithEmailAndPassword(auth!, email, pass);
        return null;
      } catch (e) { return errMsg(e); }
    },

    signUp: async (email, pass, displayName) => {
      const g = guard(); if (g) return g;
      try {
        const cred = await createUserWithEmailAndPassword(auth!, email, pass);
        // Set display name if provided
        if (displayName?.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        // Send verification email (non-blocking — user can still use app)
        await sendEmailVerification(cred.user).catch(() => {/* ignore if email fails */});
        return null;
      } catch (e) { return errMsg(e); }
    },

    signInGoogle: async () => {
      const g = guard(); if (g) return g;
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await signInWithPopup(auth!, provider);
        return null;
      } catch (e) { return errMsg(e); }
    },

    resetPassword: async (email) => {
      const g = guard(); if (g) return g;
      try {
        await sendPasswordResetEmail(auth!, email);
        return null;
      } catch (e) { return errMsg(e); }
    },

    resendVerification: async () => {
      const g = guard(); if (g) return g;
      if (!auth?.currentUser) return "Not signed in.";
      try {
        await sendEmailVerification(auth.currentUser);
        return null;
      } catch (e) { return errMsg(e); }
    },

    sendMagicLink: async (email) => {
      const g = guard(); if (g) return g;
      try {
        const actionCodeSettings = {
          url: `${window.location.origin}/client?magic=1`,
          handleCodeInApp: true,
        };
        await sendSignInLinkToEmail(auth!, email, actionCodeSettings);
        localStorage.setItem("sk_magic_link_email", email);
        return null;
      } catch (e) { return errMsg(e); }
    },

    completeMagicLink: async () => {
      if (!auth || !isSignInWithEmailLink(auth, window.location.href)) return null;
      let email = localStorage.getItem("sk_magic_link_email");
      if (!email) email = window.prompt("Please confirm your email address for sign-in:");
      if (!email) return "Email required to complete sign-in.";
      try {
        await signInWithEmailLink(auth, email, window.location.href);
        localStorage.removeItem("sk_magic_link_email");
        // Strip the magic link params from the URL without a hard reload
        const url = new URL(window.location.href);
        url.searchParams.delete("apiKey");
        url.searchParams.delete("oobCode");
        url.searchParams.delete("mode");
        url.searchParams.delete("magic");
        window.history.replaceState({}, "", url.toString());
        return null;
      } catch (e) { return errMsg(e); }
    },

    signOut: async () => { if (auth) await fbSignOut(auth); },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);


