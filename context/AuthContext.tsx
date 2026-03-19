'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useCallback,
} from 'react';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type Unsubscribe,
  type ConfirmationResult,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { AuthState, AuthStep, User, Profile, Stokvel, StokvelMember } from '@/types';

// ─── Initial State ────────────────────────────────────────────────────────────
const initialState: AuthState = {
  isInitializing: true,
  isLoading: false,
  isAuthenticated: false,
  user: null,
  currentProfile: null,
  allProfiles: [],
  userStokvels: [],
  hasCheckedStokvels: false,
  phoneNumber: '',
  error: null,
  authStep: 'PHONE_INPUT',
  profileAddedSuccessfully: false,
};

// ─── Actions ──────────────────────────────────────────────────────────────────
type AuthAction =
  | { type: 'SET_INITIALIZING'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_AUTH_STEP'; payload: AuthStep }
  | { type: 'SET_PHONE_NUMBER'; payload: string }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_AUTHENTICATED'; payload: { user: User; currentProfile: Profile; allProfiles: Profile[]; userStokvels: Stokvel[] } }
  | { type: 'UPDATE_PROFILE'; payload: Partial<Profile> }
  | { type: 'SET_STOKVELS'; payload: Stokvel[] }
  | { type: 'ADD_STOKVEL'; payload: Stokvel }
  | { type: 'SET_ALL_PROFILES'; payload: Profile[] }
  | { type: 'PROFILE_ADDED_SUCCESS' }
  | { type: 'RESET_PROFILE_ADDED_FLAG' }
  | { type: 'SWITCH_PROFILE'; payload: Profile }
  | { type: 'SIGN_OUT' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_INITIALIZING':
      return { ...state, isInitializing: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_AUTH_STEP':
      return { ...state, authStep: action.payload };
    case 'SET_PHONE_NUMBER':
      return { ...state, phoneNumber: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'SET_AUTHENTICATED':
      return {
        ...state,
        isInitializing: false,
        isLoading: false,
        isAuthenticated: true,
        authStep: 'COMPLETED',
        user: action.payload.user,
        currentProfile: action.payload.currentProfile,
        allProfiles: action.payload.allProfiles,
        userStokvels: action.payload.userStokvels,
        hasCheckedStokvels: true,
        error: null,
      };
    case 'UPDATE_PROFILE':
      if (!state.currentProfile) return state;
      return {
        ...state,
        currentProfile: { ...state.currentProfile, ...action.payload },
      };
    case 'SET_STOKVELS':
      return { ...state, userStokvels: action.payload, hasCheckedStokvels: true };
    case 'ADD_STOKVEL': {
      const already = state.userStokvels.some((s) => s.id === action.payload.id);
      if (already) return state;
      return { ...state, userStokvels: [...state.userStokvels, action.payload], hasCheckedStokvels: true };
    }
    case 'SET_ALL_PROFILES':
      return { ...state, allProfiles: action.payload };
    case 'PROFILE_ADDED_SUCCESS':
      return { ...state, isLoading: false, profileAddedSuccessfully: true };
    case 'RESET_PROFILE_ADDED_FLAG':
      return { ...state, profileAddedSuccessfully: false };
    case 'SWITCH_PROFILE':
      return { ...state, currentProfile: action.payload };
    case 'SIGN_OUT':
      return { ...initialState, isInitializing: false };
    default:
      return state;
  }
}

// ─── Context Type ─────────────────────────────────────────────────────────────
interface CreateStokvelParams {
  name: string;
  description: string;
  requiresApproval: boolean;
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
}

interface AuthContextType {
  state: AuthState;
  dispatch: React.Dispatch<AuthAction>;
  signOut: () => Promise<void>;
  refreshStokvels: () => Promise<void>;
  switchProfile: (profile: Profile) => void;
  resetProfileAddedFlag: () => void;
  clearError: () => void;
  handlePostVerification: () => Promise<void>;
  signInWithPhone: (phoneNumber: string, verifier: RecaptchaVerifier) => Promise<void>;
  confirmOtp: (otp: string) => Promise<void>;
  createStokvel: (params: CreateStokvelParams) => Promise<{ stokvel: Stokvel; inviteCode: string }>;
  joinStokvel: (inviteCode: string) => Promise<{ status: 'ACTIVE' | 'PENDING'; stokvelName: string }>;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fetchUserDoc(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    uid: d.uid ?? uid,
    phoneNumber: d.phoneNumber ?? '',
    email: d.email ?? '',
    currentProfileId: d.currentProfileId ?? null,
    profileIds: d.profileIds ?? [],
    createdAt: d.createdAt ?? Date.now(),
  };
}

async function fetchProfile(profileId: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, 'profiles', profileId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    userId: d.userId ?? '',
    stokvelId: d.stokvelId ?? null,
    displayName: d.displayName ?? '',
    surname: d.surname ?? '',
    role: d.role ?? 'MEMBER',
    photoUrl: d.photoUrl ?? null,
    createdAt: d.createdAt ?? Date.now(),
    stats: {
      totalContributed: d.stats?.totalContributed ?? 0,
      totalBorrowed: d.stats?.totalBorrowed ?? 0,
      outstandingDebt: d.stats?.outstandingDebt ?? 0,
    },
    interestEarned: d.interestEarned ?? 0,
    fcmToken: d.fcmToken,
  };
}

function mapStokvelDoc(id: string, d: Record<string, unknown>): Stokvel {
  return {
    id,
    name: (d.name as string) ?? '',
    description: (d.description as string) ?? '',
    creatorUserId: (d.creatorUserId as string) ?? '',
    creatorProfileId: (d.creatorProfileId as string) ?? '',
    inviteCode: (d.inviteCode as string) ?? '',
    requiresApproval: (d.requiresApproval as boolean) ?? false,
    poolBalance: (d.poolBalance as number) ?? 0,
    totalContributions: (d.totalContributions as number) ?? 0,
    memberCount: (d.memberCount as number) ?? 0,
    members: (d.members as StokvelMember[]) ?? [],
    createdAt: (d.createdAt as number) ?? Date.now(),
    adminBankCode: d.adminBankCode as string | undefined,
    adminBankName: d.adminBankName as string | undefined,
    adminAccountNumber: d.adminAccountNumber as string | undefined,
    adminAccountName: d.adminAccountName as string | undefined,
    paystackSubaccountCode: d.paystackSubaccountCode as string | undefined,
  };
}

async function fetchUserStokvels(profileIds: string[]): Promise<Stokvel[]> {
  if (profileIds.length === 0) return [];
  const stokvels: Stokvel[] = [];
  const profileFetches = profileIds.map((pid) => fetchProfile(pid));
  const profiles = await Promise.all(profileFetches);
  const stokvelIds = [...new Set(
    profiles.flatMap((p) => (p?.stokvelId ? [p.stokvelId] : []))
  )];
  for (const sid of stokvelIds) {
    const snap = await getDoc(doc(db, 'stokvels', sid));
    if (snap.exists()) stokvels.push(mapStokvelDoc(snap.id, snap.data()));
  }
  return stokvels;
}

// 6-char invite code — excludes confusable characters (0, O, 1, I) matching Android
async function generateUniqueInviteCode(): Promise<string> {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: 6 }, () =>
      CHARS[Math.floor(Math.random() * CHARS.length)]
    ).join('');
    const q = query(collection(db, 'stokvels'), where('inviteCode', '==', code));
    const snap = await getDocs(q);
    if (snap.empty) return code;
  }
  throw new Error('Could not generate a unique invite code. Please try again.');
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const profileListenerRef = useRef<Unsubscribe | null>(null);
  const stokvelListenerRef = useRef<Unsubscribe | null>(null);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  // Tracks the last known stokvelId so the listener can detect an approval event
  const currentStokvelIdRef = useRef<string | null>(null);

  // ── Profile real-time listener ────────────────────────────────────────────
  // ── Stokvel real-time listener ─────────────────────────────────────────────
  // Keeps memberCount, poolBalance, totalContributions live — mirrors Android.
  const startStokvelListener = useCallback((stokvelId: string) => {
    if (stokvelListenerRef.current) {
      stokvelListenerRef.current();
      stokvelListenerRef.current = null;
    }
    stokvelListenerRef.current = onSnapshot(
      doc(db, 'stokvels', stokvelId),
      (snapshot) => {
        if (!snapshot.exists()) return;
        dispatch({
          type: 'ADD_STOKVEL',
          payload: mapStokvelDoc(snapshot.id, snapshot.data()),
        });
      }
    );
  }, []);

  // ── Profile real-time listener ────────────────────────────────────────────
  // Mirrors Android's startProfileListener.
  // CRITICAL: when stokvelId changes null → value, it means a web/Android admin
  // just approved this user.  Fetching the stokvel here gives instant cross-
  // platform access without requiring a full re-login.
  const startProfileListener = useCallback(
    (profileId: string) => {
      if (profileListenerRef.current) {
        profileListenerRef.current();
        profileListenerRef.current = null;
      }

      profileListenerRef.current = onSnapshot(
        doc(db, 'profiles', profileId),
        (snapshot) => {
          if (!snapshot.exists()) return;
          const d = snapshot.data();

          const newStokvelId: string | null = d.stokvelId ?? null;
          const prevStokvelId = currentStokvelIdRef.current;

          // Approval detected or stokvel changed — start live stokvel listener
          if (newStokvelId && newStokvelId !== prevStokvelId) {
            startStokvelListener(newStokvelId);
          } else if (!newStokvelId) {
            // Left stokvel — stop listening
            if (stokvelListenerRef.current) {
              stokvelListenerRef.current();
              stokvelListenerRef.current = null;
            }
          }

          currentStokvelIdRef.current = newStokvelId;

          dispatch({
            type: 'UPDATE_PROFILE',
            payload: {
              stokvelId: newStokvelId,
              role: d.role ?? 'MEMBER',
              interestEarned: d.interestEarned ?? 0,
              stats: {
                totalContributed: d.stats?.totalContributed ?? 0,
                totalBorrowed: d.stats?.totalBorrowed ?? 0,
                outstandingDebt: d.stats?.outstandingDebt ?? 0,
              },
            },
          });
        },
        (error) => {
          console.error('Profile listener error:', error);
        }
      );
    },
    [startStokvelListener]
  );

  // ── Load user and proceed to COMPLETED state ───────────────────────────────
  const loadUserAndComplete = useCallback(
    async (uid: string) => {
      try {
        const user = await fetchUserDoc(uid);

        if (!user || !user.currentProfileId) {
          dispatch({ type: 'SET_INITIALIZING', payload: false });
          dispatch({ type: 'SET_LOADING', payload: false });
          dispatch({ type: 'SET_AUTH_STEP', payload: 'PROFILE_SETUP' });
          return;
        }

        const profile = await fetchProfile(user.currentProfileId);

        if (!profile) {
          dispatch({ type: 'SET_ERROR', payload: 'Profile not found. Please contact support.' });
          dispatch({ type: 'SET_INITIALIZING', payload: false });
          return;
        }

        const allProfiles: Profile[] = [];
        for (const pid of user.profileIds) {
          const p = await fetchProfile(pid);
          if (p) allProfiles.push(p);
        }

        const userStokvels = await fetchUserStokvels(user.profileIds);

        // Seed the ref so the listener knows the starting stokvelId
        currentStokvelIdRef.current = profile.stokvelId;

        dispatch({
          type: 'SET_AUTHENTICATED',
          payload: { user, currentProfile: profile, allProfiles, userStokvels },
        });

        startProfileListener(profile.id);

        // Start live stokvel listener if user already has a stokvel
        if (profile.stokvelId) {
          startStokvelListener(profile.stokvelId);
        }
      } catch (err) {
        console.error('loadUserAndComplete error:', err);
        dispatch({
          type: 'SET_ERROR',
          payload: err instanceof Error ? err.message : 'Failed to load account',
        });
        dispatch({ type: 'SET_INITIALIZING', payload: false });
      }
    },
    [startProfileListener, startStokvelListener]
  );

  // ── Firebase auth state observer ───────────────────────────────────────────
  useEffect(() => {
    if (!auth) {
      dispatch({ type: 'SET_INITIALIZING', payload: false });
      dispatch({ type: 'SET_AUTH_STEP', payload: 'PHONE_INPUT' });
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await loadUserAndComplete(firebaseUser.uid);
      } else {
        dispatch({ type: 'SET_INITIALIZING', payload: false });
        dispatch({ type: 'SET_AUTH_STEP', payload: 'PHONE_INPUT' });
      }
    });

    return () => {
      unsubscribe();
      if (profileListenerRef.current) profileListenerRef.current();
    };
  }, [loadUserAndComplete]);

  // ── Post-OTP verification ──────────────────────────────────────────────────
  const handlePostVerification = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      dispatch({ type: 'SET_ERROR', payload: 'Authentication failed. Please try again.' });
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    await loadUserAndComplete(firebaseUser.uid);
  }, [loadUserAndComplete]);

  // ── Native Phone Auth ──────────────────────────────────────────────────────
  const signInWithPhone = useCallback(async (phoneNumber: string, verifier: RecaptchaVerifier) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });
    try {
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      confirmationResultRef.current = confirmationResult;
      dispatch({ type: 'SET_AUTH_STEP', payload: 'OTP_VERIFICATION' });
      dispatch({ type: 'SET_PHONE_NUMBER', payload: phoneNumber });
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (err: any) {
      console.error('signInWithPhone error:', err);
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Failed to send SMS' });
      dispatch({ type: 'SET_LOADING', payload: false });
      throw err;
    }
  }, []);

  const confirmOtp = useCallback(async (otp: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });
    try {
      if (!confirmationResultRef.current) {
        throw new Error('No verification in progress. Please try sending the code again.');
      }
      await confirmationResultRef.current.confirm(otp);
      // onAuthStateChanged will handle the rest
    } catch (err: any) {
      console.error('confirmOtp error:', err);
      dispatch({ type: 'SET_ERROR', payload: err.message || 'Invalid verification code' });
      dispatch({ type: 'SET_LOADING', payload: false });
      throw err;
    }
  }, []);

  // ── Create stokvel ─────────────────────────────────────────────────────────
  const createStokvel = useCallback(async (params: CreateStokvelParams) => {
    const firebaseUser = auth.currentUser;
    const profile = state.currentProfile;
    const user = state.user;
    if (!firebaseUser || !profile || !user) throw new Error('Not authenticated');

    const inviteCode = await generateUniqueInviteCode();
    const now = Date.now();
    const stokvelRef = doc(collection(db, 'stokvels'));
    const stokvelId = stokvelRef.id;

    const creatorMember: StokvelMember = {
      profileId: profile.id,
      userId: user.uid,
      displayName: profile.displayName,
      surname: profile.surname,
      role: 'CREATOR',
      status: 'ACTIVE',
      joinedAt: now,
    };

    const stokvelData: Stokvel = {
      id: stokvelId,
      name: params.name.trim(),
      description: params.description.trim(),
      inviteCode,
      creatorUserId: user.uid,
      creatorProfileId: profile.id,
      creatorId: profile.id, // matches Android field name — used by Cloud Functions for interest distribution
      requiresApproval: params.requiresApproval,
      poolBalance: 0,
      totalContributions: 0,
      memberCount: 1,
      members: [creatorMember],
      createdAt: now,
      ...(params.bankCode && { adminBankCode: params.bankCode }),
      ...(params.bankName && { adminBankName: params.bankName }),
      ...(params.accountNumber && { adminAccountNumber: params.accountNumber }),
      ...(params.accountName && { adminAccountName: params.accountName }),
    };

    // 1. Create stokvel document
    await setDoc(stokvelRef, stokvelData);

    // 2. Create member subcollection entry
    await setDoc(doc(db, 'stokvels', stokvelId, 'members', profile.id), {
      ...creatorMember,
    });

    // 3. Update creator profile
    await updateDoc(doc(db, 'profiles', profile.id), {
      stokvelId,
      role: 'CREATOR',
    });

    // 4. Create Paystack subaccount when bank details are available (non-blocking)
    if (params.bankCode && params.accountNumber && params.accountName) {
      fetch('https://us-central1-gudu-stokvel.cloudfunctions.net/createSubaccount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stokvelId,
          businessName: `${params.accountName} - ${params.name.trim()} Admin`,
          bankCode: params.bankCode,
          accountNumber: params.accountNumber,
          accountName: params.accountName,
        }),
      })
        .then((r) => r.json())
        .then(({ subaccountCode }) => {
          if (subaccountCode) {
            updateDoc(doc(db, 'stokvels', stokvelId), { paystackSubaccountCode: subaccountCode });
          }
        })
        .catch(() => {});
    }

    // 5. Update local state
    currentStokvelIdRef.current = stokvelId;
    dispatch({ type: 'ADD_STOKVEL', payload: stokvelData });
    dispatch({ type: 'UPDATE_PROFILE', payload: { stokvelId, role: 'CREATOR' } });

    return { stokvel: stokvelData, inviteCode };
  }, [state.currentProfile, state.user]);

  // ── Join stokvel ───────────────────────────────────────────────────────────
  const joinStokvel = useCallback(async (inviteCode: string): Promise<{ status: 'ACTIVE' | 'PENDING'; stokvelName: string }> => {
    const profile = state.currentProfile;
    const user = state.user;
    if (!profile || !user) throw new Error('Not authenticated');

    // 1. Find stokvel by invite code
    const q = query(
      collection(db, 'stokvels'),
      where('inviteCode', '==', inviteCode.toUpperCase().trim()),
    );
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('Invalid invite code. Please check and try again.');

    const stokvelDoc = snap.docs[0];
    const stokvel = mapStokvelDoc(stokvelDoc.id, stokvelDoc.data());
    const sd = stokvelDoc.data();

    // 2. Check membership
    const memberSnap = await getDoc(doc(db, 'stokvels', stokvel.id, 'members', profile.id));
    if (memberSnap.exists()) {
      const md = memberSnap.data();
      if (md.status === 'ACTIVE') throw new Error('You are already a member of this stokvel.');
      if (md.status === 'PENDING') throw new Error('Your join request is still pending admin approval.');
      if (md.status === 'REMOVED') throw new Error('You have been removed from this stokvel.');
    }

    const now = Date.now();
    const status: 'ACTIVE' | 'PENDING' = stokvel.requiresApproval ? 'PENDING' : 'ACTIVE';

    const memberEntry: StokvelMember = {
      profileId: profile.id,
      userId: user.uid,
      displayName: profile.displayName,
      surname: profile.surname,
      role: 'MEMBER',
      status,
      joinedAt: now,
    };

    // 3. Create member subcollection entry
    await setDoc(doc(db, 'stokvels', stokvel.id, 'members', profile.id), memberEntry);

    if (status === 'ACTIVE') {
      // 4a. Update stokvel membership count + array
      await updateDoc(doc(db, 'stokvels', stokvel.id), {
        memberCount: increment(1),
        members: arrayUnion(memberEntry),
      });

      // 4b. Update profile — grants access, triggers cross-platform listener
      await updateDoc(doc(db, 'profiles', profile.id), {
        stokvelId: stokvel.id,
        role: 'MEMBER',
      });

      // 4c. Update local state
      currentStokvelIdRef.current = stokvel.id;
      dispatch({ type: 'ADD_STOKVEL', payload: stokvel });
      dispatch({ type: 'UPDATE_PROFILE', payload: { stokvelId: stokvel.id, role: 'MEMBER' } });
    } else {
      // 4d. Notify admins of pending request
      await addDoc(collection(db, 'stokvels', stokvel.id, 'notifications'), {
        type: 'JOIN_REQUEST',
        profileId: profile.id,
        userId: user.uid,
        displayName: profile.displayName,
        surname: profile.surname,
        message: `${profile.displayName} ${profile.surname} wants to join ${stokvel.name}`,
        createdAt: now,
        read: false,
      });
    }

    return { status, stokvelName: stokvel.name };
  }, [state.currentProfile, state.user]);

  // ── Refresh stokvels ───────────────────────────────────────────────────────
  const refreshStokvels = useCallback(async () => {
    const user = state.user;
    if (!user) return;
    try {
      const stokvels = await fetchUserStokvels(user.profileIds);
      dispatch({ type: 'SET_STOKVELS', payload: stokvels });
    } catch (err) {
      console.error('refreshStokvels error:', err);
    }
  }, [state.user]);

  // ── Switch active profile ──────────────────────────────────────────────────
  // Mirrors Android: purely in-memory swap, no Firestore write.
  // On next cold start the app defaults to user.currentProfileId.
  const switchProfile = useCallback(
    (profile: Profile) => {
      currentStokvelIdRef.current = profile.stokvelId;
      dispatch({ type: 'SWITCH_PROFILE', payload: profile });
      startProfileListener(profile.id);
      if (profile.stokvelId) startStokvelListener(profile.stokvelId);
    },
    [startProfileListener, startStokvelListener]
  );

  // ── Sign out ───────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    if (profileListenerRef.current) {
      profileListenerRef.current();
      profileListenerRef.current = null;
    }
    if (stokvelListenerRef.current) {
      stokvelListenerRef.current();
      stokvelListenerRef.current = null;
    }
    currentStokvelIdRef.current = null;
    await firebaseSignOut(auth);
    dispatch({ type: 'SIGN_OUT' });
  }, []);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);
  const resetProfileAddedFlag = useCallback(
    () => dispatch({ type: 'RESET_PROFILE_ADDED_FLAG' }),
    []
  );

  return (
    <AuthContext.Provider
      value={{
        state,
        dispatch,
        signOut,
        refreshStokvels,
        switchProfile,
        resetProfileAddedFlag,
        clearError,
        handlePostVerification,
        signInWithPhone,
        confirmOtp,
        createStokvel,
        joinStokvel,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
