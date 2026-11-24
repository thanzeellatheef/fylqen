import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  const documents = await prisma.document.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' } })
  res.json(documents)
})

router.post('/', async (req, res) => {
  const parsed = z.object({ name: z.string().min(1).max(255), size: z.number().int().nonnegative(), storage: z.enum(['local', 'cloud']).default('local') }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid document metadata' })
  const document = await prisma.document.create({ data: { ...parsed.data, mimeType: 'application/pdf', userId: req.user!.id } })
  res.status(201).json(document)
})

router.get('/:id', async (req, res) => {
  const document = await prisma.document.findFirst({ where: { id: req.params.id, userId: req.user!.id } })
  if (!document) return res.status(404).json({ error: 'Document not found' })
  res.json(document)
})

router.patch('/:id', async (req, res) => {
  const parsed = z.object({ name: z.string().min(1).max(255) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid document details' })
  const existing = await prisma.document.findFirst({ where: { id: req.params.id, userId: req.user!.id } })
  if (!existing) return res.status(404).json({ error: 'Document not found' })
  res.json(await prisma.document.update({ where: { id: existing.id }, data: parsed.data }))
})

router.delete('/:id', async (req, res) => {
  const deleted = await prisma.document.deleteMany({ where: { id: req.params.id, userId: req.user!.id } })
  if (!deleted.count) return res.status(404).json({ error: 'Document not found' })
  res.status(204).send()
})

export default router
