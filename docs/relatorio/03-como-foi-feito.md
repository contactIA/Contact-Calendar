# Como foi feito (técnico)

**Resolução da cadência** (precedência):
```
COALESCE(p_slot_interval, accounts.slot_interval_minutes, 30)
```
Duração e cadência são independentes: o slot reserva `[início, início + duração)`; a cadência só
define de quanto em quanto tempo um novo início é testado.

**Assinatura final da RPC:**
```sql
get_available_slots(
  p_dentist_id, p_unit_id, p_procedure_id, p_date,
  p_duration_override integer DEFAULT NULL,  -- sobrepõe a duração
  p_slot_interval     integer DEFAULT NULL   -- sobrepõe a cadência
)
```

**Cuidado com sobrecarga:** a nova assinatura tem 6 args (a antiga, 5). O `CREATE OR REPLACE`
criou uma função nova em vez de substituir, gerando duas versões (ambiguidade PostgREST / PGRST203).
A antiga foi removida com `DROP FUNCTION`, incluído na migration `0002`.

**Extração do schema:** lido dos catálogos do Postgres do `escala-agenda`, salvo em
`0001_init_schema.sql` e aplicado no `Contact-Calendar`.
