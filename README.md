# Contact Calendar

Agenda odontológica white label, multi clínica, com API para o agente de IA.

A recepção, os dentistas e o gestor usam a interface; o agente de IA do
WhatsApp usa os endpoints `/api/agent/*`. Os dois passam pelas mesmas regras e
enxergam os mesmos horários livres.

> **Em estudo:** ligar a agenda ao CRM ContactIA (os painéis CRC1 e CRC2) e
> trazer o código para a arquitetura do CRM. O funil de leads não mora mais
> aqui: a camada que espelhava e movia os cards do painel nativo da plataforma
> saiu em outubro de 2026.

## Visão geral

```mermaid
flowchart TD
    P(["Paciente (WhatsApp)"])
    R(["Recepção, dentista, gestor"])
    H["Plataforma de mensagens"]
    AI["Agente de IA (n8n)"]
    API["Contact Calendar: Next.js (páginas e rotas /api)"]
    DB[("Supabase: Postgres, RLS, sa-east-1")]

    P --> H
    H -->|webhook| AI
    AI -->|chave da API + X-Account-ID| API
    R -->|item de menu da plataforma| API
    API -->|supabase-js com service_role| DB
    API -->|confirmação, lembrete, etiquetas| H
```

- **Um app Next.js 16** (App Router, React 19, TypeScript, Tailwind 4, Radix, zod),
  publicado na Vercel.
- **Páginas** em `src/app/[accountId]/*`, componentes de cliente que chamam a
  própria API com o token da sessão.
- **Rotas** em `src/app/api/**/route.ts`. Cada rota valida o corpo com zod,
  aplica a regra e grava no banco pelo cliente com `service_role`.
- **Regras no banco:** horários livres (`get_available_slots`), conflito
  (`check_appointment_conflict`), busca sem acento e telefone
  (`find_patients_by_phone`), e as restrições `EXCLUDE` que impedem duas
  consultas no mesmo horário.
- **Mensagens:** ao agendar, remarcar, cancelar ou mudar o status, a rota manda a
  confirmação, agenda ou cancela o lembrete e etiqueta o contato na plataforma.
  Tudo em melhor esforço: se a plataforma falhar, a consulta continua gravada.

## Acesso

| Quem | Como entra | Validade |
|---|---|---|
| Recepção, dentista, gestor (`admin`) | A plataforma abre `/{accountId}?token=...`. O token é emitido por `POST /api/auth/url`, que exige o segredo `WHITELABEL_AUTH_SECRET` e por isso só é chamado do lado do servidor | 8 horas |
| Agente de IA (habilidades) | `Authorization: Bearer <chave>` + `X-Account-ID` em cada pedido | Até a chave ser revogada |
| Agente de IA (API geral) | `POST /api/auth/ai` com a chave devolve um JWT | 60 minutos |

- As chaves da IA ficam com hash bcrypt; o texto nunca é gravado.
- O token da plataforma de cada clínica fica cifrado (AES-256-GCM,
  `INTEGRATIONS_ENCRYPTION_KEY`).
- Toda consulta ao banco filtra por `account_id`; o RLS fica ligado sem
  políticas, como segunda barreira.
- **Hoje ninguém emite o token de pessoa.** A plataforma só abre a URL, e nada
  chama `POST /api/auth/url` com o segredo. O `?userId=` também não entra: sem
  `WHITELABEL_AUTH_SECRET` a rota responde 503, e com ele o navegador recebe
  401 por não ter o segredo. Para usar a tela é preciso gerar o token à mão.

### Papéis

| Ação | admin | receptionist | dentist | ai_agent |
|---|:-:|:-:|:-:|:-:|
| Ver a agenda | sim | sim | sim | sim |
| Criar e remarcar consulta | sim | sim | não | sim |
| Cancelar | sim | sim | não | sim |
| Marcar falta (`no_show`) | sim | sim | não | não |
| Configurações e chaves | sim | não | não | não |

## Habilidades do agente (`/api/agent/*`)

Cada habilidade é uma chamada só: a rota acha o paciente pelo telefone, ordena
os dentistas e escolhe a cadeira.

| Rota | O que faz |
|---|---|
| `POST /api/agent/disponibilidade` | Horários livres do dia, com o dentista recomendado e alternativas. Pede `data`, `unit_id`, `procedure_id`; aceita `telefone` e `quantidade_dentistas` |
| `POST /api/agent/agendar` | Acha ou cria o paciente pelo telefone e cria a consulta. Sem `chair_id`, usa a primeira cadeira livre |
| `POST /api/agent/cancelar` | Cancela a consulta informada ou a próxima do paciente |
| `POST /api/agent/remarcar` | Remarca; se a cadeira original estiver ocupada, procura outra livre na unidade |
| `POST /api/agent/consultar` | A próxima consulta do paciente |

Exemplo:

```json
// POST /api/agent/agendar
{
  "telefone": "5511999887766",
  "nome_paciente": "João Silva",
  "dentista_id": "uuid",
  "horario": "2026-05-20T14:00:00Z",
  "procedure_id": "uuid",
  "unit_id": "uuid"
}

// 201
{ "confirmado": true, "agendamento_id": "uuid", "resumo": "Limpeza com Dr. Carlos em 20/05 às 14h" }
```

- Horário já ocupado: **409** (a restrição do banco devolve `23P01`).
- Telefone que bate com mais de um paciente: **409** (em `disponibilidade`, só
  ignora o histórico).

### Prioridade dos dentistas

É uma recomendação, não uma atribuição. A especialidade exigida pelo
procedimento filtra antes; depois a ordem é: quem já atendeu o paciente, quem
tem menos consultas no dia, e a nota configurada por unidade
(`dentist_units.priority`).

## Horários livres

A grade respeita a duração real do procedimento: um procedimento de 90 minutos
reserva os 90 minutos inteiros. A cadência (de quanto em quanto tempo um início
é oferecido) é outra coisa, configurável:

| Origem | Onde | Padrão |
|---|---|---|
| Por chamada | parâmetro `p_slot_interval` da função | |
| Da clínica | `accounts.slot_interval_minutes` (Configurações, aba Geral) | 30 |
| Reserva | dentro da função | 30 |

## Telas

| Página | Rota | Quem |
|---|---|---|
| Agenda (dia, semana, lista) | `/{accountId}/agenda` | todos |
| Pacientes | `/{accountId}/pacientes` | admin, recepção |
| Configurações | `/{accountId}/configuracoes` | admin |
| Cadastro de clínica | `/onboarding` | público |

Configurações tem as abas Geral, Unidades, Cadeiras, Procedimentos,
Profissionais, Integrações (token, canal, modelos de confirmação e lembrete,
etiquetas por status) e API Keys.

**Paciente 360** (`GET /api/patients/{id}/360` e `/timeline`): cadastro e
histórico de consultas do paciente. Só existe o backend; a tela não foi feita.

## Banco de dados

Supabase "Contact-Calendar" (`xcyltcfxrguvjlaqnqfd`, sa-east-1), esquema
`public`.

| Em uso | Tabelas |
|---|---|
| Clínica | `accounts`, `units`, `users`, `account_integrations`, `ai_api_keys` |
| Agenda | `chairs`, `dentists`, `dentist_units`, `dentist_schedules`, `dentist_priorities`, `procedures`, `schedule_blocks`, `appointments` |
| Pacientes | `patients` |

**Sem uso desde a limpeza** (continuam no banco até a migração):
`helena_panels`, `helena_steps`, `helena_cards`, `step_mappings`, `tag_links`,
`sync_outbox`, `sync_log`, `webhook_events`, a função `claim_outbox_batch` e as
colunas `account_integrations.panel_id`, `account_integrations.step_mappings` e
`appointments.closed_value`, `closed_at`, `closed_outcome`,
`confirmation_status`, `last_sync_status`.

### Migrações: atenção

As migrações de `supabase/migrations/` **não recriam o banco sozinhas**:

- O registro do banco (`supabase_migrations.schema_migrations`) para em
  `20260701173219`. As migrações `0007` a `0010` e as duas de agosto foram
  aplicadas à mão, e `appointments.closed_outcome` existe no banco sem migração
  no repositório.
- Na ordem alfabética, `0010_outbox_claim` roda antes de
  `20260701171940_sync_infra` e falha, porque altera `sync_outbox` antes de ela
  existir.
- `0003` cria restrições `EXCLUDE` (btree_gist) e falha se já houver consultas
  sobrepostas.

O banco de verdade é a referência. Na migração para a arquitetura do CRM, o
plano é uma migração base única tirada dele.

Depois de mexer no esquema, gere de novo `src/types/database.ts`.

## Variáveis de ambiente

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=            # só no servidor
JWT_SECRET=                           # openssl rand -base64 32
WHITELABEL_AUTH_SECRET=               # o mesmo que a plataforma usa em /api/auth/url
INTEGRATIONS_ENCRYPTION_KEY=          # cifra o token da plataforma de cada clínica
HELENA_BASE_URL=                      # opcional; padrão https://api.wts.chat
FLUXODONTO_URL=                       # opcional; endereço das conversas; padrão https://app.fluxodonto.com
NEXT_PUBLIC_APP_URL=                  # opcional; endereço público do app, usado no onboarding
```

Quem preenche os segredos é a equipe.

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npx tsc --noEmit
npm run build
```

Não há testes automatizados nem CI.

## Estrutura

```
src/
├── app/
│   ├── [accountId]/         agenda, pacientes, configuracoes (o layout faz o login)
│   ├── onboarding/          cadastro público de clínica
│   └── api/
│       ├── agent/           habilidades do agente de IA
│       ├── appointments/    consultas, status, conflitos
│       ├── patients/        pacientes, Paciente 360, vínculo com o contato
│       ├── admin/           cadastros da clínica, integração, chaves
│       ├── auth/            login pela plataforma e do agente
│       ├── helena/          abrir e transferir conversa
│       └── ...              slots, dentists, units, procedures, schedule-blocks
├── components/
│   ├── agenda/              AgendaShell, visões, modais, popover, relatório do dia
│   └── config/              aba de integração
├── hooks/                   dados da agenda e login
├── lib/                     auth, api (withAuth), agentAuth, helena (cliente da plataforma), supabase, tz
└── types/                   database.ts (gerado), patient360.ts
```
