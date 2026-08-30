import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

/* ------------------------------------------------------------------
   FIREBASE INIT
   Reads VITE_FIREBASE_* from the environment. If the project keys
   are not configured, the whole app falls back to demo mode —
   everything renders and the checkout simulates, but nothing
   persists server-side.
------------------------------------------------------------------- */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

export const firebaseReady: boolean = Boolean(config.apiKey && config.projectId && config.appId);

export const ADMIN_EMAILS: string[] = (import.meta.env.VITE_ADMIN_EMAILS || "socialkon10@gmail.com")
  .split(",")
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (firebaseReady) {
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { app, auth, db, storage };
