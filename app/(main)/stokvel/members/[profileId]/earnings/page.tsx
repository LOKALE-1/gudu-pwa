'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  doc, getDoc, collection, query, orderBy, limit, onSnapshot, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import type { Profile } from '@/types';
import styles from './earnings.module.css';

interface EarningRecord {
  id: string;
  amount: number;
  type: 'borrower_credit' | 'member_distribution' | string;
  borrowerName?: string;
  loanId?: string;
  createdAt: number;
}

function toMs(ts: unknown): number {
  if (!ts) return 0;
  if (ts instanceof Timestamp) return ts.toMillis();
  if (typeof ts === 'number') return ts;
  return 0;
}

function fmt(n: number) {
  return (n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(ms: number) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function MemberEarningsPage() {
  const router = useRouter();
  const params = useParams();
  const targetProfileId = params.profileId as string;

  const { state } = useAuth();
  const myProfile = state.currentProfile;
  const isAdmin = myProfile?.role === 'CREATOR' || myProfile?.role === 'ADMIN';
  const isSelf = myProfile?.id === targetProfileId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [earnings, setEarnings] = useState<EarningRecord[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingEarnings, setLoadingEarnings] = useState(true);

  // Load profile info
  useEffect(() => {
    getDoc(doc(db, 'profiles', targetProfileId))
      .then(snap => {
        if (snap.exists()) setProfile({ id: snap.id, ...snap.data() } as Profile);
      })
      .finally(() => setLoadingProfile(false));
  }, [targetProfileId]);

  // Real-time earnings listener
  useEffect(() => {
    const q = query(
      collection(db, 'profiles', targetProfileId, 'interestEarnings'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );

    const unsub = onSnapshot(q, (snap) => {
      setEarnings(snap.docs.map(d => ({
        id: d.id,
        amount: d.data().amount ?? 0,
        type: d.data().type ?? 'member_distribution',
        borrowerName: d.data().borrowerName,
        loanId: d.data().loanId,
        createdAt: toMs(d.data().createdAt),
      })));
      setLoadingEarnings(false);
    }, () => setLoadingEarnings(false));

    return () => unsub();
  }, [targetProfileId]);

  // Only admin or self can view
  if (!isAdmin && !isSelf) {
    return (
      <div className={styles.page}>
        <p className={styles.denied}>You don&apos;t have permission to view this page.</p>
      </div>
    );
  }

  const totalEarned = profile?.interestEarned ?? earnings.reduce((s, e) => s + e.amount, 0);
  const loading = loadingProfile || loadingEarnings;

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => router.back()}>
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.avatar}>
          <span className={styles.avatarLetter}>
            {profile ? `${profile.displayName.charAt(0)}${profile.surname.charAt(0)}`.toUpperCase() : '?'}
          </span>
        </div>
        <div>
          <h1 className={styles.name}>
            {profile ? `${profile.displayName} ${profile.surname}` : '…'}
          </h1>
          <p className={styles.nameSub}>Earnings history</p>
        </div>
      </div>

      {/* Total earned card */}
      <div className={styles.totalCard}>
        <p className={styles.totalLabel}>Total Interest Earned</p>
        <p className={styles.totalAmount}>R {fmt(totalEarned)}</p>
        <p className={styles.totalSub}>Accumulated from all loan repayments</p>
      </div>

      {/* Earnings list */}
      {loading ? (
        <div className={styles.skeletonList}>
          {[...Array(5)].map((_, i) => <div key={i} className={styles.skeletonItem} />)}
        </div>
      ) : earnings.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33" />
            </svg>
          </div>
          <p className={styles.emptyText}>No earnings yet</p>
          <p className={styles.emptyHint}>Interest is earned when stokvel members repay loans</p>
        </div>
      ) : (
        <>
          <p className={styles.sectionLabel}>{earnings.length} earning{earnings.length !== 1 ? 's' : ''}</p>
          <div className={styles.list}>
            {earnings.map((e) => {
              const isBorrowerCredit = e.type === 'borrower_credit';
              return (
                <div key={e.id} className={styles.earningItem}>
                  <div className={`${styles.earningIcon} ${isBorrowerCredit ? styles.iconCredit : styles.iconShare}`}>
                    {isBorrowerCredit ? (
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                      </svg>
                    )}
                  </div>

                  <div className={styles.earningBody}>
                    <p className={styles.earningTitle}>
                      {isBorrowerCredit ? 'Borrower credit' : 'Member distribution'}
                    </p>
                    {e.borrowerName && (
                      <p className={styles.earningMeta}>
                        {isBorrowerCredit ? 'Your repayment bonus' : `From ${e.borrowerName}'s repayment`}
                      </p>
                    )}
                    <p className={styles.earningDate}>{formatDate(e.createdAt)}</p>
                  </div>

                  <div className={styles.earningRight}>
                    <p className={styles.earningAmount}>+ R {fmt(e.amount)}</p>
                    <span className={`${styles.typeBadge} ${isBorrowerCredit ? styles.badgeCredit : styles.badgeShare}`}>
                      {isBorrowerCredit ? 'Credit' : 'Share'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
