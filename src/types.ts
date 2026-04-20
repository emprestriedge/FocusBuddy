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
