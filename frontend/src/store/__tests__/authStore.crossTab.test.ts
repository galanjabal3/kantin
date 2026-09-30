import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getSessionEpoch, useAuthStore } from "../authStore";

const PERSIST_KEY = "kantin-auth";

/**
 * BroadcastChannel fake dipasang oleh `src/test/setup.ts` (jalankan sebelum
 * modul store di-import) sehingga channel "eager" store juga memakainya.
 */
interface FakeChannel {
  readonly name: string;
  onmessage: ((event: { data: unknown }) => void) | null;
  readonly sent: unknown[];
}
type FakeChannelCtor = (new (name: string) => FakeChannel) & {
  instances: FakeChannel[];
};
const FakeBC = globalThis.BroadcastChannel as unknown as FakeChannelCtor;

function totalSent(): number {
  return FakeBC.instances.reduce((n, c) => n + c.sent.length, 0);
}

/** Channel milik store (satu-satunya yang punya handler onmessage). */
function storeChannel(): FakeChannel | undefined {
  return FakeBC.instances.find((c) => c.onmessage !== null);
}

function session(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    token: "access-1",
    refreshToken: "refresh-1",
    userType: "seller" as const,
    restaurantId: "resto-1",
    restaurantSlug: "warung-x",
    ...overrides,
  };
}

function persistPayload(state: object): string {
  return JSON.stringify({ state, version: 0 });
}

/** Simulasikan event `storage` yang dikirim browser dari tab lain. */
function dispatchStorage(newValue: string | null) {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: PERSIST_KEY,
      newValue,
      oldValue: newValue === null ? "before" : null,
      storageArea: localStorage,
    }),
  );
}

describe("F2 — sinkronisasi sesi lintas tab", () => {
  beforeEach(() => {
    useAuthStore.setState({ ...session() });
    storeChannel()?.sent.splice(0);
  });

  afterEach(() => {
    useAuthStore.getState().clearAuth();
    storeChannel()?.sent.splice(0);
  });

  describe("event storage", () => {
    it("mengadopsi token baru dari tab lain", () => {
      const epochBefore = getSessionEpoch();

      dispatchStorage(
        persistPayload(session({ token: "access-2", refreshToken: "refresh-2" })),
      );

      expect(useAuthStore.getState().token).toBe("access-2");
      expect(useAuthStore.getState().refreshToken).toBe("refresh-2");
      expect(useAuthStore.getState().userType).toBe("seller");
      // Rotasi tab lain TIDAK mematikan sesi lokal (refresh in-flight tetap sah)
      expect(getSessionEpoch()).toBe(epochBefore);
      // persist ikut tertulis agar tab lain membaca nilai yang sama
      expect(JSON.parse(localStorage.getItem(PERSIST_KEY) as string).state).toMatchObject({
        token: "access-2",
        refreshToken: "refresh-2",
      });
    });

    it("newValue null → sesi lokal logout, epoch naik (refresh in-flight dibatalkan)", () => {
      const epochBefore = getSessionEpoch();

      dispatchStorage(null);

      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().refreshToken).toBeNull();
      expect(useAuthStore.getState().userType).toBeNull();
      expect(getSessionEpoch()).toBeGreaterThan(epochBefore);

      // Idempoten: event null berulang tidak menaikkan epoch lagi
      const epochAfter = getSessionEpoch();
      dispatchStorage(null);
      expect(getSessionEpoch()).toBe(epochAfter);
    });

    it("payload identik tidak diproses ulang (memutus loop storage↔persist)", () => {
      const payload = persistPayload(session());
      dispatchStorage(payload);
      const epochAfter = getSessionEpoch();

      dispatchStorage(payload);
      dispatchStorage(payload);

      expect(getSessionEpoch()).toBe(epochAfter);
      expect(useAuthStore.getState().token).toBe("access-1");
    });

    it("payload rusak diabaikan; payload tanpa token → logout (null dari tab lain)", () => {
      dispatchStorage("bukan-json");
      expect(useAuthStore.getState().token).toBe("access-1");

      // Persist milik tab lain yang sudah dikosongkan = tab itu logout
      const epochBefore = getSessionEpoch();
      dispatchStorage(persistPayload({ token: null, refreshToken: null }));
      expect(useAuthStore.getState().token).toBeNull();
      expect(getSessionEpoch()).toBeGreaterThan(epochBefore);
    });
  });

  describe("BroadcastChannel", () => {
    it("setTokens & clearAuth menyiarkan pesan ke tab lain", () => {
      useAuthStore.getState().setTokens("access-9", "refresh-9");
      expect(totalSent()).toBe(1);
      expect(storeChannel()?.sent[0]).toMatchObject({
        kind: "tokens",
        token: "access-9",
        refreshToken: "refresh-9",
      });

      useAuthStore.getState().clearAuth();
      expect(totalSent()).toBe(2);
      expect(storeChannel()?.sent[1]).toMatchObject({ kind: "logout" });
    });

    it("menerima pesan tokens dari tab lain → state update TANPA siaran balik", () => {
      useAuthStore.getState().clearAuth(); // memastikan channel store sudah dibuat
      const channel = storeChannel() as FakeChannel;
      channel.sent.splice(0);
      const before = totalSent();

      channel.onmessage?.({
        data: {
          kind: "tokens",
          token: "access-9",
          refreshToken: "refresh-9",
          userType: "seller",
          restaurantId: "resto-1",
          restaurantSlug: "warung-x",
        },
      });

      expect(useAuthStore.getState().token).toBe("access-9");
      expect(useAuthStore.getState().refreshToken).toBe("refresh-9");
      // Tidak dipantulkan balik → tidak ada loop siar-terima-siar
      expect(totalSent()).toBe(before);
    });

    it("menerima logout dari tab lain → logout lokal + epoch naik, tanpa siaran balik", () => {
      // Buat channel sambil sesi MASIH hidup (agar epoch bisa dibandingkan)
      useAuthStore.getState().setTokens("access-1", "refresh-1");
      const channel = storeChannel() as FakeChannel;
      channel.sent.splice(0);
      const before = totalSent();
      const epochBefore = getSessionEpoch();

      channel.onmessage?.({ data: { kind: "logout" } });

      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().refreshToken).toBeNull();
      expect(getSessionEpoch()).toBeGreaterThan(epochBefore);
      expect(totalSent()).toBe(before);
    });
  });
});
