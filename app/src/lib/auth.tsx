import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { auth, firebaseReady, ADMIN_EMAILS } from "./firebase";

/* ------------------------------------------------------------------
   AUTH (PRD §64 — CLIENT + ADMIN roles)
   Client: signs up at checkout or the portal, sees only own orders.
   Admin: email is listed in VITE_ADMIN_EMAILS.
------------------------------------------------------------------- */

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, pass: string) => Promise<string | null>;
  signUp: (email: string, pass: string) => Promise<string | null>;
  signInGoogle: () => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null, loading: false, isAdmin: false,
  signIn: async () => "Auth unavailable",
  signUp: async () => "Auth unavailable",
  signInGoogle: async () => "Auth unavailable",
  resetPassword: async () => "Auth unavailable",
  signOut: async () => {},
});

const errMsg = (e: unknown): string => {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Email or password is incorrect.";
  if (code.includes("email-already-in-use")) return "That email already has an account — sign in instead.";
  if (code.includes("weak-password")) return "Password needs at least 6 characters.";
  if (code.includes("invalid-email")) return "That email address isn't valid.";
  if (code.includes("popup-closed")) return "Sign-in popup was closed.";
  return "Something went wrong — please try again.";
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseReady);

  useEffect(() => {
    if (!firebaseReady || !auth) return;
    return onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
  }, []);

  const guard = () => (!firebaseReady || !auth ? "Firebase isn't configured yet — see .env.example." : null);

  const value: AuthState = {
    user,
    loading,
    isAdmin: !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()),
    signIn: async (email, pass) => {
      const g = guard(); if (g) return g;
      try { await signInWithEmailAndPassword(auth!, email, pass); return null; }
      catch (e) { return errMsg(e); }
    },
    signUp: async (email, pass) => {
      const g = guard(); if (g) return g;
      try { await createUserWithEmailAndPassword(auth!, email, pass); return null; }
      catch (e) { return errMsg(e); }
    },
    signInGoogle: async () => {
      const g = guard(); if (g) return g;
      try { await signInWithPopup(auth!, new GoogleAuthProvider()); return null; }
      catch (e) { return errMsg(e); }
    },
    resetPassword: async (email) => {
      const g = guard(); if (g) return g;
      try { await sendPasswordResetEmail(auth!, email); return null; }
      catch (e) { return errMsg(e); }
    },
    signOut: async () => { if (auth) await fbSignOut(auth); },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
