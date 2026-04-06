import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppMode, Task, UserProfile, ActivityEntry } from './types';
import { storageService } from './services/storageService';
import Layout from './components/Layout';
import Login from './components/Login';
import TaskDetail from './components/TaskDetail';
import AdminPanel from './components/AdminPanel';
import Portfolio from './components/Portfolio';
import ScheduleCalendar from './components/ScheduleCalendar';
import Toolbox from './components/Toolbox';
import { Icons, COLORS } from './constants';
import { User } from 'firebase/auth';

const App: React.FC = () => {
  // Auth state
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [mode, setMode] = useState<AppMode>(AppMode.STUDENT);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastCompletedTaskId, setLastCompletedTaskId] = useState<string | null>(null);
  const [stars, setStars] = useState<number>(() => {
    return parseInt(localStorage.getItem('focusbuddy_stars') || '0');
  });

  // Listen for auth state changes
  useEffect(() => {
    const unsub = storageService.onAuthStateChanged(async (user) => {
      setAuthUser(user);
      if (user) {
        const profile = await storageService.getUserProfile(user.uid);
        setUserProfile(profile);
        if (profile?.role === 'parent') {
          setMode(AppMode.ADMIN);
        } else {
          setMode(AppMode.STUDENT);
        }
      } else {
        setUserProfile(null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Initialize storage
  useEffect(() => {
    const initStorage = async () => {
      await storageService.init();
      const initialTasks = storageService.getTasks();
      setTasks(initialTasks);
      setIsHydrated(true);
    };
    initStorage();
  }, []);

  // Persist stars
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('focusbuddy_stars', stars.toString());
    }
  }, [stars, isHydrated]);

  // Scroll to top on mode change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mode]);

  // Scroll performance engine
  useEffect(() => {
    let scrollTimer: number | null = null;
    const body = document.body;

    const handleScrollStart = () => {
      if (!body.classList.contains('is-scrolling')) {
        body.classList.add('is-scrolling');
      }
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        body.classList.remove('is-scrolling');
        scrollTimer = null;
      }, 150);
    };

    window.addEventListener('scroll', handleScrollStart, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScrollStart);
      if (scrollTimer) window.clearTimeout(scrollTimer);
    };
  }, []);

  // Subscribe to cloud updates (student listens to their own schedule)
  useEffect(() => {
    if (isHydrated && authUser && userProfile?.role === 'student') {
      const unsubscribe = storageService.subscribeToCloud(authUser.uid, (updatedTasks) => {
        setTasks(updatedTasks);
      });
      return () => unsubscribe();
    }
  }, [authUser, userProfile, isHydrated]);

  // If parent, subscribe to linked student's schedule for the activity feed
  // The studentUid would come from userProfile.linkedTo
  const studentUid = userProfile?.role === 'parent' ? userProfile.linkedTo : authUser?.uid;

  const handleTasksUpdated = useCallback((updatedTasks: Task[]) => {
    setTasks(updatedTasks);
  }, []);

  const handleToggleTaskStatus = useCallback((id: string, photoUrl: string, reflection: string, showInGallery: boolean) => {
    let celebrationTriggered = false;

    const updatedTasks = storageService.getTasks().map(t => {
      if (t.id === id) {
        const isTurningComplete = !t.completed;
        if (isTurningComplete) {
          celebrationTriggered = true;
          setLastCompletedTaskId(id);
          setStars(prev => prev + 1);
          setTimeout(() => setLastCompletedTaskId(null), 3000);

          // Log activity
          if (authUser) {
            const entry: ActivityEntry = {
              id: Math.random().toString(36).substr(2, 9),
              taskId: id,
              taskName: t.name,
              completedAt: new Date().toISOString(),
              hasPhoto: !!photoUrl,
              hasVoiceNote: !!reflection,
              voiceSummary: reflection ? reflection.substring(0, 200) : undefined
            };
            storageService.logActivity(authUser.uid, entry);
          }
        }
        return {
          ...t,
          completed: isTurningComplete,
          photoUrl: isTurningComplete ? photoUrl : undefined,
          reflectionText: isTurningComplete ? reflection : undefined,
          completedAt: isTurningComplete ? new Date().toISOString() : undefined,
          showInGallery: isTurningComplete ? showInGallery : undefined
        };
      }
      return t;
    });

    setTasks(updatedTasks);
    storageService.saveTasks(updatedTasks);
    setSelectedTask(null);

    if (celebrationTriggered) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 4000);
    }
  }, [authUser]);

  const handleLogout = async () => {
    try {
      await storageService.signOut();
      setAuthUser(null);
      setUserProfile(null);
      setMode(AppMode.STUDENT);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const todayDateDisplay = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  }, []);

  // ========== RENDER STATES ==========

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-6">
          <div className="w-16 h-16 border-4 rounded-full animate-spin" style={{ borderColor: 'rgba(177, 148, 112, 0.3)', borderTopColor: COLORS.green }}></div>
          <p className="text-sm font-bold uppercase tracking-[0.4em]" style={{ color: COLORS.caramel }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!authUser) {
    return <Login onLogin={() => {}} />;
  }

  // Storage loading
  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-6">
          <div className="w-16 h-16 border-4 rounded-full animate-spin" style={{ borderColor: 'rgba(177, 148, 112, 0.3)', borderTopColor: COLORS.green }}></div>
          <p className="text-sm font-bold uppercase tracking-[0.4em]" style={{ color: COLORS.caramel }}>Restoring Space...</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (mode) {
      case AppMode.ADMIN:
        return <AdminPanel onTasksUpdated={handleTasksUpdated} studentUid={studentUid} />;
      case AppMode.PORTFOLIO:
        return <Portfolio tasks={tasks} onTasksUpdated={handleTasksUpdated} />;
      case AppMode.TOOLBOX:
        return <Toolbox onReturnToToday={() => setMode(AppMode.STUDENT)} onTasksUpdated={handleTasksUpdated} />;
      case AppMode.CALENDAR:
        return <ScheduleCalendar tasks={tasks} onSelectTask={setSelectedTask} lastCompletedTaskId={lastCompletedTaskId} />;
      case AppMode.STUDENT:
      default:
        const today = new Date().toISOString().split('T')[0];
        const todayTasks = tasks.filter(t => t.date === today && !t.completed);
        const allTodayTasks = tasks.filter(t => t.date === today);
        const progress = allTodayTasks.length > 0 ? (allTodayTasks.filter(t => t.completed).length / allTodayTasks.length) * 100 : 0;

        return (
          <div className="space-y-6 md:space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <header className="flex justify-between items-start">
              <div className="space-y-2 md:space-y-3 flex-1 pr-4">
                <div className="font-bold uppercase tracking-[0.3em] text-[9px] md:text-[10px]" style={{ color: COLORS.caramel }}>{todayDateDisplay}</div>
                <h1 className="text-4xl md:text-7xl font-serif leading-tight" style={{ color: COLORS.cream }}>Hi Zaiden.</h1>
                <div className="w-full max-w-md h-2 md:h-3 rounded-full overflow-hidden mt-2 md:mt-4" style={{ background: 'rgba(81, 55, 33, 0.45)' }}>
                  <div className="h-full transition-all duration-1000 ease-out rounded-full" style={{ width: `${progress}%`, background: `linear-gradient(to right, ${COLORS.green}, ${COLORS.caramel})` }} />
                </div>
                <p className="text-sm md:text-xl font-light tracking-wide mt-1 md:mt-2" style={{ color: COLORS.caramel }}>
                  {todayTasks.length === 0 ? "You finished all your work!" : `You have ${todayTasks.length} thing${todayTasks.length === 1 ? '' : 's'} to do today.`}
                </p>
              </div>
              <div className="flex flex-col items-end space-y-3 md:space-y-4">
                <div className="flex items-center space-x-2 md:space-x-3 glass-card px-4 py-2 md:px-6 md:py-2.5 rounded-full">
                  <span className="text-xl md:text-2xl">⭐</span>
                  <span className="font-serif text-lg md:text-2xl" style={{ color: COLORS.cream }}>{stars}</span>
                </div>
              </div>
            </header>

            {allTodayTasks.length === 0 ? (
              <div className="glass-tile-tinted rounded-[2rem] p-12 text-center animate-in fade-in zoom-in duration-700">
                <h2 className="text-3xl font-serif" style={{ color: COLORS.cream }}>No homework today.</h2>
                <p className="mt-3 text-sm" style={{ color: COLORS.caramel }}>Check back later or look at your week.</p>
                <button onClick={() => setMode(AppMode.CALENDAR)} className="mt-8 px-8 py-3 rounded-full font-bold text-[10px] uppercase tracking-[0.2em]" style={{ backgroundColor: COLORS.green, color: COLORS.cream }}>
                  View Week
                </button>
              </div>
            ) : todayTasks.length === 0 ? (
              <div className="glass-tile-tinted rounded-[2rem] p-12 text-center animate-in fade-in zoom-in duration-700">
                <h2 className="text-3xl font-serif" style={{ color: COLORS.cream }}>Done and Dusted.</h2>
                <button onClick={() => setMode(AppMode.PORTFOLIO)} className="mt-8 px-8 py-3 rounded-full font-bold text-[10px] uppercase tracking-[0.2em]" style={{ backgroundColor: COLORS.green, color: COLORS.cream }}>
                  Go to Gallery
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {allTodayTasks.map(task => (
                  <div key={task.id} className="relative group">
                    <button
                      onClick={() => setSelectedTask(task)}
                      className="w-full flex items-center p-5 glass-tile-tinted rounded-[1.5rem] text-left adhd-card pr-20"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className={`text-xl md:text-3xl font-serif leading-tight truncate ${task.completed ? 'line-through opacity-40' : ''}`} style={{ color: COLORS.cream }}>{task.name}</h3>
                        {task.description && <p className="text-xs md:text-base opacity-80 line-clamp-1" style={{ color: COLORS.caramel }}>{task.description}</p>}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTaskStatus(task.id, task.photoUrl || '', task.reflectionText || '', task.showInGallery || false);
                      }}
                      className={`absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 md:w-16 md:h-16 rounded-full border flex items-center justify-center transition-all shrink-0 z-10 shadow-sm active:scale-90`}
                      style={task.completed
                        ? { backgroundColor: COLORS.green, color: COLORS.cream, borderColor: COLORS.green }
                        : { background: 'rgba(81, 55, 33, 0.42)', borderColor: 'rgba(122, 99, 80, 0.30)', color: 'rgba(240, 226, 206, 0.3)' }
                      }
                    >
                      <div className="scale-90 md:scale-[1.2]">
                        {task.id === lastCompletedTaskId && task.completed ? (
                          <svg className="w-6 h-6 animate-check" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: COLORS.cream }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <Icons.Check />
                        )}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <Layout currentMode={mode} setMode={setMode} userRole={userProfile?.role || 'student'} onLogout={handleLogout}>
      {renderContent()}

      {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onToggleComplete={handleToggleTaskStatus} />}

      {/* Celebration */}
      {showCelebration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 animate-in fade-in duration-1000" style={{ background: 'rgba(60, 37, 32, 0.4)', backdropFilter: 'blur(10px)' }}></div>
          <div className="relative flex flex-col items-center animate-in zoom-in-50 duration-700">
            <div className="text-[12rem] animate-bounce">⭐</div>
            <h2 className="text-5xl font-serif" style={{ color: COLORS.cream }}>Plus 1 Star!</h2>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
