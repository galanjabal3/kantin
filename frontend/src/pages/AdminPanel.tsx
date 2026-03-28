import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { getAllRestaurants, createRestaurant } from '../lib/api'

interface Restaurant {
  id: string
  name: string
  slug: string
  description: string
  mode: string
  is_active: boolean
  is_open: boolean
}

export default function AdminPanel() {
  const navigate = useNavigate()
  const { token, userType, clearAuth } = useAuthStore()

  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    description: '',
    mode: 'full',
    seller_email: '',
    seller_password: '',
  })

  useEffect(() => {
    if (!token || userType !== 'admin') {
      navigate('/login')
      return
    }
    fetchRestaurants()
  }, [])

  const fetchRestaurants = async () => {
    try {
      const data = await getAllRestaurants(token!)
      setRestaurants(data)
    } catch {
      setError('Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await createRestaurant(token!, form)
      setShowForm(false)
      setForm({ name: '', description: '', mode: 'full', seller_email: '', seller_password: '' })
      fetchRestaurants()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">K</span>
          </div>
          <div>
            <h1 className="text-sm font-medium text-gray-900">Kantin Admin</h1>
            <p className="text-xs text-gray-400">Panel administrasi</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Keluar
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Title + Add button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-medium text-gray-900">Daftar restoran</h2>
            <p className="text-sm text-gray-500 mt-0.5">{restaurants.length} restoran terdaftar</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Daftarkan resto
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* Form tambah resto */}
        {showForm && (
          <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
            <h3 className="text-base font-medium text-gray-900 mb-4">Daftarkan restoran baru</h3>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-500 font-medium">Nama restoran</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Warung Bu Siti"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-500 font-medium">Mode</label>
                <select
                  value={form.mode}
                  onChange={e => setForm({ ...form, mode: e.target.value })}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
                >
                  <option value="full">Full app</option>
                  <option value="cashier">Kasir only</option>
                </select>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs text-gray-500 font-medium">Deskripsi</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Masakan rumahan khas Jawa Tengah"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-500 font-medium">Email seller</label>
                <input
                  type="email"
                  required
                  value={form.seller_email}
                  onChange={e => setForm({ ...form, seller_email: e.target.value })}
                  placeholder="seller@email.com"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-500 font-medium">Password seller</label>
                <input
                  type="password"
                  required
                  value={form.seller_password}
                  onChange={e => setForm({ ...form, seller_password: e.target.value })}
                  placeholder="••••••••"
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 transition-colors"
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
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Memuat data...</div>
        ) : restaurants.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">Belum ada restoran terdaftar</div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-400 font-medium px-6 py-3">Nama</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-6 py-3">URL</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-6 py-3">Mode</th>
                  <th className="text-left text-xs text-gray-400 font-medium px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{r.name}</div>
                      {r.description && (
                        <div className="text-xs text-gray-400 mt-0.5">{r.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono bg-blue-50 text-blue-600 px-2 py-1 rounded-md">
                        /r/{r.slug}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        r.mode === 'full'
                          ? 'bg-purple-50 text-purple-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}>
                        {r.mode === 'full' ? 'Full app' : 'Kasir only'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        r.is_active
                          ? 'bg-green-50 text-green-600'
                          : 'bg-red-50 text-red-600'
                      }`}>
                        {r.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}