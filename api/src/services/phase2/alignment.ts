/**
 * Alignment widget service.
 *
 * Reads recent post_scores to compute voice/performance trends and a single
 * recommended action. Drift is detected when the recent voice score average
 * is materially different from the older average, or when voice and
 * performance scores diverge.
 */

import { pool } from "../../db/pool.js";

export type AlignmentTrendPoint = { day: string; voice: number; performance: number };

export type AlignmentResult = {
  has_data: boolean;
  voice_score_avg: number | null;
  performance_score_avg: number | null;
  voice_trend: number | null; // delta vs older window
  performance_trend: number | null;
  drift: "none" | "voice_drift" | "outcome_drift" | "both";
  recommended_action: string;
  trend_points: AlignmentTrendPoint[];
  data_points: number;
};

const RECENT_WINDOW_DAYS = 14;
const COMPARISON_WINDOW_DAYS = 30;

export async function computeAlignment(userId: string): Promise<AlignmentResult> {
  const { rows: scores } = await pool.query<{
    voice_score: string;
    performance_score: string;
    created_at: string;
  }>(
    `SELECT voice_score::text, performance_score::text, created_at::text
       FROM post_scores
      WHERE user_id = $1
      ORDER BY created_at ASC`,
    [userId],
  );

  if (scores.length < 2) {
    return {
      has_data: false,
      voice_score_avg: null,
      performance_score_avg: null,
      voice_trend: null,
      performance_trend: null,
      drift: "none",
      recommended_action:
        "Score a few drafts to start seeing your alignment trend. The widget activates after a couple of scored posts.",
      trend_points: [],
      data_points: scores.length,
    };
  }

  const now = Date.now();
  const recentCutoff = now - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const comparisonCutoff = now - COMPARISON_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const recentScores = scores.filter((s) => Date.parse(s.created_at) >= recentCutoff);
  const olderScores = scores.filter((s) => {
    const t = Date.parse(s.created_at);
    return t >= comparisonCutoff && t < recentCutoff;
  });

  const recentVoice = avg(recentScores.map((s) => Number(s.voice_score)));
  const recentPerf = avg(recentScores.map((s) => Number(s.performance_score)));
  const olderVoice = avg(olderScores.map((s) => Number(s.voice_score)));
  const olderPerf = avg(olderScores.map((s) => Number(s.performance_score)));

  const voiceTrend = recentVoice !== null && olderVoice !== null ? recentVoice - olderVoice : null;
  const perfTrend = recentPerf !== null && olderPerf !== null ? recentPerf - olderPerf : null;

  // Drift logic.
  const voiceDrop = voiceTrend !== null && voiceTrend <= -1;
  const perfDrop = perfTrend !== null && perfTrend <= -1;
  const divergence =
    recentVoice !== null && recentPerf !== null && Math.abs(recentVoice - recentPerf) >= 2.5;

  let drift: AlignmentResult["drift"] = "none";
  if (voiceDrop && perfDrop) drift = "both";
  else if (voiceDrop) drift = "voice_drift";
  else if (perfDrop || divergence) drift = "outcome_drift";

  const recommendedAction = pickRecommendation({
    drift,
    recentVoice,
    recentPerf,
    voiceTrend,
    perfTrend,
    sampleSize: recentScores.length,
  });

  return {
    has_data: true,
    voice_score_avg: round(recentVoice ?? avg(scores.map((s) => Number(s.voice_score)))),
    performance_score_avg: round(
      recentPerf ?? avg(scores.map((s) => Number(s.performance_score))),
    ),
    voice_trend: round(voiceTrend),
    performance_trend: round(perfTrend),
    drift,
    recommended_action: recommendedAction,
    trend_points: bucketByDay(scores, 14),
    data_points: scores.length,
  };
}

function pickRecommendation(args: {
  drift: AlignmentResult["drift"];
  recentVoice: number | null;
  recentPerf: number | null;
  voiceTrend: number | null;
  perfTrend: number | null;
  sampleSize: number;
}): string {
  if (args.sampleSize === 0) {
    return "Score one of your recent drafts to update this widget.";
  }
  if (args.drift === "voice_drift") {
    return "Your recent drafts are sounding less like you than they were a few weeks ago. Open Edit My Voice and tighten your tone settings, or run a draft through Workshop with the voice slider pushed up.";
  }
  if (args.drift === "outcome_drift") {
    return "Your drafts are on-voice but your performance score is slipping. Pick a recent draft and run Improve My Draft with the KPI you most care about.";
  }
  if (args.drift === "both") {
    return "Both voice and performance are drifting. Consider a recalibration: revisit your voice settings and pull a high-performing past post into Workshop as a reference.";
  }
  if (args.recentVoice !== null && args.recentPerf !== null && args.recentVoice >= 8 && args.recentPerf <= 5) {
    return "You're sounding strongly like yourself, but your drafts are not giving readers enough reason to respond. Try ending a draft with a reflective question this week and use Improve My Draft optimised for comments.";
  }
  if (args.recentVoice !== null && args.recentVoice <= 5) {
    return "Your voice score is lower than usual. Workshop a draft using a topic from your top posts to anchor back into your natural style.";
  }
  return "Alignment looks healthy. Try Get Inspired for an adjacent angle that builds on what is already working.";
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round(n: number | null): number | null {
  if (n === null) return null;
  return Math.round(n * 10) / 10;
}

function bucketByDay(
  scores: Array<{ voice_score: string; performance_score: string; created_at: string }>,
  days: number,
): AlignmentTrendPoint[] {
  const buckets = new Map<string, { v: number[]; p: number[] }>();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const s of scores) {
    const t = Date.parse(s.created_at);
    if (t < cutoff) continue;
    const day = new Date(t).toISOString().slice(0, 10);
    const b = buckets.get(day) ?? { v: [], p: [] };
    b.v.push(Number(s.voice_score));
    b.p.push(Number(s.performance_score));
    buckets.set(day, b);
  }
  return [...buckets.entries()]
    .map(([day, b]) => ({
      day,
      voice: round(avg(b.v)) ?? 0,
      performance: round(avg(b.p)) ?? 0,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
