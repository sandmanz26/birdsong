/**
 * Local-first storage (IndexedDB). No backend: all audio and data stay on the device (PRD: privacy).
 */
import type { AppEvent, Bird, Check, Isian, Program, SessionLog, Track } from './types';

const DB_NAME = 'kicau-coach';
const DB_VERSION = 1;

type StoreMap = {
  birds: Bird;
  tracks: Track;
  isian: Isian;
  programs: Program;
  sessions: SessionLog;
  checks: Check;
  events: AppEvent;
  blobs: { id: string; blob: Blob };
};
export type StoreName = keyof StoreMap;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('birds', { keyPath: 'id' });
      db.createObjectStore('tracks', { keyPath: 'id' });
      db.createObjectStore('isian', { keyPath: 'id' });
      db.createObjectStore('programs', { keyPath: 'birdId' });
      db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('birdId', 'birdId');
      db.createObjectStore('checks', { keyPath: 'id' }).createIndex('birdId', 'birdId');
      db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
      db.createObjectStore('blobs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store<K extends StoreName>(name: K, mode: IDBTransactionMode = 'readonly') {
  return (await open()).transaction(name, mode).objectStore(name);
}

export const db = {
  async all<K extends StoreName>(name: K): Promise<StoreMap[K][]> {
    return wrap((await store(name)).getAll()) as Promise<StoreMap[K][]>;
  },
  async get<K extends StoreName>(name: K, key: string): Promise<StoreMap[K] | undefined> {
    return wrap((await store(name)).get(key)) as Promise<StoreMap[K] | undefined>;
  },
  async byBird<K extends 'sessions' | 'checks'>(name: K, birdId: string): Promise<StoreMap[K][]> {
    return wrap((await store(name)).index('birdId').getAll(birdId)) as Promise<StoreMap[K][]>;
  },
  async put<K extends StoreName>(name: K, value: StoreMap[K]): Promise<void> {
    await wrap((await store(name, 'readwrite')).put(value));
  },
  async delete(name: StoreName, key: string): Promise<void> {
    await wrap((await store(name, 'readwrite')).delete(key));
  },
  async putBlob(id: string, blob: Blob) {
    await db.put('blobs', { id, blob });
  },
  async getBlob(id: string): Promise<Blob | undefined> {
    return (await db.get('blobs', id))?.blob;
  },
  async clearAll() {
    const d = await open();
    const names = Array.from(d.objectStoreNames);
    const tx = d.transaction(names, 'readwrite');
    names.forEach((n) => tx.objectStore(n).clear());
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
};

/** Local analytics for the user test; exported with "Ekspor data uji". Never sent anywhere. */
export function logEvent(name: string, props?: Record<string, unknown>) {
  db.put('events', { t: Date.now(), name, props }).catch(() => undefined);
}

/** Ask the browser not to evict our data under storage pressure. */
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => undefined);
}
