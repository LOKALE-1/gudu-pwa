'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, getDocs, increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import type { Profile } from '@/types';
import styles from './manage.module.css';

interface ActiveMember {
  profileId: string;
  role: string;
  status: string;
  joinedAt: number;
  profile: Profile | null;
}

function fmt(n: number) {
  return (n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initials(p: Profile | null) {
  if (!p) return '?';
  return `${p.displayName.charAt(0)}${p.surname.charAt(0)}`.toUpperCase();
}

export default function ManageMembersPage() {
  const router = useRouter();
  const { state } = useAuth();
  const profile = state.currentProfile;
  const stokvel = state.userStokvels[0] ?? null;

  const isAdmin = profile?.role === 'CREATOR' || profile?.role === 'ADMIN';
  const isCreator = profile?.role === 'CREATOR';

  const [members, setMembers] = useState<ActiveMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ActiveMember | null>(null);
  const [error, setError] = useState('');

  // Real-time listener for ACTIVE members
  useEffect(() => {
    if (!stokvel || !isAdmin) { setLoading(false); return; }

    const q = query(
      collection(db, 'stokvels', stokvel.id, 'members'),
      where('status', '==', 'ACTIVE'),
    );

    const unsub = onSnapshot(q, async (snap) => {
      const memberDocs = snap.docs.map(d => ({
        profileId: d.id,
        role: d.data().role ?? 'MEMBER',
        status: d.data().status ?? 'ACTIVE',
        joinedAt: d.data().joinedAt ?? 0,
        profile: null as Profile | null,
      }));

      // Fetch profiles in parallel
      const withProfiles = await Promise.all(
        memberDocs.map(async (m) => {
          try {
            const pSnap = await getDocs(
              query(collection(db, 'profiles'), where('id', '==', m.profileId))
            );
            if (!pSnap.empty) {
              return { ...m, profile: { id: pSnap.docs[0].id, ...pSnap.docs[0].data() } as Profile };
            }
            // Fallback: direct doc
            const { getDoc } = await import('firebase/firestore');
            const direct = await getDoc(doc(db, 'profiles', m.profileId));
            if (direct.exists()) {
              return { ...m, profile: { id: direct.id, ...direct.data() } as Profile };
            }
          } catch { /* non-fatal */ }
          return m;
        })
      );

      // Sort: CREATOR first, then ADMIN, then MEMBER, then by contribution
      withProfiles.sort((a, b) => {
        const order = { CREATOR: 0, ADMIN: 1, MEMBER: 2 };
        const ro = (order[a.role as keyof typeof order] ?? 2) - (order[b.role as keyof typeof order] ?? 2);
        if (ro !== 0) return ro;
        return (b.profile?.stats?.totalContributed ?? 0) - (a.profile?.stats?.totalContributed ?? 0);
      });

      setMembers(withProfiles);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [stokvel?.id, isAdmin]);

  async function handleAppoint(member: ActiveMember) {
    if (!stokvel || actionId) return;
    setActionId(member.profileId);
    setError('');
    try {
      await updateDoc(doc(db, 'profiles', member.profileId), { role: 'ADMIN' });
      await updateDoc(doc(db, 'stokvels', stokvel.id, 'members', member.profileId), { role: 'ADMIN' });
    } catch {
      setError('Failed to appoint admin. Please try again.');
    } finally {
      setActionId(null);
    }
  }

  async function handleDemote(member: ActiveMember) {
    if (!stokvel || actionId) return;
    setActionId(member.profileId);
    setError('');
    try {
      await updateDoc(doc(db, 'profiles', member.profileId), { role: 'MEMBER' });
      await updateDoc(doc(db, 'stokvels', stokvel.id, 'members', member.profileId), { role: 'MEMBER' });
    } catch {
      setError('Failed to demote admin. Please try again.');
    } finally {
      setActionId(null);
    }
  }

  async function handleRemove(member: ActiveMember) {
    if (!stokvel || actionId) return;
    setActionId(member.profileId);
    setError('');
    setConfirmRemove(null);
    try {
      await updateDoc(doc(db, 'stokvels', stokvel.id, 'members', member.profileId), {
        status: 'REMOVED',
        removedAt: Date.now(),
      });
      await updateDoc(doc(db, 'stokvels', stokvel.id), {
        memberCount: increment(-1),
      });
      await updateDoc(doc(db, 'profiles', member.profileId), {
        stokvelId: null,
        role: 'MEMBER',
      });
    } catch {
      setError('Failed to remove member. Please try again.');
    } finally {
      setActionId(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <p className={styles.denied}>Admin access required.</p>
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
        <h1 className={styles.title}>Manage Members</h1>
        {stokvel && <p className={styles.subtitle}>{stokvel.name} · {members.length} active</p>}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {loading ? (
        <div className={styles.skeletonList}>
          {[...Array(4)].map((_, i) => <div key={i} className={styles.skeletonItem} />)}
        </div>
      ) : members.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>No active members yet.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {members.map((m) => {
            const p = m.profile;
            const isSelf = p?.id === profile?.id;
            const isMemberCreator = m.role === 'CREATOR';
            const isMemberAdmin = m.role === 'ADMIN';
            const canAct = !isSelf && !isMemberCreator && isCreator;
            const acting = actionId === m.profileId;

            return (
              <div key={m.profileId} className={styles.memberCard}>
                {/* Top row: avatar + info + role badge */}
                <div className={styles.cardTop}>
                  <button
                    className={styles.avatarBtn}
                    onClick={() => router.push(`/stokvel/members/${m.profileId}/earnings`)}
                    title="View earnings"
                  >
                    <div className={`${styles.avatar} ${isMemberCreator ? styles.avatarCreator : isMemberAdmin ? styles.avatarAdmin : styles.avatarMember}`}>
                      <span className={styles.avatarLetter}>{initials(p)}</span>
                    </div>
                  </button>

                  <div className={styles.cardInfo} onClick={() => router.push(`/stokvel/members/${m.profileId}/earnings`)} style={{ cursor: 'pointer' }}>
                    <p className={styles.memberName}>
                      {p ? `${p.displayName} ${p.surname}` : m.profileId}
                      {isSelf && <span className={styles.youTag}> (you)</span>}
                    </p>
                    <span className={`${styles.roleBadge} ${isMemberCreator ? styles.badgeCreator : isMemberAdmin ? styles.badgeAdmin : styles.badgeMember}`}>
                      {m.role}
                    </span>
                  </div>

                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className={styles.tapChevron}
                    onClick={() => router.push(`/stokvel/members/${m.profileId}/earnings`)}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>

                {/* Stats row */}
                <div className={styles.statsRow}>
                  <div className={styles.statChip}>
                    <span className={styles.statChipLabel}>Contributed</span>
                    <span className={styles.statChipValue}>R {fmt(p?.stats?.totalContributed ?? 0)}</span>
                  </div>
                  <div className={styles.statChip}>
                    <span className={styles.statChipLabel}>Debt</span>
                    <span className={`${styles.statChipValue} ${(p?.stats?.outstandingDebt ?? 0) > 0 ? styles.statRed : ''}`}>
                      R {fmt(p?.stats?.outstandingDebt ?? 0)}
                    </span>
                  </div>
                  <div className={styles.statChip}>
                    <span className={styles.statChipLabel}>Earned</span>
                    <span className={`${styles.statChipValue} ${styles.statGreen}`}>R {fmt(p?.interestEarned ?? 0)}</span>
                  </div>
                </div>

                {/* Admin actions (CREATOR only, not self, not creator) */}
                {canAct && (
                  <div className={styles.actionRow}>
                    {isMemberAdmin ? (
                      <button
                        className={styles.demoteBtn}
                        onClick={() => handleDemote(m)}
                        disabled={!!actionId}
                      >
                        {acting ? '…' : 'Remove Admin'}
                      </button>
                    ) : (
                      <button
                        className={styles.appointBtn}
                        onClick={() => handleAppoint(m)}
                        disabled={!!actionId}
                      >
                        {acting ? '…' : 'Make Admin'}
                      </button>
                    )}
                    <button
                      className={styles.removeBtn}
                      onClick={() => setConfirmRemove(m)}
                      disabled={!!actionId}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Remove confirmation dialog */}
      {confirmRemove && (
        <div className={styles.dialogOverlay} onClick={() => setConfirmRemove(null)}>
          <div className={styles.dialog} onClick={e => e.stopPropagation()}>
            <p className={styles.dialogTitle}>Remove Member?</p>
            <p className={styles.dialogBody}>
              <strong>{confirmRemove.profile?.displayName} {confirmRemove.profile?.surname}</strong> will
              lose access to this stokvel. Outstanding loans must still be repaid. Historical records will be preserved.
            </p>
            <div className={styles.dialogActions}>
              <button className={styles.dialogCancel} onClick={() => setConfirmRemove(null)}>Cancel</button>
              <button className={styles.dialogConfirm} onClick={() => handleRemove(confirmRemove)}>
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
