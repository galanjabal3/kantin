import { useAuthStore } from "../store/authStore";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Untuk endpoint PUBLIC — tidak handle 401
async function publicFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, options);
  return res;
}

// Untuk endpoint PROTECTED — handle 401 → auto logout
async function authFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401) {
    useAuthStore.getState().clearAuth();
    window.location.href = "/login";
    throw new Error("Session expired");
  }
  return res;
}

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ── Auth ──────────────────────────────────────────────
export async function login(email: string, password: string) {
  const res = await publicFetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Email atau password salah");
  return res.json();
}

// ── Customer (PUBLIC) ─────────────────────────────────
export async function getRestaurant(slug: string) {
  const res = await publicFetch(`${BASE_URL}/api/r/${slug}`);
  if (!res.ok) throw new Error("Restoran tidak ditemukan");
  return res.json();
}

export async function getMenu(slug: string, categoryId?: string) {
  const url = categoryId
    ? `${BASE_URL}/api/r/${slug}/menu?category_id=${categoryId}`
    : `${BASE_URL}/api/r/${slug}/menu`;
  const res = await publicFetch(url);
  if (!res.ok) throw new Error("Gagal memuat menu");
  return res.json();
}

export async function createOrder(slug: string, data: object) {
  const res = await publicFetch(`${BASE_URL}/api/r/${slug}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gagal membuat pesanan");
  return res.json();
}

export async function getOrderStatus(slug: string, orderId: string) {
  const res = await publicFetch(`${BASE_URL}/api/r/${slug}/orders/${orderId}`);
  if (!res.ok) throw new Error("Order tidak ditemukan");
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
