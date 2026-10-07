-- As regras que o Drizzle não descreve (docs/modelo-de-dados.md), escritas à mão.
-- Um teste em testes/banco/ tenta quebrar cada uma.

-- 1. As extensões, no esquema `extensions`, como o Supabase recomenda. No projeto
--    do CRM, criar as duas só com o OK da equipe.
--    · btree_gist: deixa a restrição de exclusão comparar uuid e número com `=`;
--    · unaccent: a busca de paciente sem acento (consulta dedicada, fase 4).
CREATE SCHEMA IF NOT EXISTS "extensions";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "extensions";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "extensions";--> statement-breakpoint

-- 2. Ninguém tem duas consultas no mesmo horário: nem o profissional, nem a
--    cadeira, nem o paciente. O intervalo é [início, fim): encostar no fim da
--    anterior pode. Só contam as consultas que ocupam o horário, a mesma lista de
--    STATUS_QUE_OCUPAM_HORARIO em src/compartilhado/vocabulario.ts.
ALTER TABLE "agenda"."consultas" ADD CONSTRAINT "consultas_profissional_sem_sobreposicao"
  EXCLUDE USING gist ("profissional_id" WITH =, tstzrange("inicio", "fim") WITH &&)
  WHERE ("status" IN ('agendada', 'confirmada', 'em_atendimento', 'concluida'));--> statement-breakpoint
ALTER TABLE "agenda"."consultas" ADD CONSTRAINT "consultas_cadeira_sem_sobreposicao"
  EXCLUDE USING gist ("cadeira_id" WITH =, tstzrange("inicio", "fim") WITH &&)
  WHERE ("status" IN ('agendada', 'confirmada', 'em_atendimento', 'concluida'));--> statement-breakpoint
ALTER TABLE "agenda"."consultas" ADD CONSTRAINT "consultas_paciente_sem_sobreposicao"
  EXCLUDE USING gist ("paciente_id" WITH =, tstzrange("inicio", "fim") WITH &&)
  WHERE ("status" IN ('agendada', 'confirmada', 'em_atendimento', 'concluida'));--> statement-breakpoint

-- 3. Os expedientes do mesmo profissional no mesmo dia da semana não se cruzam,
--    nem em unidades diferentes. As horas viram um intervalo num dia qualquer
--    (2000-01-01) só para poder comparar.
ALTER TABLE "agenda"."expedientes" ADD CONSTRAINT "expedientes_sem_sobreposicao"
  EXCLUDE USING gist (
    "profissional_id" WITH =,
    "dia_semana" WITH =,
    tsrange(DATE '2000-01-01' + "inicio", DATE '2000-01-01' + "fim") WITH &&
  );--> statement-breakpoint

-- 4. O histórico só aceita inserção. A função não usa nenhum objeto do banco, então
--    o search_path vazio não muda nada e fecha o alerta do Supabase
--    (function_search_path_mutable), como no CRM.
CREATE FUNCTION "agenda"."eventos_somente_insercao"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'O histórico (agenda.eventos) só aceita inserção';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "eventos_somente_insercao" BEFORE UPDATE OR DELETE ON "agenda"."eventos"
  FOR EACH ROW EXECUTE FUNCTION "agenda"."eventos_somente_insercao"();--> statement-breakpoint
CREATE TRIGGER "eventos_sem_esvaziar" BEFORE TRUNCATE ON "agenda"."eventos"
  FOR EACH STATEMENT EXECUTE FUNCTION "agenda"."eventos_somente_insercao"();
