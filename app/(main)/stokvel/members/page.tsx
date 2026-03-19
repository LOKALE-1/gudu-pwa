'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, increment, arrayUnion,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import type { StokvelMember } from '@/types';
import styles from './members.module.css';

export default function PendingMembersPage() {
  const router = useRouter();
  const { state } = useAuth();
  const profile = state.currentProfile;
  const stokvel = state.userStokvels[0] ?? null;

  const [pending, setPending] = useState<StokvelMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isAdmin = profile?.role === 'CREATOR' || profile?.role === 'ADMIN';

  // Real-time listener for pending members
  useEffect(() => {
    if (!stokvel || !isAdmin) { setIsLoading(false); return; }

    const q = query(
      collection(db, 'stokvels', stokvel.id, 'members'),
      where('status', '==', 'PENDING'),
    );

    const unsub = onSnapshot(q, (snap) => {
      setPending(snap.docs.map((d) => d.data() as StokvelMember));
      setIsLoading(false);
    }, () => setIsLoading(false));

    return () => unsub();
  }, [stokvel?.id, isAdmin]);

  async function handleApprove(member: StokvelMember) {
    if (!stokvel || processingId) return;
    setProcessingId(member.profileId);
    setError('');
    const now = Date.now();
    try {
      // 1. Update member subcollection
      await updateDoc(doc(db, 'stokvels', stokvel.id, 'members', member.profileId), {
        status: 'ACTIVE',
        approvedAt: now,
      });
      // 2. Update stokvel memberCount + members array
      await updateDoc(doc(db, 'stokvels', stokvel.id), {
        memberCount: increment(1),
        members: arrayUnion({ ...member, status: 'ACTIVE', approvedAt: now }),
      });
      // 3. CRITICAL: Update profile — triggers cross-platform listener
      await updateDoc(doc(db, 'profiles', member.profileId), {
        stokvelId: stokvel.id,
        role: 'MEMBER',
      });
    } catch {
      setError(`Failed to approve ${member.displayName}. Please try again.`);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(member: StokvelMember) {
    if (!stokvel || processingId) return;
    setProcessingId(member.profileId);
    setError('');
    try {
      await updateDoc(doc(db, 'stokvels', stokvel.id, 'members', member.profileId), {
        status: 'REMOVED',
        removedAt: Date.now(),
      });
    } catch {
      setError(`Failed to reject ${member.displayName}. Please try again.`);
    } finally {
      setProcessingId(null);
    }
  }

  // ── Access denied ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <div className={styles.denied}>
          <p className={styles.deniedTitle}>Admin access required</p>
          <p className={styles.deniedSub}>Only the creator or admin can manage members.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => router.back()}>
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      <div className={styles.heading}>
        <h1 className={styles.title}>Pending Approvals</h1>
        {stokvel && <p className={styles.subtitle}>{stokvel.name}</p>}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {isLoading ? (
        <div className={styles.loadingRow}>
          <div className={styles.spinnerGold} />
          <span className={styles.loadingText}>Loading requests...</span>
        </div>
      ) : pending.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <p className={styles.emptyText}>No pending requests</p>
        </div>
      ) : (
        <>
          <div className={styles.countBadge}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            {pending.length} pending request{pending.length !== 1 ? 's' : ''}
          </div>

          <div className={styles.list}>
            {pending.map((member) => {
              const processing = processingId === member.profileId;
              const joinedDate = new Date(member.joinedAt).toLocaleDateString('en-ZA', {
                day: 'numeric', month: 'short', year: 'numeric',
              });
              return (
                <div key={member.profileId} className={styles.memberCard}>
                  <div className={styles.avatar}>
                    <span className={styles.avatarLetter}>
                      {(member.displayName ?? member.profileId ?? '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.memberInfo}>
                    <p className={styles.memberName}>
                      {member.displayName ?? member.profileId} {member.surname ?? ''}
                    </p>
                    <p className={styles.memberMeta}>Requested {joinedDate}</p>
                    <span className={styles.pendingBadge}>Pending</span>
                  </div>
                  <div className={styles.actions}>
                    <button
                      className={styles.rejectBtn}
                      onClick={() => handleReject(member)}
                      disabled={!!processingId}
                    >
                      {processing ? '...' : 'Reject'}
                    </button>
                    <button
                      className={styles.approveBtn}
                      onClick={() => handleApprove(member)}
                      disabled={!!processingId}
                    >
                      {processing ? (
                        '...'
                      ) : (
                        <>
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          Approve
                        </>
                      )}
                    </button>
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
