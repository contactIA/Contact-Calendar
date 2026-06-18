# Relatório — Duração real do procedimento e cadência da grade

**Projeto:** Contact-Calendar (agenda odontológica white label)
**Data:** 2026-06-18
**Escopo:** eliminar o "30 min fixo" da grade de horários; novo projeto Supabase e novo repositório.

---

## 1. Contexto da tarefa

A demanda original era: "tirar o 30 min fixo do código; a grade de horários passa a respeitar
a duração real do procedimento". A premissa assumida era que o sistema tratava toda consulta
como 30 minutos, permitindo encaixar uma consulta de 90 min "em cima" de outra.

Em paralelo, foi decidido migrar para um **novo projeto Supabase** (`Contact-Calendar`) e um
**novo repositório** (`contactIA/Contact-Calendar`), replicando o schema do projeto anterior
(`escala-agenda`).

---

## 2. O que foi descoberto

### 2.1. A duração real JÁ era respeitada

Ao inspecionar o corpo da função `get_available_slots` no banco de origem (`escala-agenda`),
constatou-se que ela **já calculava a duração real** do procedimento:

- O fim do slot era `início + duration_minutes` (vindo de `procedures.duration_minutes` ou de um
  override), não um valor fixo.
- A checagem de conflito cobria o **intervalo inteiro** `[início, fim)`, tanto na disponibilidade
  (`get_available_slots`) quanto no agendamento (`check_appointment_conflict`).
- O frontend não precisava enviar a duração: ao passar o `procedure_id`, a própria função buscava
  a duração na tabela.

Ou seja, o bug descrito na tarefa (encaixar 90 min sobre 30 min) **não existia** — provavelmente
já havia sido corrigido em uma rodada anterior (a assinatura da RPC já tinha `p_procedure_id` e
`p_duration_override`).

### 2.2. O único valor fixo remanescente era a *cadência*

Sobrava no código apenas `v_slot_interval interval := '30 minutes'`, que **não** é a duração e sim
a **cadência**: de quanto em quanto tempo um horário de início é oferecido na grade
(ex.: 14:00, 14:30, 15:00...). Isso é uma decisão de produto legítima, não um bug.

### 2.3. Detalhes de infraestrutura

- O schema-fonte (`escala-agenda`) estava em uma conta Supabase diferente (org `Contact.IA`) da
  conta de destino (org do João Henrique). Foi necessário alternar a conexão do MCP entre as contas.
- Não havia arquivos `.sql`/migrations versionados no repositório — o schema vivia apenas no banco.
- RLS estava habilitado em todas as tabelas, **sem policies** (modelo deny-all: o acesso é feito
  pelo backend com `service_role`, que faz bypass de RLS, filtrando por `account_id`).

---

## 3. O que foi feito

1. **Decisão de produto:** em vez de apenas remover o `30`, a cadência foi tornada **configurável**.
2. **Novo projeto Supabase** `Contact-Calendar` (ref `xcyltcfxrguvjlaqnqfd`, região `sa-east-1`)
   criado na org do João Henrique.
3. **Schema replicado fielmente** do `escala-agenda`: 13 tabelas, 4 enums, índices, foreign keys
   (com as ações `ON DELETE` corretas), 3 funções de negócio e RLS.
4. **Schema versionado** no repositório em `supabase/migrations/`:
   - `0001_init_schema.sql` — réplica fiel.
   - `0002_configurable_slot_cadence.sql` — a correção da cadência.
5. **Cadência configurável:** nova coluna `accounts.slot_interval_minutes` (default 30) + parâmetro
   de override `p_slot_interval` na RPC. O `30` deixou de ser um literal na lógica.
6. **Backend:** endpoint `GET/PATCH /api/admin/account` para ler/editar a configuração da conta.
7. **Frontend:** nova aba **"Geral"** na tela de Configurações para ajustar a cadência.
8. **Tipos** TypeScript regenerados (`src/types/database.ts`).
9. **Repositório:** `origin` repontado para `contactIA/Contact-Calendar` (histórico preservado) e
   commit publicado.

---

## 4. Como foi feito (técnico)

### 4.1. Resolução da cadência

A função passou a resolver a cadência por precedência:

```
COALESCE(p_slot_interval, accounts.slot_interval_minutes, 30)
```

| Origem | Onde | Quando se aplica |
|--------|------|------------------|
| Override por chamada | parâmetro `p_slot_interval` | testes / casos pontuais |
| Configuração da conta | coluna `accounts.slot_interval_minutes` (default 30) | uso normal |
| Fallback | `30` dentro da função | segurança, se nada definido |

A duração do procedimento e a cadência são conceitos **independentes**: o slot reserva o intervalo
inteiro `[início, início + duração)`, e a cadência só controla de quanto em quanto tempo um novo
início é testado.

### 4.2. Assinatura final da RPC

```sql
get_available_slots(
  p_dentist_id        uuid,
  p_unit_id           uuid,
  p_procedure_id      uuid,
  p_date              date,
  p_duration_override integer DEFAULT NULL,  -- sobrepõe a duração do procedimento
  p_slot_interval     integer DEFAULT NULL   -- sobrepõe a cadência da conta
)
```

### 4.3. Cuidado: sobrecarga de função

Como a nova assinatura tem 6 parâmetros (a antiga tinha 5), o `CREATE OR REPLACE` criou uma
**nova sobrecarga** em vez de substituir — ficaram duas funções `get_available_slots`. Isso causaria
ambiguidade no PostgREST (erro `PGRST203`). A versão antiga (5 args) foi removida com
`DROP FUNCTION`, deixando apenas a configurável. O `DROP` foi incorporado à migration `0002` para
manter a reprodutibilidade.

### 4.4. Migração entre contas Supabase

O schema-fonte foi extraído do `escala-agenda` (em outra conta) via consultas aos catálogos do
Postgres (tabelas, colunas, defaults, constraints, FKs, índices, funções, RLS), salvo em
`supabase/migrations/0001_init_schema.sql`, e então aplicado no `Contact-Calendar`.

---

## 5. Como testar

### 5.1. Teste do banco (já executado, reproduzível)

Cenário usado na validação: procedimento de 90 min, expediente de uma segunda-feira das 09:00 às 12:00.

| Cenário | Chamada | Resultado esperado |
|---------|---------|--------------------|
| 90 min, cadência 30, agenda livre | `get_available_slots(dentista, unidade, proc, '2026-06-22')` | `09:00-10:30, 09:30-11:00, 10:00-11:30, 10:30-12:00` |
| 90 min, cadência 60 (override) | mesma chamada + `p_slot_interval = 60` | `09:00-10:30, 10:00-11:30` |
| 90 min, com consulta ocupando 10:00–11:00 | mesma chamada do 1º cenário | nenhum slot livre (o intervalo inteiro é respeitado) |

Os três cenários foram confirmados no banco `Contact-Calendar`. Para reproduzir, basta semear
uma conta com unidade, dentista, cadeira, horário (`dentist_schedules`) e um procedimento de 90 min,
e chamar a função. (Lembrete: por ser função `STABLE`, os dados de seed precisam estar commitados
antes da chamada — não funcionam no mesmo statement via CTE.)

### 5.2. Teste pela aplicação

1. Preencher `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` (Dashboard do Contact-Calendar →
   Project Settings → API Keys → `service_role`).
2. `npm run dev` e abrir `http://localhost:3000`.
3. Criar a conta pelo onboarding (`/onboarding`) e cadastrar nas Configurações: unidade, cadeira,
   profissional (com horários de trabalho) e um procedimento de 90 min.
4. Na aba **Geral** das Configurações, conferir/ajustar a cadência (ex.: 30 ou 60 min) e salvar.
5. Abrir o modal de novo agendamento, escolher o procedimento de 90 min e verificar que:
   - os horários oferecidos respeitam a cadência configurada;
   - cada horário reserva 90 min (não há sobreposição com consultas existentes).

### 5.3. Verificações automáticas

- `npx tsc --noEmit` — checagem de tipos (passou sem erros).
- `get_advisors` (Supabase) — apenas avisos herdados do schema original (RLS sem policy, que é
  intencional; `search_path` mutável; extensão `unaccent` no schema `public`).

---

## 6. Pendências e próximos passos

- A `SUPABASE_SERVICE_ROLE_KEY` é específica de cada ambiente e não vai para o git
  (o `.env.local` é ignorado). Precisa ser configurada também no ambiente de deploy (ex.: Vercel).
- Opcional: expor também a configuração de `timezone` na aba Geral (o endpoint já aceita).
