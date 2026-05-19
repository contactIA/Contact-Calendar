<div align="center">

# Escala Agenda

### Agenda Odontológica White Label com IA Nativa

<br/>

[![Next.js](https://img.shields.io/badge/Next.js_15-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_17-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

<br/>

> Plataforma de agendamento clínico **multi-tenant** para clínicas odontológicas.  
> Serve humanos via interface React e **agentes de IA via REST API** — com as mesmas regras de negócio, os mesmos dados e os mesmos slots disponíveis.

<br/>

</div>

---

## O que este produto resolve

<table>
<tr>
<td width="50%">

**Para humanos**

Recepcionistas, dentistas e gestores acessam via **interface React** com URL parametrizada. Cada papel enxerga exatamente o que precisa — sem configuração de login adicional.

</td>
<td width="50%">

**Para agentes de IA**

O agente de WhatsApp consome a mesma **REST API** que a recepcionista usa. Mesmas regras, mesmos dados, mesma proteção contra conflitos — canal diferente.

</td>
</tr>
</table>

---

## Arquitetura do Sistema

```mermaid
flowchart TD
    P(["Paciente\n(WhatsApp)"])
    R(["Recepcionista\n(Browser)"])

    H["Helena / WTS Chat\nplataforma de mensageria"]
    UI["Interface React\n(em desenvolvimento)"]

    AI["Agente de IA\nN8N + OpenAI"]

    API["Escala Agenda — Backend\nNext.js 15 · App Router · TypeScript"]

    DB[("Supabase\nPostgreSQL 17 · RLS · sa-east-1")]

    P -->|mensagem| H
    H -->|webhook POST| AI
    AI -->|REST API · JWT| API
    R --> UI
    UI -->|HTTP · JWT| API
    API -->|supabase-js| DB

    style API fill:#1e293b,color:#fff,stroke:#3b82f6
    style DB fill:#064e3b,color:#fff,stroke:#10b981
    style AI fill:#1e1b4b,color:#fff,stroke:#8b5cf6
    style H fill:#1c1917,color:#fff,stroke:#f97316
```

---

## Fluxo Completo do Agente de IA

```mermaid
sequenceDiagram
    actor P as Paciente (WhatsApp)
    participant H as Helena
    participant AI as Agente de IA
    participant API as Escala Agenda API
    participant DB as Supabase

    P->>H: "Quero agendar uma limpeza"
    H->>AI: webhook { sessionId, contact, lastMessage }

    AI->>API: POST /api/auth/ai { api_key, account_id }
    API-->>AI: { token, expires_in: 3600 }

    AI->>API: GET /api/patients?q=11999999999
    API->>DB: SELECT * FROM patients WHERE phone LIKE ...
    DB-->>API: paciente encontrado / não encontrado
    API-->>AI: [{ id, name, phone }]

    AI->>API: GET /api/dentists/priority?unit_id=&procedure_id=&patient_id=
    API-->>AI: dentistas ordenados por prioridade

    loop Para cada dentista (em ordem)
        AI->>API: GET /api/slots/available?dentist_id=&date=&procedure_id=
        API->>DB: função get_available_slots()
        DB-->>API: slots livres
        API-->>AI: [{ start_at, end_at, chair_id }]
    end

    AI->>P: "Tenho horário na 3ª às 14h. Confirma?"
    P->>AI: "Sim!"

    AI->>API: POST /api/appointments/check-conflicts
    API-->>AI: { has_conflict: false }

    AI->>API: POST /api/appointments
    API->>DB: verificação atômica + INSERT
    DB-->>API: consulta criada
    API-->>AI: { id, start_at, status: "scheduled" }

    AI->>H: sendSessionMessage(sessionId, "Consulta confirmada!")
    H->>P: "Consulta confirmada!"
```

---

## Modelo de Dados

```mermaid
erDiagram
    accounts ||--o{ users : "tem"
    accounts ||--o{ units : "tem"
    accounts ||--o{ patients : "tem"
    accounts ||--o{ ai_api_keys : "tem"

    units ||--o{ chairs : "tem"
    units ||--o{ dentist_units : "vincula"

    dentists ||--o{ dentist_units : "vinculado a"
    dentists ||--o{ dentist_schedules : "tem horários"
    dentists ||--o{ dentist_priorities : "tem prioridades"
    dentists ||--o{ schedule_blocks : "tem bloqueios"

    appointments }o--|| dentists : "atendido por"
    appointments }o--|| patients : "de"
    appointments }o--|| chairs : "na cadeira"
    appointments }o--|| procedures : "procedimento"
    appointments }o--|| units : "na unidade"

    accounts {
        uuid id PK
        text name
        text slug
        jsonb theme_config
        text timezone
    }

    appointments {
        uuid id PK
        timestamptz start_at
        timestamptz end_at
        enum status
        int duration_minutes
        text notes
        enum created_by_role
    }

    dentists {
        uuid id PK
        text cro
        text[] specialty
        text color
    }

    patients {
        uuid id PK
        text name
        text phone
        text email
        date birth_date
    }
```

### Ciclo de status de uma consulta

```mermaid
stateDiagram-v2
    [*] --> scheduled : agendado pela IA ou recepcionista
    scheduled --> confirmed : paciente confirmou
    confirmed --> in_progress : paciente chegou
    in_progress --> completed : atendimento finalizado
    scheduled --> cancelled : cancelado
    confirmed --> cancelled : cancelado
    confirmed --> no_show : não compareceu
```

---

## Autenticação

```mermaid
flowchart LR
    subgraph Humano
        URL["URL com\naccountId + userId"]
        -->|POST /api/auth/url| JWT15["JWT · 15 min\nrole: admin/receptionist/dentist"]
    end

    subgraph IA
        KEY["API Key\nda conta"]
        -->|POST /api/auth/ai| JWT60["JWT · 60 min\nrole: ai_agent"]
    end

    JWT15 & JWT60 -->|Authorization: Bearer token| Endpoints["Endpoints protegidos"]
```

| Tipo | Endpoint | Expiração | Renovação |
|------|----------|-----------|-----------|
| Humano | `POST /api/auth/url` | 15 min | Automática via refresh |
| Agente IA | `POST /api/auth/ai` | 60 min | Agente re-autentica |

> API Keys são armazenadas com hash bcrypt — texto plano nunca persiste no banco.

---

## Endpoints da API

### Autenticação
| Método | Endpoint | Acesso | Descrição |
|--------|----------|:------:|-----------|
| `POST` | `/api/auth/url` | Público | Auth humano via URL → JWT 15min |
| `POST` | `/api/auth/ai` | Público | Auth agente via API Key → JWT 60min |

### Agendamento
| Método | Endpoint | Acesso | Descrição |
|--------|----------|:------:|-----------|
| `GET` | `/api/dentists/priority` | Autenticado | Dentistas priorizados por contexto |
| `GET` | `/api/slots/available` | Autenticado | Slots livres por dentista/data |
| `POST` | `/api/appointments/check-conflicts` | Autenticado | Verificação de conflito |
| `POST` | `/api/appointments` | Admin · Recep · IA | Criar consulta |
| `GET` | `/api/appointments` | Autenticado | Listar consultas (filtros + paginação) |
| `PATCH` | `/api/appointments/:id/status` | Autenticado¹ | Atualizar status |

### Pacientes
| Método | Endpoint | Acesso | Descrição |
|--------|----------|:------:|-----------|
| `GET` | `/api/patients?q=` | Autenticado | Buscar por nome ou telefone |
| `POST` | `/api/patients` | Admin · Recep · IA | Criar paciente |

### Helena
| Método | Endpoint | Acesso | Descrição |
|--------|----------|:------:|-----------|
| `POST` | `/api/helena/transfer` | Autenticado | Transferir para equipe humana |

> ¹ IA só pode `cancelled`. Dentista não pode `cancelled` nem `no_show`.

---

## Integração Helena (WTS Chat)

A Helena é o canal de comunicação com o paciente via WhatsApp. O sistema a usa em três momentos:

```mermaid
flowchart LR
    A["Agendamento\ncriado"] -->|sendSessionMessage| B["Paciente recebe\nconfirmação"]
    C["Sem slots\ndisponíveis"] -->|transferToTeam| D["Conversa vai\npara recepcionista"]
    E["Fluxo\nencerrado"] -->|completeSession| F["Atendimento\nconcluído"]
```

```typescript
// src/lib/helena.ts
sendText(to, from, text)              // mensagem avulsa para contato
sendSessionMessage(sessionId, text)   // dentro de conversa ativa
transferToTeam(sessionId, deptId)     // encaminhar para equipe humana
completeSession(sessionId)            // encerrar atendimento
```

---

## Configuração

### Variáveis de ambiente

```bash
# Supabase — projeto: escala-agenda | região: sa-east-1 (São Paulo)
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>      # nunca no frontend

# JWT — gere com: openssl rand -base64 32
JWT_SECRET=<random-base64-32>

# Helena / WTS Chat
HELENA_API_TOKEN=<bearer-token-da-plataforma>
HELENA_BASE_URL=https://api.wts.chat
```

### Instalação

```bash
git clone https://github.com/g4bs2006/Agenda---Contact.IA.git
cd escala-agenda
npm install
cp .env.example .env.local    # preencha as variáveis acima
npm run dev                   # → http://localhost:3000
```

---

## Segurança

| Risco | Mitigação |
|-------|-----------|
| Double booking concorrente | Re-verificação atômica com lock no `POST /api/appointments` |
| Cross-tenant data leak | `account_id` em todas as queries + RLS no Supabase como 2ª linha |
| API Key vazada | Armazenada com bcrypt hash — texto plano nunca persiste |
| JWT adulterado | HS256 com `JWT_SECRET`, verificado em cada request |
| `service_role` exposto | Só existe em API Routes server-side, nunca em variável `NEXT_PUBLIC_` |
| Dados de pacientes em logs | Nenhum campo sensível (`phone`, `email`, `name`) é logado |

---

## Estrutura do Projeto

```
escala-agenda/
└── src/
    ├── app/
    │   └── api/
    │       ├── auth/
    │       │   ├── url/route.ts              ← Auth humano → JWT 15min
    │       │   └── ai/route.ts               ← Auth agente → JWT 60min
    │       ├── appointments/
    │       │   ├── route.ts                  ← GET lista + POST criar
    │       │   ├── [id]/status/route.ts      ← PATCH status
    │       │   └── check-conflicts/route.ts  ← Verificação pré-agendamento
    │       ├── slots/
    │       │   └── available/route.ts        ← Slots disponíveis
    │       ├── patients/
    │       │   └── route.ts                  ← GET busca + POST criar
    │       ├── dentists/
    │       │   └── priority/route.ts         ← Lista priorizada para IA
    │       └── helena/
    │           └── transfer/route.ts         ← Transferir conversa
    ├── lib/
    │   ├── supabase.ts                       ← Clients anon + service role (lazy)
    │   ├── auth.ts                           ← JWT sign/verify + autenticadores
    │   ├── api.ts                            ← withAuth wrapper + helpers ok/err
    │   └── helena.ts                         ← Client da API Helena / WTS Chat
    └── types/
        └── database.ts                       ← Tipos gerados do Supabase
```

---

## Roadmap

```mermaid
gantt
    title Roadmap Escala Agenda — Entrega Mai/2026
    dateFormat  YYYY-MM-DD
    section Fase 1 · Backend Core
    Schema Supabase (13 tabelas, RLS)     :done, 2026-05-19, 1d
    Funções PG (slots + conflitos)        :done, 2026-05-19, 1d
    9 endpoints REST                      :done, 2026-05-19, 1d
    Integração Helena                     :done, 2026-05-19, 1d

    section Fase 2 · Admin APIs
    CRUD unidades, cadeiras, dentistas    :active, 2026-05-20, 2d
    Horários de trabalho + bloqueios      :2026-05-22, 2d
    Prioridades + API Keys                :2026-05-24, 1d

    section Fase 3 · Deploy
    Vercel + env produção                 :2026-05-25, 1d

    section Fase 4 · Interface React
    Visão diária (colunas por dentista)   :2026-05-26, 3d
    Visão semanal + lista de consultas    :2026-05-29, 2d
    Theming white label                   :2026-05-31, 1d
```

---

## Desenvolvimento local

```bash
npm run dev      # servidor em http://localhost:3000
npm run build    # build de produção
npx tsc --noEmit # type check
```
