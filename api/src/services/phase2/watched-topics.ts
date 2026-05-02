/**
 * Watched Topics service.
 *
 * Topics the user has explicitly told PowerPost are worth watching. Used as
 * a query input for Timely idea generation in Get Inspired. Topics can come
 * from three sources: the user's onboarding topic_authorities, detection
 * from cached LinkedIn posts, or user-added.
 *
 * Detected topics are SUGGESTIONS, not commands. They land with status
 * 'suggested' and don't influence Timely until the user accepts them.
 */

import { pool } from "../../db/pool.js";

export type WatchedTopicSource = "onboarding" | "detected_from_posts" | "user_added";
export type WatchedTopicPriority = "normal" | "high";
export type WatchedTopicStatus = "suggested" | "active" | "paused" | "dismissed";

export type WatchedTopic = {
  watched_topic_id: string;
  user_id: string;
  label: string;
  source: WatchedTopicSource;
  priority: WatchedTopicPriority;
  status: WatchedTopicStatus;
  evidence_count: number;
  evidence_post_ids: string[];
  reason: string | null;
  confidence: number | null;
  created_at: string;
  updated_at: string;
};

type WatchedTopicRow = Omit<WatchedTopic, "evidence_post_ids" | "confidence"> & {
  evidence_post_ids: string[];
  confidence: string | null;
};

const SELECT_FIELDS = `watched_topic_id, user_id, label, source, priority, status,
  evidence_count, evidence_post_ids, reason, confidence::text, created_at::text, updated_at::text`;

function rowToTopic(row: WatchedTopicRow): WatchedTopic {
  return {
    ...row,
    confidence: row.confidence === null ? null : Number(row.confidence),
  };
}

export async function listForUser(userId: string): Promise<WatchedTopic[]> {
  const { rows } = await pool.query<WatchedTopicRow>(
    `SELECT ${SELECT_FIELDS} FROM watched_topics
      WHERE user_id = $1
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'suggested' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
        CASE priority WHEN 'high' THEN 0 ELSE 1 END,
        updated_at DESC`,
    [userId],
  );
  return rows.map(rowToTopic);
}

export async function listActiveForUser(userId: string): Promise<WatchedTopic[]> {
  const { rows } = await pool.query<WatchedTopicRow>(
    `SELECT ${SELECT_FIELDS} FROM watched_topics
      WHERE user_id = $1 AND status = 'active'
      ORDER BY CASE priority WHEN 'high' THEN 0 ELSE 1 END, label`,
    [userId],
  );
  return rows.map(rowToTopic);
}

export async function listDismissedLabels(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ label: string }>(
    `SELECT label FROM watched_topics WHERE user_id = $1 AND status = 'dismissed'`,
    [userId],
  );
  return rows.map((r) => r.label);
}

export async function createUserTopic(
  userId: string,
  label: string,
  priority: WatchedTopicPriority = "normal",
): Promise<WatchedTopic> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Label is required");
  const { rows } = await pool.query<WatchedTopicRow>(
    `INSERT INTO watched_topics (user_id, label, source, priority, status)
     VALUES ($1, $2, 'user_added', $3, 'active')
     ON CONFLICT (user_id, lower(label)) WHERE status IN ('suggested', 'active', 'paused')
       DO UPDATE SET status = 'active', priority = EXCLUDED.priority, updated_at = now()
     RETURNING ${SELECT_FIELDS}`,
    [userId, trimmed, priority],
  );
  return rowToTopic(rows[0]!);
}

export async function upsertSuggested(
  userId: string,
  args: {
    label: string;
    reason: string;
    evidence_count: number;
    evidence_post_ids: string[];
    suggested_priority: WatchedTopicPriority;
    confidence: number;
    source?: WatchedTopicSource;
  },
): Promise<WatchedTopic | null> {
  const trimmed = args.label.trim();
  if (!trimmed) return null;

  // If the user previously dismissed this label, do NOT re-suggest it.
  const dismissedCheck = await pool.query<{ count: string }>(
    `SELECT count(*)::text FROM watched_topics
      WHERE user_id = $1 AND lower(label) = lower($2) AND status = 'dismissed'`,
    [userId, trimmed],
  );
  if (Number(dismissedCheck.rows[0]?.count ?? "0") > 0) return null;

  const { rows } = await pool.query<WatchedTopicRow>(
    `INSERT INTO watched_topics (
       user_id, label, source, priority, status, evidence_count, evidence_post_ids, reason, confidence
     ) VALUES ($1, $2, $3, $4, 'suggested', $5, $6::jsonb, $7, $8)
     ON CONFLICT (user_id, lower(label)) WHERE status IN ('suggested', 'active', 'paused')
       DO UPDATE SET
         evidence_count = GREATEST(watched_topics.evidence_count, EXCLUDED.evidence_count),
         evidence_post_ids = EXCLUDED.evidence_post_ids,
         reason = EXCLUDED.reason,
         confidence = GREATEST(watched_topics.confidence, EXCLUDED.confidence),
         priority = CASE
           WHEN watched_topics.priority = 'high' THEN 'high'
           ELSE EXCLUDED.priority
         END,
         updated_at = now()
     RETURNING ${SELECT_FIELDS}`,
    [
      userId,
      trimmed,
      args.source ?? "detected_from_posts",
      args.suggested_priority,
      args.evidence_count,
      JSON.stringify(args.evidence_post_ids),
      args.reason,
      args.confidence,
    ],
  );
  return rowToTopic(rows[0]!);
}

export async function updateTopic(
  userId: string,
  topicId: string,
  patch: Partial<{
    status: WatchedTopicStatus;
    priority: WatchedTopicPriority;
    label: string;
  }>,
): Promise<WatchedTopic | null> {
  const sets: string[] = [];
  const values: unknown[] = [userId, topicId];
  if (patch.status) {
    values.push(patch.status);
    sets.push(`status = $${values.length}`);
  }
  if (patch.priority) {
    values.push(patch.priority);
    sets.push(`priority = $${values.length}`);
  }
  if (patch.label) {
    values.push(patch.label.trim());
    sets.push(`label = $${values.length}`);
  }
  if (sets.length === 0) return null;
  sets.push("updated_at = now()");
  const { rows } = await pool.query<WatchedTopicRow>(
    `UPDATE watched_topics SET ${sets.join(", ")}
      WHERE user_id = $1 AND watched_topic_id = $2
      RETURNING ${SELECT_FIELDS}`,
    values,
  );
  return rows[0] ? rowToTopic(rows[0]) : null;
}

export async function deleteTopic(userId: string, topicId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM watched_topics WHERE user_id = $1 AND watched_topic_id = $2`,
    [userId, topicId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Seed watched topics from the user's onboarding topic_authorities the first
 * time they hit the topic-management UI. Idempotent — only creates topics
 * that don't already exist for the user.
 */
export async function seedFromOnboardingIfMissing(userId: string): Promise<number> {
  const existing = await pool.query<{ count: string }>(
    `SELECT count(*)::text FROM watched_topics WHERE user_id = $1`,
    [userId],
  );
  if (Number(existing.rows[0]?.count ?? "0") > 0) return 0;

  const profile = await pool.query<{ topic_authorities: string[] }>(
    `SELECT topic_authorities FROM voice_profiles WHERE user_id = $1`,
    [userId],
  );
  const labels = profile.rows[0]?.topic_authorities ?? [];
  let inserted = 0;
  for (const label of labels) {
    if (!label || typeof label !== "string") continue;
    await pool.query(
      `INSERT INTO watched_topics (user_id, label, source, priority, status)
       VALUES ($1, $2, 'onboarding', 'normal', 'active')
       ON CONFLICT (user_id, lower(label)) WHERE status IN ('suggested', 'active', 'paused')
         DO NOTHING`,
      [userId, label.trim()],
    );
    inserted++;
  }
  return inserted;
}
