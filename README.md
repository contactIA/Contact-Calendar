# Escala Agenda — Agenda Odontológica White Label

> Plataforma de agendamento clínico multi-tenant com suporte nativo a agentes de IA via WhatsApp.

---

## Visão Geral

O **Escala Agenda** resolve dois problemas ao mesmo tempo:

1. **Agenda humana** — recepcionistas, dentistas e gestores têm uma interface visual para gerenciar consultas, horários e pacientes.
2. **Agenda da IA** — agentes de IA (conectados via WhatsApp, telefone ou chatbot) consomem a mesma API REST para agendar consultas de forma 100% autônoma, sem intervenção humana.

A plataforma é **white label**: cada clínica (ou rede de clínicas) opera em uma conta isolada com tema visual próprio, dentistas, unidades e regras de prioridade configuráveis.

---

## Como o Sistema Funciona

```
┌─────────────────────────────────────────────────────────┐
│                    CANAIS DE ENTRADA                    │
│                                                         │
│  Paciente (WhatsApp)        Recepcionista (Browser)     │
│         │                          │                   │
│         ▼                          ▼                   │
│   Helena / WTS Chat          Interface React           │
│   (plataforma de chat)       (a construir)             │
└────────────┬───────────────────────┬────────────────────┘
             │ webhook               │ HTTP
             ▼                       ▼
┌─────────────────────────────────────────────────────────┐
│                   AGENTE DE IA                          │
│                                                         │
│  Recebe mensagem → entende intenção → consulta API      │
│  → confirma agendamento → responde ao paciente          │
└────────────────────────┬────────────────────────────────┘
                         │ REST API (JWT)
                         ▼
┌─────────────────────────────────────────────────────────┐
│              ESCALA AGENDA — BACKEND (Next.js)          │
│                                                         │
│  /api/auth          /api/slots         /api/patients    │
│  /api/appointments  /api/dentists      /api/helena      │
└────────────────────────┬────────────────────────────────┘
                         │ supabase-js (service role)
                         ▼
┌─────────────────────────────────────────────────────────┐
│              SUPABASE — BANCO DE DADOS                  │
│                                                         │
│  PostgreSQL 17 · RLS por account_id · sa-east-1 (SP)   │
│                                                         │
│  accounts  users  units  chairs  dentists               │
│  patients  appointments  schedule_blocks                │
│  procedures  dentist_priorities  ai_api_keys            │
└─────────────────────────────────────────────────────────┘
```

---

## Fluxo do Agente de IA (Agendamento Autônomo)

```
1. Paciente manda mensagem no WhatsApp
         │
         ▼
2. Helena dispara webhook → Agente recebe { sessionId, contact, lastMessage }
         │
         ▼
3. POST /api/auth/ai  →  JWT (60min)
         │
         ▼
4. GET  /api/patients?q=<telefone>
   ├── Encontrado → usa patient_id existente
   └── Não encontrado → POST /api/patients → cria cadastro
         │
         ▼
5. GET  /api/dentists/priority?unit_id=&procedure_id=&patient_id=&date=
   └── Retorna dentistas ordenados por:
       histórico com paciente → ocupação do dia → prioridade numérica
         │
         ▼
6. Para cada dentista (em ordem de prioridade):
   GET /api/slots/available?dentist_id=&unit_id=&procedure_id=&date=
   └── Retorna slots { start_at, end_at, chair_id } disponíveis
         │
         ▼
7. Agente apresenta opções ao paciente (via Helena)
   Paciente escolhe horário
         │
         ▼
8. POST /api/appointments/check-conflicts  →  { has_conflict: false }
         │
         ▼
9. POST /api/appointments  →  consulta criada (status: scheduled)
         │
         ▼
10. Agente confirma ao paciente via Helena
    └── Se não houver slots disponíveis:
        POST /api/helena/transfer → encaminha para recepcionista humana
```

---

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 (App Router) |
| Linguagem | TypeScript |
| Banco de dados | PostgreSQL 17 via Supabase |
| Autenticação | JWT customizado (jose) + API Key (bcryptjs) |
| Validação | Zod |
| Estilo (UI futura) | Tailwind CSS |
| Mensageria | Helena / WTS Chat API |
| Deploy (previsto) | Vercel |

---

## Modelo de Dados

```
Account (Tenant — clínica ou rede)
├── Users (admin · receptionist · dentist)
├── Units (filiais)
│   ├── Chairs (cadeiras de atendimento)
│   └── Dentist_Units (vínculo dentista ↔ unidade, com prioridade)
├── Dentists
│   ├── Dentist_Schedules (horários de trabalho por dia da semana)
│   └── Dentist_Priorities (regras de prioridade para a IA)
├── Procedures (tipos de procedimento: duração, cor, especialidade)
├── Patients (cadastro único por conta, atendido em qualquer unidade)
├── Appointments (consultas — objeto central)
│   └── status: scheduled → confirmed → in_progress → completed
│                                    ↘ cancelled · no_show
├── Schedule_Blocks (bloqueios: ausência, intervalo, reunião, reservado)
└── AI_API_Keys (chaves para autenticação do agente de IA)
```

### Regras de negócio críticas

- **Conflito de cadeira é bloqueante** — duas consultas não podem ocupar a mesma cadeira no mesmo horário, mesmo com dentistas diferentes. Retorna `409`.
- **Proteção contra race condition** — o `POST /api/appointments` re-verifica conflito atomicamente antes do INSERT, independente do `check-conflicts` ter sido chamado.
- **Slot disponível** exige todas as condições: dentista trabalha naquele dia/unidade + sem bloqueio manual + cadeira livre + dentista sem outra consulta + duração do procedimento cabe no horário restante.
- **Isolamento multi-tenant** — `account_id` é obrigatório em todas as queries. RLS no Supabase como segunda linha de defesa.

---

## Autenticação

### Usuário humano (recepcionista / dentista / admin)

```http
POST /api/auth/url
Content-Type: application/json

{ "accountId": "uuid", "userId": "external-id-do-white-label" }

→ { "token": "jwt", "expires_in": 900, "role": "receptionist" }
```

O white label gera a URL server-side com `userId` e `accountId`. O frontend chama esse endpoint ao carregar. JWT expira em **15 minutos**.

### Agente de IA

```http
POST /api/auth/ai
Content-Type: application/json

{ "api_key": "chave-secreta", "account_id": "uuid" }

→ { "token": "jwt", "expires_in": 3600 }
```

JWT expira em **60 minutos**. O agente re-autentica quando necessário. A API Key é armazenada com hash bcrypt — nunca em texto plano.

### Uso nos endpoints protegidos

```http
Authorization: Bearer <token>
```

---

## Endpoints da API

### Autenticação

| Método | Endpoint | Acesso | Descrição |
|--------|----------|--------|-----------|
| POST | `/api/auth/url` | Público | Auth humano via URL params → JWT 15min |
| POST | `/api/auth/ai` | Público | Auth agente via API Key → JWT 60min |

### Agendamento (fluxo principal da IA)

| Método | Endpoint | Acesso | Descrição |
|--------|----------|--------|-----------|
| GET | `/api/dentists/priority` | Todos | Dentistas priorizados por contexto |
| GET | `/api/slots/available` | Todos | Slots livres por dentista/data/procedimento |
| POST | `/api/appointments/check-conflicts` | Todos | Verificação de conflito pré-agendamento |
| POST | `/api/appointments` | Admin · Recep · IA | Criar consulta (re-verificação atômica) |
| GET | `/api/appointments` | Todos | Listar consultas (filtros + paginação) |
| PATCH | `/api/appointments/:id/status` | Todos* | Atualizar status da consulta |

> *IA só pode cancelar. Dentista não pode cancelar nem marcar no_show.

### Pacientes

| Método | Endpoint | Acesso | Descrição |
|--------|----------|--------|-----------|
| GET | `/api/patients?q=` | Todos | Buscar por nome ou telefone (mín. 3 chars) |
| POST | `/api/patients` | Admin · Recep · IA | Criar novo paciente |

### Integração Helena

| Método | Endpoint | Acesso | Descrição |
|--------|----------|--------|-----------|
| POST | `/api/helena/transfer` | Admin · Recep · IA | Transferir conversa para equipe humana |

---

## Integração com Helena (WTS Chat)

A **Helena** é a plataforma de mensageria (WhatsApp, Instagram) que serve como canal de entrada do paciente. A integração é usada para:

| Ação | Quando usar |
|------|-------------|
| Receber webhook | A cada mensagem do paciente no chatbot |
| Responder com confirmação | Após agendamento criado com sucesso |
| Transferir para humano | Quando não há slots disponíveis ou IA não entende a solicitação |
| Concluir atendimento | Após fluxo encerrado |

```typescript
// Funções disponíveis em src/lib/helena.ts
sendText(to, from, text)                       // mensagem avulsa
sendSessionMessage(sessionId, text)            // dentro de conversa ativa
transferToTeam(sessionId, departmentId)        // encaminhar para equipe
completeSession(sessionId)                     // encerrar atendimento
```

---

## Configuração

### Variáveis de ambiente

```bash
# Supabase (projeto: escala-agenda, região: sa-east-1)
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # nunca no frontend

# JWT — gere com: openssl rand -base64 32
JWT_SECRET=<random-base64-32>

# Helena / WTS Chat
HELENA_API_TOKEN=<bearer-token>
HELENA_BASE_URL=https://api.wts.chat
```

### Instalação e execução

```bash
npm install
cp .env.example .env.local   # preencha as variáveis acima
npm run dev                  # http://localhost:3000
```

---

## Segurança

| Risco | Mitigação |
|-------|-----------|
| Double booking concorrente | Re-verificação atômica com lock antes do INSERT |
| Cross-tenant data leak | `account_id` obrigatório em todas as queries + RLS no Supabase |
| API Key vazada | Armazenada com bcrypt hash — texto plano nunca persiste no banco |
| JWT adulterado | Assinado com `JWT_SECRET` via HS256, verificado em cada request |
| `service_role` no frontend | Nunca exposto — client com service role só existe em API Routes |
| Dados de pacientes em logs | Nenhum campo sensível (`phone`, `email`, `name`) é logado |

---

## Estrutura de Pastas

```
src/
├── app/
│   └── api/
│       ├── auth/
│       │   ├── url/route.ts              # Auth humano → JWT 15min
│       │   └── ai/route.ts              # Auth agente → JWT 60min
│       ├── appointments/
│       │   ├── route.ts                 # GET (lista) + POST (criar)
│       │   ├── [id]/status/route.ts     # PATCH status
│       │   └── check-conflicts/route.ts # Verificação pré-agendamento
│       ├── slots/
│       │   └── available/route.ts       # Slots disponíveis
│       ├── patients/
│       │   └── route.ts                 # GET busca + POST criar
│       ├── dentists/
│       │   └── priority/route.ts        # Lista priorizada para IA
│       └── helena/
│           └── transfer/route.ts        # Transferir conversa
├── lib/
│   ├── supabase.ts                      # Clients Supabase (anon + service role lazy)
│   ├── auth.ts                          # JWT sign/verify + autenticadores
│   ├── api.ts                           # withAuth wrapper + helpers ok/err
│   └── helena.ts                        # Client da API Helena / WTS Chat
└── types/
    └── database.ts                      # Tipos TypeScript gerados do Supabase
```

---

## Roadmap

### ✅ Fase 1 — Backend Core (atual)
- Schema Supabase: 13 tabelas, RLS, 15+ índices, sa-east-1
- Funções PostgreSQL: slots disponíveis + verificação de conflito
- 9 endpoints REST para IA e recepcionista
- Client Helena para integração de mensageria

### 🔲 Fase 2 — Endpoints de Admin
- CRUD: unidades, cadeiras, dentistas, procedimentos
- Gerenciamento de horários de trabalho
- Bloqueios de horário (pontual e recorrente)
- Configuração de prioridades para a IA
- Geração e revogação de API Keys

### 🔲 Fase 3 — Deploy
- Configuração Vercel
- Variáveis de ambiente de produção
- Domínio e HTTPS

### 🔲 Fase 4 — Interface React
- Visão diária com colunas por dentista
- Visão semanal
- Lista de consultas com filtros
- Theming white label (cores, logo, idioma)

### 🔲 Fase 5 — Funcionalidades Avançadas (V2/V3)
- Webhooks de eventos para o white label
- Lembretes automáticos via Helena
- Portal de auto-agendamento para pacientes

---

## Getting Started (desenvolvimento local)

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
