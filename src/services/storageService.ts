import { Task, VoiceNote, ActivityEntry, UserProfile, StarData, StarReward, StarRedemption } from '../types';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, query, orderBy, limit, addDoc, where, getDocs, updateDoc, arrayUnion } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';

const STORAGE_KEY = 'focusbuddy_tasks_v1';
const VOICE_NOTES_KEY = 'focusbuddy_voicenotes_v1';
const STARS_KEY = 'focusbuddy_stars_v2';
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
  subscribeToCloud: (studentUid: string, onUpdate: (tasks: Task[]) => void) => {
    const docRef = doc(db, 'focusbuddy_students', studentUid, 'schedule', 'current');
    return onSnapshot(docRef, (docSnap) => {
      // Skip if we just pushed this update (echo suppression)
      if (_suppressCloudUpdate) return;

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.tasks) {
          storageService.saveTasksLocal(data.tasks);
          onUpdate(data.tasks);
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
      // Log under the student's shared path so all parents can see it
      const colRef = collection(db, 'focusbuddy_students', studentUid, 'activity');
      await addDoc(colRef, entry);
    } catch (error) {
      console.error("Activity log error:", error);
    }
  },

  subscribeToActivity: (studentUid: string, onUpdate: (entries: ActivityEntry[]) => void) => {
    const colRef = collection(db, 'focusbuddy_students', studentUid, 'activity');
    const q = query(colRef, orderBy('completedAt', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
      const entries: ActivityEntry[] = [];
      snapshot.forEach(docSnap => {
        entries.push(docSnap.data() as ActivityEntry);
      });
      onUpdate(entries);
    });
  }
};
