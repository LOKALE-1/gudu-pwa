'use client';

import { useEffect, useRef } from 'react';
import { getToken } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { db, getFirebaseMessaging } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!;
const SUBSCRIBE_URL = 'https://us-central1-gudu-stokvel.cloudfunctions.net/subscribeToTopic';

export function NotificationInit() {
  const { state } = useAuth();
  const profile = state.currentProfile;
  const stokvel = state.userStokvels[0] ?? null;
  const initialized = useRef(false);

  useEffect(() => {
    if (!profile || initialized.current) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    initialized.current = true;

    async function setup() {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Register sw.js explicitly — FCM needs a service worker registration
        const swReg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });

        // Wait for the SW to be active before calling getToken
        await navigator.serviceWorker.ready;

        const messaging = getFirebaseMessaging();
        if (!messaging) return;

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });
        if (!token) return;

        await updateDoc(doc(db, 'profiles', profile!.id), { fcmToken: token });

        if (stokvel) {
          await fetch(SUBSCRIBE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, topic: `stokvel_${stokvel.id}_members` }),
          });

          if (profile!.role === 'CREATOR' || profile!.role === 'ADMIN') {
            await fetch(SUBSCRIBE_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, topic: `stokvel_${stokvel.id}_admin` }),
            });
          }
        }

        console.log('[FCM] Ready —', profile!.displayName, '|', profile!.role);
      } catch (err) {
        console.error('[FCM] setup error:', err);
      }
    }

    setup();
  }, [profile?.id, stokvel?.id, profile?.role]);

  return null;
}
