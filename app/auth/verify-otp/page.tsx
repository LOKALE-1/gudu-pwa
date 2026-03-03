'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import styles from './verify.module.css';

const OTP_LENGTH = 6;
const VERIFY_OTP_URL = 'https://us-central1-gudu-stokvel.cloudfunctions.net/verifyOtp';

function VerifyOtpContent() {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, dispatch, clearError } = useAuth();

  useEffect(() => {
    if (state.isAuthenticated && state.authStep === 'COMPLETED') {
      router.replace('/dashboard');
    } else if (state.authStep === 'PROFILE_SETUP') {
      router.replace('/auth/setup-profile');
    }
  }, [state.isAuthenticated, state.authStep, router]);

  // Auto-fill + auto-submit when devCode comes back in the URL (no SMS credentials set)
  useEffect(() => {
    const devCode = searchParams.get('code');
    if (devCode && devCode.length === OTP_LENGTH) {
      const filled = devCode.split('');
      setDigits(filled);
      setTimeout(() => submitOtp(devCode), 400);
    } else {
      inputsRef.current[0]?.focus();
    }
  // submitOtp is stable after mount; devCode never changes mid-session
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const otp = digits.join('');
  const isComplete = otp.length === OTP_LENGTH;

  const submitOtp = useCallback(
    async (code: string) => {
      if (!state.phoneNumber) {
        dispatch({ type: 'SET_ERROR', payload: 'Session expired. Please go back and resend the code.' });
        return;
      }
      clearError();
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        const res = await fetch(VERIFY_OTP_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: state.phoneNumber, code }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error ?? 'Verification failed. Please try again.');
        await signInWithCustomToken(auth, data.customToken);
        // onAuthStateChanged in AuthContext handles navigation from here
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Verification failed. Please try again.';
        dispatch({ type: 'SET_ERROR', payload: msg });
        dispatch({ type: 'SET_LOADING', payload: false });
        setDigits(Array(OTP_LENGTH).fill(''));
        setTimeout(() => inputsRef.current[0]?.focus(), 50);
      }
    },
    [state.phoneNumber, dispatch, clearError]
  );

  function handleChange(index: number, value: string) {
    if (!value.match(/^\d*$/)) return;

    const newDigits = [...digits];

    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
      const filled = pasted.split('').concat(Array(OTP_LENGTH).fill('')).slice(0, OTP_LENGTH);
      setDigits(filled);
      const nextEmpty = filled.findIndex((d) => d === '');
      inputsRef.current[nextEmpty === -1 ? OTP_LENGTH - 1 : nextEmpty]?.focus();
      if (pasted.length === OTP_LENGTH) submitOtp(pasted);
      return;
    }

    newDigits[index] = value.slice(-1);
    setDigits(newDigits);
    if (value && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
    if (index === OTP_LENGTH - 1 && value) {
      const code = newDigits.join('');
      if (code.length === OTP_LENGTH) submitOtp(code);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const d = [...digits]; d[index] = ''; setDigits(d);
      } else if (index > 0) inputsRef.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  const maskedPhone = state.phoneNumber
    ? state.phoneNumber.replace(/(\+27)(\d{2})(\d+)(\d{3})/, '$1 $2*** ***$4')
    : '';

  return (
    <div className={styles.page}>
      <div className={styles.glow} />

      <button
        onClick={() => { dispatch({ type: 'SET_AUTH_STEP', payload: 'PHONE_INPUT' }); router.back(); }}
        className={styles.backBtn}
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      <div className={styles.titleBlock}>
        <h1 className={styles.title}>Enter verification code</h1>
        <p className={styles.subtitle}>
          We sent a 6-digit code to<br />
          <span className={styles.phone}>{maskedPhone || state.phoneNumber}</span>
        </p>
      </div>

      <div className={styles.otpRow}>
        {Array.from({ length: OTP_LENGTH }).map((_, i) => {
          const isFilled = !!digits[i];
          const isActive = digits.findIndex((d) => d === '') === i;
          return (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={digits[i]}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={state.isLoading}
              className={[styles.otpBox, isFilled ? styles.filled : isActive ? styles.active : ''].filter(Boolean).join(' ')}
            />
          );
        })}
      </div>

      {state.error && <div className={styles.error}>{state.error}</div>}

      {state.isLoading && (
        <div className={styles.loadingRow}>
          <div className={styles.spinnerGold} />
          <span className={styles.loadingText}>Verifying...</span>
        </div>
      )}

      <div className={styles.spacer} />

      <button
        onClick={() => submitOtp(otp)}
        disabled={!isComplete || state.isLoading}
        className={`${styles.verifyBtn} ${isComplete && !state.isLoading ? styles.active : styles.dimmed}`}
      >
        {state.isLoading ? <><div className={styles.spinnerDark} /> Verifying...</> : 'Verify Code'}
      </button>

      <div className={styles.resendRow}>
        <span className={styles.resendText}>{"Didn't receive the code?"}</span>
        <button
          onClick={() => { dispatch({ type: 'SET_AUTH_STEP', payload: 'PHONE_INPUT' }); router.replace('/auth/login'); }}
          disabled={state.isLoading}
          className={styles.resendBtn}
        >
          Resend
        </button>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={null}>
      <VerifyOtpContent />
    </Suspense>
  );
}
