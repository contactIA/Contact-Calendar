# Como testar

**No banco** (validado; procedimento de 90 min, expediente seg. 09:00–12:00):

| Cenário | Esperado |
|---------|----------|
| 90 min, cadência 30, livre | `09:00-10:30, 09:30-11:00, 10:00-11:30, 10:30-12:00` |
| 90 min, cadência 60 (override) | `09:00-10:30, 10:00-11:30` |
| 90 min, com consulta às 10:00–11:00 | nenhum slot livre |

Obs.: a função é `STABLE` — os dados de seed precisam estar commitados antes da chamada
(não funciona no mesmo statement via CTE).

**Pela aplicação:**
1. Preencher `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`.
2. `npm run dev` → `http://localhost:3000`.
3. Onboarding (`/onboarding`) e cadastrar unidade, cadeira, profissional (com horários) e um
   procedimento de 90 min.
4. Aba "Geral" → ajustar a cadência e salvar.
5. Novo agendamento com o procedimento de 90 min → conferir cadência e bloqueio de 90 min.

**Automático:**
- `npx tsc --noEmit` (passou).
- `get_advisors` (Supabase): só avisos herdados (RLS sem policy, intencional; `search_path`;
  `unaccent` no `public`).
