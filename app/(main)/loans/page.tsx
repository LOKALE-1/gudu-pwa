'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/context/AuthContext';
import { db, functions } from '@/lib/firebase';
import styles from './loans.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────
type LoanStatus =
  | 'pending' | 'approved' | 'rejected'
  | 'disbursed' | 'active' | 'completed' | 'defaulted';

interface Loan {
  id: string;
  profileId: string;
  userId: string;
  memberName: string;
  principalAmount: number;
  interestRate: number;
  totalInterest: number;
  totalAmount: number;
  amountRepaid: number;
  remainingBalance: number;
  status: LoanStatus;
  transferStatus?: string;
  dueDate?: number;
  missedPayments?: number;
  lastPenaltyAppliedAt?: { seconds: number } | null;
  createdAt: { seconds: number } | null;
  approvedAt?: { seconds: number } | null;
  disbursedAt?: { seconds: number } | null;
  approvedBy?: string;
  approvedByName?: string;
  rejectionReason?: string;
  memberTotalContributed?: number;
  poolBalanceAtApplication?: number;
  borrowerBankName?: string;
  borrowerAccountNumber?: string;
  borrowerAccountName?: string;
  borrowerBankCode?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return (n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_LABEL: Record<LoanStatus, string> = {
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  disbursed: 'Disbursed',
  active: 'Active',
  completed: 'Completed',
  defaulted: 'Defaulted',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function LoansPage() {
  const router = useRouter();
  const { state } = useAuth();
  const profile = state.currentProfile;
  const stokvel = state.userStokvels[0] ?? null;
  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'CREATOR';

  const [myLoans, setMyLoans] = useState<Loan[]>([]);
  const [pendingLoans, setPendingLoans] = useState<Loan[]>([]);
  const [approvedLoans, setApprovedLoans] = useState<Loan[]>([]);
  const [activeLoans, setActiveLoans] = useState<Loan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [tab, setTab] = useState<'requests' | 'active' | 'mine'>('requests');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null); // loanId being acted on
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!stokvel || !profile) { setIsLoading(false); return; }
    const unsubs: (() => void)[] = [];

    unsubs.push(
      onSnapshot(
        query(collection(db, 'stokvels', stokvel.id, 'loans'), where('profileId', '==', profile.id)),
        snap => {
          const loans = snap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
          loans.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
          setMyLoans(loans);
          setIsLoading(false);
        }
      )
    );

    if (isAdmin) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'stokvels', stokvel.id, 'loans'), where('status', '==', 'pending')),
          snap => {
            const loans = snap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
            loans.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
            setPendingLoans(loans);
          }
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'stokvels', stokvel.id, 'loans'), where('status', '==', 'approved')),
          snap => {
            const loans = snap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
            loans.sort((a, b) => (b.approvedAt?.seconds ?? 0) - (a.approvedAt?.seconds ?? 0));
            setApprovedLoans(loans);
          }
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'stokvels', stokvel.id, 'loans'), where('status', 'in', ['disbursed', 'active'])),
          snap => {
            const loans = snap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
            loans.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
            setActiveLoans(loans);
          }
        )
      );
    }

    return () => unsubs.forEach(u => u());
  }, [stokvel?.id, profile?.id, isAdmin]);

  // ── Approve ───────────────────────────────────────────────────────────────
  async function handleApprove(loan: Loan) {
    if (!stokvel || !profile || actionLoading) return;
    if ((stokvel.poolBalance ?? 0) < loan.principalAmount) {
      setActionError(`Insufficient pool balance. Available: R${fmt(stokvel.poolBalance ?? 0)}`);
      return;
    }
    setActionLoading(loan.id);
    setActionError('');
    try {
      await updateDoc(doc(db, 'stokvels', stokvel.id, 'loans', loan.id), {
        status: 'approved',
        approvedBy: profile.id,
        approvedByName: `${profile.displayName} ${profile.surname}`.trim(),
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setActionError('Failed to approve. Please try again.');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  async function handleReject(loan: Loan) {
    if (!stokvel || !rejectReason.trim() || actionLoading) return;
    setActionLoading(loan.id);
    setActionError('');
    try {
      await updateDoc(doc(db, 'stokvels', stokvel.id, 'loans', loan.id), {
        status: 'rejected',
        rejectionReason: rejectReason.trim(),
        updatedAt: serverTimestamp(),
      });
      setRejectingId(null);
      setRejectReason('');
    } catch (err) {
      setActionError('Failed to reject. Please try again.');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  // ── Disburse (calls CF disburseLoan) ──────────────────────────────────────
  async function handleDisburse(loan: Loan) {
    if (!stokvel || actionLoading) return;
    setActionLoading(loan.id);
    setActionError('');
    try {
      const disburseLoan = httpsCallable(functions, 'disburseLoan');
      await disburseLoan({ stokvelId: stokvel.id, loanId: loan.id });
      // CF updates loan status to 'disbursed' and deducts pool — no local update needed
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Disbursement failed. Please try again.';
      setActionError(msg);
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  // ── Activate (manual override when webhook doesn't fire in test mode) ─────
  async function handleActivate(loan: Loan) {
    if (!stokvel || actionLoading) return;
    setActionLoading(loan.id);
    setActionError('');
    try {
      await updateDoc(doc(db, 'stokvels', stokvel.id, 'loans', loan.id), {
        status: 'active',
        transferStatus: 'confirmed',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setActionError('Failed to activate loan. Please try again.');
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  }

  // ── Loan card (member + admin active tab) ─────────────────────────────────
  function LoanCard({ loan, showRepay = false }: { loan: Loan; showRepay?: boolean }) {
    const progress = loan.totalAmount > 0
      ? Math.min(100, ((loan.amountRepaid ?? 0) / loan.totalAmount) * 100)
      : 0;
    const isOverdue = loan.dueDate
      && Date.now() > loan.dueDate
      && (loan.status === 'active' || loan.status === 'disbursed');
    const isDisbursed = loan.status === 'disbursed';
    const isActive = loan.status === 'active' || isDisbursed;

    return (
      <div className={`${styles.loanCard} ${isOverdue ? styles.overdueCard : ''}`}>
        <div className={styles.cardHeader}>
          <div>
            {showRepay && <p className={styles.adminName}>{loan.memberName}</p>}
            <p className={styles.cardAmount}>R {fmt(loan.principalAmount)}</p>
            <p className={styles.cardSub}>30% interest · R {fmt(loan.totalAmount)} total</p>
          </div>
          <span className={`${styles.badge} ${styles[`s_${loan.status}`]}`}>
            {STATUS_LABEL[loan.status]}
          </span>
        </div>

        {isActive && (
          <>
            <div className={styles.progressWrap}>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
              <div className={styles.progressLabels}>
                <span>Repaid: R {fmt(loan.amountRepaid ?? 0)}</span>
                <span>Remaining: R {fmt(loan.remainingBalance)}</span>
              </div>
            </div>
            {loan.dueDate && (
              <p className={`${styles.dueDate} ${isOverdue ? styles.dueDateOverdue : ''}`}>
                Due: {fmtDate(loan.dueDate)}{isOverdue ? ' · OVERDUE' : ''}
              </p>
            )}
            {isOverdue && loan.lastPenaltyAppliedAt && (
              <p className={styles.overdueWarning}>
                ⚠ Overdue — 30% penalty applied{(loan.missedPayments ?? 0) > 1 ? ` (${loan.missedPayments} times)` : ''}. New balance: R {fmt(loan.remainingBalance)}
              </p>
            )}
            {isOverdue && !loan.lastPenaltyAppliedAt && (
              <p className={styles.overdueWarning}>⚠ Overdue — 30% penalty will be applied today</p>
            )}
            {/* Admin: Activate button when disbursed but webhook hasn't fired */}
            {showRepay && isDisbursed && (
              <button
                className={styles.activateBtn}
                onClick={() => handleActivate(loan)}
                disabled={actionLoading === loan.id}
              >
                {actionLoading === loan.id ? 'Activating…' : 'Confirm & Activate Loan'}
              </button>
            )}
            {/* Member: repay button */}
            {!showRepay && loan.status === 'active' && (
              <button
                className={styles.repayBtn}
                onClick={() => router.push(`/loans/repay/${loan.id}`)}
              >
                Make a Repayment
              </button>
            )}
          </>
        )}

        {loan.status === 'pending' && (
          <p className={styles.statusNote}>Awaiting admin approval</p>
        )}
        {loan.status === 'approved' && (
          <p className={styles.statusNote}>Approved — awaiting disbursement</p>
        )}
        {loan.status === 'completed' && (
          <p className={`${styles.statusNote} ${styles.statusCompleted}`}>✓ Fully repaid</p>
        )}
        {loan.status === 'rejected' && loan.rejectionReason && (
          <p className={styles.statusRejected}>Not approved: {loan.rejectionReason}</p>
        )}
        {loan.createdAt?.seconds && (
          <p className={styles.cardDate}>Applied {fmtDate(loan.createdAt.seconds * 1000)}</p>
        )}
      </div>
    );
  }

  // ── Admin pending card ────────────────────────────────────────────────────
  function PendingCard({ loan }: { loan: Loan }) {
    const insufficient = (stokvel?.poolBalance ?? 0) < loan.principalAmount;
    const isRejecting = rejectingId === loan.id;
    const isActing = actionLoading === loan.id;

    return (
      <div className={styles.adminCard}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.adminName}>{loan.memberName}</p>
            {loan.createdAt?.seconds && (
              <p className={styles.cardDate}>{fmtDate(loan.createdAt.seconds * 1000)}</p>
            )}
          </div>
          <span className={`${styles.badge} ${styles.s_pending}`}>Pending</span>
        </div>

        <div className={styles.amountBreakdown}>
          <div className={styles.breakdownRow}><span>Principal</span><span>R {fmt(loan.principalAmount)}</span></div>
          <div className={styles.breakdownRow}><span>Interest (30%)</span><span>R {fmt(loan.totalInterest)}</span></div>
          <div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
            <span>Total to repay</span><span>R {fmt(loan.totalAmount)}</span>
          </div>
        </div>

        {loan.borrowerBankName && (
          <div className={styles.bankBox}>
            <div className={styles.bankRow}><span>Bank</span><span>{loan.borrowerBankName}</span></div>
            <div className={styles.bankRow}><span>Account</span><span>{loan.borrowerAccountNumber}</span></div>
            <div className={styles.bankRow}><span>Holder</span><span>{loan.borrowerAccountName}</span></div>
          </div>
        )}

        {insufficient && (
          <p className={styles.insufficientNote}>
            ⚠ Pool only has R {fmt(stokvel?.poolBalance ?? 0)} — cannot approve
          </p>
        )}

        {!isRejecting ? (
          <div className={styles.actionRow}>
            <button
              className={styles.rejectBtn}
              onClick={() => { setRejectingId(loan.id); setRejectReason(''); setActionError(''); }}
              disabled={!!actionLoading}
            >Reject</button>
            <button
              className={styles.approveBtn}
              onClick={() => handleApprove(loan)}
              disabled={!!actionLoading || insufficient}
            >{isActing ? 'Approving…' : 'Approve'}</button>
          </div>
        ) : (
          <div className={styles.rejectBlock}>
            <textarea
              className={styles.rejectInput}
              placeholder="Reason for rejection (required)"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={2}
            />
            <div className={styles.actionRow}>
              <button className={styles.cancelBtn} onClick={() => { setRejectingId(null); setRejectReason(''); }}>
                Cancel
              </button>
              <button
                className={styles.rejectConfirmBtn}
                onClick={() => handleReject(loan)}
                disabled={!!actionLoading || !rejectReason.trim()}
              >{isActing ? 'Rejecting…' : 'Confirm Reject'}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Admin approved card — shows Disburse button ───────────────────────────
  function ApprovedCard({ loan }: { loan: Loan }) {
    const isActing = actionLoading === loan.id;

    return (
      <div className={styles.adminCard}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.adminName}>{loan.memberName}</p>
            {loan.approvedAt?.seconds && (
              <p className={styles.cardDate}>Approved {fmtDate(loan.approvedAt.seconds * 1000)}</p>
            )}
          </div>
          <span className={`${styles.badge} ${styles.s_approved}`}>Approved</span>
        </div>

        <div className={styles.amountBreakdown}>
          <div className={styles.breakdownRow}><span>Principal</span><span>R {fmt(loan.principalAmount)}</span></div>
          <div className={styles.breakdownRow}><span>Interest</span><span>R {fmt(loan.totalInterest)}</span></div>
          <div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
            <span>Total to repay</span><span>R {fmt(loan.totalAmount)}</span>
          </div>
        </div>

        {loan.borrowerBankName && (
          <div className={styles.bankBox}>
            <div className={styles.bankRow}><span>Bank</span><span>{loan.borrowerBankName}</span></div>
            <div className={styles.bankRow}><span>Account</span><span>{loan.borrowerAccountNumber}</span></div>
            <div className={styles.bankRow}><span>Holder</span><span>{loan.borrowerAccountName}</span></div>
          </div>
        )}

        <button
          className={styles.disburseBtn}
          onClick={() => handleDisburse(loan)}
          disabled={isActing}
        >
          {isActing
            ? <><span className={styles.btnSpinnerDark} /> Disbursing…</>
            : `Disburse R ${fmt(loan.principalAmount)} to ${loan.memberName.split(' ')[0]}`
          }
        </button>
        <p className={styles.disburseNote}>
          R {fmt(loan.principalAmount)} will be transferred to their bank account and deducted from the pool.
        </p>
      </div>
    );
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.skeletonTitle} />
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
    );
  }

  if (!stokvel) {
    return (
      <div className={styles.page}>
        <p className={styles.emptyText}>Join a stokvel first to access loans.</p>
      </div>
    );
  }

  const hasOpenLoan = myLoans.some(l =>
    ['pending', 'approved', 'disbursed', 'active'].includes(l.status)
  );

  // ── Admin view ────────────────────────────────────────────────────────────
  if (isAdmin) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.title}>Loans</h1>
          <span className={styles.poolChip}>Pool: R {fmt(stokvel.poolBalance ?? 0)}</span>
        </div>

        {actionError && (
          <div className={styles.errorBanner}>
            {actionError}
            <button className={styles.errorDismiss} onClick={() => setActionError('')}>✕</button>
          </div>
        )}

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'requests' ? styles.tabActive : ''}`} onClick={() => setTab('requests')}>
            Requests
            {(pendingLoans.length + approvedLoans.length) > 0 && (
              <span className={styles.tabCount}>{pendingLoans.length + approvedLoans.length}</span>
            )}
          </button>
          <button className={`${styles.tab} ${tab === 'active' ? styles.tabActive : ''}`} onClick={() => setTab('active')}>
            Active
            {activeLoans.length > 0 && <span className={styles.tabCount}>{activeLoans.length}</span>}
          </button>
          <button className={`${styles.tab} ${tab === 'mine' ? styles.tabActive : ''}`} onClick={() => setTab('mine')}>
            My Loans
          </button>
        </div>

        {tab === 'requests' && (
          <div className={styles.list}>
            {pendingLoans.length === 0 && approvedLoans.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>No pending requests</p>
                <p className={styles.emptyText}>New loan requests will appear here</p>
              </div>
            ) : (
              <>
                {pendingLoans.map(l => <PendingCard key={l.id} loan={l} />)}
                {approvedLoans.length > 0 && (
                  <>
                    <p className={styles.sectionLabel}>Approved — Ready to Disburse</p>
                    {approvedLoans.map(l => <ApprovedCard key={l.id} loan={l} />)}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'active' && (
          <div className={styles.list}>
            {activeLoans.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>No active loans</p>
              </div>
            ) : (
              activeLoans.map(l => <LoanCard key={l.id} loan={l} showRepay={true} />)
            )}
          </div>
        )}

        {tab === 'mine' && (
          <div className={styles.list}>
            {!hasOpenLoan && (
              <button className={styles.requestBtnTop} onClick={() => router.push('/loans/request')}>
                + Request a Loan
              </button>
            )}
            {myLoans.length === 0 ? (
              <div className={styles.emptyState}><p className={styles.emptyTitle}>No loans yet</p></div>
            ) : (
              myLoans.map(l => <LoanCard key={l.id} loan={l} />)
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Member view ───────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>My Loans</h1>
      </div>

      {myLoans.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125H18M3 10.5h1.125C4.746 10.5 5.25 11.004 5.25 11.625v1.5c0 .621-.504 1.125-1.125 1.125H3" />
            </svg>
          </div>
          <p className={styles.emptyTitle}>No loans yet</p>
          <p className={styles.emptyText}>Borrow from the stokvel pool with 30% interest</p>
          <button className={styles.requestBtn} onClick={() => router.push('/loans/request')}>
            Request a Loan
          </button>
        </div>
      ) : (
        <div className={styles.list}>
          {!hasOpenLoan && (
            <button className={styles.requestBtnTop} onClick={() => router.push('/loans/request')}>
              + Request a Loan
            </button>
          )}
          {myLoans.map(l => <LoanCard key={l.id} loan={l} />)}
        </div>
      )}
    </div>
  );
}
