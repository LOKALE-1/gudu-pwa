'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, updateDoc, arrayUnion, increment, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import type { Profile } from '@/types';
import styles from './profile.module.css';

export default function ProfilePage() {
  const router = useRouter();
  const { state, signOut, switchProfile, dispatch } = useAuth();
  const profile = state.currentProfile;
  const user = state.user;

  // Find the stokvel that matches the active profile (not always index 0)
  const stokvel = profile?.stokvelId
    ? (state.userStokvels.find(s => s.id === profile.stokvelId) ?? null)
    : null;

  const isAdmin = profile?.role === 'CREATOR' || profile?.role === 'ADMIN';
  const canAddProfile = (state.allProfiles?.length ?? 1) < 3;
  const hasMultipleProfiles = (state.allProfiles?.length ?? 0) > 1;

  const roleCls =
    profile?.role === 'CREATOR' ? styles.roleCreator
    : profile?.role === 'ADMIN' ? styles.roleAdmin
    : styles.roleMember;

  // ── Add Profile modal state ─────────────────────────────────────────────────
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [apDisplayName, setApDisplayName] = useState('');
  const [apSurname, setApSurname] = useState('');
  const [apLoading, setApLoading] = useState(false);
  const [apError, setApError] = useState('');

  async function handleAddProfile() {
    if (!user || !apDisplayName.trim() || !apSurname.trim()) return;
    setApLoading(true);
    setApError('');
    try {
      // Check if any existing profile is already in a stokvel — inherit it (mirrors Android)
      let inheritedStokvelId: string | null = null;
      for (const p of state.allProfiles ?? []) {
        if (p.stokvelId) { inheritedStokvelId = p.stokvelId; break; }
      }

      const profileId = `${user.uid}_${Date.now()}`;
      const now = Date.now();
      const newProfile: Profile = {
        id: profileId,
        userId: user.uid,
        displayName: apDisplayName.trim(),
        surname: apSurname.trim(),
        role: 'MEMBER',
        stokvelId: inheritedStokvelId,
        photoUrl: null,
        createdAt: now,
        stats: { totalContributed: 0, totalBorrowed: 0, outstandingDebt: 0 },
        interestEarned: 0,
      };

      // 1. Create the profile doc
      await setDoc(doc(db, 'profiles', profileId), {
        ...newProfile,
        createdAt: serverTimestamp(),
      });

      // 2. Add profileId to user doc
      await updateDoc(doc(db, 'users', user.uid), {
        profileIds: arrayUnion(profileId),
      });

      // 3. If inheriting a stokvel — add as active member (mirrors Android addAdditionalProfile)
      if (inheritedStokvelId) {
        const memberEntry = {
          profileId,
          userId: user.uid,
          displayName: apDisplayName.trim(),
          surname: apSurname.trim(),
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: now,
          approvedAt: now,
        };

        // Add to members subcollection
        await setDoc(doc(db, 'stokvels', inheritedStokvelId, 'members', profileId), memberEntry);

        // Add to members array + increment memberCount
        await updateDoc(doc(db, 'stokvels', inheritedStokvelId), {
          members: arrayUnion(memberEntry),
          memberCount: increment(1),
        });
      }

      // Update in-memory allProfiles so switcher shows the new entry immediately
      dispatch({ type: 'SET_ALL_PROFILES', payload: [...(state.allProfiles ?? []), newProfile] });
      setShowAddProfile(false);
      setApDisplayName('');
      setApSurname('');
    } catch {
      setApError('Failed to create profile. Please try again.');
    } finally {
      setApLoading(false);
    }
  }

  function handleSwitch(p: Profile) {
    if (p.id === profile?.id) return; // already active
    switchProfile(p);
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Profile</h1>
        <p className={styles.subtitle}>Your account details</p>
      </div>

      {profile && (
        <div className={styles.stack}>
          {/* Avatar + name */}
          <div className={styles.avatarCard}>
            <div className={styles.avatar}>
              <span className={styles.avatarLetter}>
                {profile.displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className={styles.avatarName}>
                {profile.displayName} {profile.surname}
              </p>
              <p className={styles.avatarPhone}>{user?.phoneNumber}</p>
              {user?.email && <p className={styles.avatarEmail}>{user.email}</p>}
              <span className={`${styles.roleBadge} ${roleCls}`}>
                {profile.role}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className={styles.statsGrid}>
            <StatCard label="Total Contributed" value={`R ${(profile.stats?.totalContributed ?? 0).toFixed(2)}`} />
            <StatCard label="Interest Earned" value={`R ${(profile.interestEarned ?? 0).toFixed(2)}`} variant="success" />
            <StatCard label="Total Borrowed" value={`R ${(profile.stats?.totalBorrowed ?? 0).toFixed(2)}`} />
            <StatCard
              label="Outstanding Debt"
              value={`R ${(profile.stats?.outstandingDebt ?? 0).toFixed(2)}`}
              variant={(profile.stats?.outstandingDebt ?? 0) > 0 ? 'error' : undefined}
            />
          </div>

          {/* Profile switcher — only shown when the user has multiple profiles */}
          {hasMultipleProfiles && (
            <div className={styles.switcherSection}>
              <p className={styles.switcherLabel}>My Profiles</p>
              {state.allProfiles.map((p) => {
                const active = p.id === profile.id;
                const pRoleCls =
                  p.role === 'CREATOR' ? styles.roleCreator
                  : p.role === 'ADMIN' ? styles.roleAdmin
                  : styles.roleMember;
                return (
                  <button
                    key={p.id}
                    className={`${styles.switcherRow}${active ? ` ${styles.switcherRowActive}` : ''}`}
                    onClick={() => handleSwitch(p)}
                    disabled={active}
                  >
                    <div className={styles.switcherLeft}>
                      <div className={`${styles.switcherAvatar}${active ? ` ${styles.switcherAvatarActive}` : ''}`}>
                        <span className={styles.switcherAvatarLetter}>
                          {p.displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className={styles.switcherInfo}>
                        <p className={styles.switcherName}>
                          {p.displayName} {p.surname}
                        </p>
                        <p className={styles.switcherSub}>
                          {p.stokvelId ? 'In a stokvel' : 'No stokvel'}
                        </p>
                      </div>
                    </div>
                    <div className={styles.switcherRight}>
                      <span className={`${styles.roleBadge} ${pRoleCls}`}>
                        {p.role.toLowerCase()}
                      </span>
                      {active && (
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#EFBF81" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Admin section */}
          {isAdmin && stokvel && (
            <div className={styles.adminSection}>
              <p className={styles.adminSectionLabel}>Admin Tools</p>

              <button className={styles.adminRow} onClick={() => router.push('/stokvel/members')}>
                <div className={styles.adminRowLeft}>
                  <div className={`${styles.adminRowIcon} ${styles.iconAmber}`}>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                  <div>
                    <p className={styles.adminRowTitle}>Pending Approvals</p>
                    <p className={styles.adminRowSub}>Review join requests</p>
                  </div>
                </div>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className={styles.chevron}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              <button className={styles.adminRow} onClick={() => router.push('/stokvel/members/manage')}>
                <div className={styles.adminRowLeft}>
                  <div className={`${styles.adminRowIcon} ${styles.iconBlue}`}>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                    </svg>
                  </div>
                  <div>
                    <p className={styles.adminRowTitle}>Manage Members</p>
                    <p className={styles.adminRowSub}>Roles, earnings, remove</p>
                  </div>
                </div>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className={styles.chevron}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          )}

          {/* Add Profile */}
          {canAddProfile && (
            <button className={styles.addProfileBtn} onClick={() => setShowAddProfile(true)}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Another Profile
            </button>
          )}

          {/* Sign out */}
          <button onClick={signOut} className={styles.signOutBtn}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            Sign Out
          </button>
        </div>
      )}

      {/* Add Profile modal */}
      {showAddProfile && (
        <div className={styles.modalOverlay} onClick={() => setShowAddProfile(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <p className={styles.modalTitle}>Add Profile</p>
            <p className={styles.modalSub}>
              Create a separate identity with its own contribution and loan tracking.
            </p>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Display Name</label>
              <input
                className={styles.fieldInput}
                placeholder="e.g. John, John Business"
                value={apDisplayName}
                onChange={e => setApDisplayName(e.target.value)}
                disabled={apLoading}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Surname</label>
              <input
                className={styles.fieldInput}
                placeholder="Mbeki"
                value={apSurname}
                onChange={e => setApSurname(e.target.value)}
                disabled={apLoading}
              />
            </div>

            {apError && <p className={styles.modalError}>{apError}</p>}

            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setShowAddProfile(false)} disabled={apLoading}>
                Cancel
              </button>
              <button
                className={styles.modalConfirm}
                onClick={handleAddProfile}
                disabled={!apDisplayName.trim() || !apSurname.trim() || apLoading}
              >
                {apLoading ? 'Creating…' : 'Create Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, variant }: { label: string; value: string; variant?: 'success' | 'error' }) {
  const valueCls =
    variant === 'success' ? styles.statValueSuccess
    : variant === 'error' ? styles.statValueError
    : styles.statValue;

  return (
    <div className={styles.statCard}>
      <p className={styles.statLabel}>{label}</p>
      <p className={valueCls}>{value}</p>
    </div>
  );
}
