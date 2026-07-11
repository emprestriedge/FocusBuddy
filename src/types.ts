export interface Task {
  id: string;
  date: string;
  dayOfWeek?: string;
  name: string;
  description: string;
  accountabilityType: 'photo' | 'voice' | 'both' | 'none';
  completed: boolean;
  photoUrl?: string;
  reflectionText?: string;
  searchMetadata?: string;
  completedAt?: string;
  reflectionPrompts?: string[];
  showInGallery?: boolean;
  isFavorite?: boolean;
}

export interface VoiceNote {
  id: string;
  date: string;
  transcript: string;
  processedType: 'summary' | 'reflection' | 'assignment' | 'transcript';
  processedText: string;
}

export interface ActivityEntry {
  id: string;
  taskId: string;
  taskName: string;
  completedAt: string;
  hasPhoto: boolean;
  hasVoiceNote: boolean;
  voiceSummary?: string;
}

export enum AppMode {
  STUDENT = 'STUDENT',
  ADMIN = 'ADMIN',
  PORTFOLIO = 'PORTFOLIO',
  CALENDAR = 'CALENDAR',
  TOOLBOX = 'TOOLBOX'
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface UserProfile {
  name: string;
  email: string;
  role: 'parent' | 'student';
  createdAt: string;
  linkedTo?: string;
  linkedStudents?: string[];
  linkedParents?: string[];
}

export interface StarReward {
  id: string;
  name: string;
  cost: number;
  emoji: string;
  createdAt: string;
}

export interface StarRedemption {
  id: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  redeemedAt: string;
}

export interface StarData {
  total: number;
  earnedTaskIds: string[];
  dailyBonusDates: string[];
  weeklyBonusWeeks: string[];
  rewards: StarReward[];
  redemptions: StarRedemption[];
}

// ========== STAR LEDGER (Bank Statement) ==========

export type StarLedgerType =
  | 'task_deposit'      // Daily grouped task stars
  | 'daily_bonus'       // +1 for finishing all tasks in a day
  | 'weekly_bonus'      // +5 for finishing the whole week
  | 'redemption'        // Spending stars on a reward
  | 'manual_add'        // Parent added stars
  | 'manual_remove';    // Parent removed stars

export interface StarLedgerEntry {
  id: string;
  date: string;           // YYYY-MM-DD
  timestamp: string;      // ISO string for ordering
  type: StarLedgerType;
  amount: number;         // positive for deposits, negative for withdrawals
  description: string;    // e.g. "Completed 3 tasks", "Daily Bonus", "Game Night (redeemed)"
  note?: string;          // Optional parent note for manual adjustments
  balanceAfter: number;   // Running balance after this entry
}

// ========== DAILY CHECK-IN ==========

export interface DailyCheckIn {
  date: string;           // YYYY-MM-DD
  submittedAt: string;    // ISO timestamp
  answers: {
    focused: boolean | number;     // "Did you feel focused today?" (1-10 scale, legacy: boolean)
    tooHard: boolean | number;     // "Was anything too hard today?" (1-10 scale, legacy: boolean)
    custom: boolean | number;      // Parent's custom weekly question (1-10 scale, legacy: boolean)
  };
  customQuestion: string; // The actual question text at time of submission
}
