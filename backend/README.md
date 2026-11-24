# PDF Studio API

## Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to a PostgreSQL database.
3. Set a strong random `JWT_SECRET`.
4. Run `npm install`.
5. Run `npx prisma generate`.
6. Run `npx prisma migrate dev --name init`.
7. Run `npm run dev`.

## Endpoints

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- Document CRUD under `/api/documents`
- Subscription read and checkout/webhook under `/api/subscriptions`

Payments intentionally return HTTP 501 until a real Stripe or Razorpay integration and verified secrets are configured.
