'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './dashboard.module.css';

export default function DashboardPage() {
  const { state } = useAuth();
  const router = useRouter();
  const profile = state.currentProfile;
  const stokvel = state.userStokvels[0] ?? null;

  // Redirect to stokvel setup when user has no stokvel yet
  useEffect(() => {
    if (!state.isInitializing && state.isAuthenticated && profile && !profile.stokvelId) {
      router.replace('/stokvel/setup');
    }
  }, [state.isInitializing, state.isAuthenticated, profile, router]);

  const poolBalance = stokvel
    ? stokvel.poolBalance.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0,00';

  const myContributions = profile?.stats?.totalContributed ?? 0;

  return (
    <div className={styles.page}>
      {/* Top row: greeting + bell */}
      <div className={styles.topRow}>
        <div className={styles.greeting}>
          <p className={styles.greetLabel}>Welcome back,</p>
          <h1 className={styles.greetName}>
            {profile ? `${profile.displayName} ${profile.surname}` : 'Loading…'}
          </h1>
        </div>
        <button className={styles.bellBtn} onClick={() => {}}>
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
        </button>
      </div>

      {/* Gold pool balance card */}
      <div className={styles.balanceCard}>
        <p className={styles.balanceLabel}>TOTAL POOL BALANCE</p>
        <p className={styles.balanceAmount}>R {poolBalance}</p>
        {stokvel && (
          <div className={styles.memberChip}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            {stokvel.memberCount ?? 0} members
          </div>
        )}
      </div>

      {/* Your Contributions card */}
      <div className={styles.contribCard}>
        <div className={styles.contribIcon}>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
          </svg>
        </div>
        <div>
          <p className={styles.contribLabel}>Your Contributions</p>
          <p className={styles.contribAmount}>
            R {myContributions.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Spacer pushes buttons toward bottom */}
      <div className={styles.spacer} />

      {/* Big action buttons */}
      <div className={styles.actionRow}>
        <button className={styles.btnContribute} onClick={() => router.push('/contribute')}>
          Contribute
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
        <button className={styles.btnLoan} onClick={() => router.push('/loans')}>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
          </svg>
          Get Loan
        </button>
      </div>
    </div>
  );
}
