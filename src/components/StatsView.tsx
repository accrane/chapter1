import { useState } from 'react';
import { api } from '../api';
import type { Book, User } from '../types';

export function StatsView({
  books,
  user,
  onUser
}: {
  books: Book[];
  user: User;
  onUser: (u: User) => void;
}) {
  const thisYear = new Date().getFullYear();
  const finished = books.filter((b) => b.status === 'finished');

  const byYear = new Map<number, Book[]>();
  for (const b of finished) {
    const year = b.finished_at ? Number(b.finished_at.slice(0, 4)) : null;
    if (!year) continue;
    byYear.set(year, [...(byYear.get(year) ?? []), b]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  const maxCount = Math.max(1, ...[...byYear.values()].map((v) => v.length));

  const finishedThisYear = byYear.get(thisYear)?.length ?? 0;
  const pagesThisYear = (byYear.get(thisYear) ?? []).reduce((sum, b) => sum + (b.pages ?? 0), 0);
  const goal = user.yearly_goal;

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(goal || ''));

  const saveGoal = async () => {
    const n = Math.max(0, Math.floor(Number(goalInput) || 0));
    const { user: updated } = await api.setGoal(n);
    onUser(updated);
    setEditingGoal(false);
  };

  return (
    <div className="stats">
      <div className="card stat-hero">
        <div className="stat-big">{finishedThisYear}</div>
        <div className="stat-label">
          book{finishedThisYear === 1 ? '' : 's'} finished in {thisYear}
          {pagesThisYear > 0 && <> · {pagesThisYear.toLocaleString()} pages</>}
        </div>
        {goal > 0 && (
          <>
            <div className="goalbar">
              <div
                className="goalbar-fill"
                style={{ width: `${Math.min(100, (finishedThisYear / goal) * 100)}%` }}
              />
            </div>
            <div className="stat-label">
              {finishedThisYear >= goal
                ? `Goal of ${goal} reached 🎉`
                : `${goal - finishedThisYear} to go on your goal of ${goal}`}
            </div>
          </>
        )}
        {editingGoal ? (
          <div className="goaledit">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
            />
            <button className="primary" onClick={saveGoal}>
              Save
            </button>
          </div>
        ) : (
          <button className="linkish" onClick={() => setEditingGoal(true)}>
            {goal > 0 ? 'Change yearly goal' : 'Set a yearly goal'}
          </button>
        )}
      </div>

      <div className="card">
        <h3>Books per year</h3>
        {years.length === 0 ? (
          <p className="empty">Finish a book (with a finished date) to see history here.</p>
        ) : (
          <ul className="yearbars">
            {years.map((y) => {
              const count = byYear.get(y)!.length;
              return (
                <li key={y}>
                  <span className="yearlabel">{y}</span>
                  <span className="yearbar">
                    <span className="yearbar-fill" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </span>
                  <span className="yearcount">{count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Library totals</h3>
        <p className="stat-label">
          {books.length} total · {finished.length} finished ·{' '}
          {books.filter((b) => b.status === 'reading').length} reading ·{' '}
          {books.filter((b) => b.status === 'want').length} want to read
        </p>
      </div>
    </div>
  );
}
