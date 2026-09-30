import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  userType: "seller" | "admin";
  restaurantId?: string | null;
  restaurantSlug?: string | null;
}

/** Potongan sesi yang disinkronkan antar tab (persist + broadcast). */
export interface SessionSnapshot {
  token: string | null;
  refreshToken: string | null;
  userType: "seller" | "admin" | null;
  restaurantId: string | null;
  restaurantSlug: string | null;
}

interface AuthState extends SessionSnapshot {
  setAuth: (payload: AuthPayload) => void;
  /**
   * Perbarui pasangan token saja (hasil rotasi refresh).
   * `expectedEpoch` adalah epoch yang dibaca pemanggil SEBELUM await network:
   * bila sesi sudah logout (epoch naik) saat respons datang, hasil refresh
   * dibuang dan action ini kembalikan `false` — logout tidak bisa dibatalkan.
   */
  setTokens: (
    accessToken: string,
    refreshToken: string,
    expectedEpoch?: number,
  ) => boolean;
  clearAuth: () => void;
  isTokenExpired: () => boolean;
}

const PERSIST_KEY = "kantin-auth";
const CHANNEL_NAME = "kantin-auth";

type SessionMessage = ({ kind: "tokens" } & SessionSnapshot) | { kind: "logout" };

/**
 * Epoch sesi (di luar state → tidak ikut persist).
 * Naik setiap logout (lokal maupun dari tab lain). Semua hasil refresh yang
 * dimulai pada epoch lama wajib dibuang — inilah guard anti "logout batal".
 */
let sessionEpoch = 0;
/** True saat sedang menerapkan perubahan dari tab lain → dilarang siarkan ulang (anti-loop). */
let applyingRemote = false;
let channel: BroadcastChannel | null = null;

/** Epoch sesi berjalan — dibaca pemanggil sebelum await dan dicek ulang sesudahnya. */
export function getSessionEpoch(): number {
  return sessionEpoch;
}

function getChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent) => {
      handleMessage(event.data);
    };
  } catch {
    channel = null;
  }
  return channel;
}

function broadcast(message: SessionMessage): void {
  if (applyingRemote) return; // perubahan dari tab lain tidak boleh dipantulkan balik
  getChannel()?.postMessage(message);
}

function snapshotOf(state: SessionSnapshot): SessionSnapshot {
  return {
    token: state.token,
    refreshToken: state.refreshToken,
    userType: state.userType,
    restaurantId: state.restaurantId,
    restaurantSlug: state.restaurantSlug,
  };
}

function normalizeSession(raw: unknown): SessionSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<SessionSnapshot>;
  // Tanpa pasangan token yang utuh → dianggap sesi sudah berakhir.
  if (typeof s.token !== "string" || !s.token) return null;
  if (typeof s.refreshToken !== "string" || !s.refreshToken) return null;
  return {
    token: s.token,
    refreshToken: s.refreshToken,
    userType: s.userType === "admin" ? "admin" : s.userType === "seller" ? "seller" : null,
    restaurantId: typeof s.restaurantId === "string" ? s.restaurantId : null,
    restaurantSlug: typeof s.restaurantSlug === "string" ? s.restaurantSlug : null,
  };
}

function sameSession(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return (
    a.token === b.token &&
    a.refreshToken === b.refreshToken &&
    a.userType === b.userType &&
    a.restaurantId === b.restaurantId &&
    a.restaurantSlug === b.restaurantSlug
  );
}

/**
 * Terima sesi dari tab lain (event `storage` / BroadcastChannel / hasil baca
 * persist). Tidak pernah menaikkan epoch kecuali logout — sesi dianggap
 * berkelanjutan, sehingga refresh in-flight di tab ini tidak ikut dibatalkan
 * oleh rotasi tab lain. Tidak pernah menyiarkan balik (anti-loop).
 */
export function adoptSession(next: SessionSnapshot | null): void {
  const store = useAuthStore;
  const current = snapshotOf(store.getState());

  if (next === null) {
    if (current.token === null && current.refreshToken === null) return; // idempoten
    sessionEpoch += 1; // refresh in-flight tab ini wajib dibuang
    applyingRemote = true;
    try {
      store.setState({
        token: null,
        refreshToken: null,
        userType: null,
        restaurantId: null,
        restaurantSlug: null,
      });
    } finally {
      applyingRemote = false;
    }
    return;
  }

  if (sameSession(current, next)) return; // nilai identik → tidak ada kerja, memutus loop storage
  applyingRemote = true;
  try {
    store.setState({ ...next });
  } finally {
    applyingRemote = false;
  }
}

/**
 * Baca sesi terbaru langsung dari localStorage.
 * `persist` menulis secara SINKRON saat tab lain merotasi, dan penulisan itu
 * selalu terjadi SEBELUM lock refresh dilepas — jadi hasilnya deterministik,
 * tidak bergantung pada event `storage` yang masih bisa antre.
 */
export function readPersistedSession(): SessionSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: unknown };
    return normalizeSession(parsed?.state);
  } catch {
    return null;
  }
}

function handleMessage(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const message = data as SessionMessage;
  if (message.kind === "logout") {
    adoptSession(null);
    return;
  }
  if (message.kind === "tokens") {
    adoptSession(normalizeSession(message));
  }
}

function handleStorageEvent(event: StorageEvent): void {
  // key null = localStorage.clear() dari tab lain
  if (event.key !== null && event.key !== PERSIST_KEY) return;
  if (event.newValue === null) {
    adoptSession(null);
    return;
  }
  let parsed: { state?: unknown } | null = null;
  try {
    parsed = JSON.parse(event.newValue) as { state?: unknown };
  } catch {
    return;
  }
  adoptSession(normalizeSession(parsed?.state));
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      userType: null,
      restaurantId: null,
      restaurantSlug: null,

      setAuth: ({ accessToken, refreshToken, userType, restaurantId, restaurantSlug }) => {
        set({
          token: accessToken,
          refreshToken,
          userType,
          restaurantId: restaurantId ?? null,
          restaurantSlug: restaurantSlug ?? null,
        });
        broadcast({ kind: "tokens", ...snapshotOf(get()) });
      },

      setTokens: (accessToken, refreshToken, expectedEpoch) => {
        if (!accessToken || !refreshToken) return false;
        if (expectedEpoch !== undefined && expectedEpoch !== sessionEpoch) {
          return false; // sesi sudah logout → hasil refresh dibuang
        }
        set({ token: accessToken, refreshToken });
        broadcast({ kind: "tokens", ...snapshotOf(get()) });
        return true;
      },

      clearAuth: () => {
        sessionEpoch += 1;
        set({
          token: null,
          refreshToken: null,
          userType: null,
          restaurantId: null,
          restaurantSlug: null,
        });
        broadcast({ kind: "logout" });
      },

      isTokenExpired: () => {
        const token = get().token;
        if (!token) return true;
        try {
          // Decode JWT payload tanpa library
          const payload = JSON.parse(atob(token.split(".")[1]));
          const exp = payload.exp * 1000; // convert ke milliseconds
          return Date.now() > exp;
        } catch {
          return true;
        }
      },
    }),
    {
      name: PERSIST_KEY,
      // Persist hanya data sesi — fungsi action tidak boleh ikut tersimpan.
      partialize: (state) => snapshotOf(state),
    },
  ),
);

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", handleStorageEvent);
}

// Channel dibuat SEJAK AWAL modul dimuat — bukan saat broadcast pertama.
// Tab yang belum pernah menyiarkan apa pun tetap harus bisa MENERIMA pesan
// dari tab lain (BroadcastChannel tidak mengantarkan ke konteks yang belum
// membuat channel-nya). Bila API-nya tidak ada, getChannel() mengembalikan
// null dan broadcast jadi no-op.
getChannel();
