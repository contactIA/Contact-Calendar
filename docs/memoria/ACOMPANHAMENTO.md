# Acompanhamento — Plataforma Contact (Escala Agenda 2.0)
> Última atualização: 28/06/2026 · André Pujol (Team Leader)

---

## ✅ Finalizado

| Entrega | Data | Por quem |
|---------|------|---------|
| **TASK-010** — `helena.ts` estendido com funções CRM completas: `listPanels`, `getPanel`, `listPanelCards`, `getCardByContact`, `moveCard` (PUT retorna card completo, testado A→B→A), `getCardNotes`, `createCardNote`, `listTags` (/core/v1/tag). `helenaFetch` refatorado para token-first com backoff 429. Tipos exportados: `PaginatedResponse<T>`, `Panel`, `PanelCard`, `CardNote`, `MoveCardInput`. `AccountIntegration` multi-conta com colunas planas. Dev route `/api/dev/helena-check` validada ao vivo (12 painéis, 22 cards, notas). Migration 0007 (`panel_id`). Merge com 5 commits do remoto resolvido. Push: commits 91f1535, 0a11937, 6d148ac, 9f5cb5b, 20253a4. Revisão: **APROVADO**. | 30/06/2026 | André |
| **TASK-011** — Aba "Integrações Helena" totalmente dinâmica na tela de Configurações. Routes `/api/admin/integrations/{channels,tags,templates}`. Entregue pelo remoto (Gabriel). | 29/06/2026 | Gabriel |
| **TASK-002** — Tabela `account_integrations` criada (migration 0005 schema plano, RLS deny-all), helper `integrations.ts` + AES-256-GCM preservado, seed do token Helena. Decisão PEND-2: criptografia no app layer (Node crypto built-in). Migrations 0006 (reminder_message_id) e 0007 (panel_id) aplicadas no Supabase. | 28/06/2026 | André |
| **TASK-001** — Token Helena rotacionado, novo token em `.env` + Vercel, antigo retorna 401 | 18/06/2026 | André |
| **TASK-040** — Tokens de marca declarados no `@theme inline` (globals.css), utilities `bg-brand`/`text-brand`/`ring-brand-border`/`bg-brand-light` via `@utility`, cores semânticas `--color-success`/`--color-danger` com valores exatos da spec. Aplicado em botões reais. | 23/06/2026 | Daniel |
| **TASK-030** — Migration `0002_configurable_slot_cadence.sql`: RPC `get_available_slots` passa a ler cadência de `accounts.slot_interval_minutes` (default 30) em vez de literal fixo. Duração do procedimento já era respeitada via `procedures.duration_minutes`. Hook `useSlots.ts` + rota `/api/slots/available` completos. Endpoint `GET/PATCH /api/admin/account` + aba "Geral" nas Configurações. Tipos regenerados, migrations versionadas. | 18/06/2026 | Gabriel |
| **Migração de repositório e Supabase** — Código movido de `g4bs2006/Agenda---Contact-` para `contactIA/Contact-Calendar`. Supabase migrado para projeto `Contact-Calendar`. Schema replicado com migrations versionadas em `supabase/migrations/`. | 18/06/2026 | Gabriel |
| Repositório `andrelves/plataforma-contact-docs` criado (privado) + push inicial | 18/06/2026 | André |
| `docs/ETAPA-2-3-GUIA-DETALHADO.md` — 9 tasks Etapa 2 + drawer 360° + pós-MVP | 16/06/2026 | André + Claude |
| `docs/memoria/` — MEMORIA-PROJETO.md + ACOMPANHAMENTO.md (memória contínua) | 16/06/2026 | André + Claude |
| `docs/ETAPA-1-GUIA-DETALHADO.md` — 15 tasks, formato 7-blocos ultra-didático | 16/06/2026 | André + Claude |
| `docs/GUIA-KANBAN-HELENA.md` — como criar o board da equipe na Helena | 15/06/2026 | André + Claude |
| `docs/CRONOGRAMA-KANBAN.md` — tabela mestre 25 tasks + viabilidade + mitigação | 15/06/2026 | André + Claude |
| `docs/ROADMAP-PRODUTO.md` — 6 releases R0→R5 com critérios de avanço | 13/06/2026 | André + Claude |
| `docs/BACKLOG.md` — 13 épicos, 29 stories, 63 tasks mastigadas | 13/06/2026 | André + Claude |
| `docs/arquitetura-e-componentes.md` — módulos, ER, ADRs 1-8 | 12/06/2026 | André + Claude |
| `docs/requisitos-do-sistema.md` — RF-001..070, RNF, RI, funil Helena | 12/06/2026 | André + Claude |

---

## 🔄 Em Andamento

| Task | Dev | Desde | Situação |
|------|-----|-------|----------|
| **TASK-032** — Renderizar bloqueios/expediente no grid | Daniel | 17/06/2026 | Status a confirmar com Daniel. |
| **TASK-014** — Panel Mirror: carga inicial paginada (GATE R0) | André | — | Desbloqueada após TASK-010+011. Próxima na fila. |

---

## ⛔ Bloqueios

| Task | Dev | Motivo | Ação necessária |
|------|-----|--------|-----------------|
| **TASK-031** — SlotPicker visual (grade no modal) | Gabriel | Entrega incorreta: commit `c91a12b` foi um bugfix no modal existente (propagação de slot clicado), não a criação do componente `SlotPicker.tsx`. A grade visual de horários dentro do modal **não foi feita**. | Gabriel cria `SlotPicker.tsx` conforme guia detalhado (ver seção abaixo). |

---

## 📋 Falta Fazer — Etapa 1 (André, 18/06→06/07)

> Gabriel e Daniel já estão em execução paralela. Fila do André:

| # | Task | Depende de | Prazo |
|---|------|-----------|-------|
| **→ PRÓXIMA** | **TASK-010** — Estender `helena.ts` (painel/card/tag) | TASK-002 ✅ | 25/06 |
| 3 | **TASK-011** — Endpoint + aba "Integração Helena" (salvar token, painel, etapas) | TASK-010 | 30/06 |
| 4 | **TASK-012** ⚠️ humano — Cadastrar tags manualmente na Helena (unidade, CRC, canal) + listar UUIDs | TASK-001 | 17/06 ⚠️ atrasado |
| 5 | **TASK-014** — Panel Mirror: carga inicial paginada (GATE R0) | TASK-010+003+011 | 06/07 |

> **Nota TASK-012:** é tarefa HUMANA (entrar no painel da Helena e criar as tags manualmente). Não precisa de código. Listar UUIDs via `GET /v1/tag` e documentar para a TASK-013.

### Fila Gabriel (paralela)
| Task | Prazo |
|------|-------|
| TASK-030 durações dinâmicas | 18/06 |
| TASK-031 SlotPicker | 23/06 |
| TASK-003 migration espelho (4 tabelas) | 26/06 |
| TASK-004 migration outbox/log | 01/07 |
| TASK-005 alter patients/appointments | 02/07 |
| *(bloqueado 03-12/07 — aguarda TASK-020 do André)* | — |

### Fila Daniel (paralela)
| Task | Prazo |
|------|-------|
| TASK-040 brand tokens CSS | 16/06 |
| TASK-032 bloqueios no grid | 19/06 |
| TASK-033 filtros unidade/procedimento | 24/06 |
| TASK-013 tela vínculo de tags | 02/07 |

**Gate R0→R1: Panel Mirror populado e batendo com a Helena (~06/07)**

---

## 👥 Notas por Dev

- **André (Pleno, 31 anos):** Líder de processo. Capacidade 1h30/dia. Repositório de código: `github.com/contactIA/Contact-Calendar` (clonado em `C:\Users\andre.pujol\Desktop\Contact-Calendar`). Ocioso 16-22/07 — banda reservada para TASK-051-A (pavimentar backend do 360°). ⚠️ Não assumir o drawer 360° — mantido com Gabriel (decisão firme).
- **Gabriel (Júnior, 20 anos):** Mais rápido do time, usa Claude Code. Migrou o projeto para `contactIA/Contact-Calendar` + Supabase `Contact-Calendar` em 18/06. ⚠️ Revisar TODAS as entregas — tende a aceitar sugestão da IA sem verificar. Padrão identificado: copia relatórios entre cards sem distinguir escopos. André é par técnico obrigatório na TASK-022.
- **Daniel (Júnior, 27 anos):** Mais forte em frontend. TASK-040 entregue com qualidade técnica (Tailwind 4 CSS-first correto). Confirmar `--brand` e `--brand-solid` no `:root` antes de marcar done.

---

## 🗓️ Minhas Anotações de Líder

- **30/06/2026:** TASK-010 ✅ APROVADA pelo revisor. `helena.ts` refatorado para arquitetura multi-conta token-first. Funções CRM completas validadas ao vivo (12 painéis, 22 cards, notas reais). Merge com 5 commits do remoto concluído. TASK-011 também ✅ (estava no remoto, entregue pelo Gabriel). Próxima: TASK-014 (Panel Mirror). ⚠️ TASK-012 ainda atrasada — cadastrar tags manualmente na Helena (ação humana).
- **30/06/2026:** Schema `account_integrations` migrado para colunas planas (migration 0005 do remoto). Migrations 0006 e 0007 aplicadas no Supabase. Dev route `/api/dev/helena-check?secret=helena123` funcionando e validada.
- **28/06/2026:** TASK-002 ✅ concluída — tabela `account_integrations`, helper `integrations.ts`, seed executado. Token Helena cifrado no banco. Decisão PEND-2 registrada (app layer AES-256-GCM). Push em `contactIA/Contact-Calendar` commit `c25e527`.
- **28/06/2026:** Revisão das 3 tasks em Revisão no painel Helena. TASK-040 ✅ aprovada (Daniel). TASK-030 ✅ aprovada após análise do código real (Gabriel). TASK-031 ⛔ bloqueada — SlotPicker não foi feito. Repositório de código confirmado como `contactIA/Contact-Calendar`. Docs atualizados.
- **28/06/2026:** Repositório de código do projeto mudou de `g4bs2006/Agenda---Contact-` para `contactIA/Contact-Calendar`. Supabase migrou para projeto `Contact-Calendar`. Código clonado em `C:\Users\andre.pujol\Desktop\Contact-Calendar`.
- **18/06/2026:** TASK-001 concluída (token Helena rotacionado). Repositório de docs no GitHub (`andrelves/plataforma-contact-docs`). Memória do projeto reescrita com contexto completo.
- **Qualquer nova sessão:** fazer `git pull` nos dois repos antes de começar. Fazer `git push` em ambos no final da sessão.
- **Decisão firme:** 360° fica com Gabriel. André pavimenta TASK-051-A (endpoint+dados, 16-18/07) mas NÃO faz o drawer. Não reverter.
- **Após DEMO MVP (22/07):** chamar o `arquiteto-projetos` para revisar roadmap e liberar R2.
- **Fluxo de revisão de entregas:** task concluída → dev move card para "Revisão" → André roda o `revisor-entregas` → APROVADO → Concluído.
