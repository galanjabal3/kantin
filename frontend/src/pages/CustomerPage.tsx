import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { getRestaurant, getMenu, createOrder } from "../lib/api";
import { useCartStore } from "../store/cartStore";

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
  const [phone, setPhone] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<string>("");

  const { items, addItem, updateQuantity, clearCart, total } = useCartStore();

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);

  useEffect(() => {
    if (!slug) return;
    const fetchData = async () => {
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
      } catch {
        setError("Restoran tidak ditemukan");
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Read table number from URL
    const urlParams = new URLSearchParams(window.location.search);
    const tableFromUrl = urlParams.get("table");
    if (tableFromUrl) setTableNumber(tableFromUrl);

    // Restore active order — kalau ada order aktif yang belum selesai
    const savedOrder = localStorage.getItem(`kantin-active-order-${slug}`);
    if (savedOrder) {
      const parsed = JSON.parse(savedOrder);
      // Hanya restore kalau order dibuat dalam 2 jam terakhir
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      if (parsed.timestamp > twoHoursAgo && parsed.status !== "done") {
        setOrderId(parsed.orderId);
        setOrderStatus(parsed.status);
        setStep("tracking");
      } else {
        // Order sudah lama atau selesai — hapus
        localStorage.removeItem(`kantin-active-order-${slug}`);
      }
    }
  }, [slug]);

  // Poll order status every 5 seconds
  useEffect(() => {
    if (step !== "tracking" || !orderId || !slug) return;
    const poll = async () => {
      try {
        const { getOrderStatus } = await import("../lib/api");
        const data = await getOrderStatus(slug, orderId);
        setOrderStatus(data.status);
      } catch {
        // silent
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [step, orderId, slug]);

  const filteredMenu =
    activeCategory === "all"
      ? menu
      : menu.filter((m) => m.category?.id === activeCategory);

  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const handleCheckout = async () => {
    if (!slug || items.length === 0) return;
    setSubmitting(true);
    try {
      const order = await createOrder(slug, {
        customer_name: customerName || null,
        table_number: tableNumber || null,
        source: "customer",
        items: items.map((i) => ({ menu_item_id: i.id, quantity: i.quantity })),
      });
      setOrderId(order.id);
      setOrderStatus(order.status);
      clearCart();
      setStep("tracking");

      // Simpan order aktif ke localStorage
      saveActiveOrder(order.id, order.status);

      // Simpan ke history
      const history = JSON.parse(
        localStorage.getItem("kantin-history") || "[]",
      );
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
      setError("Gagal membuat pesanan, coba lagi");
    } finally {
      setSubmitting(false);
    }
  };

  // Save active order to localStorage
  const saveActiveOrder = (orderId: string, status: string) => {
    localStorage.setItem(
      `kantin-active-order-${slug}`,
      JSON.stringify({
        orderId,
        status,
        timestamp: Date.now(),
      }),
    );
  };

  // Clear active order from localStorage
  const clearActiveOrder = () => {
    localStorage.removeItem(`kantin-active-order-${slug}`);
  };

  const STATUS_INFO: Record<
    string,
    { label: string; desc: string; color: string; step: number }
  > = {
    pending: {
      label: "Menunggu konfirmasi",
      desc: "Pesanan kamu sedang menunggu dikonfirmasi penjual",
      color: "text-yellow-600",
      step: 1,
    },
    preparing: {
      label: "Sedang diproses",
      desc: "Penjual sedang menyiapkan pesanan kamu",
      color: "text-blue-600",
      step: 2,
    },
    ready: {
      // label: "Siap diambil!",
      // desc: "Pesanan kamu sudah siap, silakan ambil",
      label: "Sedang diantar",
      desc: "Pesanan kamu sedang diantar ke meja kamu",
      color: "text-green-600",
      step: 3,
    },
    done: {
      label: "Selesai",
      desc: "Pesanan sudah selesai, terima kasih!",
      color: "text-gray-500",
      step: 4,
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Memuat...</p>
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-gray-400 text-sm">
            {error || "Restoran tidak ditemukan"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-brand-500 px-6 pt-10 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-4">
            <span className="text-brand-500 font-bold text-lg">
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
                      STATUS_INFO[orderStatus].step >= i + 1
                        ? "bg-brand-500 text-white"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {i + 1}
                  </div>
                  {i < 3 && (
                    <div
                      className={`h-0.5 flex-1 ${
                        STATUS_INFO[orderStatus].step > i + 1
                          ? "bg-brand-500"
                          : "bg-gray-100"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="text-center">
              <p
                className={`text-lg font-medium mb-2 ${STATUS_INFO[orderStatus].color}`}
              >
                {STATUS_INFO[orderStatus].label}
              </p>
              <p className="text-sm text-gray-500">
                {STATUS_INFO[orderStatus].desc}
              </p>
            </div>

            {orderStatus === "done" && (
              <button
                onClick={() => {
                  clearActiveOrder();
                  setStep("menu");
                  setOrderId(null);
                }}
                className="w-full mt-6 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                Pesan lagi
              </button>
            )}
          </div>
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
              <span className="text-brand-500">{formatPrice(total())}</span>
            </div>

            {/* Name input */}
            <div className="flex flex-col gap-1.5 mb-5">
              <label className="text-xs text-gray-500 font-medium">
                Nama kamu <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Masukkan nama kamu"
                className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
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
                  className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
                />
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2 mb-4">
                {error}
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={
                submitting || !restaurant.is_open || !customerName.trim()
              }
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
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
          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
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
                    <p className="text-xs text-brand-500 mt-0.5">
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
                <span className="text-sm font-medium text-brand-500">
                  {formatPrice(total())}
                </span>
              </div>

              <button
                onClick={() => setStep("checkout")}
                className="w-full bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-3 rounded-xl transition-colors"
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
          {/* Category filter */}
          <div className="flex gap-2 px-4 py-4 overflow-x-auto">
            <button
              onClick={() => setActiveCategory("all")}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                activeCategory === "all"
                  ? "bg-brand-500 text-white"
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
                    ? "bg-brand-500 text-white"
                    : "bg-white border border-gray-200 text-gray-600"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Menu list */}
          <div className="px-4 flex flex-col gap-3 pb-32">
            {filteredMenu.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
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
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-20 h-20 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-gray-300 text-xs">
                        foto
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-sm font-medium text-brand-500">
                          {formatPrice(item.price)}
                        </span>
                        {cartItem ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                updateQuantity(item.id, cartItem.quantity - 1)
                              }
                              className="w-7 h-7 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm"
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
                              className="w-7 h-7 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm"
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
                            className="w-7 h-7 rounded-full bg-brand-500 hover:bg-brand-600 disabled:opacity-30 text-white flex items-center justify-center text-sm transition-colors"
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

          {/* Cart bar — sticky bottom */}
          {cartCount > 0 && (
            <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-2 bg-linear-to-t from-gray-50">
              <div className="max-w-lg mx-auto">
                <button
                  onClick={() => setStep("cart")}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded-xl py-3.5 flex items-center justify-between px-5 transition-colors"
                >
                  <span className="bg-white bg-opacity-20 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                    {cartCount} item
                  </span>
                  <span className="text-sm font-medium">Lihat keranjang</span>
                  <span className="text-sm font-medium">
                    {formatPrice(total())}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
