# Jenix Admin Panel (Phase 3 UI Wiring)

React + Vite + PWA admin app for Phase 3 modules:

- Catalogue summary + export
- Categories CRUD
- Products CRUD + image upload
- HSN/Tax Master CRUD
- Inventory adjustments, policy, low-stock alerts, movement view

## Run

```bash
cd VPS
pnpm install
pnpm --filter @jenix/admin-panel dev
```

## Environment

Copy `apps/admin-panel/.env.example` to `apps/admin-panel/.env` if needed.

Default:

```env
VITE_API_BASE_URL=http://localhost:4100/api
```

## Backend dependency

This UI expects the backend API from `VPS/backend` to be running:

```bash
pnpm dev:backend
```
