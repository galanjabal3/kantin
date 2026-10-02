import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { getRestaurant, getMenu, createOrder } from "../lib/api";
import { useCartStore } from "../store/cartStore";
import { Skeleton } from "../components/shared/Skeleton";
import MenuImage from "../components/MenuImage";
import toast from "react-hot-toast";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_open: boolean;
  mode: string;
  enable_table_number: boolean;
}

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  is_available: boolean;
  category: Category | null;
}

type Step = "menu" | "cart" | "checkout" | "tracking";

interface StatusInfo {
  label: string;
  desc: string;
  color: string;
  step: number;
}

const STATUS_INFO: Record<string, StatusInfo> = {
  pending: {
    label: "Menunggu konfirmasi",
    desc: "Pesanan kamu sedang menunggu dikonfirmasi penjual",
    color: "text-yellow-700",
    step: 1,
  },
  preparing: {
    label: "Sedang diproses",
    desc: "Penjual sedang menyiapkan pesanan kamu",
    color: "text-blue-600",
    step: 2,
  },
  ready: {
    label: "Sedang diantar",
    desc: "Pesanan kamu sedang diantar ke meja kamu",
    color: "text-green-700",
    step: 3,
  },
  done: {
    label: "Selesai",
    desc: "Pesanan sudah selesai, terima kasih!",
    color: "text-gray-500",
    step: 4,
  },
};

// Guard: status di luar map (mis. paid/unpaid/failed/expired dari backend)
// tidak boleh membuat tracking crash — fallback ke pending + label generik.
function getStatusInfo(status: string): StatusInfo {
  const known = STATUS_INFO[status];
  if (known) return known;
  return {
    ...STATUS_INFO.pending,
    label: "Memperbarui status",
    desc: `Status pesanan saat ini: ${status || "tidak diketahui"}. Halaman ini diperbarui otomatis.`,
  };
}

interface CreatedOrder {
  id: string;
  status: string;
  total_price?: number;
  created_at?: string;
}

// JSON.parse aman — kunci korup dihapus, tidak melempar error
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

// Sesi order aktif masih layak dipakai kalau kunci ada, ada ordernya,
// dan dibuat dalam 2 jam terakhir (sama aturan dengan restore saat mount).
function isActiveOrderFresh(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { orderId?: string; timestamp?: number };
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    return (
      !!parsed.orderId && !!parsed.timestamp && parsed.timestamp > twoHoursAgo
    );
  } catch {
    return false;
  }
}

// Baca status HTTP dari error API (lihat lib/api.ts).
// null → error jaringan (fetch gagal) / error tanpa status.
function getHttpStatus(err: unknown): number | null {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return null;
}

export default function CustomerPage() {
  const { slug } = useParams<{ slug: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [step, setStep] = useState<Step>("menu");
  const [customerName, setCustomerName] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Jenis error load resto: 404 (tidak ada) vs server/jaringan (bisa dicoba lagi)
  const [errorKind, setErrorKind] = useState<"not_found" | "network" | null>(
    null,
  );
  // Retry counter untuk fetch resto+menu dan polling order
  const [fetchTick, setFetchTick] = useState(0);
  const [pollTick, setPollTick] = useState(0);
  // Status polling terakhir: null = OK, "network" = gagal memuat status
  const [pollError, setPollError] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<string>("");
  // Total dari response server (sumber kebenaran setelah order dibuat)
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  // Snapshot hitungan cart sebelum dibersihkan — untuk deteksi selisih
  const [clientTotal, setClientTotal] = useState<number | null>(null);
  // Supaya pesan "sesi berakhir" hanya muncul sekali per order hilang
  const orderGoneNotifiedRef = useRef<string | null>(null);
  // Konfirmasi inline untuk "Batalkan pesanan" (hindari window.confirm)
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const {
    items,
    addItem,
    updateQuantity,
    clearCart,
    total,
    slug: cartSlug,
  } = useCartStore();

  // Cart dari resto lain tidak boleh ikut ke checkout resto ini
  const cartMismatch =
    items.length > 0 && !!cartSlug && !!slug && cartSlug !== slug;

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);

  useEffect(() => {
    if (!slug) return;
    const fetchData = async () => {
      setLoading(true);
      setError("");
      setErrorKind(null);
      try {
        const [restoData, menuData] = await Promise.all([
          getRestaurant(slug),
          getMenu(slug),
        ]);
        setRestaurant(restoData);
        setMenu(menuData);

        const cats = menuData
          .map((m: MenuItem) => m.category)
          .filter((c: Category | null): c is Category => !!c)
          .filter(
            (c: Category, i: number, arr: Category[]) =>
              arr.findIndex((x) => x.id === c.id) === i,
          );
        setCategories(cats);
      } catch (err) {
        if (getHttpStatus(err) === 404) {
          setErrorKind("not_found");
          setError("Restoran tidak ditemukan");
        } else {
          // Error jaringan / 5xx — jangan menyesatkan dengan "404"
          setErrorKind("network");
          setError(
            "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.",
          );
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug, fetchTick]);

  // Restore table number + order aktif — hanya saat mount / slug berubah
  useEffect(() => {
    if (!slug) return;

    // Read table number from URL
    const urlParams = new URLSearchParams(window.location.search);
    const tableFromUrl = urlParams.get("table");
    if (tableFromUrl) setTableNumber(tableFromUrl);

    // Restore active order — kalau ada order aktif yang belum selesai.
    // Validasi order-nya sendiri terjadi di polling: kalau 404/hilang,
    // user dibalikkan ke menu (bukan terkunci di tracking).
    const savedOrder = localStorage.getItem(`kantin-active-order-${slug}`);
    if (savedOrder) {
      try {
        const parsed = JSON.parse(savedOrder) as {
          orderId?: string;
          status?: string;
          timestamp?: number;
        };
        // Hanya restore kalau order dibuat dalam 2 jam terakhir
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        if (
          parsed.orderId &&
          parsed.timestamp &&
          parsed.timestamp > twoHoursAgo &&
          parsed.status !== "done"
        ) {
          setOrderId(parsed.orderId);
          setOrderStatus(parsed.status || "pending");
          setStep("tracking");
        } else {
          // Order sudah lama atau selesai — hapus
          localStorage.removeItem(`kantin-active-order-${slug}`);
        }
      } catch {
        // Data korup — hapus, jangan sampai halaman blank
        localStorage.removeItem(`kantin-active-order-${slug}`);
      }
    }
  }, [slug]);

  // Poll order status every 5 seconds
  useEffect(() => {
    if (step !== "tracking" || !orderId || !slug) return;
    const activeKey = `kantin-active-order-${slug}`;
    const poll = async () => {
      try {
        const { getOrderStatus } = await import("../lib/api");
        const data = await getOrderStatus(slug, orderId);
        setOrderStatus(data.status);
        if (typeof data.total_price === "number") {
          setServerTotal(data.total_price);
        }
        setPollError(null);
        // Sinkronkan status terbaru ke localStorage (timestamp asli
        // dipertahankan) supaya reload tidak kembali ke status basi.
        try {
          const raw = localStorage.getItem(activeKey);
          if (raw) {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            localStorage.setItem(
              activeKey,
              JSON.stringify({ ...parsed, status: data.status }),
            );
          }
        } catch {
          // storage korup/penuh — abaikan, tracking tetap jalan
        }
      } catch (err) {
        if (getHttpStatus(err) === 404) {
          // Order hilang di server (mis. backend di-reset) — jangan biarkan
          // user terkunci di tracking: bersihkan sesi, kembali ke menu.
          localStorage.removeItem(activeKey);
          setOrderId(null);
          setOrderStatus("pending");
          setPollError(null);
          setStep("menu");
          if (orderGoneNotifiedRef.current !== orderId) {
            orderGoneNotifiedRef.current = orderId;
            toast.error("Sesi pesanan sebelumnya sudah berakhir.");
          }
        } else {
          // Error jaringan/5xx — tetap di tracking (tombol keluar selalu
          // ada), tampilkan pesan + tombol coba lagi, jangan diam.
          setPollError("network");
        }
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [step, orderId, slug, pollTick]);

  const filteredMenu =
    activeCategory === "all"
      ? menu
      : menu.filter((m) => m.category?.id === activeCategory);

  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const handleCheckout = async () => {
    if (!slug || items.length === 0 || cartMismatch) return;
    setSubmitting(true);

    const clientTotalNow = total();
    let order: CreatedOrder;
    try {
      order = await createOrder(slug, {
        customer_name: customerName || null,
        table_number: tableNumber || null,
        source: "customer",
        items: items.map((i) => ({ menu_item_id: i.id, quantity: i.quantity })),
      });
    } catch {
      toast.error("Gagal membuat pesanan, coba lagi");
      setSubmitting(false);
      return;
    }

    // Order sudah dibuat di server — semua langkah setelah ini tidak boleh
    // menghasilkan toast "gagal" palsu.
    toast.success("Pesanan berhasil dibuat!");
    setClientTotal(clientTotalNow);
    setServerTotal(
      typeof order.total_price === "number" ? order.total_price : null,
    );
    setOrderId(order.id);
    setOrderStatus(order.status);
    setPollError(null);
    clearCart();
    setStep("tracking");

    // Simpan order aktif ke localStorage (gagal simpan → abaikan)
    saveActiveOrder(order.id, order.status);
    // Simpan ke history — terpisah dari blok checkout
    appendHistory(order);
    setSubmitting(false);
  };

  // Save active order to localStorage
  const saveActiveOrder = (orderId: string, status: string) => {
    try {
      localStorage.setItem(
        `kantin-active-order-${slug}`,
        JSON.stringify({
          orderId,
          status,
          timestamp: Date.now(),
        }),
      );
    } catch {
      // storage penuh/blokir — tracking tetap jalan di memori
    }
  };

  // Simpan history — gagal menulis history TIDAK boleh membatalkan checkout
  const appendHistory = (order: CreatedOrder) => {
    try {
      const stored = readJSON<unknown>("kantin-history", []);
      const history: Array<Record<string, unknown>> = Array.isArray(stored)
        ? (stored as Array<Record<string, unknown>>)
        : [];
      history.unshift({
        id: order.id,
        restaurant: restaurant?.name,
        slug,
        total: order.total_price,
        status: order.status,
        created_at: order.created_at,
      });
      localStorage.setItem(
        "kantin-history",
        JSON.stringify(history.slice(0, 20)),
      );
    } catch {
      // data korup/penuh — abaikan
    }
  };

  // Clear active order from localStorage
  const clearActiveOrder = () => {
    localStorage.removeItem(`kantin-active-order-${slug}`);
  };

  // Soft exit: keluar dari tracking TANPA membuang sesi. localStorage,
  // orderId, orderStatus, dan pollError dipertahankan sehingga user bisa
  // kembali kapan saja lewat bar "Pesanan aktif" di menu.
  const exitTracking = () => {
    setConfirmingCancel(false);
    setStep("menu");
  };

  // Membuang sesi tracking di sisi client saja. Backend tidak punya
  // endpoint batal order — pesanan tetap hidup di server dan masih bisa
  // diproses penjual; hanya tracking di browser ini yang dihapus.
  const cancelOrder = () => {
    clearActiveOrder();
    setOrderId(null);
    setOrderStatus("pending");
    setPollError(null);
    setConfirmingCancel(false);
    setStep("menu");
  };

  // Retry fetch resto+menu (dipakai di layar error jaringan)
  const retryFetch = () => setFetchTick((t) => t + 1);

  // Aman untuk status apa pun (termasuk yang belum ada di STATUS_INFO)
  const statusInfo = getStatusInfo(orderStatus);

  // Bar "Pesanan aktif" di step menu: hanya kalau sesi order masih hidup
  // (ada di memori, belum selesai, dan kunci localStorage masih <2 jam).
  const activeOrderKey = slug ? `kantin-active-order-${slug}` : "";
  const showActiveOrderBar =
    !!orderId &&
    orderStatus !== "done" &&
    !!activeOrderKey &&
    isActiveOrderFresh(activeOrderKey);

  if (loading)
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Hero skeleton */}
        <div className="bg-brand-700 px-6 pt-10 pb-6">
          <div className="max-w-lg mx-auto">
            <Skeleton
              className="w-12 h-12 rounded-xl mb-4"
              style={{ background: "rgba(255,255,255,0.3)" }}
            />
            <Skeleton
              className="h-7 w-40 mb-2"
              style={{ background: "rgba(255,255,255,0.3)" }}
            />
            <Skeleton
              className="h-4 w-56"
              style={{ background: "rgba(255,255,255,0.2)" }}
            />
          </div>
        </div>

        {/* Category skeleton */}
        <div className="max-w-lg mx-auto flex gap-2 px-4 py-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full flex-shrink-0" />
          ))}
        </div>

        {/* Menu skeleton */}
        <div className="max-w-lg mx-auto px-4 flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 flex gap-3">
              <Skeleton className="w-20 h-20 rounded-lg flex-shrink-0" />
              <div className="flex-1 flex flex-col gap-2 py-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-4 w-16 mt-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );

  if (error || !restaurant) {
    const isNetworkError = errorKind === "network";
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          {isNetworkError ? (
            <>
              <div className="w-14 h-14 mx-auto mb-4 bg-amber-50 rounded-2xl flex items-center justify-center">
                <WifiOff className="w-7 h-7 text-amber-600" />
              </div>
              <p className="text-lg font-medium text-gray-900 mb-1">
                Tidak bisa terhubung ke server
              </p>
              <p className="text-gray-500 text-sm mb-6">
                Periksa koneksi lalu coba lagi.
              </p>
            </>
          ) : (
            <>
              <p className="text-5xl font-bold text-brand-700 mb-3">404</p>
              <p className="text-gray-500 text-sm mb-6">
                {error || "Restoran tidak ditemukan"}
              </p>
            </>
          )}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {isNetworkError && (
              <button
                onClick={retryFetch}
                className="bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                Coba lagi
              </button>
            )}
            <Link
              to="/"
              className={
                isNetworkError
                  ? "border border-gray-200 hover:border-gray-300 text-gray-600 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                  : "bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              }
            >
              Kembali ke beranda
            </Link>
            <Link
              to="/login"
              className="border border-gray-200 hover:border-gray-300 text-gray-600 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Masuk sebagai seller
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-brand-700 px-6 pt-10 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-4">
            <span className="text-brand-700 font-bold text-lg">
              {restaurant.name.charAt(0)}
            </span>
          </div>
          <h1
            className="text-white text-2xl font-medium mb-1"
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            {restaurant.name}
          </h1>
          {restaurant.description && (
            <p className="text-orange-100 text-sm mb-3">
              {restaurant.description}
            </p>
          )}
          <span
            className={`text-xs px-3 py-1 rounded-full font-medium ${
              restaurant.is_open
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {restaurant.is_open ? "Buka sekarang" : "Sedang tutup"}
          </span>
        </div>
      </div>

      {/* Tracking step */}
      {step === "tracking" && (
        <div className="max-w-lg mx-auto px-4 py-8">
          {/* Jalan keluar — selalu tampil untuk SEMUA status, user tidak terkunci.
              Soft exit: cukup pindah layar, sesi order TIDAK dihapus. */}
          <button
            onClick={exitTracking}
            className="text-sm text-gray-500 mb-4 flex items-center gap-1"
          >
            ← Kembali ke menu
          </button>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">
              Status pesanan
            </h2>

            {/* Progress */}
            <div className="flex items-center gap-2 mb-8">
              {["pending", "preparing", "ready", "done"].map((s, i) => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                      statusInfo.step >= i + 1
                        ? "bg-brand-700 text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {i + 1}
                  </div>
                  {i < 3 && (
                    <div
                      className={`h-0.5 flex-1 ${
                        statusInfo.step > i + 1
                          ? "bg-brand-700"
                          : "bg-gray-100"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="text-center">
              <p
                className={`text-lg font-medium mb-2 ${statusInfo.color}`}
              >
                {statusInfo.label}
              </p>
              <p className="text-sm text-gray-500">{statusInfo.desc}</p>
            </div>

            {/* Total dari server — sumber kebenaran setelah order dibuat */}
            {serverTotal !== null && (
              <div className="mt-5 flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                <span className="text-sm text-gray-600">Total pesanan</span>
                <span className="text-sm font-medium text-brand-700">
                  {formatPrice(serverTotal)}
                </span>
              </div>
            )}
            {serverTotal !== null &&
              clientTotal !== null &&
              serverTotal !== clientTotal && (
                <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">
                  Catatan: total dari sistem ({formatPrice(serverTotal)})
                  berbeda dari hitungan keranjang ({formatPrice(clientTotal)}
                  ). Yang berlaku adalah total pesanan dari sistem.
                </div>
              )}

            {/* Polling gagal (jaringan/5xx) — jangan diam, tawarkan coba lagi */}
            {pollError === "network" && (
              <div className="mt-5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-amber-800">
                    Tidak bisa memuat status pesanan
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Periksa koneksi lalu coba lagi.
                  </p>
                </div>
                <button
                  onClick={() => setPollTick((t) => t + 1)}
                  className="text-xs font-medium text-brand-700 underline shrink-0"
                >
                  Coba lagi
                </button>
              </div>
            )}

            {orderStatus === "done" && (
              <button
                onClick={() => {
                  clearActiveOrder();
                  setStep("menu");
                  setOrderId(null);
                }}
                className="w-full mt-6 bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                Pesan lagi
              </button>
            )}
          </div>

          {/* Membuang sesi tracking — konfirmasi inline, sebelum dikonfirmasi
              tidak ada yang dihapus. Catatan: tidak ada endpoint batal di
              backend, ini murni buang tracking di sisi client (order tetap
              hidup di server, penjual masih bisa memprosesnya). */}
          {orderStatus !== "done" && (
            <div className="mt-4 text-center">
              {!confirmingCancel ? (
                <button
                  onClick={() => setConfirmingCancel(true)}
                  className="text-xs text-gray-400 hover:text-red-600 underline transition-colors"
                >
                  Batalkan pesanan
                </button>
              ) : (
                <div className="text-xs text-gray-500">
                  <p>Yakin membatalkan pesanan?</p>
                  <div className="mt-1.5 flex items-center justify-center gap-4">
                    <button
                      onClick={cancelOrder}
                      className="text-red-600 font-medium hover:text-red-700"
                    >
                      Ya
                    </button>
                    <button
                      onClick={() => setConfirmingCancel(false)}
                      className="text-gray-500 font-medium hover:text-gray-700"
                    >
                      Tidak
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Checkout step */}
      {step === "checkout" && (
        <div className="max-w-lg mx-auto px-4 py-6">
          <button
            onClick={() => setStep("cart")}
            className="text-sm text-gray-500 mb-4 flex items-center gap-1"
          >
            ← Kembali
          </button>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-medium text-gray-900 mb-4">
              Konfirmasi pesanan
            </h2>

            {/* Order summary */}
            <div className="flex flex-col gap-2 mb-4">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    {item.name} × {item.quantity}
                  </span>
                  <span className="text-gray-900">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-medium border-t border-gray-100 pt-3 mb-5">
              <span>Total</span>
              <span className="text-brand-700">{formatPrice(total())}</span>
            </div>

            {/* Name input */}
            <div className="flex flex-col gap-1.5 mb-5">
              <label className="text-xs text-gray-500 font-medium">
                Nama kamu <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Masukkan nama kamu"
                className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-600 transition-colors"
              />
            </div>

            {restaurant.enable_table_number && (
              <div className="flex flex-col gap-1.5 mb-5">
                <label className="text-xs text-gray-500 font-medium">
                  Nomor meja (opsional)
                </label>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Contoh: Meja 5"
                  className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-600 transition-colors"
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">
                {error}
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={
                submitting || !restaurant.is_open || !customerName.trim()
              }
              className="w-full bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium py-2.5 rounded-lg transition-colors disabled:bg-brand-100 disabled:hover:bg-brand-100 disabled:text-brand-700 disabled:cursor-not-allowed"
            >
              {submitting
                ? "Memproses..."
                : !customerName.trim()
                  ? "Masukkan nama dulu"
                  : restaurant.is_open
                    ? "Pesan sekarang"
                    : "Resto sedang tutup"}
            </button>
          </div>
        </div>
      )}

      {/* Cart step */}
      {step === "cart" && (
        <div className="max-w-lg mx-auto px-4 py-6">
          <button
            onClick={() => setStep("menu")}
            className="text-sm text-gray-500 mb-4 flex items-center gap-1"
          >
            ← Kembali ke menu
          </button>
          <h2 className="text-base font-medium text-gray-900 mb-4">
            Keranjang
          </h2>
          {cartMismatch ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 flex flex-col gap-3">
              <p className="text-xs text-amber-800">
                Keranjang berisi pesanan dari resto lain. Kosongkan dulu untuk
                melanjutkan.
              </p>
              <button
                onClick={clearCart}
                className="w-full bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                Kosongkan keranjang
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              Keranjang kosong
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {item.name}
                    </p>
                    <p className="text-xs text-brand-700 mt-0.5">
                      {formatPrice(item.price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-50"
                    >
                      −
                    </button>
                    <span className="text-sm font-medium w-4 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 flex items-center justify-center hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              <div className="bg-white border border-gray-100 rounded-xl p-4 flex justify-between">
                <span className="text-sm font-medium text-gray-900">Total</span>
                <span className="text-sm font-medium text-brand-700">
                  {formatPrice(total())}
                </span>
              </div>

              <button
                onClick={() => setStep("checkout")}
                className="w-full bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium py-3 rounded-xl transition-colors"
              >
                Lanjut ke checkout
              </button>
            </div>
          )}
        </div>
      )}

      {/* Menu step */}
      {step === "menu" && (
        <div className="max-w-lg mx-auto">
          {/* Cart dari resto lain — jangan sampai bocor ke checkout */}
          {cartMismatch && (
            <div className="px-4 pt-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-xs text-amber-800 flex-1">
                  Keranjang berisi pesanan dari resto lain
                </p>
                <button
                  onClick={clearCart}
                  className="text-xs font-medium text-brand-700 underline shrink-0"
                >
                  Kosongkan
                </button>
              </div>
            </div>
          )}

          {/* Category filter */}
          <div className="flex gap-2 px-4 py-4 overflow-x-auto">
            <button
              onClick={() => setActiveCategory("all")}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                activeCategory === "all"
                  ? "bg-brand-700 text-white"
                  : "bg-white border border-gray-200 text-gray-600"
              }`}
            >
              Semua
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  activeCategory === cat.id
                    ? "bg-brand-700 text-white"
                    : "bg-white border border-gray-200 text-gray-600"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Menu list */}
          <div
            className={`px-4 flex flex-col gap-3 ${showActiveOrderBar ? "pb-44" : "pb-32"}`}
          >
            {filteredMenu.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">
                Tidak ada menu tersedia
              </div>
            ) : (
              filteredMenu.map((item) => {
                const cartItem = items.find((i) => i.id === item.id);
                return (
                  <div
                    key={item.id}
                    className="bg-white border border-gray-100 rounded-xl p-4 flex gap-3"
                  >
                    <MenuImage
                      name={item.name}
                      imageUrl={item.image_url}
                      className="w-20 h-20 rounded-lg shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-sm font-medium text-brand-700">
                          {formatPrice(item.price)}
                        </span>
                        {cartItem ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                updateQuantity(item.id, cartItem.quantity - 1)
                              }
                              className="w-7 h-7 rounded-full bg-brand-700 text-white flex items-center justify-center text-sm"
                            >
                              −
                            </button>
                            <span className="text-sm font-medium w-4 text-center">
                              {cartItem.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(item.id, cartItem.quantity + 1)
                              }
                              className="w-7 h-7 rounded-full bg-brand-700 text-white flex items-center justify-center text-sm"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              addItem(
                                {
                                  id: item.id,
                                  name: item.name,
                                  price: item.price,
                                  quantity: 1,
                                },
                                slug!,
                              )
                            }
                            disabled={!item.is_available}
                            className="w-7 h-7 rounded-full bg-brand-700 hover:bg-brand-800 disabled:opacity-30 text-white flex items-center justify-center text-sm transition-colors"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom bars — bar "Pesanan aktif" menumpuk DI ATAS bar cart
              (satu wrapper fixed) supaya keduanya tetap bisa diklik */}
          {showActiveOrderBar ||
          (cartCount > 0 && !cartMismatch) ? (
            <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-2 bg-linear-to-t from-gray-50">
              <div className="max-w-lg mx-auto flex flex-col gap-2">
                {showActiveOrderBar && (
                  <div className="bg-white border border-gray-100 rounded-xl shadow-md px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900">
                        Pesanan aktif
                      </p>
                      <p className={`text-xs mt-0.5 ${statusInfo.color}`}>
                        {statusInfo.label}
                      </p>
                    </div>
                    <button
                      onClick={() => setStep("tracking")}
                      className="shrink-0 bg-brand-700 hover:bg-brand-800 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                    >
                      Lihat status →
                    </button>
                  </div>
                )}

                {cartCount > 0 && !cartMismatch && (
                  <button
                    onClick={() => setStep("cart")}
                    className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-xl py-3.5 flex items-center justify-between px-5 transition-colors"
                  >
                    <span className="bg-white text-brand-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      {cartCount} item
                    </span>
                    <span className="text-sm font-medium">Lihat keranjang</span>
                    <span className="text-sm font-medium">
                      {formatPrice(total())}
                    </span>
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
