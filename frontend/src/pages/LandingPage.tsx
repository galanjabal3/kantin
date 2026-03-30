import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function LandingPage() {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  const ADMIN_WHATSAPP = import.meta.env.VITE_ADMIN_WHATSAPP || "6281234567890";
  // const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || "admin@kantin.app";

  const waLink = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(
    "Halo, saya ingin mendaftarkan restoran saya di Kantin. Mohon info lebih lanjut.",
  )}`;

  const features = [
    {
      icon: "⚡",
      title: "Order cepat",
      desc: "Scan QR meja, pilih menu, checkout — selesai",
    },
    {
      icon: "🧾",
      title: "Struk otomatis",
      desc: "Cetak struk thermal langsung dari browser",
    },
    {
      icon: "📊",
      title: "Dashboard seller",
      desc: "Kelola menu, terima order, update status real-time",
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Modal pendaftaran */}
      {showModal && (
        <div
          className="absolute inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center mb-4 text-2xl">
              🍽️
            </div>
            <h2
              className="text-xl text-gray-900 mb-2"
              style={{ fontFamily: "Playfair Display, serif" }}
            >
              Daftarkan restoranmu
            </h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Pendaftaran resto dilakukan melalui admin Kantin. Hubungi kami via
              WhatsApp atau email di bawah ini.
            </p>
            <div className="flex flex-col gap-3">
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-3 rounded-xl text-center transition-colors flex items-center justify-center gap-2"
              >
                Hubungi via WhatsApp
              </a>
              {/* <a
                href={`mailto:${ADMIN_EMAIL}?subject=Pendaftaran Resto Kantin`}
                className="w-full border border-gray-200 hover:border-gray-300 text-gray-600 text-sm font-medium py-3 rounded-xl text-center transition-colors"
              >
                Kirim email ke {ADMIN_EMAIL}
              </a> */}
            </div>
            <button
              onClick={() => setShowModal(false)}
              className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Navbar — tidak berubah */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-100 max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
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
        <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-600 text-xs font-medium px-3 py-1.5 rounded-full mb-6 border border-orange-100">
          Multi-tenant food ordering platform
        </div>
        <h1
          className="text-5xl text-gray-900 mb-6 leading-tight"
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
          {/* ← INI YANG BERUBAH */}
          <button
            onClick={() => setShowModal(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            Daftarkan resto kamu
          </button>
          <button
            onClick={() => navigate("/r/warung-bu-siti")}
            className="border border-gray-200 hover:border-gray-300 text-gray-600 px-6 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            Lihat demo menu →
          </button>
        </div>
      </div>

      {/* Features & Footer — tidak berubah */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-gray-50 rounded-2xl p-6">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-xl mb-4 border border-gray-100">
                {f.icon}
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
        <p className="text-xs text-gray-400">
          Kantin — Multi-tenant food ordering platform
        </p>
      </div>
    </div>
  );
}
