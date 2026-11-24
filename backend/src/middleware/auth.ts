import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!env.jwtSecret) return res.status(500).json({ error: 'Server authentication is not configured' })
  const token = req.cookies?.session
  if (!token) return res.status(401).json({ error: 'Authentication required' })
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return res.status(401).json({ error: 'Invalid session' })
    req.user = user
    next()
  } catch {
    res.status(401).json({ error: 'Invalid session' })
  }
}
