// Regra de dependência da Clean Architecture por módulo (ADR 0001, a mesma do
// CRM), verificada no CI com `npm run deps:check`. Se uma regra daqui quebrar, a
// build falha: é o que impede a arquitetura de se desfazer com a pressa.
//
// O código antigo (src/lib, src/hooks, src/components, src/types e as rotas e
// páginas que ainda usam o supabase-js) sai fase a fase. Ele não segue estas
// regras, mas o código novo não pode depender dele.

const PACOTES = ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg', 'npm-unknown', 'core']
const TESTE = '\\.test\\.tsx?$'
const NOVO = '^src/(modulos|api|infra|compartilhado|worker)/|^src/composicao\\.ts$|^src/app/api/\\[\\[\\.\\.\\.rota\\]\\]/'
const LEGADO = '^src/(lib|hooks|components|types)/'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'novo-sem-legado',
      comment: 'O código novo não usa o antigo: o que precisar dele é reescrito no módulo certo.',
      severity: 'error',
      from: { path: NOVO },
      to: { path: LEGADO },
    },
    {
      name: 'dominio-sem-pacotes',
      comment: 'dominio/ é puro: sem pacotes nem módulos do Node. O instante entra por parâmetro.',
      severity: 'error',
      from: { path: '^src/modulos/[^/]+/dominio/', pathNot: TESTE },
      to: { dependencyTypes: PACOTES },
    },
    {
      name: 'dominio-sem-outras-camadas',
      comment: 'dominio/ só importa domínio e src/compartilhado.',
      severity: 'error',
      from: { path: '^src/modulos/[^/]+/dominio/' },
      to: { path: '^src/', pathNot: ['^src/modulos/[^/]+/dominio/', '^src/compartilhado/'] },
    },
    {
      name: 'aplicacao-sem-infraestrutura',
      comment: 'aplicacao/ depende do domínio e das portas que declara, nunca dos adaptadores.',
      severity: 'error',
      from: { path: '^src/modulos/[^/]+/aplicacao/', pathNot: TESTE },
      to: { path: ['^src/(modulos/[^/]+/infraestrutura|infra|api|app|worker)/', '^src/composicao\\.ts$'] },
    },
    {
      name: 'aplicacao-sem-frameworks',
      comment: 'Caso de uso não conhece Next, Hono, banco nem fila: isso é trabalho dos adaptadores.',
      severity: 'error',
      from: { path: '^src/modulos/[^/]+/aplicacao/', pathNot: TESTE },
      to: { path: '(^|/)node_modules/(next|react|react-dom|hono|@hono|@scalar|drizzle-orm|postgres|pg-boss)/' },
    },
    {
      name: 'modulo-conversa-pela-aplicacao',
      comment: 'Um módulo só usa outro pela camada aplicacao/ dele.',
      severity: 'error',
      from: { path: '^src/modulos/([^/]+)/' },
      to: { path: '^src/modulos/[^/]+/(dominio|infraestrutura)/', pathNot: '^src/modulos/$1/' },
    },
    {
      name: 'entradas-pela-composicao',
      comment: 'Rotas e páginas pedem os casos de uso a src/composicao.ts; não montam adaptadores.',
      severity: 'error',
      from: { path: '^src/(api|app)/' },
      to: { path: '^src/(infra|modulos/[^/]+/infraestrutura)/' },
    },
    {
      name: 'infra-generica',
      comment: 'src/infra guarda só conexões genéricas (banco, fila); não conhece os módulos.',
      severity: 'error',
      from: { path: '^src/infra/' },
      to: { path: ['^src/(modulos|api|app|worker)/', '^src/composicao\\.ts$'] },
    },
    {
      name: 'compartilhado-puro',
      comment: 'src/compartilhado é função pura, usada por todos: não depende de ninguém.',
      severity: 'error',
      from: { path: '^src/compartilhado/', pathNot: TESTE },
      to: { dependencyTypes: PACOTES },
    },
    {
      name: 'compartilhado-sem-camadas',
      severity: 'error',
      from: { path: '^src/compartilhado/' },
      to: { path: ['^src/(modulos|infra|api|app|worker)/', '^src/composicao\\.ts$'] },
    },
    {
      name: 'sem-ciclos',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.next/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
}
