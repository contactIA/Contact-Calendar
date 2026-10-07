import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // testes/ guarda os testes de integração (o banco, com as migrações reais).
    include: ['src/**/*.test.ts', 'testes/**/*.test.ts'],
  },
})
