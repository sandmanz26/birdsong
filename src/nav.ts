import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type BirdTab = 'masteran' | 'check' | 'progress';
export type Route =
  | { name: 'birds' }
  | { name: 'birdForm'; id?: string }
  | { name: 'bird'; id: string; tab: BirdTab; checkId?: string }
  | { name: 'player'; birdId: string; mode: 'now' | 'standby'; minutes?: number }
  | { name: 'library' }
  | { name: 'track'; id: string }
  | { name: 'more' };

export const NavContext = createContext<(r: Route) => void>(() => undefined);
export const useNav = () => useContext(NavContext);

/** Load async data, with a reload function. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; reload: () => void; error: unknown } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [n, setN] = useState(0);
  const reload = useCallback(() => setN((x) => x + 1), []);
  useEffect(() => {
    let alive = true;
    fn().then(
      (v) => alive && setData(v),
      (e) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, reload, error };
}
