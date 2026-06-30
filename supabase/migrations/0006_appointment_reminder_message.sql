-- ============================================================================
-- 0006 — Guarda o id da mensagem de lembrete agendada na Helena
--
-- Contexto: ao criar uma consulta, agendamos um lembrete na Helena via
-- POST /chat/v1/scheduled-message, que devolve um id. Guardamos esse id no
-- próprio agendamento para poder CANCELAR o lembrete quando a consulta é
-- cancelada e REAGENDAR (cancelar + criar) quando ela é remarcada — evitando
-- que o paciente receba lembrete de uma consulta que não acontece mais.
-- ============================================================================

ALTER TABLE public.appointments
  ADD COLUMN reminder_message_id text;
