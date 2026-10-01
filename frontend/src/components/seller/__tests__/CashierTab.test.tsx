import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import CashierTab from "../CashierTab";
import * as api from "../../../lib/api";

vi.mock("../../../lib/api", () => ({
  getSellerMenu: vi.fn(),
  getCategories: vi.fn(),
  createCashierOrder: vi.fn(),
}));

const mockedApi = api as unknown as {
  getSellerMenu: ReturnType<typeof vi.fn>;
  getCategories: ReturnType<typeof vi.fn>;
  createCashierOrder: ReturnType<typeof vi.fn>;
};

const MENU = [
  {
    id: "m1",
    name: "Nasi Gudeg Komplit",
    price: 22000,
    image_url: "",
    is_available: true,
    category_id: "c1",
  },
  {
    id: "m2",
    name: "Nasi Rawon Daging",
    price: 25000,
    image_url: "",
    is_available: true,
    category_id: "c1",
  },
  {
    id: "m3",
    name: "Es Teh Manis",
    price: 5000,
    image_url: "",
    is_available: true,
    category_id: "c2",
  },
];

const CREATED_AT = "2026-01-05T08:30:00Z";

function receipt() {
  const el = document.getElementById("receipt-print-area");
  if (!el) throw new Error("area struk tidak dirender");
  return el;
}

function receiptLines() {
  return Array.from(receipt().querySelectorAll("[data-receipt-item]"));
}

async function addItem(name: string) {
  const btn = await screen.findByRole("button", {
    name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  });
  btn.click();
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  window.print = vi.fn();
  mockedApi.getSellerMenu.mockResolvedValue(MENU);
  mockedApi.getCategories.mockResolvedValue([
    { id: "c1", name: "Nasi" },
    { id: "c2", name: "Minuman" },
  ]);
});

describe("S1 — struk memuat SEMUA item order", () => {
  it("3 item di order → 3 baris item di struk (bukan cuma 1)", async () => {
    // Respons server meng-echo items persis seperti backend (OrderResponse)
    mockedApi.createCashierOrder.mockResolvedValue({
      id: "ORD-9",
      status: "pending",
      total_price: 52000,
      created_at: CREATED_AT,
      items: [
        {
          id: "oi1",
          menu_item_id: "m1",
          quantity: 1,
          subtotal: 22000,
          menu_item_name: "Nasi Gudeg Komplit",
          unit_price: 22000,
        },
        {
          id: "oi2",
          menu_item_id: "m2",
          quantity: 1,
          subtotal: 25000,
          menu_item_name: "Nasi Rawon Daging",
          unit_price: 25000,
        },
        {
          id: "oi3",
          menu_item_id: "m3",
          quantity: 1,
          subtotal: 5000,
          menu_item_name: "Es Teh Manis",
          unit_price: 5000,
        },
      ],
    });

    render(<CashierTab token="t" restaurantName="Warung Bu Siti" />);
    await addItem("Nasi Gudeg Komplit");
    await addItem("Nasi Rawon Daging");
    await addItem("Es Teh Manis");
    (await screen.findByPlaceholderText("Nama customer")).focus();
    screen
      .getByRole("button", { name: "Buat pesanan + cetak struk" })
      .click();

    await screen.findByText("Print ulang struk");

    const lines = receiptLines();
    expect(lines).toHaveLength(3);
    const struk = within(receipt());
    expect(struk.getByText("Nasi Gudeg Komplit")).toBeInTheDocument();
    expect(struk.getByText("Nasi Rawon Daging")).toBeInTheDocument();
    expect(struk.getByText("Es Teh Manis")).toBeInTheDocument();
    // Total tetap dari server dan konsisten dengan jumlah baris
    expect(struk.getByText("Rp 52.000")).toBeInTheDocument();
  });

  it("respons server TANPA items tetap menampilkan semua baris cart", async () => {
    mockedApi.createCashierOrder.mockResolvedValue({
      id: "ORD-10",
      status: "pending",
      total_price: 27000,
      created_at: CREATED_AT,
    });

    render(<CashierTab token="t" restaurantName="Warung Bu Siti" />);
    await addItem("Nasi Gudeg Komplit");
    await addItem("Es Teh Manis");
    screen
      .getByRole("button", { name: "Buat pesanan + cetak struk" })
      .click();
    await screen.findByText("Print ulang struk");

    const lines = receiptLines();
    expect(lines).toHaveLength(2);
    expect(within(receipt()).getByText("Nasi Gudeg Komplit")).toBeInTheDocument();
    expect(within(receipt()).getByText("Es Teh Manis")).toBeInTheDocument();
  });
});

describe("S2 — baris item selalu satu sumber kebenaran dengan TOTAL", () => {
  it("baris item memakai snapshot harga dari server (bukan harga cart basi)", async () => {
    // Cart client masih memegang harga lama Rp22.000, server sudah update
    // ke Rp23.000 — struk harus konsisten dengan total dari server.
    mockedApi.createCashierOrder.mockResolvedValue({
      id: "ORD-12",
      status: "pending",
      total_price: 23000,
      created_at: CREATED_AT,
      items: [
        {
          id: "oi1",
          menu_item_id: "m1",
          quantity: 1,
          subtotal: 23000,
          menu_item_name: "Nasi Gudeg Komplit",
          unit_price: 23000,
        },
      ],
    });

    render(<CashierTab token="t" restaurantName="Warung Bu Siti" />);
    await addItem("Nasi Gudeg Komplit");
    screen
      .getByRole("button", { name: "Buat pesanan + cetak struk" })
      .click();
    await screen.findByText("Print ulang struk");

    const struk = within(receipt());
    expect(receiptLines()).toHaveLength(1);
    expect(struk.getByText("1 x Rp 23.000")).toBeInTheDocument();
    // Rp23.000 muncul tepat 2×: subtotal baris item + baris TOTAL (selaras)
    expect(struk.getAllByText("Rp 23.000")).toHaveLength(2);
    expect(struk.queryByText(/Rp 22\.000/)).not.toBeInTheDocument();
  });
});

describe("S3 — waktu struk = created_at order", () => {
  it("memakai created_at dari respons, bukan waktu render", async () => {
    mockedApi.createCashierOrder.mockResolvedValue({
      id: "ORD-11",
      status: "pending",
      total_price: 22000,
      created_at: CREATED_AT,
      items: [
        {
          id: "oi1",
          menu_item_id: "m1",
          quantity: 1,
          subtotal: 22000,
          menu_item_name: "Nasi Gudeg Komplit",
          unit_price: 22000,
        },
      ],
    });

    render(<CashierTab token="t" restaurantName="Warung Bu Siti" />);
    await addItem("Nasi Gudeg Komplit");
    screen
      .getByRole("button", { name: "Buat pesanan + cetak struk" })
      .click();
    await screen.findByText("Print ulang struk");

    const waktu = receipt().querySelector("[data-receipt-time]");
    expect(waktu).not.toBeNull();
    expect(waktu!.textContent).toBe(
      new Date(CREATED_AT).toLocaleString("id-ID"),
    );
    // Bukan waktu sekarang (waktu render)
    expect(waktu!.textContent).not.toBe(new Date().toLocaleString("id-ID"));
  });
});
