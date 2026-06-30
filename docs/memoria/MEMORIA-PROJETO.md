# Memória do Projeto — Plataforma Contact (Escala Agenda 2.0)
> Última atualização: 28/06/2026 por André Pujol

---

## 1. Contexto Essencial

- **O que é:** Evolução do Escala Agenda (clínica odontológica, multi-tenant) para uma plataforma completa com kanban próprio usando Helena como backend, ficha Paciente 360°, dashboards de leads/financeiro e sync bidirecional com a API Helena.
- **Stack confirmada:** Next.js 16.2.6 (App Router) + React 19 + TypeScript 5 + Tailwind CSS 4 + Supabase (PostgreSQL 17, RLS, Realtime) + Vercel deploy
- **Integrações externas:** Helena (api.wts.chat, Bearer token via `account_integrations`); Clinicorp (api.clinicorp.com, Basic Auth via `account_integrations`, somente leitura financeira)

### Repositórios Git

| Repo | URL | Conta | Conteúdo |
|------|-----|-------|---------|
| **Documentação** | https://github.com/andrelves/plataforma-contact-docs | andrelves (André) | Docs, roadmap, backlog, guias, memória |
| **Código** | https://github.com/contactIA/Contact-Calendar | contactIA (Gabriel) | Projeto Next.js — **repositório atual desde 18/06/2026** |
| ~~Código (antigo)~~ | ~~https://github.com/g4bs2006/Agenda---Contact-~~ | ~~g4bs2006~~ | ~~Abandonado — não usar~~ |

### Localização local (máquina André)
```
c:\Users\andre.pujol\Desktop\
├── PROJETO CRM\                  ← este repo (docs) — clonado de andrelves/plataforma-contact-docs
│   ├── docs\
│   │   ├── memoria\              ← você está aqui
│   │   ├── BACKLOG.md
│   │   ├── CRONOGRAMA-KANBAN.md
│   │   ├── ETAPA-1-GUIA-DETALHADO.md
│   │   ├── ETAPA-2-3-GUIA-DETALHADO.md
│   │   ├── GUIA-KANBAN-HELENA.md
│   │   ├── ROADMAP-PRODUTO.md
│   │   ├── arquitetura-e-componentes.md
│   │   └── requisitos-do-sistema.md
│   ├── analista-requisitos.md    ← agente Claude
│   ├── arquiteto-projetos.md     ← agente Claude
│   ├── memoria-projetos.md       ← agente Claude
│   ├── revisor-entregas.md       ← agente Claude
│   └── task-producao.md          ← agente Claude
└── Contact-Calendar\             ← código Next.js — clonado de contactIA/Contact-Calendar
    ├── src\
    ├── supabase\migrations\      ← migrations versionadas (0001 init, 0002 cadência)
    └── docs\relatorio\           ← relatórios de sessão do Gabriel
```

### Como rodar o código (projeto Next.js)
```bash
cd "c:\Users\andre.pujol\Desktop\Contact-Calendar"
npm install
npm run dev       # localhost:3000
npm run lint
npm run typecheck
npm run build
```

---

## 2. Como Retomar uma Sessão com Claude Code

> Leia isto ao abrir o Claude Code em qualquer máquina. É a "carta para o futuro".

### Passo 1 — Clonar/atualizar os repositórios
```bash
# Documentação (se não tiver local):
git clone https://github.com/andrelves/plataforma-contact-docs "MELHORIA PLATAFORMA"

# Atualizar se já tiver:
cd "MELHORIA PLATAFORMA" && git pull

# Código (se não tiver):
git clone https://github.com/g4bs2006/Agenda---Contact-
```

### Passo 2 — Abrir o Claude Code na pasta certa
Abrir o Claude Code com a pasta `MELHORIA PLATAFORMA` como working directory. Os arquivos de agentes (`.md`) estão nessa pasta raiz.

### Passo 3 — Carregar o contexto
Dizer ao Claude: *"Leia docs/memoria/MEMORIA-PROJETO.md e docs/memoria/ACOMPANHAMENTO.md e me diga onde paramos."*

### Passo 4 — Continuar de onde parou
O `ACOMPANHAMENTO.md` tem a seção **🔄 Em Andamento** e **📋 Falta Fazer** com as próximas tasks.

### Agentes disponíveis neste projeto
Os arquivos `.md` na raiz são agentes Claude configurados para este projeto:

| Arquivo | Função | Quando usar |
|---------|--------|-------------|
| `memoria-projetos.md` | Guardião da memória | Início/fim de sessão, salvar decisões |
| `analista-requisitos.md` | Levanta e documenta requisitos | Novo módulo/feature |
| `arquiteto-projetos.md` | Arquitetura e roadmap | Revisão pós-release |
| `task-producao.md` | Quebra scope em tasks mastigadas | Gerar guias de etapas |
| `revisor-entregas.md` | Valida entrega contra DoD | Antes de marcar task como done |

---

## 3. Contexto Técnico Crítico (não está em nenhum outro doc)

### API Helena — regras que custaram tempo descobrir
- **Endpoint de mover card:** `PUT https://api.wts.chat/crm/v2/panel/card/{cardId}` com body `{fields:["StepId","Description","TagIds"], stepId, description, tagIds}`. **Não é `/v3/panel-card`** (versão antiga errada).
- **Buscar card por paciente:** `GET /crm/v1/panel/card?PanelId={id}&ContactId={id}`
- **Tags = MERGE obrigatório.** A API Helena nunca substitui o array — soma. Para remover tag: só manualmente no painel.
- **Tags NÃO podem ser criadas via API.** Devem existir antes, criadas manualmente no painel. Vinculadas por UUID na `tag_links`.
- **description do card é sagrado.** Contém resumo estruturado da IA (Status Atual, Estágio Parado, Dor Principal, Resumo Rápido, Instrução p/ Futuro). Ao mover card: buscar description atual e preservar no PUT — nunca sobrescrever com string vazia.

### Funil Helena — 9 etapas na ordem exata
```
LEADS → NÃO AGENDADO → AGENDADOS → REAGENDADO → CANCELOU →
FALTOU → COMPARECIDO → COMPARECEU E NÃO FECHOU → COMPARECEU E FECHOU
```
> COMPARECIDO = orçamento em aberto (não é etapa separada — é a mesma).

### Famílias de tags por card
- **unidade:** ex. `ELDORADO` (uma por clínica)
- **CRC:** ex. `AGENDADOS ANA`, `AGENDADO IA` (até 4 por clínica)
- **canal:** `INSTAGRAM`, `GOOGLE`, `FACEBOOK`, `ORGÂNICO`, `INDICAÇÃO`

### Identidade visual Contact (brand tokens)
```css
--brand: linear-gradient(135deg, #7C3AED 0%, #C026D3 50%, #DC2626 100%);
--brand-solid: #9333EA;
--brand-light: #faf5ff;
--brand-text: #7C3AED;
--brand-border: rgba(147,51,234,0.3);
/* sucesso: #16a34a | erro/perigo: #dc2626 */
```

### Convenções do código `Agenda---Contact-`
- Rotas API: `withAuth(handler, allowedRoles?)` + `ok()` + `err()` de `@/lib/api`
- DB: `supabaseAdmin` de `@/lib/supabase`
- Validação: `zod`
- Tipos: `src/types/database.ts` (regenerar após cada migration com MCP Supabase)
- Cliente Helena atual: `src/lib/helena.ts` (tem contato/sessão/mensagem — **não tem** painel/card/tag ainda → TASK-010)

### ADRs críticas (resumo)
| ADR | Decisão |
|-----|---------|
| ADR 7 | Single Writer: toda movimentação de card pelo backend da plataforma. n8n migra para chamar API da plataforma (R2). |
| ADR 8 | Tags pré-criadas manualmente na Helena. Vinculação por UUID na `tag_links`. |
| Mirror+Outbox | UI lê do espelho local (Supabase). Writes vão pro outbox → worker entrega na Helena com retry ×5. |

---

## 4. Decisões (mais recente primeiro)

| Data | Decisão | Motivo | Impacto |
|------|---------|--------|---------|
| 18/06/2026 | **Repositório de documentação criado no GitHub** (`andrelves/plataforma-contact-docs`, privado). | Permitir acesso em qualquer máquina e compartilhar com a equipe. | `git pull` antes de cada sessão. |
| 15/06/2026 | **MVP confirmado em 22/07/2026.** TASK-051 estoura para 23/07 com mitigação (André pavimenta backend). | Gabriel acumula 36h; chain crítica de sync só libera 360° em 23/07. | Corte de 6 itens do MVP. |
| 15/06/2026 | **360° fica com Gabriel.** André assume TASK-051-A (endpoint timeline + dados) em 16-18/07; Gabriel faz só o drawer UI (TASK-051-B) em 21-23/07. | Mitigação do estouro sem violar autoria do Gabriel. | 360° fecha 23/07. |
| 15/06/2026 | **Gabriel arranca com TASK-030+031 em 16-22/06** (durações + SlotPicker, independem da Helena). | Fundação Helena só fica pronta ~23/06; evita ociosidade. | Gabriel ocupa 9h antes da fundação. |
| 15/06/2026 | **Cortados do MVP:** TASK-024/025/026 (webhook inbound), TASK-021 (fallback outbox), TASK-044 (modal card), TASK-036 (DnD reagendamento), TASK-034 (validação conflito), EPIC-06 inteiro (API pública). | Sem cortes o MVP ia para ~05/08. | Itens vão para R1.1/R2. |
| 12/06/2026 | **ADR 7 — Single Writer.** n8n para de chamar Helena direto, passa a chamar API da plataforma. | Consistência e log de movimentações. | n8n migra na R2. |
| 12/06/2026 | **Endpoint Helena confirmado via PoC** (workflow n8n real da Salutar). | Elimina incerteza técnica do sync. | Path `/crm/v2/panel/card/{cardId}` é o canônico. |
| 12/06/2026 | **Agenda própria = fonte da verdade; Clinicorp = somente leitura financeira.** | Estratégia: trazer clientes do Clinicorp para a plataforma. | Nenhuma escrita vai para o Clinicorp. |

---

## 5. Log de Execuções (mais recente primeiro)

| Data | O que foi feito | Por quem | Ref |
|------|----------------|----------|-----|
| 30/06/2026 | TASK-010 ✅ APROVADA — `helena.ts` refatorado token-first, funções CRM completas, merge com 5 commits do remoto (TASK-011, lembretes, agenda). Schema `account_integrations` migrado para colunas planas (0005+0006+0007). Dev route validada ao vivo. Push commitado. | André + Claude | ACOMPANHAMENTO.md |
| 28/06/2026 | Revisão de entregas: TASK-040 ✅, TASK-030 ✅, TASK-031 ⛔ bloqueada. Docs atualizados. Repo de código confirmado. | André + Claude | ACOMPANHAMENTO.md |
| 18/06/2026 | TASK-030 concluída — duração real respeitada pela RPC, cadência configurável via `accounts.slot_interval_minutes`. Migration `0002` versionada. | Gabriel | TASK-030 ✅ |
| 23/06/2026 | TASK-040 concluída — tokens de marca no `@theme inline`, utilities via `@utility`, cores semânticas corretas. | Daniel | TASK-040 ✅ |
| 18/06/2026 | Migração do repositório de código: `g4bs2006/Agenda---Contact-` → `contactIA/Contact-Calendar`. Supabase migrado para `Contact-Calendar`. | Gabriel | — |
| 18/06/2026 | TASK-001 concluída — token Helena rotacionado, novo token no `.env` e Vercel | André | TASK-001 ✅ |
| 18/06/2026 | Repositório `andrelves/plataforma-contact-docs` criado no GitHub e documentação publicada | André | GitHub |
| 18/06/2026 | Memória do projeto reescrita com contexto completo (seção "Como retomar sessão" + técnico) | André + Claude | este arquivo |
| 16/06/2026 | Guia ultra-detalhado Etapa 2 e 3 gerado (9 tasks + drawer 360° + pós-MVP) | André + Claude | `docs/ETAPA-2-3-GUIA-DETALHADO.md` |
| 16/06/2026 | Estrutura `docs/memoria/` criada com MEMORIA-PROJETO.md + ACOMPANHAMENTO.md | André + Claude | — |
| 16/06/2026 | Guia ultra-detalhado Etapa 1 gerado (15 tasks, 16/06–06/07, formato 7-blocos) | André + Claude | `docs/ETAPA-1-GUIA-DETALHADO.md` |
| 15/06/2026 | Guia para kanban de gestão da equipe na Helena (estilo Trello) | André + Claude | `docs/GUIA-KANBAN-HELENA.md` |
| 15/06/2026 | Cronograma mestre com viabilidade, 25 tasks, mitigação 360° | André + Claude | `docs/CRONOGRAMA-KANBAN.md` |
| 13/06/2026 | Roadmap de produto R0→R5 com critérios de avanço | André + Claude | `docs/ROADMAP-PRODUTO.md` |
| 13/06/2026 | Backlog completo — 13 épicos, 29 stories, 63 tasks | André + Claude | `docs/BACKLOG.md` |
| 12/06/2026 | Arquitetura — 11 módulos, ER, 8 ADRs, brand tokens | André + Claude | `docs/arquitetura-e-componentes.md` |
| 12/06/2026 | Requisitos levantados — RF-001..070, RNF, RI, funil Helena validado | André + Claude | `docs/requisitos-do-sistema.md` |

---

## 6. Aprendizados e Armadilhas

- **Repositório de código migrado (18/06):** de `g4bs2006/Agenda---Contact-` para `contactIA/Contact-Calendar`. Supabase migrado para projeto `Contact-Calendar`. Schema replicado com migrations versionadas. Clonar em `C:\Users\andre.pujol\Desktop\Contact-Calendar`.
- **Token Helena exposto resolvido (18/06):** token antigo `pn_cSuM7...` rotacionado. Novo token APENAS em `.env` local e Vercel — nunca em código ou workflows n8n compartilhados.
- **Tags Helena NÃO são criadas via API.** Devem ser pré-criadas manualmente no painel. Tentativa de criar via API retorna erro.
- **PUT de tags = sempre MERGE.** API Helena nunca substitui — soma. Para remover tag: só manual no painel Helena.
- **description do card é sagrado.** Ao mover card via API: buscar description atual e re-enviar no PUT. Nunca sobrescrever com string vazia.
- **Endpoint correto: `/crm/v2/panel/card/{cardId}`** — versões anteriores da doc interna tinham `/v3/panel-card` (errado).
- **COMPARECIDO = orçamento em aberto.** Não são etapas separadas. Doc anterior tinha "ORÇAMENTOS EM ABERTO" como etapa separada — corrigido.
- **Gabriel é o gargalo do MVP.** Agenda + sync + 360° em série criam dependência. A mitigação (André pavimenta TASK-051-A) é estrutural — não reverter sem recalcular cronograma.
- **Supabase Vault vs pgcrypto:** PEND-2 ainda aberta — decidir na TASK-002. Vault é mais elegante, pgcrypto mais simples. Verificar se Vault está habilitado com `list_extensions` antes de codar.

---

## 7. Pendências Técnicas (dívidas conhecidas)

- [x] ~~TASK-001: Rotar token Helena exposto~~ — **concluída 18/06/2026**
- [x] ~~ETAPA-2-3-GUIA-DETALHADO.md~~ — **gerado 16/06/2026**
- [x] ~~TASK-040: Tokens de marca (Tailwind 4)~~ — **concluída 23/06/2026 (Daniel)**
- [x] ~~TASK-030: Durações dinâmicas + cadência configurável~~ — **concluída 18/06/2026 (Gabriel)**
- [x] ~~TASK-002: Tabela `account_integrations` + helper `getIntegration()`~~ — **concluída 28/06/2026 (André)**
- [ ] **TASK-031: SlotPicker visual** — bloqueada, entrega incorreta. Gabriel precisa criar `SlotPicker.tsx`.
- [x] ~~**PEND-2: Supabase Vault vs pgcrypto**~~ — **resolvido 28/06/2026**: criptografia no app layer (AES-256-GCM via Node `crypto` built-in). Chave em `INTEGRATIONS_ENCRYPTION_KEY`. Sem dependência de extensão.
- [x] ~~**TASK-010: Estender `helena.ts`**~~ — **concluída 30/06/2026 (André)**. listPanels, moveCard, getCardNotes etc. helenaFetch token-first com 429 backoff.
- [x] ~~**TASK-011: Aba Integrações Helena**~~ — **concluída 29/06/2026 (Gabriel/remoto)**. Routes admin/integrations.
- [ ] **TASK-014: Panel Mirror** — próxima na fila de André. Desbloqueada.
- [ ] **TASK-012 humano:** cadastrar tags faltantes manualmente no painel Helena (unidade, CRC, canal) antes de TASK-013. ⚠️ ATRASADA. `listTags(/core/v1/tag)` agora funciona — pode consultar pela aba de config.
- [ ] **Webhook inbound Helena** (TASK-024/025/026) — cortado do MVP, aguarda R2.
- [ ] **Migração do n8n** para chamar API da plataforma em vez da Helena direto (ADR 7, R2).
- [ ] **Dev route `/api/dev/helena-check`:** adicionar guard `NODE_ENV !== 'production'` antes do deploy. (observação do revisor)
