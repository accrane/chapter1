import { useState } from 'react';
import { api } from '../api';
import type { Book, Status } from '../types';
import { Cover } from './LibraryView';
import { GenrePicker } from './GenrePicker';

export function BookSheet({
  book,
  genres,
  onClose,
  onSaved,
  onDeleted
}: {
  book: Book;
  genres: string[];
  onClose: () => void;
  onSaved: (b: Book) => void;
  onDeleted: (id: number) => void;
}) {
  const [status, setStatus] = useState<Status>(book.status);
  const [genre, setGenre] = useState(book.genre);
  const [rating, setRating] = useState<number | null>(book.rating);
  const [notes, setNotes] = useState(book.notes);
  const [startedAt, setStartedAt] = useState(book.started_at ?? '');
  const [finishedAt, setFinishedAt] = useState(book.finished_at ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { book: saved } = await api.updateBook(book.id, {
        status,
        genre: genre.trim(),
        rating,
        notes,
        started_at: startedAt || null,
        finished_at: finishedAt || null
      });
      onSaved(saved);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const del = async () => {
    if (!confirm(`Delete "${book.title}" from your library?`)) return;
    setBusy(true);
    try {
      await api.deleteBook(book.id);
      onDeleted(book.id);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <Cover book={book} />
          <div>
            <h2>{book.title}</h2>
            <p className="bookauthor">{book.author}</p>
            {book.pages ? <p className="bookextra">{book.pages} pages</p> : null}
          </div>
        </div>

        <div className="chips">
          {(['want', 'reading', 'finished'] as Status[]).map((s) => (
            <button
              key={s}
              className={`chip ${status === s ? 'chip-active' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s === 'want' ? 'Want to read' : s === 'reading' ? 'Reading' : 'Finished'}
            </button>
          ))}
        </div>

        <div className="ratingpick" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className="starbtn"
              aria-label={`${n} stars`}
              onClick={() => setRating(rating === n ? null : n)}
            >
              {rating && rating >= n ? '★' : '☆'}
            </button>
          ))}
        </div>

        <div className="datefield">
          Genre
          <GenrePicker genres={genres} value={genre} onChange={setGenre} />
        </div>

        <label className="datefield">
          Started
          <input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
        </label>
        <label className="datefield">
          Finished
          <input type="date" value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} />
        </label>

        <label className="notesfield">
          Notes
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="sheet-actions">
          <button className="danger" onClick={del} disabled={busy}>
            Delete
          </button>
          <button className="linkish" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" onClick={save} disabled={busy}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
