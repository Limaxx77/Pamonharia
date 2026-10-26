/**
 * Popula um banco de DEMONSTRAÇÃO com dados fictícios.
 *
 * ATENÇÃO: apaga todos os dados do banco apontado por DATABASE_URL.
 * Por segurança, recusa-se a rodar se o banco já tiver atendimentos e não estiver marcado como demonstração.
 * Use sempre um banco separado do de produção (ex.: pamonharia_demo).
 */
import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient, type DiningTable, type OrderSource, type OrderStatus, type PaymentMethod, type Prisma } from '@prisma/client';
import { categories, products } from './catalog-data.js';

const prisma = new PrismaClient();
const cents = (v: number) => Math.round(v * 100);
const token = () => randomBytes(24).toString('base64url');

// Gerador pseudoaleatório determinístico: a demo fica igual a cada execução.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

async function guard() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } }).catch(() => null);
  const sessions = await prisma.tabSession.count().catch(() => 0);
  if (sessions > 0 && settings && !settings.demoMode && !process.argv.includes('--force')) {
    console.error('❌ Este banco possui atendimentos e NÃO está marcado como demonstração.');
    console.error('   Recusando apagar dados. Use um banco separado para a demo.');
    process.exit(1);
  }
}

async function wipe() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE payment_items, payments, order_item_addons, order_items, orders,
      tab_sessions, nfc_cards, tabs, tables, product_addons, products, categories,
      audit_logs, users, settings RESTART IDENTITY CASCADE`);
}

async function main() {
  await guard();
  await wipe();

  await prisma.settings.create({
    data: {
      id: 1,
      name: 'Pamonharia Sabor do Milho',
      tagline: 'Pamonha quentinha, feita com milho colhido no dia',
      phone: '(62) 99999-0000',
      address: 'Rua Fictícia, 123 — Centro (endereço de demonstração)',
      openingHours: 'Terça a domingo, das 14h às 22h',
      serviceFeePercent: 10,
      allowSelfOpen: true,
      kitchenLateMinutes: 20,
      demoMode: true,
    },
  });

  // ------------------------------------------------------------ funcionários
  const pass = await bcrypt.hash('demo1234', 10);
  const mk = (name: string, email: string, role: 'ADMIN' | 'WAITER' | 'KITCHEN' | 'CASHIER') =>
    prisma.user.create({ data: { name, email, role, passwordHash: pass } });
  const admin = await mk('Administrador Demo', 'admin@demo.com', 'ADMIN');
  const waiter1 = await mk('Carlos Mendes', 'garcom@demo.com', 'WAITER');
  const waiter2 = await mk('Juliana Rocha', 'garcom2@demo.com', 'WAITER');
  await mk('Marcos Lima', 'cozinha@demo.com', 'KITCHEN');
  const cashier = await mk('Fernanda Alves', 'caixa@demo.com', 'CASHIER');
  const waiters = [waiter1, waiter2];

  // ------------------------------------------------------------ cardápio
  const catIds = new Map<string, { id: string; name: string }>();
  for (const [i, c] of categories.entries()) {
    const row = await prisma.category.create({
      data: { name: c.name, slug: c.slug, description: c.description, imageUrl: c.image, sortOrder: i },
    });
    catIds.set(c.slug, { id: row.id, name: row.name });
  }
  const prods: (Prisma.ProductGetPayload<{ include: { addons: true } }> & { categoryName: string })[] = [];
  for (const [i, p] of products.entries()) {
    const row = await prisma.product.create({
      data: {
        categoryId: catIds.get(p.category)!.id,
        name: p.name,
        description: p.description,
        ingredients: p.ingredients,
        priceCents: cents(p.price),
        promoPriceCents: p.promo ? cents(p.promo) : null,
        imageUrl: p.image,
        featured: p.featured ?? false,
        prepMinutes: p.prep ?? 10,
        sortOrder: i,
        addons: { create: (p.addons ?? []).map((a, j) => ({ name: a.name, priceCents: cents(a.price), sortOrder: j })) },
      },
      include: { addons: true },
    });
    prods.push({ ...row, categoryName: catIds.get(p.category)!.name });
  }
  const byName = (n: string) => prods.find((p) => p.name === n)!;

  // ------------------------------------------------------------ mesas, comandas e cartões
  const tables: DiningTable[] = [];
  for (let n = 1; n <= 20; n++) {
    tables.push(
      await prisma.diningTable.create({
        data: { number: n, seats: n <= 12 ? 4 : n <= 18 ? 6 : 2, label: n >= 19 ? 'Varanda' : null },
      }),
    );
  }
  const tabs = new Map<number, { id: string }>();
  for (let n = 1; n <= 30; n++) {
    const tab = await prisma.tab.create({ data: { number: n, cards: { create: { token: token() } } } });
    tabs.set(n, tab);
  }
  // Um cartão bloqueado (perdido) para demonstrar a gestão de cartões
  const lostTab = await prisma.tab.create({ data: { number: 31 } });
  await prisma.nfcCard.create({
    data: { tabId: lostTab.id, token: token(), status: 'LOST', statusReason: 'Cliente levou o cartão', statusChangedAt: new Date() },
  });

  // ------------------------------------------------------------ helpers de pedidos
  type Line = { name: string; qty: number; addons?: string[]; note?: string };
  function buildItems(lines: Line[]) {
    return lines.map((l) => {
      const p = byName(l.name);
      const addons = (l.addons ?? []).map((a) => p.addons.find((x) => x.name === a)!);
      const unit = (p.promoPriceCents ?? p.priceCents) + addons.reduce((s, a) => s + a.priceCents, 0);
      return {
        productId: p.id,
        productName: p.name,
        categoryName: p.categoryName,
        unitPriceCents: unit,
        quantity: l.qty,
        totalCents: unit * l.qty,
        note: l.note ?? null,
        addons: { create: addons.map((a) => ({ addonId: a.id, name: a.name, priceCents: a.priceCents })) },
      };
    });
  }
  async function addOrder(sessionId: string, source: OrderSource, status: OrderStatus, lines: Line[], at: Date, userId?: string, extra: { cancelReason?: string; cancelledById?: string } = {}) {
    const items = buildItems(lines);
    return prisma.order.create({
      data: {
        sessionId,
        source,
        status,
        idempotencyKey: randomUUID(),
        createdById: source === 'WAITER' ? userId : null,
        totalCents: items.reduce((s, i) => s + i.totalCents, 0),
        createdAt: at,
        statusChangedAt: at,
        items: { create: items },
        ...(status === 'CANCELLED' ? { cancelReason: extra.cancelReason, cancelledById: extra.cancelledById, cancelledAt: at } : {}),
      },
    });
  }
  async function openAt(tabNumber: number, tableNumber: number | null, minutesAgo: number, customerName?: string | null, waiterId?: string) {
    const at = new Date(Date.now() - minutesAgo * 60000);
    return prisma.tabSession.create({
      data: {
        tabId: tabs.get(tabNumber)!.id,
        tableId: tableNumber ? tables[tableNumber - 1].id : null,
        customerName: customerName ?? null,
        waiterId: waiterId ?? null,
        openedById: waiterId ?? cashier.id,
        openedAt: at,
      },
    });
  }
  const ago = (min: number) => new Date(Date.now() - min * 60000);

  // ------------------------------------------------------------ histórico (últimos 30 dias, encerrados)
  const menuLines: Line[][] = [
    [{ name: 'Pamonha com queijo', qty: 2 }, { name: 'Refrigerante lata', qty: 2 }],
    [{ name: 'Pamonha salgada', qty: 1, addons: ['Queijo extra'] }, { name: 'Suco de laranja (500 ml)', qty: 1 }],
    [{ name: 'Pamonha doce tradicional', qty: 2 }, { name: 'Café coado', qty: 2 }],
    [{ name: 'Curau de milho', qty: 1 }, { name: 'Bolo de milho (fatia)', qty: 1 }, { name: 'Café coado', qty: 1, addons: ['Leite'] }],
    [{ name: 'Pamonha com carne', qty: 1 }, { name: 'Milho cozido', qty: 1, addons: ['Manteiga'] }, { name: 'Limonada', qty: 1 }],
    [{ name: 'Combo goiano', qty: 1 }, { name: 'Pudim de leite', qty: 1 }],
    [{ name: 'Pamonha à moda goiana', qty: 2 }, { name: 'Suco de maracujá com melancia (500 ml)', qty: 2 }],
    [{ name: 'Mandioca frita', qty: 1 }, { name: 'Queijo coalho na brasa', qty: 1 }, { name: 'Refrigerante lata', qty: 3 }],
    [{ name: 'Combo café da roça', qty: 2 }],
    [{ name: 'Canjica', qty: 2 }, { name: 'Pão de queijo (6 un.)', qty: 1 }],
    [{ name: 'Pamonha recheada da casa', qty: 1 }, { name: 'Cuscuz nordestino', qty: 1, addons: ['Ovo'] }, { name: 'Suco de laranja (500 ml)', qty: 1 }],
    [{ name: 'Pamonha doce com queijo', qty: 1 }, { name: 'Bolo de fubá', qty: 1 }, { name: 'Café coado', qty: 1 }],
  ];
  const methods: PaymentMethod[] = ['PIX', 'PIX', 'PIX', 'CREDIT', 'DEBIT', 'DEBIT', 'CASH'];
  const historyTabs = Array.from({ length: 30 }, (_, i) => i + 1);

  let closedCount = 0;
  for (let day = 30; day >= 1; day--) {
    const weekday = new Date(Date.now() - day * 86400000).getDay();
    if (weekday === 1) continue; // fechado às segundas
    const sessionsToday = between(4, weekday === 0 || weekday === 6 ? 11 : 7);
    for (let k = 0; k < sessionsToday; k++) {
      const date = new Date(Date.now() - day * 86400000);
      date.setHours(between(14, 21), between(0, 59), 0, 0);
      const table = rand() < 0.85 ? pick(tables) : null;
      const waiter = pick(waiters);
      const s = await prisma.tabSession.create({
        data: {
          tabId: tabs.get(pick(historyTabs))!.id,
          tableId: table?.id ?? null,
          waiterId: waiter.id,
          openedById: waiter.id,
          openedAt: date,
          status: 'CLOSED',
        },
      });
      let subtotal = 0;
      const nOrders = between(1, 3);
      for (let o = 0; o < nOrders; o++) {
        const at = new Date(date.getTime() + o * between(10, 25) * 60000);
        const source: OrderSource = rand() < 0.55 ? 'NFC' : 'WAITER';
        const cancelled = rand() < 0.04;
        const order = await addOrder(s.id, source, cancelled ? 'CANCELLED' : 'DELIVERED', pick(menuLines), at, waiter.id, {
          cancelReason: 'Cliente desistiu antes do preparo',
          cancelledById: cashier.id,
        });
        if (!cancelled) subtotal += order.totalCents;
      }
      if (subtotal === 0) {
        // Todos os pedidos foram cancelados: o cliente pediu outra coisa em seguida.
        const extra = await addOrder(s.id, 'WAITER', 'DELIVERED', menuLines[0], date, waiter.id);
        subtotal = extra.totalCents;
      }
      const total = subtotal + Math.round(subtotal * 0.1);
      const closedAt = new Date(date.getTime() + between(35, 90) * 60000);
      if (rand() < 0.2) {
        // conta dividida em duas formas de pagamento
        const first = Math.round(total / 2);
        await prisma.payment.create({ data: { sessionId: s.id, method: 'PIX', amountCents: first, idempotencyKey: randomUUID(), createdById: cashier.id, createdAt: closedAt } });
        await prisma.payment.create({ data: { sessionId: s.id, method: pick(methods), amountCents: total - first, idempotencyKey: randomUUID(), createdById: cashier.id, createdAt: closedAt } });
      } else {
        const m = pick(methods);
        await prisma.payment.create({
          data: {
            sessionId: s.id, method: m, amountCents: total, receivedCents: m === 'CASH' ? Math.ceil(total / 1000) * 1000 : null,
            idempotencyKey: randomUUID(), createdById: cashier.id, createdAt: closedAt,
          },
        });
      }
      await prisma.tabSession.update({ where: { id: s.id }, data: { closedAt, closedById: cashier.id } });
      closedCount++;
    }
  }
  // ------------------------------------------------------------ atendimentos abertos agora
  // Mesa 05 — três comandas individuais
  const s11 = await openAt(11, 5, 55, 'Cliente A', waiter1.id);
  await addOrder(s11.id, 'NFC', 'DELIVERED', [{ name: 'Pamonha com queijo', qty: 1 }, { name: 'Suco de laranja (500 ml)', qty: 1 }], ago(50));
  await addOrder(s11.id, 'NFC', 'PREPARING', [{ name: 'Curau de milho', qty: 1 }], ago(8));
  const s12 = await openAt(12, 5, 54, 'Cliente B', waiter1.id);
  await addOrder(s12.id, 'WAITER', 'DELIVERED', [{ name: 'Pamonha com carne', qty: 1 }, { name: 'Refrigerante lata', qty: 1 }], ago(48), waiter1.id);
  const s13 = await openAt(13, 5, 52, 'Cliente C', waiter1.id);
  await addOrder(s13.id, 'NFC', 'DELIVERED', [{ name: 'Pamonha doce tradicional', qty: 2, addons: ['Canela'] }, { name: 'Café coado', qty: 1 }], ago(45));

  // Mesa 08 — comanda 025 (cenário principal do enunciado)
  const s25 = await openAt(25, 8, 40, null, waiter2.id);
  await addOrder(s25.id, 'NFC', 'DELIVERED', [{ name: 'Pamonha com queijo', qty: 2 }, { name: 'Pamonha doce tradicional', qty: 1 }, { name: 'Refrigerante lata', qty: 2 }], ago(38));
  await addOrder(s25.id, 'WAITER', 'RECEIVED', [{ name: 'Pamonha salgada', qty: 1 }, { name: 'Suco de laranja (500 ml)', qty: 1 }], ago(2), waiter2.id);

  // Mesa 02 — pedido em preparação e atrasado
  const s3 = await openAt(3, 2, 35, 'Família Souza', waiter2.id);
  await addOrder(s3.id, 'WAITER', 'PREPARING', [{ name: 'Pamonha recheada da casa', qty: 2 }, { name: 'Mandioca frita', qty: 1, note: 'Bem sequinha' }, { name: 'Limonada', qty: 3 }], ago(26), waiter2.id);

  // Mesa 03 — pediu a conta
  const s4 = await openAt(4, 3, 70, null, waiter1.id);
  await addOrder(s4.id, 'NFC', 'DELIVERED', [{ name: 'Combo goiano', qty: 2 }, { name: 'Pudim de leite', qty: 2 }], ago(60));
  await prisma.tabSession.update({ where: { id: s4.id }, data: { billRequestedAt: ago(3) } });

  // Mesa 10 — acabou de sentar, aguardando pedido
  await openAt(7, 10, 4, null, waiter2.id);

  // Mesa 14 — pedido pronto aguardando entrega
  const s9 = await openAt(9, 14, 20, null, waiter1.id);
  await addOrder(s9.id, 'NFC', 'READY', [{ name: 'Pamonha à moda goiana', qty: 1, addons: ['Queijo extra'], note: 'Sem pimenta' }, { name: 'Suco de maracujá com melancia (500 ml)', qty: 1 }], ago(15));

  // Balcão (sem mesa) — comanda 030
  const s30 = await openAt(30, null, 10, 'Retirada balcão');
  await addOrder(s30.id, 'WAITER', 'RECEIVED', [{ name: 'Pamonha doce com queijo', qty: 3, note: 'Para viagem' }], ago(1), cashier.id);

  await prisma.auditLog.create({ data: { userId: admin.id, action: 'seed.demo', entity: 'system', data: { closedSessions: closedCount } } });

  const card25 = await prisma.nfcCard.findFirst({ where: { tab: { number: 25 }, status: 'ACTIVE' } });
  console.log('✅ Demo criada');
  console.log(`   ${products.length} produtos, 20 mesas, 30 comandas, ${closedCount} atendimentos históricos`);
  console.log('   Logins (senha demo1234): admin@demo.com, garcom@demo.com, garcom2@demo.com, cozinha@demo.com, caixa@demo.com');
  console.log(`   Cartão da comanda 025: ${(process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')}/c/${card25?.token}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
