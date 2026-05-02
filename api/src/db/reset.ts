import { pool } from "./pool.js";

const TABLES = [
  "improvement_suggestions",
  "inspiration_ideas",
  "post_scores",
  "learned_preferences",
  "feedback_events",
  "workshop_messages",
  "workshop_sessions",
  "generated_content",
  "voice_profiles",
  "posts",
  "linkedin_accounts",
  "refresh_tokens",
  "users",
  "onboarding_copy",
  "topics",
  "snippets",
  "archetypes",
  "schema_migrations",
];

async function run(): Promise<void> {
  for (const table of TABLES) {
    try {
      await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
      console.log(`[reset] dropped ${table}`);
    } catch (err) {
      console.error(`[reset] failed dropping ${table}:`, err);
    }
  }
  console.log("[reset] done — run 'npm run migrate' then 'npm run seed' next");
  await pool.end();
}

run().catch((err) => {
  console.error("[reset] failed:", err);
  process.exit(1);
});
