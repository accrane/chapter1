export type Status = 'want' | 'reading' | 'finished';

export interface Entitlement {
  enabled: boolean;
  plan: 'free' | 'trial' | 'active' | 'expired';
  trial_days_left: number | null;
}

export interface User {
  id: number;
  email: string;
  name: string;
  yearly_goal: number;
  billing: Entitlement;
}

export interface Book {
  id: number;
  title: string;
  author: string;
  isbn: string | null;
  cover_url: string | null;
  pages: number | null;
  status: Status;
  genre: string;
  rating: number | null;
  notes: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface SearchResult {
  title: string;
  author: string;
  year: number | null;
  isbn: string | null;
  pages: number | null;
  cover_url: string | null;
}
