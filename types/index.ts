// ─── User ────────────────────────────────────────────────────────────────────
export interface User {
  uid: string;
  phoneNumber: string;
  email: string;
  currentProfileId: string | null;
  profileIds: string[];
  createdAt: number;
}

// ─── Profile ─────────────────────────────────────────────────────────────────
export type ProfileRole = 'CREATOR' | 'ADMIN' | 'MEMBER';
export type MemberStatus = 'ACTIVE' | 'PENDING' | 'REMOVED';

export interface ProfileStats {
  totalContributed: number;
  totalBorrowed: number;
  outstandingDebt: number;
}

export interface Profile {
  id: string;
  userId: string;
  stokvelId: string | null;
  displayName: string;
  surname: string;
  role: ProfileRole;
  photoUrl: string | null;
  createdAt: number;
  stats: ProfileStats;
  interestEarned: number;
  fcmToken?: string;
}

// ─── Stokvel ─────────────────────────────────────────────────────────────────
export interface StokvelMember {
  profileId: string;
  userId: string;
  displayName: string;
  surname: string;
  role: ProfileRole;
  status: MemberStatus;
  joinedAt: number;
  approvedAt?: number;
  removedAt?: number;
}

export interface Stokvel {
  id: string;
  name: string;
  description: string;
  creatorUserId: string;
  creatorProfileId: string;
  inviteCode: string;
  requiresApproval: boolean;
  poolBalance: number;
  totalContributions: number;
  memberCount: number;
  members: StokvelMember[];
  createdAt: number;
  // Admin bank details for Paystack
  adminBankCode?: string;
  adminBankName?: string;
  adminAccountNumber?: string;
  adminAccountName?: string;
  paystackSubaccountCode?: string;
}

// ─── Auth State ───────────────────────────────────────────────────────────────
export type AuthStep =
  | 'PHONE_INPUT'
  | 'OTP_VERIFICATION'
  | 'PROFILE_SETUP'
  | 'COMPLETED';

export interface AuthState {
  isInitializing: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  currentProfile: Profile | null;
  allProfiles: Profile[];
  userStokvels: Stokvel[];
  hasCheckedStokvels: boolean;
  phoneNumber: string;
  error: string | null;
  authStep: AuthStep;
  profileAddedSuccessfully: boolean;
}

// ─── Loan ────────────────────────────────────────────────────────────────────
export type LoanStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISBURSED'
  | 'ACTIVE'
  | 'OVERDUE'
  | 'COMPLETED';

export interface Loan {
  id: string;
  stokvelId: string;
  profileId: string;
  userId: string;
  displayName: string;
  principal: number;
  interestRate: number;
  totalAmount: number;
  amountRepaid: number;
  remainingBalance: number;
  status: LoanStatus;
  requestedAt: number;
  approvedAt?: number;
  disbursedAt?: number;
  dueDate?: number;
  rejectionReason?: string;
  // Bank details for disbursement
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  recipientCode?: string;
  transferReference?: string;
}

// ─── Contribution ────────────────────────────────────────────────────────────
export type ContributionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Contribution {
  id: string;
  stokvelId: string;
  profileId: string;
  userId: string;
  amount: number;
  status: ContributionStatus;
  paystackReference?: string;
  idempotencyKey: string;
  retryCount: number;
  createdAt: number;
  completedAt?: number;
}

// ─── Interest Earning ────────────────────────────────────────────────────────
export interface InterestEarning {
  id: string;
  profileId: string;
  stokvelId: string;
  loanId: string;
  amount: number;
  earningType: 'from_loan' | 'from_split';
  createdAt: number;
}

// ─── Notification ────────────────────────────────────────────────────────────
export type NotificationType =
  | 'LOAN_APPROVED'
  | 'LOAN_REJECTED'
  | 'LOAN_DISBURSED'
  | 'INTEREST_EARNED'
  | 'MEMBER_APPROVED'
  | 'PAYMENT_RECEIVED';

export interface AppNotification {
  id: string;
  profileId: string;
  stokvelId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
}
