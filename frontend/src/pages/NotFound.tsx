export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-brand-500">404</h1>
        <p className="text-gray-500 mt-4">Halaman tidak ditemukan</p>
        <a href="/" className="text-brand-500 mt-4 inline-block">
          Kembali ke beranda
        </a>
      </div>
    </div>
  )
}