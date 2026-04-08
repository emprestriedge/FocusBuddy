import { Task, VoiceNote, ActivityEntry, UserProfile } from '../types';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, query, orderBy, limit, addDoc, where, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';

const STORAGE_KEY = 'focusbuddy_tasks_v1';
const VOICE_NOTES_KEY = 'focusbuddy_voicenotes_v1';
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
let hydrationComplete = false;

// Initial fast-load from localStorage
try {
  const localData = localStorage.getItem(STORAGE_KEY);
  if (localData) memoryTasks = JSON.parse(localData);

  const localNotes = localStorage.getItem(VOICE_NOTES_KEY);
  if (localNotes) memoryVoiceNotes = JSON.parse(localNotes);
} catch (e) {
  console.error("Local fast-load error", e);
}

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

      hydrationComplete = true;
      console.log("Persistence hydrated. Standalone mode:", (navigator as any).standalone || false);
    } catch (e) {
      console.error("IDB Hydration failed", e);
      hydrationComplete = true;
    }
  },

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

  linkParentStudent: async (parentUid: string, studentUid: string) => {
    try {
      await setDoc(doc(db, 'focusbuddy_users', parentUid), { linkedTo: studentUid }, { merge: true });
      await setDoc(doc(db, 'focusbuddy_users', studentUid), { linkedTo: parentUid }, { merge: true });
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

  // ========== TASK METHODS ==========

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
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        alert("Storage is full! FocusBuddy can't save more data right now.");
      }
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

  // ========== CLOUD SYNC (per-user, not family code) ==========

  pushToCloud: async (uid: string, tasks: Task[]): Promise<void> => {
    try {
      const docRef = doc(db, 'focusbuddy_users', uid, 'schedule', 'current');
      await setDoc(docRef, {
        tasks,
        lastUpdated: new Date().toISOString()
      });
    } catch (error: any) {
      throw new Error(`Cloud Sync Failed: ${error.message}`);
    }
  },

  pullFromCloud: async (uid: string): Promise<Task[]> => {
    try {
      const docRef = doc(db, 'focusbuddy_users', uid, 'schedule', 'current');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.tasks) {
          storageService.saveTasks(data.tasks);
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

  subscribeToCloud: (uid: string, onUpdate: (tasks: Task[]) => void) => {
    const docRef = doc(db, 'focusbuddy_users', uid, 'schedule', 'current');
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.tasks) {
          storageService.saveTasks(data.tasks);
          onUpdate(data.tasks);
        }
      }
    });
  },

  // ========== ACTIVITY FEED ==========

  logActivity: async (uid: string, entry: ActivityEntry): Promise<void> => {
    try {
      const colRef = collection(db, 'focusbuddy_users', uid, 'activity');
      await addDoc(colRef, entry);
    } catch (error) {
      console.error("Activity log error:", error);
    }
  },

  subscribeToActivity: (uid: string, onUpdate: (entries: ActivityEntry[]) => void) => {
    const colRef = collection(db, 'focusbuddy_users', uid, 'activity');
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
