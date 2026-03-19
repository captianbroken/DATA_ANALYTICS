# Hyperspark AI Monitor - Frontend + Database Setup

This repository contains the **AI Monitoring Dashboard frontend** plus database schema and helper scripts. It is designed so a backend/model team can plug in RTSP streams, AI events, and violations while the UI displays live data from Supabase.

---
## 1. Project Structure (Quick Map)

```
Praveen/
  frontend/                 React + Vite dashboard (main app)
    public/                 Static assets (logos, jpeg images)
    src/                    UI pages, components, hooks
    rtsp-test-server.mjs    Small HTTP service for RTSP URL testing
  schema.sql                Base database tables
  dashboard_migration.sql   Functions, policies, seeded admin user
  fix_auth_and_rls.sql      Optional fixes for Auth/RLS permissions
  migrate_*.py              Optional Python helpers for schema migration
  .env                      Environment variables (used by frontend)
```

---
## 2. Prerequisites (What You Need Installed)

1. **Node.js** (LTS recommended, 18+)
2. **npm** (comes with Node.js)
3. **Supabase project** (free tier is fine)

Optional (only if using Python scripts):
1. **Python 3.10+**

---
## 3. Database Setup (Supabase)

Open your Supabase project → **SQL Editor** and run the files in this order:

1. `schema.sql`
2. `dashboard_migration.sql`
3. `fix_auth_and_rls.sql` (only if you get permission errors)

Default admin account is created by `dashboard_migration.sql`:

- Email: `admin@hyperspark.io`
- Password: `Admin@12345`

Change this in production.

---
## 4. Environment Variables (.env)

This project uses a **root-level** `.env` (because Vite is configured with `envDir: '..'`).

Create `Praveen/.env` with:

```
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

# Optional (RTSP test service)
VITE_RTSP_TEST_PROTOCOL=http
VITE_RTSP_TEST_PORT=5050
```

---
## 5. Frontend Setup (Step-by-Step)

### Install dependencies
```
cd frontend
npm install
```

### Run in development mode
```
npm run dev
```

Open the URL shown in your terminal (usually `http://localhost:5173`).

### Build for production
```
npm run build
```

### Preview production build
```
npm run preview
```

---
## 6. RTSP Test Service (Edge Server)

To test RTSP URLs before saving cameras, run:

```
cd frontend
npm run rtsp-test-server
```

This starts an HTTP endpoint on port `5050` by default.

How it works:
1. The frontend sends an RTSP URL to `/rtsp-test` on the **selected edge server**.
2. The edge server checks the RTSP stream.
3. It returns `true/false` so the frontend can save only valid cameras.

If your edge server uses a different port:
- Set `VITE_RTSP_TEST_PORT` in `.env`

---
## 7. Role-Based UI

- **Admin** sees everything (Users, Settings, Edge Servers, Global Search).
- **User** sees only operational pages (Sites, Cameras, Employees, Events, Violations).

Admin-only pages are blocked at route level.

---
## 8. Common Commands (Cheat Sheet)

From `frontend/`:

```
npm run dev       # Start dev server
npm run build     # Build production
npm run preview   # Preview production build
npm run lint      # Lint the frontend
npm run rtsp-test-server  # Start RTSP test service
```

---
## 9. Notes for Backend/AI Team

Data tables you will interact with:

- `events` (FRS/PPE detections)
- `violations` (PPE violations / intrusion)
- `cameras`, `edge_servers`, `sites`, `employees`

The UI reads directly from Supabase tables, so any inserts/updates will reflect in the dashboard after refresh.

---
## 10. Troubleshooting

**Dashboard says "Database Not Connected"**
- Check `.env` values and restart `npm run dev`.

**Login fails**
- Ensure you ran both `schema.sql` and `dashboard_migration.sql`.

**Password update fails**
- Must be logged in with a valid Supabase auth session, not fallback auth.

---

































































