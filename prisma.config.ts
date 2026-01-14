import 'dotenv/config';
import { defineConfig } from '@prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  
  // Migrations directory
  migrations: {
    path: 'prisma/migrations',
  },
  
  // Database connection
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pricehawk',
  },
});
