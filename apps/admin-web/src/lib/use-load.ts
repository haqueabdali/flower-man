'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from './api';

export function useLoad<T>(path: string | null): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) return;
    let active = true;
    api<T>(path)
      .then((value) => active && (setData(value), setError(null)))
      .catch((caught: unknown) => active && setError((caught as Error).message));
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, error, reload };
}

/** Runs an admin action, reports errors with alert(), then reloads. */
export async function act(action: () => Promise<unknown>, reload: () => void): Promise<void> {
  try {
    await action();
    reload();
  } catch (error) {
    window.alert((error as Error).message);
  }
}
