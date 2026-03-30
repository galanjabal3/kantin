import { useEffect, useState, useRef } from "react";
import {
  getSellerMenu,
  getCategories,
  createCashierOrder,
} from "../../lib/api";
import toast from "react-hot-toast";

interface Category {
  id: string;
  name: string;
}
interface MenuItem {
  id: string;
  name: string;
  price: number;
  image_url: string;
  is_available: boolean;
  category_id: string;
}
interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export default function CashierTab({ token }: { token: string }) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [customerName, setCustomerName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [menuData, catData] = await Promise.all([
          getSellerMenu(token),
          getCategories(token),
        ]);
        setMenu(menuData);
        setCategories(catData);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        { id: item.id, name: item.name, price: item.price, quantity: 1 },
      ];
    });
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.id !== id));
    } else {
      setCart((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity: qty } : i)),
      );
    }
  };

  const handleOrder = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const order = await createCashierOrder(token, {
        customer_name: customerName || null,
        table_number: tableNumber || null,
        source: "cashier",
        items: cart.map((i) => ({ menu_item_id: i.id, quantity: i.quantity })),
      });
      toast.success("Pesanan berhasil dibuat!");
      setLastOrder({ ...order, cartSnapshot: cart, customerName, tableNumber });
      setCart([]);
      setCustomerName("");
      setTableNumber("");

      // Baca ukuran printer dari localStorage
      const printerSize = localStorage.getItem("kantin-printer-size") || "58mm";

      // Inject @page size sebelum print
      const style = document.createElement("style");
      style.id = "print-size-override";
      style.innerHTML = `
      @media print {
        @page { size: ${printerSize} auto; margin: 0; }
        body { width: ${printerSize}; }
      }
    `;
      // Hapus style lama kalau ada
      document.getElementById("print-size-override")?.remove();
      document.head.appendChild(style);

      setTimeout(() => window.print(), 3001);
    } catch {
      toast.error("Gagal membuat pesanan");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredMenu =
    activeCategory === "all"
      ? menu.filter((m) => m.is_available)
      : menu.filter((m) => m.is_available && m.category_id === activeCategory);

  if (loading)
    return (
      <div className="text-center py-12 text-gray-400 text-sm">Memuat...</div>
    );

  return (
    <>
      {/* Print struk — hidden saat normal, muncul saat print */}
      {lastOrder && (
        <div
          ref={printRef}
          className="hidden print:block print:fixed print:inset-0 print:bg-white print:p-4"
          style={{ fontFamily: "monospace" }}
        >
          <div style={{ width: "280px", margin: "0 auto" }}>
            <p
              style={{
                textAlign: "center",
                fontWeight: "bold",
                fontSize: "16px",
              }}
            >
              KANTIN
            </p>
            <p style={{ textAlign: "center", fontSize: "12px" }}>
              Struk Pesanan
            </p>
            <p
              style={{
                textAlign: "center",
                fontSize: "11px",
                marginBottom: "8px",
              }}
            >
              {new Date().toLocaleString("id-ID")}
            </p>
            <hr style={{ borderStyle: "dashed" }} />
            {lastOrder.customerName && (
              <p style={{ fontSize: "12px", margin: "6px 0" }}>
                Nama: {lastOrder.customerName}
              </p>
            )}
            {lastOrder.tableNumber && (
              <p style={{ fontSize: "12px", margin: "6px 0" }}>
                Meja: {lastOrder.tableNumber}
              </p>
            )}
            <hr style={{ borderStyle: "dashed" }} />
            {lastOrder.cartSnapshot.map((item: CartItem) => (
              <div
                key={item.id}
                style={{ fontSize: "12px", marginBottom: "4px" }}
              >
                <p>{item.name}</p>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span style={{ color: "#666" }}>
                    {item.quantity} x {formatPrice(item.price)}
                  </span>
                  <span>{formatPrice(item.price * item.quantity)}</span>
                </div>
              </div>
            ))}
            <hr style={{ borderStyle: "dashed" }} />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: "bold",
                fontSize: "14px",
                margin: "6px 0",
              }}
            >
              <span>TOTAL</span>
              <span>{formatPrice(lastOrder.total_price)}</span>
            </div>
            <hr style={{ borderStyle: "dashed" }} />
            <p
              style={{
                textAlign: "center",
                fontSize: "11px",
                marginTop: "8px",
              }}
            >
              Terima kasih!
            </p>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_320px] gap-6 print:hidden">
        {/* <div className="grid grid-cols-[1fr_320px] gap-6 print:hidden"> */}
        {/* Left — Menu grid */}
        <div>
          {/* Category filter */}
          {/* <div className="flex gap-2 mb-4 flex-wrap"> */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 flex-nowrap">
            <button
              onClick={() => setActiveCategory("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeCategory === cat.id
                    ? "bg-brand-500 text-white"
                    : "bg-white border border-gray-200 text-gray-600"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Menu grid */}
          <div className="flex flex-col gap-2 lg:grid lg:grid-cols-3 lg:gap-3">
            {filteredMenu.map((item) => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="bg-white border border-gray-100 rounded-xl p-3 text-left hover:border-brand-300 hover:bg-brand-50 transition-all flex items-center gap-3 lg:flex-col lg:items-start lg:p-4"
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-14 h-14 lg:w-full lg:h-24 object-cover rounded-lg flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 lg:w-full lg:h-24 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center text-gray-300 text-xs">
                    foto
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 mb-0.5 line-clamp-2 text-left">
                    {item.name}
                  </p>
                  <p className="text-sm text-brand-500 font-medium">
                    {formatPrice(item.price)}
                  </p>
                </div>
              </button>
            ))}
            {filteredMenu.length === 0 && (
              <div className="col-span-3 py-12 text-center text-gray-400 text-sm">
                Tidak ada menu tersedia
              </div>
            )}
          </div>
        </div>

        {/* Right — Cart panel */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 flex flex-col gap-4 lg:h-fit lg:sticky lg:top-6">
          <p className="text-sm font-medium text-gray-900">Pesanan aktif</p>

          {cart.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">
              Tap menu untuk menambahkan pesanan
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2"
                >
                  <p className="text-xs text-gray-700 flex-1 min-w-0 truncate">
                    {item.name}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => updateQty(item.id, item.quantity - 1)}
                      className="w-6 h-6 rounded-full border border-gray-200 text-gray-500 flex items-center justify-center text-sm hover:bg-gray-50"
                    >
                      −
                    </button>
                    <span className="text-xs font-medium w-4 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.id, item.quantity + 1)}
                      className="w-6 h-6 rounded-full border border-gray-200 text-gray-500 flex items-center justify-center text-sm hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <hr className="border-gray-100" />

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Total</span>
            <span className="text-sm font-medium text-brand-500">
              {formatPrice(total)}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nama customer"
              className="px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-brand-500 transition-colors"
            />
            <input
              type="text"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="Nomor meja"
              className="px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          <button
            onClick={handleOrder}
            disabled={cart.length === 0 || submitting}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {submitting ? "Memproses..." : "Buat pesanan + cetak struk"}
          </button>

          {lastOrder && (
            <button
              onClick={() => window.print()}
              className="w-full border border-brand-500 text-brand-500 hover:bg-brand-50 text-sm py-2 rounded-lg transition-colors"
            >
              Print ulang struk
            </button>
          )}
        </div>
      </div>
    </>
  );
}
