# Patriai — Frontend

React frontend for the Patraia banking app, built to match the
[Patraia Figma design](https://www.figma.com/design/R7TGNqwPmp2pJRWHCpfELs/Patraia--Copy-)
and wired to the Matrix Banking API backend in `../backend`.

## Stack

- React 18 + Vite 5, React Router (hash routing)
- Tailwind CSS 3 with design tokens extracted from the Figma file:
  navy `#001736` (gradient → `#002b5c`), brand green `#006c49` (→ `#4edea3`),
  lavender inputs `#d3e4fe`, page `#f8f9ff`; fonts **Inter** (body) + **Manrope** (display)
- Mobile-first 390px layout centered on desktop (max-width 430px shell)

## Run

```bash
# 1. start the backend first (port 8000)
cd ../backend && npm run dev

# 2. start the frontend (port 5173; /api is proxied to :8000)
cd ../frontend
npm install
npm run dev
```

Login with the seeded demo user: **demo / password123** (PIN `1234`).

## Screens

| Route | Screen (Figma source) |
|---|---|
| `/` | Welcome splash ("Welcome to Payslack") |
| `/register` | 3-step Get Started wizard ("Create Your Account" + "Security PIN Setup") |
| `/login` | "Login to Patriai" |
| `/home` | Home Dashboard — balance hero with inflow/outflow, quick actions, recent activity, smart suggestions |
| `/activity` | Activity feed — search, filter chips, day-grouped transactions |
| `/transfer` | 4-step transfer: recipient (+ saved beneficiaries) → amount → "Authorize Payment" PIN pad → success ("Wallet Funded!" style) |
| `/cards` | Card apply → activate → manage (freeze/unfreeze, change PIN) |
| `/loans` | Eligibility check, apply with duration slider, active loan + history |
| `/profile` | Account info, BVN verification, change password, logout |
| `/notifications` | Notification feed with mark-as-read |
| `/cabletv` | Smartcard verification (GOtv/DStv/StarTimes) |

All API calls go through `src/lib/api.js` (JWT bearer from localStorage; 401 auto-redirects to login).
