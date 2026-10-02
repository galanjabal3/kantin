import {
  adoptSession,
  getSessionEpoch,
  readPersistedSession,
  useAuthStore,
} from "../store/authStore";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const REFRESH_URL = `${BASE_URL}/api/auth/refresh`;
/** Nama lock lintas tab: hanya satu tab yang boleh memutar refresh token dalam satu waktu. */
const REFRESH_LOCK_NAME = "kantin-refresh";

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_type: "seller" | "admin";
  restaurant_id?: string | null;
  restaurant_slug?: string | null;
}

// Untuk endpoint PUBLIC — tidak handle 401
async function publicFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, options);
  return res;
}

/**
 * Error HTTP untuk endpoint customer — menyimpan status HTTP sebagai
 * properti `status` supaya pemanggil bisa membedakan 404 (resource hilang)
 * dari error jaringan/5xx. Pesan error tetap sama → backward compatible.
 */
function httpError(message: string, status: number): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/** Tempel/mengganti header Authorization, header lain (mis. Content-Type) tetap. */
function withBearer(options: RequestInit, token: string): RequestInit {
  const headers: Record<string, string> = {};
  const source = options.headers;
  if (source instanceof Headers) {
    source.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(source)) {
    for (const [key, value] of source) headers[key] = value;
  } else if (source) {
    Object.assign(headers, source);
  }
  headers.Authorization = `Bearer ${token}`;
  if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return { ...options, headers };
}

/**
 * Redirect paksa ke halaman login.
 * Berpindah lewat objek ini supaya unit test bisa mem-spies-nya — jsdom
 * (lingkungan vitest) tidak mengizinkan `window.location` dimock/diintercept.
 */
export const navigation = {
  toLogin(): void {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  },
};

function forceLogout() {
  // Urutan wajib: clearAuth (epoch++ → membatalkan refresh in-flight + siarkan
  // logout ke tab lain) SEBELUM redirect. `window.location` memang async, tapi
  // sesi sudah pasti mati pada saat clearAuth selesai dieksekusi.
  useAuthStore.getState().clearAuth();
  navigation.toLogin();
}

// ── Refresh token (rotasi) — single-flight + lock lintas tab ─────────────
// Satu promise dipakai bersama oleh semua request yang butuh refresh,
// supaya token lama tidak dipakai ulang (rotasi backend: pakai ulang → 401).
let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    // Token yang "direncanakan" dibaca sekarang; dicek ulang setelah lock
    // didapat — kalau tab lain sudah merotasi, jangan refresh lagi.
    const plannedRefreshToken = useAuthStore.getState().refreshToken;
    refreshInFlight = withCrossTabLock(plannedRefreshToken).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Serialisasi refresh antar tab memakai Web Locks. Browser tanpa
 * `navigator.locks` jalan tanpa lock — sinkronisasi storage/broadcast di
 * authStore tetap menutup risiko terbesar (memakai token basi).
 */
function withCrossTabLock(plannedRefreshToken: string | null): Promise<string> {
  const run = () => requestTokenPair(plannedRefreshToken);
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks && typeof locks.request === "function") {
    return locks.request(REFRESH_LOCK_NAME, run);
  }
  return run();
}

/**
 * Access token terbaru milik tab lain — dipakai bila ternyata sudah ada rotasi
 * yang lebih baru daripada `refreshTokenUsed`. Baca persist dulu karena tab
 * yang merotasi menulis localStorage secara sinkron SEBELUM lock dilepas
 * (deterministik), lalu adopsi ke store bila event storage masih antre.
 * Mengembalikan `null` bila tidak ada rotasi lain.
 */
function freshTokenFromOtherTab(refreshTokenUsed: string): string | null {
  const persisted = readPersistedSession();
  const state = useAuthStore.getState();
  if (persisted && persisted.refreshToken !== state.refreshToken) {
    adoptSession(persisted);
  }
  const latest = useAuthStore.getState();
  if (latest.refreshToken && latest.refreshToken !== refreshTokenUsed) {
    return latest.token;
  }
  return null;
}

async function requestTokenPair(plannedRefreshToken: string | null): Promise<string> {
  const epoch = getSessionEpoch();
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) throw new Error("Tidak ada refresh token");

  // Re-check SETELAH lock didapat: tab lain sudah merotasi → pakai hasilnya,
  // jangan refresh ulang (refresh ulang = pakai ulang token basi = family revoke).
  if (plannedRefreshToken) {
    const fresh = freshTokenFromOtherTab(plannedRefreshToken);
    if (fresh) return fresh;
  }

  const res = await fetch(REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error("Refresh token tidak valid atau kedaluwarsa");
  const data = await res.json();

  // Guard F1: logout terjadi di tengah await → hasil refresh DIBUANG.
  if (getSessionEpoch() !== epoch) {
    throw new Error("Sesi berakhir saat refresh berlangsung");
  }
  // Guard F2: rotasi tab lain terjadi selama await → hasil kami jangan ditimpa.
  const fresh = freshTokenFromOtherTab(refreshToken);
  if (fresh) return fresh;

  const state = useAuthStore.getState();
  state.setTokens(data.access_token, data.refresh_token, epoch);
  return data.access_token;
}

// Untuk endpoint PROTECTED — 401 → refresh sekali → retry sekali
// Anti-loop: maksimal 1 refresh + 1 retry per request (flag `alreadyRefreshed`).
async function authFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let init = options;
  let alreadyRefreshed = false;

  // Proaktif: access token sudah kedaluwarsa → refresh dulu sebelum request
  const { refreshToken, isTokenExpired } = useAuthStore.getState();
  if (refreshToken && isTokenExpired()) {
    try {
      init = withBearer(options, await refreshAccessToken());
      alreadyRefreshed = true;
    } catch {
      // Refresh proaktif gagal → lanjut dengan token lama; jalur 401 di bawah
      // yang akan menentukan (logout) supaya tidak dobel refresh.
    }
  }

  const res = await fetch(url, init);
  if (res.status !== 401) return res;

  if (alreadyRefreshed) {
    forceLogout();
    throw new Error("Session expired");
  }

  let freshToken: string;
  try {
    freshToken = await refreshAccessToken();
  } catch {
    forceLogout();
    throw new Error("Session expired");
  }

  // Retry TANPA refresh tambahan — kalau masih 401 biarkan diteruskan pemanggil
  return fetch(url, withBearer(init, freshToken));
}

// ── Auth ──────────────────────────────────────────────
export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await publicFetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Email atau password salah");
  const data: LoginResponse = await res.json();
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Respons login tidak valid");
  }
  return data;
}

// ── Customer (PUBLIC) ─────────────────────────────────
export async function getRestaurant(slug: string) {
  const res = await publicFetch(`${BASE_URL}/api/r/${slug}`);
  if (!res.ok) throw httpError("Restoran tidak ditemukan", res.status);
  return res.json();
}

export async function getMenu(slug: string, categoryId?: string) {
  const url = categoryId
    ? `${BASE_URL}/api/r/${slug}/menu?category_id=${categoryId}`
    : `${BASE_URL}/api/r/${slug}/menu`;
  const res = await publicFetch(url);
  if (!res.ok) throw httpError("Gagal memuat menu", res.status);
  return res.json();
}

export async function createOrder(slug: string, data: object) {
  const res = await publicFetch(`${BASE_URL}/api/r/${slug}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw httpError("Gagal membuat pesanan", res.status);
  return res.json();
}

export async function getOrderStatus(slug: string, orderId: string) {
  const res = await publicFetch(`${BASE_URL}/api/r/${slug}/orders/${orderId}`);
  if (!res.ok) throw httpError("Order tidak ditemukan", res.status);
  return res.json();
}

// ── Seller (PROTECTED) ────────────────────────────────
export async function getMyRestaurant(token: string) {
  const res = await authFetch(`${BASE_URL}/api/seller/me`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Gagal memuat data restoran");
  return res.json();
}

export async function getSellerMenu(token: string) {
  const res = await authFetch(`${BASE_URL}/api/seller/menu`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Gagal memuat menu");
  return res.json();
}

export async function createMenuItem(token: string, data: object) {
  const res = await authFetch(`${BASE_URL}/api/seller/menu`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gagal menambah menu");
  return res.json();
}

export async function updateMenuItem(token: string, id: string, data: object) {
  const res = await authFetch(`${BASE_URL}/api/seller/menu/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gagal mengupdate menu");
  return res.json();
}

export async function deleteMenuItem(token: string, id: string) {
  const res = await authFetch(`${BASE_URL}/api/seller/menu/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Gagal menghapus menu");
  return res.json();
}

export async function getSellerOrders(token: string) {
  const res = await authFetch(`${BASE_URL}/api/seller/orders`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Gagal memuat orders");
  return res.json();
}

export async function updateOrderStatus(
  token: string,
  orderId: string,
  status: string,
) {
  const res = await authFetch(
    `${BASE_URL}/api/seller/orders/${orderId}/status?new_status=${status}`,
    { method: "PUT", headers: authHeaders(token) },
  );
  if (!res.ok) throw new Error("Gagal mengupdate status");
  return res.json();
}

export async function createCashierOrder(token: string, data: object) {
  const res = await authFetch(`${BASE_URL}/api/seller/orders`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gagal membuat pesanan");
  return res.json();
}

export async function getCategories(token: string) {
  const res = await authFetch(`${BASE_URL}/api/seller/categories`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Gagal memuat kategori");
  return res.json();
}

export async function createCategory(token: string, name: string) {
  const res = await authFetch(`${BASE_URL}/api/seller/categories`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Gagal membuat kategori");
  return res.json();
}

export async function updateSellerSettings(token: string, data: object) {
  const res = await authFetch(`${BASE_URL}/api/seller/me`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gagal menyimpan pengaturan");
  return res.json();
}

// ── Admin (PROTECTED) ─────────────────────────────────
export async function getAllRestaurants(token: string) {
  const res = await authFetch(`${BASE_URL}/api/admin/restaurants`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Gagal memuat restoran");
  return res.json();
}

export async function createRestaurant(token: string, data: object) {
  const res = await authFetch(`${BASE_URL}/api/admin/restaurants`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gagal membuat restoran");
  return res.json();
}

// Update sebagian field restoran (backend memakai `exclude_none`,
// jadi payload parsial seperti { is_open: false } aman).
export async function updateRestaurant(
  token: string,
  id: string,
  data: object,
) {
  const res = await authFetch(`${BASE_URL}/api/admin/restaurants/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gagal mengupdate restoran");
  return res.json();
}
