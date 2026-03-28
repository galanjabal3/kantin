export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-900">
        Selamat Datang di Kantin App 🍽️
      </h1>

      <p className="text-gray-500 mt-2 text-sm">
        Pesan makanan dengan mudah & cepat
      </p>

      <div className="mt-6 flex gap-3">
        <a
          href="/login"
          className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm"
        >
          Login
        </a>

        <a
          href="/r/demo"
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
        >
          Lihat Menu
        </a>
      </div>
    </div>
  );
}
