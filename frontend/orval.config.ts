import { defineConfig } from 'orval';

// Клиент API генерируется из выгрузки схемы бэкенда: npm run api.
// Всё в src/api/ перезаписывается при генерации, руками не правим.
export default defineConfig({
  smeCredit: {
    input: { target: '../docs/api/openapi.yaml' },
    output: {
      target: './src/api/endpoints.ts',
      schemas: './src/api/model',
      mode: 'tags-split',
      client: 'react-query',
      httpClient: 'axios',
      clean: true,
      override: {
        mutator: { path: './src/shared/api/http.ts', name: 'apiRequest' },
        query: { signal: true },
      },
    },
  },
});
