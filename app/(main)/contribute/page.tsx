'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import styles from './contribute.module.css';

type Phase = 'idle' | 'awaiting-payment' | 'processing' | 'completed' | 'failed';

const INIT_URL = 'https://us-central1-gudu-stokvel.cloudfunctions.net/initializeContribution';

// Derive a guaranteed-valid email for Paystack.
function resolveEmail(email: string | null | undefined, phone: string | null | undefined, uid: string): string {
  const trimmed = (email ?? '').trim();
  const afterAt = trimmed.split('@')[1] ?? '';
  if (trimmed.includes('@') && afterAt.includes('.')) return trimmed;
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length >= 7) return `${digits}@gudu.com`;
  return `${uid}@gudu.com`;
}

export default function ContributePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state } = useAuth();
  const profile = state.currentProfile;
  const stokvel = state.userStokvels[0] ?? null;
  const user = state.user;

  const [rawAmount, setRawAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [confirmedAmount, setConfirmedAmount] = useState(0);
  const [contributionId, setContributionId] = useState('');
  const listenerRef = useRef<(() => void) | null>(null);

  const amount = parseFloat(rawAmount) || 0;
  const canSubmit = amount >= 1 && !isLoading;

  // Resume pending payment when Paystack redirects back with ?ref=
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref && stokvel) {
      setContributionId(ref);
      setPhase('awaiting-payment');
    }
  }, [searchParams, stokvel]);

  // Clean up Firestore listener on unmount
  useEffect(() => {
    return () => {
      if (listenerRef.current) listenerRef.current();
    };
  }, []);

  // Attach real-time listener once we have a contributionId
  useEffect(() => {
    if (!contributionId || !stokvel) return;
    const ref = doc(db, 'stokvels', stokvel.id, 'contributions', contributionId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      if (!data) return;
      if (data.status === 'completed') {
        setPhase('completed');
      } else if (data.status === 'failed') {
        setPhase('failed');
      }
    });
    listenerRef.current = unsub;
    return () => unsub();
  }, [contributionId, stokvel]);

  async function handleCancel() {
    if (contributionId && stokvel) {
      try {
        const ref = doc(db, 'stokvels', stokvel.id, 'contributions', contributionId);
        await updateDoc(ref, { status: 'cancelled' });
      } catch (_) { /* non-fatal */ }
    }
    setPhase('idle');
    setContributionId('');
  }

  async function handlePay() {
    if (!canSubmit || !profile || !stokvel || !user) return;
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(INIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stokvelId: stokvel.id,
          profileId: profile.id,
          userId: user.uid,
          amount,
          email: resolveEmail(user.email, user.phoneNumber, user.uid),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to initialise payment');

      const { contributionId: cId, authorizationUrl } = json;
      setContributionId(cId);
      setConfirmedAmount(amount);
      setIsLoading(false);

      // Navigate to Paystack checkout. Paystack will redirect back to
      // /contribute?ref={contributionId} when done — the useEffect above resumes the listener.
      window.location.href = authorizationUrl;
      setPhase('awaiting-payment');
    } catch (err) {
      setIsLoading(false);
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  // ── Status screens ────────────────────────────────────────────────────────

  if (phase === 'awaiting-payment') {
    return (
      <div className={styles.page}>
        <div className={styles.statusWrap}>
          <div className={`${styles.statusIcon} ${styles.processing}`}>
            <div className={styles.spinnerGold} />
          </div>
          <p className={styles.statusTitle}>Complete Your Payment</p>
          <p className={styles.statusAmount}>R {confirmedAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
          <p className={styles.statusSub}>
            A Paystack payment page has opened in a new tab. Complete your payment there — this page will update automatically once confirmed.
          </p>
          <button className={styles.retryBtn} onClick={handleCancel}>
            Cancel Payment
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'processing') {
    return (
      <div className={styles.page}>
        <div className={styles.statusWrap}>
          <div className={`${styles.statusIcon} ${styles.processing}`}>
            <div className={styles.spinnerGold} />
          </div>
          <p className={styles.statusTitle}>Payment Processing</p>
          <p className={styles.statusAmount}>R {confirmedAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
          <p className={styles.statusSub}>
            Confirming your contribution with Paystack. This usually takes a few seconds.
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'completed') {
    return (
      <div className={styles.page}>
        <div className={styles.statusWrap}>
          <div className={`${styles.statusIcon} ${styles.success}`}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <p className={styles.statusTitle}>Contribution Received!</p>
          <p className={styles.statusAmount}>R {confirmedAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
          <p className={styles.statusSub}>
            Your contribution has been added to the{' '}
            <strong>{stokvel?.name}</strong> pool.
          </p>
          <button className={styles.doneBtn} onClick={() => router.replace('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className={styles.page}>
        <div className={styles.statusWrap}>
          <div className={`${styles.statusIcon} ${styles.failed}`}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </div>
          <p className={styles.statusTitle}>Payment Failed</p>
          <p className={styles.statusSub}>
            Something went wrong processing your payment. No funds were taken.
          </p>
          <button className={styles.retryBtn} onClick={() => { setPhase('idle'); setContributionId(''); }}>
            Try Again
          </button>
          <button className={styles.doneBtn} onClick={() => router.replace('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Input form ────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => router.back()}>
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      <div className={styles.heading}>
        <h1 className={styles.title}>Make a Contribution</h1>
        <p className={styles.subtitle}>Add funds to the stokvel pool via card payment</p>
      </div>

      {/* Amount card */}
      <div className={styles.amountCard}>
        <p className={styles.amountLabel}>Enter Amount</p>
        <div className={styles.amountRow}>
          <span className={styles.currencySymbol}>R</span>
          <input
            className={styles.amountInput}
            type="number"
            min="1"
            placeholder="0"
            value={rawAmount}
            onChange={(e) => {
              setError('');
              setRawAmount(e.target.value);
            }}
            disabled={isLoading}
            autoFocus
          />
        </div>
        <p className={styles.amountHint}>Minimum R 1.00</p>
      </div>

      {/* Stokvel info */}
      {stokvel && (
        <div className={styles.infoRow}>
          <span className={styles.infoKey}>Contributing to</span>
          <span className={styles.infoValue}>{stokvel.name}</span>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <button
        className={`${styles.submitBtn} ${canSubmit ? styles.active : styles.dimmed}`}
        onClick={handlePay}
        disabled={!canSubmit}
      >
        {isLoading
          ? <><div className={styles.spinner} /> Preparing payment…</>
          : `Pay R ${amount > 0 ? amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 }) : '0.00'}`
        }
      </button>
    </div>
  );
}
