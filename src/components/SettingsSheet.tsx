import { useState } from 'react';
import { api } from '../api';
import type { User } from '../types';

export function SettingsSheet({
  user,
  genres,
  onClose,
  onSignedOut,
  onGenresChanged
}: {
  user: User;
  genres: string[];
  onClose: () => void;
  onSignedOut: () => void;
  onGenresChanged: () => void;
}) {
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [newGenre, setNewGenre] = useState('');
  const billing = user.billing;

  const goTo = async (fn: () => Promise<{ url: string }>) => {
    setError('');
    try {
      const { url } = await fn();
      window.location.href = url;
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addGenre = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGenre.trim();
    if (!name) return;
    setError('');
    try {
      await api.addGenre(name);
      setNewGenre('');
      onGenresChanged();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const renameGenre = async (from: string) => {
    const to = prompt(`Rename "${from}" to:`, from)?.trim();
    if (!to || to === from) return;
    setError('');
    try {
      await api.renameGenre(from, to);
      onGenresChanged();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const removeGenre = async (genre: string) => {
    if (!confirm(`Remove "${genre}" from all books? The books stay — they just lose this genre.`)) return;
    setError('');
    try {
      await api.renameGenre(genre, '');
      onGenresChanged();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteAccount = async () => {
    setError('');
    try {
      await api.deleteAccount(deleteText.trim());
      onSignedOut();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="settings-title">Settings</h2>
        <p className="bookauthor">Signed in as {user.email}</p>

        {billing.enabled && (
          <div className="settings-group">
            {billing.plan === 'active' && (
              <button className="settings-item" onClick={() => goTo(api.billingPortal)}>
                Manage subscription
              </button>
            )}
            {(billing.plan === 'trial' || billing.plan === 'expired') && (
              <button className="settings-item" onClick={() => goTo(api.checkout)}>
                Subscribe
                {billing.plan === 'trial' && billing.trial_days_left !== null
                  ? ` (${billing.trial_days_left} trial day${billing.trial_days_left === 1 ? '' : 's'} left)`
                  : ''}
              </button>
            )}
          </div>
        )}

        <div className="settings-group">
          <a className="settings-item" href="/api/export" download>
            Export your books (CSV)
          </a>
          <a className="settings-item" href="/terms.html">
            Terms of service
          </a>
          <a className="settings-item" href="/privacy.html">
            Privacy policy
          </a>
        </div>

        <h4 className="filter-label">Genres</h4>
        <div className="settings-group">
          <form className="genre-add" onSubmit={addGenre}>
            <input
              placeholder="Add a genre…"
              value={newGenre}
              onChange={(e) => setNewGenre(e.target.value)}
            />
            <button className="primary" disabled={!newGenre.trim()}>
              Add
            </button>
          </form>
          {genres.length === 0 ? (
            <p className="settings-danger">No genres yet — add one above.</p>
          ) : (
            genres.map((g) => (
              <div className="settings-item genre-row" key={g}>
                <span className="genre-name">{g}</span>
                <span className="genre-actions">
                  <button className="linkish" onClick={() => renameGenre(g)}>
                    Rename
                  </button>
                  <button className="danger" onClick={() => removeGenre(g)}>
                    Remove
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        <div className="settings-group">
          <button
            className="settings-item"
            onClick={() => api.logout().then(onSignedOut)}
          >
            Sign out
          </button>
        </div>

        <div className="danger-sep" role="separator">Danger Zone</div>

        <div className="settings-group settings-group-danger">
          <button className="settings-item danger" onClick={() => setDeleteOpen(true)}>
            Delete account…
          </button>
        </div>

        {deleteOpen && (
          <div className="modal-overlay" onClick={() => setDeleteOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Delete account</h3>
              <p className="modal-text">
                This permanently deletes your account, your books, and cancels any subscription.
                There is no undo. Type <strong>DELETE</strong> to confirm.
              </p>
              <input
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
              <div className="sheet-actions">
                <button
                  className="linkish"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteText('');
                  }}
                >
                  Keep my account
                </button>
                <button
                  className="danger"
                  disabled={deleteText.trim() !== 'DELETE'}
                  onClick={deleteAccount}
                >
                  Delete forever
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
