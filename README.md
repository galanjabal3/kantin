# Kantin

![CI](https://github.com/galanjabal3/kantin/actions/workflows/ci.yml/badge.svg) ![License: MIT](https://img.shields.io/badge/license-MIT-7c3aed)

**Multi-tenant food ordering platform** for warungs and restaurants — customers scan a QR code on their table, order from the menu in the browser, and track the order live, while sellers manage menu, orders, cashier, and receipts from one dashboard.

Each restaurant is a tenant with its own slug, menu, categories, sellers, and orders. Restaurants can run in **full** mode (customer ordering + seller dashboard) or **cashier-only** mode (manual orders taken at the counter).

**Live demo:** https://kantin-pearl.vercel.app

---

## ✨ Features

### Customer (no login required)

- **QR table ordering** — a table QR encodes the restaurant URL plus a `?table=` parameter, so the table number is pre-filled on the menu page.
- **Public menu by slug** — `/r/<restaurant-slug>` shows restaurant info and available menu items, optionally filtered by category.
- **Cart & checkout** — cart state persists in Zustand; customers order with just a name (and table number when the restaurant enables it).
- **Live order tracking** — the customer page polls the order status every 5 seconds until it is ready.
- **Order history on device** — active order and past orders are stored in `localStorage` per restaurant, so the customer can reopen tracking after a refresh.
- **Closed-store guard** — the API rejects new orders when the restaurant is inactive or marked closed.

### Seller dashboard (`/dashboard`)

- **Real-time order board** — orders auto-refresh every 15 seconds with `pending → preparing → ready → done` status transitions.
- **Browser notifications** — a desktop notification fires when a new pending order appears (Web Notifications API).
- **Cashier mode** — take orders manually (they are stored with `source: cashier`).
- **Receipt printing** — thermal receipt via `window.print()` with configurable paper width (`58mm` / `80mm`, saved in `localStorage`).
- **Menu & category management** — full CRUD for menu items (name, description, price, image, availability) and categories.
- **Table QR sheets** — generate and print per-table QR codes for the menu URL.
- **Restaurant settings** — toggle open/closed, show or hide the table-number field, pick the thermal printer width (58/80 mm), and see the restaurant's mode plus its customer URL.

### Admin panel (`/admin`)

- **Register restaurants** — create a restaurant **and** its seller account in one step (email + password).
- **Automatic slug generation** — slug derived from the restaurant name, de-duplicated with a numeric suffix (`warung-bu-siti`, `warung-bu-siti-2`, …).
- **Restaurant directory** — list every tenant with its status (active/inactive), mode, and customer URL.
- **Protected by env credentials** — the admin account is defined by `ADMIN_EMAIL` / `ADMIN_PASSWORD` in the backend `.env`, not stored in the database.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|--------------|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Pydantic Settings, psycopg2 (PostgreSQL), python-jose (JWT), passlib/bcrypt |
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 4, React Router 7, Zustand, react-hot-toast, lucide-react |
| Testing | pytest (backend), Vitest + React Testing Library (frontend) |
| Database | PostgreSQL (Supabase in production; SQLite for tests) |
| Deploy | Vercel (frontend) + Render (backend) — `vercel.json`, `render.yaml`, `Procfile` |
| CI | GitHub Actions (`.github/workflows/ci.yml`) — backend pytest on Python 3.11, frontend build on Node 18/20 |

---

## 📁 Project Structure

```
kantin/
├── backend/
│   ├── app/
│   │   ├── api/              # Routers: auth, admin, seller, customer
│   │   ├── core/             # config (env), database, security (JWT), dependencies
│   │   ├── models/           # SQLAlchemy models: Restaurant, Seller, Customer,
│   │   │                     #   Category, MenuItem, Order, OrderItem
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # restaurant_service (registration + slug generation)
│   │   └── main.py           # FastAPI app, CORS, router mounting, /health
│   ├── tests/                # pytest suite (route/schema smoke tests, SQLite)
│   ├── requirements.txt
│   ├── render.yaml · Procfile · runtime.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/            # LandingPage, LoginPage, CustomerPage,
│   │   │                     #   SellerDashboard, AdminPanel, NotFound
│   │   ├── components/
│   │   │   ├── seller/       # OrdersTab, MenuTab, CashierTab, QRTab, SettingsTab
│   │   │   └── shared/       # Skeleton loader
│   │   ├── hooks/            # useOrderNotification (browser notifications)
│   │   ├── store/            # Zustand: authStore, cartStore
│   │   ├── lib/api.ts        # fetch wrappers (public vs. authenticated)
│   │   └── utils/            # formatTime, …
│   ├── .env.example
│   ├── vite.config.ts · vitest.config.ts · vercel.json
│   └── package.json
└── .github/workflows/ci.yml  # backend pytest + frontend build
```

Frontend routes: `/` (landing or redirect by role), `/r/:slug` (customer menu), `/login`, `/dashboard` (seller), `/admin`, `*` (404).

---

## 🚀 Local Development

### Prerequisites

- Python 3.11 (see `backend/.python-version`)
- Node.js 18+
- PostgreSQL (any instance reachable via `DATABASE_URL`)

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in DATABASE_URL, SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
uvicorn app.main:app --reload
```

API runs at `http://localhost:8000`.

- Interactive docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`
- Tables are created automatically on startup (`Base.metadata.create_all`) when `DATABASE_URL` is set.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env        # set VITE_API_URL
npm run dev
```

App runs at `http://localhost:5173` (Vite dev server; API base URL comes from `VITE_API_URL`).

### 3. Tests (same as CI)

```bash
# Backend — pytest against SQLite
cd backend
DATABASE_URL=sqlite:// pytest -v

# Frontend — lint, type-check + build, unit tests
cd frontend
npm run lint
npm run build
npm run test
```

---

## ⚙️ Environment Variables

### `backend/.env` (from `backend/.env.example`)

```ini
# Database
DATABASE_URL=

# JWT
SECRET_KEY=
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# App
APP_NAME=Kantin API

# Admin
ADMIN_EMAIL=
ADMIN_PASSWORD=

ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (empty → app starts without a DB, e.g. for tests) |
| `SECRET_KEY` | Key used to sign JWTs — use a long random value |
| `ALGORITHM` | JWT algorithm (`HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access-token lifetime (default `1440` = 24 h) |
| `APP_NAME` | FastAPI title / health-check payload |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Credentials for the admin login (checked before sellers) |
| `ALLOWED_ORIGINS` | Comma-separated CORS allow-list |

### `frontend/.env` (from `frontend/.env.example`)

```ini
VITE_API_URL=http://localhost:8000
VITE_APP_NAME=Kantin
VITE_ADMIN_WHATSAPP=012345678
VITE_ADMIN_EMAIL=
```

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend base URL used by the API client |
| `VITE_APP_NAME` | App name shown in the UI |
| `VITE_ADMIN_WHATSAPP` | WhatsApp number used by the landing page contact link |
| `VITE_ADMIN_EMAIL` | Admin contact email shown in the UI |

---

## 🌐 API Overview

Base URL: `http://localhost:8000` · Swagger UI: `/docs`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login as seller or admin → JWT + `user_type` |
| GET | `/api/admin/restaurants` | List all restaurants (admin) |
| POST | `/api/admin/restaurants` | Register restaurant + seller account (admin) |
| PUT | `/api/admin/restaurants/{id}` | Update/activate/deactivate a restaurant (admin) |
| GET | `/api/seller/me` | Current restaurant profile |
| PUT | `/api/seller/me` | Update settings (open/closed, table number, OTP, mode) |
| GET/POST | `/api/seller/categories` | List / create categories |
| DELETE | `/api/seller/categories/{id}` | Delete a category |
| GET/POST | `/api/seller/menu` | List / create menu items |
| PUT/DELETE | `/api/seller/menu/{id}` | Update / delete a menu item |
| GET/POST | `/api/seller/orders` | List orders / create a cashier order |
| PUT | `/api/seller/orders/{id}/status` | Move order: `pending → preparing → ready → done` |
| GET | `/api/r/{slug}` | Public restaurant info |
| GET | `/api/r/{slug}/menu?category_id=` | Public menu (available items only) |
| POST | `/api/r/{slug}/orders` | Place an order (fails if restaurant is closed) |
| GET | `/api/r/{slug}/orders/{order_id}` | Track an order (polled every 5 s by the customer page) |
| GET | `/health` | Health check |

Seller/admin routes require `Authorization: Bearer <token>`; admin routes additionally require `user_type=admin`.

---

## 📄 License

MIT
