import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = path.join(__dirname, "..", "..", "seeds");

type Archetype = {
  archetype_key: string;
  display_name: string;
  description: string;
  who_this_is: string;
  sample_post: string;
  default_warmth: number;
  default_storytelling: number;
  default_provocation: number;
  sort_order: number;
};

type Snippet = {
  snippet_key: string;
  pick_group: string;
  option_label: string;
  style_tag: string;
  body: string;
  signals: string[];
  sort_order: number;
};

type Topic = { topic_key: string; label: string; sort_order: number };

type OnboardingCopy = {
  copy_key: string;
  step_index: number | null;
  title: string | null;
  body: string | null;
  hint: string | null;
  cta: string | null;
};

async function loadJson<T>(filename: string): Promise<T> {
  const raw = await fs.readFile(path.join(seedsDir, filename), "utf8");
  return JSON.parse(raw) as T;
}

async function seedArchetypes(): Promise<void> {
  const rows = await loadJson<Archetype[]>("archetypes.json");
  for (const row of rows) {
    await pool.query(
      `INSERT INTO archetypes (archetype_key, display_name, description, who_this_is, sample_post, default_warmth, default_storytelling, default_provocation, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (archetype_key) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         description = EXCLUDED.description,
         who_this_is = EXCLUDED.who_this_is,
         sample_post = EXCLUDED.sample_post,
         default_warmth = EXCLUDED.default_warmth,
         default_storytelling = EXCLUDED.default_storytelling,
         default_provocation = EXCLUDED.default_provocation,
         sort_order = EXCLUDED.sort_order`,
      [
        row.archetype_key,
        row.display_name,
        row.description,
        row.who_this_is,
        row.sample_post,
        row.default_warmth,
        row.default_storytelling,
        row.default_provocation,
        row.sort_order,
      ],
    );
  }
  console.log(`[seed] archetypes: ${rows.length}`);
}

async function seedSnippets(): Promise<void> {
  const rows = await loadJson<Snippet[]>("snippets.json");
  for (const row of rows) {
    await pool.query(
      `INSERT INTO snippets (snippet_key, pick_group, option_label, style_tag, body, signals, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       ON CONFLICT (snippet_key) DO UPDATE SET
         pick_group = EXCLUDED.pick_group,
         option_label = EXCLUDED.option_label,
         style_tag = EXCLUDED.style_tag,
         body = EXCLUDED.body,
         signals = EXCLUDED.signals,
         sort_order = EXCLUDED.sort_order`,
      [
        row.snippet_key,
        row.pick_group,
        row.option_label,
        row.style_tag,
        row.body,
        JSON.stringify(row.signals),
        row.sort_order,
      ],
    );
  }
  console.log(`[seed] snippets: ${rows.length}`);
}

async function seedTopics(): Promise<void> {
  const rows = await loadJson<Topic[]>("topics.json");
  for (const row of rows) {
    await pool.query(
      `INSERT INTO topics (topic_key, label, sort_order)
       VALUES ($1,$2,$3)
       ON CONFLICT (topic_key) DO UPDATE SET
         label = EXCLUDED.label,
         sort_order = EXCLUDED.sort_order`,
      [row.topic_key, row.label, row.sort_order],
    );
  }
  console.log(`[seed] topics: ${rows.length}`);
}

async function seedOnboardingCopy(): Promise<void> {
  const rows = await loadJson<OnboardingCopy[]>("onboarding-copy.json");
  for (const row of rows) {
    await pool.query(
      `INSERT INTO onboarding_copy (copy_key, step_index, title, body, hint, cta)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (copy_key) DO UPDATE SET
         step_index = EXCLUDED.step_index,
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         hint = EXCLUDED.hint,
         cta = EXCLUDED.cta`,
      [row.copy_key, row.step_index, row.title, row.body, row.hint, row.cta],
    );
  }
  console.log(`[seed] onboarding_copy: ${rows.length}`);
}

async function run(): Promise<void> {
  await seedArchetypes();
  await seedSnippets();
  await seedTopics();
  await seedOnboardingCopy();
  console.log("[seed] done");
  await pool.end();
}

run().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
