import React, { useState } from 'react';
import { storageService } from '../services/storageService';
import { Icons, COLORS } from '../constants';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'parent' | 'student' | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (!name.trim() || !role) {
          setError('Please fill in all fields and select your role.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        await storageService.signUp(email, password, name, role);
      } else {
        await storageService.signIn(email, password);
      }
      onLogin();
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Email or password is incorrect.');
      } else if (code === 'auth/email-already-in-use') {
        setError('That email already has an account. Try signing in.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(err.message || 'Something went wrong.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card w-full max-w-sm rounded-[2.5rem] p-10 space-y-8 animate-in fade-in zoom-in duration-500">

        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: COLORS.green }}>
            <div className="text-cream scale-125"><Icons.Sparkles /></div>
          </div>
          <h1 className="text-4xl font-serif" style={{ color: COLORS.cream }}>FocusBuddy</h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: COLORS.caramel }}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-2xl text-center text-[10px] font-bold uppercase tracking-widest animate-in fade-in slide-in-from-top-2" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl font-serif text-lg border"
                style={{ background: 'rgba(248, 250, 229, 0.08)', borderColor: 'rgba(248, 250, 229, 0.1)', color: COLORS.cream }}
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRole('student')}
                  className={`flex-1 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all border ${
                    role === 'student'
                      ? 'shadow-lg'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  style={{
                    background: role === 'student' ? COLORS.green : 'rgba(248, 250, 229, 0.06)',
                    borderColor: role === 'student' ? COLORS.green : 'rgba(248, 250, 229, 0.1)',
                    color: COLORS.cream
                  }}
                >
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => setRole('parent')}
                  className={`flex-1 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all border ${
                    role === 'parent'
                      ? 'shadow-lg'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  style={{
                    background: role === 'parent' ? COLORS.green : 'rgba(248, 250, 229, 0.06)',
                    borderColor: role === 'parent' ? COLORS.green : 'rgba(248, 250, 229, 0.1)',
                    color: COLORS.cream
                  }}
                >
                  Parent
                </button>
              </div>
            </>
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full px-6 py-4 rounded-2xl font-serif text-lg border"
            style={{ background: 'rgba(248, 250, 229, 0.08)', borderColor: 'rgba(248, 250, 229, 0.1)', color: COLORS.cream }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            className="w-full px-6 py-4 rounded-2xl font-serif text-lg border"
            style={{ background: 'rgba(248, 250, 229, 0.08)', borderColor: 'rgba(248, 250, 229, 0.1)', color: COLORS.cream }}
          />

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full py-5 rounded-2xl font-bold text-[10px] uppercase tracking-[0.4em] shadow-xl transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
            style={{ backgroundColor: COLORS.green, color: COLORS.cream }}
          >
            {loading ? 'Working...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {/* Toggle */}
        <button
          onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
          className="w-full text-center text-[10px] font-bold uppercase tracking-widest transition-colors hover:opacity-100"
          style={{ color: COLORS.caramel, opacity: 0.8 }}
        >
          {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
        </button>
      </div>
    </div>
  );
};

export default Login;
