import React from 'react';
import { AppMode } from '../types';
import { Icons, COLORS } from '../constants';

interface LayoutProps {
  children: React.ReactNode;
  currentMode: AppMode;
  setMode: (mode: AppMode) => void;
  userRole: 'parent' | 'student';
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentMode, setMode, userRole, onLogout }) => {
  const studentNav = [
    { mode: AppMode.STUDENT, icon: Icons.Home, label: 'Today' },
    { mode: AppMode.CALENDAR, icon: Icons.Calendar, label: 'Week' },
    { mode: AppMode.PORTFOLIO, icon: Icons.Portfolio, label: 'Library' },
    { mode: AppMode.TOOLBOX, icon: Icons.Toolbox, label: 'Toolbox' },
  ];

  const parentNav = [
    { mode: AppMode.ADMIN, icon: Icons.Admin, label: 'Planner' },
    { mode: AppMode.PORTFOLIO, icon: Icons.Portfolio, label: 'Library' },
  ];

  const navItems = userRole === 'parent' ? parentNav : studentNav;

  return (
    <div className="min-h-screen flex flex-col pb-28 md:pb-0 md:pl-32">
      {/* Desktop Sidebar */}
      <nav className="hidden md:flex fixed left-6 top-6 bottom-6 w-24 glass-card rounded-[2.5rem] flex-col items-center py-8 space-y-8 z-50">
        {navItems.map((item) => (
          <button
            key={item.mode}
            onClick={() => setMode(item.mode)}
            className={`flex flex-col items-center space-y-2 transition-all duration-500 group ${
              currentMode === item.mode
                ? ''
                : 'opacity-40 hover:opacity-100'
            }`}
            style={{ color: currentMode === item.mode ? COLORS.cream : COLORS.caramel }}
          >
            <div className={`p-3.5 rounded-2xl transition-all ${
              currentMode === item.mode
                ? 'shadow-lg scale-110'
                : 'hover:bg-white/5'
            }`} style={currentMode === item.mode ? { backgroundColor: 'rgba(122, 99, 80, 0.30)' } : {}}>
              <item.icon />
            </div>
            <span className="text-[8px] font-bold uppercase tracking-[0.25em]">{item.label}</span>
          </button>
        ))}

        {/* Logout at bottom */}
        <div className="flex-1" />
        <button
          onClick={onLogout}
          className="flex flex-col items-center space-y-2 opacity-70 hover:opacity-100 transition-all"
          style={{ color: COLORS.caramel }}
        >
          <div className="p-3.5 rounded-2xl hover:bg-white/10 transition-colors">
            <Icons.LogOut />
          </div>
          <span className="text-[8px] font-bold uppercase tracking-[0.25em]">Log Out</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-5 md:p-16 max-w-7xl mx-auto w-full relative">
        <div className="md:hidden mb-8 flex justify-between items-center">
          <h1 className="text-3xl font-serif" style={{ color: COLORS.cream }}>FocusBuddy.</h1>
          <button onClick={onLogout} className="p-2 rounded-full" style={{ color: COLORS.caramel }}>
            <Icons.LogOut />
          </button>
        </div>
        {children}
      </main>

      {/* Mobile Tab Bar */}
      <nav className="md:hidden fixed bottom-6 left-5 right-5 h-16 glass-card rounded-[1.75rem] flex justify-around items-center px-1 z-50 shadow-2xl">
        {navItems.map((item) => (
          <button
            key={item.mode}
            onClick={() => setMode(item.mode)}
            className={`flex flex-col items-center justify-center transition-all min-w-[50px] min-h-[50px] px-2 ${
              currentMode === item.mode ? 'scale-105' : 'opacity-60'
            }`}
            style={{ color: currentMode === item.mode ? COLORS.cream : COLORS.caramel }}
          >
            <div className={`p-1.5 rounded-xl transition-all ${
              currentMode === item.mode ? 'shadow-md' : 'bg-transparent'
            }`} style={currentMode === item.mode ? { backgroundColor: 'rgba(122, 99, 80, 0.30)' } : {}}>
              <div className="scale-95">
                <item.icon />
              </div>
            </div>
            <span className="text-[6px] font-bold uppercase tracking-widest mt-1">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Layout;
