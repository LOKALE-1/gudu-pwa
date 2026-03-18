import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { getFirebaseMessaging, db } from './firebase';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!;

export async function initNotifications(profileId: string): Promise<boolean> {
  const messaging = getFirebaseMessaging();
  if (!messaging || !('Notification' in window)) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const swReg = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });

    if (token) {
      await updateDoc(doc(db, 'profiles', profileId), { fcmToken: token });
    }
    return true;
  } catch (err) {
    console.error('initNotifications error:', err);
    return false;
  }
}

export async function subscribeToTopic(token: string, topic: string): Promise<void> {
  try {
    await fetch('https://us-central1-gudu-stokvel.cloudfunctions.net/subscribeToTopic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, topic }),
    });
  } catch (err) {
    console.error('subscribeToTopic error:', err);
  }
}

export function onForegroundMessage(
  callback: (title: string, body: string, data: Record<string, string>) => void
): () => void {
  const messaging = getFirebaseMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? 'Gudu';
    const body = payload.notification?.body ?? '';
    const data = (payload.data ?? {}) as Record<string, string>;
    callback(title, body, data);
  });
}
