import type { Book, SearchResult, User } from './types';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),
  register: (email: string, name: string, password: string) =>
    request<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, name, password }) }),
  login: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  setGoal: (yearly_goal: number) =>
    request<{ user: User }>('/api/me', { method: 'PUT', body: JSON.stringify({ yearly_goal }) }),
  forgot: (email: string) =>
    request<{ ok: true }>('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>('/api/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  deleteAccount: (confirm: string) =>
    request<{ ok: true }>('/api/me', { method: 'DELETE', body: JSON.stringify({ confirm }) }),
  checkout: () => request<{ url: string }>('/api/billing/checkout', { method: 'POST' }),
  billingPortal: () => request<{ url: string }>('/api/billing/portal', { method: 'POST' }),

  books: () => request<{ books: Book[] }>('/api/books'),
  addBook: (book: Partial<Book>) =>
    request<{ book: Book }>('/api/books', { method: 'POST', body: JSON.stringify(book) }),
  updateBook: (id: number, book: Partial<Book>) =>
    request<{ book: Book }>(`/api/books/${id}`, { method: 'PUT', body: JSON.stringify(book) }),
  deleteBook: (id: number) => request<{ ok: true }>(`/api/books/${id}`, { method: 'DELETE' }),
  genres: () => request<{ genres: string[] }>('/api/genres'),
  addGenre: (name: string) =>
    request<{ ok: true }>('/api/genres', { method: 'POST', body: JSON.stringify({ name }) }),
  renameGenre: (from: string, to: string) =>
    request<{ changed: number }>('/api/genres/rename', { method: 'POST', body: JSON.stringify({ from, to }) }),

  search: (q: string) => request<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  isbn: (isbn: string) => request<{ result: SearchResult }>(`/api/isbn/${encodeURIComponent(isbn)}`)
};
