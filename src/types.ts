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
  text: string;
  timestamp: string;
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
  linkedTo?: string; // UID of linked parent/student
}
