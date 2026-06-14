import React, { useState } from 'react';
import { UserProfile } from '../types';
import { Sparkles, Plus } from './Icons';
import { saveUser } from '../services/sheetService';

interface Props {
  users: UserProfile[];
  onLogin: (user: UserProfile) => void;
  isLoading: boolean;
  onRefreshUsers: () => Promise<void>;
}

const LoginView: React.FC<Props> = ({ users, onLogin, isLoading, onRefreshUsers }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    const user = users.find(
      u => {
          const matchEmail = String(u.email || '').trim().toLowerCase();
          const matchName = String(u.name || '').trim().toLowerCase();
          const matchPassword = String(u.password || '').trim();
          const isMatch = (matchEmail === trimmedEmail.toLowerCase() || matchName === trimmedEmail.toLowerCase()) && matchPassword === password.trim();
          return isMatch;
      }
    );

    if (user) {
      console.log('Login successful for user:', user);
      onLogin(user);
    } else {
      console.log('Login failed. Attempted:', { email: trimmedEmail, password: password });
      console.log('Available users:', users);
      setError('Invalid email or password.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      
      const trimmedEmail = email.trim();
      if (!name || !trimmedEmail || !password) {
          setError('All fields are required.');
          return;
      }

      if (users.some(u => String(u.email || '').trim().toLowerCase() === trimmedEmail.toLowerCase())) {
          setError('User with this email already exists.');
          return;
      }

      setIsSubmitting(true);
      try {
          const newUser: UserProfile = {
              id: crypto.randomUUID(),
              name: name,
              email: trimmedEmail,
              password: password,
              rate: '0',
              role: 'admin'
          };
          await saveUser(newUser, true);
          await onRefreshUsers();
          alert('Company Admin created successfully! Logging you in...');
          onLogin(newUser);
      } catch (err: any) {
          setError('Error creating company admin: ' + err.message);
      } finally {
          setIsSubmitting(false);
      }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-8 border border-slate-100">
        
        <div className="flex flex-col items-center mb-8">
            <svg viewBox="0 0 260 88" className="h-16 w-auto mb-4">
                <path d="M10 28 L20 38 L40 8" fill="none" stroke="#ea580c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                <text x="50" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ea580c">Tru</text>
                <text x="110" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">C</text>
                <text x="136" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">h</text>
                <path d="M136 12 L146 2 L156 12" fill="none" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                <text x="160" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">o</text>
                <rect x="187" y="20" width="6" height="20" fill="#0f172a" />
                <rect x="187" y="10" width="6" height="6" fill="#ea580c" />
                <text x="198" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">ce</text>
                <text x="110" y="62" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.1em' }} fill="#0f172a">ROOFING</text>
                <text x="110" y="78" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.08em' }} fill="#ea580c">PRODUCTION</text>
            </svg>
            <h2 className="text-xl font-bold text-slate-800">
                {isRegistering ? 'Create Company Admin' : 'Team Login'}
            </h2>
        </div>

        {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-slate-400">
               <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-orange-500 mb-4"></div>
               <p className="text-sm font-semibold">Connecting to Server...</p>
            </div>
        ) : (
            <>
                {isRegistering ? (
                    <form onSubmit={handleRegister} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                            <input 
                                type="text"
                                value={name}
                                onChange={(e) => { setName(e.target.value); setError(''); }}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-orange-500 focus:outline-none transition font-medium"
                                placeholder="Admin Name"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Admin Email</label>
                            <input 
                                type="email"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-orange-500 focus:outline-none transition font-medium"
                                placeholder="admin@company.com"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
                            <input 
                                type="password"
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-orange-500 focus:outline-none transition font-medium"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {error && <p className="text-red-500 text-sm font-semibold bg-red-50 p-3 rounded-lg">{error}</p>}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`w-full py-3.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-orange-200/50 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {isSubmitting ? 'Creating...' : <><Plus size={18} /> Create Company</>}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email or Username</label>
                            <input 
                                type="text"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-orange-500 focus:outline-none transition font-medium"
                                placeholder="team@example.com"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
                            <input 
                                type="password"
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-orange-500 focus:outline-none transition font-medium"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {error && <p className="text-red-500 text-sm font-semibold bg-red-50 p-3 rounded-lg">{error}</p>}

                        <button
                            type="submit"
                            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-slate-200"
                        >
                            <Sparkles size={18} />
                            Sign In
                        </button>
                    </form>
                )}
            </>
        )}
      </div>

      {!isLoading && (
        <div className="mt-8 text-center">
            {isRegistering ? (
                <button 
                  onClick={() => setIsRegistering(false)}
                  className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition"
                >
                  Return to Login
                </button>
            ) : (
                <button 
                  onClick={() => setIsRegistering(true)}
                  className="text-sm font-semibold text-orange-600 hover:text-orange-700 transition"
                >
                  + Create Company Admin
                </button>
            )}
        </div>
      )}
    </div>
  );
};

export default LoginView;
