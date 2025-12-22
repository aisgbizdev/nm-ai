// src/lib/firebase.ts
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID!, // ✅ pastiin ada G-xxxx
};

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

// ✅ Analytics (client-only, dynamic import biar aman dari SSR)
let _analytics: any = null;

export async function getFirebaseAnalytics() {
  if (typeof window === "undefined") return null;

  const { isSupported, getAnalytics } = await import("firebase/analytics");
  if (!(await isSupported())) return null;

  if (_analytics) return _analytics;
  _analytics = getAnalytics(app);
  return _analytics;
}
