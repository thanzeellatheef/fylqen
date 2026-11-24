# Deployment

## Frontend

1. Deploy this repository directory as a Vite project.
2. Set `VITE_API_URL` to the public backend URL.
3. Use the included `vercel.json` SPA rewrite.

## Backend

1. Deploy `backend/` to Render or another Node.js host.
2. Set `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_ORIGIN`, and `PORT`.
3. Run `npx prisma generate`.
4. Run `npx prisma migrate deploy`.
5. Start with `npm start`.

PostgreSQL is required for accounts, metadata, and subscriptions. Core PDF processing remains browser-local and does not upload documents.
