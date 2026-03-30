import { useState } from "react";
import toast from "react-hot-toast";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  is_open: boolean;
  require_otp: boolean;
  enable_table_number: boolean;
  mode: string;
}

interface SettingsTabProps {
  token: string;
  restaurant: Restaurant;
  onUpdate: () => void;
}

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function SettingsTab({
  token,
  restaurant,
  onUpdate,
}: SettingsTabProps) {
  const [saving, setSaving] = useState(false);

  const updateSetting = async (field: string, value: boolean) => {
    setSaving(true);
    try {
      await fetch(`${BASE_URL}/api/seller/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [field]: value }),
      });
      onUpdate();
      setTimeout(() => toast.success("Pengaturan tersimpan!"), 500);
    } catch {
      toast.error("Gagal menyimpan pengaturan");
    } finally {
      setSaving(false);
    }
  };

  const settings = [
    {
      field: "is_open",
      label: "Status restoran",
      desc: "Buka atau tutup restoran — customer tidak bisa order saat tutup",
      value: restaurant.is_open,
      showOn: ["full", "cashier"], // tampil di semua mode
    },
    {
      field: "enable_table_number",
      label: "Nomor meja",
      desc: "Tampilkan input nomor meja di halaman checkout customer",
      value: restaurant.enable_table_number,
      showOn: ["full"], // hanya full app
    },
  ];

  // Tambah state
  const [printerSize, setPrinterSize] = useState<"58mm" | "80mm">(
    () =>
      (localStorage.getItem("kantin-printer-size") as "58mm" | "80mm") ||
      "80mm",
  );

  const handlePrinterSize = (size: "58mm" | "80mm") => {
    setPrinterSize(size);
    localStorage.setItem("kantin-printer-size", size);
  };

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      {/* URL Info */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-sm font-medium text-gray-900 mb-3">Info restoran</p>
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-sm font-medium text-gray-900 mb-1">
            Ukuran printer thermal
          </p>
          <p className="text-xs text-gray-400 mb-4">
            Pilih sesuai lebar kertas printer kamu
          </p>
          <div className="flex gap-3">
            {(["58mm", "80mm"] as const).map((size) => (
              <button
                key={size}
                onClick={() => handlePrinterSize(size)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  printerSize === size
                    ? "bg-brand-500 text-white border-brand-500"
                    : "bg-white text-gray-600 border-gray-200 hover:border-brand-300"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">URL customer</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                /r/{restaurant.slug}
              </span>
              {restaurant.mode === "cashier" && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  tidak aktif
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-400">Mode</span>
            <span
              className={`text-xs px-2 py-0.5 rounded font-medium ${
                restaurant.mode === "full"
                  ? "bg-purple-50 text-purple-600"
                  : "bg-amber-50 text-amber-600"
              }`}
            >
              {restaurant.mode === "full" ? "Full app" : "Kasir only"}
            </span>
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {settings
          .filter((s) => s.showOn.includes(restaurant.mode))
          .map((s, i) => (
            <div
              key={s.field}
              className={`flex items-center justify-between p-5 ${
                i < settings.length - 1 ? "border-b border-gray-50" : ""
              }`}
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{s.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
              </div>
              <button
                onClick={() => updateSetting(s.field, !s.value)}
                disabled={saving}
                className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors shrink-0 ml-4 ${
                  s.value ? "bg-brand-500" : "bg-gray-200"
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block w-4 h-4 bg-white rounded-full transition-transform ${
                    s.value ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
