# Acompanhamento — Plataforma Contact (Escala Agenda 2.0)

> Última atualização: 2026-06-24

## ✅ Finalizado

- **TASK-001** — Rotacionar token Helena + secret store — 2026-06-24 — André
- **TASK-040** — Tokens de marca no `globals.css` (design system base) — 2026-06-24 — Daniel

## 🔄 Em Andamento

| Task | Dev | Desde | Situação |
|------|-----|-------|----------|
| — | — | — | — |

## ⛔ Bloqueios

| O quê | Motivo | Ação para destravar | Dono |
|-------|--------|--------------------|------|
| Nenhum | — | — | — |

## 📋 Falta Fazer — Daniel (próximas da fila, R0 e R1 front)

1. **TASK-032** — Renderizar bloqueios no grid da agenda (sem dependência, pode começar já)
2. **TASK-033** — Filtros unidade/procedimento na agenda (sem dependência, pode começar já)
3. **TASK-041** — Hook `usePanelCards` + endpoint (depende de TASK-014 e TASK-003 — Gabriel/André)
4. **TASK-042** — KanbanBoard 9 colunas (depende de TASK-040 ✅ e TASK-041)
5. **TASK-043** — DnD de cards via engine (depende de TASK-042 e TASK-022)
6. **TASK-044** — Modal do card — notas e valor (depende de TASK-042)
7. **TASK-050** — Vínculo Helena no Patient Service (depende de TASK-005 e TASK-010)
8. **TASK-051** — Drawer Paciente 360° (depende de TASK-050, TASK-041, TASK-022)

## 👥 Notas por Dev

- **Daniel:** Júnior forte em frontend. Iniciou pela TASK-040 (tokens de marca) — base visual para o kanban e dashboards. Próximas tasks são TASK-032 e TASK-033, que não têm dependências de backend e podem rodar em paralelo com o trabalho do Gabriel/André.
- **Gabriel:** Responsável pelo núcleo de sync (EPIC-02) e agenda (EPIC-03). Tasks críticas: TASK-020 → TASK-022 → TASK-023.
- **André:** Pleno, líder técnico. Responsável por config/integração Helena (EPIC-01), secrets (TASK-001 ✅), API pública (EPIC-06) e migração n8n.

## 🗓️ Anotações

- 2026-06-24: Primeira sessão de trabalho com Daniel. TASK-040 entregue e verificada visualmente (gradiente bg-brand aparecendo corretamente no browser). TASK-001 também confirmada como concluída.
- 2026-06-24: TASK-012 (cadastro manual de tags na Helena) já foi realizada anteriormente.
- 2026-06-24: Caminho crítico atual: TASK-002 → TASK-003 → TASK-004 → TASK-010 → TASK-020 → TASK-022 (Gabriel/André). Daniel pode trabalhar em paralelo com TASK-032 e TASK-033.
