export interface RoomStore {
  load(room: string): Uint8Array | null;
  save(room: string, snapshot: Uint8Array): void;
}

export interface AsyncRoomStore {
  load(room: string): Promise<Uint8Array | null>;
  save(room: string, snapshot: Uint8Array): Promise<void>;
}

const copy = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);

export const createMemoryRoomStore = (): RoomStore => {
  const snapshots = new Map<string, Uint8Array>();
  return {
    load: (room) => {
      const snapshot = snapshots.get(room);
      return snapshot === undefined ? null : copy(snapshot);
    },
    save: (room, snapshot) => {
      snapshots.set(room, copy(snapshot));
    },
  };
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (encoded: string): Uint8Array => {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const createWebStorageRoomStore = (
  storage: Storage,
  keyPrefix = "mermollusc-collab-room:",
): RoomStore => {
  const keyFor = (room: string): string => `${keyPrefix}${encodeURIComponent(room)}`;
  return {
    load: (room) => {
      const encoded = storage.getItem(keyFor(room));
      return encoded === null ? null : base64ToBytes(encoded);
    },
    save: (room, snapshot) => {
      storage.setItem(keyFor(room), bytesToBase64(snapshot));
    },
  };
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });

const openRoomDatabase = (
  factory: IDBFactory,
  databaseName: string,
  storeName: string,
): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error(`IndexedDB open blocked for ${databaseName}`));
  });

export const createIndexedDbRoomStore = async (
  factory: IDBFactory,
  databaseName = "mermollusc-collab",
  storeName = "rooms",
): Promise<AsyncRoomStore> => {
  const db = await openRoomDatabase(factory, databaseName, storeName);
  return {
    load: async (room) => {
      const transaction = db.transaction(storeName, "readonly");
      const done = transactionDone(transaction);
      const request: IDBRequest<unknown> = transaction.objectStore(storeName).get(room);
      const result = await requestResult(request);
      await done;
      if (result === undefined) return null;
      if (!(result instanceof Uint8Array)) {
        throw new Error(`IndexedDB room "${room}" contained a non-binary snapshot`);
      }
      return copy(result);
    },
    save: async (room, snapshot) => {
      const transaction = db.transaction(storeName, "readwrite");
      const done = transactionDone(transaction);
      const request = transaction.objectStore(storeName).put(copy(snapshot), room);
      await requestResult(request);
      await done;
    },
  };
};
