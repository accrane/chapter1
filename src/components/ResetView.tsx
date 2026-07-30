import { FormEvent, useState } from 'react';
import { api } from '../api';

export function ResetView({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
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
      {done ? (
        <>
          <p className="notice">Password updated. Sign in with your new password.</p>
          <button className="primary" onClick={onDone}>
            Go to sign in
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="card auth-form">
          <label>
            New password
            <input
              type="password"
              required
              minLength={8}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>
            Set new password
          </button>
        </form>
      )}
    </div>
  );
}
