import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/context";
import { AlignmentWidget } from "../components/AlignmentWidget";
import { LinkedInInsights } from "../components/LinkedInInsights";

type VoiceProfile = {
  archetype: string;
  tone_warmth: number;
  tone_storytelling: number;
  tone_provocation: number;
  linkedin_goal: string;
  posting_cadence: string;
  topic_authorities: string[];
  signature_phrases: string[];
};

type Archetype = {
  archetype_key: string;
  display_name: string;
  description: string;
};

type WorkshopSession = {
  workshop_id: string;
  title: string;
  status: string;
  last_message_at: string;
};

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [archetype, setArchetype] = useState<Archetype | null>(null);
  const [sessions, setSessions] = useState<WorkshopSession[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void Promise.all([
      api.get<{ profile: VoiceProfile | null }>("/voice-profile"),
      api.get<{ archetype: Archetype }>("/voice-profile/archetype-preview").catch(() => null),
      api.get<{ sessions: WorkshopSession[] }>("/workshop"),
    ]).then(([p, a, s]) => {
      setProfile(p.profile);
      if (a) setArchetype(a.archetype);
      setSessions(s.sessions);
    });
  }, []);

  const startWorkshop = async () => {
    setStarting(true);
    try {
      const res = await api.post<{ workshop_id: string }>("/workshop/start", {});
      navigate(`/workshop/${res.workshop_id}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div style={{ flex: 1, padding: "var(--space-7) var(--space-5)", background: "var(--surface-page)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div className="stack-2" style={{ marginBottom: 32 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-on-light-muted)",
            }}
          >
            Dashboard
          </span>
          <h1 style={{ marginBottom: 0 }}>
            Welcome back, <span className="accent">{user?.name?.split(" ")[0]}</span>.
          </h1>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: 24,
          }}
        >
          <div className="stack-4">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              <Link
                to="/inspire"
                className="card"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 22,
                  background: "var(--color-navy)",
                  color: "var(--color-white)",
                  borderColor: "transparent",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--color-pink)",
                    fontWeight: 700,
                  }}
                >
                  Get inspired
                </span>
                <h3 style={{ margin: 0, color: "var(--color-white)" }}>
                  Ideas built from what works for you.
                </h3>
                <p style={{ margin: 0, fontSize: 14, opacity: 0.78 }}>
                  Adjacent angles, voice gaps, evidence from your top posts.
                </p>
              </Link>

              <Link
                to="/improve"
                className="card"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 22,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--color-pink)",
                    fontWeight: 700,
                  }}
                >
                  Improve my draft
                </span>
                <h3 style={{ margin: 0 }}>Sharpen something you already wrote.</h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-on-light-muted)" }}>
                  Paste a draft, pick a KPI, get voice + performance recs.
                </p>
              </Link>
            </div>

          <section className="card stack-5">
            <div>
              <h2 style={{ marginBottom: 4 }}>Workshop a post</h2>
              <p className="muted" style={{ margin: 0 }}>
                Open a back-and-forth chat. Bring an idea or ask me to find one.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={startWorkshop}
              disabled={starting}
              style={{ alignSelf: "flex-start" }}
            >
              {starting ? "Starting..." : "Start a new workshop"}
            </button>
            {sessions.length > 0 ? (
              <div className="stack-2">
                <span className="field-label">Recent sessions</span>
                {sessions.slice(0, 4).map((s) => (
                  <Link
                    key={s.workshop_id}
                    to={`/workshop/${s.workshop_id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--surface-card-soft)",
                      color: "var(--text-on-light)",
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{s.title}</span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {new Date(s.last_message_at).toLocaleString()}
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
          </div>

          <aside className="stack-4">
            <AlignmentWidget />
            {archetype ? (
              <Link
                to="/voice/edit"
                className="card stack-3"
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  position: "relative",
                  transition: "transform 0.15s ease, box-shadow 0.2s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="field-label">Your voice</span>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--color-pink)",
                    }}
                  >
                    Edit
                  </span>
                </div>
                <h3 style={{ margin: 0 }}>{archetype.display_name}</h3>
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  {archetype.description}
                </p>
                {profile ? (
                  <div className="muted" style={{ fontSize: 13 }}>
                    Warmth {profile.tone_warmth}/10 · Storytelling {profile.tone_storytelling}/10 · Provocation {profile.tone_provocation}/10
                  </div>
                ) : null}
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--color-pink)",
                    fontWeight: 600,
                    marginTop: 4,
                  }}
                >
                  Edit my voice →
                </span>
              </Link>
            ) : null}
            <LinkedInInsights />
          </aside>
        </div>
      </div>
    </div>
  );
}
