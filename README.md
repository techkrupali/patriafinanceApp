# Patriai — Family Finance Platform

Phased build per the [project proposal](https://github.com/techkrupali/patriafinanceApp): **Phase 1 = mobile app (React Native/Expo)**, Phase 2 = web app — both on one Laravel backend with a single shared admin panel.

## Repository layout

| Directory | What it is | Stack |
|---|---|---|
| [patriai-api/](patriai-api/) | **Patriai core backend** — auth/OTP, wallets, transfers, banking integration, admin API | Laravel 12 · PostgreSQL 17 · Sanctum |
| [mobile/](mobile/) | **Phase 1 mobile app** (Milestones 1–2) | React Native (Expo) · React Navigation · Zustand · React Query · NativeWind |
| [admin/](admin/) | **Admin panel** (shared for Phase 1 + Phase 2) | Next.js (TypeScript) · Tailwind |
| [backend/](backend/) | **Matrix Banking API sandbox** — local implementation of the client-provided banking rails (same contract as the live host) | Express · Prisma · SQLite |
| [frontend/](frontend/) | Early Vite prototype of the customer web UI (superseded by Phase 2 Next.js app) | React · Vite · Tailwind |

## Architecture (Phase 1)

```
mobile app (Expo RN)          admin panel (Next.js)
        │  Bearer / REST             │
        ▼                            ▼
   Patriai API — Laravel 12 (:8001, PostgreSQL, kobo-integer ledger)
        │  x-api-key / bearer                ▲
        ▼                                    │ deposit webhooks
   Matrix Banking rails (:8000 sandbox ──────┘   (x-webhook-secret)
   → swap MATRIX_BASE_URL to the live host in production)
```

Wallet funding is fully real end-to-end in dev: each wallet gets a **virtual account** registered on the banking rails; any transfer into it fires a webhook that credits the Patriai ledger (idempotent per session id).

## Run everything (dev)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-start.ps1   # Postgres + sandbox + API
cd admin  && npm run dev        # admin panel  -> http://localhost:3000
cd mobile && npx expo start     # mobile app   -> Expo Go / emulator
```

First-time setup details per directory are in each README.

### Dev credentials

| What | Value |
|---|---|
| Admin panel | `admin@patriai.app` / `Admin@2026!` |
| Matrix sandbox users | `demo`, `demo2` / `password123` (PIN `1234`) |
| PostgreSQL | `postgres` / `patriai_dev_2026`, db `patriai` (port 5432) |

Email OTPs are logged to `patriai-api/storage/logs/laravel.log` in dev (`MAIL_MAILER=log`) and also returned as `debug_otp` while `APP_DEBUG=true`.

### Simulate a wallet deposit (sandbox)

```bash
# demo2 sends ₦500 from the banking rails to a wallet's virtual account:
TOKEN=$(curl -s -X POST localhost:8000/api/v1/users/login -H 'Content-Type: application/json' \
  -d '{"username":"demo2","password":"password123"}' | jq -r .data.token)
curl -s -X POST localhost:8000/api/v1/transactions/bnk/bank-transfer \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"destination_account":"<VIRTUAL_ACCOUNT>","bank_code":"090287","final_amount":"500","transaction_pin":"1234","description":"deposit"}'
```

## Milestone status (Phase 1 proposal)

- **M1 — Setup, Authentication & Core Foundation:** ✅ Laravel 12 + PostgreSQL foundation, phone/email OTP login, forgot password, biometric-ready sessions, profile, dashboard, JWT/Sanctum + device management, base UI + bottom nav
- **M2 — Wallet Management & Banking Integration:** ✅ main/shared/project wallets, funding via virtual accounts, withdrawals, wallet-to-wallet & user-to-user transfers, Matrix Banking integration, transaction history, balance management
- M3 — Roles, Permissions & Approvals: next
- M4 — KYC, Notifications & AI Assistant: needs client keys (Dojah, FCM, OpenAI, Termii)
- M5 — QA & store deployment: needs Expo/Play Console accounts
