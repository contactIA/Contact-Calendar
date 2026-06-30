-- ============================================================================
-- 0004 — Busca global de agendamentos accent-insensitive
--
-- Contexto: a busca da agenda passou a ser feita no backend (q em
-- GET /api/appointments). O ILIKE do Postgres é case-insensitive mas NÃO ignora
-- acentos, então "jose" não achava "José" — regressão frente à busca antiga
-- (client-side), que normalizava acentos. Esta migration traz paridade com o
-- mesmo idioma já usado em search_patients (0001):
--   unaccent(lower(x)) ILIKE '%' || unaccent(lower(termo)) || '%'.
--
-- search_appointment_ids: dado account_id + termo, devolve os ids dos
-- agendamentos cujo paciente, procedimento OU dentista casa por nome. A rota usa
-- esses ids e re-seleciona com o shape aninhado de sempre, mantendo também os
-- filtros de status e de papel (dentista só vê a própria agenda). O match é
-- feito nas tabelas-dimensão (menores) e não na varredura de appointments.
-- ============================================================================

-- unaccent já é instalada na 0001; repetido aqui só por idempotência.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

CREATE OR REPLACE FUNCTION public.search_appointment_ids(
  p_account_id uuid,
  p_term       text
)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
AS $function$
  WITH pat AS (
    SELECT '%' || unaccent(lower(p_term)) || '%' AS pattern
  )
  SELECT a.id
  FROM appointments a, pat
  WHERE a.account_id = p_account_id
    AND (
      a.patient_id IN (
        SELECT p.id FROM patients p
        WHERE p.account_id = p_account_id
          AND unaccent(lower(p.name)) ILIKE pat.pattern
      )
      OR a.procedure_id IN (
        SELECT pr.id FROM procedures pr
        WHERE pr.account_id = p_account_id
          AND unaccent(lower(pr.name)) ILIKE pat.pattern
      )
      OR a.dentist_id IN (
        SELECT d.id FROM dentists d
        JOIN users u ON u.id = d.user_id
        WHERE d.account_id = p_account_id
          AND unaccent(lower(u.name)) ILIKE pat.pattern
      )
    );
$function$;
