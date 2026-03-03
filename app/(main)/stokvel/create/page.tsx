'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import styles from './create.module.css';

export default function CreateStokvelPage() {
  const router = useRouter();
  const { createStokvel } = useAuth();

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(true);

  // Focus states
  const [focused, setFocused] = useState('');

  // Submit
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Success
  const [inviteCode, setInviteCode] = useState('');
  const [stokvelName, setStokvelName] = useState('');
  const [copied, setCopied] = useState(false);

  const isFormValid =
    name.trim().length > 0 &&
    description.trim().length > 0;

  async function handleCreate() {
    if (!isFormValid || isLoading) return;
    setIsLoading(true);
    setError('');
    try {
      const { inviteCode: code, stokvel } = await createStokvel({
        name: name.trim(),
        description: description.trim(),
        requiresApproval,
      });
      setInviteCode(code);
      setStokvelName(stokvel.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create stokvel. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (inviteCode) {
    return (
      <div className={styles.page}>
        <div className={styles.successWrap}>
          <div className={styles.successIconWrap}>
            <svg width="30" height="30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <p className={styles.successTitle}>Stokvel Created!</p>
            <p className={styles.successSub}>
              Share this invite code with members to invite them to{' '}
              <strong>{stokvelName}</strong>.
            </p>
          </div>

          <div className={styles.inviteCard}>
            <p className={styles.inviteLabel}>Your Invite Code</p>
            <p className={styles.inviteCode}>{inviteCode}</p>
            <p className={styles.inviteSub}>
              6-character code — share with your members
            </p>
            <button
              className={`${styles.copyBtn}${copied ? ` ${styles.copied}` : ''}`}
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                  </svg>
                  Copy Code
                </>
              )}
            </button>
          </div>

          <button className={styles.doneBtn} onClick={() => router.replace('/dashboard')}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => router.back()}>
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      <div className={styles.heading}>
        <h1 className={styles.title}>Create a Stokvel</h1>
        <p className={styles.subtitle}>Set up your stokvel and invite members to join</p>
      </div>

      <div className={styles.form}>
        {/* Stokvel details */}
        <p className={styles.sectionLabel}>Stokvel Details</p>

        <Field label="Stokvel Name" focused={focused === 'name'}
          icon={
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
          }
        >
          <input
            className={styles.fieldInput}
            placeholder="e.g. Family Savings Group"
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused('')}
            disabled={isLoading}
          />
        </Field>

        {/* Description */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Description</label>
          <div className={`${styles.textareaRow}${focused === 'desc' ? ` ${styles.focused}` : ''}`}>
            <textarea
              className={styles.textarea}
              placeholder="Brief description of your stokvel"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onFocus={() => setFocused('desc')}
              onBlur={() => setFocused('')}
              disabled={isLoading}
            />
            <span className={styles.charCount}>{description.length}/200</span>
          </div>
        </div>

        {/* Require approval toggle */}
        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <p className={styles.toggleLabel}>Require Approval</p>
            <p className={styles.toggleDesc}>New members need admin approval before joining</p>
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              disabled={isLoading}
            />
            <span className={`${styles.toggleTrack}${requiresApproval ? ` ${styles.on}` : ''}`}>
              <span className={`${styles.toggleThumb}${requiresApproval ? ` ${styles.on}` : ''}`} />
            </span>
          </label>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={`${styles.submitBtn} ${isFormValid && !isLoading ? styles.active : styles.dimmed}`}
          onClick={handleCreate}
          disabled={!isFormValid || isLoading}
        >
          {isLoading
            ? <><div className={styles.spinner} /> Creating...</>
            : 'Create Stokvel'
          }
        </button>
      </div>
    </div>
  );
}

// ── Field wrapper component ────────────────────────────────────────────────
function Field({ label, focused, icon, children }: {
  label: string; focused: boolean; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={`${styles.fieldRow}${focused ? ` ${styles.focused}` : ''}`}>
        <span className={`${styles.fieldIcon}${focused ? ` ${styles.focused}` : ''}`}>{icon}</span>
        {children}
      </div>
    </div>
  );
}
