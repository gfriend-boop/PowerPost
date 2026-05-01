import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, asyncHandler } from "../utils/http.js";

const router = Router();

router.get(
  "/drafts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT content_id, workshop_id, content_type, topic_seed, draft_content, status, feedback,
              validation_flags, scheduled_for, published_at, created_at
         FROM generated_content
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [req.user!.id],
    );
    res.json({ drafts: rows });
  }),
);

router.get(
  "/drafts/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM generated_content WHERE content_id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (rows.length === 0) throw new HttpError(404, "Draft not found");
    res.json({ draft: rows[0] });
  }),
);

const PatchSchema = z.object({
  draft_content: z.string().min(1).max(8000).optional(),
  status: z.enum(["draft", "approved", "scheduled", "published"]).optional(),
  feedback: z.enum(["thumbs_up", "thumbs_down"]).nullable().optional(),
});

router.patch(
  "/drafts/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = PatchSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [req.params.id, req.user!.id];
    if (body.draft_content !== undefined) {
      values.push(body.draft_content);
      fields.push(`draft_content = $${values.length}`);
    }
    if (body.status !== undefined) {
      values.push(body.status);
      fields.push(`status = $${values.length}`);
    }
    if (body.feedback !== undefined) {
      values.push(body.feedback);
      fields.push(`feedback = $${values.length}`);
    }
    if (fields.length === 0) throw new HttpError(400, "Nothing to update");
    const sql = `UPDATE generated_content SET ${fields.join(", ")} WHERE content_id = $1 AND user_id = $2 RETURNING *`;
    const { rows } = await pool.query(sql, values);
    if (rows.length === 0) throw new HttpError(404, "Draft not found");
    res.json({ draft: rows[0] });
  }),
);

router.delete(
  "/drafts/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `DELETE FROM generated_content WHERE content_id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (result.rowCount === 0) throw new HttpError(404, "Draft not found");
    res.json({ ok: true });
  }),
);

export default router;
