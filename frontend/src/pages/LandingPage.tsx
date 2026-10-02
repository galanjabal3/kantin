import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Receipt, Zap } from "lucide-react";
import WhatsAppModal from "../components/shared/WhatsAppModal";
import {
  DEMO_MODAL,
  REGISTER_MODAL,
  type WaModalContent,
} from "../lib/whatsapp";

export default function LandingPage() {
  const navigate = useNavigate();
  const [modal, setModal] = useState<WaModalContent | null>(null);

  const features = [
    {
      icon: Zap,
      title: "Order cepat",
      desc: "Scan QR meja, pilih menu, checkout — selesai",
    },
    {
      icon: Receipt,
      title: "Struk otomatis",
      desc: "Cetak struk thermal langsung dari browser",
    },
    {
      icon: BarChart3,
      title: "Dashboard seller",
      desc: "Kelola menu, terima order, update status real-time",
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Modal WhatsApp (pendaftaran resto / minta akun demo) */}
      {modal && (
        <WhatsAppModal content={modal} onClose={() => setModal(null)} />
      )}

      {/* Navbar — tidak berubah */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-100 max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-700 rounded-lg flex items-center justify-center">
            {/* <span className="text-white font-bold text-sm">K</span> */}
            <img src="/logo.svg" alt="Kantin" className="w-8 h-8" />
          </div>
          <span
            className="font-medium text-gray-900"
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            Kantin
          </span>
        </div>
        <button
          onClick={() => navigate("/login")}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Masuk sebagai seller →
        </button>
      </nav>

      {/* Hero — hanya tombol pertama yang berubah */}
      <div className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-full mb-6 border border-orange-100">
          Multi-tenant food ordering platform
        </div>
        <h1
          className="text-4xl sm:text-5xl text-gray-900 mb-6 leading-tight text-balance"
          style={{ fontFamily: "Playfair Display, serif" }}
        >
          Pesan makanan,
          <br />
          semudah scan QR
        </h1>
        <p className="text-gray-500 text-lg mb-10 max-w-md mx-auto leading-relaxed">
          Platform pemesanan makanan untuk warung dan resto — tanpa aplikasi,
          tanpa login untuk customer.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <button
            onClick={() => setModal(REGISTER_MODAL)}
            className="bg-brand-700 hover:bg-brand-800 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            Daftarkan resto kamu
          </button>
          <button
            onClick={() => navigate("/r/kantin-demo")}
            className="border border-gray-200 hover:border-gray-300 text-gray-600 px-6 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            Lihat demo menu →
          </button>
        </div>

        {/* CTA akun demo — kredensial tidak dipublikasikan, dibagikan via WhatsApp */}
        <button
          type="button"
          onClick={() => setModal(DEMO_MODAL)}
          className="mt-10 mx-auto block text-sm font-medium text-brand-700 hover:text-brand-800 transition-colors"
        >
          Tertarik coba dashboard penjual? Minta akun demo →
        </button>
      </div>

      {/* Features & Footer — tidak berubah */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-gray-50 rounded-2xl p-6">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center mb-4 border border-gray-100">
                <f.icon className="w-5 h-5 text-brand-600" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">
                {f.title}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 py-6 text-center">
        <p className="text-xs text-gray-500">
          Kantin — Multi-tenant food ordering platform
        </p>
      </div>
    </div>
  );
}
