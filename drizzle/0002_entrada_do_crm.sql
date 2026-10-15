CREATE TABLE "agenda"."entradas_do_crm" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agenda"."entradas_do_crm_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"clinica_id" uuid NOT NULL,
	"entrega_id" bigint NOT NULL,
	"evento" text NOT NULL,
	"tipo" text NOT NULL,
	"crm_card_id" uuid,
	"corpo" jsonb NOT NULL,
	"situacao" text DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"proxima_tentativa_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_erro" text,
	"resultado" jsonb,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"processado_em" timestamp with time zone,
	CONSTRAINT "entradas_do_crm_entrega" UNIQUE("clinica_id","entrega_id"),
	CONSTRAINT "entradas_do_crm_situacao" CHECK ("agenda"."entradas_do_crm"."situacao" in ('pendente', 'processado', 'ignorado', 'falhou')),
	CONSTRAINT "entradas_do_crm_tentativas" CHECK ("agenda"."entradas_do_crm"."tentativas" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agenda"."entradas_do_crm" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."vindas_do_crm" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"crm_card_id" uuid NOT NULL,
	"tipo" text DEFAULT 'marcar' NOT NULL,
	"situacao" text DEFAULT 'pendente' NOT NULL,
	"unidade_id" uuid,
	"nome" text,
	"telefone" text NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone,
	"profissional_no_prontuario_id" text,
	"profissional_no_prontuario_nome" text,
	"motivo" text,
	"consulta_id" uuid,
	"resolvida_por_tipo" text,
	"resolvida_por_id" uuid,
	"resolvida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vindas_do_crm_da_clinica" UNIQUE("clinica_id","id"),
	CONSTRAINT "vindas_do_crm_tipo" CHECK ("agenda"."vindas_do_crm"."tipo" in ('marcar', 'remarcar')),
	CONSTRAINT "vindas_do_crm_situacao" CHECK ("agenda"."vindas_do_crm"."situacao" in ('pendente', 'encaixada', 'descartada')),
	CONSTRAINT "vindas_do_crm_resolvida_por" CHECK ("agenda"."vindas_do_crm"."resolvida_por_tipo" is null or "agenda"."vindas_do_crm"."resolvida_por_tipo" in ('usuario', 'ia', 'integracao', 'sistema')),
	CONSTRAINT "vindas_do_crm_telefone_e164" CHECK ("agenda"."vindas_do_crm"."telefone" ~ '^\+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
ALTER TABLE "agenda"."vindas_do_crm" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" ADD COLUMN "crm_webhook_id" text;--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" ADD COLUMN "crm_webhook_segredo_cifrado" text;--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" ADD COLUMN "procedimento_das_vindas_id" uuid;--> statement-breakpoint
ALTER TABLE "agenda"."profissionais" ADD COLUMN "id_no_prontuario" text;--> statement-breakpoint
ALTER TABLE "agenda"."entradas_do_crm" ADD CONSTRAINT "entradas_do_crm_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "agenda"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."vindas_do_crm" ADD CONSTRAINT "vindas_do_crm_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "agenda"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."vindas_do_crm" ADD CONSTRAINT "vindas_do_crm_unidade_da_clinica" FOREIGN KEY ("clinica_id","unidade_id") REFERENCES "agenda"."unidades"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."vindas_do_crm" ADD CONSTRAINT "vindas_do_crm_consulta_da_clinica" FOREIGN KEY ("clinica_id","consulta_id") REFERENCES "agenda"."consultas"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entradas_do_crm_pendentes" ON "agenda"."entradas_do_crm" USING btree ("proxima_tentativa_em","id") WHERE "agenda"."entradas_do_crm"."situacao" = 'pendente';--> statement-breakpoint
CREATE INDEX "entradas_do_crm_do_card" ON "agenda"."entradas_do_crm" USING btree ("crm_card_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "vindas_do_crm_pendente_do_card" ON "agenda"."vindas_do_crm" USING btree ("clinica_id","crm_card_id") WHERE "agenda"."vindas_do_crm"."situacao" = 'pendente';--> statement-breakpoint
CREATE INDEX "vindas_do_crm_pendentes" ON "agenda"."vindas_do_crm" USING btree ("clinica_id","inicio") WHERE "agenda"."vindas_do_crm"."situacao" = 'pendente';--> statement-breakpoint
CREATE UNIQUE INDEX "profissionais_no_prontuario" ON "agenda"."profissionais" USING btree ("clinica_id","id_no_prontuario") WHERE "agenda"."profissionais"."id_no_prontuario" is not null;