import { useMemo, useRef, useState } from 'react';
import type { Book, Status } from '../types';
import { FilterIcon, LayoutIcon } from './Icons';

const STATUS_OPTIONS: { key: Status | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
  { key: 'want', label: 'Want to read' }
];

type Layout = 'list' | 'grid' | 'carousel' | 'shelf';

const LAYOUTS: { key: Layout; name: string; desc: string }[] = [
  { key: 'list', name: 'List', desc: 'Compact rows with all the details' },
  { key: 'grid', name: 'Grid', desc: 'Vertical cards, two across' },
  { key: 'carousel', name: 'Carousel', desc: 'Swipe through your books one big cover at a time' },
  { key: 'shelf', name: 'Shelf', desc: 'Covers standing on shelves, like the real thing' }
];

const LAYOUT_KEY = 'chapter1:layout';

function savedLayout(): Layout {
  const l = localStorage.getItem(LAYOUT_KEY);
  return LAYOUTS.some((x) => x.key === l) ? (l as Layout) : 'list';
}

export function Cover({ book, size = 'M' }: { book: Pick<Book, 'title' | 'cover_url'>; size?: 'S' | 'M' }) {
  if (book.cover_url) {
    return (
      <img className={`cover cover-${size}`} src={book.cover_url} alt="" loading="lazy" draggable={false} />
    );
  }
  return (
    <div className={`cover cover-${size} cover-placeholder`} aria-hidden>
      {book.title.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function Stars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return <span className="stars">{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>;
}

function statusLine(b: Book) {
  if (b.status === 'finished' && b.finished_at) return `Finished ${b.finished_at}`;
  if (b.status === 'reading') return 'Currently reading';
  if (b.status === 'want') return 'Want to read';
  return null;
}

function FilterSheet({
  status,
  genres,
  allGenres,
  onStatus,
  onGenres,
  onClose
}: {
  status: Status | 'all';
  genres: string[];
  allGenres: string[];
  onStatus: (s: Status | 'all') => void;
  onGenres: (g: string[]) => void;
  onClose: () => void;
}) {
  const toggleGenre = (g: string) =>
    onGenres(genres.includes(g) ? genres.filter((x) => x !== g) : [...genres, g]);

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-titlebar">
          <h2>Filters</h2>
          <button
            className="linkish"
            onClick={() => {
              onStatus('all');
              onGenres([]);
            }}
          >
            Clear all
          </button>
        </div>

        <h4 className="filter-label">Status</h4>
        <div className="chips">
          {STATUS_OPTIONS.map((f) => (
            <button
              key={f.key}
              className={`chip ${status === f.key ? 'chip-active' : ''}`}
              onClick={() => onStatus(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <h4 className="filter-label">Genre</h4>
        {allGenres.length === 0 ? (
          <p className="empty">No genres yet — set one on a book to filter by it.</p>
        ) : (
          <div className="chips">
            {allGenres.map((g) => (
              <button
                key={g}
                className={`chip ${genres.includes(g) ? 'chip-active' : ''}`}
                onClick={() => toggleGenre(g)}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        <div className="sheet-actions">
          <span />
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function LayoutSheet({
  layout,
  onPick,
  onClose
}: {
  layout: Layout;
  onPick: (l: Layout) => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-titlebar">
          <h2>Layout</h2>
        </div>
        <div className="layoutlist">
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              className={`layoutopt ${layout === l.key ? 'layoutopt-active' : ''}`}
              onClick={() => {
                onPick(l.key);
                onClose();
              }}
            >
              <span className="layoutopt-name">{l.name}</span>
              <span className="layoutopt-desc">{l.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ListLayout({ books, onOpen }: { books: Book[]; onOpen: (b: Book) => void }) {
  return (
    <ul className="booklist">
      {books.map((b) => (
        <li key={b.id}>
          <button className="bookrow" onClick={() => onOpen(b)}>
            <Cover book={b} />
            <span className="bookmeta">
              <span className="booktitle">{b.title}</span>
              <span className="bookauthor">{b.author}</span>
              <span className="bookextra">
                {statusLine(b)}
                {b.genre ? <span className="genretag">{b.genre}</span> : null}
                <Stars rating={b.rating} />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function GridLayout({ books, onOpen }: { books: Book[]; onOpen: (b: Book) => void }) {
  return (
    <ul className="bookgrid">
      {books.map((b) => (
        <li key={b.id}>
          <button className="gridcard" onClick={() => onOpen(b)}>
            <Cover book={b} />
            <span className="booktitle">{b.title}</span>
            <span className="bookauthor">{b.author}</span>
            <span className="bookextra">
              {b.genre ? <span className="genretag">{b.genre}</span> : null}
              <Stars rating={b.rating} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CarouselLayout({ books, onOpen }: { books: Book[]; onOpen: (b: Book) => void }) {
  // Touch swipes natively; mouse users get drag-to-scroll.
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, moved: false, startX: 0, startLeft: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    drag.current = { down: true, moved: false, startX: e.clientX, startLeft: ref.current.scrollLeft };
    ref.current.setPointerCapture(e.pointerId);
    ref.current.classList.add('carousel-dragging');
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.down || !ref.current) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 5) drag.current.moved = true;
    ref.current.scrollLeft = drag.current.startLeft - dx;
  };

  const endDrag = () => {
    drag.current.down = false;
    ref.current?.classList.remove('carousel-dragging');
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return (
    <div
      className="carousel"
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
    >
      {books.map((b) => (
        <button key={b.id} className="carouselcard" onClick={() => onOpen(b)}>
          <Cover book={b} />
          <span className="booktitle">{b.title}</span>
          <span className="bookauthor">{b.author}</span>
          <span className="bookextra">
            {statusLine(b)}
          </span>
          <span className="bookextra">
            {b.genre ? <span className="genretag">{b.genre}</span> : null}
            <Stars rating={b.rating} />
          </span>
        </button>
      ))}
    </div>
  );
}

function ShelfLayout({ books, onOpen }: { books: Book[]; onOpen: (b: Book) => void }) {
  const rows: Book[][] = [];
  for (let i = 0; i < books.length; i += 4) rows.push(books.slice(i, i + 4));
  return (
    <div className="shelf">
      {rows.map((row, i) => (
        <div className="shelfrow" key={row[0].id}>
          <div className="shelfbooks">
            {row.map((b) => (
              <button
                key={b.id}
                className="shelfbook"
                onClick={() => onOpen(b)}
                aria-label={b.title}
                title={b.title}
              >
                <Cover book={b} />
              </button>
            ))}
          </div>
          <div className="shelfboard" aria-hidden />
        </div>
      ))}
    </div>
  );
}

export function LibraryView({ books, onOpen }: { books: Book[]; onOpen: (b: Book) => void }) {
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [genres, setGenres] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [layout, setLayout] = useState<Layout>(savedLayout);

  const pickLayout = (l: Layout) => {
    setLayout(l);
    localStorage.setItem(LAYOUT_KEY, l);
  };

  const allGenres = useMemo(
    () => [...new Set(books.map((b) => b.genre).filter(Boolean))].sort(),
    [books]
  );

  const filterActive = status !== 'all' || genres.length > 0;

  const shown = books.filter((b) => {
    if (status !== 'all' && b.status !== status) return false;
    if (genres.length > 0 && !genres.includes(b.genre)) return false;
    const q = query.trim().toLowerCase();
    if (q && !b.title.toLowerCase().includes(q) && !b.author.toLowerCase().includes(q)) return false;
    return true;
  });

  const LayoutComponent = { list: ListLayout, grid: GridLayout, carousel: CarouselLayout, shelf: ShelfLayout }[layout];

  return (
    <div className="library">
      <div className="libhead">
        <input
          className="searchbox"
          placeholder="Search your library…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="iconbtn"
          onClick={() => setLayoutOpen(true)}
          aria-label="Layout"
        >
          <LayoutIcon />
        </button>
        <button
          className={`iconbtn ${filterActive ? 'iconbtn-active' : ''}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Filters"
        >
          <FilterIcon />
          {filterActive && <span className="filterdot" />}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="empty">
          {books.length === 0
            ? 'No books yet. Tap Add to log your first one.'
            : 'Nothing matches that filter.'}
        </p>
      ) : (
        <LayoutComponent books={shown} onOpen={onOpen} />
      )}

      {filterOpen && (
        <FilterSheet
          status={status}
          genres={genres}
          allGenres={allGenres}
          onStatus={setStatus}
          onGenres={setGenres}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {layoutOpen && (
        <LayoutSheet layout={layout} onPick={pickLayout} onClose={() => setLayoutOpen(false)} />
      )}
    </div>
  );
}
