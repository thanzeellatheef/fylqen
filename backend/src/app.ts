import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import pino from 'pino'
import authRoutes from './routes/auth.js'
import documentRoutes from './routes/documents.js'
import subscriptionRoutes from './routes/subscriptions.js'
import { env } from './config/env.js'

export const app = express()
const logger = pino({ redact: ['req.headers.cookie', 'req.body.password', 'req.body.token'] })
app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: env.frontendOrigin, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }), authRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/subscriptions', subscriptionRoutes)
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(error)
  res.status(500).json({ error: 'An unexpected server error occurred' })
})
