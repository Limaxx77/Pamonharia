import { prisma } from '../lib/prisma.js';

/** Cardápio público: categorias ativas com produtos ativos (inclui indisponíveis, sinalizados). */
export async function getPublicMenu() {
  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      products: {
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { addons: { where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
      },
    },
  });
  return categories
    .filter((c) => c.products.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      products: c.products.map((p) => ({
        id: p.id,
        categoryId: p.categoryId,
        name: p.name,
        description: p.description,
        ingredients: p.ingredients,
        priceCents: p.priceCents,
        promoPriceCents: p.promoPriceCents,
        imageUrl: p.imageUrl,
        available: p.available,
        featured: p.featured,
        prepMinutes: p.prepMinutes,
        addons: p.addons.map((a) => ({ id: a.id, name: a.name, priceCents: a.priceCents })),
      })),
    }));
}

export async function getSettings() {
  return prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export function publicSettings(s: Awaited<ReturnType<typeof getSettings>>) {
  return {
    name: s.name,
    tagline: s.tagline,
    phone: s.phone,
    address: s.address,
    openingHours: s.openingHours,
    serviceFeePercent: Number(s.serviceFeePercent),
    allowSelfOpen: s.allowSelfOpen,
    demoMode: s.demoMode,
  };
}
