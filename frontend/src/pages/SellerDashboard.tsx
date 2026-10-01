import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, LogOut } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { getMyRestaurant } from "../lib/api";
import OrdersTab from "../components/seller/OrdersTab";
import MenuTab from "../components/seller/MenuTab";
import CashierTab from "../components/seller/CashierTab";
import QRTab from "../components/seller/QRTab";
import SettingsTab from "../components/seller/SettingsTab";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  mode: string;
  is_open: boolean;
  require_otp: boolean;
  enable_table_number: boolean;
}

type Tab = "orders" | "cashier" | "menu" | "qr" | "settings";

// Gradasi tepi kiri-kanan untuk kontainer tab yang bisa digeser. Mask menempel
// pada box elemen (tidak ikut ter-scroll), sehingga tepi selalu memudar dan
// memberi sinyal jelas bahwa masih ada tab yang bisa digeser.
const EDGE_FADE =
  "linear-gradient(to right, transparent 0, black 14px, black calc(100% - 14px), transparent 100%)";

export default function SellerDashboard() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const userType = useAuthStore((s) => s.userType);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [loading, setLoading] = useState(true);
  const [notifPermission, setNotifPermission] = useState(
    Notification.permission,
  );

  // Kontainer scroll tab + tombol tab aktif — dipakai untuk menjamin tab
  // aktif selalu terlihat penuh (tidak terpotong di tepi viewport).
  const tabScrollerRef = useRef<HTMLDivElement>(null);
  const tabButtonRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>(
    {},
  );

  useEffect(() => {
    if (!token || userType !== "seller") {
      navigate("/login", { replace: true });
      return;
    }
    fetchRestaurant();
  }, [token, userType]);

  // Tab aktif di-scroll ke tengah viewport (inline: "center") HANYA bila
  // posisinya belum terlihat penuh — saat load pertama tidak ikut bergeser.
  // Guard typeof: jsdom tidak mengimplementasikan scrollIntoView.
  useEffect(() => {
    const el = tabButtonRefs.current[activeTab];
    const scroller = tabScrollerRef.current;
    if (!el || !scroller || typeof el.scrollIntoView !== "function") return;
    const area = scroller.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const fullyVisible =
      rect.left >= area.left + 4 && rect.right <= area.right - 4;
    if (!fullyVisible) {
      el.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [activeTab]);

  useEffect(() => {
    if (restaurant?.mode === "cashier" && activeTab === "qr") {
      setActiveTab("orders");
    }
  }, [restaurant]);

  const fetchRestaurant = async () => {
    try {
      const data = await getMyRestaurant(token!);
      setRestaurant(data);
    } catch {
      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    );
  }

  const allTabs = [
    { id: "orders" as Tab, label: "Orders", showOn: ["full", "cashier"] },
    { id: "cashier" as Tab, label: "Kasir", showOn: ["full", "cashier"] },
    { id: "menu" as Tab, label: "Menu", showOn: ["full", "cashier"] },
    { id: "qr" as Tab, label: "QR Meja", showOn: ["full"] },
    { id: "settings" as Tab, label: "Pengaturan", showOn: ["full", "cashier"] },
  ];

  const tabs = allTabs.filter((t) =>
    t.showOn.includes(restaurant?.mode || "full"),
  );

  const requestNotifPermission = async () => {
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Avatar inisial tenant — header dashboard adalah ruang tenant,
                bukan ruang brand platform (logo Kantin tetap di landing/login) */}
            <div
              className="w-8 h-8 shrink-0 rounded-lg bg-brand-700 text-white flex items-center justify-center text-sm font-semibold uppercase"
              aria-hidden="true"
            >
              {(restaurant?.name || "?").trim().charAt(0)}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-medium text-gray-900 truncate">
                {restaurant?.name}
              </h1>
              <p className="text-xs text-gray-500 truncate hidden sm:block">
                kantin.app/r/{restaurant?.slug}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Status buka/tutup — semua ukuran */}
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                restaurant?.is_open
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {restaurant?.is_open ? "Buka" : "Tutup"}
            </span>

            {/* Notifikasi — icon saja di mobile, teks di desktop */}
            {notifPermission === "granted" ? (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full hidden sm:inline">
                Notifikasi aktif
              </span>
            ) : (
              <button
                onClick={requestNotifPermission}
                className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-full whitespace-nowrap"
                title="Aktifkan notifikasi"
              >
                <span className="hidden sm:inline">Aktifkan notifikasi</span>
                <Bell className="sm:hidden w-4 h-4" />
              </button>
            )}

            {/* Logout icon */}
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
              title="Keluar"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs — scrollable di mobile, dengan affordance fade tepi kiri-kanan
          supaya terlihat jelas "bisa digeser" (bukan teks rusak) */}
      <div
        ref={tabScrollerRef}
        className="bg-white border-b border-gray-100 overflow-x-auto"
        style={{
          scrollPaddingInline: "16px",
          WebkitMaskImage: EDGE_FADE,
          maskImage: EDGE_FADE,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="flex gap-1 min-w-max md:min-w-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                ref={(el) => {
                  tabButtonRefs.current[tab.id] = el;
                }}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-brand-700 text-brand-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content — semua tab di dalam satu container */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {activeTab === "orders" && <OrdersTab token={token!} />}
        {activeTab === "cashier" && (
          <CashierTab token={token!} restaurantName={restaurant?.name || ""} />
        )}
        {activeTab === "menu" && <MenuTab token={token!} />}
        {activeTab === "qr" && (
          <QRTab
            token={token!}
            slug={restaurant?.slug || ""}
            restaurantName={restaurant?.name || ""}
          />
        )}
        {activeTab === "settings" && restaurant && (
          <SettingsTab
            token={token!}
            restaurant={restaurant}
            onUpdate={fetchRestaurant}
          />
        )}
      </div>
    </div>
  );
}
