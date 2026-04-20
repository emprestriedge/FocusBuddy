import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppMode, Task, UserProfile, ActivityEntry, StarData } from './types';
import { storageService } from './services/storageService';
import Layout from './components/Layout';
import Login from './components/Login';
import TaskDetail from './components/TaskDetail';
import AdminPanel from './components/AdminPanel';
import Portfolio from './components/Portfolio';
import ScheduleCalendar from './components/ScheduleCalendar';
import Toolbox from './components/Toolbox';
import { Icons, COLORS, toLocalDateString } from './constants';
import { User } from 'firebase/auth';

const App: React.FC = () => {
  // Auth state
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Diagnostic: sync status for debugging cross-device sync issues
  const [syncStatus, setSyncStatus] = useState<string>('idle');

  // App state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [mode, setMode] = useState<AppMode>(AppMode.STUDENT);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showStarShop, setShowStarShop] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState('Plus 1 Star!');
  const [lastCompletedTaskId, setLastCompletedTaskId] = useState<string | null>(null);
  const [starData, setStarData] = useState<StarData>(() => storageService.getStarData());

  // Listen for auth state changes and configure cloud sync target
  useEffect(() => {
    const unsub = storageService.onAuthStateChanged(async (user) => {
      console.log('[FB-SYNC] Auth state changed. User:', user?.uid || 'null', 'email:', user?.email);
      setAuthUser(user);
      if (user) {
        setSyncStatus('loading profile...');
        const profile = await storageService.getUserProfile(user.uid);
        console.log('[FB-SYNC] Profile loaded:', profile);
        setUserProfile(profile);

        if (!profile) {
          console.error('[FB-SYNC] No profile doc found for UID:', user.uid);
          setSyncStatus('no profile found');
        }

        // Determine the student UID for cloud sync
        // Parent → use linkedTo (the student's UID)
        // Student → use own UID
        const targetStudentUid = profile?.role === 'parent'
          ? profile.linkedTo
          : user.uid;

        console.log('[FB-SYNC] Target student UID:', targetStudentUid, 'role:', profile?.role);

        if (targetStudentUid) {
          storageService.setCloudTarget(targetStudentUid);
          // Migrate old data if needed (one-time)
          await storageService.migrateToSharedPath(targetStudentUid);
        } else {
          console.error('[FB-SYNC] No target student UID — parent missing linkedTo?');
          setSyncStatus('not linked to student');
        }

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

  // Sync star data after hydration
  useEffect(() => {
    if (isHydrated) {
      setStarData(storageService.getStarData());
    }
  }, [isHydrated]);

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

  // Subscribe to cloud updates — ALL accounts (parent AND student) listen
  // to the same shared schedule under the student's UID
  const studentUid = userProfile?.role === 'parent' ? userProfile.linkedTo : authUser?.uid;

  useEffect(() => {
    if (!isHydrated || !studentUid) return;

    console.log('[FB-SYNC] Pulling from cloud for student UID:', studentUid);
    setSyncStatus('pulling schedule...');

    // Pull latest from cloud first, then subscribe for real-time updates
    storageService.pullFromCloud(studentUid).then((cloudTasks) => {
      console.log('[FB-SYNC] Pull succeeded. Tasks found:', cloudTasks.length);
      setSyncStatus(`loaded ${cloudTasks.length} tasks`);
      if (cloudTasks.length > 0) {
        setTasks(cloudTasks);
      }
    }).catch((err) => {
      console.error('[FB-SYNC] Pull from cloud failed:', err);
      setSyncStatus(`sync failed: ${err?.message || err}`);
    });

    const unsubscribe = storageService.subscribeToCloud(studentUid, (updatedTasks) => {
      console.log('[FB-SYNC] Real-time update received. Tasks:', updatedTasks.length);
      setTasks(updatedTasks);
    });

    // Pull & subscribe to stars
    storageService.pullStarsFromCloud(studentUid).then((cloudStars) => {
      if (cloudStars) setStarData(cloudStars);
    });
    const unsubStars = storageService.subscribeToStars(studentUid, (updatedStars) => {
      setStarData(updatedStars);
    });

    return () => { unsubscribe(); unsubStars(); };
  }, [studentUid, isHydrated]);

  const handleTasksUpdated = useCallback((updatedTasks: Task[]) => {
    setTasks(updatedTasks);
  }, []);

  // Helper: get Monday date string for a given date
  const getMondayOfWeek = useCallback((dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return toLocalDateString(monday);
  }, []);

  const handleToggleTaskStatus = useCallback((id: string, photoUrl: string, reflection: string, showInGallery: boolean) => {
    let celebrationTriggered = false;
    let bonusMessages: string[] = [];

    const updatedTasks = storageService.getTasks().map(t => {
      if (t.id === id) {
        const isTurningComplete = !t.completed;
        if (isTurningComplete) {
          // Award task star (only if not already earned)
          const earned = storageService.earnTaskStar(id);
          if (earned) {
            celebrationTriggered = true;
            setLastCompletedTaskId(id);
            setTimeout(() => setLastCompletedTaskId(null), 3000);
          }

          // Log activity under the student's shared path
          const targetUid = storageService.getCloudTarget() || authUser?.uid;
          if (targetUid) {
            const entry: ActivityEntry = {
              id: Math.random().toString(36).substr(2, 9),
              taskId: id,
              taskName: t.name,
              completedAt: new Date().toISOString(),
              hasPhoto: !!photoUrl,
              hasVoiceNote: !!reflection,
              voiceSummary: reflection ? reflection.substring(0, 200) : undefined
            };
            storageService.logActivity(targetUid, entry);
          }
        } else {
          // Un-completing: remove the star
          storageService.removeTaskStar(id);
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

    // Check for daily bonus: all tasks for this task's date completed
    const thisTask = updatedTasks.find(t => t.id === id);
    if (thisTask?.completed && thisTask.date) {
      const dayTasks = updatedTasks.filter(t => t.date === thisTask.date);
      if (dayTasks.length > 0 && dayTasks.every(t => t.completed)) {
        const dailyEarned = storageService.earnDailyBonus(thisTask.date);
        if (dailyEarned) {
          bonusMessages.push('Daily Bonus! +1 Star');
        }

        // Check for weekly bonus: all 5 weekdays completed
        const monday = getMondayOfWeek(thisTask.date);
        const DAYS_OFFSETS = [0, 1, 2, 3, 4];
        const weekDates = DAYS_OFFSETS.map(offset => {
          const d = new Date(monday + 'T12:00:00');
          d.setDate(d.getDate() + offset);
          return toLocalDateString(d);
        });

        const allWeekComplete = weekDates.every(date => {
          const dayTasks = updatedTasks.filter(t => t.date === date);
          return dayTasks.length > 0 && dayTasks.every(t => t.completed);
        });

        if (allWeekComplete) {
          const weeklyEarned = storageService.earnWeeklyBonus(monday);
          if (weeklyEarned) {
            bonusMessages.push('FULL WEEK! +5 Stars!');
          }
        }
      }
    }

    // Refresh star data for UI
    setStarData({ ...storageService.getStarData() });

    if (celebrationTriggered || bonusMessages.length > 0) {
      setCelebrationMessage(bonusMessages.length > 0 ? bonusMessages.join('\n') : 'Plus 1 Star!');
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 4000);
    }
  }, [authUser, getMondayOfWeek]);

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
        return <AdminPanel
          onTasksUpdated={handleTasksUpdated}
          studentUid={studentUid}
          parentUid={authUser?.uid}
          starData={starData}
          onStarDataChanged={() => setStarData({ ...storageService.getStarData() })}
          onLinked={(newStudentUid) => {
            storageService.setCloudTarget(newStudentUid);
            storageService.migrateToSharedPath(newStudentUid);
            setUserProfile(prev => prev ? { ...prev, linkedTo: newStudentUid } : prev);
          }}
        />;
      case AppMode.PORTFOLIO:
        return <Portfolio tasks={tasks} onTasksUpdated={handleTasksUpdated} />;
      case AppMode.TOOLBOX:
        return <Toolbox onReturnToToday={() => setMode(AppMode.STUDENT)} onTasksUpdated={handleTasksUpdated} />;
      case AppMode.CALENDAR:
        return <ScheduleCalendar tasks={tasks} onSelectTask={setSelectedTask} lastCompletedTaskId={lastCompletedTaskId} />;
      case AppMode.STUDENT:
      default:
        const today = toLocalDateString();
        const todayTasks = tasks.filter(t => t.date === today && !t.completed);
        const allTodayTasks = tasks.filter(t => t.date === today);
        const progress = allTodayTasks.length > 0 ? (allTodayTasks.filter(t => t.completed).length / allTodayTasks.length) * 100 : 0;

        return (
          <div className="space-y-6 md:space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700 max-w-4xl">
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
                <button
                  onClick={() => setShowStarShop(true)}
                  className="flex items-center space-x-2 md:space-x-3 glass-card px-4 py-2 md:px-6 md:py-2.5 rounded-full transition-all active:scale-95 hover:scale-105"
                >
                  <span className="text-xl md:text-2xl">⭐</span>
                  <span className="font-serif text-lg md:text-2xl" style={{ color: COLORS.cream }}>{starData.total}</span>
                </button>
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
                  Go to Library
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
      {/* DIAGNOSTIC: Sync status banner - remove once cross-device sync is confirmed working */}
      {syncStatus !== 'idle' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          padding: '6px 12px',
          fontSize: '11px',
          fontFamily: 'monospace',
          textAlign: 'center',
          backgroundColor: syncStatus.startsWith('sync failed') || syncStatus === 'no profile found' || syncStatus === 'not linked to student'
            ? 'rgba(220, 38, 38, 0.92)'
            : syncStatus.startsWith('loaded')
            ? 'rgba(34, 139, 107, 0.92)'
            : 'rgba(81, 55, 33, 0.92)',
          color: '#F0E2CE',
          letterSpacing: '0.05em'
        }}>
          SYNC: {syncStatus} {authUser?.email ? `| ${authUser.email}` : ''} {studentUid ? `| student: ${studentUid.substring(0, 8)}...` : ''}
        </div>
      )}

      {renderContent()}

      {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onToggleComplete={handleToggleTaskStatus} />}

      {/* Star Shop Modal */}
      {showStarShop && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8">
          <div className="absolute inset-0 backdrop-blur-xl" style={{ background: 'rgba(60, 37, 32, 0.6)' }} onClick={() => setShowStarShop(false)} />
          <div className="glass-card w-full max-w-lg rounded-[2.5rem] overflow-hidden relative animate-in slide-in-from-bottom-8 duration-500 shadow-2xl">
            <button onClick={() => setShowStarShop(false)} className="absolute top-6 right-6 p-2 rounded-full transition-all z-10" style={{ background: 'rgba(122, 99, 80, 0.30)', color: COLORS.cream }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="p-8 md:p-12 space-y-8 max-h-[85vh] overflow-y-auto">
              <header className="text-center space-y-3">
                <div className="text-6xl">⭐</div>
                <h2 className="text-4xl font-serif" style={{ color: COLORS.cream }}>{starData.total} Stars</h2>
                <p className="text-sm" style={{ color: COLORS.caramel }}>Spend your stars on rewards!</p>
              </header>

              {starData.rewards.length === 0 ? (
                <div className="text-center py-8">
                  <p className="font-serif text-lg" style={{ color: COLORS.caramel }}>No rewards available yet.</p>
                  <p className="text-sm mt-2" style={{ color: COLORS.caramel, opacity: 0.6 }}>Ask your parent to set some up!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {starData.rewards.map(reward => {
                    const canAfford = starData.total >= reward.cost;
                    return (
                      <div key={reward.id} className="flex items-center gap-4 p-5 rounded-2xl" style={{ background: 'rgba(81, 55, 33, 0.42)' }}>
                        <span className="text-3xl">{reward.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-serif text-lg truncate" style={{ color: COLORS.cream }}>{reward.name}</h3>
                          <p className="text-sm" style={{ color: COLORS.caramel }}>⭐ {reward.cost}</p>
                        </div>
                        <button
                          onClick={() => {
                            if (storageService.redeemReward(reward)) {
                              setStarData({ ...storageService.getStarData() });
                              setCelebrationMessage(`${reward.emoji} ${reward.name} unlocked!`);
                              setShowStarShop(false);
                              setShowCelebration(true);
                              setTimeout(() => setShowCelebration(false), 4000);
                            }
                          }}
                          disabled={!canAfford}
                          className="px-5 py-2 rounded-full font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-30"
                          style={{ backgroundColor: canAfford ? COLORS.green : 'rgba(81, 55, 33, 0.42)', color: canAfford ? '#1e2830' : COLORS.caramel }}
                        >
                          {canAfford ? 'Get It!' : 'Need More'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Recent redemptions */}
              {starData.redemptions.length > 0 && (
                <div className="space-y-3 pt-4" style={{ borderTop: '1px solid rgba(81, 55, 33, 0.45)' }}>
                  <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: COLORS.caramel }}>Rewards History</h3>
                  {starData.redemptions.slice(-5).reverse().map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(81, 55, 33, 0.25)' }}>
                      <span className="font-serif text-sm" style={{ color: COLORS.cream }}>{r.rewardName}</span>
                      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: COLORS.caramel }}>
                        {new Date(r.redeemedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Celebration */}
      {showCelebration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 animate-in fade-in duration-1000" style={{ background: 'rgba(60, 37, 32, 0.4)', backdropFilter: 'blur(10px)' }}></div>
          <div className="relative flex flex-col items-center animate-in zoom-in-50 duration-700">
            <div className="text-[12rem] animate-bounce">⭐</div>
            {celebrationMessage.split('\n').map((line, i) => (
              <h2 key={i} className="text-4xl md:text-5xl font-serif text-center" style={{ color: COLORS.cream }}>{line}</h2>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
