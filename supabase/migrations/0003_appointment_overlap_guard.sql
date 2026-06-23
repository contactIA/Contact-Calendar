-- ============================================================================
-- 0003 — Trava anti-corrida em appointments + match de paciente por telefone
--
-- Contexto: os endpoints do agente de IA (/api/agent/*) verificavam conflito
-- de horário com check_appointment_conflict e SÓ DEPOIS inseriam. Entre a
-- checagem e o insert havia uma janela (TOCTOU): dois agendamentos simultâneos
-- no mesmo dentista/cadeira passavam os dois. A garantia real precisa estar no
-- banco. Esta migration:
--   1. cria constraints EXCLUDE que tornam impossível dois agendamentos ativos
--      se sobreporem para o MESMO dentista ou a MESMA cadeira;
--   2. centraliza o match de paciente por telefone (antes era um ILIKE
--      '%últimos 10 dígitos%' no código, frágil e por substring) numa função
--      que compara apenas dígitos.
-- ============================================================================

-- 1. Trava de sobreposição -----------------------------------------------------
-- btree_gist permite usar '=' (igualdade de uuid) junto de '&&' (sobreposição
-- de range) no mesmo índice GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

-- tstzrange(start, end) usa por padrão limites '[)' (início incluso, fim
-- excluso) — exatamente a mesma semântica do conflito já usado no código
-- (start < other_end AND end > other_start). Logo, consultas encostadas
-- (uma termina 10:00, a outra começa 10:00) NÃO conflitam.
-- O predicado WHERE deixa de fora consultas canceladas / no_show, que não
-- ocupam a agenda.
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_dentist_overlap
  EXCLUDE USING gist (
    dentist_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show'));

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_chair_overlap
  EXCLUDE USING gist (
    chair_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show'));

-- Nota operacional: como EXCLUDE não aceita NOT VALID, esta migration falha se
-- já existirem agendamentos ativos sobrepostos. Em base limpa não há impacto;
-- havendo dados legados, resolva as sobreposições antes de aplicar.

-- Violação dessas constraints chega ao supabase-js com code = '23P01'
-- (exclusion_violation); os endpoints convertem isso em HTTP 409.

-- 2. Match de paciente por telefone -------------------------------------------
-- Compara somente os dígitos (ignora +55, parênteses, espaços, hífens) e casa
-- pelos últimos 8 dígitos (número do assinante), tolerando variações de DDI/DDD
-- e do 9º dígito de celular. Retorna TODOS os candidatos para que a aplicação
-- detecte ambiguidade (mais de um paciente) em vez de escolher um às cegas.
CREATE OR REPLACE FUNCTION public.find_patients_by_phone(
  p_account_id uuid,
  p_phone      text
)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
AS $function$
  WITH q AS (
    SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') AS digits
  )
  SELECT p.id, p.name
  FROM patients p, q
  WHERE p.account_id = p_account_id
    AND length(q.digits) >= 8
    AND length(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g')) >= 8
    AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 8)
      = right(q.digits, 8)
  ORDER BY p.created_at;
$function$;
