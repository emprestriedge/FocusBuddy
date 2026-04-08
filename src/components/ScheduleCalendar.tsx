import React, { useState, useMemo } from 'react';
import { Task } from '../types';
import { Icons, COLORS } from '../constants';

interface ScheduleCalendarProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  lastCompletedTaskId?: string | null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({ tasks, onSelectTask, lastCompletedTaskId }) => {
  const [weekOffset, setWeekOffset] = useState(0);

  const getWeekDates = (offset: number) => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1 + (offset * 7));
    return DAYS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  };

  const weekDates = getWeekDates(weekOffset);
  const todayStr = new Date().toISOString().split('T')[0];

  const weekLabel = useMemo(() => {
    const start = new Date(weekDates[0] + 'T12:00:00');
    const end = new Date(weekDates[4] + 'T12:00:00');
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [weekDates]);

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
        <div className="space-y-2">
          <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Planning</div>
          <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>This Week.</h2>
        </div>

        <div className="flex items-center space-x-3 glass-card p-2 rounded-full self-start md:self-auto">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-3 rounded-full transition-all active:scale-95" style={{ color: COLORS.caramel, background: 'rgba(81, 55, 33, 0.42)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="px-4 py-2 font-bold text-[10px] uppercase tracking-widest" style={{ color: COLORS.cream }}>{weekLabel}</span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-3 rounded-full transition-all active:scale-95" style={{ color: COLORS.caramel, background: 'rgba(81, 55, 33, 0.42)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest" style={{ color: COLORS.green }}>Today</button>
          )}
        </div>
      </header>

      <div className="space-y-6">
        {DAYS.map((day, dayIndex) => {
          const date = weekDates[dayIndex];
          const dayTasks = tasks.filter(t => t.date === date);
          const isToday = date === todayStr;
          const completedCount = dayTasks.filter(t => t.completed).length;

          return (
            <div key={date} className="glass-tile-tinted rounded-[2rem] p-5 md:p-8 space-y-4" style={isToday ? { boxShadow: `inset 0 0 0 2px ${COLORS.green}` } : {}}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl md:text-2xl font-serif" style={{ color: COLORS.cream }}>{day}</h3>
                  {isToday && <span className="text-[7px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ backgroundColor: COLORS.green, color: COLORS.cream }}>Today</span>}
                </div>
                {dayTasks.length > 0 && (
                  <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: completedCount === dayTasks.length ? COLORS.green : COLORS.caramel }}>
                    {completedCount}/{dayTasks.length} done
                  </span>
                )}
              </div>

              {dayTasks.length === 0 ? (
                <p className="font-serif text-sm py-2" style={{ color: COLORS.caramel, opacity: 0.5 }}>Nothing scheduled</p>
              ) : (
                <div className="space-y-2">
                  {dayTasks.map(task => (
                    <button
                      key={task.id}
                      onClick={() => onSelectTask(task)}
                      className={`w-full flex items-center p-4 rounded-xl text-left adhd-card transition-all ${
                        task.id === lastCompletedTaskId ? 'animate-success-pop' : ''
                      }`}
                      style={{ background: 'rgba(81, 55, 33, 0.30)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <h4 className={`font-serif text-lg md:text-xl truncate ${task.completed ? 'line-through opacity-40' : ''}`} style={{ color: COLORS.cream }}>{task.name}</h4>
                        {task.description && <p className="text-sm truncate" style={{ color: COLORS.caramel, opacity: 0.7 }}>{task.description}</p>}
                      </div>
                      <div className={`ml-4 w-10 h-10 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                        task.completed ? '' : 'opacity-30'
                      }`} style={task.completed ? { backgroundColor: COLORS.green, color: COLORS.cream, borderColor: COLORS.green } : { borderColor: 'rgba(122, 99, 80, 0.35)', color: COLORS.caramel }}>
                        <div className="scale-75">
                          {task.id === lastCompletedTaskId ? (
                            <svg className="w-6 h-6 animate-check" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: COLORS.cream }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <Icons.Check />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ScheduleCalendar;
