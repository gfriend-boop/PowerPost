import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { syncPostsForUser } from "./linkedin.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

const UnipileWebhookSchema = z.object({
  account_id: z.string(),
  user_id: z.string().optional(),
  user_email: z.string().email().optional(),
});

/**
 * Unipile fires this when a hosted-auth completes. Body shape varies by
 * provider; we accept the documented surface area and ignore the rest.
 *
 * Binding the resulting account_id to a PowerPost user_id requires that the
 * hosted-auth flow was started with a user_id query param (see /linkedin/connect).
 */
router.post(
  "/unipile/account-connected",
  asyncHandler(async (req, res) => {
    const body = UnipileWebhookSchema.parse(req.body);
    const userId = body.user_id;
    if (!userId) {
      res.json({ ok: true, bound: false });
      return;
    }
    await pool.query(
      `INSERT INTO linkedin_accounts (user_id, unipile_account_id, sync_status, is_demo, last_synced_at)
       VALUES ($1, $2, 'active', FALSE, now())
       ON CONFLICT (user_id) DO UPDATE SET
         unipile_account_id = EXCLUDED.unipile_account_id,
         sync_status = 'active',
         is_demo = FALSE,
         last_synced_at = now()`,
      [userId, body.account_id],
    );
    await syncPostsForUser(userId, body.account_id);
    res.json({ ok: true, bound: true });
  }),
);

export default router;
