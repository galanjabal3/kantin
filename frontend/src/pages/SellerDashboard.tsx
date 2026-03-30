import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

  useEffect(() => {
    if (!token || userType !== "seller") {
      navigate("/login", { replace: true });
      return;
    }
    fetchRestaurant();
  }, [token, userType]);

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
        <p className="text-gray-400 text-sm">Memuat...</p>
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
            <img src="/logo.svg" alt="Kantin" className="w-8 h-8 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-medium text-gray-900 truncate">
                {restaurant?.name}
              </h1>
              <p className="text-xs text-gray-400 truncate hidden sm:block">
                kantin.app/r/{restaurant?.slug}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Status buka/tutup — semua ukuran */}
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                restaurant?.is_open
                  ? "bg-green-50 text-green-600"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {restaurant?.is_open ? "Buka" : "Tutup"}
            </span>

            {/* Notifikasi — icon saja di mobile, teks di desktop */}
            {notifPermission === "granted" ? (
              <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded-full hidden sm:inline">
                Notifikasi aktif
              </span>
            ) : (
              <button
                onClick={requestNotifPermission}
                className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-1 rounded-full whitespace-nowrap"
                title="Aktifkan notifikasi"
              >
                <span className="hidden sm:inline">Aktifkan notifikasi</span>
                <span className="sm:hidden">🔔</span>
              </button>
            )}

            {/* Logout icon */}
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
              title="Keluar"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs — scrollable di mobile */}
      <div className="bg-white border-b border-gray-100 overflow-x-auto">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="flex gap-1 min-w-max md:min-w-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-brand-500 text-brand-500"
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
        {activeTab === "cashier" && <CashierTab token={token!} />}
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
