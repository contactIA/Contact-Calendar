ALTER TABLE "agenda"."caixa_de_saida" DROP CONSTRAINT "caixa_de_saida_destino";--> statement-breakpoint
ALTER TABLE "agenda"."caixa_de_saida" DROP CONSTRAINT "caixa_de_saida_tipo_do_destino";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP CONSTRAINT "clinicas_antecedencia_do_lembrete";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP COLUMN "token_plataforma_cifrado";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP COLUMN "remetente";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP COLUMN "confirmacao_modelo_id";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP COLUMN "confirmacao_modelo_nome";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP COLUMN "lembrete_modelo_id";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP COLUMN "lembrete_modelo_nome";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP COLUMN "lembrete_antecedencia_horas";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP COLUMN "sincronizar_contatos";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP COLUMN "etiqueta_agendou_id";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP COLUMN "etiqueta_compareceu_id";--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" DROP COLUMN "etiqueta_faltou_id";--> statement-breakpoint
ALTER TABLE "agenda"."consultas" DROP COLUMN "lembrete_mensagem_id";--> statement-breakpoint
-- A agenda não manda mensagem (fase 7c): os avisos à plataforma que sobraram saem antes da regra nova.
DELETE FROM "agenda"."caixa_de_saida" WHERE "destino" <> 'crm';--> statement-breakpoint
ALTER TABLE "agenda"."caixa_de_saida" ADD CONSTRAINT "caixa_de_saida_destino" CHECK ("agenda"."caixa_de_saida"."destino" in ('crm'));--> statement-breakpoint
ALTER TABLE "agenda"."caixa_de_saida" ADD CONSTRAINT "caixa_de_saida_tipo_do_destino" CHECK ("agenda"."caixa_de_saida"."destino" = 'crm' and "agenda"."caixa_de_saida"."tipo" in ('consulta_criada', 'consulta_remarcada', 'consulta_cancelada', 'paciente_faltou', 'paciente_compareceu'));