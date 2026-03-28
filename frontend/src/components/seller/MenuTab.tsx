import { useEffect, useState } from "react";
import {
  getSellerMenu,
  getCategories,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  createCategory,
} from "../../lib/api";

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  is_available: boolean;
  category_id: string;
  category: Category | null;
}

const emptyForm = {
  name: "",
  description: "",
  price: 0,
  image_url: "",
  category_id: "",
  is_available: true,
};

export default function MenuTab({ token }: { token: string }) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [newCategory, setNewCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);

  const fetchAll = async () => {
    try {
      const [menuData, catData] = await Promise.all([
        getSellerMenu(token),
        getCategories(token),
      ]);
      setMenu(menuData);
      setCategories(catData);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleOpenAdd = () => {
    setEditItem(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const handleOpenEdit = (item: MenuItem) => {
    setEditItem(item);
    setForm({
      name: item.name,
      description: item.description || "",
      price: item.price,
      image_url: item.image_url || "",
      category_id: item.category_id || "",
      is_available: item.is_available,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editItem) {
        await updateMenuItem(token, editItem.id, form);
      } else {
        await createMenuItem(token, form);
      }
      setShowForm(false);
      fetchAll();
    } catch {
      alert("Gagal menyimpan menu");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus menu ini?")) return;
    try {
      await deleteMenuItem(token, id);
      fetchAll();
    } catch {
      alert("Gagal menghapus menu");
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    try {
      await createCategory(token, newCategory.trim());
      setNewCategory("");
      fetchAll();
    } catch {
      alert("Gagal menambah kategori");
    }
  };

  const handleToggleAvailable = async (item: MenuItem) => {
    try {
      await updateMenuItem(token, item.id, {
        is_available: !item.is_available,
      });
      fetchAll();
    } catch {
      alert("Gagal mengupdate status");
    }
  };

  if (loading)
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        Memuat menu...
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {/* Categories */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-sm font-medium text-gray-900 mb-3">Kategori</p>
        <div className="flex items-center gap-2 flex-wrap">
          {categories.map((cat) => (
            <span
              key={cat.id}
              className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full"
            >
              {cat.name}
            </span>
          ))}
          <form
            onSubmit={handleAddCategory}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="+ Tambah kategori"
              className="text-xs border border-gray-200 rounded-full px-3 py-1.5 outline-none focus:border-brand-500 transition-colors w-36"
            />
            <button
              type="submit"
              className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-full hover:bg-brand-600 transition-colors"
            >
              Tambah
            </button>
          </form>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{menu.length} menu terdaftar</p>
        <button
          onClick={handleOpenAdd}
          className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Tambah menu
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">
            {editItem ? "Edit menu" : "Tambah menu baru"}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-500 font-medium">
                Nama menu
              </label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nasi Gudeg Komplit"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-500 font-medium">
                Harga (Rp)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.price ? formatPrice(form.price) : ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setForm({
                    ...form,
                    price: raw ? Number(raw) : 0,
                  });
                }}
                placeholder="Rp 22.000"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
              />
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
                placeholder="Gudeg, ayam, telur, krecek"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-500 font-medium">
                Kategori
              </label>
              <select
                value={form.category_id}
                onChange={(e) =>
                  setForm({ ...form, category_id: e.target.value })
                }
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
              >
                <option value="">Tanpa kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-gray-500 font-medium">
                URL foto (opsional)
              </label>
              <input
                type="text"
                value={form.image_url}
                onChange={(e) =>
                  setForm({ ...form, image_url: e.target.value })
                }
                placeholder="https://..."
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
              />
            </div>
            <div className="col-span-2 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_available}
                  onChange={(e) =>
                    setForm({ ...form, is_available: e.target.checked })
                  }
                  className="accent-brand-500"
                />
                <span className="text-sm text-gray-600">Tersedia</span>
              </label>
              <div className="flex gap-3">
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
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {submitting ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Menu list */}
      {menu.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl py-12 text-center text-gray-400 text-sm">
          Belum ada menu — tambahkan menu pertama kamu!
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs text-gray-400 font-medium px-6 py-3">
                  Menu
                </th>
                <th className="text-left text-xs text-gray-400 font-medium px-6 py-3">
                  Kategori
                </th>
                <th className="text-left text-xs text-gray-400 font-medium px-6 py-3">
                  Harga
                </th>
                <th className="text-left text-xs text-gray-400 font-medium px-6 py-3">
                  Status
                </th>
                <th className="text-left text-xs text-gray-400 font-medium px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {menu.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-xs">
                          foto
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {item.name}
                        </p>
                        {item.description && (
                          <p className="text-xs text-gray-400">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-gray-500">
                      {item.category?.name || "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900">
                      {formatPrice(item.price)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleAvailable(item)}
                      className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                        item.is_available
                          ? "bg-green-50 text-green-600 hover:bg-green-100"
                          : "bg-red-50 text-red-500 hover:bg-red-100"
                      }`}
                    >
                      {item.is_available ? "Tersedia" : "Habis"}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
