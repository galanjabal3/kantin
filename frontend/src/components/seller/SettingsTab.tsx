import { useState } from "react";
import toast from "react-hot-toast";
import { updateSellerSettings } from "../../lib/api";
import {
  PRINTER_SIZES,
  getPrinterSize,
  setPrinterSize as persistPrinterSize,
  type PrinterSize,
} from "../../utils/printer";

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

export default function SettingsTab({
  token,
  restaurant,
  onUpdate,
}: SettingsTabProps) {
  const [saving, setSaving] = useState(false);

  const updateSetting = async (field: string, value: boolean) => {
    setSaving(true);
    try {
      await updateSellerSettings(token, { [field]: value });
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

  // Ukuran printer — satu sumber kebenaran (utils/printer, default 58mm)
  const [printerSize, setPrinterSize] = useState<PrinterSize>(getPrinterSize);

  const handlePrinterSize = (size: PrinterSize) => {
    setPrinterSize(size);
    persistPrinterSize(size);
  };

  const visibleSettings = settings.filter((s) =>
    s.showOn.includes(restaurant.mode),
  );

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      {/* Info restoran + ukuran printer — satu panel, tanpa kartu bersarang */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="p-5">
          <p className="text-sm font-medium text-gray-900 mb-3">
            Info restoran
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center gap-3">
              <span className="text-xs text-gray-500 shrink-0">
                URL customer
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded truncate">
                  /r/{restaurant.slug}
                </span>
                {restaurant.mode === "cashier" && (
                  <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded shrink-0">
                    tidak aktif
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-xs text-gray-500 shrink-0">Mode</span>
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  restaurant.mode === "full"
                    ? "bg-purple-50 text-purple-600"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {restaurant.mode === "full" ? "Full app" : "Kasir only"}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 p-5">
          <p className="text-sm font-medium text-gray-900">
            Ukuran printer thermal
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Pilih sesuai lebar kertas printer kamu
          </p>
          <div className="flex gap-3">
            {PRINTER_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => handlePrinterSize(size)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  printerSize === size
                    ? "bg-brand-700 text-white border-brand-700"
                    : "bg-white text-gray-600 border-gray-200 hover:border-brand-300"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {visibleSettings.map((s, i) => (
          <div
            key={s.field}
            className={`flex items-center justify-between p-5 ${
              i < visibleSettings.length - 1 ? "border-b border-gray-50" : ""
            }`}
          >
            <div>
              <p className="text-sm font-medium text-gray-900">{s.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
            </div>
            <button
              onClick={() => updateSetting(s.field, !s.value)}
              disabled={saving}
              className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors shrink-0 ml-4 ${
                s.value ? "bg-brand-600" : "bg-gray-200"
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
