import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { clientIp, idParam, parseBody } from '../middleware/validate.js';
import { cancelOrder, listKitchenOrders, serializeKitchenOrder, updateOrderStatus } from '../services/order.service.js';
import { getSettings } from '../services/menu.service.js';

export const orderRoutes = Router();

/** Fila da cozinha (e pedidos prontos para o garçom), em ordem de chegada. */
orderRoutes.get('/kitchen', requireRole('KITCHEN', 'WAITER', 'CASHIER'), async (_req, res) => {
  const [active, delivered, settings] = await Promise.all([
    listKitchenOrders(['RECEIVED', 'PREPARING', 'READY']),
    listKitchenOrders(['DELIVERED'], new Date(Date.now() - 60 * 60 * 1000)),
    getSettings(),
  ]);
  res.json({
    lateMinutes: settings.kitchenLateMinutes,
    serverTime: new Date(),
    orders: active.map(serializeKitchenOrder),
    recentlyDelivered: delivered.slice(-20).reverse().map(serializeKitchenOrder),
  });
});

orderRoutes.patch('/:id/status', requireRole('KITCHEN', 'WAITER'), async (req, res) => {
  const { status } = parseBody(z.object({ status: z.enum(['RECEIVED', 'PREPARING', 'READY', 'DELIVERED']) }), req);
  const order = await updateOrderStatus(idParam(req), status, req.user!);
  res.json({ order: serializeKitchenOrder(order) });
});

orderRoutes.post('/:id/cancel', requireRole('WAITER', 'CASHIER'), async (req, res) => {
  const { reason } = parseBody(z.object({ reason: z.string().trim().min(3, 'Informe o motivo').max(200) }), req);
  const order = await cancelOrder(idParam(req), reason, req.user!, clientIp(req));
  res.json({ order: serializeKitchenOrder(order) });
});
