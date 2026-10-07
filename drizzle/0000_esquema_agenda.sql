CREATE SCHEMA "agenda";
--> statement-breakpoint
CREATE TABLE "agenda"."bloqueios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"unidade_id" uuid,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"tipo" text NOT NULL,
	"motivo" text,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bloqueios_tipo" CHECK ("agenda"."bloqueios"."tipo" in ('ausencia', 'intervalo', 'reuniao', 'reservado')),
	CONSTRAINT "bloqueios_fim_depois_do_inicio" CHECK ("agenda"."bloqueios"."fim" > "agenda"."bloqueios"."inicio")
);
--> statement-breakpoint
ALTER TABLE "agenda"."bloqueios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."cadeiras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"unidade_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cadeiras_da_unidade" UNIQUE("clinica_id","unidade_id","id")
);
--> statement-breakpoint
ALTER TABLE "agenda"."cadeiras" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."caixa_de_saida" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agenda"."caixa_de_saida_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"clinica_id" uuid NOT NULL,
	"destino" text NOT NULL,
	"tipo" text NOT NULL,
	"consulta_id" uuid,
	"paciente_id" uuid,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"situacao" text DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"proxima_tentativa_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_erro" text,
	"resultado" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone,
	CONSTRAINT "caixa_de_saida_destino" CHECK ("agenda"."caixa_de_saida"."destino" in ('crm', 'plataforma')),
	CONSTRAINT "caixa_de_saida_tipo_do_destino" CHECK (("agenda"."caixa_de_saida"."destino" = 'crm' and "agenda"."caixa_de_saida"."tipo" in ('consulta_criada', 'consulta_remarcada', 'consulta_cancelada', 'paciente_faltou', 'paciente_compareceu')) or ("agenda"."caixa_de_saida"."destino" = 'plataforma' and "agenda"."caixa_de_saida"."tipo" in ('enviar_confirmacao', 'agendar_lembrete', 'cancelar_lembrete', 'sincronizar_contato', 'etiquetar_contato'))),
	CONSTRAINT "caixa_de_saida_situacao" CHECK ("agenda"."caixa_de_saida"."situacao" in ('pendente', 'concluido', 'falhou')),
	CONSTRAINT "caixa_de_saida_tentativas" CHECK ("agenda"."caixa_de_saida"."tentativas" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agenda"."caixa_de_saida" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."chaves_api" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"prefixo" text NOT NULL,
	"hash" text NOT NULL,
	"chave_cifrada" text,
	"pode_escrever" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_em" timestamp with time zone,
	"revogada_em" timestamp with time zone,
	CONSTRAINT "chaves_api_hash_unique" UNIQUE("hash"),
	CONSTRAINT "chaves_api_tipo" CHECK ("agenda"."chaves_api"."tipo" in ('ia', 'integracao'))
);
--> statement-breakpoint
ALTER TABLE "agenda"."chaves_api" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."clinicas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"fuso_horario" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"cadencia_minutos" integer DEFAULT 30 NOT NULL,
	"token_plataforma_cifrado" text,
	"remetente" text,
	"confirmacao_modelo_id" text,
	"confirmacao_modelo_nome" text,
	"lembrete_modelo_id" text,
	"lembrete_modelo_nome" text,
	"lembrete_antecedencia_horas" integer DEFAULT 24 NOT NULL,
	"sincronizar_contatos" boolean DEFAULT true NOT NULL,
	"etiqueta_agendou_id" text,
	"etiqueta_compareceu_id" text,
	"etiqueta_faltou_id" text,
	"ligada_ao_crm" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinicas_company_id_unique" UNIQUE("company_id"),
	CONSTRAINT "clinicas_cadencia" CHECK ("agenda"."clinicas"."cadencia_minutos" in (5, 10, 15, 20, 30, 60)),
	CONSTRAINT "clinicas_antecedencia_do_lembrete" CHECK ("agenda"."clinicas"."lembrete_antecedencia_horas" between 1 and 168)
);
--> statement-breakpoint
ALTER TABLE "agenda"."clinicas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."consultas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"unidade_id" uuid NOT NULL,
	"cadeira_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"paciente_id" uuid NOT NULL,
	"procedimento_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'agendada' NOT NULL,
	"observacoes" text,
	"criada_por_tipo" text NOT NULL,
	"criada_por_id" uuid,
	"cancelada_em" timestamp with time zone,
	"motivo_cancelamento" text,
	"crm_card_id" uuid,
	"lembrete_mensagem_id" text,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultas_da_clinica" UNIQUE("clinica_id","id"),
	CONSTRAINT "consultas_status" CHECK ("agenda"."consultas"."status" in ('agendada', 'confirmada', 'em_atendimento', 'concluida', 'cancelada', 'faltou')),
	CONSTRAINT "consultas_criada_por" CHECK ("agenda"."consultas"."criada_por_tipo" in ('usuario', 'ia', 'integracao', 'sistema')),
	CONSTRAINT "consultas_fim_depois_do_inicio" CHECK ("agenda"."consultas"."fim" > "agenda"."consultas"."inicio"),
	CONSTRAINT "consultas_cancelada_com_data" CHECK (("agenda"."consultas"."status" = 'cancelada') = ("agenda"."consultas"."cancelada_em" is not null)),
	CONSTRAINT "consultas_versao" CHECK ("agenda"."consultas"."versao" >= 1)
);
--> statement-breakpoint
ALTER TABLE "agenda"."consultas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."especialidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "especialidades_da_clinica" UNIQUE("clinica_id","id")
);
--> statement-breakpoint
ALTER TABLE "agenda"."especialidades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."eventos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agenda"."eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"clinica_id" uuid NOT NULL,
	"consulta_id" uuid,
	"paciente_id" uuid,
	"tipo" text NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ator_tipo" text NOT NULL,
	"ator_id" uuid,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eventos_tipo" CHECK ("agenda"."eventos"."tipo" in ('consulta_criada', 'consulta_remarcada', 'status_mudou', 'consulta_alterada', 'paciente_criado', 'paciente_alterado')),
	CONSTRAINT "eventos_ator" CHECK ("agenda"."eventos"."ator_tipo" in ('usuario', 'ia', 'integracao', 'sistema')),
	CONSTRAINT "eventos_de_alguem" CHECK ("agenda"."eventos"."consulta_id" is not null or "agenda"."eventos"."paciente_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "agenda"."eventos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."expedientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"unidade_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"inicio" time NOT NULL,
	"fim" time NOT NULL,
	CONSTRAINT "expedientes_dia_semana" CHECK ("agenda"."expedientes"."dia_semana" between 0 and 6),
	CONSTRAINT "expedientes_fim_depois_do_inicio" CHECK ("agenda"."expedientes"."fim" > "agenda"."expedientes"."inicio")
);
--> statement-breakpoint
ALTER TABLE "agenda"."expedientes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."pacientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"email" text,
	"nascimento" date,
	"observacoes" text,
	"contato_plataforma_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pacientes_da_clinica" UNIQUE("clinica_id","id"),
	CONSTRAINT "pacientes_telefone_e164" CHECK ("agenda"."pacientes"."telefone" ~ '^\+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
ALTER TABLE "agenda"."pacientes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."procedimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"duracao_minutos" integer NOT NULL,
	"cor" text DEFAULT '#10B981' NOT NULL,
	"especialidade_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procedimentos_da_clinica" UNIQUE("clinica_id","id"),
	CONSTRAINT "procedimentos_duracao" CHECK ("agenda"."procedimentos"."duracao_minutos" between 5 and 480)
);
--> statement-breakpoint
ALTER TABLE "agenda"."procedimentos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."profissionais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cro" text,
	"cor" text DEFAULT '#3B82F6' NOT NULL,
	"usuario_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profissionais_da_clinica" UNIQUE("clinica_id","id")
);
--> statement-breakpoint
ALTER TABLE "agenda"."profissionais" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."profissional_especialidades" (
	"clinica_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"especialidade_id" uuid NOT NULL,
	CONSTRAINT "profissional_especialidades_profissional_id_especialidade_id_pk" PRIMARY KEY("profissional_id","especialidade_id")
);
--> statement-breakpoint
ALTER TABLE "agenda"."profissional_especialidades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."profissional_unidades" (
	"clinica_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"unidade_id" uuid NOT NULL,
	"prioridade" integer DEFAULT 100 NOT NULL,
	CONSTRAINT "profissional_unidades_profissional_id_unidade_id_pk" PRIMARY KEY("profissional_id","unidade_id"),
	CONSTRAINT "profissional_unidades_da_clinica" UNIQUE("clinica_id","profissional_id","unidade_id"),
	CONSTRAINT "profissional_unidades_prioridade" CHECK ("agenda"."profissional_unidades"."prioridade" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agenda"."profissional_unidades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."unidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"endereco" text,
	"telefone" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"crm_unidade_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unidades_da_clinica" UNIQUE("clinica_id","id")
);
--> statement-breakpoint
ALTER TABLE "agenda"."unidades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."usuario_unidades" (
	"clinica_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"unidade_id" uuid NOT NULL,
	CONSTRAINT "usuario_unidades_usuario_id_unidade_id_pk" PRIMARY KEY("usuario_id","unidade_id")
);
--> statement-breakpoint
ALTER TABLE "agenda"."usuario_unidades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agenda"."usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinica_id" uuid NOT NULL,
	"usuario_plataforma_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text,
	"gestor" boolean DEFAULT false NOT NULL,
	"recepcao" boolean DEFAULT false NOT NULL,
	"dentista" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_da_clinica" UNIQUE("clinica_id","id"),
	CONSTRAINT "usuarios_com_papel" CHECK ("agenda"."usuarios"."gestor" or "agenda"."usuarios"."recepcao" or "agenda"."usuarios"."dentista")
);
--> statement-breakpoint
ALTER TABLE "agenda"."usuarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agenda"."bloqueios" ADD CONSTRAINT "bloqueios_profissional_da_clinica" FOREIGN KEY ("clinica_id","profissional_id") REFERENCES "agenda"."profissionais"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."bloqueios" ADD CONSTRAINT "bloqueios_unidade_da_clinica" FOREIGN KEY ("clinica_id","unidade_id") REFERENCES "agenda"."unidades"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."bloqueios" ADD CONSTRAINT "bloqueios_autor_da_clinica" FOREIGN KEY ("clinica_id","criado_por_id") REFERENCES "agenda"."usuarios"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."cadeiras" ADD CONSTRAINT "cadeiras_unidade_da_clinica" FOREIGN KEY ("clinica_id","unidade_id") REFERENCES "agenda"."unidades"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."caixa_de_saida" ADD CONSTRAINT "caixa_de_saida_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "agenda"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."caixa_de_saida" ADD CONSTRAINT "caixa_de_saida_consulta_da_clinica" FOREIGN KEY ("clinica_id","consulta_id") REFERENCES "agenda"."consultas"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."caixa_de_saida" ADD CONSTRAINT "caixa_de_saida_paciente_da_clinica" FOREIGN KEY ("clinica_id","paciente_id") REFERENCES "agenda"."pacientes"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."chaves_api" ADD CONSTRAINT "chaves_api_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "agenda"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."consultas" ADD CONSTRAINT "consultas_cadeira_da_unidade" FOREIGN KEY ("clinica_id","unidade_id","cadeira_id") REFERENCES "agenda"."cadeiras"("clinica_id","unidade_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."consultas" ADD CONSTRAINT "consultas_profissional_da_clinica" FOREIGN KEY ("clinica_id","profissional_id") REFERENCES "agenda"."profissionais"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."consultas" ADD CONSTRAINT "consultas_paciente_da_clinica" FOREIGN KEY ("clinica_id","paciente_id") REFERENCES "agenda"."pacientes"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."consultas" ADD CONSTRAINT "consultas_procedimento_da_clinica" FOREIGN KEY ("clinica_id","procedimento_id") REFERENCES "agenda"."procedimentos"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."especialidades" ADD CONSTRAINT "especialidades_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "agenda"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."eventos" ADD CONSTRAINT "eventos_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "agenda"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."eventos" ADD CONSTRAINT "eventos_consulta_da_clinica" FOREIGN KEY ("clinica_id","consulta_id") REFERENCES "agenda"."consultas"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."eventos" ADD CONSTRAINT "eventos_paciente_da_clinica" FOREIGN KEY ("clinica_id","paciente_id") REFERENCES "agenda"."pacientes"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."expedientes" ADD CONSTRAINT "expedientes_onde_o_profissional_atende" FOREIGN KEY ("clinica_id","profissional_id","unidade_id") REFERENCES "agenda"."profissional_unidades"("clinica_id","profissional_id","unidade_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."pacientes" ADD CONSTRAINT "pacientes_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "agenda"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."procedimentos" ADD CONSTRAINT "procedimentos_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "agenda"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."procedimentos" ADD CONSTRAINT "procedimentos_especialidade_da_clinica" FOREIGN KEY ("clinica_id","especialidade_id") REFERENCES "agenda"."especialidades"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."profissionais" ADD CONSTRAINT "profissionais_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "agenda"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."profissionais" ADD CONSTRAINT "profissionais_usuario_da_clinica" FOREIGN KEY ("clinica_id","usuario_id") REFERENCES "agenda"."usuarios"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."profissional_especialidades" ADD CONSTRAINT "profissional_especialidades_profissional_da_clinica" FOREIGN KEY ("clinica_id","profissional_id") REFERENCES "agenda"."profissionais"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."profissional_especialidades" ADD CONSTRAINT "profissional_especialidades_especialidade_da_clinica" FOREIGN KEY ("clinica_id","especialidade_id") REFERENCES "agenda"."especialidades"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."profissional_unidades" ADD CONSTRAINT "profissional_unidades_profissional_da_clinica" FOREIGN KEY ("clinica_id","profissional_id") REFERENCES "agenda"."profissionais"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."profissional_unidades" ADD CONSTRAINT "profissional_unidades_unidade_da_clinica" FOREIGN KEY ("clinica_id","unidade_id") REFERENCES "agenda"."unidades"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."unidades" ADD CONSTRAINT "unidades_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "agenda"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."usuario_unidades" ADD CONSTRAINT "usuario_unidades_usuario_da_clinica" FOREIGN KEY ("clinica_id","usuario_id") REFERENCES "agenda"."usuarios"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."usuario_unidades" ADD CONSTRAINT "usuario_unidades_unidade_da_clinica" FOREIGN KEY ("clinica_id","unidade_id") REFERENCES "agenda"."unidades"("clinica_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda"."usuarios" ADD CONSTRAINT "usuarios_clinica_id_clinicas_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "agenda"."clinicas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloqueios_do_profissional" ON "agenda"."bloqueios" USING btree ("profissional_id","inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "cadeiras_nome" ON "agenda"."cadeiras" USING btree ("unidade_id",lower("nome"));--> statement-breakpoint
CREATE INDEX "caixa_de_saida_pendentes" ON "agenda"."caixa_de_saida" USING btree ("proxima_tentativa_em","id") WHERE "agenda"."caixa_de_saida"."situacao" = 'pendente';--> statement-breakpoint
CREATE INDEX "caixa_de_saida_da_consulta" ON "agenda"."caixa_de_saida" USING btree ("consulta_id","id");--> statement-breakpoint
CREATE INDEX "chaves_api_da_clinica" ON "agenda"."chaves_api" USING btree ("clinica_id");--> statement-breakpoint
CREATE INDEX "consultas_por_dia" ON "agenda"."consultas" USING btree ("clinica_id","inicio");--> statement-breakpoint
CREATE INDEX "consultas_do_profissional" ON "agenda"."consultas" USING btree ("profissional_id","inicio");--> statement-breakpoint
CREATE INDEX "consultas_da_cadeira" ON "agenda"."consultas" USING btree ("cadeira_id","inicio");--> statement-breakpoint
CREATE INDEX "consultas_do_paciente" ON "agenda"."consultas" USING btree ("paciente_id","inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "especialidades_nome" ON "agenda"."especialidades" USING btree ("clinica_id",lower("nome"));--> statement-breakpoint
CREATE INDEX "eventos_da_consulta" ON "agenda"."eventos" USING btree ("consulta_id","id");--> statement-breakpoint
CREATE INDEX "eventos_do_paciente" ON "agenda"."eventos" USING btree ("paciente_id","id");--> statement-breakpoint
CREATE INDEX "eventos_da_clinica" ON "agenda"."eventos" USING btree ("clinica_id","id");--> statement-breakpoint
CREATE INDEX "expedientes_do_profissional" ON "agenda"."expedientes" USING btree ("profissional_id","dia_semana");--> statement-breakpoint
CREATE INDEX "pacientes_telefone" ON "agenda"."pacientes" USING btree ("clinica_id","telefone");--> statement-breakpoint
CREATE UNIQUE INDEX "procedimentos_nome" ON "agenda"."procedimentos" USING btree ("clinica_id",lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "profissionais_usuario" ON "agenda"."profissionais" USING btree ("clinica_id","usuario_id") WHERE "agenda"."profissionais"."usuario_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "unidades_nome" ON "agenda"."unidades" USING btree ("clinica_id",lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_por_plataforma" ON "agenda"."usuarios" USING btree ("clinica_id","usuario_plataforma_id");