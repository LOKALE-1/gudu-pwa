'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './join.module.css';

type JoinResult = { status: 'ACTIVE' | 'PENDING'; stokvelName: string } | null;

export default function JoinStokvelPage() {
  const [code, setCode] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<JoinResult>(null);

  const router = useRouter();
  const { joinStokvel } = useAuth();

  const isValid = code.trim().length === 6;

  async function handleJoin() {
    if (!isValid || isLoading) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await joinStokvel(code.trim().toUpperCase());
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // ── Result: ACTIVE — joined immediately
  if (result?.status === 'ACTIVE') {
    return (
      <div className={styles.page}>
        <div className={`${styles.resultCard} ${styles.success}`}>
          <div className={styles.resultIconWrap}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <p className={styles.resultTitle}>{"You're in!"}</p>
          <p className={styles.resultSub}>
            {"You've successfully joined "}<strong>{result.stokvelName}</strong>.
          </p>
        </div>
        <div className={styles.spacer} />
        <button className={styles.doneBtn} onClick={() => router.replace('/dashboard')}>
          Go to Dashboard
        </button>
      </div>
    );
  }

  // ── Result: PENDING — awaiting approval
  if (result?.status === 'PENDING') {
    return (
      <div className={styles.page}>
        <div className={`${styles.resultCard} ${styles.pending}`}>
          <div className={styles.resultIconWrap}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className={styles.resultTitle}>Request Submitted</p>
          <p className={styles.resultSub}>
            Your request to join <strong>{result.stokvelName}</strong> has been sent.
            Please wait for the admin to approve your membership.
          </p>
        </div>
        <div className={styles.spacer} />
        <button className={styles.doneBtn} onClick={() => router.replace('/stokvel/setup')}>
          Back to Home
        </button>
      </div>
    );
  }

  // ── Default: input form
  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => router.back()}>
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      <div className={styles.heading}>
        <h1 className={styles.title}>Join a Stokvel</h1>
        <p className={styles.subtitle}>
          Enter the invite code shared by the stokvel admin
        </p>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Invite Code</label>
        <div className={`${styles.fieldRow}${isFocused ? ` ${styles.focused}` : ''}`}>
          <span className={`${styles.fieldIcon}${isFocused ? ` ${styles.focused}` : ''}`}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
            </svg>
          </span>
          <input
            className={styles.fieldInput}
            type="text"
            placeholder="e.g. ABC123"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setError('');
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            disabled={isLoading}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>
        <p className={styles.hint}>
          The invite code is a 6-character code provided by the stokvel administrator.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.spacer} />

      <button
        className={`${styles.submitBtn} ${isValid && !isLoading ? styles.active : styles.dimmed}`}
        onClick={handleJoin}
        disabled={!isValid || isLoading}
      >
        {isLoading
          ? <><div className={styles.spinner} /> Joining...</>
          : 'Join Stokvel'
        }
      </button>
    </div>
  );
}
