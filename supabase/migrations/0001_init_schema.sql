-- ============================================================================
-- Contact-Calendar — schema inicial
-- Replicado fielmente do projeto escala-agenda (ref hdnveqpdvzcctzdkpwxe).
-- 13 tabelas, 4 enums, 3 funções de negócio, índices e RLS (deny-all:
-- habilitado sem policies; o acesso é feito via service_role no backend,
-- que filtra por account_id como 1ª linha e usa o RLS como 2ª linha).
-- ============================================================================

-- Extensões -----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- Enums ---------------------------------------------------------------------
CREATE TYPE public.user_role         AS ENUM ('admin', 'receptionist', 'dentist');
CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE public.block_type        AS ENUM ('absence', 'break', 'meeting', 'reserved');
CREATE TYPE public.created_by_role   AS ENUM ('receptionist', 'ai_agent');

-- Tabelas -------------------------------------------------------------------

CREATE TABLE public.accounts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  slug         text        NOT NULL UNIQUE,
  theme_config jsonb       NOT NULL DEFAULT '{}'::jsonb,
  timezone     text        NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.units (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  address    text,
  phone      text,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.users (
  id          uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid             NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  external_id text             NOT NULL,
  name        text             NOT NULL,
  email       text,
  role        public.user_role NOT NULL,
  unit_id     uuid             REFERENCES public.units(id) ON DELETE SET NULL,
  created_at  timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (account_id, external_id)
);

CREATE TABLE public.chairs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id    uuid        NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  account_id uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dentists (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  cro        text,
  specialty  text[]      NOT NULL DEFAULT '{}'::text[],
  color      text        NOT NULL DEFAULT '#3B82F6'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_id)
);

CREATE TABLE public.dentist_units (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dentist_id uuid        NOT NULL REFERENCES public.dentists(id) ON DELETE CASCADE,
  unit_id    uuid        NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  account_id uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  priority   integer     NOT NULL DEFAULT 99,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dentist_id, unit_id)
);

CREATE TABLE public.dentist_schedules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dentist_id  uuid        NOT NULL REFERENCES public.dentists(id) ON DELETE CASCADE,
  unit_id     uuid        NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  account_id  uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  day_of_week smallint    NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time  time        NOT NULL,
  end_time    time        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dentist_id, unit_id, day_of_week)
);

CREATE TABLE public.procedures (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name               text        NOT NULL,
  duration_minutes   integer     NOT NULL CHECK (duration_minutes > 0),
  color              text        NOT NULL DEFAULT '#10B981'::text,
  required_specialty text,
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.patients (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  phone      text,
  email      text,
  birth_date date,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.appointments (
  id               uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid                     NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  unit_id          uuid                     NOT NULL REFERENCES public.units(id),
  chair_id         uuid                     NOT NULL REFERENCES public.chairs(id),
  dentist_id       uuid                     NOT NULL REFERENCES public.dentists(id),
  patient_id       uuid                     NOT NULL REFERENCES public.patients(id),
  procedure_id     uuid                     NOT NULL REFERENCES public.procedures(id),
  start_at         timestamptz              NOT NULL,
  end_at           timestamptz              NOT NULL,
  duration_minutes integer                  NOT NULL CHECK (duration_minutes > 0),
  status           public.appointment_status NOT NULL DEFAULT 'scheduled'::public.appointment_status,
  notes            text,
  created_by_role  public.created_by_role   NOT NULL,
  cancelled_at     timestamptz,
  cancelled_reason text,
  created_at       timestamptz              NOT NULL DEFAULT now()
);

CREATE TABLE public.schedule_blocks (
  id         uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid             NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  dentist_id uuid             NOT NULL REFERENCES public.dentists(id) ON DELETE CASCADE,
  unit_id    uuid             NOT NULL REFERENCES public.units(id),
  start_at   timestamptz      NOT NULL,
  end_at     timestamptz      NOT NULL,
  type       public.block_type NOT NULL,
  rrule      text,
  created_by uuid             REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz      NOT NULL DEFAULT now()
);

CREATE TABLE public.dentist_priorities (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  dentist_id               uuid        NOT NULL REFERENCES public.dentists(id) ON DELETE CASCADE,
  unit_id                  uuid        REFERENCES public.units(id) ON DELETE CASCADE,
  procedure_id             uuid        REFERENCES public.procedures(id) ON DELETE CASCADE,
  priority                 integer     NOT NULL DEFAULT 99,
  consider_patient_history boolean     NOT NULL DEFAULT false,
  consider_occupation      boolean     NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_api_keys (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  key_hash     text        NOT NULL,
  label        text        NOT NULL,
  last_used_at timestamptz,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Índices -------------------------------------------------------------------
CREATE INDEX idx_ai_keys_account_active     ON public.ai_api_keys      USING btree (account_id, is_active);
CREATE INDEX idx_appointments_account_start ON public.appointments     USING btree (account_id, start_at);
CREATE INDEX idx_appointments_chair_start   ON public.appointments     USING btree (chair_id, start_at);
CREATE INDEX idx_appointments_dentist_start ON public.appointments     USING btree (dentist_id, start_at);
CREATE INDEX idx_appointments_patient       ON public.appointments     USING btree (patient_id);
CREATE INDEX idx_appointments_status        ON public.appointments     USING btree (account_id, status);
CREATE INDEX idx_appointments_unit_start    ON public.appointments     USING btree (unit_id, start_at);
CREATE INDEX idx_dentist_priorities_lookup  ON public.dentist_priorities USING btree (account_id, unit_id, procedure_id);
CREATE INDEX idx_dentist_schedules_lookup   ON public.dentist_schedules  USING btree (dentist_id, unit_id, day_of_week);
CREATE INDEX idx_patients_account           ON public.patients         USING btree (account_id);
CREATE INDEX idx_patients_name              ON public.patients         USING btree (account_id) INCLUDE (name);
CREATE INDEX idx_patients_phone             ON public.patients         USING btree (account_id, phone);
CREATE INDEX idx_blocks_account             ON public.schedule_blocks  USING btree (account_id);
CREATE INDEX idx_blocks_dentist_start       ON public.schedule_blocks  USING btree (dentist_id, start_at);
CREATE INDEX idx_users_external             ON public.users            USING btree (account_id, external_id);

-- Funções de negócio --------------------------------------------------------

-- Detecta conflito de dentista, cadeira ou bloqueio num intervalo [start, end).
CREATE OR REPLACE FUNCTION public.check_appointment_conflict(
  p_dentist_id uuid,
  p_chair_id   uuid,
  p_start_at   timestamptz,
  p_end_at     timestamptz,
  p_exclude_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(has_conflict boolean, conflict_type text, conflict_id uuid)
LANGUAGE sql
STABLE
AS $function$
  SELECT * FROM (
    SELECT true, 'dentist'::text, a.id
    FROM appointments a
    WHERE a.dentist_id = p_dentist_id
      AND a.status NOT IN ('cancelled', 'no_show')
      AND a.start_at < p_end_at
      AND a.end_at   > p_start_at
      AND (p_exclude_id IS NULL OR a.id != p_exclude_id)
    LIMIT 1
  ) t1
  UNION ALL
  SELECT * FROM (
    SELECT true, 'chair'::text, a.id
    FROM appointments a
    WHERE a.chair_id = p_chair_id
      AND a.status NOT IN ('cancelled', 'no_show')
      AND a.start_at < p_end_at
      AND a.end_at   > p_start_at
      AND (p_exclude_id IS NULL OR a.id != p_exclude_id)
    LIMIT 1
  ) t2
  UNION ALL
  SELECT * FROM (
    SELECT true, 'block'::text, b.id
    FROM schedule_blocks b
    WHERE b.dentist_id = p_dentist_id
      AND b.start_at < p_end_at
      AND b.end_at   > p_start_at
    LIMIT 1
  ) t3;
$function$;

-- Busca de pacientes ignorando acento e caixa (nome) + match em phone/email.
CREATE OR REPLACE FUNCTION public.search_patients(
  p_account_id uuid,
  p_query      text,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
)
RETURNS TABLE(id uuid, name text, phone text, email text, birth_date date, created_at timestamptz)
LANGUAGE sql
STABLE
AS $function$
  SELECT id, name, phone, email, birth_date, created_at
  FROM patients
  WHERE account_id = p_account_id
    AND (
      unaccent(lower(name))  ILIKE '%' || unaccent(lower(p_query)) || '%'
      OR phone ILIKE '%' || p_query || '%'
      OR email ILIKE '%' || p_query || '%'
    )
  ORDER BY name
  LIMIT p_limit OFFSET p_offset;
$function$;

-- Slots disponíveis respeitando a DURAÇÃO REAL do procedimento.
-- A duração vem de p_duration_override OU de procedures.duration_minutes.
-- Cada slot reserva o intervalo inteiro [start, start + duração) — um
-- procedimento de 90 min ocupa o intervalo completo, impedindo encaixe de
-- outra consulta no meio. v_slot_interval é apenas a CADÊNCIA com que os
-- horários de início são oferecidos na grade (de 30 em 30 min), não uma
-- suposição de duração.
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_dentist_id        uuid,
  p_unit_id           uuid,
  p_procedure_id      uuid,
  p_date              date,
  p_duration_override integer DEFAULT NULL::integer
)
RETURNS TABLE(start_at timestamptz, end_at timestamptz, chair_id uuid, chair_name text)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_duration      int;
  v_schedule      dentist_schedules%ROWTYPE;
  v_day_of_week   int;
  v_slot_start    timestamptz;
  v_slot_end      timestamptz;
  v_work_start    timestamptz;
  v_work_end      timestamptz;
  v_tz            text;
  v_slot_interval interval := '30 minutes';
BEGIN
  IF p_duration_override IS NOT NULL THEN
    v_duration := p_duration_override;
  ELSE
    SELECT duration_minutes INTO v_duration FROM procedures WHERE id = p_procedure_id;
  END IF;

  IF v_duration IS NULL THEN RETURN; END IF;

  SELECT a.timezone INTO v_tz
  FROM accounts a
  JOIN users u ON u.account_id = a.id
  JOIN dentists d ON d.user_id = u.id
  WHERE d.id = p_dentist_id
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_day_of_week := EXTRACT(DOW FROM p_date);

  SELECT * INTO v_schedule
  FROM dentist_schedules
  WHERE dentist_id = p_dentist_id
    AND unit_id    = p_unit_id
    AND day_of_week = v_day_of_week;

  IF NOT FOUND THEN RETURN; END IF;

  v_work_start := (p_date::text || ' ' || v_schedule.start_time::text)::timestamp AT TIME ZONE v_tz;
  v_work_end   := (p_date::text || ' ' || v_schedule.end_time::text)::timestamp AT TIME ZONE v_tz;

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

-- RLS: habilita em todas as tabelas (deny-all; sem policies, só service_role acessa)
ALTER TABLE public.accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chairs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentist_units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentist_schedules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedures         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dentist_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_api_keys        ENABLE ROW LEVEL SECURITY;
