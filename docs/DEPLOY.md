# Implantação em produção

O caminho mais simples é **um único processo Node** servindo API, Socket.IO e o frontend compilado, atrás de HTTPS. Assim tudo fica no mesmo domínio: cookies, WebSocket e os links dos cartões NFC funcionam sem configuração extra de CORS.

## Requisitos

- Node.js 20+ e PostgreSQL 14+ (gerenciado ou na mesma VPS)
- Domínio com **HTTPS** (obrigatório: links dos cartões, cookie `Secure`, instalação como PWA)
- Defina o domínio **antes** de gravar os cartões: o link gravado é `PUBLIC_APP_URL/c/<token>`. Trocar de domínio exige regravar os cartões (ou manter um redirecionamento do domínio antigo).

## Variáveis de ambiente (`backend/.env`)

```env
NODE_ENV=production
PORT=3333
DATABASE_URL="postgresql://usuario:senha@host:5432/pamonharia?schema=public"
JWT_SECRET="<48+ caracteres aleatórios>"   # node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
PUBLIC_APP_URL=https://pedidos.suapamonharia.com.br
CORS_ORIGIN=https://pedidos.suapamonharia.com.br
APP_TIMEZONE=America/Sao_Paulo
SERVE_FRONTEND=true
COOKIE_SECURE=true
UPLOAD_DIR=/var/lib/pamonharia/uploads   # pasta persistente (fora do diretório de deploy)
```

Nunca coloque segredos no frontend: ele não usa nenhuma chave; tudo sensível fica no backend.

## Passos

```bash
git clone <repo> && cd <repo>
npm ci --include=dev       # ferramentas de build (tsc, vite, prisma) são devDependencies
npm run build                 # gera o Prisma Client, compila backend e frontend
npm run db:deploy             # aplica as migrations (não apaga dados)
ADMIN_NAME="Dono" ADMIN_EMAIL=dono@suapamonharia.com.br ADMIN_PASSWORD='uma-senha-forte' npm run seed:prod
npm start                     # inicia em PORT
```

Use um gerenciador de processos (PM2 ou systemd) para reiniciar automaticamente:

```bash
npm i -g pm2
pm2 start "npm start" --name pamonharia && pm2 save && pm2 startup
```

Depois, no painel: cadastre categorias, produtos, mesas (**Configurações → Mesas**), funcionários e comandas (**Cartões NFC → Cadastrar comandas**) e grave os cartões ([NFC.md](NFC.md)).

## Proxy reverso (Nginx) com WebSocket

```nginx
server {
  server_name pedidos.suapamonharia.com.br;
  client_max_body_size 4m;

  location / {
    proxy_pass http://127.0.0.1:3333;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;     # Socket.IO
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 75s;
  }
  # listen 443 ssl; ... (certificado via certbot --nginx)
}
```

O app confia em um proxy (`trust proxy = 1`), necessário para o limite de requisições por IP funcionar corretamente.

## Plataformas gerenciadas (Render, Railway, Fly.io…)

- **Build:** `npm ci --include=dev && npm run build` · **Start:** `npm run db:deploy && npm start`
- Configure as variáveis acima e um PostgreSQL da plataforma.
- Os uploads precisam de **disco persistente** (ou troque `admin.routes.ts` para um armazenamento de objetos como S3/R2).
- Socket.IO funciona com uma instância. Para várias instâncias, adicione o adaptador Redis do Socket.IO (`@socket.io/redis-adapter`) e sessões “sticky”.

## Frontend e API em domínios separados (opcional)

Faça o build do frontend com `VITE_API_URL=https://api.seu-dominio.com.br npm run build --workspace frontend`, hospede `frontend/dist` como site estático (com fallback de rotas para `index.html`) e configure `CORS_ORIGIN` com o domínio do frontend. Prefira subdomínios do mesmo domínio para o cookie de sessão funcionar bem nos navegadores com bloqueio de cookies de terceiros.

## Demonstração × produção

- Mantenha **bancos separados** (`pamonharia_demo` e `pamonharia`). O `seed:demo` apaga o banco e se recusa a rodar em um banco com atendimentos que não esteja marcado como demonstração.
- Uma instância de demonstração pública pode usar o mesmo build com outro `DATABASE_URL`; ela exibirá a faixa “AMBIENTE DE DEMONSTRAÇÃO”.

## Operação

- **Backups:** `pg_dump` diário do banco de produção + cópia da pasta de uploads.
- **Atualizações:** `git pull && npm ci && npm run build && npm run db:deploy && pm2 restart pamonharia`.
- **Saúde:** `GET /api/health`.
- **Auditoria:** Configurações → Auditoria (logins, descontos, estornos, reaberturas, cartões…).
- **LGPD:** o sistema guarda apenas o nome opcional do cliente e dados de funcionários. Defina política de retenção e informe os clientes conforme sua política de privacidade.
