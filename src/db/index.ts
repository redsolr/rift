import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export const LOCAL_DATABASE_URL = "postgresql://rift:rift@localhost:5441/rift";
const connectionString = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;

// Reuse the connection across HMR reloads in dev — Next.js re-evaluates modules on every edit and postgres-js
// connections would otherwise pile up.
const globalForDb = globalThis as unknown as { __riftSql?: ReturnType<typeof postgres> };
const sql = globalForDb.__riftSql ?? postgres(connectionString, { max: 5, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.__riftSql = sql;

export const db = drizzle(sql, { schema });
export * from "./schema";
