import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { Button, Field, Notice, inputClass } from './ui';

export const LoginView: React.FC = () => {
  const { login, switchUser, demoUsers, demoMode } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const attempt = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError('That email and password do not match an account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl content-center gap-16 px-6 py-16 md:grid-cols-[1.1fr_1fr]">
      <div className="self-center">
        <p className="font-display text-[clamp(40px,7vw,76px)] leading-[0.95] text-slate-50">SprintVault</p>
        <p className="mt-6 max-w-sm text-base text-slate-400">
          Scrum tasks that lock the code they touch. Start a task and its files are yours until you commit.
        </p>
      </div>

      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-slate-50">Sign in</h1>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            attempt(() => login(email, password));
          }}
        >
          {error && <Notice>{error}</Notice>}
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputClass} h-10`}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} h-10`}
            />
          </Field>
          <Button type="submit" variant="primary" block disabled={loading} className="h-10">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {demoMode && (
          <div className="mt-10">
            <h2 className="text-sm text-slate-400">Demo accounts</h2>
            <ul className="mt-2 divide-y divide-slate-800 border-y border-slate-800">
              {demoUsers.map((u) => (
                <li key={u.user_id}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setEmail(u.email);
                      attempt(() => switchUser(u.email));
                    }}
                    className="flex w-full items-baseline justify-between py-2 text-left text-sm text-slate-200 hover:text-blue-300"
                  >
                    {u.name.replace(/\s*\(Team Lead\)$/, '')}
                    <span className="text-xs text-slate-500">{u.role === UserRole.MANAGER ? 'Team lead' : 'Developer'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
};
