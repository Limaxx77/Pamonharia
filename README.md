# 🌽 Pamonharia — Cardápio digital, comandas NFC e gestão

Sistema web completo e mobile-first para pamonharia: o cliente aproxima o celular do **cartão NFC da comanda** e faz o pedido pelo cardápio digital; o **garçom** lança pedidos por mesa no mesmo controle de consumo; a **cozinha** recebe tudo em tempo real; o **caixa** fecha a conta (pagamento parcial, dividido, várias formas); a **administração** gerencia cardápio, cartões, funcionários e relatórios.

> Pedidos do cartão NFC e do garçom passam pela **mesma rotina** e alimentam **a mesma comanda**. Não existe controle paralelo de consumo.

## Telas

| Público | Funcionários |
|---|---|
| Tela inicial (`/`) | Login (`/login`) |
| Cardápio para consulta (`/cardapio`) | Painel administrativo (`/app`) |
| App da comanda NFC (`/c/:token`): cardápio, detalhes do produto, carrinho, acompanhamento dos pedidos e conta parcial | Garçom (`/app/garcom`) · Mesas (`/app/mesas`) · Mesa (`/app/mesas/:id`) · Comanda (`/app/comandas/:id`) · Pedido do garçom |
| | Cozinha (`/app/cozinha`) · Caixa (`/app/caixa`) e fechamento |
| | Produtos · Categorias · Funcionários · Cartões NFC · Relatórios · Configurações (estabelecimento, mesas, auditoria) |

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, Lucide, Recharts, PWA (manifest + service worker)
- **Backend:** Node.js, Express 5, TypeScript, Zod, Socket.IO, JWT em cookie httpOnly, bcrypt
- **Banco:** PostgreSQL + Prisma ORM (migrations versionadas)
- **Testes:** Vitest + Supertest contra PostgreSQL real

```
├── backend/
│   ├── prisma/            schema, migrations, seed de demonstração e de produção
│   ├── src/
│   │   ├── config/        variáveis de ambiente (validadas com Zod)
│   │   ├── lib/           prisma, erros, auditoria, tokens
│   │   ├── middleware/    autenticação/perfis, validação
│   │   ├── services/      regras de negócio (sessões, pedidos, pagamentos, relatórios, cardápio)
│   │   ├── routes/        rotas REST (controladores finos que chamam os serviços)
│   │   └── realtime/      Socket.IO (salas por perfil e por atendimento)
│   └── tests/             cenários obrigatórios automatizados
├── frontend/
│   ├── public/            ícones, manifest, service worker, imagens dos produtos (+ créditos)
│   └── src/
│       ├── components/    UI reutilizável (cardápio, carrinho, pedidos, gráficos…)
│       ├── layouts/       layout dos funcionários (menu lateral / barra inferior por perfil)
│       ├── lib/           API, autenticação, tempo real, carrinho, formatação
│       └── pages/         telas públicas, cliente NFC, operação e administração
└── docs/                  API.md · NFC.md · DEPLOY.md
```

## Como rodar localmente

Pré-requisitos: **Node.js 20+** e **PostgreSQL 14+**.

```bash
# 1. Dependências (instala backend e frontend)
npm install

# 2. Crie os bancos (use bancos SEPARADOS para demonstração e produção)
#    psql -U postgres -c "create database pamonharia_demo;"

# 3. Configure o backend
cp backend/.env.example backend/.env
#    edite DATABASE_URL e JWT_SECRET (gere com o comando indicado no arquivo)

# 4. Crie as tabelas e carregue a demonstração
npm run db:deploy
npm run seed:demo        # apaga e recria os dados do banco de DEMO

# 5. Suba backend (porta 3333) e frontend (porta 5173), em dois terminais
npm run dev:backend
npm run dev:frontend
```

Acesse http://localhost:5173. Para testar no celular, use a mesma rede Wi-Fi e abra `http://IP-DO-COMPUTADOR:5173` (ajuste `PUBLIC_APP_URL` e `CORS_ORIGIN` para esse endereço e rode o seed de novo para que os links dos cartões usem o IP).

### Acessos de demonstração (senha `demo1234`)

| Perfil | E-mail |
|---|---|
| Administrador | admin@demo.com |
| Garçom | garcom@demo.com · garcom2@demo.com |
| Cozinha | cozinha@demo.com |
| Caixa | caixa@demo.com |

O seed imprime o link do **cartão da comanda 025**. Todos os links ficam em **Cartões NFC** (copiar URL, QR Code, “Testar link”).

### Dados de demonstração

20 mesas, 31 comandas (30 com cartão ativo e 1 marcada como perdida), 24 produtos com imagens em 8 categorias, 5 funcionários, 159 atendimentos encerrados nos últimos 30 dias (para os gráficos) e atendimentos abertos prontos para testar:

- **Mesa 05** com três comandas (011 Cliente A, 012 Cliente B, 013 Cliente C)
- **Mesa 08 / comanda 025** com pedido NFC entregue e pedido do garçom recebido
- Mesa 02 com pedido atrasado em preparo · Mesa 03 pedindo a conta · Mesa 10 aguardando pedido · Mesa 14 com pedido pronto · Comanda 030 no balcão

Os dados de demonstração ficam isolados:
- banco próprio (`pamonharia_demo`), marcado com `demo_mode = true`;
- a interface exibe a faixa **“AMBIENTE DE DEMONSTRAÇÃO · dados e valores fictícios”** e os relatórios avisam que os valores não são vendas reais;
- o `seed:demo` **recusa-se a apagar** um banco que tenha atendimentos e não esteja marcado como demonstração;
- produção usa `npm run seed:prod`, que cria apenas as configurações e o primeiro administrador (veja [docs/DEPLOY.md](docs/DEPLOY.md)).

## Testes

```bash
cp backend/.env.test.example backend/.env.test   # banco EXCLUSIVO de testes (o nome precisa conter "test")
npm test
```

São 23 testes de integração (API real + PostgreSQL) cobrindo os cenários exigidos:

| Cenário | O que é verificado |
|---|---|
| 1 — NFC | link do cartão 025 → pedido → evento em tempo real na cozinha, comanda e totais corretos; adicionais somados; preço praticado preservado após mudar o cardápio; produto indisponível recusado |
| 2 — Garçom | mesa 08 / comanda 025: pedido do garçom soma no mesmo consumo, visível também pelo cartão |
| 3 — Múltiplas comandas | mesa com 3 comandas: consumo individual + total consolidado; um cartão não pede na comanda de outro |
| 4 — Fechamento | pagamento parcial mantém aberta; pagamento acima do saldo recusado; pagamento final fecha; NFC e garçom bloqueados; reabertura só por admin, com auditoria |
| 5 — Reutilização | novo atendimento começa zerado; carrinho do atendimento anterior recusado (`SESSION_CHANGED`); histórico preservado; nunca duas sessões abertas na mesma comanda |
| 7 — Concorrência | 10 pedidos simultâneos (NFC + garçom) sem perda; mesmo pedido reenviado 6× gravado 1×; 4 pagamentos simultâneos do saldo → só 1 aceito; pedido × fechamento simultâneos sem consumo “perdido” |
| 8 — Segurança NFC | cartão bloqueado/revogado não abre nem pede; reemissão invalida o link antigo; token inválido → 404; auto-abertura desligada respeitada; perfis sem permissão recebem 401/403 |
| Extras | cancelamento com motivo/responsável fora do total; fluxo de status da cozinha; relatório = soma dos pagamentos |

O **cenário 6 (mobile)** foi verificado com navegador real (Microsoft Edge headless): todas as telas em 360, 390 e 414 px de largura e em desktop, sem rolagem horizontal, imagens quebradas ou erros de console, além do fluxo ponta a ponta “cliente pede pelo cartão → cozinha recebe sem recarregar → cozinha muda status → cliente vê”.

## Regras de negócio e decisões importantes

- **Uma rotina de pedido** (`services/order.service.ts`) para NFC e garçom; a sessão é bloqueada com `SELECT … FOR UPDATE` e o status é conferido dentro da transação.
- **Idempotência:** cada envio carrega uma chave única (`idempotencyKey`, com índice único). Clique duplo, reenvio por rede instável ou retry devolvem o mesmo pedido/pagamento.
- **Preço praticado:** nome, categoria, preço unitário e adicionais são copiados para o item no momento da venda.
- **Um atendimento aberto por comanda** — garantido também no banco por índice único parcial; idem **um cartão ativo por comanda**.
- **Comanda fechada não recebe pedidos.** Reutilizar o cartão = abrir um novo atendimento; o anterior permanece no histórico. Reabrir exige administrador + motivo (auditado).
- **Pedido cancelado** continua no histórico com motivo, responsável e horário; garçom só cancela o que ainda não entrou em preparo.
- **Pagamento** é registro operacional (não confirma transação de adquirente/PIX). Suporta parcial, divisão igual, divisão por itens (`payment_items`), várias formas, troco, desconto com motivo e taxa de serviço configurável. Fecha automaticamente ao quitar.
- **Auditoria** (`audit_logs`) de logins, aberturas, transferências, descontos, pagamentos, estornos, cancelamentos, reaberturas, cartões, produtos e usuários.
- **Offline:** o service worker só acelera arquivos estáticos. Pedidos **não** são enfileirados offline — sem conexão, o botão de confirmar fica bloqueado com aviso; ao voltar, o reenvio usa a mesma chave de idempotência e não duplica.

## O que depende de configuração externa

| Item | Situação |
|---|---|
| Gravação física dos cartões NFC | Pronto para uso: gere/copiar URL ou QR em **Cartões NFC** e grave com um app (passo a passo em [docs/NFC.md](docs/NFC.md)). Precisa de tags NTAG213/215 e de um celular com NFC. |
| Domínio com HTTPS | Necessário em produção (links dos cartões, cookies seguros, PWA). Veja [docs/DEPLOY.md](docs/DEPLOY.md). |
| Integração com maquininha/adquirente e PIX dinâmico | **Não implementada** (exige credenciais do provedor). O caixa registra o pagamento após confirmar na maquininha/app do banco. O ponto de integração é `services/payment.service.ts`. |
| Cartões NFC anti-clonagem (NTAG 424 DNA / SUN) | Opcional, não implementado. Os cartões atuais (URL estática) podem ser copiados por quem tiver o cartão em mãos; as mitigações estão em [docs/NFC.md](docs/NFC.md#segurança). |
| Notificações push com o app fechado | Não implementado (exige servidor de push/VAPID). Com a tela aberta, cozinha e garçom recebem alerta visual, sonoro e vibração. |

## Imagens

As fotos dos produtos são do **Wikimedia Commons**, armazenadas no projeto em duas resoluções (500 e 960 px, servidas via `srcset`), com autor e licença em `frontend/public/images/products/credits.json` e na tela inicial (“Créditos das imagens”). Curau e refrigerante usam **ilustrações próprias**, identificadas com o selo “Ilustração”. Toda imagem tem fallback automático caso o endereço falhe. Imagens novas podem ser enviadas pelo painel (JPG/PNG/WEBP até 3 MB) ou informadas por URL.

## Documentação

- [docs/API.md](docs/API.md) — endpoints, perfis e eventos em tempo real
- [docs/NFC.md](docs/NFC.md) — como configurar e gravar os cartões NFC
- [docs/DEPLOY.md](docs/DEPLOY.md) — implantação em produção
