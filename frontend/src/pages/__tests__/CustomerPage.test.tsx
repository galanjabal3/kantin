import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CustomerPage from "../CustomerPage";
import { useCartStore } from "../../store/cartStore";
import * as api from "../../lib/api";

vi.mock("../../lib/api", () => ({
  getRestaurant: vi.fn(),
  getMenu: vi.fn(),
  createOrder: vi.fn(),
  getOrderStatus: vi.fn(),
}));

const mockedApi = api as unknown as {
  getRestaurant: ReturnType<typeof vi.fn>;
  getMenu: ReturnType<typeof vi.fn>;
  createOrder: ReturnType<typeof vi.fn>;
  getOrderStatus: ReturnType<typeof vi.fn>;
};

const restaurant = {
  id: "r1",
  name: "Warung Bu Siti",
  slug: "warung-bu-siti",
  description: "Masakan rumahan",
  is_open: true,
  mode: "full",
  enable_table_number: false,
};

const menu = [
  {
    id: "m1",
    name: "Nasi Gudeg",
    description: "Gudeg komplit",
    price: 15000,
    image_url: "",
    is_available: true,
    category: null,
  },
];

function renderPage(path = "/r/warung-bu-siti") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/r/:slug" element={<CustomerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function checkoutAs(name: string) {
  (await screen.findByText("Lihat keranjang")).click();
  (await screen.findByText("Lanjut ke checkout")).click();
  const nameInput = await screen.findByPlaceholderText("Masukkan nama kamu");
  fireEvent.change(nameInput, { target: { value: name } });
  (await screen.findByText("Pesan sekarang")).click();
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  useCartStore.setState({ items: [], slug: null });
  mockedApi.getRestaurant.mockResolvedValue(restaurant);
  mockedApi.getMenu.mockResolvedValue(menu);
  mockedApi.getOrderStatus.mockResolvedValue({ status: "pending" });
});

describe("C1 — tracking aman untuk status tak dikenal", () => {
  it("tidak crash saat status di luar STATUS_INFO (mis. paid)", async () => {
    localStorage.setItem(
      "kantin-active-order-warung-bu-siti",
      JSON.stringify({
        orderId: "ORD-1",
        status: "paid",
        timestamp: Date.now(),
      }),
    );
    mockedApi.getOrderStatus.mockResolvedValue({
      status: "paid",
      total_price: 15000,
    });

    renderPage();

    expect(await screen.findByText("Status pesanan")).toBeInTheDocument();
    expect(screen.getByText("Memperbarui status")).toBeInTheDocument();
    expect(screen.getByText(/Status pesanan saat ini: paid/)).toBeInTheDocument();
  });

  it("tetap tampil normal untuk status known", async () => {
    localStorage.setItem(
      "kantin-active-order-warung-bu-siti",
      JSON.stringify({
        orderId: "ORD-1",
        status: "preparing",
        timestamp: Date.now(),
      }),
    );
    mockedApi.getOrderStatus.mockResolvedValue({ status: "preparing" });

    renderPage();

    expect(await screen.findByText("Sedang diproses")).toBeInTheDocument();
  });
});

describe("C3 — JSON.parse aman", () => {
  it("active order korup tidak membuat halaman blank", async () => {
    localStorage.setItem(
      "kantin-active-order-warung-bu-siti",
      "{korup bukan json",
    );

    renderPage();

    expect(await screen.findByText("Semua")).toBeInTheDocument();
    expect(
      localStorage.getItem("kantin-active-order-warung-bu-siti"),
    ).toBeNull();
  });

  it("history korup tidak membatalkan checkout", async () => {
    localStorage.setItem("kantin-history", "korup bukan json");
    useCartStore.setState({
      items: [{ id: "m1", name: "Nasi Gudeg", price: 15000, quantity: 1 }],
      slug: "warung-bu-siti",
    });
    mockedApi.createOrder.mockResolvedValue({
      id: "ORD-9",
      status: "pending",
      total_price: 15000,
      created_at: "2026-01-01T00:00:00Z",
    });

    renderPage();
    await checkoutAs("Budi");

    // Checkout sukses → tracking tampil (bukan error/toast gagal)
    expect(await screen.findByText("Status pesanan")).toBeInTheDocument();
    expect(
      localStorage.getItem("kantin-active-order-warung-bu-siti"),
    ).not.toBeNull();
    // History akhirnya valid (kunci korup dibersihkan)
    const history = localStorage.getItem("kantin-history");
    expect(history == null || Array.isArray(JSON.parse(history))).toBe(true);
  });
});

describe("C2 — cart di-scope ke slug restoran", () => {
  it("menampilkan peringatan & menyembunyikan bar cart saat cart resto lain", async () => {
    useCartStore.setState({
      items: [{ id: "x", name: "Ayam Goreng", price: 20000, quantity: 2 }],
      slug: "resto-lain",
    });

    renderPage();

    expect(
      await screen.findByText("Keranjang berisi pesanan dari resto lain"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Lihat keranjang")).not.toBeInTheDocument();
  });

  it("cart dari slug yang sama tampil normal", async () => {
    useCartStore.setState({
      items: [{ id: "m1", name: "Nasi Gudeg", price: 15000, quantity: 1 }],
      slug: "warung-bu-siti",
    });

    renderPage();

    expect(await screen.findByText("Lihat keranjang")).toBeInTheDocument();
    expect(
      screen.queryByText("Keranjang berisi pesanan dari resto lain"),
    ).not.toBeInTheDocument();
  });
});

describe("C4 — total dari server", () => {
  it("menampilkan total_price dari response + catatan selisih", async () => {
    useCartStore.setState({
      items: [{ id: "m1", name: "Nasi Gudeg", price: 15000, quantity: 1 }],
      slug: "warung-bu-siti",
    });
    // Server menghitung beda (mis. biaya layanan)
    mockedApi.createOrder.mockResolvedValue({
      id: "ORD-10",
      status: "pending",
      total_price: 16000,
      created_at: "2026-01-01T00:00:00Z",
    });

    renderPage();
    await checkoutAs("Budi");

    expect(await screen.findByText("Total pesanan")).toBeInTheDocument();
    expect(screen.getAllByText(/16\.000/).length).toBeGreaterThan(0);
    // Selisih dengan hitungan cart (15.000) ditampilkan eksplisit
    expect(
      screen.getByText(/berbeda dari hitungan keranjang/),
    ).toBeInTheDocument();
  });
});
