// Imports the planner's vocabulary sets and the countries into one student's
// material in the app's Supabase project. Run once per student; a second run
// adds nothing.
//
//   node scripts/import-planner-sets.ts student@example.com
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
// and never prints them.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { importPlannerSets } from "../lib/planner-import.ts";
import { PLANNER_SETS } from "../lib/spanish/planner-sets.ts";
import { COUNTRIES } from "../lib/spanish/countries.ts";

const root = join(import.meta.dirname, "..");
const envFile = join(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const email = process.argv[2]?.trim();
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/import-planner-sets.ts student@example.com");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
try {
  const result = await importPlannerSets(db, email, PLANNER_SETS, COUNTRIES);
  console.log(`Imported for ${email}: ${result.topicsCreated} new topic(s), ${result.itemsAdded} new item(s).`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
