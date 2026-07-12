# Matrix Banking API — Backend

Node.js/Express backend for the Patraia banking web app, implementing the
[matrixbankingAPI Postman contract](https://documenter.getpostman.com/view/12119717/2s93XyT3U2)
(same routes, request bodies and response shapes).

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (>= 18) |
| Framework | Express 4 |
| ORM / DB | Prisma 6 + SQLite (dev) — switch `datasource` to MySQL/Postgres for production |
| Auth | JWT bearer tokens (`Authorization: Bearer <token>`), bcrypt-hashed passwords & PINs |
| Money | Stored as **integer kobo (BigInt)** — no float rounding errors |

## Quick start

```bash
cd backend
npm install
npx prisma migrate dev   # creates SQLite DB + runs the seed automatically
npm run dev              # or: npm start
# -> http://localhost:8000
```

### Seeded demo data

| What | Value |
|---|---|
| User 1 | `demo` / `password123`, PIN `1234`, account `5011111111`, ₦50,000 |
| User 2 | `demo2` / `password123`, PIN `1234`, account `5022222222`, ₦10,000 |
| API key (user 1, for server-to-server) | `demo_api_key_1000000000000000000` |
| POS terminal | serial `6476464734685635`, PIN `2351` (owned by user 1) |
| Banks | 38 Nigerian banks; our institution is **Assetmatrix MFB** (`bank_code 090287`) |

Reset everything: `npm run db:reset`

## Endpoints (base: `/api/v1`, alias `/matrixbanking/api/v1`)

### Users & auth
- `POST /users/register` — create account (generates 10-digit account number + wallet)
- `POST /users/login` — returns `{ user, token }`
- `GET  /users/get-details` 🔒
- `GET  /users/customer/get-balance` 🔒
- `POST /users/change-password` 🔒
- `POST /users/verify-pin` 🔒
- `GET  /users/markasreadnotification?uid=<id>` 🔒 (no `uid` → mark all)
- `POST /users/save-beneficiary` 🔒
- `GET  /users/delete-beneficiary?id=<id>` 🔒

### Banks, verification
- `GET  /get-banks`
- `POST /verify-bank-account` 🔒 — internal accounts resolve the real owner; external banks return deterministic mock names in dev (`MOCK_EXTERNAL_PROVIDERS=true`)
- `POST /fheerr/verification` 🔒 — BVN/NIN (11 digits, mocked in dev)

### Transactions
- `POST /transactions/initiate-transaction` 🔒 — returns charge + `transaction_reference`
- `POST /transactions/bnk/bank-transfer` 🔒 — verifies transaction PIN, atomic debit, credits internal recipients, optional `beneficiary: "true"` saves the recipient; idempotent on `transaction_reference`
- `GET/POST /transactions/get-statement` 🔒 — optional `datefrom`/`dateto` (`dd-mm-yyyy`)
- `GET  /transactions/get-beneficiary` 🔒 — `{ bankdata, walletdata, billdata }`
- `GET  /query-transaction/settlement?ref=<reference>`
- `GET/POST /account/get-deposit-transactions` 🔒 — credit history (account monitoring)

### Server-to-server (header `x-api-key`)
- `POST /banktransfer-payout` — idempotent on `payment_reference`; `username` must match the key owner
- `POST /virtual-account/create`

### ATM cards 🔒
- `POST /atmcard/card-apply` → `C01 Card request is processing`
- `POST /atmcard/card/activate` → `C00`
- `POST /atmcard/card/block-unblock` (`block_status`: `"1"` block → `C03`, `"0"` unblock → `C06`)
- `POST /atmcard/card/change-pin` (`C00` / `C09` on wrong current pin)
- `POST /atmcard/card/block-permanent` → `C04`
- `GET  /atmcard/get-card` (`is_card_available`: 0 none, 1 processing, 2 available)

### Loans 🔒
- `POST /loan/check-eligibility` — max loan = 40% of 90-day credit turnover, one loan at a time
- `POST /loan/store-loan` — 4%/month interest, 1–24 months
- `GET  /loan/get-all-Loans` · `POST /loan/get-loan` · `GET /loan/get-active-loan`

### Cable TV 🔒
- `POST /transactions/verify-smart-card` — gotv / dstv / startimes (mocked in dev)

### POS (ErrandPay)
- `POST /transactions/errandpay/check-balance`
- `POST /transactions/errandpay/get-customer-details`
- `POST /transactions/errandpay/services-webhook` — idempotent on `TransactionReference`

🔒 = requires `Authorization: Bearer <token>` from login/register.

Every response follows the contract: `{ status: true|false, message, data? }`;
business failures use HTTP 406, auth failures 401, missing resources 404.

## Design notes

- **Atomic transfers** — debits use a conditional `updateMany` (`balance >= total`) inside a
  Prisma transaction, so concurrent requests cannot overdraw; internal credits happen in the
  same DB transaction.
- **Idempotency** — transfers, payouts and POS webhooks replay safely on the same reference.
- **Webhook** — set `WEBHOOK_URL` in `.env` to receive deposit notifications
  (payload matches the Postman "Webhook notification" example).
- **Mocked externals** — NIP account lookup, BVN/NIN and cable TV verification return
  deterministic mock data when `MOCK_EXTERNAL_PROVIDERS=true`; wire real providers there
  for production.
- Endpoints the upstream doc leaves open (statement, beneficiaries) require a bearer token
  here — safer default, same shapes.

## Production checklist

- [ ] Change `JWT_SECRET`; move DB to MySQL/Postgres (`prisma/schema.prisma` datasource)
- [ ] Put real NIP/BVN/cable providers behind the mock switches
- [ ] Add rate limiting (e.g. `express-rate-limit`) and `helmet`
- [ ] Serve over HTTPS behind a reverse proxy
