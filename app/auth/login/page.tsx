'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import styles from './login.module.css';

export default function LoginPage() {
  const [tab, setTab] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // localLoading = only during the Firebase Auth call itself (before onAuthStateChanged fires)
  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { state } = useAuth();

  // Combined loading = local Firebase call OR AuthContext initialising/loading
  const isBusy = localLoading || state.isLoading || state.isInitializing;

  const isEmailValid = email.includes('@') && email.includes('.') && password.length >= 6;

  useEffect(() => {
    if (state.isAuthenticated && state.authStep === 'COMPLETED') {
      router.replace('/dashboard');
    } else if (state.authStep === 'PROFILE_SETUP') {
      router.replace('/auth/setup-profile');
    }
  }, [state.isAuthenticated, state.authStep, router]);

  // Clear localLoading once AuthContext takes over (isLoading becomes true)
  useEffect(() => {
    if (state.isLoading && localLoading) setLocalLoading(false);
  }, [state.isLoading, localLoading]);

  async function handleSignIn() {
    if (!isEmailValid || isBusy) return;
    setError('');
    setLocalLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged in AuthContext handles redirect — setLocalLoading(false)
      // is handled by the useEffect above once AuthContext sets isLoading=true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      setError(msg.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim());
      setLocalLoading(false);
    }
  }

  async function handleSignUp() {
    if (!isEmailValid || isBusy) return;
    setError('');
    setLocalLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged fires → AuthContext sets isLoading=true → we clear localLoading
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign up failed';
      setError(msg.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim());
      setLocalLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.glowTR} />
      <div className={styles.glowBL} />

      <div className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          </div>
          <span className={styles.logoText}>Stokvel</span>
        </div>
        <button className={styles.helpBtn} aria-label="Help">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
        </button>
      </div>

      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>
          {"Let's get your"}<br />
          <span className={styles.heroGold}>money moving.</span>
        </h1>
        <p className={styles.heroSub}>
          Enter your details to track, save, and grow your wealth together.
        </p>
      </div>

      {/* Tab toggle */}
      <div className={styles.tabRow}>
        <button
          className={`${styles.tabBtn} ${tab === 'email' ? styles.tabActive : styles.tabInactive}`}
          onClick={() => setTab('email')}
        >
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
          Email
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'phone' ? styles.tabActive : styles.tabInactive}`}
          onClick={() => setTab('phone')}
        >
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
          </svg>
          Phone
        </button>
      </div>

      {tab === 'phone' ? (
        <div className={styles.underConstruction}>
          <div className={styles.constructionIcon}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
            </svg>
          </div>
          <p className={styles.constructionTitle}>Under Construction</p>
          <p className={styles.constructionSub}>
            Phone authentication is coming soon. Please use email to sign in for now.
          </p>
        </div>
      ) : (
        <div className={styles.emailForm}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Email address</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              disabled={isBusy}
              className={styles.textInput}
              autoComplete="email"
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Password</label>
            <input
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
              disabled={isBusy}
              className={styles.textInput}
              autoComplete="current-password"
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            onClick={handleSignIn}
            disabled={!isEmailValid || isBusy}
            className={`${styles.ctaBtn} ${isEmailValid && !isBusy ? styles.active : styles.dimmed}`}
          >
            {isBusy
              ? <><div className={styles.spinner} /> Signing in...</>
              : <>Sign In <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg></>
            }
          </button>

          <button
            onClick={handleSignUp}
            disabled={!isEmailValid || isBusy}
            className={`${styles.outlineBtn} ${isEmailValid && !isBusy ? styles.outlineActive : styles.outlineDimmed}`}
          >
            {isBusy ? 'Please wait...' : 'Create Account'}
          </button>
        </div>
      )}

      <div className={styles.orRow}>
        <div className={styles.orLine} />
        <span className={styles.orText}>or start new</span>
        <div className={styles.orLine} />
      </div>

      <div className={styles.cardsGrid}>
        <ActionCard
          title="Join a Stokvel"
          subtitle="Got an invite code? Enter here."
          icon={<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>}
          onClick={() => {}}
        />
        <ActionCard
          title="Start a Stokvel"
          subtitle="Be the admin and manage funds."
          icon={<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
          onClick={() => {}}
        />
      </div>

      <p className={styles.terms}>
        By continuing, you agree to our{' '}
        <span className={styles.termsLink}>Terms</span> and{' '}
        <span className={styles.termsLink}>Privacy Policy</span>.
      </p>
    </div>
  );
}

function ActionCard({ title, subtitle, icon, onClick }: {
  title: string; subtitle: string; icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={styles.card}>
      <div className={styles.cardIcon}>{icon}</div>
      <p className={styles.cardTitle}>{title}</p>
      <p className={styles.cardSub}>{subtitle}</p>
    </button>
  );
}
