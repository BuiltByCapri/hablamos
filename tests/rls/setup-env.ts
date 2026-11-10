import { existsSync } from "node:fs";
import { join } from "node:path";

const envFile = join(import.meta.dirname, "..", "..", ".env.test.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
