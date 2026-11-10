// Resets the app's objects in the test Supabase project and applies
// supabase/migrations/*.sql in order, so `npm run test:rls` always runs
// against the current schema. Only ever points at SUPABASE_TEST_DB_URL.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = join(import.meta.dirname, "..");
const envFile = join(root, ".env.test.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const dbUrl = process.env.SUPABASE_TEST_DB_URL;
const restUrl = process.env.SUPABASE_TEST_URL;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
if (!dbUrl || !restUrl || !serviceKey) {
  console.error("SUPABASE_TEST_DB_URL, SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY must be set in .env.test.local");
  process.exit(1);
}

// Drops every table and non-extension function in public, and the auth
// trigger this app adds. The test project holds nothing else.
const RESET = `
drop trigger if exists on_auth_user_created on auth.users;
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;
`;

const migrationsDir = join(root, "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  await client.query(RESET);
  for (const file of files) {
    await client.query(readFileSync(join(migrationsDir, file), "utf8"));
  }
  await client.query("notify pgrst, 'reload schema'");
  await client.query("commit");
  console.log(`applied ${files.length} migration(s): ${files.join(", ")}`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error((err as Error).message);
  process.exit(1);
} finally {
  await client.end();
}

// Wait for PostgREST to pick up the new schema before the suite starts.
const probe = files.length ? "profiles" : null;
if (probe) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const res = await fetch(`${restUrl}/rest/v1/${probe}?select=id&limit=1`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (res.ok) break;
    if (Date.now() > deadline) {
      console.error(`PostgREST did not see the schema in time (status ${res.status})`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
