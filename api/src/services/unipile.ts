import { config, isUnipileConfigured } from "../config.js";

export type UnipilePost = {
  external_id: string;
  content: string;
  posted_at: string;
  metrics: {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
  };
};

export type UnipileHostedAuthLink = {
  url: string;
  account_id?: string;
};

const DEMO_POSTS: UnipilePost[] = [
  {
    external_id: "demo-001",
    content:
      "Three years ago I was the last person in any meeting to share a strong opinion. I told myself I was being thoughtful. I was being scared. The shift came when I realized that my silence was not protecting me. It was robbing the room of a perspective they actually needed. The people I admire most in leadership are not louder than me. They are just less willing to leave value on the table. Speak. Even when your voice shakes. Especially then.",
    posted_at: "2026-04-12T09:32:00Z",
    metrics: { impressions: 18420, likes: 612, comments: 84, shares: 27, clicks: 142 },
  },
  {
    external_id: "demo-002",
    content:
      "The fastest way to ruin a team's trust in your strategy is to keep changing it. Strategy is not a vision board. It is a contract you make with the people building it that this is the direction we are going to commit to for long enough that the work compounds. If your team does not believe you will hold the line, they will hedge their bets, and you will get the half-effort version of every initiative. Decide. Communicate. Hold.",
    posted_at: "2026-04-05T14:15:00Z",
    metrics: { impressions: 22150, likes: 891, comments: 134, shares: 56, clicks: 211 },
  },
  {
    external_id: "demo-003",
    content:
      "I used to confuse being busy with being valuable. Most weeks I was the most overwhelmed person in the room and the least clear on what we were actually trying to achieve. The day I started blocking two hours every Monday to write down what mattered for the week was the day my impact started compounding. The calendar is a leadership artifact. Audit yours.",
    posted_at: "2026-03-28T11:02:00Z",
    metrics: { impressions: 9840, likes: 326, comments: 41, shares: 12, clicks: 73 },
  },
  {
    external_id: "demo-004",
    content:
      "The best feedback I ever got came from a peer who said: you are easier to follow when you slow down. I thought speed was the value I added. It was not. Pace was. There is a difference between being fast and being a leader people can keep up with. I have been thinking about that for two years.",
    posted_at: "2026-03-19T08:45:00Z",
    metrics: { impressions: 14230, likes: 478, comments: 62, shares: 19, clicks: 98 },
  },
  {
    external_id: "demo-005",
    content:
      "Hiring update. After six weeks of interviews, we passed on three strong candidates and hired the one who challenged me the most in the final round. She told me, politely, that one of our org design assumptions was wrong. She was right. That is the bar. Comfort is not a hiring signal. Sharpening is.",
    posted_at: "2026-03-08T16:20:00Z",
    metrics: { impressions: 31050, likes: 1245, comments: 198, shares: 87, clicks: 312 },
  },
  {
    external_id: "demo-006",
    content:
      "Most of the time when someone says they are bad at delegating, what they mean is they have not done the work to make the standard explicit. People cannot match a standard you have not articulated. Write it down. Make it teachable. Then delegate.",
    posted_at: "2026-02-24T13:08:00Z",
    metrics: { impressions: 7920, likes: 211, comments: 27, shares: 9, clicks: 44 },
  },
  {
    external_id: "demo-007",
    content:
      "Early in my career I thought executive presence was about looking the part. I was wrong. Executive presence is what people feel about your judgment when you are not in the room. Build the judgment. The presence follows.",
    posted_at: "2026-02-11T10:30:00Z",
    metrics: { impressions: 26780, likes: 1031, comments: 142, shares: 64, clicks: 256 },
  },
  {
    external_id: "demo-008",
    content:
      "The hardest part of the last twelve months was not the strategy. It was the patience. Telling a team to hold their ground while every signal in the market said move is one of the most underrated leadership tests. We held. The market caught up. That is the job.",
    posted_at: "2026-01-30T09:18:00Z",
    metrics: { impressions: 19560, likes: 724, comments: 98, shares: 38, clicks: 167 },
  },
];

export async function startHostedAuth(
  redirectTo: string,
  userId: string,
): Promise<UnipileHostedAuthLink> {
  if (!isUnipileConfigured()) {
    return {
      url: `${redirectTo}?demo=1`,
      account_id: "demo-account",
    };
  }

  const notifyUrl = config.unipile.notifyUrl
    ? `${config.unipile.notifyUrl.replace(/\/$/, "")}/webhooks/unipile`
    : null;
  if (!notifyUrl) {
    console.warn(
      "[unipile] UNIPILE_NOTIFY_URL is not set. Webhook bind step will not run.",
    );
  }

  const payload = {
    type: "create" as const,
    providers: ["LINKEDIN"] as const,
    api_url: `https://${config.unipile.dsn}`,
    success_redirect_url: redirectTo,
    failure_redirect_url: redirectTo,
    expiresOn: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    notify_url: notifyUrl ?? undefined,
    // `name` is the field Unipile echoes back in the account-connected webhook.
    // We use it to bind the resulting account_id to the PowerPost user.
    name: userId,
  };

  console.log("Sending Unipile hosted auth payload:", JSON.stringify(payload, null, 2));

  const res = await fetch(`https://${config.unipile.dsn}/api/v1/hosted/accounts/link`, {
    method: "POST",
    headers: {
      "X-API-KEY": config.unipile.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[unipile] hosted auth failed:", res.status, errText);
    throw new Error(`Unipile hosted auth failed: ${res.status} ${errText}`);
  }

  const json = (await res.json()) as { url?: string };
  if (!json.url) {
    console.error("[unipile] hosted auth response missing url:", json);
    throw new Error("Unipile hosted auth response missing url");
  }
  return { url: json.url };
}

/**
 * Pull a user's LinkedIn post history from Unipile.
 *
 * Two-step flow because Unipile's posts API is keyed on the LinkedIn
 * `public_identifier` (the user's vanity slug), not on the Unipile
 * `account_id`:
 *
 *   1. GET /api/v1/accounts/{account_id} → returns connected user metadata
 *      including their LinkedIn public_identifier (typically nested under
 *      connection_params.im).
 *   2. GET /api/v1/users/{public_identifier}/posts?account_id={account_id}
 *      → returns the user's own LinkedIn posts.
 *
 * Field mapping is permissive: we accept several common aliases for post
 * content, posted-at timestamp, and engagement metrics so a Unipile API
 * change does not silently produce empty rows.
 */

export async function fetchPostHistory(unipileAccountId: string): Promise<UnipilePost[]> {
  if (!isUnipileConfigured()) {
    console.log("[unipile] fetchPostHistory: not configured, returning demo posts");
    return DEMO_POSTS;
  }

  const profileId = await resolveLinkedInProfileId(unipileAccountId);
  if (!profileId) {
    throw new Error(
      "Unipile account fetch did not return a LinkedIn public_identifier we could use for posts",
    );
  }

  const url = `https://${config.unipile.dsn}/api/v1/users/${encodeURIComponent(profileId)}/posts?account_id=${encodeURIComponent(unipileAccountId)}&limit=100`;
  console.log("[unipile] fetchPostHistory GET", url);

  const res = await fetch(url, {
    headers: {
      "X-API-KEY": config.unipile.apiKey,
      Accept: "application/json",
    },
  });

  const bodyText = await res.text();
  if (!res.ok) {
    console.error(`[unipile] posts fetch failed ${res.status}: ${bodyText.slice(0, 400)}`);
    throw new Error(`Unipile posts fetch failed: ${res.status}`);
  }

  let json: { items?: unknown[]; data?: unknown[]; results?: unknown[] };
  try {
    json = JSON.parse(bodyText);
  } catch {
    console.error("[unipile] posts response was not valid JSON:", bodyText.slice(0, 400));
    throw new Error("Unipile posts response was not valid JSON");
  }

  const items = (json.items ?? json.data ?? json.results ?? []) as Array<Record<string, unknown>>;
  console.log(
    `[unipile] posts returned ${items.length} item(s). Top-level keys: ${Object.keys(json).join(", ") || "(none)"}`,
  );
  if (items.length > 0) {
    console.log("[unipile] sample post item keys:", Object.keys(items[0] ?? {}).join(", "));
  }

  return items.map(mapUnipilePost);
}

/**
 * Look up the LinkedIn public_identifier (or other usable user ID) for the
 * connected Unipile account. Tries common nest paths because Unipile has
 * shipped a few different account-payload shapes.
 */
async function resolveLinkedInProfileId(unipileAccountId: string): Promise<string | null> {
  const url = `https://${config.unipile.dsn}/api/v1/accounts/${encodeURIComponent(unipileAccountId)}`;
  console.log("[unipile] resolveLinkedInProfileId GET", url);

  const res = await fetch(url, {
    headers: {
      "X-API-KEY": config.unipile.apiKey,
      Accept: "application/json",
    },
  });

  const bodyText = await res.text();
  if (!res.ok) {
    console.error(`[unipile] account fetch failed ${res.status}: ${bodyText.slice(0, 400)}`);
    return null;
  }

  let account: Record<string, unknown>;
  try {
    account = JSON.parse(bodyText);
  } catch {
    console.error("[unipile] account response was not valid JSON:", bodyText.slice(0, 400));
    return null;
  }

  console.log("[unipile] account top-level keys:", Object.keys(account).join(", "));

  // Hunt through likely nest paths for the LinkedIn public_identifier.
  const candidates: unknown[] = [
    deepGet(account, ["connection_params", "im", "public_identifier"]),
    deepGet(account, ["connection_params", "public_identifier"]),
    deepGet(account, ["params", "public_identifier"]),
    deepGet(account, ["user", "public_identifier"]),
    deepGet(account, ["public_identifier"]),
    // Fallbacks: some versions return only an entity_urn (urn:li:fsd_profile:XYZ).
    // Strip the prefix and use the bare ID.
    stripUrnPrefix(deepGet(account, ["connection_params", "im", "id"])),
    stripUrnPrefix(deepGet(account, ["params", "entity_urn"])),
    stripUrnPrefix(deepGet(account, ["entity_urn"])),
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) {
      console.log("[unipile] using profile identifier:", c);
      return c;
    }
  }

  console.warn(
    "[unipile] could not find public_identifier in account payload. First 800 chars:",
    bodyText.slice(0, 800),
  );
  return null;
}

function deepGet(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === "object" && !Array.isArray(cur)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

function stripUrnPrefix(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // urn:li:fsd_profile:ABC123 → ABC123
  const match = value.match(/[^:]+$/);
  return match ? match[0] : value;
}

function mapUnipilePost(item: Record<string, unknown>): UnipilePost {
  // Some Unipile API versions nest metrics under metrics/engagement/stats/
  // analytics; the LinkedIn payload (May 2026) puts them flat on the item as
  // *_counter fields. We accept both.
  const nestedMetrics =
    pickRecord(item, ["metrics", "engagement", "stats", "analytics"]) ?? null;
  const flatBag = nestedMetrics ?? item;

  return {
    external_id: String(
      pickFirst(item, [
        "social_id",
        "share_id",
        "provider_id",
        "post_id",
        "id",
      ]) ?? "",
    ),
    content: String(
      pickFirst(item, ["text", "content", "share_text", "body", "commentary"]) ?? "",
    ),
    posted_at: normaliseDate(
      pickFirst(item, [
        "parsed_datetime",
        "posted_at",
        "published_at",
        "created_at",
        "date",
        "post_date",
      ]),
    ),
    metrics: {
      impressions: Number(
        pickFirst(flatBag, [
          "impressions_counter",
          "impressions",
          "impression_count",
          "views",
        ]) ?? 0,
      ),
      likes: Number(
        pickFirst(flatBag, [
          "reaction_counter",
          "reactions_counter",
          "likes",
          "like_count",
          "reactions",
          "reaction_count",
        ]) ?? 0,
      ),
      comments: Number(
        pickFirst(flatBag, ["comment_counter", "comments_counter", "comments", "comment_count"]) ?? 0,
      ),
      shares: Number(
        pickFirst(flatBag, [
          "repost_counter",
          "reposts_counter",
          "shares",
          "share_count",
          "reposts",
          "repost_count",
        ]) ?? 0,
      ),
      clicks: Number(pickFirst(flatBag, ["clicks", "click_count"]) ?? 0),
    },
  };
}

/**
 * Coerce whatever Unipile gives us as a date into a Postgres-parseable
 * TIMESTAMPTZ string. Handles ISO strings, ISO without timezone, numeric
 * Unix timestamps (seconds OR milliseconds), and falls back to "now" rather
 * than failing the whole row.
 */
function normaliseDate(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return new Date().toISOString();
  }
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000; // seconds vs millis
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (Number.isFinite(d.getTime())) return d.toISOString();
    // Some Unipile values arrive as 'YYYY-MM-DD HH:MM:SS' without TZ; that
    // parses fine in most JS engines but on the off chance it doesn't, fall
    // back rather than crashing the row.
    return new Date().toISOString();
  }
  return new Date().toISOString();
}

function pickFirst(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function pickRecord(
  obj: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | null {
  for (const k of keys) {
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  }
  return null;
}
