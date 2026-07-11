import { Task, VoiceNote, ActivityEntry, UserProfile, StarData, StarReward, StarRedemption, StarLedgerEntry, StarLedgerType, DailyCheckIn } from '../types';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, query, orderBy, limit, addDoc, where, getDocs, updateDoc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';

const STORAGE_KEY = 'focusbuddy_tasks_v1';
const VOICE_NOTES_KEY = 'focusbuddy_voicenotes_v1';
const STARS_KEY = 'focusbuddy_stars_v2';
const DAILY_NOTES_KEY = 'focusbuddy_daily_notes_v1';
const DB_NAME = 'FocusBuddyDB';
const DB_VERSION = 1;
const STORE_NAME = 'appData';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCYp3d9PqCzndgVZ6VAgCW3yy0wVj4JXQE",
  authDomain: "gen-lang-client-0838687198.firebaseapp.com",
  projectId: "gen-lang-client-0838687198",
  storageBucket: "gen-lang-client-0838687198.firebasestorage.app",
  messagingSenderId: "337851991296",
  appId: "1:337851991296:web:ed3c11a83775b161f19fe5"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

/**
 * IndexedDB Helper for deep persistence on iOS standalone mode
 */
const idb = {
  open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
    });
  },

  async get<T>(key: string): Promise<T | null> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  async set(key: string, value: any): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async delete(key: string): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};

/**
 * In-memory cache
 */
let memoryTasks: Task[] = [];
let memoryVoiceNotes: VoiceNote[] = [];
const defaultStarData: StarData = { total: 0, earnedTaskIds: [], dailyBonusDates: [], weeklyBonusWeeks: [], rewards: [], redemptions: [] };
let memoryStars: StarData = { ...defaultStarData };
let memoryDailyNotes: Record<string, string> = {};
let hydrationComplete = false;

/**
 * Cloud sync target — always the STUDENT's UID.
 * Both parents and students read/write to this same Firestore path.
 */
let _cloudTargetUid: string | null = null;
let _cloudSyncEnabled = false;
let _suppressCloudUpdate = false; // prevents echo loops

// Initial fast-load from localStorage
try {
  const localData = localStorage.getItem(STORAGE_KEY);
  if (localData) memoryTasks = JSON.parse(localData);

  const localNotes = localStorage.getItem(VOICE_NOTES_KEY);
  if (localNotes) memoryVoiceNotes = JSON.parse(localNotes);

  const localStars = localStorage.getItem(STARS_KEY);
  if (localStars) memoryStars = { ...defaultStarData, ...JSON.parse(localStars) };

  const localNotes2 = localStorage.getItem(DAILY_NOTES_KEY);
  if (localNotes2) memoryDailyNotes = JSON.parse(localNotes2);

  // Migrate old star count from v1
  const oldStars = localStorage.getItem('focusbuddy_stars');
  if (oldStars && !localStars) {
    memoryStars.total = parseInt(oldStars) || 0;
    localStorage.setItem(STARS_KEY, JSON.stringify(memoryStars));
    localStorage.removeItem('focusbuddy_stars');
  }
} catch (e) {
  console.error("Local fast-load error", e);
}

/**
 * Push current tasks to Firestore under the student's UID.
 * Called automatically on every local write when cloud sync is enabled.
 */
const autoPushToCloud = async (tasks: Task[]) => {
  if (!_cloudSyncEnabled || !_cloudTargetUid) return;
  try {
    _suppressCloudUpdate = true;
    const docRef = doc(db, 'focusbuddy_students', _cloudTargetUid, 'schedule', 'current');
    await setDoc(docRef, {
      tasks,
      dailyNotes: memoryDailyNotes,
      lastUpdated: new Date().toISOString(),
      updatedBy: auth.currentUser?.uid || 'unknown'
    });
    // Allow cloud updates again after a brief delay to let the echo pass
    setTimeout(() => { _suppressCloudUpdate = false; }, 1500);
  } catch (error) {
    _suppressCloudUpdate = false;
    console.error("Auto cloud push failed:", error);
  }
};

export const storageService = {
  /**
   * Authoritative hydration from IndexedDB
   */
  init: async (): Promise<void> => {
    if (hydrationComplete) return;
    try {
      const idbTasks = await idb.get<Task[]>(STORAGE_KEY);
      const idbNotes = await idb.get<VoiceNote[]>(VOICE_NOTES_KEY);

      if (idbTasks && idbTasks.length > 0) {
        memoryTasks = idbTasks;
      }
      if (idbNotes && idbNotes.length > 0) {
        memoryVoiceNotes = idbNotes;
      }

      const idbStars = await idb.get<StarData>(STARS_KEY);
      if (idbStars) {
        memoryStars = { ...defaultStarData, ...idbStars };
      }

      const idbNotes2 = await idb.get<Record<string, string>>(DAILY_NOTES_KEY);
      if (idbNotes2) {
        memoryDailyNotes = idbNotes2;
      }

      hydrationComplete = true;
      console.log("Persistence hydrated. Standalone mode:", (navigator as any).standalone || false);
    } catch (e) {
      console.error("IDB Hydration failed", e);
      hydrationComplete = true;
    }
  },

  // ========== CLOUD SYNC CONFIG ==========

  /**
   * Set the student UID that ALL schedule reads/writes target.
   * Call this once after login, whether the user is a parent or student.
   */
  setCloudTarget: (studentUid: string) => {
    _cloudTargetUid = studentUid;
    _cloudSyncEnabled = true;
    console.log("Cloud sync target set:", studentUid);
  },

  getCloudTarget: () => _cloudTargetUid,

  isCloudEnabled: () => _cloudSyncEnabled,

  // ========== AUTH METHODS ==========

  getAuth: () => auth,

  onAuthStateChanged: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, callback);
  },

  signIn: async (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password);
  },

  signUp: async (email: string, password: string, name: string, role: 'parent' | 'student') => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const profile: UserProfile = {
      name,
      email,
      role,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'focusbuddy_users', cred.user.uid), profile);
    return cred;
  },

  signOut: async () => {
    _cloudTargetUid = null;
    _cloudSyncEnabled = false;
    return signOut(auth);
  },

  getUserProfile: async (uid: string): Promise<UserProfile | null> => {
    try {
      const docSnap = await getDoc(doc(db, 'focusbuddy_users', uid));
      if (docSnap.exists()) {
        return docSnap.data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error("Get profile error:", error);
      return null;
    }
  },

  /**
   * Link a parent to a student. Supports multiple parents per student.
   * Uses both the legacy `linkedTo` field (for backwards compat) and new array fields.
   */
  linkParentStudent: async (parentUid: string, studentUid: string) => {
    try {
      // Update parent profile
      const parentRef = doc(db, 'focusbuddy_users', parentUid);
      await updateDoc(parentRef, {
        linkedTo: studentUid,
        linkedStudents: arrayUnion(studentUid)
      });

      // Update student profile
      const studentRef = doc(db, 'focusbuddy_users', studentUid);
      await updateDoc(studentRef, {
        linkedTo: parentUid,
        linkedParents: arrayUnion(parentUid)
      });
    } catch (error) {
      console.error("Link error:", error);
    }
  },

  findStudentByEmail: async (email: string): Promise<{ uid: string; profile: UserProfile } | null> => {
    try {
      const q = query(
        collection(db, 'focusbuddy_users'),
        where('email', '==', email.trim().toLowerCase()),
        where('role', '==', 'student')
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        return { uid: docSnap.id, profile: docSnap.data() as UserProfile };
      }
      return null;
    } catch (error) {
      console.error("Find student error:", error);
      return null;
    }
  },

  // ========== TASK METHODS (all auto-sync to cloud) ==========

  getTasks: (): Task[] => {
    return memoryTasks;
  },

  saveTasks: (tasks: Task[]): boolean => {
    try {
      memoryTasks = tasks;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      idb.set(STORAGE_KEY, tasks).catch(err => {
        console.error("IDB Write failed", err);
      });
      // Auto-push to cloud
      autoPushToCloud(tasks);
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        alert("Storage is full! FocusBuddy can't save more data right now.");
      }
      return false;
    }
  },

  /**
   * Save tasks locally WITHOUT triggering cloud push.
   * Used when receiving cloud updates to avoid echo loops.
   */
  saveTasksLocal: (tasks: Task[]): boolean => {
    try {
      memoryTasks = tasks;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      idb.set(STORAGE_KEY, tasks).catch(err => {
        console.error("IDB Write failed", err);
      });
      return true;
    } catch (e) {
      return false;
    }
  },

  updateTask: (updatedTask: Task): boolean => {
    const newTasks = memoryTasks.map(t => t.id === updatedTask.id ? updatedTask : t);
    return storageService.saveTasks(newTasks);
  },

  addTasks: (newTasks: Task[]): boolean => {
    return storageService.saveTasks([...memoryTasks, ...newTasks]);
  },

  deleteTask: (id: string): boolean => {
    const filtered = memoryTasks.filter(t => t.id !== id);
    return storageService.saveTasks(filtered);
  },

  clearAll: (): void => {
    memoryTasks = [];
    memoryVoiceNotes = [];
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(VOICE_NOTES_KEY);
    idb.delete(STORAGE_KEY);
    idb.delete(VOICE_NOTES_KEY);
  },

  // ========== VOICE NOTE METHODS ==========

  getVoiceNotes: (): VoiceNote[] => {
    return memoryVoiceNotes;
  },

  saveVoiceNote: (note: VoiceNote): boolean => {
    memoryVoiceNotes = [note, ...memoryVoiceNotes];
    localStorage.setItem(VOICE_NOTES_KEY, JSON.stringify(memoryVoiceNotes));
    idb.set(VOICE_NOTES_KEY, memoryVoiceNotes).catch(() => {});
    return true;
  },

  deleteVoiceNote: (id: string): boolean => {
    memoryVoiceNotes = memoryVoiceNotes.filter(n => n.id !== id);
    localStorage.setItem(VOICE_NOTES_KEY, JSON.stringify(memoryVoiceNotes));
    idb.set(VOICE_NOTES_KEY, memoryVoiceNotes).catch(() => {});
    return true;
  },

  // ========== STAR SYSTEM ==========

  getStarData: (): StarData => {
    return memoryStars;
  },

  saveStarData: (data: StarData): void => {
    memoryStars = data;
    localStorage.setItem(STARS_KEY, JSON.stringify(data));
    idb.set(STARS_KEY, data).catch(() => {});
    // Auto-push to cloud if enabled
    if (_cloudSyncEnabled && _cloudTargetUid) {
      const docRef = doc(db, 'focusbuddy_students', _cloudTargetUid, 'stars', 'current');
      setDoc(docRef, { ...data, lastUpdated: new Date().toISOString() }).catch(err => console.error("Star cloud push failed:", err));
    }
  },

  /**
   * Award a star for completing a task. Returns false if already earned.
   */
  earnTaskStar: (taskId: string): boolean => {
    if (memoryStars.earnedTaskIds.includes(taskId)) return false;
    memoryStars = {
      ...memoryStars,
      total: memoryStars.total + 1,
      earnedTaskIds: [...memoryStars.earnedTaskIds, taskId]
    };
    storageService.saveStarData(memoryStars);
    return true;
  },

  /**
   * Remove a task star when un-completing. Returns false if wasn't earned.
   */
  removeTaskStar: (taskId: string): boolean => {
    if (!memoryStars.earnedTaskIds.includes(taskId)) return false;
    memoryStars = {
      ...memoryStars,
      total: Math.max(0, memoryStars.total - 1),
      earnedTaskIds: memoryStars.earnedTaskIds.filter(id => id !== taskId)
    };
    storageService.saveStarData(memoryStars);
    return true;
  },

  /**
   * Award daily completion bonus. Returns false if already awarded for this date.
   */
  earnDailyBonus: (date: string): boolean => {
    if (memoryStars.dailyBonusDates.includes(date)) return false;
    memoryStars = {
      ...memoryStars,
      total: memoryStars.total + 1,
      dailyBonusDates: [...memoryStars.dailyBonusDates, date]
    };
    storageService.saveStarData(memoryStars);
    return true;
  },

  /**
   * Award weekly completion bonus. weekKey = first date of the week (Monday).
   * Returns false if already awarded.
   */
  earnWeeklyBonus: (weekKey: string): boolean => {
    if (memoryStars.weeklyBonusWeeks.includes(weekKey)) return false;
    memoryStars = {
      ...memoryStars,
      total: memoryStars.total + 5,
      weeklyBonusWeeks: [...memoryStars.weeklyBonusWeeks, weekKey]
    };
    storageService.saveStarData(memoryStars);
    return true;
  },

  /**
   * Redeem stars for a reward. Returns false if not enough stars.
   */
  redeemReward: (reward: StarReward): boolean => {
    if (memoryStars.total < reward.cost) return false;
    const redemption: StarRedemption = {
      id: Math.random().toString(36).slice(2),
      rewardId: reward.id,
      rewardName: reward.name,
      cost: reward.cost,
      redeemedAt: new Date().toISOString()
    };
    memoryStars = {
      ...memoryStars,
      total: memoryStars.total - reward.cost,
      redemptions: [...memoryStars.redemptions, redemption]
    };
    storageService.saveStarData(memoryStars);
    return true;
  },

  addReward: (reward: StarReward): void => {
    memoryStars = {
      ...memoryStars,
      rewards: [...memoryStars.rewards, reward]
    };
    storageService.saveStarData(memoryStars);
  },

  deleteReward: (rewardId: string): void => {
    memoryStars = {
      ...memoryStars,
      rewards: memoryStars.rewards.filter(r => r.id !== rewardId)
    };
    storageService.saveStarData(memoryStars);
  },

  pullStarsFromCloud: async (studentUid: string): Promise<StarData | null> => {
    try {
      const docRef = doc(db, 'focusbuddy_students', studentUid, 'stars', 'current');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = { ...defaultStarData, ...docSnap.data() } as StarData;
        memoryStars = data;
        localStorage.setItem(STARS_KEY, JSON.stringify(data));
        idb.set(STARS_KEY, data).catch(() => {});
        return data;
      }
      return null;
    } catch (err) {
      console.error("Pull stars from cloud failed:", err);
      return null;
    }
  },

  subscribeToStars: (studentUid: string, onUpdate: (data: StarData) => void) => {
    const docRef = doc(db, 'focusbuddy_students', studentUid, 'stars', 'current');
    return onSnapshot(docRef, (docSnap) => {
      if (_suppressCloudUpdate) return;
      if (docSnap.exists()) {
        const data = { ...defaultStarData, ...docSnap.data() } as StarData;
        memoryStars = data;
        localStorage.setItem(STARS_KEY, JSON.stringify(data));
        idb.set(STARS_KEY, data).catch(() => {});
        onUpdate(data);
      }
    });
  },

  // ========== DAILY NOTES ==========

  getDailyNotes: (): Record<string, string> => {
    return memoryDailyNotes;
  },

  getDailyNote: (date: string): string => {
    return memoryDailyNotes[date] || '';
  },

  saveDailyNote: (date: string, note: string): void => {
    if (note.trim()) {
      memoryDailyNotes[date] = note;
    } else {
      delete memoryDailyNotes[date];
    }
    localStorage.setItem(DAILY_NOTES_KEY, JSON.stringify(memoryDailyNotes));
    idb.set(DAILY_NOTES_KEY, memoryDailyNotes).catch(() => {});
    // Auto-push to cloud (piggyback on the tasks push)
    autoPushToCloud(memoryTasks);
  },

  saveDailyNotesLocal: (notes: Record<string, string>): void => {
    memoryDailyNotes = notes;
    localStorage.setItem(DAILY_NOTES_KEY, JSON.stringify(notes));
    idb.set(DAILY_NOTES_KEY, notes).catch(() => {});
  },

  // ========== CLOUD SYNC ==========

  /**
   * Manual push — still available for explicit "Push to Zaiden" button,
   * but now tasks auto-push on every change too.
   */
  pushToCloud: async (studentUid: string, tasks: Task[]): Promise<void> => {
    try {
      const docRef = doc(db, 'focusbuddy_students', studentUid, 'schedule', 'current');
      await setDoc(docRef, {
        tasks,
        dailyNotes: memoryDailyNotes,
        lastUpdated: new Date().toISOString(),
        updatedBy: auth.currentUser?.uid || 'unknown'
      });
    } catch (error: any) {
      throw new Error(`Cloud Sync Failed: ${error.message}`);
    }
  },

  /**
   * Pull latest schedule from cloud (one-time fetch).
   */
  pullFromCloud: async (studentUid: string): Promise<Task[]> => {
    try {
      const docRef = doc(db, 'focusbuddy_students', studentUid, 'schedule', 'current');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.dailyNotes) {
          storageService.saveDailyNotesLocal(data.dailyNotes);
        }
        if (data.tasks) {
          storageService.saveTasksLocal(data.tasks);
          return data.tasks;
        }
        return [];
      } else {
        return [];
      }
    } catch (error: any) {
      throw new Error(error.message || "Cloud retrieval failed.");
    }
  },

  /**
   * Subscribe to real-time schedule updates.
   * Used by ALL accounts (parent AND student) watching the same student UID.
   * Uses the NEW path: focusbuddy_students/{studentUid}/schedule/current
   */
  subscribeToCloud: (studentUid: string, onUpdate: (tasks: Task[], dailyNotes?: Record<string, string>) => void) => {
    const docRef = doc(db, 'focusbuddy_students', studentUid, 'schedule', 'current');
    return onSnapshot(docRef, (docSnap) => {
      // Skip if we just pushed this update (echo suppression)
      if (_suppressCloudUpdate) return;

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.dailyNotes) {
          storageService.saveDailyNotesLocal(data.dailyNotes);
        }
        if (data.tasks) {
          storageService.saveTasksLocal(data.tasks);
          onUpdate(data.tasks, data.dailyNotes || {});
        }
      }
    });
  },

  /**
   * One-time migration: copy existing data from old path to new path.
   * Old: focusbuddy_users/{uid}/schedule/current
   * New: focusbuddy_students/{studentUid}/schedule/current
   */
  migrateToSharedPath: async (studentUid: string): Promise<boolean> => {
    try {
      // Check if new path already has data
      const newRef = doc(db, 'focusbuddy_students', studentUid, 'schedule', 'current');
      const newSnap = await getDoc(newRef);
      if (newSnap.exists() && newSnap.data()?.tasks?.length > 0) {
        return false; // already migrated
      }

      // Check old path
      const oldRef = doc(db, 'focusbuddy_users', studentUid, 'schedule', 'current');
      const oldSnap = await getDoc(oldRef);
      if (oldSnap.exists() && oldSnap.data()?.tasks?.length > 0) {
        // Copy to new path
        await setDoc(newRef, oldSnap.data());
        console.log("Migrated schedule data to shared path");
        return true;
      }
      return false;
    } catch (error) {
      console.error("Migration error:", error);
      return false;
    }
  },

  // ========== ACTIVITY FEED ==========

  logActivity: async (studentUid: string, entry: ActivityEntry): Promise<void> => {
    try {
      console.log('[FB-ACTIVITY] Writing activity for student:', studentUid, 'task:', entry.taskName);
      const colRef = collection(db, 'focusbuddy_students', studentUid, 'activity');
      await addDoc(colRef, entry);
      console.log('[FB-ACTIVITY] Activity written successfully');
    } catch (error) {
      console.error("[FB-ACTIVITY] Activity log FAILED:", error);
    }
  },

  subscribeToActivity: (studentUid: string, onUpdate: (entries: ActivityEntry[]) => void) => {
    console.log('[FB-ACTIVITY] Subscribing to activity feed for student:', studentUid);
    const colRef = collection(db, 'focusbuddy_students', studentUid, 'activity');
    // Skip orderBy to avoid Firestore index requirements — sort client-side instead
    return onSnapshot(colRef, (snapshot) => {
      const entries: ActivityEntry[] = [];
      snapshot.forEach(docSnap => {
        entries.push(docSnap.data() as ActivityEntry);
      });
      // Sort newest first client-side
      entries.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
      // Only keep most recent 50
      const trimmed = entries.slice(0, 50);
      console.log('[FB-ACTIVITY] Activity feed updated:', trimmed.length, 'entries');
      onUpdate(trimmed);
    }, (error) => {
      console.error("[FB-ACTIVITY] Activity feed subscription FAILED:", error);
      onUpdate([]);
    });
  },

  // ========== STAR LEDGER (Bank Statement) ==========

  logLedgerEntry: async (studentUid: string, entry: StarLedgerEntry): Promise<void> => {
    try {
      const colRef = collection(db, 'focusbuddy_students', studentUid, 'starLedger');
      await addDoc(colRef, entry);
    } catch (error) {
      console.error("Ledger log error:", error);
    }
  },

  getLedgerEntries: async (studentUid: string, monthKey: string): Promise<StarLedgerEntry[]> => {
    try {
      // monthKey format: "2026-04"
      const startDate = `${monthKey}-01`;
      const [year, month] = monthKey.split('-').map(Number);
      const endDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;

      const colRef = collection(db, 'focusbuddy_students', studentUid, 'starLedger');
      const q = query(
        colRef,
        where('date', '>=', startDate),
        where('date', '<', month === 12 ? `${year + 1}-01-01` : endDate),
        orderBy('date', 'desc'),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);
      const entries: StarLedgerEntry[] = [];
      snapshot.forEach(docSnap => {
        entries.push(docSnap.data() as StarLedgerEntry);
      });
      return entries;
    } catch (error) {
      console.error("Ledger fetch error (trying fallback):", error);
      // Fallback: get all and filter client-side
      try {
        const colRef = collection(db, 'focusbuddy_students', studentUid, 'starLedger');
        const snapshot = await getDocs(colRef);
        const entries: StarLedgerEntry[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as StarLedgerEntry;
          if (data.date && data.date.startsWith(monthKey)) {
            entries.push(data);
          }
        });
        entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return entries;
      } catch (fallbackError) {
        console.error("Ledger fallback also failed:", fallbackError);
        return [];
      }
    }
  },

  subscribeLedger: (studentUid: string, monthKey: string, onUpdate: (entries: StarLedgerEntry[]) => void) => {
    const colRef = collection(db, 'focusbuddy_students', studentUid, 'starLedger');
    // Subscribe to all entries and filter client-side (simpler, avoids composite index issues)
    return onSnapshot(colRef, (snapshot) => {
      const entries: StarLedgerEntry[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as StarLedgerEntry;
        if (data.date && data.date.startsWith(monthKey)) {
          entries.push(data);
        }
      });
      entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      onUpdate(entries);
    });
  },

  /**
   * Parent manually adjusts stars. Adds/removes from total and logs to ledger.
   */
  adjustStarsManual: (amount: number, note?: string): void => {
    const isAdd = amount > 0;
    memoryStars = {
      ...memoryStars,
      total: Math.max(0, memoryStars.total + amount)
    };
    storageService.saveStarData(memoryStars);

    // Log to ledger (fire and forget — caller handles the actual ledger entry)
  },

  // ========== DAILY CHECK-IN ==========

  saveCheckIn: async (studentUid: string, checkIn: DailyCheckIn): Promise<void> => {
    try {
      const docRef = doc(db, 'focusbuddy_students', studentUid, 'checkIns', checkIn.date);
      await setDoc(docRef, checkIn);
    } catch (error) {
      console.error("Check-in save error:", error);
    }
  },

  getCheckIn: async (studentUid: string, date: string): Promise<DailyCheckIn | null> => {
    try {
      const docRef = doc(db, 'focusbuddy_students', studentUid, 'checkIns', date);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as DailyCheckIn;
      }
      return null;
    } catch (error) {
      console.error("Check-in fetch error:", error);
      return null;
    }
  },

  getCheckInsForRange: async (studentUid: string, startDate: string, endDate: string): Promise<DailyCheckIn[]> => {
    try {
      const colRef = collection(db, 'focusbuddy_students', studentUid, 'checkIns');
      const snapshot = await getDocs(colRef);
      const checkIns: DailyCheckIn[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as DailyCheckIn;
        if (data.date >= startDate && data.date <= endDate) {
          checkIns.push(data);
        }
      });
      return checkIns.sort((a, b) => b.date.localeCompare(a.date));
    } catch (error) {
      console.error("Check-ins range fetch error:", error);
      return [];
    }
  },

  // ========== CUSTOM CHECK-IN QUESTION (Parent sets weekly) ==========

  saveCustomQuestion: async (studentUid: string, question: string): Promise<void> => {
    try {
      const docRef = doc(db, 'focusbuddy_students', studentUid, 'settings', 'checkIn');
      await setDoc(docRef, { customQuestion: question, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (error) {
      console.error("Custom question save error:", error);
    }
  },

  getCustomQuestion: async (studentUid: string): Promise<string> => {
    try {
      const docRef = doc(db, 'focusbuddy_students', studentUid, 'settings', 'checkIn');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data().customQuestion || "Did you have fun learning today?";
      }
      return "Did you have fun learning today?";
    } catch (error) {
      console.error("Custom question fetch error:", error);
      return "Did you have fun learning today?";
    }
  },

  subscribeToCustomQuestion: (studentUid: string, onUpdate: (question: string) => void) => {
    const docRef = doc(db, 'focusbuddy_students', studentUid, 'settings', 'checkIn');
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data().customQuestion || "Did you have fun learning today?");
      }
    });
  }
};
