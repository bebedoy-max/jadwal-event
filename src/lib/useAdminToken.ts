import { useEffect, useState } from 'react';
import { adminRefresh } from './admin.functions';

const KEY = 'je_admin_token';
const SESSION_KEY = 'je_admin_session';

type Session = { token: string; refresh: string; exp: number };

function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  window.localStorage.setItem(KEY, s.token);
}

export function getToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(KEY) ?? '';
}

/** Token yang dijamin masih berlaku (diperpanjang otomatis bila perlu). */
export async function ensureToken(): Promise<string> {
  const s = readSession();
  if (!s) return getToken();
  if (Date.now() < s.exp - 60_000) return s.token;
  if (!s.refresh) return s.token;
  const res = await adminRefresh({ data: { refresh: s.refresh } });
  const next: Session = {
    token: res.token,
    refresh: res.refresh,
    exp: Date.now() + res.expiresIn * 1000,
  };
  writeSession(next);
  return next.token;
}

export function setToken(t: string, refresh = '', expiresIn = 3600) {
  writeSession({ token: t, refresh, exp: Date.now() + expiresIn * 1000 });
}

export function clearToken() {
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(SESSION_KEY);
}

/** Token admin dari browser (null selama SSR/hidrasi). */
export function useAdminToken() {
  const [token, setTok] = useState<string | null>(null);
  useEffect(() => setTok(getToken()), []);
  return [token, setTok] as const;
}
