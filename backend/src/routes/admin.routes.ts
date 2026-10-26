import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';
import { clientIp, parseBody, parseQuery } from '../middleware/validate.js';
import { getSettings } from '../services/menu.service.js';
import { getClosedSessions, getSummary, localToday } from '../services/report.service.js';
import { env } from '../config/env.js';
import { emitAll, RT } from '../realtime/io.js';

export const adminRoutes = Router();

// ---------------------------------------------------------------- relatórios

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD');
const periodQuery = z
  .object({ from: dateStr.optional(), to: dateStr.optional() })
  .transform((q) => {
    const today = localToday();
    return { from: q.from ?? today, to: q.to ?? today };
  })
  .refine((q) => q.from <= q.to, 'Período inválido')
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86400000 <= 366, 'Período máximo de 1 ano');

adminRoutes.get('/reports/summary', requireRole(), async (req, res) => {
  const { from, to } = parseQuery(periodQuery, req);
  const settings = await getSettings();
  res.json({ ...(await getSummary(from, to)), demoMode: settings.demoMode });
});

adminRoutes.get('/reports/sessions', requireRole(), async (req, res) => {
  const { from, to } = parseQuery(periodQuery, req);
  res.json({ sessions: await getClosedSessions(from, to) });
});

// ---------------------------------------------------------------- configurações

adminRoutes.get('/settings', requireRole(), async (_req, res) => {
  const s = await getSettings();
  res.json({ settings: { ...s, serviceFeePercent: Number(s.serviceFeePercent) } });
});

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(160),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(200),
  openingHours: z.string().trim().max(200),
  serviceFeePercent: z.number().min(0).max(30),
  allowSelfOpen: z.boolean(),
  kitchenLateMinutes: z.number().int().min(1).max(240),
});

adminRoutes.put('/settings', requireRole(), async (req, res) => {
  const data = parseBody(settingsSchema.partial(), req);
  const s = await prisma.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  await audit({ userId: req.user!.id, action: 'settings.update', entity: 'settings', entityId: '1', data, ip: clientIp(req) });
  emitAll(RT.MENU_UPDATED, {});
  res.json({ settings: { ...s, serviceFeePercent: Number(s.serviceFeePercent) } });
});

// ---------------------------------------------------------------- auditoria

adminRoutes.get('/audit', requireRole(), async (req, res) => {
  const q = parseQuery(
    z.object({
      entity: z.string().max(40).optional(),
      action: z.string().max(60).optional(),
      take: z.coerce.number().int().min(1).max(200).default(100),
    }),
    req,
  );
  const logs = await prisma.auditLog.findMany({
    where: { entity: q.entity, action: q.action ? { startsWith: q.action } : undefined },
    orderBy: { createdAt: 'desc' },
    take: q.take,
    include: { user: { select: { name: true, role: true } } },
  });
  res.json({ logs });
});

// ---------------------------------------------------------------- upload de imagens

const uploadDir = path.resolve(env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ALLOWED[file.mimetype]}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in ALLOWED),
});

adminRoutes.post('/uploads', requireRole(), upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('INVALID_FILE', 'Envie uma imagem JPG, PNG ou WEBP de até 3 MB');
  await audit({ userId: req.user!.id, action: 'upload.image', entity: 'upload', entityId: req.file.filename, ip: clientIp(req) });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});
