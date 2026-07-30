import { FormEvent, useState } from 'react';
import { api } from '../api';
import type { User } from '../types';

export function AuthView({ onAuth }: { onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await api.forgot(email);
        setNotice('If that email has an account, a reset link is on its way.');
      } else {
        const { user } =
          mode === 'login'
            ? await api.login(email, password)
            : await api.register(email, name, password);
        onAuth(user);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <img className="auth-logo-img" src="/logo.svg" alt="" />
      <h1 className="auth-logo">Chapter1</h1>
      <p className="auth-sub">Keep track of what you read.</p>
      <form onSubmit={submit} className="card auth-form">
        {mode === 'register' && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        {mode !== 'forgot' && (
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button className="primary" disabled={busy}>
          {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
        </button>
      </form>
      {mode === 'login' && (
        <button className="linkish" onClick={() => { setMode('forgot'); setError(''); }}>
          Forgot your password?
        </button>
      )}
      <button
        className="linkish"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError('');
          setNotice('');
        }}
      >
        {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
      <p className="legal-links">
        <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a>
      </p>
    </div>
  );
}
