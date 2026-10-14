import { defineConfig } from 'drizzle-kit';

// «npx drizzle-kit generate --name=<nombre>» escribe la migración nueva en src/data/migrations
// comparando el esquema con la última instantánea. No se conecta a ninguna base.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/data/schema.ts',
  out: './src/data/migrations',
});
