// Applies supabase/migrations/*.sql to the app's Supabase project, each one
// once, in order. Unlike apply-test-migrations.ts it never drops anything:
// applied files are recorded in app_meta.applied_migrations and skipped.
// Reads SUPABASE_DB_URL from .env.local, and refuses the test project.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = join(import.meta.dirname, "..");
for (const name of [".env.local", ".env.test.local"]) {
  const file = join(root, name);
  if (existsSync(file)) process.loadEnvFile(file);
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL must be set in .env.local");
  process.exit(1);
}
const testRef = process.env.SUPABASE_TEST_URL?.match(/https:\/\/([a-z0-9]+)\./)?.[1];
if (testRef && dbUrl.includes(testRef)) {
  console.error("SUPABASE_DB_URL points at the test project. Use npm run test:rls for that one.");
  process.exit(1);
}

const migrationsDir = join(root, "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`
    create schema if not exists app_meta;
    revoke all on schema app_meta from public, anon, authenticated;
    create table if not exists app_meta.applied_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );`);
  const { rows } = await client.query<{ name: string }>("select name from app_meta.applied_migrations");
  const done = new Set(rows.map((r) => r.name));
  const pending = files.filter((f) => !done.has(f));
  for (const file of pending) {
    await client.query("begin");
    try {
      await client.query(readFileSync(join(migrationsDir, file), "utf8"));
      await client.query("insert into app_meta.applied_migrations (name) values ($1)", [file]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw new Error(`${file}: ${(err as Error).message}`);
    }
  }
  await client.query("notify pgrst, 'reload schema'");
  console.log(pending.length ? `applied ${pending.length}: ${pending.join(", ")}` : "nothing to apply");
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
