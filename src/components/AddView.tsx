import { FormEvent, lazy, Suspense, useState } from 'react';
import { api } from '../api';
import type { Book, SearchResult, Status } from '../types';
import { Cover } from './LibraryView';
import { GenrePicker } from './GenrePicker';

// ZXing is ~400 kB; only load it when the user opens the scanner.
const Scanner = lazy(() => import('./Scanner').then((m) => ({ default: m.Scanner })));

const today = () => new Date().toISOString().slice(0, 10);

export function AddView({ genres, onAdded }: { genres: string[]; onAdded: (b: Book) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState(false);
  const [status, setStatus] = useState<Status>('finished');

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { results } = await api.search(query);
      setResults(results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const add = async (r: SearchResult) => {
    setBusy(true);
    setError('');
    try {
      const { book } = await api.addBook({
        title: r.title,
        author: r.author,
        isbn: r.isbn,
        cover_url: r.cover_url,
        pages: r.pages,
        status,
        finished_at: status === 'finished' ? today() : null,
        started_at: status === 'reading' ? today() : null
      });
      onAdded(book);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const onScanned = async (isbn: string) => {
    setScanning(false);
    setBusy(true);
    setError('');
    try {
      const { result } = await api.isbn(isbn);
      await add(result);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="addview">
      <div className="statuspick">
        <span>Add as:</span>
        {(['finished', 'reading', 'want'] as Status[]).map((s) => (
          <button
            key={s}
            className={`chip ${status === s ? 'chip-active' : ''}`}
            onClick={() => setStatus(s)}
          >
            {s === 'want' ? 'Want to read' : s === 'reading' ? 'Reading' : 'Finished'}
          </button>
        ))}
      </div>

      <button className="primary scanbtn" onClick={() => setScanning(true)}>
        📷 Scan book barcode
      </button>

      <form onSubmit={search} className="searchrow">
        <input
          className="searchbox"
          placeholder="Search by title or author…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" disabled={busy}>
          Search
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {busy && <p className="empty">Working…</p>}

      {results && !busy && (
        <ul className="booklist">
          {results.length === 0 && <p className="empty">No matches found.</p>}
          {results.map((r, i) => (
            <li key={i}>
              <div className="bookrow">
                <Cover book={{ title: r.title, cover_url: r.cover_url }} />
                <span className="bookmeta">
                  <span className="booktitle">{r.title}</span>
                  <span className="bookauthor">
                    {r.author}
                    {r.year ? ` · ${r.year}` : ''}
                  </span>
                </span>
                <button className="chip chip-active" onClick={() => add(r)}>
                  Add
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button className="linkish" onClick={() => setManual(!manual)}>
        {manual ? 'Hide manual entry' : 'Or enter a book manually'}
      </button>
      {manual && <ManualForm status={status} genres={genres} onAdded={onAdded} />}

      {scanning && (
        <Suspense fallback={<div className="scanner-overlay"><p className="scanner-hint">Starting camera…</p></div>}>
          <Scanner onResult={onScanned} onClose={() => setScanning(false)} />
        </Suspense>
      )}
    </div>
  );
}

function ManualForm({
  status,
  genres,
  onAdded
}: {
  status: Status;
  genres: string[];
  onAdded: (b: Book) => void;
}) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [genre, setGenre] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { book } = await api.addBook({
        title,
        author,
        genre: genre.trim(),
        status,
        finished_at: status === 'finished' ? today() : null,
        started_at: status === 'reading' ? today() : null
      });
      onAdded(book);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={submit} className="card auth-form">
      <label>
        Title
        <input required value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Author
        <input value={author} onChange={(e) => setAuthor(e.target.value)} />
      </label>
      <div className="datefield">
        Genre
        <GenrePicker genres={genres} value={genre} onChange={setGenre} />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="primary">Add book</button>
    </form>
  );
}
