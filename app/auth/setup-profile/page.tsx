'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import styles from './setup.module.css';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function SetupProfilePage() {
  const [displayName, setDisplayName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { state, dispatch, handlePostVerification } = useAuth();

  const isFormValid =
    displayName.trim().length > 0 &&
    surname.trim().length > 0 &&
    isValidEmail(email.trim());

  // Redirect if already done
  useEffect(() => {
    if (state.isAuthenticated && state.authStep === 'COMPLETED') {
      router.replace('/dashboard');
    }
  }, [state.isAuthenticated, state.authStep, router]);

  async function handleCreateProfile() {
    if (!isFormValid || isLoading) return;
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      dispatch({ type: 'SET_ERROR', payload: 'Session expired. Please sign in again.' });
      return;
    }

    setIsLoading(true);
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const uid = firebaseUser.uid;

      // 1. Create User document
      await setDoc(doc(db, 'users', uid), {
        uid,
        phoneNumber: firebaseUser.phoneNumber ?? '',
        email: email.trim(),
        currentProfileId: null,
        profileIds: [],
        createdAt: Date.now(),
      });

      // 2. Create Profile document (role = MEMBER by default — elevated when stokvel is created)
      const profileRef = doc(db, 'profiles', `${uid}_default`);
      const profileId = profileRef.id;

      await setDoc(profileRef, {
        id: profileId,
        userId: uid,
        stokvelId: null,
        displayName: displayName.trim(),
        surname: surname.trim(),
        role: 'MEMBER',
        photoUrl: null,
        createdAt: Date.now(),
        stats: {
          totalContributed: 0,
          totalBorrowed: 0,
          outstandingDebt: 0,
        },
        interestEarned: 0,
      });

      // 3. Update User with the profile ID
      await updateDoc(doc(db, 'users', uid), {
        profileIds: [profileId],
        currentProfileId: profileId,
      });

      // 4. Load user and proceed to dashboard (same as existing user after OTP)
      await handlePostVerification();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create profile. Please try again.';
      dispatch({ type: 'SET_ERROR', payload: msg });
    } finally {
      setIsLoading(false);
    }
  }

  const personIcon = (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
  const emailIcon = (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  );

  return (
    <div className={styles.page}>
      <div className={styles.glow} />

      <div className={styles.inner}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Create Your Profile</h1>
          <p className={styles.subtitle}>
            This will be your first profile. You can add more profiles later to manage
            different identities within your stokvel.
          </p>
        </div>

        <div className={styles.fields}>
          <TextField label="First Name" placeholder="e.g. Thabo"
            value={displayName} onChange={setDisplayName} disabled={isLoading} icon={personIcon} />
          <TextField label="Surname" placeholder="e.g. Mbeki"
            value={surname} onChange={setSurname} disabled={isLoading} icon={personIcon} />
          <TextField label="Email Address" placeholder="e.g. thabo@example.com"
            value={email} onChange={(v) => setEmail(v.trim())} disabled={isLoading}
            type="email" icon={emailIcon} />
        </div>

        {state.error && <div className={styles.error}>{state.error}</div>}

        <div className={styles.spacer} />

        <p className={styles.info}>This email will be used for all profiles under your account.</p>

        <button
          onClick={handleCreateProfile}
          disabled={!isFormValid || isLoading}
          className={`${styles.submitBtn} ${isFormValid && !isLoading ? styles.active : styles.dimmed}`}
        >
          {isLoading
            ? <><div className={styles.spinner} /> Creating Profile...</>
            : <>Continue <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg></>
          }
        </button>
      </div>
    </div>
  );
}

function TextField({ label, placeholder, value, onChange, disabled, type = 'text', icon }: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; disabled: boolean; type?: string; icon: React.ReactNode;
}) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={`${styles.fieldRow}${isFocused ? ` ${styles.focused}` : ''}`}>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          className={styles.fieldInput}
        />
        <span className={`${styles.fieldIcon}${isFocused ? ` ${styles.focused}` : ''}`}>{icon}</span>
      </div>
    </div>
  );
}
