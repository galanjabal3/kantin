import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

describe("F1 — soft exit: keluar dari tracking tanpa membuang sesi", () => {
  it("klik Kembali ke menu → sesi dipertahankan & bar pesanan aktif muncul", async () => {
    localStorage.setItem(
      "kantin-active-order-warung-bu-siti",
      JSON.stringify({
        orderId: "ORD-1",
        status: "pending",
        timestamp: Date.now(),
      }),
    );
    mockedApi.getOrderStatus.mockResolvedValue({ status: "pending" });

    renderPage();

    const exitBtn = await screen.findByRole("button", {
      name: /Kembali ke menu/,
    });
    expect(exitBtn).toBeInTheDocument();

    fireEvent.click(exitBtn);

    expect(await screen.findByText("Semua")).toBeInTheDocument();
    expect(screen.queryByText("Status pesanan")).not.toBeInTheDocument();
    // Soft exit: localStorage TIDAK dihapus — user masih bisa kembali
    expect(
      localStorage.getItem("kantin-active-order-warung-bu-siti"),
    ).not.toBeNull();

    // Bar "Pesanan aktif" tampil di menu dengan label status terkini
    expect(screen.getByText("Pesanan aktif")).toBeInTheDocument();
    expect(screen.getByText("Menunggu konfirmasi")).toBeInTheDocument();

    // Bar punya jalan kembali ke tracking
    fireEvent.click(screen.getByRole("button", { name: /Lihat status/ }));
    expect(await screen.findByText("Status pesanan")).toBeInTheDocument();
  });
});

describe("F2 — restore order dari localStorage aman", () => {
  it("order 404 di server → hapus sesi & kembali ke menu (bukan stuck)", async () => {
    localStorage.setItem(
      "kantin-active-order-warung-bu-siti",
      JSON.stringify({
        orderId: "ORD-HILANG",
        status: "pending",
        timestamp: Date.now(),
      }),
    );
    mockedApi.getOrderStatus.mockRejectedValue(
      Object.assign(new Error("Order tidak ditemukan"), { status: 404 }),
    );

    renderPage();

    expect(await screen.findByText("Semua")).toBeInTheDocument();
    expect(screen.queryByText("Status pesanan")).not.toBeInTheDocument();
    expect(
      localStorage.getItem("kantin-active-order-warung-bu-siti"),
    ).toBeNull();
  });

  it("polling jaringan gagal → banner coba lagi + tetap bisa keluar", async () => {
    localStorage.setItem(
      "kantin-active-order-warung-bu-siti",
      JSON.stringify({
        orderId: "ORD-2",
        status: "pending",
        timestamp: Date.now(),
      }),
    );
    mockedApi.getOrderStatus.mockRejectedValue(new Error("Failed to fetch"));

    renderPage();

    expect(
      await screen.findByText("Tidak bisa memuat status pesanan"),
    ).toBeInTheDocument();
    // Tidak silent — user masih punya jalan keluar
    expect(
      screen.getByRole("button", { name: /Kembali ke menu/ }),
    ).toBeInTheDocument();

    // Tombol coba lagi me-refetch status
    const callsBefore = mockedApi.getOrderStatus.mock.calls.length;
    fireEvent.click(screen.getByText("Coba lagi"));
    await waitFor(() =>
      expect(mockedApi.getOrderStatus.mock.calls.length).toBeGreaterThan(
        callsBefore,
      ),
    );
  });
});

describe("S1 — soft exit setelah checkout", () => {
  it("sesi order tetap ada & bar menampilkan status hasil polling", async () => {
    useCartStore.setState({
      items: [{ id: "m1", name: "Nasi Gudeg", price: 15000, quantity: 1 }],
      slug: "warung-bu-siti",
    });
    mockedApi.createOrder.mockResolvedValue({
      id: "ORD-7",
      status: "pending",
      total_price: 15000,
      created_at: "2026-01-01T00:00:00Z",
    });
    mockedApi.getOrderStatus.mockResolvedValue({ status: "preparing" });

    renderPage();
    await checkoutAs("Budi");

    // Polling jalan di tracking → status ter-update
    expect(await screen.findByText("Sedang diproses")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Kembali ke menu/ }));

    expect(await screen.findByText("Semua")).toBeInTheDocument();
    expect(
      localStorage.getItem("kantin-active-order-warung-bu-siti"),
    ).not.toBeNull();
    // Sumber status di bar adalah state yang sama dengan tracking
    expect(screen.getByText("Pesanan aktif")).toBeInTheDocument();
    expect(screen.getByText("Sedang diproses")).toBeInTheDocument();

    // Kembali lagi ke tracking lewat bar
    fireEvent.click(screen.getByRole("button", { name: /Lihat status/ }));
    expect(await screen.findByText("Status pesanan")).toBeInTheDocument();
  });
});

describe("S2 — batalkan pesanan (buang sesi di sisi client)", () => {
  it("konfirmasi Ya → kunci localStorage terhapus & bar hilang", async () => {
    localStorage.setItem(
      "kantin-active-order-warung-bu-siti",
      JSON.stringify({
        orderId: "ORD-1",
        status: "pending",
        timestamp: Date.now(),
      }),
    );
    mockedApi.getOrderStatus.mockResolvedValue({ status: "pending" });

    renderPage();

    // Minta batal → muncul konfirmasi inline, belum ada yang dihapus
    fireEvent.click(
      await screen.findByRole("button", { name: /Batalkan pesanan/ }),
    );
    expect(await screen.findByText("Yakin membatalkan pesanan?")).toBeInTheDocument();
    expect(
      localStorage.getItem("kantin-active-order-warung-bu-siti"),
    ).not.toBeNull();

    // Konfirmasi "Tidak" membatalkan tanpa efek apa pun
    fireEvent.click(screen.getByRole("button", { name: "Tidak" }));
    expect(
      localStorage.getItem("kantin-active-order-warung-bu-siti"),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /Batalkan pesanan/ }),
    ).toBeInTheDocument();

    // Konfirmasi "Ya" → buang sesi, kembali ke menu, bar tidak tampil
    fireEvent.click(
      screen.getByRole("button", { name: /Batalkan pesanan/ }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Ya" }));

    expect(await screen.findByText("Semua")).toBeInTheDocument();
    expect(
      localStorage.getItem("kantin-active-order-warung-bu-siti"),
    ).toBeNull();
    expect(screen.queryByText("Pesanan aktif")).not.toBeInTheDocument();
    expect(screen.queryByText("Status pesanan")).not.toBeInTheDocument();
  });
});

describe("S3 — bar pesanan aktif tidak tampil untuk order selesai", () => {
  it("status done + soft exit → bar tetap tidak muncul di menu", async () => {
    useCartStore.setState({
      items: [{ id: "m1", name: "Nasi Gudeg", price: 15000, quantity: 1 }],
      slug: "warung-bu-siti",
    });
    mockedApi.createOrder.mockResolvedValue({
      id: "ORD-8",
      status: "preparing",
      total_price: 15000,
      created_at: "2026-01-01T00:00:00Z",
    });
    mockedApi.getOrderStatus.mockResolvedValue({ status: "done" });

    renderPage();
    await checkoutAs("Budi");

    expect(await screen.findByText("Selesai")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Kembali ke menu/ }));

    expect(await screen.findByText("Semua")).toBeInTheDocument();
    expect(screen.queryByText("Pesanan aktif")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Lihat status/ }),
    ).not.toBeInTheDocument();
  });
});

describe("A3 — riwayat pesanan (localStorage kantin-history)", () => {
  it("riwayat kosong → section tidak tampil", async () => {
    renderPage();

    expect(await screen.findByText("Semua")).toBeInTheDocument();
    expect(screen.queryByText("Riwayat pesanan")).not.toBeInTheDocument();
  });

  it("riwayat korup → section tidak tampil (bukan error)", async () => {
    localStorage.setItem("kantin-history", "korup bukan json");

    renderPage();

    expect(await screen.findByText("Semua")).toBeInTheDocument();
    expect(screen.queryByText("Riwayat pesanan")).not.toBeInTheDocument();
  });

  it("riwayat resto lain tidak ikut tampil (filter per slug)", async () => {
    localStorage.setItem(
      "kantin-history",
      JSON.stringify([
        {
          id: "ORD-LAIN",
          restaurant: "Resto Lain",
          slug: "resto-lain",
          total: 20000,
          status: "done",
          created_at: "2026-05-01T12:00:00Z",
        },
      ]),
    );

    renderPage();

    expect(await screen.findByText("Semua")).toBeInTheDocument();
    expect(screen.queryByText("Riwayat pesanan")).not.toBeInTheDocument();
    expect(screen.queryByText("Resto Lain")).not.toBeInTheDocument();
  });

  it("tampil setelah checkout: nama resto, tanggal, total, label status", async () => {
    useCartStore.setState({
      items: [{ id: "m1", name: "Nasi Gudeg", price: 15000, quantity: 1 }],
      slug: "warung-bu-siti",
    });
    mockedApi.createOrder.mockResolvedValue({
      id: "ORD-20",
      status: "pending",
      total_price: 15000,
      created_at: "2026-06-15T12:00:00Z",
    });

    renderPage();
    await checkoutAs("Budi");

    expect(await screen.findByText("Status pesanan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Kembali ke menu/ }));

    const card = (await screen.findByText("Riwayat pesanan")).parentElement!;
    expect(within(card).getByText("Warung Bu Siti")).toBeInTheDocument();
    expect(within(card).getByText("15 Jun 2026")).toBeInTheDocument();
    expect(within(card).getByText("Menunggu konfirmasi")).toBeInTheDocument();
    expect(within(card).getByText(/15\.000/)).toBeInTheDocument();
    // Data tersimpan di localStorage oleh appendHistory
    expect(JSON.parse(localStorage.getItem("kantin-history")!)).toHaveLength(1);
  });

  it("hanya baris order aktif yang bisa diklik → tracking", async () => {
    localStorage.setItem(
      "kantin-history",
      JSON.stringify([
        {
          id: "ORD-HIDUP",
          restaurant: "Warung Bu Siti",
          slug: "warung-bu-siti",
          total: 15000,
          status: "preparing",
          created_at: "2026-06-15T12:00:00Z",
        },
        {
          id: "ORD-LAMA",
          restaurant: "Warung Bu Siti",
          slug: "warung-bu-siti",
          total: 12000,
          status: "done",
          created_at: "2026-05-01T12:00:00Z",
        },
      ]),
    );
    localStorage.setItem(
      "kantin-active-order-warung-bu-siti",
      JSON.stringify({
        orderId: "ORD-HIDUP",
        status: "preparing",
        timestamp: Date.now(),
      }),
    );
    mockedApi.getOrderStatus.mockResolvedValue({ status: "preparing" });

    renderPage();

    // Sesi dipulihkan → langsung di tracking; keluar dulu ke menu
    fireEvent.click(await screen.findByRole("button", { name: /Kembali ke menu/ }));

    const card = (await screen.findByText("Riwayat pesanan")).parentElement!;
    const rowButtons = within(card).getAllByRole("button");
    // 2 baris riwayat, hanya yang id-nya == orderId aktif yang interaktif
    expect(rowButtons).toHaveLength(1);

    fireEvent.click(rowButtons[0]);
    expect(await screen.findByText("Status pesanan")).toBeInTheDocument();
  });
});
