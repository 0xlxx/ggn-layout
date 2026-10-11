import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['tests/bdd/cell-system.scenarios.test.ts'], environment: 'node', globals: true },
})
