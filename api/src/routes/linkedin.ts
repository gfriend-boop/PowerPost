import { Router } from "express";
import { config, isUnipileConfigured } from "../config.js";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { fetchPostHistory, startHostedAuth } from "../services/unipile.js";
import { HttpError, asyncHandler } from "../utils/http.js";

const router = Router();

router.post(
  "/connect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const redirectTo = `${config.webOrigin}/onboarding/linkedin-connected`;
    const link = await startHostedAuth(redirectTo, userId);

    if (!isUnipileConfigured()) {
      // Demo mode: synthesise a connected account immediately and seed sample posts.
      await pool.query(
        `INSERT INTO linkedin_accounts (user_id, unipile_account_id, sync_status, is_demo, last_synced_at)
         VALUES ($1, $2, 'active', TRUE, now())
         ON CONFLICT (user_id) DO UPDATE SET
           unipile_account_id = EXCLUDED.unipile_account_id,
           sync_status = 'active',
           is_demo = TRUE,
           last_synced_at = now()`,
        [userId, "demo-account"],
      );
      await syncPostsForUser(userId, "demo-account");
    }

    res.json({
      hosted_auth_url: link.url,
      demo_mode: !isUnipileConfigured(),
    });
  }),
);

router.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT account_id, unipile_account_id, connected_at, last_synced_at, sync_status, is_demo
         FROM linkedin_accounts WHERE user_id = $1`,
      [req.user!.id],
    );
    const account = rows[0] ?? null;
    if (!account) {
      res.json({ connected: false });
      return;
    }
    const counts = await pool.query<{ count: string }>(
      `SELECT count(*)::text FROM posts WHERE user_id = $1`,
      [req.user!.id],
    );
    res.json({
      connected: true,
      account,
      post_count: Number(counts.rows[0]?.count ?? "0"),
    });
  }),
);

router.post(
  "/sync",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query<{ unipile_account_id: string }>(
      `SELECT unipile_account_id FROM linkedin_accounts WHERE user_id = $1`,
      [userId],
    );
    const account = rows[0];
    if (!account?.unipile_account_id) {
      throw new HttpError(400, "No LinkedIn account connected");
    }
    const inserted = await syncPostsForUser(userId, account.unipile_account_id);
    res.json({ ok: true, posts_synced: inserted });
  }),
);

router.delete(
  "/disconnect",
  requireAuth,
  asyncHandler(async (req, res) => {
    await pool.query("DELETE FROM linkedin_accounts WHERE user_id = $1", [req.user!.id]);
    await pool.query("DELETE FROM posts WHERE user_id = $1", [req.user!.id]);
    res.json({ ok: true });
  }),
);

export async function syncPostsForUser(userId: string, unipileAccountId: string): Promise<number> {
  const posts = await fetchPostHistory(unipileAccountId);
  await pool.query("DELETE FROM posts WHERE user_id = $1", [userId]);
  if (posts[0]) {
    console.log(
      "[unipile sync] sample mapped post:",
      JSON.stringify({ ...posts[0], content: posts[0].content.slice(0, 80) + "..." }),
    );
  }
  let inserted = 0;
  let failed = 0;
  for (const post of posts) {
    try {
      await pool.query(
        `INSERT INTO posts (
           user_id, linkedin_post_id, content, posted_at,
           impressions, likes, comments, shares, clicks, post_type
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'short_post')`,
        [
          userId,
          post.external_id || null,
          post.content,
          post.posted_at,
          post.metrics.impressions,
          post.metrics.likes,
          post.metrics.comments,
          post.metrics.shares,
          post.metrics.clicks,
        ],
      );
      inserted++;
    } catch (err) {
      failed++;
      // Log just the first few failures to keep the logs tractable.
      if (failed <= 3) {
        console.error(
          `[unipile sync] insert failed for post ${post.external_id}:`,
          (err as Error).message,
        );
      }
    }
  }
  console.log(`[unipile sync] inserted ${inserted}, failed ${failed} of ${posts.length}`);
  await pool.query(
    `UPDATE linkedin_accounts SET last_synced_at = now(), sync_status = 'active' WHERE user_id = $1`,
    [userId],
  );
  return inserted;
}

export default router;
