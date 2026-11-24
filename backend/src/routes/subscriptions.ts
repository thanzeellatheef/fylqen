import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.get('/', requireAuth, async (req, res) => {
  const subscription = await prisma.subscription.findUnique({ where: { userId: req.user!.id } })
  res.json(subscription ?? { plan: 'free', status: 'active' })
})
router.post('/checkout', requireAuth, (_req, res) => {
  res.status(501).json({ error: 'Payments are not enabled. Configure Stripe or Razorpay before using checkout.' })
})
router.post('/webhook', (req, res) => {
  const secretConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET)
  if (!secretConfigured) return res.status(501).json({ error: 'Payment webhook secrets are not configured' })
  res.status(501).json({ error: 'Webhook verification provider is not configured' })
})
export default router
