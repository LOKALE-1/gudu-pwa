'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './page.module.css';

export default function RootPage() {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.isInitializing) return;

    if (state.isAuthenticated && state.authStep === 'COMPLETED') {
      router.replace('/dashboard');
    } else if (state.authStep === 'PROFILE_SETUP') {
      router.replace('/auth/setup-profile');
    } else if (state.authStep === 'OTP_VERIFICATION') {
      router.replace('/auth/verify-otp');
    } else {
      router.replace('/auth/login');
    }
  }, [state.isInitializing, state.isAuthenticated, state.authStep, router]);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Loading Gudu...</p>
      </div>
    </div>
  );
}
