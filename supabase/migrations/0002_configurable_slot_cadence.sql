-- ============================================================================
-- 0002 — Cadência da grade configurável (remove o "30 min" hardcoded)
--
-- Contexto: a get_available_slots já respeitava a DURAÇÃO real do procedimento.
-- O único "30 minutes" remanescente era a CADÊNCIA (de quanto em quanto tempo
-- um horário de início é oferecido na grade). Esta migration tira esse valor
-- fixo do corpo da função e o transforma em configuração:
--   1. por conta  -> accounts.slot_interval_minutes (default 30)
--   2. override   -> parâmetro opcional p_slot_interval na RPC
-- Resolução: COALESCE(p_slot_interval, accounts.slot_interval_minutes, 30).
-- ============================================================================

-- 1. Config por tenant ------------------------------------------------------
ALTER TABLE public.accounts
  ADD COLUMN slot_interval_minutes integer NOT NULL DEFAULT 30
  CHECK (slot_interval_minutes > 0);

-- 2. RPC: cadência vem da config, não mais de um literal -----------------------
-- A assinatura ganha um parâmetro a mais (p_slot_interval), então é uma nova
-- sobrecarga: removemos a versão antiga (5 args) para não deixar duas funções
-- (evita ambiguidade no PostgREST / PGRST203).
DROP FUNCTION IF EXISTS public.get_available_slots(uuid, uuid, uuid, date, integer);

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_dentist_id        uuid,
  p_unit_id           uuid,
  p_procedure_id      uuid,
  p_date              date,
  p_duration_override integer DEFAULT NULL::integer,
  p_slot_interval     integer DEFAULT NULL::integer
)
RETURNS TABLE(start_at timestamptz, end_at timestamptz, chair_id uuid, chair_name text)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_duration       int;
  v_schedule       dentist_schedules%ROWTYPE;
  v_day_of_week    int;
  v_slot_start     timestamptz;
  v_slot_end       timestamptz;
  v_work_start     timestamptz;
  v_work_end       timestamptz;
  v_tz             text;
  v_interval_min   int;
  v_slot_interval  interval;
BEGIN
  -- Duração do procedimento (override > tabela). Sem duração -> sem slots.
  IF p_duration_override IS NOT NULL THEN
    v_duration := p_duration_override;
  ELSE
    SELECT duration_minutes INTO v_duration FROM procedures WHERE id = p_procedure_id;
  END IF;

  IF v_duration IS NULL THEN RETURN; END IF;

  -- Resolve timezone e cadência da conta do dentista numa só passada.
  SELECT a.timezone, a.slot_interval_minutes
    INTO v_tz, v_interval_min
  FROM accounts a
  JOIN users u    ON u.account_id = a.id
  JOIN dentists d ON d.user_id   = u.id
  WHERE d.id = p_dentist_id
  LIMIT 1;

  v_tz           := COALESCE(v_tz, 'America/Sao_Paulo');
  -- Cadência: override > config da conta > 30 (fallback de segurança).
  v_interval_min := COALESCE(p_slot_interval, v_interval_min, 30);
  v_slot_interval := (v_interval_min || ' minutes')::interval;

  v_day_of_week := EXTRACT(DOW FROM p_date);

  SELECT * INTO v_schedule
  FROM dentist_schedules
  WHERE dentist_id = p_dentist_id
    AND unit_id    = p_unit_id
    AND day_of_week = v_day_of_week;

  IF NOT FOUND THEN RETURN; END IF;

  v_work_start := (p_date::text || ' ' || v_schedule.start_time::text)::timestamp AT TIME ZONE v_tz;
  v_work_end   := (p_date::text || ' ' || v_schedule.end_time::text)::timestamp AT TIME ZONE v_tz;

  -- O slot reserva o intervalo inteiro [start, start + duração); a cadência só
  -- controla de quanto em quanto tempo um novo início é testado.
  v_slot_start := v_work_start;
  WHILE v_slot_start + (v_duration || ' minutes')::interval <= v_work_end LOOP
    v_slot_end := v_slot_start + (v_duration || ' minutes')::interval;

    IF NOT EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.dentist_id = p_dentist_id
        AND a.status NOT IN ('cancelled', 'no_show')
        AND a.start_at < v_slot_end
        AND a.end_at   > v_slot_start
    ) AND NOT EXISTS (
      SELECT 1 FROM schedule_blocks b
      WHERE b.dentist_id = p_dentist_id
        AND b.start_at < v_slot_end
        AND b.end_at   > v_slot_start
    ) THEN
      RETURN QUERY
        SELECT v_slot_start, v_slot_end, c.id, c.name
        FROM chairs c
        WHERE c.unit_id  = p_unit_id
          AND c.is_active = true
          AND NOT EXISTS (
            SELECT 1 FROM appointments a2
            WHERE a2.chair_id = c.id
              AND a2.status NOT IN ('cancelled', 'no_show')
              AND a2.start_at < v_slot_end
              AND a2.end_at   > v_slot_start
          )
        LIMIT 1;
    END IF;

    v_slot_start := v_slot_start + v_slot_interval;
  END LOOP;
END;
$function$;
