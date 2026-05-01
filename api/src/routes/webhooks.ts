import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { syncPostsForUser } from "./linkedin.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

/**
 * Unipile hosted-auth notification.
 *
 * The body shape varies across Unipile API versions, so we keep the schema
 * loose: optional `account_id` (with common aliases) and optional binding
 * fields. `name` is the value we ECHO BACK from /linkedin/connect — it is
 * set to the PowerPost user_id and is how we map the new account to a user.
 */
const UnipileWebhookSchema = z
  .object({
    account_id: z.string().optional(),
    AccountId: z.string().optional(),
    name: z.string().optional(),
    user_id: z.string().optional(),
    metadata: z
      .object({
        user_id: z.string().optional(),
        name: z.string().optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

async function handleUnipileWebhook(req: Request, res: Response): Promise<void> {
  console.log("Unipile webhook received:", JSON.stringify(req.body, null, 2));

  const parsed = UnipileWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    console.error("[unipile webhook] schema parse failed:", parsed.error.flatten());
    res.status(200).json({ ok: true, bound: false, error: "schema_parse_failed" });
    return;
  }
  const body = parsed.data;

  const userId =
    body.name ??
    body.user_id ??
    body.metadata?.user_id ??
    body.metadata?.name ??
    null;

  const accountId = body.account_id ?? body.AccountId ?? null;

  console.log("[unipile webhook] resolved userId:", userId, "accountId:", accountId);

  if (!userId || !accountId) {
    console.warn(
      "[unipile webhook] missing userId or accountId — cannot bind. Body keys:",
      Object.keys(req.body ?? {}),
    );
    res.status(200).json({ ok: true, bound: false });
    return;
  }

  // Ensure the user exists before binding.
  const userCheck = await pool.query("SELECT 1 FROM users WHERE user_id = $1", [userId]);
  if (userCheck.rowCount === 0) {
    console.warn("[unipile webhook] no PowerPost user matches name:", userId);
    res.status(200).json({ ok: true, bound: false, reason: "user_not_found" });
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
    [userId, accountId],
  );

  try {
    const inserted = await syncPostsForUser(userId, accountId);
    console.log(`[unipile webhook] bound ${userId} <- ${accountId}, synced ${inserted} posts`);
  } catch (err) {
    console.error("[unipile webhook] post sync failed:", err);
    // Account is still bound; sync can be retried via POST /linkedin/sync.
  }

  res.json({ ok: true, bound: true });
}

router.post("/unipile", asyncHandler(handleUnipileWebhook));
router.post("/unipile/account-connected", asyncHandler(handleUnipileWebhook));

export default router;
