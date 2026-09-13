import { useEffect, useState } from 'react';
import { userRefresh } from './user.functions';

const KEY = 'je_user_session';

export type UserSession = {
  token: string;
  refresh: string;
  exp: number;
  name: string;
  avatar: string | null;
};

function read(): UserSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch {
    return null;
  }
}

function write(s: UserSession) {
  window.localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event('je-user-session'));
}

export function getUserSession() {
  return read();
}

export function saveUserSession(
  s: { token: string; refresh: string; expiresIn: number },
  info: { name?: string; avatar?: string | null } = {},
) {
  write({
    token: s.token,
    refresh: s.refresh,
    exp: Date.now() + s.expiresIn * 1000,
    name: info.name ?? read()?.name ?? '',
    avatar: info.avatar ?? read()?.avatar ?? null,
  });
}

export function updateUserInfo(info: { name?: string; avatar?: string | null }) {
  const cur = read();
  if (!cur) return;
  write({ ...cur, ...info });
}

export function clearUserSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('je-user-session'));
}

/** Token pengguna yang dijamin masih berlaku. */
export async function ensureUserToken(): Promise<string> {
  const s = read();
  if (!s) return '';
  if (Date.now() < s.exp - 60_000) return s.token;
  if (!s.refresh) return s.token;
  try {
    const res = await userRefresh({ data: { refresh: s.refresh } });
    write({ ...s, token: res.token, refresh: res.refresh, exp: Date.now() + res.expiresIn * 1000 });
    return res.token;
  } catch {
    clearUserSession();
    return '';
  }
}

/** Sesi pengguna di browser: `undefined` selama hidrasi, `null` bila belum masuk. */
export function useUserSession() {
  const [session, setSession] = useState<UserSession | null | undefined>(undefined);
  useEffect(() => {
    const sync = () => setSession(read());
    sync();
    window.addEventListener('je-user-session', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('je-user-session', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return session;
}
