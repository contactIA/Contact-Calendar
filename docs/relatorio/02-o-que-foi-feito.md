# O que foi feito

- **Novo projeto Supabase** `Contact-Calendar` (ref `xcyltcfxrguvjlaqnqfd`, `sa-east-1`).
- **Schema replicado** do `escala-agenda`: 13 tabelas, 4 enums, índices, FKs, funções e RLS.
- **Migrations versionadas** em `supabase/migrations/`:
  - `0001_init_schema.sql` — réplica fiel.
  - `0002_configurable_slot_cadence.sql` — a correção.
- **Cadência configurável:** coluna `accounts.slot_interval_minutes` (default 30) + override
  `p_slot_interval` na RPC.
- **Backend:** endpoint `GET/PATCH /api/admin/account`.
- **Frontend:** aba "Geral" nas Configurações para ajustar a cadência.
- **Tipos** regenerados (`src/types/database.ts`).
- **Repositório** repontado para `contactIA/Contact-Calendar` e commit publicado.
