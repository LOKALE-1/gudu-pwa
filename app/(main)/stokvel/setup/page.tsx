'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './setup.module.css';

export default function StokvelSetupPage() {
  const { state } = useAuth();
  const router = useRouter();
  const profile = state.currentProfile;

  // If user already has a stokvel, send them to dashboard
  useEffect(() => {
    if (!state.isInitializing && state.isAuthenticated && profile?.stokvelId) {
      router.replace('/dashboard');
    }
  }, [state.isInitializing, state.isAuthenticated, profile?.stokvelId, router]);

  return (
    <div className={styles.page}>
      {/* Greeting */}
      <div className={styles.greeting}>
        <p className={styles.greetSub}>Welcome,</p>
        <h1 className={styles.greetName}>{profile?.displayName ?? ''}</h1>
      </div>

      {/* Empty state card */}
      <div className={styles.emptyCard}>
        <div className={styles.emptyIconWrap}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
          </svg>
        </div>
        <h2 className={styles.emptyTitle}>{"You're not part of any stokvel yet"}</h2>
        <p className={styles.emptySub}>
          Join an existing stokvel or create your own to get started.
        </p>
      </div>

      {/* Action cards */}
      <div className={styles.actionGrid}>
        <Link href="/stokvel/join" className={styles.actionCard}>
          <div className={styles.cardIconWrap}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
            </svg>
          </div>
          <p className={styles.cardTitle}>Join a Stokvel</p>
          <p className={styles.cardSub}>Enter an invite code to join</p>
        </Link>

        <Link href="/stokvel/create" className={styles.actionCard}>
          <div className={styles.cardIconWrap}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className={styles.cardTitle}>Create Stokvel</p>
          <p className={styles.cardSub}>Start your own and invite members</p>
        </Link>
      </div>
    </div>
  );
}
