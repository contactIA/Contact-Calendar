# Deploy do Outbox Worker (TASK-020) — Passo a Passo

> **O que é:** o Outbox Worker é o "carteiro" que entrega as movimentações de card
> na Helena. Ele não roda sozinho — precisa de um "despertador" (cron) chamando o
> endpoint `POST /api/internal/outbox/tick` a cada 1 minuto.
>
> **Onde roda:** no **VPS** (`179.197.235.183`), não na Vercel. O plano free da
> Vercel só permite cron 1×/dia, insuficiente para entregar em ≤5s. Por isso o
> cron fica no VPS (crontab), batendo no endpoint do app.

---

## Visão geral (o que precisa estar de pé)

```
[crontab do VPS] --a cada 1 min--> POST /api/internal/outbox/tick
                                          ↓ (valida OUTBOX_SECRET)
                                    processOutbox() drena sync_outbox
                                          ↓
                                    moveCard() na Helena
```

Três coisas têm que estar prontas, nesta ordem:
1. **App no ar** no VPS, com a variável `OUTBOX_SECRET` no ambiente
2. **Migration 0010** aplicada no Supabase ✅ (já feita)
3. **Crontab** no VPS chamando o endpoint com o mesmo `OUTBOX_SECRET`

---

## PARTE 1 — Gerar o segredo (faça uma vez)

No seu PC ou no VPS, gere uma string aleatória de 32 bytes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Isso imprime algo como `a1b2c3...` (64 caracteres). **Copie esse valor** — ele vai
ser usado em DOIS lugares (o app e o crontab), com o MESMO valor nos dois.

> ⚠️ Se o app e o crontab tiverem valores diferentes, o endpoint responde 401 e
> nada é entregue.

---

## PARTE 2 — Subir o app no VPS

> Pré-requisito: Node 20+ e o repositório clonado no VPS. Conecte com
> `ssh contactia-app` (usuário `contactia`).

### 2.1 — Instalar dependências e buildar
```bash
cd /caminho/do/Contact-Calendar
npm ci
npm run build
```

### 2.2 — Configurar as variáveis de ambiente
Crie/edite o arquivo `.env.local` (ou as env vars do seu gerenciador) com TODAS
as chaves — as que já existem + a nova `OUTBOX_SECRET`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...
HELENA_API_TOKEN=...
INTEGRATIONS_ENCRYPTION_KEY=...
OUTBOX_SECRET=<cole aqui o valor gerado na PARTE 1>
```

### 2.3 — Rodar o app de forma persistente (PM2 recomendado)
```bash
# instala o PM2 uma vez (gerencia o processo, reinicia se cair)
npm install -g pm2

# sobe o Next em produção
pm2 start "npm run start" --name contact-app

# faz o PM2 subir sozinho quando o servidor reiniciar
pm2 startup
pm2 save
```
O app fica em `http://localhost:3000` no VPS. O Nginx (se você usa) faz o proxy do
seu domínio para essa porta.

### 2.4 — Confirmar que o app respondeu
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/internal/outbox/tick
```
Deve responder **401** (sem o secret) — isso já prova que o endpoint está no ar e
protegido. ✅

---

## PARTE 3 — Configurar o cron no VPS

### 3.1 — Abrir o editor de crontab
```bash
crontab -e
```
(Se perguntar o editor, escolha `nano` — é o mais simples.)

### 3.2 — Adicionar a linha do cron
Cole esta linha no final do arquivo, **trocando** `SEU_OUTBOX_SECRET` pelo valor
da PARTE 1 e `SEU_DOMINIO` pelo domínio/subdomínio do app:

```cron
* * * * * curl -s -X POST -H "x-outbox-secret: SEU_OUTBOX_SECRET" https://SEU_DOMINIO/api/internal/outbox/tick > /dev/null 2>&1
```

Explicando cada parte:
- `* * * * *` → "a cada 1 minuto"
- `curl -s -X POST` → faz o POST silencioso
- `-H "x-outbox-secret: ..."` → manda o segredo no header (é o que autentica)
- `> /dev/null 2>&1` → descarta a saída (não polui o log do cron)

> 💡 Se o app estiver na mesma máquina, pode usar `http://localhost:3000/...` em vez
> do domínio — é mais rápido e não sai para a internet.

### 3.3 — Salvar
No `nano`: `Ctrl+O` → Enter (salva) → `Ctrl+X` (sai). O cron já está ativo.

### 3.4 — Confirmar que o cron foi registrado
```bash
crontab -l
```
Deve listar a linha que você adicionou.

---

## PARTE 4 — Testar que está entregando

### 4.1 — Disparar manualmente (simula o cron)
```bash
curl -s -X POST -H "x-outbox-secret: SEU_OUTBOX_SECRET" https://SEU_DOMINIO/api/internal/outbox/tick
```
Resposta esperada (fila vazia):
```json
{"processed":0,"done":0,"failed":0,"retried":0,"rateLimited":0}
```
Se veio esse JSON com **HTTP 200** → está tudo funcionando. Quando houver itens na
fila (a TASK-022 vai enfileirar), o `processed` sobe.

### 4.2 — Tabela de respostas (o que cada código significa)
| Resposta | Significado | O que fazer |
|----------|-------------|-------------|
| **200** + JSON | ✅ funcionando | nada, está certo |
| **401** unauthorized | secret errado/ausente no header | conferir o `OUTBOX_SECRET` no crontab |
| **503** service unavailable | `OUTBOX_SECRET` não está no `.env` do app | setar a env var e reiniciar o app (`pm2 restart contact-app`) |
| **405** method not allowed | usou GET em vez de POST | usar `-X POST` |

---

## Resumo rápido (checklist)

- [ ] Gerei o `OUTBOX_SECRET` (PARTE 1)
- [ ] Coloquei `OUTBOX_SECRET` no `.env` do app no VPS (mesmo valor)
- [ ] `npm ci && npm run build && pm2 start` — app no ar (PARTE 2)
- [ ] `curl` no endpoint sem secret responde 401 (app protegido)
- [ ] Adicionei a linha no `crontab -e` com o mesmo secret (PARTE 3)
- [ ] `curl` com o secret responde 200 + JSON (PARTE 4)

Com isso, o worker roda sozinho a cada minuto. 🎉

---

## Alternativa: Vercel Pro (se um dia largar o VPS)

Recriar `vercel.json` na raiz:
```json
{ "crons": [ { "path": "/api/internal/outbox/tick", "schedule": "* * * * *" } ] }
```
E nas Environment Variables da Vercel, definir `OUTBOX_SECRET` = `CRON_SECRET`
(o Vercel Cron envia `Authorization: Bearer $CRON_SECRET` automaticamente — o
endpoint aceita esse header também). Custo: US$20/mês/membro.
