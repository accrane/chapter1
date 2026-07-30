import { useState } from 'react';
import { api } from '../api';
import { PencilIcon } from './Icons';

export function GenrePicker({
  genres,
  value,
  onChange
}: {
  genres: string[];
  value: string;
  onChange: (genre: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newGenre, setNewGenre] = useState('');

  // Keep an unsaved custom genre visible in the dropdown.
  const options = value && !genres.includes(value) ? [...genres, value].sort() : genres;

  const addNew = () => {
    const name = newGenre.trim();
    if (!name) return;
    onChange(name);
    // Persist to the user's genre list right away; harmless if it fails —
    // saving the book registers the genre too.
    api.addGenre(name).catch(() => {});
    setNewGenre('');
    setOpen(false);
  };

  return (
    <>
      <div className="genrepill-row">
        <span className={`genrepill ${value ? '' : 'genrepill-empty'}`}>{value || 'No genre'}</span>
        <button
          type="button"
          className="iconbtn iconbtn-sm"
          onClick={() => setOpen(true)}
          aria-label="Edit genre"
        >
          <PencilIcon size={15} />
        </button>
      </div>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Genre</h3>

            <select value={value} onChange={(e) => onChange(e.target.value)}>
              <option value="">No genre</option>
              {options.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <form
              className="genre-add-inline"
              onSubmit={(e) => {
                e.preventDefault();
                addNew();
              }}
            >
              <input
                placeholder="Add a new genre…"
                value={newGenre}
                onChange={(e) => setNewGenre(e.target.value)}
              />
              <button className="primary" disabled={!newGenre.trim()}>
                Add
              </button>
            </form>

            <div className="sheet-actions">
              <span />
              <button type="button" className="primary" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
