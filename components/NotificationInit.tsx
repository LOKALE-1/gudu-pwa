'use client';

import { useEffect, useRef } from 'react';
import { getToken } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
        // Register FCM background service worker
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });

        // Ask for permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Lazy-import messaging (browser-only)
        const { messaging } = await import('@/lib/firebase');
        if (!messaging) return;

        // Get FCM token
        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
        if (!token) return;

        // Save token to Firestore profile
        await updateDoc(doc(db, 'profiles', profile!.id), { fcmToken: token });

        // Subscribe to member topic (all members)
        if (stokvel) {
          await fetch(SUBSCRIBE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, topic: `stokvel_${stokvel.id}_members` }),
          });

          // Subscribe to admin topic if admin/creator
          if (profile!.role === 'CREATOR' || profile!.role === 'ADMIN') {
            await fetch(SUBSCRIBE_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, topic: `stokvel_${stokvel.id}_admin` }),
            });
          }
        }

        console.log('[FCM] Initialized for', profile!.displayName, '| role:', profile!.role);
      } catch (err) {
        console.error('[FCM] NotificationInit error:', err);
      }
    }

    setup();
  }, [profile?.id, stokvel?.id, profile?.role]);

  return null;
}
