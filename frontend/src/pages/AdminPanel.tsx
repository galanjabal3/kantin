import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import {
  getAllRestaurants,
  createRestaurant,
  updateRestaurant,
} from "../lib/api";
import { errorMessage } from "../lib/errorMessage";
import toast from "react-hot-toast";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  description: string;
  mode: string;
  is_active: boolean;
  is_open: boolean;
}

// Toggle buka/tutup resto (is_open). Kontras non-teks: track hijau-600 /
// abu-500 terhadap kartu putih ≥ 3:1, knob putih terhadap track ≥ 3:1;
// label teks hijau-700 (5.02:1) / merah-600 (4.83:1) ≥ 4.5:1.
function OpenToggle({
  restaurant,
  busy,
  onToggle,
}: {
  restaurant: Restaurant;
  busy: boolean;
  onToggle: (r: Restaurant) => void;
}) {
  const open = restaurant.is_open;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={open}
      aria-label={`Buka/tutup ${restaurant.name}`}
      disabled={busy}
      onClick={() => onToggle(restaurant)}
      className="flex items-center gap-2 shrink-0"
    >
      <span
        className={`text-xs font-medium ${open ? "text-green-700" : "text-red-600"}`}
      >
        {open ? "Buka" : "Tutup"}
      </span>
      <span
        className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors ${
          open ? "bg-green-600" : "bg-gray-500"
        } ${busy ? "opacity-50" : ""}`}
      >
        <span
          className={`inline-block w-4 h-4 bg-white rounded-full transition-transform ${
            open ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const { token, userType, clearAuth } = useAuthStore();

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // id resto yang sedang di-toggle — mencegah klik ganda saat request jalan
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    mode: "full",
    seller_email: "",
    seller_password: "",
  });

  useEffect(() => {
    if (!token || userType !== "admin") {
      navigate("/login");
      return;
    }
    fetchRestaurants();
  }, []);

  const fetchRestaurants = async () => {
    try {
      const data = await getAllRestaurants(token!);
      setRestaurants(data);
    } catch {
      setError("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  // handleCreate
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createRestaurant(token!, form);
      toast.success("Restoran berhasil didaftarkan!");
      setShowForm(false);
      setForm({
        name: "",
        description: "",
        mode: "full",
        seller_email: "",
        seller_password: "",
      });
      fetchRestaurants();
    } catch (err) {
      toast.error(errorMessage(err, "Gagal membuat restoran"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/login");
  };

  // Toggle buka/tutup resto — optimistik: status langsung berubah di UI,
  // kalau PUT gagal dikembalikan seperti semula + toast error.
  const handleToggleOpen = async (r: Restaurant) => {
    if (togglingId) return;
    const next = !r.is_open;
    setTogglingId(r.id);
    setRestaurants((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, is_open: next } : x)),
    );
    try {
      await updateRestaurant(token!, r.id, { is_open: next });
      toast.success(next ? `${r.name} dibuka` : `${r.name} ditutup`);
    } catch (err) {
      setRestaurants((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, is_open: !next } : x)),
      );
      toast.error(errorMessage(err, "Gagal mengubah status restoran"));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-700 rounded-lg flex items-center justify-center">
            {/* <span className="text-white text-sm font-bold">K</span> */}
            <img src="/logo.svg" alt="Kantin" className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-sm font-medium text-gray-900">Kantin Admin</h1>
            <p className="text-xs text-gray-500">Panel administrasi</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-gray-500 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
          title="Keluar"
        >
          <LogOut size={18} />
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Title + Add button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-medium text-gray-900">
              Daftar restoran
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {restaurants.length} restoran terdaftar
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-brand-700 hover:bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Daftarkan resto
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* Form tambah resto */}
        {showForm && (
          <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
            <h3 className="text-base font-medium text-gray-900 mb-4">
              Daftarkan restoran baru
            </h3>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-500 font-medium">
                  Nama restoran
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Warung Bu Siti"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-600 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-500 font-medium">
                  Mode
                </label>
                <select
                  value={form.mode}
                  onChange={(e) => setForm({ ...form, mode: e.target.value })}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-600 transition-colors"
                >
                  <option value="full">Full app</option>
                  <option value="cashier">Kasir only</option>
                </select>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs text-gray-500 font-medium">
                  Deskripsi
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Masakan rumahan khas Jawa Tengah"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-600 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-500 font-medium">
                  Email seller
                </label>
                <input
                  type="email"
                  required
                  value={form.seller_email}
                  onChange={(e) =>
                    setForm({ ...form, seller_email: e.target.value })
                  }
                  placeholder="seller@email.com"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-600 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-500 font-medium">
                  Password seller
                </label>
                <input
                  type="password"
                  required
                  value={form.seller_password}
                  onChange={(e) =>
                    setForm({ ...form, seller_password: e.target.value })
                  }
                  placeholder="••••••••"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-600 transition-colors"
                />
              </div>
              <div className="col-span-2 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {submitting ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            Memuat data...
          </div>
        ) : restaurants.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            Belum ada restoran terdaftar
          </div>
        ) : (
          <>
            {/* Mobile: kartu bertumpuk (tabel tidak muat di 390px) */}
            <div className="block md:hidden">
              {restaurants.map((r) => (
                <div
                  key={r.id}
                  className="bg-white border border-gray-100 rounded-xl p-4 mb-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 min-w-0">
                      {r.name}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        r.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {r.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                  {r.description && (
                    <p className="text-xs text-gray-500 mt-1">{r.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs font-mono bg-blue-50 text-blue-600 px-2 py-1 rounded-md">
                      /r/{r.slug}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${
                        r.mode === "full"
                          ? "bg-purple-50 text-purple-600"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {r.mode === "full" ? "Full app" : "Kasir only"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-gray-50">
                    <span className="text-xs text-gray-500">Buka/tutup</span>
                    <OpenToggle
                      restaurant={r}
                      busy={togglingId === r.id}
                      onToggle={handleToggleOpen}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: tabel */}
            <div className="hidden md:block bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">
                    Nama
                  </th>
                  <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">
                    URL
                  </th>
                  <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">
                    Mode
                  </th>
                  <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs text-gray-500 font-medium px-6 py-3">
                    Buka/tutup
                  </th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {r.name}
                      </div>
                      {r.description && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {r.description}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono bg-blue-50 text-blue-600 px-2 py-1 rounded-md">
                        /r/{r.slug}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          r.mode === "full"
                            ? "bg-purple-50 text-purple-600"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {r.mode === "full" ? "Full app" : "Kasir only"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          r.is_active
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {r.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <OpenToggle
                        restaurant={r}
                        busy={togglingId === r.id}
                        onToggle={handleToggleOpen}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
