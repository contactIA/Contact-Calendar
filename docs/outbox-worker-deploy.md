# Deploy do Outbox Worker (TASK-020)

O Outbox Worker (`src/lib/sync/outboxWorker.ts`) é disparado pelo endpoint
interno `POST /api/internal/outbox/tick`. Ele precisa ser chamado **a cada 1
minuto** para entregar as operações da fila `sync_outbox` na Helena em ≤5s.

## Por que não usamos Vercel Cron

O plano **free (Hobby) da Vercel só permite cron 1×/dia** — insuficiente para
entrega em ≤5s. Cron de 1 minuto exige Vercel Pro (US$20/mês) OU um scheduler
externo. **Decisão do projeto: rodar o cron no VPS** (Hostinger/TurboCloud), que
já é o destino de produção. Por isso não há `vercel.json` — o disparo é externo.

## Setup do cron no VPS (crontab)

O endpoint fica protegido por `OUTBOX_SECRET` (ver `.env.example`). No servidor:

```bash
# 1. Gere e guarde o secret (o mesmo valor que está em OUTBOX_SECRET no app):
#    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Edite o crontab:
crontab -e

# 3. Adicione a linha (troque a URL e o secret):
* * * * * curl -s -X POST -H "x-outbox-secret: SEU_OUTBOX_SECRET" https://SEU_DOMINIO/api/internal/outbox/tick > /dev/null 2>&1
```

- `* * * * *` = a cada 1 minuto.
- O endpoint responde **401** se o secret faltar/errar, **503** se `OUTBOX_SECRET`
  não estiver setado no app, **200** com `{processed,done,failed,retried,rateLimited}`
  em sucesso.
- Prefira `Authorization: Bearer SEU_OUTBOX_SECRET` se o seu scheduler já usar esse
  header — o endpoint aceita os dois.

## Alternativa: se um dia migrar para Vercel Pro

Recriar `vercel.json` com:

```json
{ "crons": [ { "path": "/api/internal/outbox/tick", "schedule": "* * * * *" } ] }
```

E definir `OUTBOX_SECRET` = `CRON_SECRET` nas Environment Variables da Vercel
(o Vercel Cron envia `Authorization: Bearer $CRON_SECRET` automaticamente).

## Variável de ambiente obrigatória

```
OUTBOX_SECRET=<32 bytes aleatórios em hex>
```
Sem ela, o endpoint responde 503 (fail-closed) e o worker não roda.
