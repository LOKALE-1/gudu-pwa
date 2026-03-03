'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './login.module.css';

const SEND_OTP_URL = 'https://us-central1-gudu-stokvel.cloudfunctions.net/sendOtp';

function cleanPhoneInput(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.startsWith('27') && digits.length > 2) digits = digits.slice(2);
  return digits.slice(0, 9);
}

export default function LoginPage() {
  const [phoneDigits, setPhoneDigits] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const router = useRouter();
  const { state, dispatch, clearError } = useAuth();

  const isValid = phoneDigits.length >= 9;

  useEffect(() => {
    if (state.isAuthenticated && state.authStep === 'COMPLETED') {
      router.replace('/dashboard');
    }
  }, [state.isAuthenticated, state.authStep, router]);

  async function handleSendCode() {
    if (!isValid || isLoading) return;
    clearError();
    setIsLoading(true);

    const phone = `+27${phoneDigits}`;
    dispatch({ type: 'SET_PHONE_NUMBER', payload: phone });

    try {
      const res = await fetch(SEND_OTP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Failed to send code');
      dispatch({ type: 'SET_AUTH_STEP', payload: 'OTP_VERIFICATION' });
      // devCode is returned when no SMS credentials are set — auto-fills the verify page
      router.push(data.devCode ? `/auth/verify-otp?code=${data.devCode}` : '/auth/verify-otp');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send code. Try again.';
      dispatch({ type: 'SET_ERROR', payload: msg });
    } finally {
      setIsLoading(false);
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

      <div className={styles.inputGroup}>
        <label className={styles.label}>Phone number</label>
        <div className={`${styles.phoneRow}${isFocused ? ` ${styles.focused}` : ''}`}>
          <span className={styles.countryCode}>+27</span>
          <div className={styles.rowDivider} />
          <input
            type="tel"
            inputMode="numeric"
            placeholder="82 123 4567"
            value={phoneDigits}
            onChange={(e) => setPhoneDigits(cleanPhoneInput(e.target.value))}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
            disabled={isLoading}
            className={styles.phoneInput}
          />
          <svg className={`${styles.phoneIcon}${isFocused ? ` ${styles.focused}` : ''}`}
            width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" />
          </svg>
        </div>
        <p className={styles.hint}>Enter your number without the leading 0</p>
      </div>

      {state.error && <div className={styles.error}>{state.error}</div>}

      <button
        onClick={handleSendCode}
        disabled={!isValid || isLoading}
        className={`${styles.ctaBtn} ${isValid && !isLoading ? styles.active : styles.dimmed}`}
      >
        {isLoading
          ? <><div className={styles.spinner} /> Sending code...</>
          : <>Continue Securely <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg></>
        }
      </button>

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
