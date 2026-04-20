import React, { useState, useRef, useEffect } from 'react';
import { storageService } from '../services/storageService';
import { geminiService } from '../services/geminiService';
import { Task, ActivityEntry, StarData, StarReward } from '../types';
import { COLORS, Icons, toLocalDateString } from '../constants';

interface AdminPanelProps {
  onTasksUpdated: (tasks: Task[]) => void;
  studentUid?: string;
  parentUid?: string;
  starData?: StarData;
  onStarDataChanged?: () => void;
  onLinked?: (studentUid: string) => void;
}

type SyncState = 'idle' | 'syncing' | 'synced' | 'failed';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const REWARD_EMOJIS = ['🎮', '🍕', '🎬', '🏀', '🎯', '🎨', '🎵', '🛒', '🍦', '🎁', '📱', '🎪'];

const AdminPanel: React.FC<AdminPanelProps> = ({ onTasksUpdated, studentUid, parentUid, starData, onStarDataChanged, onLinked }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [curriculumPrompt, setCurriculumPrompt] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [aiInsight, setAiInsight] = useState('');
  const [suggestedTasks, setSuggestedTasks] = useState<any[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);

  // Reward shop state
  const [newRewardName, setNewRewardName] = useState('');
  const [newRewardCost, setNewRewardCost] = useState('');
  const [newRewardEmoji, setNewRewardEmoji] = useState('🎮');

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);

  const getWeekDates = (offset: number) => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1 + (offset * 7));
    return DAYS.map((day, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return toLocalDateString(d);
    });
  };

  const weekDates = getWeekDates(weekOffset);
  const weekLabel = (() => {
    const start = new Date(weekDates[0] + 'T12:00:00');
    const end = new Date(weekDates[4] + 'T12:00:00');
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  })();

  // Quick add state per day
  const [quickAdds, setQuickAdds] = useState<Record<string, { name: string; accountability: 'photo' | 'voice' | 'both' | 'none' }>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const allTasks = storageService.getTasks();
    setTasks(allTasks);

    const reflections = allTasks
      .filter(t => t.completed && t.reflectionText)
      .map(t => t.reflectionText as string);

    if (reflections.length > 0) {
      geminiService.summarizeStudentReflections(reflections).then(setAiInsight);
    } else {
      setAiInsight("No recent student notes yet. Insights appear once tasks are completed with voice summaries!");
    }
  }, []);

  // Subscribe to activity feed
  useEffect(() => {
    if (studentUid) {
      const unsub = storageService.subscribeToActivity(studentUid, setActivityFeed);
      return () => unsub();
    }
  }, [studentUid]);

  const handleLinkStudent = async () => {
    if (!linkEmail.trim() || !parentUid) return;
    setLinkLoading(true);
    setLinkError('');
    try {
      const result = await storageService.findStudentByEmail(linkEmail);
      if (!result) {
        setLinkError("No student account found with that email.");
        setLinkLoading(false);
        return;
      }
      await storageService.linkParentStudent(parentUid, result.uid);
      onLinked?.(result.uid);
      setLinkEmail('');
      setFeedback(`Linked to ${result.profile.name}!`);
    } catch (err: any) {
      setLinkError(err.message || "Something went wrong.");
    }
    setLinkLoading(false);
  };

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handleCloudSync = async () => {
    if (syncState === 'syncing' || !studentUid) return;
    setSyncState('syncing');
    setFeedback('');
    try {
      const allTasks = storageService.getTasks();
      if (allTasks.length === 0) {
        setFeedback("Add some homework first before syncing.");
        setSyncState('failed');
        return;
      }
      // Push to the shared student path
      await storageService.pushToCloud(studentUid, allTasks);
      setSyncState('synced');
      setTimeout(() => setSyncState('idle'), 3000);
    } catch (err: any) {
      setSyncState('failed');
      setFeedback(`${err.message || 'Sync Error'}`);
      setTimeout(() => setSyncState('idle'), 5000);
    }
  };

  // Show sync status indicator
  const cloudEnabled = storageService.isCloudEnabled();

  const handleAiTaskGen = async () => {
    if (!curriculumPrompt.trim()) return;
    setLoading(true);
    const generated = await geminiService.generateCurriculumTasks(curriculumPrompt);
    setSuggestedTasks(generated);
    setLoading(false);
  };

  const deployTasks = (targetDate: string) => {
    const newTasks: Task[] = suggestedTasks.map((t) => ({
      id: Math.random().toString(36).substr(2, 9),
      date: targetDate,
      name: t.name,
      description: t.description,
      accountabilityType: t.accountabilityType || 'voice',
      completed: false
    }));

    storageService.addTasks(newTasks);
    const updated = storageService.getTasks();
    setTasks(updated);
    onTasksUpdated(updated);
    setSuggestedTasks([]);
    setCurriculumPrompt('');
    setFeedback(`Added ${newTasks.length} tasks!`);
  };

  const handleQuickAdd = (date: string) => {
    const qa = quickAdds[date];
    if (!qa?.name?.trim()) return;

    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      date,
      name: qa.name,
      description: '',
      accountabilityType: qa.accountability || 'voice',
      completed: false
    };

    storageService.addTasks([newTask]);
    const updated = storageService.getTasks();
    setTasks(updated);
    onTasksUpdated(updated);
    setQuickAdds({ ...quickAdds, [date]: { name: '', accountability: 'voice' } });
  };

  const handleDeleteTask = (id: string) => {
    storageService.deleteTask(id);
    const updated = storageService.getTasks();
    setTasks(updated);
    onTasksUpdated(updated);
  };

  const handleUpdateTask = (updatedTask: Task) => {
    storageService.updateTask(updatedTask);
    const updated = storageService.getTasks();
    setTasks(updated);
    onTasksUpdated(updated);
    setEditingTaskId(null);
  };

  const processCsv = (text: string) => {
    try {
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
      const imported: Task[] = [];
      const startIndex = lines[0].toLowerCase().includes('date') ? 1 : 0;

      for (let i = startIndex; i < lines.length; i++) {
        const currentLine = lines[i].split(',').map(s => s.trim());
        if (currentLine.length < 2) continue;

        const [date, name, description, accountability] = currentLine;

        imported.push({
          id: Math.random().toString(36).substr(2, 9),
          date: date || weekDates[0],
          name: name || 'Untitled Task',
          description: description || '',
          accountabilityType: (accountability as any) || 'voice',
          completed: false
        });
      }

      if (imported.length > 0) {
        storageService.addTasks(imported);
        const updated = storageService.getTasks();
        setTasks(updated);
        onTasksUpdated(updated);
        setFeedback(`Imported ${imported.length} tasks.`);
      }
    } catch (err) {
      setFeedback('Error processing CSV.');
    }
  };

  const accountabilityLabel = (type: string) => {
    switch (type) {
      case 'photo': return '📷';
      case 'voice': return '🎤';
      case 'both': return '📷🎤';
      default: return '—';
    }
  };

  return (
    <div className="space-y-10 max-w-7xl mx-auto animate-in fade-in duration-700 pb-20 px-1">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: `1px solid rgba(81, 55, 33, 0.45)` }}>
        <div className="space-y-3">
          <div className="font-bold uppercase tracking-[0.4em] text-[10px]" style={{ color: COLORS.caramel }}>Command Center</div>
          <h2 className="text-5xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Homework Planner.</h2>
        </div>
        <div className="flex items-center gap-4">
          {cloudEnabled && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(93, 211, 182, 0.12)' }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: COLORS.green }}></div>
              <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: COLORS.green }}>Live Sync</span>
            </div>
          )}
          <button
            onClick={handleCloudSync}
            disabled={syncState === 'syncing' || !studentUid}
            className="px-8 py-3 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg transition-all flex items-center space-x-2 hover:scale-105 disabled:opacity-40"
            style={{
              backgroundColor: syncState === 'synced' ? '#22c55e' : syncState === 'failed' ? '#ef4444' : COLORS.green,
              color: COLORS.cream
            }}
          >
            {syncState === 'syncing' ? 'Syncing...' : syncState === 'synced' ? <><Icons.Check /><span>Synced!</span></> : cloudEnabled ? 'Force Sync' : 'Push to Zaiden'}
          </button>
        </div>
      </header>

      {/* Link Student Account */}
      {!studentUid && (
        <div className="glass-tile-tinted rounded-[2rem] p-6 md:p-8 space-y-4">
          <div className="space-y-2">
            <h3 className="text-xl font-serif" style={{ color: COLORS.cream }}>Link Student Account</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: COLORS.caramel }}>Enter your student's email to connect accounts and enable syncing.</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="email"
              placeholder="Student's email..."
              value={linkEmail}
              onChange={(e) => setLinkEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLinkStudent()}
              className="flex-1 px-4 py-3 rounded-xl font-serif text-lg border outline-none"
              style={{ background: 'rgba(81, 55, 33, 0.30)', borderColor: 'rgba(81, 55, 33, 0.45)', color: COLORS.cream }}
            />
            <button
              onClick={handleLinkStudent}
              disabled={linkLoading || !linkEmail.trim()}
              className="px-6 py-3 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all hover:scale-105 disabled:opacity-30"
              style={{ backgroundColor: COLORS.green, color: COLORS.cream }}
            >
              {linkLoading ? 'Linking...' : 'Link'}
            </button>
          </div>
          {linkError && (
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#EF4444' }}>{linkError}</p>
          )}
        </div>
      )}

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-3 rounded-full transition-all active:scale-95" style={{ color: COLORS.caramel, background: 'rgba(81, 55, 33, 0.42)' }}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="text-center">
          <h3 className="text-2xl font-serif" style={{ color: COLORS.cream }}>{weekLabel}</h3>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: COLORS.green }}>
              Back to this week
            </button>
          )}
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} className="p-3 rounded-full transition-all active:scale-95" style={{ color: COLORS.caramel, background: 'rgba(81, 55, 33, 0.42)' }}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* Weekly Grid */}
      <div className="space-y-8">
        {DAYS.map((day, dayIndex) => {
          const date = weekDates[dayIndex];
          const dayTasks = tasks.filter(t => t.date === date);
          const isToday = date === toLocalDateString();
          const qa = quickAdds[date] || { name: '', accountability: 'voice' };

          return (
            <div key={date} className="glass-tile-tinted rounded-[2rem] p-6 md:p-8 space-y-4" style={isToday ? { boxShadow: `inset 0 0 0 2px ${COLORS.green}` } : {}}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-serif" style={{ color: COLORS.cream }}>{day}</h3>
                  {isToday && <span className="text-[8px] font-bold uppercase tracking-widest px-3 py-1 rounded-full" style={{ backgroundColor: COLORS.green, color: COLORS.cream }}>Today</span>}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: COLORS.caramel }}>
                  {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>

              {/* Tasks for this day */}
              <div className="space-y-2">
                {dayTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl group" style={{ background: 'rgba(81, 55, 33, 0.30)' }}>
                    <span className="text-lg" title={`Accountability: ${task.accountabilityType}`}>{accountabilityLabel(task.accountabilityType)}</span>
                    {editingTaskId === task.id ? (
                      <input
                        autoFocus
                        className="flex-1 px-3 py-1 rounded-lg bg-transparent font-serif text-lg outline-none"
                        style={{ color: COLORS.cream, borderBottom: `2px solid ${COLORS.green}` }}
                        value={task.name}
                        onChange={(e) => setTasks(tasks.map(t => t.id === task.id ? { ...t, name: e.target.value } : t))}
                        onBlur={() => handleUpdateTask(task)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateTask(task)}
                      />
                    ) : (
                      <span
                        className={`flex-1 font-serif text-lg cursor-pointer ${task.completed ? 'line-through opacity-40' : ''}`}
                        style={{ color: COLORS.cream }}
                        onClick={() => setEditingTaskId(task.id)}
                      >
                        {task.name}
                      </span>
                    )}

                    {/* Accountability type toggle */}
                    <select
                      value={task.accountabilityType}
                      onChange={(e) => handleUpdateTask({ ...task, accountabilityType: e.target.value as any })}
                      className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg bg-transparent outline-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: COLORS.caramel, border: `1px solid rgba(177, 148, 112, 0.3)` }}
                    >
                      <option value="voice">🎤 Voice</option>
                      <option value="photo">📷 Photo</option>
                      <option value="both">📷🎤 Both</option>
                      <option value="none">— None</option>
                    </select>

                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                      style={{ color: '#EF4444' }}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Quick add for this day */}
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Add homework..."
                  value={qa.name}
                  onChange={(e) => setQuickAdds({ ...quickAdds, [date]: { ...qa, name: e.target.value } })}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd(date)}
                  className="flex-1 px-4 py-3 rounded-xl font-serif text-lg border outline-none"
                  style={{ background: 'rgba(81, 55, 33, 0.30)', borderColor: 'rgba(81, 55, 33, 0.45)', color: COLORS.cream }}
                />
                <select
                  value={qa.accountability}
                  onChange={(e) => setQuickAdds({ ...quickAdds, [date]: { ...qa, accountability: e.target.value as any } })}
                  className="px-3 py-3 rounded-xl text-[9px] font-bold uppercase tracking-wider border outline-none cursor-pointer"
                  style={{ background: 'rgba(81, 55, 33, 0.30)', borderColor: 'rgba(81, 55, 33, 0.45)', color: COLORS.caramel }}
                >
                  <option value="voice">🎤 Voice</option>
                  <option value="photo">📷 Photo</option>
                  <option value="both">📷🎤 Both</option>
                  <option value="none">— None</option>
                </select>
                <button
                  onClick={() => handleQuickAdd(date)}
                  disabled={!qa.name?.trim()}
                  className="px-6 py-3 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all hover:scale-105 disabled:opacity-30"
                  style={{ backgroundColor: COLORS.green, color: COLORS.cream }}
                >
                  Add
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Star Shop Manager */}
      <div className="glass-tile-tinted rounded-[2.5rem] p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⭐</span>
            <h3 className="text-xl font-serif" style={{ color: COLORS.cream }}>Star Shop</h3>
          </div>
          {starData && (
            <span className="font-serif text-lg" style={{ color: COLORS.green }}>
              {starData.total} stars earned
            </span>
          )}
        </div>

        <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed" style={{ color: COLORS.caramel }}>
          Set up rewards Zaiden can spend stars on. 1 star per task, +1 bonus for finishing a day, +5 for a full week.
        </p>

        {/* Existing rewards */}
        {starData && starData.rewards.length > 0 && (
          <div className="space-y-2">
            {starData.rewards.map(reward => (
              <div key={reward.id} className="flex items-center gap-3 p-4 rounded-xl group" style={{ background: 'rgba(81, 55, 33, 0.30)' }}>
                <span className="text-2xl">{reward.emoji}</span>
                <span className="flex-1 font-serif text-lg" style={{ color: COLORS.cream }}>{reward.name}</span>
                <span className="font-bold text-sm" style={{ color: COLORS.green }}>⭐ {reward.cost}</span>
                <button
                  onClick={() => { storageService.deleteReward(reward.id); onStarDataChanged?.(); }}
                  className="p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                  style={{ color: '#EF4444' }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new reward */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {REWARD_EMOJIS.map(e => (
              <button key={e} onClick={() => setNewRewardEmoji(e)}
                className="w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all"
                style={{ background: newRewardEmoji === e ? COLORS.green : 'rgba(81, 55, 33, 0.42)', opacity: newRewardEmoji === e ? 1 : 0.6 }}>
                {e}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Reward name..."
              value={newRewardName}
              onChange={(e) => setNewRewardName(e.target.value)}
              className="flex-1 px-4 py-3 rounded-xl font-serif text-lg border outline-none"
              style={{ background: 'rgba(81, 55, 33, 0.30)', borderColor: 'rgba(81, 55, 33, 0.45)', color: COLORS.cream }}
            />
            <input
              type="number"
              placeholder="Cost"
              value={newRewardCost}
              onChange={(e) => setNewRewardCost(e.target.value)}
              className="w-24 px-4 py-3 rounded-xl font-serif text-lg border outline-none text-center"
              style={{ background: 'rgba(81, 55, 33, 0.30)', borderColor: 'rgba(81, 55, 33, 0.45)', color: COLORS.cream }}
            />
            <button
              onClick={() => {
                if (!newRewardName.trim() || !newRewardCost) return;
                const reward: StarReward = {
                  id: Math.random().toString(36).slice(2),
                  name: newRewardName.trim(),
                  cost: parseInt(newRewardCost) || 10,
                  emoji: newRewardEmoji,
                  createdAt: new Date().toISOString()
                };
                storageService.addReward(reward);
                onStarDataChanged?.();
                setNewRewardName('');
                setNewRewardCost('');
                setFeedback(`Added reward: ${reward.emoji} ${reward.name}`);
              }}
              disabled={!newRewardName.trim() || !newRewardCost}
              className="px-6 py-3 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all hover:scale-105 disabled:opacity-30"
              style={{ backgroundColor: COLORS.green, color: COLORS.cream }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Recent redemptions */}
        {starData && starData.redemptions.length > 0 && (
          <div className="space-y-2 pt-4" style={{ borderTop: '1px solid rgba(81, 55, 33, 0.45)' }}>
            <h4 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: COLORS.caramel }}>Recent Redemptions</h4>
            {starData.redemptions.slice(-5).reverse().map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(81, 55, 33, 0.25)' }}>
                <span className="font-serif text-sm" style={{ color: COLORS.cream }}>{r.rewardName} (⭐{r.cost})</span>
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: COLORS.green }}>
                  {new Date(r.redeemedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar: AI Planner + Activity Feed + Insight */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* AI Planner */}
        <div className="glass-tile-tinted rounded-[2.5rem] p-8 space-y-6">
          <h3 className="text-xl font-serif" style={{ color: COLORS.cream }}>AI Planner</h3>
          <textarea
            className="w-full h-32 p-5 rounded-2xl font-serif text-lg resize-none shadow-inner outline-none border"
            style={{ background: 'rgba(81, 55, 33, 0.30)', borderColor: 'rgba(81, 55, 33, 0.45)', color: COLORS.cream }}
            placeholder="Describe a topic to auto-generate homework..."
            value={curriculumPrompt}
            onChange={(e) => setCurriculumPrompt(e.target.value)}
          />
          <button
            onClick={handleAiTaskGen}
            disabled={loading || !curriculumPrompt.trim()}
            className="w-full py-4 rounded-full font-bold text-[9px] uppercase tracking-[0.4em] shadow-lg disabled:opacity-30"
            style={{ backgroundColor: COLORS.green, color: COLORS.cream }}
          >
            {loading ? 'Thinking...' : 'Generate Plan'}
          </button>
          {suggestedTasks.length > 0 && (
            <div className="space-y-4 pt-4" style={{ borderTop: `1px solid rgba(81, 55, 33, 0.45)` }}>
              {suggestedTasks.map((t, i) => (
                <div key={i} className="p-3 rounded-xl" style={{ background: 'rgba(81, 55, 33, 0.30)' }}>
                  <p className="font-serif text-lg" style={{ color: COLORS.cream }}>{t.name}</p>
                  <p className="text-sm" style={{ color: COLORS.caramel }}>{t.description}</p>
                </div>
              ))}
              <div className="flex gap-3">
                {weekDates.map((date, i) => (
                  <button
                    key={date}
                    onClick={() => deployTasks(date)}
                    className="flex-1 py-3 rounded-xl font-bold text-[9px] uppercase tracking-widest transition-all hover:scale-105"
                    style={{ backgroundColor: COLORS.green, color: COLORS.cream }}
                  >
                    {DAYS[i].slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="glass-tile-tinted rounded-[2.5rem] p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div style={{ color: COLORS.green }}><Icons.Activity /></div>
            <h3 className="text-xl font-serif" style={{ color: COLORS.cream }}>Activity Feed</h3>
          </div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {activityFeed.length === 0 ? (
              <p className="font-serif text-center py-8" style={{ color: COLORS.caramel }}>
                No activity yet. Completed homework will show up here in real time.
              </p>
            ) : (
              activityFeed.map((entry) => (
                <div key={entry.id} className="p-4 rounded-xl space-y-1" style={{ background: 'rgba(81, 55, 33, 0.30)' }}>
                  <div className="flex items-center justify-between">
                    <p className="font-serif text-lg" style={{ color: COLORS.cream }}>{entry.taskName}</p>
                    <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: COLORS.caramel }}>
                      {new Date(entry.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.hasPhoto && <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: COLORS.green }}>📷 Photo</span>}
                    {entry.hasVoiceNote && <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: COLORS.green }}>🎤 Voice</span>}
                  </div>
                  {entry.voiceSummary && (
                    <p className="text-sm font-serif italic" style={{ color: COLORS.caramel }}>"{entry.voiceSummary}"</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Learning Insight */}
        <div className="glass-tile-tinted rounded-[2.5rem] p-8 space-y-6" style={{ borderColor: `rgba(67, 118, 108, 0.2)` }}>
          <div className="flex items-center space-x-3" style={{ color: COLORS.green }}>
            <div className="p-2 rounded-xl shadow-sm" style={{ background: 'rgba(67, 118, 108, 0.15)' }}><Icons.Sparkles /></div>
            <h3 className="text-xl font-serif" style={{ color: COLORS.cream }}>Learning Insight</h3>
          </div>
          <div className="p-6 rounded-3xl font-serif text-lg leading-relaxed shadow-inner" style={{ background: 'rgba(81, 55, 33, 0.30)', color: COLORS.caramel }}>
            "{aiInsight}"
          </div>
        </div>

        {/* Bulk Import */}
        <div className="glass-tile-tinted rounded-[2.5rem] p-8 space-y-4">
          <h3 className="text-xl font-serif" style={{ color: COLORS.cream }}>Bulk Import</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed" style={{ color: COLORS.caramel }}>Import a CSV: date, name, description, accountability</p>
          <div
            className="border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all min-h-[120px]"
            style={{ borderColor: 'rgba(122, 99, 80, 0.30)', background: 'rgba(81, 55, 33, 0.25)' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="scale-125 opacity-40" style={{ color: COLORS.caramel }}><Icons.Portfolio /></div>
            <p className="mt-4 text-[9px] font-bold uppercase tracking-widest" style={{ color: COLORS.caramel }}>Select CSV</p>
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => processCsv(ev.target?.result as string);
                reader.readAsText(file);
              }
            }} />
          </div>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 px-10 py-4 rounded-full font-serif text-xl animate-in slide-in-from-bottom-6 duration-500 z-[100] shadow-2xl flex items-center space-x-4"
          style={{ backgroundColor: 'rgba(81, 55, 33, 0.85)', color: COLORS.cream, border: `1px solid rgba(122, 99, 80, 0.35)` }}>
          <Icons.Check />
          <span>{feedback}</span>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
