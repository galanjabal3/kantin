import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-brand-700">404</h1>
        <p className="text-gray-500 mt-4">Halaman tidak ditemukan</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            to="/"
            className="bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
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
