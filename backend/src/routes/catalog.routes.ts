import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { conflict, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';
import { clientIp, idParam, parseBody } from '../middleware/validate.js';
import { emitAll, RT } from '../realtime/io.js';

export const catalogRoutes = Router();

const menuChanged = () => emitAll(RT.MENU_UPDATED, {});

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Aceita URL absoluta (http/https) ou caminho de upload local (/uploads/...). */
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\//.test(v) || v.startsWith('/'), 'URL de imagem inválida')
  .transform((v) => v || null)
  .nullable()
  .optional();

// ---------------------------------------------------------------- categorias

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional().nullable(),
  imageUrl,
  sortOrder: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

catalogRoutes.get('/categories', requireRole(), async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  res.json({ categories });
});

catalogRoutes.post('/categories', requireRole(), async (req, res) => {
  const data = parseBody(categorySchema, req);
  let slug = slugify(data.name);
  if (await prisma.category.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
  const category = await prisma.category.create({ data: { ...data, slug } });
  await audit({ userId: req.user!.id, action: 'category.create', entity: 'category', entityId: category.id, data, ip: clientIp(req) });
  menuChanged();
  res.status(201).json({ category });
});

catalogRoutes.patch('/categories/:id', requireRole(), async (req, res) => {
  const id = idParam(req);
  const data = parseBody(categorySchema.partial(), req);
  const category = await prisma.category.update({ where: { id }, data });
  await audit({ userId: req.user!.id, action: 'category.update', entity: 'category', entityId: id, data, ip: clientIp(req) });
  menuChanged();
  res.json({ category });
});

catalogRoutes.delete('/categories/:id', requireRole(), async (req, res) => {
  const id = idParam(req);
  const count = await prisma.product.count({ where: { categoryId: id } });
  if (count > 0) throw conflict('CATEGORY_IN_USE', 'Mova ou exclua os produtos desta categoria antes de excluí-la (ou desative-a)');
  await prisma.category.delete({ where: { id } });
  await audit({ userId: req.user!.id, action: 'category.delete', entity: 'category', entityId: id, ip: clientIp(req) });
  menuChanged();
  res.json({ ok: true });
});

// ---------------------------------------------------------------- produtos

const addonSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(1).max(60),
  priceCents: z.number().int().min(0).max(1_000_000),
  active: z.boolean().default(true),
});

const productSchema = z.object({
  categoryId: z.string().min(1).max(64),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).default(''),
  ingredients: z.string().trim().max(400).default(''),
  priceCents: z.number().int().min(0).max(1_000_000),
  promoPriceCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  imageUrl,
  available: z.boolean().default(true),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  prepMinutes: z.number().int().min(0).max(240).default(10),
  sortOrder: z.number().int().min(0).max(999).default(0),
  addons: z.array(addonSchema).max(20).optional(),
});

const productInclude = {
  category: { select: { id: true, name: true } },
  addons: { orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }] },
};

catalogRoutes.get('/products', requireRole(), async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { ...productInclude, _count: { select: { orderItems: true } } },
  });
  res.json({ products });
});

catalogRoutes.post('/products', requireRole(), async (req, res) => {
  const { addons, ...data } = parseBody(productSchema, req);
  const product = await prisma.product.create({
    data: {
      ...data,
      addons: addons ? { create: addons.map(({ id: _id, ...a }, i) => ({ ...a, sortOrder: i })) } : undefined,
    },
    include: productInclude,
  });
  await audit({ userId: req.user!.id, action: 'product.create', entity: 'product', entityId: product.id, data: { name: data.name, priceCents: data.priceCents }, ip: clientIp(req) });
  menuChanged();
  res.status(201).json({ product });
});

/**
 * Atualiza o produto. Adicionais enviados substituem a lista atual: existentes são atualizados,
 * novos são criados e os removidos são desativados (preservando o histórico de vendas).
 */
catalogRoutes.patch('/products/:id', requireRole(), async (req, res) => {
  const id = idParam(req);
  const { addons, ...data } = parseBody(productSchema.partial(), req);
  const before = await prisma.product.findUnique({ where: { id }, include: { addons: true } });
  if (!before) throw notFound('Produto não encontrado');

  const product = await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data });
    if (addons) {
      const keep = new Set(addons.filter((a) => a.id).map((a) => a.id!));
      await tx.productAddon.updateMany({ where: { productId: id, id: { notIn: [...keep] } }, data: { active: false } });
      for (const [i, a] of addons.entries()) {
        if (a.id && before.addons.some((x) => x.id === a.id)) {
          await tx.productAddon.update({ where: { id: a.id }, data: { name: a.name, priceCents: a.priceCents, active: a.active, sortOrder: i } });
        } else {
          await tx.productAddon.create({ data: { productId: id, name: a.name, priceCents: a.priceCents, active: a.active, sortOrder: i } });
        }
      }
    }
    return tx.product.findUniqueOrThrow({ where: { id }, include: productInclude });
  });

  const changes: Record<string, unknown> = { ...data };
  if (data.priceCents !== undefined && data.priceCents !== before.priceCents) changes.previousPriceCents = before.priceCents;
  await audit({ userId: req.user!.id, action: 'product.update', entity: 'product', entityId: id, data: changes as object, ip: clientIp(req) });
  menuChanged();
  res.json({ product });
});

/** Exclusão: produtos já vendidos são apenas desativados, para preservar o histórico. */
catalogRoutes.delete('/products/:id', requireRole(), async (req, res) => {
  const id = idParam(req);
  const sold = await prisma.orderItem.count({ where: { productId: id } });
  if (sold > 0) {
    await prisma.product.update({ where: { id }, data: { active: false } });
    await audit({ userId: req.user!.id, action: 'product.deactivate', entity: 'product', entityId: id, ip: clientIp(req) });
    menuChanged();
    res.json({ ok: true, deactivated: true });
    return;
  }
  await prisma.product.delete({ where: { id } });
  await audit({ userId: req.user!.id, action: 'product.delete', entity: 'product', entityId: id, ip: clientIp(req) });
  menuChanged();
  res.json({ ok: true, deleted: true });
});

/** Disponibilidade rápida (ex.: "acabou a pamonha doce") — liberado também para a cozinha. */
catalogRoutes.patch('/products/:id/availability', requireRole('KITCHEN'), async (req, res) => {
  const id = idParam(req);
  const { available } = parseBody(z.object({ available: z.boolean() }), req);
  const product = await prisma.product.update({ where: { id }, data: { available } });
  await audit({ userId: req.user!.id, action: 'product.availability', entity: 'product', entityId: id, data: { available }, ip: clientIp(req) });
  menuChanged();
  res.json({ product });
});

/** Lista enxuta para a cozinha controlar disponibilidade. */
catalogRoutes.get('/availability', requireRole('KITCHEN'), async (_req, res) => {
  const products = await prisma.product.findMany({
    where: { active: true },
    select: { id: true, name: true, available: true, imageUrl: true, category: { select: { name: true } } },
    orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
  });
  res.json({ products });
});
