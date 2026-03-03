'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  doc, getDoc, collection, onSnapshot, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import styles from './repay.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────
const REPAYMENT_URL = 'https://us-central1-gudu-stokvel.cloudfunctions.net/initializeRepayment';
const MIN_REPAYMENT = 100;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Loan {
  id: string;
  stokvelId: string;
  profileId: string;
  userId: string;
  memberName: string;
  principalAmount: number;
  totalInterest: number;
  totalAmount: number;
  amountRepaid: number;
  remainingBalance: number;
  status: string;
  dueDate?: number;
  interestRate: number;
}

type Phase = 'form' | 'awaiting-payment' | 'completed' | 'failed';

function fmt(n: number) {
  return (n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RepayPage() {
  const router = useRouter();
  const params = useParams();
  const loanId = params.loanId as string;

  const { state } = useAuth();
  const profile = state.currentProfile;
  const stokvel = state.userStokvels[0] ?? null;
  const user = state.user;

  const [loan, setLoan] = useState<Loan | null>(null);
  const [loadingLoan, setLoadingLoan] = useState(true);
  const [loanError, setLoanError] = useState('');

  // Repayment form
  const [rawAmount, setRawAmount] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [repaymentId, setRepaymentId] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  const [newBalance, setNewBalance] = useState(0);

  const listenerRef = useRef<(() => void) | null>(null);

  // ── Load loan ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!stokvel || !loanId) return;
    getDoc(doc(db, 'stokvels', stokvel.id, 'loans', loanId))
      .then(snap => {
        if (!snap.exists()) { setLoanError('Loan not found.'); return; }
        setLoan({ id: snap.id, ...snap.data() } as Loan);
      })
      .catch(() => setLoanError('Failed to load loan details.'))
      .finally(() => setLoadingLoan(false));
  }, [stokvel?.id, loanId]);

  // ── Cleanup listener on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => { if (listenerRef.current) listenerRef.current(); };
  }, []);

  // ── Preset amounts ────────────────────────────────────────────────────────
  const remaining = loan?.remainingBalance ?? 0;
  const presets = [
    { label: '25%', value: Math.max(MIN_REPAYMENT, Math.floor(remaining * 0.25 * 100) / 100) },
    { label: '50%', value: Math.max(MIN_REPAYMENT, Math.floor(remaining * 0.50 * 100) / 100) },
    { label: '75%', value: Math.max(MIN_REPAYMENT, Math.floor(remaining * 0.75 * 100) / 100) },
    { label: 'Full', value: remaining },
  ];

  const amount = parseFloat(rawAmount) || 0;
  const isFullRepayment = loan ? amount >= remaining : false;

  // Calculate how much of this payment is interest vs principal
  const interestRatio = loan && loan.totalAmount > 0 ? loan.totalInterest / loan.totalAmount : 0;
  const interestPortion = amount * interestRatio;
  const principalPortion = amount - interestPortion;

  const canSubmit = amount >= MIN_REPAYMENT && amount <= remaining && !submitting && phase === 'form';

  // ── Handle cancel repayment ───────────────────────────────────────────────
  async function handleCancel() {
    if (repaymentId && stokvel && loan) {
      try {
        await updateDoc(
          doc(db, 'stokvels', stokvel.id, 'loans', loan.id, 'loanRepayments', repaymentId),
          { status: 'cancelled', updatedAt: serverTimestamp() }
        );
      } catch (_) { /* non-fatal */ }
    }
    setPhase('form');
    setRepaymentId('');
  }

  // ── Submit repayment ──────────────────────────────────────────────────────
  async function handlePay() {
    if (!canSubmit || !profile || !stokvel || !user || !loan) return;
    setFormError('');
    setSubmitting(true);

    try {
      const res = await fetch(REPAYMENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stokvelId: stokvel.id,
          loanId: loan.id,
          profileId: profile.id,
          userId: user.uid,
          amount,
          email: 'noreply@gudustokvel.co.za',
          interestAmount: loan.totalInterest,
          totalLoanAmount: loan.totalAmount,
        }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to initialise repayment');

      const { reference, authorizationUrl } = json;
      setRepaymentId(reference);
      setPaidAmount(amount);
      setNewBalance(Math.max(0, remaining - amount));
      setSubmitting(false);

      // Watch repayment doc for completion
      const repayRef = doc(db, 'stokvels', stokvel.id, 'loans', loan.id, 'loanRepayments', reference);
      const unsub = onSnapshot(repayRef, snap => {
        const data = snap.data();
        if (!data) return;
        if (data.status === 'completed') {
          setPhase('completed');
          unsub();
        } else if (data.status === 'failed') {
          setPhase('failed');
          unsub();
        }
      });
      listenerRef.current = unsub;

      // Open Paystack checkout in new tab
      window.open(authorizationUrl, '_blank', 'noopener');
      setPhase('awaiting-payment');

    } catch (err) {
      setSubmitting(false);
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────
  if (loadingLoan) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  if (loanError || !loan) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>
        <p className={styles.errorText}>{loanError || 'Loan not found.'}</p>
      </div>
    );
  }

  const isOverdue = loan.dueDate && Date.now() > loan.dueDate;

  // ── Awaiting payment ──────────────────────────────────────────────────────
  if (phase === 'awaiting-payment') {
    return (
      <div className={styles.page}>
        <div className={styles.statusWrap}>
          <div className={`${styles.statusIcon} ${styles.waiting}`}>
            <div className={styles.spinner} />
          </div>
          <p className={styles.statusTitle}>Complete Your Payment</p>
          <p className={styles.statusAmount}>R {fmt(paidAmount)}</p>
          <p className={styles.statusSub}>
            A Paystack payment page opened in a new tab. Complete your payment there — this page will update automatically once confirmed.
          </p>
          <button className={styles.cancelPayBtn} onClick={handleCancel}>
            Cancel Payment
          </button>
        </div>
      </div>
    );
  }

  // ── Completed ─────────────────────────────────────────────────────────────
  if (phase === 'completed') {
    const fullyRepaid = newBalance <= 0;
    return (
      <div className={styles.page}>
        <div className={styles.statusWrap}>
          <div className={`${styles.statusIcon} ${styles.success}`}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <p className={styles.statusTitle}>
            {fullyRepaid ? 'Loan Fully Repaid!' : 'Payment Received!'}
          </p>
          <p className={styles.statusAmount}>R {fmt(paidAmount)}</p>
          {fullyRepaid ? (
            <p className={styles.statusSub}>
              Congratulations — your loan is fully settled. Interest has been distributed to all members.
            </p>
          ) : (
            <p className={styles.statusSub}>
              Remaining balance: <strong>R {fmt(newBalance)}</strong>
            </p>
          )}
          <button className={styles.doneBtn} onClick={() => router.replace('/loans')}>
            Back to Loans
          </button>
        </div>
      </div>
    );
  }

  // ── Failed ────────────────────────────────────────────────────────────────
  if (phase === 'failed') {
    return (
      <div className={styles.page}>
        <div className={styles.statusWrap}>
          <div className={`${styles.statusIcon} ${styles.failed}`}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </div>
          <p className={styles.statusTitle}>Payment Failed</p>
          <p className={styles.statusSub}>No funds were taken. Please try again.</p>
          <button className={styles.retryBtn} onClick={() => { setPhase('form'); setRepaymentId(''); }}>
            Try Again
          </button>
          <button className={styles.doneBtn} onClick={() => router.replace('/loans')}>
            Back to Loans
          </button>
        </div>
      </div>
    );
  }

  // ── Repayment form ────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => router.back()}>
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      <div className={styles.headingWrap}>
        <h1 className={styles.title}>Make a Repayment</h1>
        <p className={styles.subtitle}>{stokvel?.name}</p>
      </div>

      {/* Loan summary card */}
      <div className={`${styles.loanSummary} ${isOverdue ? styles.loanSummaryOverdue : ''}`}>
        <div className={styles.summaryRow}>
          <span>Original loan</span>
          <span>R {fmt(loan.principalAmount)}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>Total to repay</span>
          <span>R {fmt(loan.totalAmount)}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>Paid so far</span>
          <span>R {fmt(loan.amountRepaid ?? 0)}</span>
        </div>
        <div className={`${styles.summaryRow} ${styles.summaryBalance}`}>
          <span>Remaining balance</span>
          <strong>R {fmt(remaining)}</strong>
        </div>
        {loan.dueDate && (
          <div className={`${styles.summaryRow} ${isOverdue ? styles.overdueText : ''}`}>
            <span>Due date</span>
            <span>{new Date(loan.dueDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}{isOverdue ? ' · OVERDUE' : ''}</span>
          </div>
        )}
        {isOverdue && (
          <p className={styles.overdueNote}>⚠ 30% interest will be applied to remaining balance</p>
        )}
      </div>

      {/* Preset amount buttons */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Quick Select</p>
        <div className={styles.presets}>
          {presets.map(p => (
            <button
              key={p.label}
              className={`${styles.presetBtn} ${rawAmount === String(p.value) ? styles.presetActive : ''}`}
              onClick={() => { setRawAmount(String(p.value)); setFormError(''); }}
              disabled={submitting}
            >
              <span className={styles.presetLabel}>{p.label}</span>
              <span className={styles.presetAmount}>R {fmt(p.value)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom amount */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Custom Amount</p>
        <div className={styles.amountCard}>
          <span className={styles.currency}>R</span>
          <input
            className={styles.amountInput}
            type="number"
            min={MIN_REPAYMENT}
            max={remaining}
            placeholder="0"
            value={rawAmount}
            onChange={e => { setRawAmount(e.target.value); setFormError(''); }}
            disabled={submitting}
          />
        </div>
        <p className={styles.amountHint}>Min R {fmt(MIN_REPAYMENT)} · Max R {fmt(remaining)}</p>
      </div>

      {/* Payment breakdown */}
      {amount >= MIN_REPAYMENT && amount <= remaining && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Payment Breakdown</p>
          <div className={styles.breakdownCard}>
            <div className={styles.bRow}><span>You pay</span><span>R {fmt(amount)}</span></div>
            <div className={styles.bRow}><span>Principal portion</span><span>R {fmt(principalPortion)}</span></div>
            <div className={styles.bRow}><span>Interest portion</span><span>R {fmt(interestPortion)}</span></div>
            <div className={`${styles.bRow} ${styles.bRowHighlight}`}>
              <span>Remaining after</span>
              <span>R {fmt(Math.max(0, remaining - amount))}</span>
            </div>
            {isFullRepayment && (
              <p className={styles.fullRepayNote}>✓ This will fully settle your loan</p>
            )}
          </div>
        </div>
      )}

      {formError && <p className={styles.formError}>{formError}</p>}

      <button
        className={`${styles.payBtn} ${canSubmit ? styles.payBtnActive : styles.payBtnDimmed}`}
        onClick={handlePay}
        disabled={!canSubmit}
      >
        {submitting
          ? <><div className={styles.btnSpinner} /> Preparing…</>
          : `Pay R ${amount > 0 ? fmt(amount) : '0.00'}`
        }
      </button>
    </div>
  );
}
