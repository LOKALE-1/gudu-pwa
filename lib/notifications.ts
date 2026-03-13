import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { messaging, db } from './firebase';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!;

/**
 * Request notification permission, get FCM token, save to profile.
 * Returns true if permission granted and token saved.
 */
export async function initNotifications(profileId: string): Promise<boolean> {
  if (!messaging || typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    // Point FCM at our firebase-messaging-sw.js
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (token) {
      await updateDoc(doc(db, 'profiles', profileId), { fcmToken: token });
    }

    return true;
  } catch (err) {
    console.error('initNotifications error:', err);
    return false;
  }
}

/**
 * Subscribe to an FCM topic via the backend.
 * FCM topics can only be subscribed server-side for web — we use a lightweight
 * Cloud Function endpoint for this.
 */
export async function subscribeToTopic(token: string, topic: string): Promise<void> {
  try {
    await fetch(
      `https://us-central1-gudu-stokvel.cloudfunctions.net/subscribeToTopic`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, topic }),
      }
    );
  } catch (err) {
    console.error('subscribeToTopic error:', err);
  }
}

/**
 * Handle foreground messages (tab is open and focused).
 * Returns an unsubscribe function.
 */
export function onForegroundMessage(
  callback: (title: string, body: string, data: Record<string, string>) => void
): () => void {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? 'Gudu';
    const body = payload.notification?.body ?? '';
    const data = (payload.data ?? {}) as Record<string, string>;
    callback(title, body, data);
  });
}
