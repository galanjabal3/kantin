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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">K</span>
            </div>
            <div>
              <h1 className="text-sm font-medium text-gray-900">
                {restaurant?.name}
              </h1>
              <p className="text-xs text-gray-400">
                kantin.app/r/{restaurant?.slug}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                restaurant?.is_open
                  ? "bg-green-50 text-green-600"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {restaurant?.is_open ? "Buka" : "Tutup"}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Keluar
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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
