'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, orderBy, limit, onSnapshot,
  where, getDocs, Timestamp,
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import type { Profile } from '@/types';
import styles from './activity.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
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
    hour: '2-digit', minute: '2-digit',
  });
}
function formatDateShort(ms: number) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ContributionStatus = 'pending' | 'processing' | 'completed' | 'failed';
interface FeedItem {
  id: string;
  profileId: string;
  amount: number;
  status: ContributionStatus;
  createdAt: number;
}
interface ActiveMember {
  profileId: string;
  profile: Profile | null;
  totalContributed: number;
}
type LoanStatus = 'pending' | 'approved' | 'rejected' | 'disbursed' | 'active' | 'completed';
interface LoanItem {
  id: string;
  profileId: string;
  memberName: string;
  principalAmount: number;
  totalAmount: number;
  amountRepaid: number;
  remainingBalance: number;
  interestRate: number;
  status: LoanStatus;
  createdAt: number;
  dueDate?: number;
}

const LOAN_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Disbursed', value: 'disbursed' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Rejected', value: 'rejected' },
];

const LOAN_STATUS_COLORS: Record<string, string> = {
  pending:   styles.s_pending,
  approved:  styles.s_approved,
  rejected:  styles.s_rejected,
  disbursed: styles.s_disbursed,
  active:    styles.s_active,
  completed: styles.s_completed,
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function ActivityPage() {
  const { state } = useAuth();
  const stokvel = state.userStokvels[0] ?? null;
  const profile = state.currentProfile;
  const isAdmin = profile?.role === 'CREATOR' || profile?.role === 'ADMIN';

  const [tab, setTab] = useState(0);

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Activity</h1>
        <p className={styles.subtitle}>{stokvel?.name ?? 'your stokvel'}</p>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {['Transactions', 'Members', 'Loans'].map((t, i) => (
          <button
            key={t}
            className={`${styles.tab} ${tab === i ? styles.tabActive : ''}`}
            onClick={() => setTab(i)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <TransactionsTab stokvel={stokvel} profile={profile} isAdmin={isAdmin} />}
      {tab === 1 && <MembersTab stokvel={stokvel} />}
      {tab === 2 && <LoansTab stokvel={stokvel} profile={profile} isAdmin={isAdmin} />}
    </div>
  );
}

// ── Tab 1: Transactions ───────────────────────────────────────────────────────
function TransactionsTab({ stokvel, profile, isAdmin }: { stokvel: any; profile: any; isAdmin: boolean }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!stokvel) { setLoading(false); return; }

    const q = query(
      collection(db, 'stokvels', stokvel.id, 'contributions'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );

    const unsub = onSnapshot(q, (snap) => {
      const all: FeedItem[] = snap.docs.map(d => ({
        id: d.id,
        profileId: d.data().profileId ?? '',
        amount: d.data().amount ?? 0,
        status: (d.data().status ?? 'pending').toLowerCase() as ContributionStatus,
        createdAt: toMs(d.data().createdAt),
      }));
      // Non-admin only sees their own
      setItems(isAdmin ? all : all.filter(i => i.profileId === profile?.id));
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [stokvel?.id, isAdmin, profile?.id]);

  if (loading) return <Skeleton />;
  if (items.length === 0) return <Empty text="No contributions yet" hint="Contributions from members will appear here" />;

  return (
    <div className={styles.list}>
      {items.map(item => (
        <div key={item.id} className={styles.item}>
          <div className={`${styles.itemIcon} ${styles[item.status]}`}>
            {item.status === 'completed' ? (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            ) : item.status === 'failed' ? (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            )}
          </div>
          <div className={styles.itemBody}>
            <p className={styles.itemTitle}>
              {item.profileId === profile?.id ? 'Your contribution' : 'Member contribution'}
            </p>
            <p className={styles.itemDate}>{formatDate(item.createdAt)}</p>
          </div>
          <div className={styles.itemRight}>
            <p className={styles.itemAmount}>R {fmt(item.amount)}</p>
            <span className={`${styles.statusBadge} ${styles[item.status]}`}>{item.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab 2: Members ────────────────────────────────────────────────────────────
function MembersTab({ stokvel }: { stokvel: any }) {
  const router = useRouter();
  const [members, setMembers] = useState<ActiveMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!stokvel) { setLoading(false); return; }

    // Real-time stokvel listener to pick up member changes
    const unsub = onSnapshot(
      collection(db, 'stokvels', stokvel.id, 'members'),
      async (snap) => {
        const active = snap.docs
          .filter(d => d.data().status === 'ACTIVE')
          .map(d => ({ profileId: d.id, profile: null as Profile | null, totalContributed: 0 }));

        // Fetch profiles in batches of 10
        const batches: typeof active[] = [];
        for (let i = 0; i < active.length; i += 10) batches.push(active.slice(i, i + 10));

        const results = (await Promise.all(
          batches.map(batch =>
            getDocs(query(
              collection(db, 'profiles'),
              where('id', 'in', batch.map(m => m.profileId))
            ))
          )
        )).flatMap(s => s.docs);

        const profileMap = Object.fromEntries(
          results.map(d => [d.id, { id: d.id, ...d.data() } as Profile])
        );

        const enriched = active.map(m => ({
          ...m,
          profile: profileMap[m.profileId] ?? null,
          totalContributed: profileMap[m.profileId]?.stats?.totalContributed ?? 0,
        }));

        enriched.sort((a, b) => b.totalContributed - a.totalContributed);
        setMembers(enriched);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [stokvel?.id]);

  if (loading) return <Skeleton />;
  if (members.length === 0) return <Empty text="No members yet" hint="Active members will appear here" />;

  return (
    <>
      <p className={styles.memberCount}>{members.length} member{members.length !== 1 ? 's' : ''} in this stokvel</p>
      <div className={styles.list}>
        {members.map(m => {
          const p = m.profile;
          const initials = p ? `${p.displayName.charAt(0)}${p.surname.charAt(0)}`.toUpperCase() : '?';
          const roleCls = p?.role === 'CREATOR' ? styles.avatarCreator : p?.role === 'ADMIN' ? styles.avatarAdmin : styles.avatarMember;
          return (
            <div
              key={m.profileId}
              className={styles.memberRow}
              onClick={() => router.push(`/stokvel/members/${m.profileId}/earnings`)}
            >
              <div className={`${styles.memberAvatar} ${roleCls}`}>
                <span className={styles.memberAvatarLetter}>{initials}</span>
              </div>
              <div className={styles.memberRowBody}>
                <p className={styles.memberRowName}>
                  {p ? `${p.displayName} ${p.surname}` : m.profileId}
                </p>
                <p className={styles.memberRowSub}>Contributed: R {fmt(m.totalContributed)}</p>
              </div>
              <div className={styles.memberRowRight}>
                {p?.role && (
                  <span className={`${styles.memberRoleBadge} ${p.role === 'CREATOR' ? styles.badgeCreator : p.role === 'ADMIN' ? styles.badgeAdmin : styles.badgeMember}`}>
                    {p.role}
                  </span>
                )}
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className={styles.memberChevron}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Tab 3: Loans ──────────────────────────────────────────────────────────────
function LoansTab({ stokvel, profile, isAdmin }: { stokvel: any; profile: any; isAdmin: boolean }) {
  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!stokvel) { setLoading(false); return; }

    const col = collection(db, 'stokvels', stokvel.id, 'loans');
    const q = isAdmin
      ? query(col, limit(100))
      : query(col, where('profileId', '==', profile?.id ?? ''), limit(50));

    const unsub = onSnapshot(q, (snap) => {
      const all: LoanItem[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          profileId: data.profileId ?? '',
          memberName: data.memberName ?? '',
          principalAmount: data.principalAmount ?? 0,
          totalAmount: data.totalAmount ?? 0,
          amountRepaid: data.amountRepaid ?? 0,
          remainingBalance: data.remainingBalance ?? 0,
          interestRate: data.interestRate ?? 30,
          status: (data.status ?? 'pending').toLowerCase() as LoanStatus,
          createdAt: toMs(data.createdAt),
          dueDate: data.dueDate,
        };
      });
      all.sort((a, b) => b.createdAt - a.createdAt);
      setLoans(all);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [stokvel?.id, isAdmin, profile?.id]);

  const filtered = filter === 'all' ? loans : loans.filter(l => l.status === filter);

  if (loading) return <Skeleton />;

  return (
    <>
      {/* Filter chips */}
      <div className={styles.filterScroll}>
        {LOAN_FILTERS.map(f => (
          <button
            key={f.value}
            className={`${styles.filterChip} ${filter === f.value ? styles.filterChipActive : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            {f.value !== 'all' && (
              <span className={styles.filterCount}>
                {loans.filter(l => l.status === f.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Empty text={`No ${filter === 'all' ? '' : filter} loans`} hint="Loans will appear here once requested" />
      ) : (
        <div className={styles.list}>
          {filtered.map(loan => {
            const progress = loan.totalAmount > 0 ? (loan.amountRepaid / loan.totalAmount) : 0;
            const isActive = loan.status === 'active';
            const isOverdue = loan.dueDate && Date.now() > loan.dueDate;

            return (
              <div key={loan.id} className={`${styles.loanCard} ${isOverdue ? styles.loanCardOverdue : ''}`}>
                <div className={styles.loanCardTop}>
                  <div>
                    <p className={styles.loanAmount}>R {fmt(loan.principalAmount)}</p>
                    {isAdmin && loan.memberName && (
                      <p className={styles.loanMember}>{loan.memberName}</p>
                    )}
                    <p className={styles.loanMeta}>
                      30 days · {loan.interestRate ?? 30}% interest
                    </p>
                  </div>
                  <span className={`${styles.loanBadge} ${LOAN_STATUS_COLORS[loan.status] ?? ''}`}>
                    {loan.status}
                  </span>
                </div>

                {isActive && (
                  <div className={styles.loanProgress}>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                    <div className={styles.progressLabels}>
                      <span>Repaid: R {fmt(loan.amountRepaid)}</span>
                      <span>{Math.round(progress * 100)}%</span>
                    </div>
                  </div>
                )}

                {loan.status !== 'completed' && loan.status !== 'rejected' && (
                  <p className={styles.loanTotal}>Total to repay: R {fmt(loan.totalAmount)}</p>
                )}

                <p className={styles.loanDate}>{formatDateShort(loan.createdAt)}</p>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className={styles.skeletonList}>
      {[...Array(5)].map((_, i) => <div key={i} className={styles.skeletonItem} />)}
    </div>
  );
}

function Empty({ text, hint }: { text: string; hint: string }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
        </svg>
      </div>
      <p className={styles.emptyText}>{text}</p>
      <p className={styles.emptyHint}>{hint}</p>
    </div>
  );
}
