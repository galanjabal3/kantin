# Kantin

![CI](https://github.com/galanjabal3/kantin/actions/workflows/ci.yml/badge.svg) ![License: MIT](https://img.shields.io/badge/license-MIT-7c3aed)

**Kantin** adalah platform pemesanan makanan multi-tenant untuk kantin & warung: pelanggan memindai QR di meja, memesan langsung dari HP, dan memantau status pesanan secara live, sementara penjual mengelola menu, pesanan, kasir, dan cetak struk dari satu dashboard. Setiap restoran adalah tenant tersendiri — punya slug, menu, kategori, seller, dan order sendiri — dan bisa berjalan dalam mode **full** (pemesanan online + dashboard penjual) atau **cashier** (order manual di kasir saja).

---

## ✨ Fitur Utama

### 🧑 Pelanggan (tanpa login)

- **Pesan via QR meja** — QR menyimpan URL resto + parameter `?table=N`, jadi nomor meja otomatis terisi di halaman menu.
- **Menu publik per slug** — `/r/{slug}` menampilkan info resto & menu tersedia, bisa difilter per kategori.
- **Keranjang & checkout** — keranjang persist (Zustand + localStorage), cukup isi nama (dan nomor meja bila diaktifkan).
- **Tracking live** — status pesanan di-polling tiap 5 detik: `pending → preparing → ready → done`.
- **Riwayat di perangkat** — bar "Pesanan aktif" dan riwayat pesanan per resto tersimpan di `localStorage`; *soft exit* keluar dari tracking tanpa menghapus sesi.
- **Batalkan pesanan (hanya saat masih `pending`)** — status "Dibatalkan" langsung terlihat di dashboard penjual; pembatalan di-*persist* ke server, bukan sekadar menghapus sesi di browser.
- **Toko tutup ditolak** — API menolak order baru saat resto nonaktif atau sedang ditutup.

### 🧑‍🍳 Penjual (`/dashboard`)

- **Papan pesanan real-time** — order di-refresh otomatis tiap 15 detik, lengkap dengan transisi status.
- **Notifikasi browser** — notifikasi desktop saat order `pending` baru masuk (Web Notifications API).
- **Kasir (order manual)** — order diambil di counter dan disimpan dengan `source: cashier`, termasuk nomor meja & nama pelanggan.
- **Cetak struk thermal** — via `window.print()`, lebar kertas 58mm / 80mm (tersimpan di `localStorage`).
- **Manajemen menu & kategori** — CRUD penuh (nama, deskripsi, harga, gambar, ketersediaan); menu dengan riwayat transaksi di-*soft delete* agar data order lama tidak rusak.
- **QR meja** — generate & cetak QR per meja (satu lembar untuk banyak meja) yang mengarah ke `/r/{slug}?table=N`.
- **Pengaturan resto** — buka/tutup, tampilkan/sembunyikan kolom nomor meja, pilih lebar printer, lihat mode resto + URL pelanggan.

### 🛡️ Admin (`/admin`)

- **Daftarkan restoran + akun seller** dalam satu langkah (email + password).
- **Slug otomatis** dari nama resto, di-*deduplicate* dengan akhiran angka (`warung-bu-siti`, `warung-bu-siti-2`, …).
- **Direktori tenant** — semua restoran beserta status aktif/nonaktif, mode, dan URL pelanggan.
- **Toggle buka/tutup & aktif/nonaktif** restoran langsung dari panel.
- **Kredensial dari environment** — akun admin ditentukan `ADMIN_EMAIL` / `ADMIN_PASSWORD` di `backend/.env` (bukan input bebas); baris akun di database dibuat otomatis saat login pertama kali (*lazy-create*).

### 🔐 Keamanan

- **Refresh token rotasi + reuse detection** — klaim *"used"* lewat satu `UPDATE` atomik berbasis `WHERE`; pemakaian ulang token langsung mencabut seluruh keluarga token.
- **Sinkronisasi lintas tab** — rotasi refresh diserialkan antar tab via **Web Locks** + **BroadcastChannel** (hindari *race condition* saat banyak tab).
- **Rate limit per-IP** — slowapi, dikonfigurasi lewat env: `RATE_LIMIT_MENU`, `RATE_LIMIT_ORDER`, `RATE_LIMIT_LOGIN`, plus throttle percobaan login gagal per-email.
- **Hardening lain** — cegah IDOR (semua query terikat `restaurant_id` / tenant), CORS ketat, hash password bcrypt, perbandingan kredensial constant-time, guard resto tutup.

### ⚙️ DevOps

- **`./run.sh`** — satu perintah menjalankan backend + frontend; log live berprefix `[be]`/`[fe]` dan tersimpan di `/tmp/kantin-*.log`.
- **Migrasi schema via Alembic** — `alembic upgrade head` dijalankan otomatis saat backend start (bisa dilewati dengan `RUN_MIGRATIONS=0`).
- **Seed demo idempoten** — bisa dijalankan berulang tanpa menduplikasi data.
- **CI GitHub Actions** — pytest di Python 3.11 + build frontend di Node 20 & 22 (`.github/workflows/ci.yml`).
- **Konfigurasi deploy siap pakai** — `render.yaml` + `Procfile` untuk backend, `vercel.json` untuk frontend.

---

## 🛠️ Tech Stack

| Lapisan | Teknologi |
|---------|-----------|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Alembic, Pydantic Settings, psycopg2 (PostgreSQL), python-jose (JWT), passlib/bcrypt, slowapi |
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 4, React Router 7, Zustand, react-hot-toast, lucide-react |
| Database | PostgreSQL (lokal; lihat [Catatan Lingkungan](#-catatan-lingkungan)), SQLite in-memory untuk test |
| Testing | pytest (backend), Vitest + React Testing Library (frontend), ESLint |
| Deploy | Vercel (frontend) + Render (backend) — `vercel.json`, `render.yaml`, `Procfile` |
| CI | GitHub Actions — backend pytest (Python 3.11), frontend build (Node 20/22) |

---

## 🚀 Cara Menjalankan (Local Dev)

### Prasyarat

- Python 3.10+ (dikembangkan & diuji di 3.11)
- Node.js 20+
- PostgreSQL berjalan lokal (mis. via Homebrew: `brew install postgresql@18`)

### Langkah

1. **Clone repo**

   ```bash
   git clone https://github.com/galanjabal3/kantin.git
   cd kantin
   ```

2. **Siapkan backend** — venv, dependensi, dan file env:

   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env
   cd ..
   ```

   Lalu isi `DATABASE_URL` di `backend/.env`, misalnya `postgresql://<user>@localhost:5432/kantin`. File `.env` sudah di-gitignore — jangan pernah commit (isi `SECRET_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` juga diisi di sini).

3. **Siapkan frontend** — dependensi dan file env:

   ```bash
   cd frontend
   npm install
   cp .env.example .env   # VITE_API_URL=http://localhost:8000
   cd ..
   ```

4. **Jalankan keduanya** dari root repo:

   ```bash
   ./run.sh
   ```

   Skrip ini menyalakan backend (uvicorn) dan frontend (Vite) sekaligus, lalu mematikan semuanya dengan bersih saat `Ctrl+C`. **Migrasi skema Alembic berjalan otomatis saat backend start** — tidak ada `Base.metadata.create_all`.

   | Flag | Fungsi |
   |------|--------|
   | `--only be` / `--only fe` | jalankan backend saja / frontend saja |
   | `--kill`, `-k` | matikan proses lama yang menempati port |
   | `--be-port P` | port backend (default `8000`, atau env `BE_PORT`) |
   | `--fe-port P` | port frontend (default `5173`, atau env `FE_PORT`) |
   | `--reload` | aktifkan `uvicorn --reload` |
   | `--help`, `-h` | tampilkan bantuan |

5. **Akses aplikasi** di <http://localhost:5173>

   - API: <http://localhost:8000> — docs interaktif di `/docs`, health check di `/health`
   - Log lengkap: `/tmp/kantin-be-8000.log` dan `/tmp/kantin-fe-5173.log`

### Migrasi manual (opsional)

Migrasi sudah jalan otomatis saat start. Bila ingin menjalankan sendiri:

```bash
cd backend
source venv/bin/activate
python -m alembic upgrade head
```

---

## 🔑 Akun Demo

| Peran | Email | Password | URL |
|-------|-------|----------|-----|
| Penjual (seller) | `seller@kantin.test` | `Demo1234!` | [`/dashboard`](http://localhost:5173/dashboard) |
| Admin | `admin@kantin.com` | `Admin123!` | [`/admin`](http://localhost:5173/admin) |

**URL penting**

| Halaman | Path |
|---------|------|
| Landing page | `/` |
| Login | `/login` |
| Dashboard penjual | `/dashboard` |
| Panel admin | `/admin` |
| Menu pelanggan (resto demo) | `/r/kantin-demo` |

> Catatan: login admin diverifikasi terhadap `ADMIN_EMAIL` / `ADMIN_PASSWORD` di `backend/.env`, jadi pastikan kedua variabel itu diisi. Akun admin dibuat otomatis di database saat login pertama kali.

---

## 🌱 Seed Demo

Mengisi database lokal dengan data demo yang siap dipakai (**idempoten** — aman dijalankan berulang):

```bash
cd backend
python scripts/seed_demo.py
```

Yang dibuat:

- Restoran **`kantin-demo`** ("Kantin Demo") beserta akun seller `seller@kantin.test`
- 3 kategori: **Makanan**, **Minuman**, **Camilan**
- 11 item menu (nasi goreng, ayam geprek, es teh, kopi susu, pisang goreng, …)
- 3 order contoh dengan status berbeda (`pending`, `preparing`, `done`) + nomor meja

Setelah seed, buka <http://localhost:5173/r/kantin-demo> untuk mencoba alur pemesanan.

---

## 📁 Struktur Proyek

```
kantin/
├── run.sh                      # jalankan backend + frontend sekaligus
├── backend/
│   ├── app/
│   │   ├── api/                # router: auth, admin, seller, customer
│   │   ├── core/               # config, database, security, refresh, ratelimit, migrations
│   │   ├── models/             # Restaurant, Seller, Admin, Category, MenuItem, Order, RefreshToken
│   │   ├── schemas/            # skema Pydantic (request/response)
│   │   ├── services/           # restaurant_service (registrasi resto + slug)
│   │   └── main.py             # FastAPI app, CORS, mounting router, /health, jalankan migrasi
│   ├── alembic/                # migrasi skema (versions/)
│   ├── scripts/seed_demo.py    # seed demo idempoten
│   ├── tests/                  # 105 test pytest
│   ├── requirements.txt · alembic.ini · render.yaml · Procfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/              # LandingPage, LoginPage, CustomerPage,
│   │   │                       #   SellerDashboard, AdminPanel, NotFound
│   │   ├── components/         # seller/ (OrdersTab, MenuTab, CashierTab, QRTab, SettingsTab), shared/
│   │   ├── store/              # Zustand: authStore, cartStore
│   │   ├── lib/                # api.ts (fetch publik/auth + rotasi refresh), errorMessage.ts
│   │   ├── hooks/              # useOrderNotification (notifikasi browser)
│   │   └── utils/              # formatTime, printer (58/80mm)
│   ├── .env.example
│   ├── vite.config.ts · vitest.config.ts · eslint.config.js · vercel.json
│   └── package.json
└── .github/workflows/ci.yml    # backend pytest + frontend build
```

Rute frontend: `/` (landing / redirect sesuai role), `/r/:slug` (menu pelanggan), `/login`, `/dashboard` (penjual), `/admin`, `*` (404).

---

## 🧪 Testing

```bash
# Backend — 105 test (SQLite in-memory; jalankan dengan venv backend aktif)
cd backend
pytest -q

# Frontend — 61 test unit
cd frontend
npx vitest run

# E2E — Playwright (butuh server sudah jalan; port FE wajib 5174)
# butuh module `playwright` (Python) + browser chromium terpasang
cd ..
FE_PORT=5174 ./run.sh &
python e2e/e2e_playwright.py    # 35 skenario PASSED → screenshot ke kantin-shots/ (mobile/desktop + files.json + audit.txt)

# Lint & build frontend
cd frontend
npx eslint src
npm run build
```

---

## 🗺️ Roadmap / TODO

- Integrasi pembayaran **Midtrans QRIS**
- **Deploy** ke Render (konfigurasi `render.yaml` / `Procfile` sudah tersedia)
- **Self-signup** penjual (registrasi resto mandiri, bukan hanya via admin)
- Kepatuhan **NIB (OSS)** & **PSE** — legalitas usaha dan pendaftaran penyelenggara sistem elektronik

---

## 📝 Catatan Lingkungan

- Database awalnya menggunakan **Supabase**, tetapi project-nya sudah **PAUSED** — untuk pengembangan lokal sekarang memakai **PostgreSQL lokal** (mis. Homebrew `pg18`) lewat `DATABASE_URL` di `backend/.env`.
- `backend/.env` berisi rahasia (URL database, `SECRET_KEY`, kredensial admin) dan sudah di-gitignore; cukup `backend/.env.example` (placeholder) yang ikut ter-commit.

---

## 📄 License

MIT
