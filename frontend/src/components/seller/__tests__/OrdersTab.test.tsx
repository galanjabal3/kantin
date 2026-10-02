import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import OrdersTab from "../OrdersTab";
import * as api from "../../../lib/api";

vi.mock("../../../lib/api", () => ({
  getSellerOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

const mockedApi = api as unknown as {
  getSellerOrders: ReturnType<typeof vi.fn>;
  updateOrderStatus: ReturnType<typeof vi.fn>;
};

const NOW = new Date().toISOString();

function order(over: Record<string, unknown>) {
  return {
    id: "o1",
    customer_name: "Budi",
    table_number: null,
    total_price: 30000,
    status: "pending",
    source: "customer",
    created_at: NOW,
    items: [{ id: "i1", quantity: 1, subtotal: 30000, menu_item_id: "m1" }],
    ...over,
  };
}

/** Nilai kartu statistik: label "Pending" juga muncul sebagai badge order,
 *  jadi dicari kartu induk yang memuat angka besar (`.text-2xl`). */
function statValue(label: string): string {
  for (const el of screen.getAllByText(label)) {
    const value = el.parentElement?.querySelector(".text-2xl");
    if (value) return value.textContent ?? "";
  }
  throw new Error(`kartu statistik "${label}" tidak ditemukan`);
}

beforeEach(() => {
  vi.clearAllMocks();
  // useOrderNotification memakai Web Notifications API — tidak ada di jsdom
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: vi.fn().mockResolvedValue("default"),
  });
  mockedApi.getSellerOrders.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrdersTab — status cancelled (Opsi A)", () => {
  it("label 'Dibatalkan' tampil & section batal TANPA tombol aksi", async () => {
    mockedApi.getSellerOrders.mockResolvedValue([
      order({}),
      order({
        id: "o2",
        customer_name: "Eka Batal",
        status: "cancelled",
      }),
    ]);

    render(<OrdersTab token="t" />);

    const section = (await screen.findByText("Dibatalkan (1)")).parentElement!;
    expect(section).toBeInTheDocument();
    // Badge status di section batal
    expect(within(section).getByText("Dibatalkan")).toBeInTheDocument();
    expect(within(section).getByText("Eka Batal")).toBeInTheDocument();
    // Status terminal: tidak ada STATUS_FLOW / tombol aksi sama sekali
    expect(within(section).queryByRole("button")).toBeNull();
    expect(mockedApi.updateOrderStatus).not.toHaveBeenCalled();
  });

  it("order cancelled keluar dari list aktif & dari statistik", async () => {
    mockedApi.getSellerOrders.mockResolvedValue([
      order({}),
      order({ id: "o2", customer_name: "Eka Batal", status: "cancelled" }),
    ]);

    render(<OrdersTab token="t" />);
    await screen.findByText("Dibatalkan (1)");

    // Nama order batal hanya ada SATU kali → tidak ikut di papan aktif
    expect(screen.getAllByText("Eka Batal")).toHaveLength(1);
    // Hanya order pending yang punya tombol aksi ("Proses")
    expect(screen.getAllByRole("button", { name: "Proses" })).toHaveLength(1);

    // Statistik hari ini: 2 order masuk, 1 batal → Total = 1 (bukan 2)
    expect(statValue("Total hari ini")).toBe("1");
    expect(statValue("Pending")).toBe("1");
    expect(statValue("Diproses")).toBe("0");
    expect(statValue("Siap")).toBe("0");
  });

  it("semua order cancelled → papan kerja kosong + statistik nol", async () => {
    mockedApi.getSellerOrders.mockResolvedValue([
      order({ id: "o3", customer_name: "Citra", status: "cancelled" }),
    ]);

    render(<OrdersTab token="t" />);

    expect(await screen.findByText("Tidak ada order aktif")).toBeInTheDocument();
    expect(screen.getByText("Dibatalkan (1)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Proses" })).not.toBeInTheDocument();
    expect(statValue("Total hari ini")).toBe("0");
    expect(statValue("Pending")).toBe("0");
  });
});
