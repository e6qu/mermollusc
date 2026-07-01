export interface RoomStore {
  load(room: string): Uint8Array | null;
  save(room: string, snapshot: Uint8Array): void;
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
