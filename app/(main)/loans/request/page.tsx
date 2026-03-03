'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import styles from './request.module.css';

// ── SA Banks (hardcoded — getBanks CF is temporarily unavailable) ─────────────
const SA_BANKS = [
  { code: '632005', name: 'Absa Bank' },
  { code: '430000', name: 'African Bank' },
  { code: '888000', name: 'Bank Zero' },
  { code: '462005', name: 'Bidvest Bank' },
  { code: '470010', name: 'Capitec Bank' },
  { code: '679000', name: 'Discovery Bank' },
  { code: '250655', name: 'FNB (First National Bank)' },
  { code: '580105', name: 'Investec Bank' },
  { code: '198765', name: 'Nedbank' },
  { code: '051001', name: 'Standard Bank' },
  { code: '678910', name: 'TymeBank' },
];

const INTEREST_RATE = 0.30;
const MIN_LOAN = 1000;

type Step = 'checking' | 'ineligible' | 'form' | 'submitting' | 'success';

function fmt(n: number) {
  return n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function LoanRequestPage() {
  const router = useRouter();
  const { state } = useAuth();
  const profile = state.currentProfile;
  const stokvel = state.userStokvels[0] ?? null;
  const user = state.user;

  const [step, setStep] = useState<Step>('checking');
  const [ineligibleReason, setIneligibleReason] = useState('');

  // Form fields
  const [rawAmount, setRawAmount] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [formError, setFormError] = useState('');

  const amount = parseFloat(rawAmount) || 0;
  const interest = amount * INTEREST_RATE;
  const totalAmount = amount + interest;
  const maxLoan = stokvel?.poolBalance ?? 0;

  const selectedBank = SA_BANKS.find(b => b.code === bankCode) ?? null;

  // ── Check eligibility on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!profile || !stokvel || !user) return;
    checkEligibility();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkEligibility() {
    setStep('checking');

    try {
      // 1. Pool must have funds
      if ((stokvel?.poolBalance ?? 0) <= 0) {
        setIneligibleReason('The stokvel pool has no funds available for loans at this time.');
        setStep('ineligible');
        return;
      }

      // 2. Member must have contributed at least once
      if ((profile?.stats?.totalContributed ?? 0) <= 0) {
        setIneligibleReason('You need to make at least one contribution before you can request a loan.');
        setStep('ineligible');
        return;
      }

      // 3. No outstanding loan balance (pending, approved, disbursed, or active)
      const loansSnap = await getDocs(
        query(
          collection(db, 'stokvels', stokvel!.id, 'loans'),
          where('profileId', '==', profile!.id),
          where('status', 'in', ['pending', 'approved', 'disbursed', 'active'])
        )
      );

      const hasOutstanding = loansSnap.docs.some(d => {
        const data = d.data();
        return (data.remainingBalance ?? data.totalAmount ?? 0) > 0;
      });

      if (hasOutstanding) {
        setIneligibleReason('You must settle your existing loan before requesting a new one.');
        setStep('ineligible');
        return;
      }

      setStep('form');
    } catch (err) {
      console.error('Eligibility check failed:', err);
      setIneligibleReason('Unable to check eligibility. Please go back and try again.');
      setStep('ineligible');
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setFormError('');

    if (amount < MIN_LOAN) {
      setFormError(`Minimum loan amount is R ${fmt(MIN_LOAN)}.`);
      return;
    }
    if (amount > maxLoan) {
      setFormError(`Maximum loan amount is R ${fmt(maxLoan)} (current pool balance).`);
      return;
    }
    if (!bankCode) {
      setFormError('Please select your bank.');
      return;
    }
    if (!accountNumber.trim() || accountNumber.trim().length < 6) {
      setFormError('Please enter a valid account number.');
      return;
    }
    if (!accountHolderName.trim()) {
      setFormError('Please enter the account holder name.');
      return;
    }

    if (!profile || !stokvel || !user) return;
    setStep('submitting');

    try {
      await addDoc(collection(db, 'stokvels', stokvel.id, 'loans'), {
        stokvelId: stokvel.id,
        profileId: profile.id,
        userId: user.uid,
        memberName: `${profile.displayName} ${profile.surname}`.trim(),
        principalAmount: amount,
        interestRate: INTEREST_RATE,
        interestType: 'FIXED',
        totalInterest: interest,
        totalAmount: totalAmount,
        termMonths: 1,
        monthlyPayment: totalAmount,
        repaymentType: 'LUMP_SUM',
        status: 'pending',
        amountDisbursed: 0,
        amountRepaid: 0,
        remainingBalance: totalAmount,
        missedPayments: 0,
        memberTotalContributed: profile.stats?.totalContributed ?? 0,
        poolBalanceAtApplication: stokvel.poolBalance ?? 0,
        eligibilityMultiplier: 2.0,
        borrowerBankCode: bankCode,
        borrowerBankName: selectedBank?.name ?? '',
        borrowerAccountNumber: accountNumber.trim(),
        borrowerAccountName: accountHolderName.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setStep('success');
    } catch (err) {
      console.error('Loan request failed:', err);
      setFormError('Failed to submit your request. Please try again.');
      setStep('form');
    }
  }

  // ── Checking ───────────────────────────────────────────────────────────────
  if (step === 'checking') {
    return (
      <div className={styles.page}>
        <div className={styles.checkingWrap}>
          <div className={styles.spinner} />
          <p className={styles.checkingText}>Checking eligibility…</p>
        </div>
      </div>
    );
  }

  // ── Ineligible ─────────────────────────────────────────────────────────────
  if (step === 'ineligible') {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>
        <div className={styles.ineligibleWrap}>
          <div className={styles.ineligibleIcon}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <p className={styles.ineligibleTitle}>Not Eligible</p>
          <p className={styles.ineligibleReason}>{ineligibleReason}</p>
          <button className={styles.backBtnFull} onClick={() => router.back()}>
            Back to Loans
          </button>
        </div>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className={styles.page}>
        <div className={styles.successWrap}>
          <div className={styles.successIcon}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <p className={styles.successTitle}>Request Submitted!</p>
          <p className={styles.successSub}>
            Your loan request for <strong>R {fmt(amount)}</strong> has been submitted.
            The admin will review it shortly.
          </p>
          <button className={styles.doneBtn} onClick={() => router.replace('/loans')}>
            View My Loans
          </button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  const canSubmit =
    amount >= MIN_LOAN &&
    amount <= maxLoan &&
    !!bankCode &&
    accountNumber.trim().length >= 6 &&
    !!accountHolderName.trim() &&
    step === 'form';

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => router.back()}>
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      <div className={styles.headingWrap}>
        <h1 className={styles.title}>Request a Loan</h1>
        <p className={styles.subtitle}>Borrow from the {stokvel?.name} pool</p>
      </div>

      {/* Eligibility info */}
      <div className={styles.eligibleCard}>
        <div className={styles.eligibleRow}>
          <span>Your contributions</span>
          <strong>R {fmt(profile?.stats?.totalContributed ?? 0)}</strong>
        </div>
        <div className={styles.eligibleRow}>
          <span>Pool available</span>
          <strong>R {fmt(maxLoan)}</strong>
        </div>
        <div className={`${styles.eligibleRow} ${styles.eligibleCheck}`}>
          <span>✓ Eligible to borrow</span>
          <strong>up to R {fmt(maxLoan)}</strong>
        </div>
      </div>

      {/* Amount */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Loan Amount</p>
        <div className={styles.amountCard}>
          <span className={styles.currency}>R</span>
          <input
            className={styles.amountInput}
            type="number"
            min={MIN_LOAN}
            max={maxLoan}
            placeholder="0"
            value={rawAmount}
            onChange={e => { setRawAmount(e.target.value); setFormError(''); }}
            disabled={step === 'submitting'}
            autoFocus
          />
        </div>
        <p className={styles.amountHint}>Min R {fmt(MIN_LOAN)} · Max R {fmt(maxLoan)}</p>
      </div>

      {/* Fixed loan terms */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Loan Terms</p>
        <div className={styles.termsCard}>
          <div className={styles.termRow}>
            <span>Interest rate</span>
            <span className={styles.termValue}>30% fixed</span>
          </div>
          <div className={styles.termRow}>
            <span>Repayment type</span>
            <span className={styles.termValue}>Lump sum</span>
          </div>
          <div className={styles.termRow}>
            <span>Term</span>
            <span className={styles.termValue}>30 days</span>
          </div>
          <div className={styles.termRow}>
            <span>Interest split</span>
            <span className={styles.termValue}>50% you · 50% members</span>
          </div>
        </div>
      </div>

      {/* Bank details */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Disbursement Bank Account</p>
        <div className={styles.formCard}>
          <div className={styles.field}>
            <label className={styles.label}>Bank</label>
            <select
              className={styles.select}
              value={bankCode}
              onChange={e => { setBankCode(e.target.value); setFormError(''); }}
              disabled={step === 'submitting'}
            >
              <option value="">Select your bank</option>
              {SA_BANKS.map(b => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Account Number</label>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              placeholder="e.g. 1234567890"
              value={accountNumber}
              onChange={e => { setAccountNumber(e.target.value); setFormError(''); }}
              disabled={step === 'submitting'}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Account Holder Name</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Full name as on bank account"
              value={accountHolderName}
              onChange={e => { setAccountHolderName(e.target.value); setFormError(''); }}
              disabled={step === 'submitting'}
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      {amount >= MIN_LOAN && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Loan Summary</p>
          <div className={styles.summaryCard}>
            <div className={styles.summaryRow}>
              <span>Principal (you receive)</span>
              <span>R {fmt(amount)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Interest (30%)</span>
              <span>R {fmt(interest)}</span>
            </div>
            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
              <span>Total to repay</span>
              <span>R {fmt(totalAmount)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Due within</span>
              <span>30 days of disbursement</span>
            </div>
          </div>
        </div>
      )}

      {formError && <p className={styles.formError}>{formError}</p>}

      <button
        className={`${styles.submitBtn} ${canSubmit ? styles.submitActive : styles.submitDimmed}`}
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {step === 'submitting'
          ? <><div className={styles.btnSpinner} /> Submitting…</>
          : 'Submit Loan Request'
        }
      </button>
    </div>
  );
}
