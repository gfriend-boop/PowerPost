import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import {
  consumeRefreshToken,
  issueRefreshToken,
  signAccessToken,
} from "../services/tokens.js";
import { HttpError, asyncHandler } from "../utils/http.js";

const router = Router();

const SignupSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({ refresh_token: z.string().min(10) });

type UserRow = {
  user_id: string;
  email: string;
  name: string;
  password_hash: string;
  plan_tier: string;
  trial_active: boolean;
  trial_ends_at: Date | null;
  created_at: Date;
};

function publicUser(row: UserRow) {
  return {
    user_id: row.user_id,
    email: row.email,
    name: row.name,
    plan_tier: row.plan_tier,
    trial_active: row.trial_active,
    trial_ends_at: row.trial_ends_at,
    created_at: row.created_at,
  };
}

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const body = SignupSchema.parse(req.body);
    const existing = await pool.query("SELECT user_id FROM users WHERE email = $1", [
      body.email.toLowerCase(),
    ]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new HttpError(409, "An account with that email already exists");
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (email, name, password_hash, plan_tier, trial_active, trial_ends_at)
       VALUES ($1, $2, $3, 'builder', TRUE, $4)
       RETURNING user_id, email, name, password_hash, plan_tier, trial_active, trial_ends_at, created_at`,
      [body.email.toLowerCase(), body.name, passwordHash, trialEndsAt],
    );
    const user = rows[0]!;
    const accessToken = signAccessToken({ sub: user.user_id, email: user.email });
    const refreshToken = await issueRefreshToken(user.user_id);
    res.status(201).json({
      user: publicUser(user),
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = LoginSchema.parse(req.body);
    const { rows } = await pool.query<UserRow>(
      `SELECT user_id, email, name, password_hash, plan_tier, trial_active, trial_ends_at, created_at
         FROM users
        WHERE email = $1`,
      [body.email.toLowerCase()],
    );
    const user = rows[0];
    if (!user) {
      throw new HttpError(401, "Invalid email or password");
    }
    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) {
      throw new HttpError(401, "Invalid email or password");
    }
    await pool.query("UPDATE users SET last_active_at = now() WHERE user_id = $1", [
      user.user_id,
    ]);
    const accessToken = signAccessToken({ sub: user.user_id, email: user.email });
    const refreshToken = await issueRefreshToken(user.user_id);
    res.json({
      user: publicUser(user),
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }),
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const body = RefreshSchema.parse(req.body);
    const userId = await consumeRefreshToken(body.refresh_token);
    if (!userId) {
      throw new HttpError(401, "Invalid or expired refresh token");
    }
    const { rows } = await pool.query<UserRow>(
      `SELECT user_id, email, name, password_hash, plan_tier, trial_active, trial_ends_at, created_at
         FROM users WHERE user_id = $1`,
      [userId],
    );
    const user = rows[0];
    if (!user) throw new HttpError(401, "User no longer exists");
    const accessToken = signAccessToken({ sub: user.user_id, email: user.email });
    const refreshToken = await issueRefreshToken(user.user_id);
    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query<UserRow>(
      `SELECT user_id, email, name, password_hash, plan_tier, trial_active, trial_ends_at, created_at
         FROM users WHERE user_id = $1`,
      [userId],
    );
    const user = rows[0];
    if (!user) throw new HttpError(404, "User not found");
    const profileResult = await pool.query<{ questionnaire_completed: boolean }>(
      `SELECT questionnaire_completed FROM voice_profiles WHERE user_id = $1`,
      [userId],
    );
    const linkedinResult = await pool.query<{ sync_status: string; is_demo: boolean }>(
      `SELECT sync_status, is_demo FROM linkedin_accounts WHERE user_id = $1`,
      [userId],
    );
    res.json({
      user: publicUser(user),
      onboarding: {
        questionnaire_completed: profileResult.rows[0]?.questionnaire_completed ?? false,
      },
      linkedin: linkedinResult.rows[0]
        ? { connected: true, ...linkedinResult.rows[0] }
        : { connected: false },
    });
  }),
);

export default router;
