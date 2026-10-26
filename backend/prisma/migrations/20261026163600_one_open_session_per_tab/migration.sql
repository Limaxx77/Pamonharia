-- Garante no banco que cada comanda tenha no máximo UM atendimento aberto.
-- (Prisma não suporta índices parciais no schema; por isso a migração manual.)
CREATE UNIQUE INDEX "tab_sessions_one_open_per_tab" ON "tab_sessions" ("tab_id") WHERE "status" = 'OPEN';

-- Garante que cada comanda tenha no máximo UM cartão NFC ativo.
CREATE UNIQUE INDEX "nfc_cards_one_active_per_tab" ON "nfc_cards" ("tab_id") WHERE "status" = 'ACTIVE';

-- Valores monetários e quantidades nunca negativos.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_cents" > 0);
ALTER TABLE "tab_sessions" ADD CONSTRAINT "tab_sessions_discount_non_negative" CHECK ("discount_cents" >= 0);
