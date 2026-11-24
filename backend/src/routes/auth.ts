import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const registerSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128), name: z.string().min(1).max(100).optional() })
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

router.post('/register', async (req, res) => {
  if (!env.jwtSecret) return res.status(500).json({ error: 'Server authentication is not configured' })
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid registration details' })
  const email = parsed.data.email.toLowerCase()
  if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: 'An account already exists for this email' })
  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  const user = await prisma.user.create({ data: { email, passwordHash, name: parsed.data.name, subscription: { create: { plan: 'free', status: 'active' } } } })
  const token = jwt.sign({ sub: user.id }, env.jwtSecret!, { expiresIn: '7d' })
  res.cookie('session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 604800000 })
  res.status(201).json({ id: user.id, email: user.email, name: user.name })
})

router.post('/login', async (req, res) => {
  if (!env.jwtSecret) return res.status(500).json({ error: 'Server authentication is not configured' })
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid login details' })
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' })
  const token = jwt.sign({ sub: user.id }, env.jwtSecret!, { expiresIn: '7d' })
  res.cookie('session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 604800000 })
  res.json({ id: user.id, email: user.email, name: user.name })
})

router.post('/logout', (_req, res) => { res.clearCookie('session'); res.status(204).send() })

router.post('/forgot-password', async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body)
  if (parsed.success) {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })
    if (user) {
      const token = crypto.randomBytes(32).toString('hex')
      await prisma.passwordReset.create({ data: { tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000), userId: user.id } })
    }
  }
  res.json({ message: 'If the account exists, reset instructions will be sent.' })
})

router.post('/reset-password', async (req, res) => {
  const parsed = z.object({ token: z.string().min(32), password: z.string().min(8).max(128) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid reset request' })
  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex')
  const reset = await prisma.passwordReset.findFirst({ where: { tokenHash, expiresAt: { gt: new Date() } } })
  if (!reset) return res.status(400).json({ error: 'Reset link is invalid or expired' })
  await prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(parsed.data.password, 12) } })
  await prisma.passwordReset.deleteMany({ where: { userId: reset.userId } })
  res.json({ message: 'Password reset successfully' })
})

router.get('/me', requireAuth, (req, res) => res.json({ id: req.user!.id, email: req.user!.email, name: req.user!.name, role: req.user!.role }))
export default router
