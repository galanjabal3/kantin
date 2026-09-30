import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useAuthStore } from "../../store/authStore";
import { getSellerMenu, login, navigation } from "../api";

const MENU_URL = "http://localhost:8000/api/seller/menu";
const REFRESH_URL = "http://localhost:8000/api/auth/refresh";
const LOGIN_URL = "http://localhost:8000/api/auth/login";

/** JWT palsu: payload hanya butuh `exp` agar isTokenExpired bisa membacanya. */
function jwt(expSecondsFromNow: number) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      sub: "seller-1",
      user_type: "seller",
      exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
    }),
  );
  return `${header}.${payload}.signature`;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn();
let toLoginSpy: ReturnType<typeof vi.spyOn>;

function authHeaderOf(callIndex: number): string | undefined {
  const init = fetchMock.mock.calls[callIndex]?.[1] as
    | RequestInit
    | undefined;
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.Authorization;
}

function urlOf(callIndex: number): string {
  return String(fetchMock.mock.calls[callIndex]?.[0]);
}

function countRefreshCalls(): number {
  return fetchMock.mock.calls.filter(([url]) => String(url) === REFRESH_URL)
    .length;
}


describe("refresh token flow", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    toLoginSpy = vi.spyOn(navigation, "toLogin").mockImplementation(() => {});
    useAuthStore.setState({
      token: jwt(60 * 60),
      refreshToken: "refresh-1",
      userType: "seller",
      restaurantId: "resto-1",
      restaurantSlug: "warung-x",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    toLoginSpy.mockRestore();
    useAuthStore.getState().clearAuth();
  });

  it("(a) 401 → refresh sukses → retry memakai token baru", async () => {
    const token = jwt(60 * 60);
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(401, { detail: "Token kedaluwarsa" })),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            token_type: "bearer",
          }),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(200, [{ id: "menu-1" }])),
      );

    const data = await getSellerMenu(token);

    expect(data).toEqual([{ id: "menu-1" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 1) request awal memakai token lama
    expect(urlOf(0)).toBe(MENU_URL);
    expect(authHeaderOf(0)).toBe(`Bearer ${token}`);

    // 2) refresh token lama dikirim ke endpoint refresh
    expect(urlOf(1)).toBe(REFRESH_URL);
    const refreshInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(refreshInit.body))).toEqual({
      refresh_token: "refresh-1",
    });

    // 3) retry memakai token BARU + rotasi tersimpan di store
    expect(urlOf(2)).toBe(MENU_URL);
    expect(authHeaderOf(2)).toBe("Bearer access-2");
    expect(useAuthStore.getState().token).toBe("access-2");
    expect(useAuthStore.getState().refreshToken).toBe("refresh-2");
    expect(toLoginSpy).not.toHaveBeenCalled();
  });

  it("(b) refresh gagal (401) → logout + redirect /login, tanpa retry", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(401, { detail: "Token kedaluwarsa" })),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse(401, {
            detail: "Refresh token tidak valid atau kedaluwarsa",
          }),
        ),
      );

    await expect(getSellerMenu(jwt(60 * 60))).rejects.toThrow(
      "Session expired",
    );

    expect(countRefreshCalls()).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // request asli + refresh saja
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(useAuthStore.getState().userType).toBeNull();
    expect(toLoginSpy).toHaveBeenCalled();
  });

  it("(c) tidak ada loop: retry yang tetap 401 tidak memicu refresh lagi", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(401, { detail: "Token kedaluwarsa" })),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            token_type: "bearer",
          }),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(401, { detail: "Masih ditolak" })),
      );

    await expect(getSellerMenu(jwt(60 * 60))).rejects.toThrow(
      "Gagal memuat menu",
    );

    expect(fetchMock).toHaveBeenCalledTimes(3); // awal + refresh + retry
    expect(countRefreshCalls()).toBe(1);
    expect(toLoginSpy).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBe("access-2");
  });

  it("(c) refresh token tanpa sesi → langsung logout, tanpa panggilan refresh", async () => {
    useAuthStore.setState({ refreshToken: null });
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(401, { detail: "Token kedaluwarsa" })),
    );

    await expect(getSellerMenu(jwt(60 * 60))).rejects.toThrow(
      "Session expired",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(countRefreshCalls()).toBe(0);
    expect(toLoginSpy).toHaveBeenCalled();
  });

  it("(d) single-flight: 3 request paralel 401 → hanya 1 panggilan refresh", async () => {
    let menuCalls = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === REFRESH_URL) {
        return Promise.resolve(
          jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            token_type: "bearer",
          }),
        );
      }
      menuCalls += 1;
      // 3 request pertama (token lama) ditolak; retry setelah refresh diterima
      return Promise.resolve(
        menuCalls <= 3
          ? jsonResponse(401, { detail: "Token kedaluwarsa" })
          : jsonResponse(200, [{ id: "menu-1" }]),
      );
    });

    const token = jwt(60 * 60);
    const results = await Promise.all([
      getSellerMenu(token),
      getSellerMenu(token),
      getSellerMenu(token),
    ]);

    expect(results).toEqual([
      [{ id: "menu-1" }],
      [{ id: "menu-1" }],
      [{ id: "menu-1" }],
    ]);
    expect(countRefreshCalls()).toBe(1); // 1 refresh untuk 3 request
    expect(menuCalls).toBe(6); // 3 gagal + 3 retry
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(useAuthStore.getState().refreshToken).toBe("refresh-2");
  });

  it("(opsional) proaktif: access token kedaluwarsa → refresh sebelum request", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            token_type: "bearer",
          }),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(200, [{ id: "menu-1" }])),
      );

    const expired = jwt(-60);
    useAuthStore.setState({ token: expired }); // access token sudah kedaluwarsa
    await getSellerMenu(expired);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlOf(0)).toBe(REFRESH_URL); // refresh duluan
    expect(urlOf(1)).toBe(MENU_URL);
    expect(authHeaderOf(1)).toBe("Bearer access-2"); // langsung pakai token baru
    expect(useAuthStore.getState().token).toBe("access-2");
  });

  it("menyimpan refresh token di persist localStorage", () => {
    useAuthStore.getState().setAuth({
      accessToken: "access-x",
      refreshToken: "refresh-x",
      userType: "seller",
      restaurantId: "resto-1",
      restaurantSlug: "warung-x",
    });

    const raw = localStorage.getItem("kantin-auth");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).state).toMatchObject({
      token: "access-x",
      refreshToken: "refresh-x",
      userType: "seller",
    });

    useAuthStore.getState().clearAuth();
    expect(JSON.parse(localStorage.getItem("kantin-auth") as string).state)
      .toMatchObject({ token: null, refreshToken: null });
  });

  it("login() mengembalikan refresh_token untuk disimpan pemanggil", async () => {
    useAuthStore.getState().clearAuth();
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(200, {
          access_token: "access-1",
          refresh_token: "refresh-1",
          token_type: "bearer",
          user_type: "seller",
          restaurant_id: "resto-1",
          restaurant_slug: "warung-x",
        }),
      ),
    );

    const data = await login("seller@kantin.test", "rahasia");

    expect(urlOf(0)).toBe(LOGIN_URL);
    expect(data.refresh_token).toBe("refresh-1");
    expect(data.access_token).toBe("access-1");
    // login adalah endpoint public: tidak menyentuh sesi yang sedang berjalan
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("F1: logout di tengah refresh in-flight → hasil refresh dibuang, sesi tetap kosong", async () => {
    let releaseRefresh!: (value: Response) => void;
    const pendingRefresh = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });

    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(401, { detail: "Token kedaluwarsa" })),
      )
      .mockImplementationOnce(() => pendingRefresh)
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse(200, [{ id: "menu-1" }])),
      );

    const attempt = getSellerMenu(jwt(60 * 60));
    // Tunggu sampai refresh benar-benar in-flight
    await vi.waitFor(() => expect(countRefreshCalls()).toBe(1));

    // User klik logout SEBELUM respons refresh datang
    useAuthStore.getState().clearAuth();

    releaseRefresh(
      jsonResponse(200, {
        access_token: "access-2",
        refresh_token: "refresh-2",
        token_type: "bearer",
      }),
    );

    await expect(attempt).rejects.toThrow("Session expired");

    // Tidak ada retry memakai token hasil refresh yang sudah dibuang
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(toLoginSpy).toHaveBeenCalled();

    const persisted = localStorage.getItem("kantin-auth") as string;
    expect(persisted).not.toContain("access-2");
    expect(persisted).not.toContain("refresh-2");
    expect(JSON.parse(persisted).state).toMatchObject({
      token: null,
      refreshToken: null,
    });
  });

  it("F2 lock: re-check setelah lock → tab lain sudah rotasi, refresh tidak diulang", async () => {
    const nav = navigator as unknown as { locks?: unknown };
    const hadOwn = Object.prototype.hasOwnProperty.call(nav, "locks");
    const ownDescriptor = Object.getOwnPropertyDescriptor(nav, "locks");

    let releaseLock!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockRequest = vi.fn(
      (_name: string, callback: () => Promise<string>) => gate.then(() => callback()),
    );
    Object.defineProperty(nav, "locks", {
      value: { request: lockRequest },
      configurable: true,
      writable: true,
    });

    try {
      let menuCalls = 0;
      fetchMock.mockImplementation((input: RequestInfo | URL) => {
        if (String(input) === REFRESH_URL) {
          return Promise.resolve(
            jsonResponse(200, {
              access_token: "access-2",
              refresh_token: "refresh-2",
              token_type: "bearer",
            }),
          );
        }
        menuCalls += 1;
        return Promise.resolve(
          menuCalls === 1
            ? jsonResponse(401, { detail: "Token kedaluwarsa" })
            : jsonResponse(200, [{ id: "menu-1" }]),
        );
      });

      const attempt = getSellerMenu(jwt(60 * 60));
      await vi.waitFor(() => expect(lockRequest).toHaveBeenCalledTimes(1));
      expect(lockRequest).toHaveBeenCalledWith("kantin-refresh", expect.any(Function));

      // Sementara menunggu lock, tab lain sudah merotasi (sinkronisasi storage/broadcast)
      useAuthStore.setState({
        token: "access-from-other-tab",
        refreshToken: "refresh-2",
      });

      releaseLock();
      const data = await attempt;

      expect(data).toEqual([{ id: "menu-1" }]);
      // Re-check lolos → tidak ada panggilan refresh sama sekali
      expect(countRefreshCalls()).toBe(0);
      // Retry memakai hasil milik tab lain, bukan token basi milik tab ini
      expect(authHeaderOf(1)).toBe("Bearer access-from-other-tab");
      expect(menuCalls).toBe(2); // 401 pertama + retry
    } finally {
      if (hadOwn && ownDescriptor) Object.defineProperty(nav, "locks", ownDescriptor);
      else delete nav.locks;
    }
  });

  it("F2 lock: memori belum sinkron tapi localStorage sudah ditab lain → adopsi persist, tanpa refresh", async () => {
    const nav = navigator as unknown as { locks?: unknown };
    const hadOwn = Object.prototype.hasOwnProperty.call(nav, "locks");
    const ownDescriptor = Object.getOwnPropertyDescriptor(nav, "locks");
    const lockRequest = vi.fn(
      (_name: string, callback: () => Promise<string>) => callback(),
    );
    Object.defineProperty(nav, "locks", {
      value: { request: lockRequest },
      configurable: true,
      writable: true,
    });

    try {
      // Tab lain sudah merotasi & menulis localStorage, tetapi event storage
      // ke tab ini BELUM diproses → memori masih memegang refresh-1.
      localStorage.setItem(
        "kantin-auth",
        JSON.stringify({
          state: {
            token: "access-2",
            refreshToken: "refresh-2",
            userType: "seller",
            restaurantId: "resto-1",
            restaurantSlug: "warung-x",
          },
          version: 0,
        }),
      );

      let menuCalls = 0;
      fetchMock.mockImplementation((input: RequestInfo | URL) => {
        if (String(input) === REFRESH_URL) {
          return Promise.resolve(
            jsonResponse(200, {
              access_token: "should-not-be-used",
              refresh_token: "refresh-x",
              token_type: "bearer",
            }),
          );
        }
        menuCalls += 1;
        return Promise.resolve(
          menuCalls === 1
            ? jsonResponse(401, { detail: "Token kedaluwarsa" })
            : jsonResponse(200, [{ id: "menu-1" }]),
        );
      });

      const data = await getSellerMenu(jwt(60 * 60));

      expect(data).toEqual([{ id: "menu-1" }]);
      expect(lockRequest).toHaveBeenCalledWith("kantin-refresh", expect.any(Function));
      expect(countRefreshCalls()).toBe(0); // tidak ada refresh — tab lain sudah melakukannya
      expect(authHeaderOf(1)).toBe("Bearer access-2"); // hasil milik tab lain
      expect(useAuthStore.getState().refreshToken).toBe("refresh-2"); // diadopsi ke memori
    } finally {
      if (hadOwn && ownDescriptor) Object.defineProperty(nav, "locks", ownDescriptor);
      else delete nav.locks;
    }
  });
});
