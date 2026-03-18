import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { type Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function createFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  return initializeApp(firebaseConfig);
}

const app: FirebaseApp = firebaseConfig.apiKey
  ? createFirebaseApp()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  : (null as any);

export const auth: Auth = app ? getAuth(app) : (null as unknown as Auth);
export const db: Firestore = app ? getFirestore(app) : (null as unknown as Firestore);
export const functions: Functions = app ? getFunctions(app, 'us-central1') : (null as unknown as Functions);

// Messaging must be lazily initialised — never imported at module level on the server.
// Call getMessaging() only inside browser-side code (useEffect, event handlers, etc).
let _messaging: Messaging | null = null;
export function getFirebaseMessaging(): Messaging | null {
  if (!app || typeof window === 'undefined') return null;
  if (!_messaging) {
    // Dynamic require keeps this module out of the server bundle entirely
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMessaging } = require('firebase/messaging');
    _messaging = getMessaging(app);
  }
  return _messaging;
}

export default app;
