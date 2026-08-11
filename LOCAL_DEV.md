# Local Development Setup

This repo has two apps:
- **`/`** — Web app (TanStack Start + Clerk + Supabase + Socket.io) → runs on port **5000**
- **`/native`** — Mobile app (Expo + React Native + Socket.io) → runs on port **8080**

---

## 1. Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| npm | 10+ |
| Expo Go | latest (on your phone) |

---

## 2. Clone & install

```bash
git clone <your-repo-url>
cd <repo>

# Install web app deps
npm install

# Install native app deps
cd native && npm install && cd ..
```

---

## 3. Set up environment variables

### Web app (root `.env`)
```bash
cp .env.example .env
```
Fill in:
- `VITE_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — from [Clerk Dashboard → API Keys](https://dashboard.clerk.com/last-active?path=api-keys)
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` — from [Supabase → Settings → API](https://supabase.com/dashboard/project/_/settings/api)
- `SESSION_SECRET` — any random 64-char string (`openssl rand -base64 48`)

### Native app (`native/.env`)
```bash
cp native/.env.example native/.env
```
Fill in:
- Same Supabase URL + anon key as above
- `EXPO_PUBLIC_API_URL=http://localhost:5000` (points to the web app's Socket.io server)

---

## 4. Run the web app

```bash
npm run dev
```
→ Opens at [http://localhost:5000](http://localhost:5000)

---

## 5. Run the native app

```bash
cd native
npm start          # shows QR code in terminal
# or for web preview:
npm run web        # opens at http://localhost:8080
```

Then scan the QR code with **Expo Go** on your phone.

**Important:** Make sure `EXPO_PUBLIC_API_URL` in `native/.env` points to the machine running the web app (e.g. `http://192.168.1.x:5000` if testing on a physical device on the same Wi-Fi).

---

## 6. Database migrations

Run these SQL scripts once in [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new):

```sql
-- 1. Username handle column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (LOWER(username)) WHERE username IS NOT NULL;

-- 2. Pending friend requests
-- (see supabase/migrations/20260424100000_add_pending_friend_requests.sql)

-- 3. Group features + media
-- (see supabase/migrations/20260428100000_add_full_group_features.sql)

-- 4. Calls + stories
-- (see supabase/migrations/20260430100000_add_calls_and_stories.sql)
```

Or navigate to `/setup` in the running web app for guided instructions.

---

## 7. Project structure

```
/                    ← Web app (TanStack Start)
├── src/
│   ├── routes/      ← Page routes
│   ├── components/  ← UI components
│   ├── lib/         ← Server functions (Supabase queries)
│   └── server/      ← Socket.io server
├── .env             ← Web app secrets (not committed)
└── .env.example     ← Template

/native              ← React Native (Expo Router)
├── app/             ← Screen routes
│   ├── (tabs)/      ← Bottom tab screens
│   ├── chat/[id].tsx
│   └── ...
├── src/
│   ├── lib/         ← Supabase client, Socket.io, data access
│   ├── context/     ← Session (auth) context
│   └── theme.ts     ← Design tokens
├── .env             ← Native app secrets (not committed)
└── .env.example     ← Template
```

---

## 8. Common issues

| Problem | Fix |
|---------|-----|
| Clerk "Missing publishableKey" | Make sure `VITE_CLERK_PUBLISHABLE_KEY` is set in `.env` |
| Native can't connect to Socket.io | Set `EXPO_PUBLIC_API_URL` to your machine's LAN IP (not localhost) |
| Metro bundler "@/" import error | Run `npm install` in `native/`, Babel module-resolver is required |
| WebRTC calls fail behind NAT | Add TURN server via [Metered.ca](https://metered.ca) and set `METERED_API_KEY` + `METERED_DOMAIN` |
