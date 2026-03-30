# Kantin 🍽️

Multi-tenant food ordering platform — platform pemesanan makanan untuk warung dan restoran.

## Demo

- **Customer:** `https://kantin.vercel.app/r/warung-bu-siti`
- **Seller dashboard:** `https://kantin.vercel.app/dashboard`
- **Admin panel:** `https://kantin.vercel.app/admin`

## Tech Stack

| Layer | Teknologi |
|---|---|
| Backend | FastAPI + Python |
| Frontend | React + Vite + TailwindCSS |
| Database | PostgreSQL via Supabase |
| ORM | SQLAlchemy + psycopg2 |
| Auth | JWT |
| State | Zustand |
| Deploy | Vercel (FE) + Render (BE) |

## Fitur

**Customer**
- Scan QR meja → langsung buka menu resto
- Browse menu per kategori
- Cart & checkout dengan nama
- Live order tracking (polling)
- Riwayat pesanan di localStorage

**Seller**
- Dashboard order real-time (auto refresh 15s)
- Browser push notification saat order masuk
- Kasir mode — input pesanan manual
- Cetak struk thermal via `window.print()`
- Kelola menu & kategori
- Generate & print QR code per meja
- Pengaturan: buka/tutup, wajib OTP, nomor meja

**Admin**
- Daftarkan resto baru + buat akun seller
- Generate slug otomatis dari nama resto
- Aktif/nonaktif resto

## Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # isi dengan kredensial kamu
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env  # isi VITE_API_URL
npm run dev
```

### Environment Variables

**Backend `.env`**
```
DATABASE_URL=postgresql://...supabase...
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
ADMIN_EMAIL=admin@kantin.com
ADMIN_PASSWORD=your-password
ALLOWED_ORIGINS=http://localhost:5173
```

**Frontend `.env`**
```
VITE_API_URL=http://localhost:8000
VITE_ADMIN_WHATSAPP=6281234567890
VITE_ADMIN_EMAIL=admin@kantin.app
```

## Struktur Project
```
kantin/
├── backend/
│   ├── app/
│   │   ├── api/          # Route handlers
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── core/         # Config, DB, security
│   │   └── services/     # Business logic
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/        # Route pages
        ├── components/   # UI components
        ├── hooks/        # Custom hooks
        ├── store/        # Zustand stores
        └── lib/          # API client
```

## License

MIT