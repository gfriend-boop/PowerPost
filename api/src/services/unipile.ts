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

export async function fetchPostHistory(unipileAccountId: string): Promise<UnipilePost[]> {
  if (!isUnipileConfigured()) {
    return DEMO_POSTS;
  }
  const res = await fetch(
    `https://${config.unipile.dsn}/api/v1/posts?account_id=${encodeURIComponent(unipileAccountId)}&limit=100`,
    {
      headers: {
        "X-API-KEY": config.unipile.apiKey,
      },
    },
  );
  if (!res.ok) {
    throw new Error(`Unipile post fetch failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
  return (json.items ?? []).map((item) => ({
    external_id: String(item.id ?? item.post_id ?? ""),
    content: String(item.text ?? item.content ?? ""),
    posted_at: String(item.posted_at ?? item.published_at ?? new Date().toISOString()),
    metrics: {
      impressions: Number((item.metrics as Record<string, unknown> | undefined)?.impressions ?? 0),
      likes: Number((item.metrics as Record<string, unknown> | undefined)?.likes ?? 0),
      comments: Number((item.metrics as Record<string, unknown> | undefined)?.comments ?? 0),
      shares: Number((item.metrics as Record<string, unknown> | undefined)?.shares ?? 0),
      clicks: Number((item.metrics as Record<string, unknown> | undefined)?.clicks ?? 0),
    },
  }));
}
