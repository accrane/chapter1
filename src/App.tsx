import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Book, User } from './types';
import { AuthView } from './components/AuthView';
import { LibraryView } from './components/LibraryView';
import { AddView } from './components/AddView';
import { StatsView } from './components/StatsView';
import { BookSheet } from './components/BookSheet';
import { ResetView } from './components/ResetView';
import { SettingsSheet } from './components/SettingsSheet';
import { LibraryIcon, AddIcon, StatsIcon, GearIcon } from './components/Icons';

type Tab = 'library' | 'add' | 'stats';

function resetTokenFromUrl(): string | null {
  if (window.location.pathname !== '/reset') return null;
  return new URLSearchParams(window.location.search).get('token');
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<Tab>('library');
  const [books, setBooks] = useState<Book[]>([]);
  const [openBook, setOpenBook] = useState<Book | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(resetTokenFromUrl);

  useEffect(() => {
    api.me().then(({ user }) => {
      setUser(user);
      setChecked(true);
    });
  }, []);

  const [genreList, setGenreList] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      api.books().then(({ books }) => setBooks(books));
      api.genres().then(({ genres }) => setGenreList(genres));
    }
  }, [user]);

  const allGenres = useMemo(
    () =>
      [...new Set([...genreList, ...books.map((b) => b.genre).filter(Boolean)])].sort((a, b) =>
        a.localeCompare(b)
      ),
    [genreList, books]
  );

  const reloadBooksAndGenres = () =>
    Promise.all([
      api.books().then(({ books }) => setBooks(books)),
      api.genres().then(({ genres }) => setGenreList(genres))
    ]);

  if (resetToken) {
    return (
      <ResetView
        token={resetToken}
        onDone={() => {
          window.history.replaceState(null, '', '/');
          setResetToken(null);
        }}
      />
    );
  }
  if (!checked) return <div className="splash">Chapter1</div>;
  if (!user) return <AuthView onAuth={setUser} />;

  const billing = user.billing;
  const subscribe = () =>
    api
      .checkout()
      .then(({ url }) => {
        window.location.href = url;
      })
      .catch((err) => alert(err.message));

  const upsertBook = (book: Book) => {
    setBooks((prev) => {
      const i = prev.findIndex((b) => b.id === book.id);
      if (i === -1) return [book, ...prev];
      const next = [...prev];
      next[i] = book;
      return next;
    });
  };

  const removeBook = (id: number) => {
    setBooks((prev) => prev.filter((b) => b.id !== id));
    setOpenBook(null);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Chapter1</h1>
        <button className="iconbtn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <GearIcon />
        </button>
      </header>

      {billing.plan === 'trial' && billing.trial_days_left !== null && billing.trial_days_left <= 7 && (
        <div className="banner">
          {billing.trial_days_left} day{billing.trial_days_left === 1 ? '' : 's'} left in your free
          trial. <button className="linkish" onClick={subscribe}>Subscribe</button>
        </div>
      )}
      {billing.plan === 'expired' && (
        <div className="banner banner-warn">
          Your trial has ended — your books are safe and exportable, but adding more needs a
          subscription. <button className="linkish" onClick={subscribe}>Subscribe</button>
        </div>
      )}

      <main className="content">
        {tab === 'library' && <LibraryView books={books} onOpen={setOpenBook} />}
        {tab === 'add' && (
          <AddView
            genres={allGenres}
            onAdded={(book) => {
              upsertBook(book);
              setTab('library');
            }}
          />
        )}
        {tab === 'stats' && <StatsView books={books} user={user} onUser={setUser} />}
      </main>

      {settingsOpen && (
        <SettingsSheet
          user={user}
          genres={allGenres}
          onGenresChanged={reloadBooksAndGenres}
          onClose={() => setSettingsOpen(false)}
          onSignedOut={() => {
            setSettingsOpen(false);
            setUser(null);
            setBooks([]);
          }}
        />
      )}

      {openBook && (
        <BookSheet
          book={openBook}
          genres={allGenres}
          onClose={() => setOpenBook(null)}
          onSaved={(b) => {
            upsertBook(b);
            setOpenBook(null);
          }}
          onDeleted={removeBook}
        />
      )}

      <nav className="bottomnav">
        <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
          <span className="icon"><LibraryIcon /></span> Library
        </button>
        <button className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>
          <span className="icon"><AddIcon /></span> Add
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          <span className="icon"><StatsIcon /></span> Stats
        </button>
      </nav>
    </div>
  );
}
