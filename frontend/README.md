# Kantin Frontend

React + TypeScript frontend for the Kantin food ordering platform.

## Tech Stack

- React 18 with TypeScript
- Vite 5 for build tooling
- TailwindCSS 4 for styling
- Zustand for state management
- React Router v7 for routing
- Axios for API calls

## Features

- **Customer:** Browse menu, cart, checkout, live order tracking
- **Seller:** Dashboard, cashier mode, menu management, QR code generation
- **Admin:** Restaurant management, seller account creation

## Setup

```bash
npm install
cp .env.example .env  # set VITE_API_URL
npm run dev
```

## Scripts

- `npm run dev` — Start development server
- `npm run build` — Production build
- `npm run preview` — Preview production build
- `npm run lint` — Run ESLint
