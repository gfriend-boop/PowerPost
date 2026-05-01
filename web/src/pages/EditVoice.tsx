import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client";

type Profile = {
  archetype: string;
  archetype_alternative: string | null;
  tone_warmth: number;
  tone_storytelling: number;
  tone_provocation: number;
  topic_authorities: string[];
  topic_exclusions: string[];
  vocabulary_favors: string[];
  vocabulary_avoids: string[];
  linkedin_goal: string;
  target_audience: string;
  posting_cadence: string;
  signature_phrases: string[];
  snippet_pick_hook: string;
  snippet_pick_opening: string;
  snippet_pick_cta: string;
  role_identity: string;
  never_be_mistaken_for: string;
};

type Archetype = {
  archetype_key: string;
  display_name: string;
  description: string;
  who_this_is: string;
  sample_post: string;
};

type SnippetRow = {
  snippet_key: string;
  pick_group: "hook_style" | "opening_style" | "cta_style";
  option_label: string;
  body: string;
};

type TopicRow = { topic_key: string; label: string };

type OnboardingConfig = {
  snippets: SnippetRow[];
  topics: TopicRow[];
};

type EditState = {
  tone_warmth: number;
  tone_storytelling: number;
  tone_provocation: number;
  role_identity: string;
  topic_authorities: string[];
  topic_exclusions: string[];
  vocabulary_favors: string[];
  vocabulary_avoids: string[];
  linkedin_goal: string;
  target_audience: string;
  posting_cadence: string;
  signature_phrases: string[];
  snippet_pick_hook: string;
  snippet_pick_opening: string;
  snippet_pick_cta: string;
  never_be_mistaken_for: string;
};

const GOAL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "inbound_leads", label: "Attract inbound leads" },
  { value: "thought_leadership", label: "Build thought leadership" },
  { value: "career_visibility", label: "Career advancement and visibility" },
  { value: "speaking", label: "Land speaking engagements" },
  { value: "board_role", label: "Board role" },
  { value: "network_growth", label: "Grow my network" },
];

const CADENCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "light", label: "1 to 2 times a week" },
  { value: "regular", label: "3 to 4 times a week" },
  { value: "daily", label: "Daily" },
];

// Fields whose change triggers a POST (re-runs archetype assignment).
const ARCHETYPE_AFFECTING: Array<keyof EditState> = [
  "snippet_pick_hook",
  "snippet_pick_opening",
  "snippet_pick_cta",
  "linkedin_goal",
  "never_be_mistaken_for",
  "vocabulary_favors",
  "vocabulary_avoids",
];

// Fields safely PATCH-able without re-running assignment.
const PATCH_ONLY_FIELDS: Array<keyof EditState> = [
  "tone_warmth",
  "tone_storytelling",
  "tone_provocation",
  "role_identity",
  "topic_authorities",
  "topic_exclusions",
  "target_audience",
  "posting_cadence",
  "signature_phrases",
];

const STORAGE_KEY = "powerpost_onboarding_state";

export function EditVoice() {
  const navigate = useNavigate();
  const [original, setOriginal] = useState<EditState | null>(null);
  const [edited, setEdited] = useState<EditState | null>(null);
  const [archetype, setArchetype] = useState<Archetype | null>(null);
  const [config, setConfig] = useState<OnboardingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [confirmRetake, setConfirmRetake] = useState(false);
  const [confirmReassign, setConfirmReassign] = useState(false);
  const dismissTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.get<{ profile: Profile | null }>("/voice-profile"),
      api.get<OnboardingConfig>("/voice-profile/onboarding-config"),
      api.get<{ archetype: Archetype }>("/voice-profile/archetype-preview").catch(() => null),
    ])
      .then(async ([p, cfg, current]) => {
        if (cancelled) return;
        if (!p.profile) {
          navigate("/onboarding");
          return;
        }
        const initial: EditState = {
          tone_warmth: p.profile.tone_warmth,
          tone_storytelling: p.profile.tone_storytelling,
          tone_provocation: p.profile.tone_provocation,
          role_identity: p.profile.role_identity ?? "",
          topic_authorities: p.profile.topic_authorities ?? [],
          topic_exclusions: p.profile.topic_exclusions ?? [],
          vocabulary_favors: padTo(p.profile.vocabulary_favors ?? [], 3),
          vocabulary_avoids: padTo(p.profile.vocabulary_avoids ?? [], 3),
          linkedin_goal: p.profile.linkedin_goal ?? "",
          target_audience: p.profile.target_audience ?? "",
          posting_cadence: p.profile.posting_cadence ?? "regular",
          signature_phrases: padTo(p.profile.signature_phrases ?? [], 3),
          snippet_pick_hook: p.profile.snippet_pick_hook ?? "",
          snippet_pick_opening: p.profile.snippet_pick_opening ?? "",
          snippet_pick_cta: p.profile.snippet_pick_cta ?? "",
          never_be_mistaken_for: p.profile.never_be_mistaken_for ?? "",
        };
        setOriginal(initial);
        setEdited(initial);
        setConfig(cfg);
        if (current) setArchetype(current.archetype);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setSaveMessage({ kind: "err", text: "Could not load your voice profile" });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const dirtyFields = useMemo<Set<keyof EditState>>(() => {
    if (!original || !edited) return new Set();
    const diff = new Set<keyof EditState>();
    (Object.keys(original) as Array<keyof EditState>).forEach((key) => {
      if (!shallowEqual(original[key], edited[key])) diff.add(key);
    });
    return diff;
  }, [original, edited]);

  const isDirty = dirtyFields.size > 0;
  const triggersReassignment = useMemo(
    () => ARCHETYPE_AFFECTING.some((f) => dirtyFields.has(f)),
    [dirtyFields],
  );

  // Warn before navigating away with unsaved changes (browser close/reload).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const showFlash = (kind: "ok" | "err", text: string) => {
    setSaveMessage({ kind, text });
    if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    dismissTimer.current = window.setTimeout(() => setSaveMessage(null), 4000);
  };

  const handleDiscard = () => {
    if (!original) return;
    setEdited(original);
    showFlash("ok", "Changes discarded");
  };

  const handleSave = async () => {
    if (!original || !edited) return;
    if (triggersReassignment && !confirmReassign) {
      setConfirmReassign(true);
      return;
    }
    setConfirmReassign(false);
    setSaving(true);
    setSaveMessage(null);
    try {
      if (triggersReassignment) {
        // Full re-evaluation. POST resets sliders to the new archetype's
        // defaults; we follow up with a PATCH to preserve the user's slider
        // intent.
        const payload = {
          role_identity: edited.role_identity,
          snippet_pick_hook: edited.snippet_pick_hook,
          topic_authorities: edited.topic_authorities,
          snippet_pick_opening: edited.snippet_pick_opening,
          topic_exclusions: edited.topic_exclusions,
          vocabulary_favors: edited.vocabulary_favors.filter(Boolean),
          vocabulary_avoids: edited.vocabulary_avoids.filter(Boolean),
          linkedin_goal: edited.linkedin_goal,
          target_audience: edited.target_audience,
          snippet_pick_cta: edited.snippet_pick_cta,
          posting_cadence: edited.posting_cadence,
          never_be_mistaken_for: edited.never_be_mistaken_for,
        };
        const res = await api.post<{
          archetype: Archetype;
          alternative: Archetype | null;
        }>("/voice-profile", payload);

        // Preserve the user's slider intent + signature phrases (POST resets sliders).
        await api.patch("/voice-profile", {
          tone_warmth: edited.tone_warmth,
          tone_storytelling: edited.tone_storytelling,
          tone_provocation: edited.tone_provocation,
          signature_phrases: edited.signature_phrases.map((p) => p.trim()).filter(Boolean),
        });

        setArchetype(res.archetype);
        setOriginal(edited);
        showFlash(
          "ok",
          res.archetype.archetype_key !== original.snippet_pick_hook
            ? `Saved. Your archetype is now ${res.archetype.display_name}.`
            : "Saved.",
        );
      } else {
        const patch: Record<string, unknown> = {};
        for (const f of PATCH_ONLY_FIELDS) {
          if (dirtyFields.has(f)) {
            const v = edited[f];
            patch[f] = Array.isArray(v) ? (v as string[]).map((s) => s.trim()).filter(Boolean) : v;
          }
        }
        await api.patch("/voice-profile", patch);
        setOriginal(edited);
        showFlash("ok", "Saved.");
      }
    } catch (err) {
      if (err instanceof ApiError) showFlash("err", err.message);
      else showFlash("err", "Could not save your changes");
    } finally {
      setSaving(false);
    }
  };

  const handleRetakeConfirmed = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    navigate("/onboarding?retake=1");
  };

  if (loading || !edited || !original || !config) {
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 48 }}>
        <span className="muted">Loading your voice...</span>
      </div>
    );
  }

  const set = (patch: Partial<EditState>) =>
    setEdited((prev) => ({ ...(prev as EditState), ...patch }));

  const snippetsByGroup = groupSnippets(config.snippets);

  return (
    <div style={{ flex: 1, padding: "var(--space-6) var(--space-5)", background: "var(--surface-page)" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link
            to="/dashboard"
            onClick={(e) => {
              if (
                isDirty &&
                !window.confirm("You have unsaved changes. Leave without saving?")
              ) {
                e.preventDefault();
              }
            }}
            style={{ color: "var(--text-on-light-muted)", fontWeight: 500 }}
          >
            ← Back to dashboard
          </Link>
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
            Edit my voice
          </span>
        </div>

        {archetype ? (
          <div className="card stack-3" style={{ marginBottom: 24 }}>
            <span className="field-label">Your current archetype</span>
            <h2 style={{ margin: 0 }}>
              You are <span className="accent">{archetype.display_name}</span>.
            </h2>
            <p style={{ margin: 0 }}>{archetype.description}</p>
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer", color: "var(--color-pink)", fontWeight: 600 }}>
                Show sample post
              </summary>
              <div
                style={{
                  marginTop: 12,
                  background: "var(--color-off-white)",
                  borderLeft: "3px solid var(--color-pink)",
                  padding: "16px 20px",
                  borderRadius: "var(--radius-md)",
                  fontSize: 15,
                  lineHeight: 1.6,
                }}
              >
                {archetype.sample_post}
              </div>
            </details>
          </div>
        ) : null}

        {/* Sticky save bar */}
        <div
          style={{
            position: "sticky",
            top: 16,
            zIndex: 4,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 18px",
            borderRadius: "var(--radius-lg)",
            background: isDirty ? "var(--color-navy)" : "var(--color-white)",
            color: isDirty ? "var(--color-white)" : "var(--text-on-light)",
            boxShadow: "var(--shadow-card)",
            border: "1px solid var(--border-soft)",
            transition: "background 0.18s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <DirtyDot active={isDirty} />
            <div>
              <div style={{ fontWeight: 600 }}>
                {isDirty
                  ? `${dirtyFields.size} unsaved change${dirtyFields.size === 1 ? "" : "s"}`
                  : "Everything is saved"}
              </div>
              {isDirty ? (
                <div style={{ fontSize: 13, opacity: 0.78, marginTop: 2 }}>
                  {triggersReassignment
                    ? "Some changes will re-evaluate your archetype."
                    : "These changes apply without changing your archetype."}
                </div>
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {isDirty ? (
              <button
                className="btn btn-ghost"
                onClick={handleDiscard}
                disabled={saving}
                style={{
                  borderColor: isDirty ? "rgba(255,255,255,0.25)" : undefined,
                  color: isDirty ? "var(--color-white)" : undefined,
                  background: isDirty ? "transparent" : undefined,
                }}
              >
                Discard
              </button>
            ) : null}
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!isDirty || saving}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>

        {confirmReassign ? (
          <ConfirmCard
            tone="warning"
            title="Re-evaluate your archetype?"
            body="You changed an answer that drives archetype assignment. Saving will re-run scoring and may change your archetype. Your tone sliders will be preserved."
            confirmLabel={saving ? "Saving..." : "Save and re-evaluate"}
            cancelLabel="Not yet"
            onConfirm={handleSave}
            onCancel={() => setConfirmReassign(false)}
            busy={saving}
          />
        ) : null}

        {saveMessage ? (
          <div
            role="status"
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background:
                saveMessage.kind === "ok" ? "rgba(255, 46, 204, 0.08)" : "rgba(200, 29, 106, 0.10)",
              color: saveMessage.kind === "ok" ? "var(--color-navy)" : "#c81d6a",
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            {saveMessage.text}
          </div>
        ) : null}

        <Section
          title="Tone calibration"
          subtitle="Slider-only changes save without re-running archetype assignment."
          dirty={dirtyFields.has("tone_warmth") || dirtyFields.has("tone_storytelling") || dirtyFields.has("tone_provocation")}
        >
          <Slider
            label="Authority"
            labelRight="Warmth"
            value={edited.tone_warmth}
            originalValue={original.tone_warmth}
            onChange={(v) => set({ tone_warmth: v })}
          />
          <Slider
            label="Insight"
            labelRight="Storytelling"
            value={edited.tone_storytelling}
            originalValue={original.tone_storytelling}
            onChange={(v) => set({ tone_storytelling: v })}
          />
          <Slider
            label="Safe"
            labelRight="Provocative"
            value={edited.tone_provocation}
            originalValue={original.tone_provocation}
            onChange={(v) => set({ tone_provocation: v })}
          />
        </Section>

        <Section
          title="Signature phrases"
          subtitle="Up to three phrases you reach for naturally."
          dirty={dirtyFields.has("signature_phrases")}
        >
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              className="field-input"
              placeholder={`Phrase ${i + 1}`}
              value={edited.signature_phrases[i] ?? ""}
              onChange={(e) => {
                const next = [...edited.signature_phrases];
                next[i] = e.target.value;
                set({ signature_phrases: next });
              }}
              style={{ marginTop: i === 0 ? 0 : 8 }}
            />
          ))}
        </Section>

        <Section
          title="Off-limit topics"
          subtitle="Topics or phrases I should never use in a draft. Up to ten."
          dirty={dirtyFields.has("topic_exclusions")}
        >
          <ChipEditor
            values={edited.topic_exclusions}
            onChange={(next) => set({ topic_exclusions: next.slice(0, 10) })}
            placeholder="Add a topic to avoid"
          />
        </Section>

        <Section
          title="Role and identity"
          subtitle="How you'd introduce yourself."
          dirty={dirtyFields.has("role_identity")}
        >
          <textarea
            className="field-textarea"
            rows={3}
            value={edited.role_identity}
            onChange={(e) => set({ role_identity: e.target.value })}
          />
        </Section>

        <Section
          title="Hook style"
          subtitle="Affects archetype assignment."
          archetypeAffecting
          dirty={dirtyFields.has("snippet_pick_hook")}
        >
          <SnippetPicker
            options={snippetsByGroup.hook_style}
            value={edited.snippet_pick_hook}
            onChange={(v) => set({ snippet_pick_hook: v })}
          />
        </Section>

        <Section
          title="Topics of authority"
          subtitle="What you want to be known for."
          dirty={dirtyFields.has("topic_authorities")}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {config.topics.map((t) => {
              const active = edited.topic_authorities.includes(t.label);
              return (
                <button
                  key={t.topic_key}
                  type="button"
                  onClick={() => {
                    const setOf = new Set(edited.topic_authorities);
                    if (setOf.has(t.label)) setOf.delete(t.label);
                    else setOf.add(t.label);
                    set({ topic_authorities: Array.from(setOf) });
                  }}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "var(--radius-pill)",
                    border: active ? "2px solid var(--color-pink)" : "1.5px solid var(--border-soft)",
                    background: active ? "rgba(255, 46, 204, 0.08)" : "var(--color-white)",
                    color: "var(--text-on-light)",
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <ChipEditor
            values={extraCustomTopics(edited.topic_authorities, config.topics)}
            onChange={(custom) => {
              const known = new Set(config.topics.map((t) => t.label));
              const baseline = edited.topic_authorities.filter((t) => known.has(t));
              set({ topic_authorities: [...baseline, ...custom] });
            }}
            placeholder="Add your own topic"
          />
        </Section>

        <Section
          title="Opening style"
          subtitle="Affects archetype assignment."
          archetypeAffecting
          dirty={dirtyFields.has("snippet_pick_opening")}
        >
          <SnippetPicker
            options={snippetsByGroup.opening_style}
            value={edited.snippet_pick_opening}
            onChange={(v) => set({ snippet_pick_opening: v })}
          />
        </Section>

        <Section
          title="Vocabulary signals"
          subtitle="Affects archetype assignment via avoids."
          archetypeAffecting
          dirty={dirtyFields.has("vocabulary_favors") || dirtyFields.has("vocabulary_avoids")}
        >
          <div className="field-label">Words you love (up to 3)</div>
          {[0, 1, 2].map((i) => (
            <input
              key={`fav-${i}`}
              className="field-input"
              placeholder={`Phrase ${i + 1}`}
              value={edited.vocabulary_favors[i] ?? ""}
              onChange={(e) => {
                const next = [...edited.vocabulary_favors];
                next[i] = e.target.value;
                set({ vocabulary_favors: next });
              }}
              style={{ marginTop: i === 0 ? 0 : 8 }}
            />
          ))}
          <div className="field-label" style={{ marginTop: 16 }}>
            Words you hate (up to 3)
          </div>
          {[0, 1, 2].map((i) => (
            <input
              key={`avoid-${i}`}
              className="field-input"
              placeholder={`Phrase ${i + 1}`}
              value={edited.vocabulary_avoids[i] ?? ""}
              onChange={(e) => {
                const next = [...edited.vocabulary_avoids];
                next[i] = e.target.value;
                set({ vocabulary_avoids: next });
              }}
              style={{ marginTop: i === 0 ? 0 : 8 }}
            />
          ))}
        </Section>

        <Section
          title="LinkedIn goal"
          subtitle="Affects archetype assignment."
          archetypeAffecting
          dirty={dirtyFields.has("linkedin_goal")}
        >
          <RadioList
            name="linkedin_goal"
            options={GOAL_OPTIONS}
            value={edited.linkedin_goal}
            onChange={(v) => set({ linkedin_goal: v })}
          />
        </Section>

        <Section
          title="Target audience"
          subtitle="Who you're trying to reach."
          dirty={dirtyFields.has("target_audience")}
        >
          <textarea
            className="field-textarea"
            rows={4}
            value={edited.target_audience}
            onChange={(e) => set({ target_audience: e.target.value })}
          />
        </Section>

        <Section
          title="CTA style"
          subtitle="Affects archetype assignment."
          archetypeAffecting
          dirty={dirtyFields.has("snippet_pick_cta")}
        >
          <SnippetPicker
            options={snippetsByGroup.cta_style}
            value={edited.snippet_pick_cta}
            onChange={(v) => set({ snippet_pick_cta: v })}
          />
        </Section>

        <Section
          title="Posting cadence"
          subtitle="How often you actually want to post."
          dirty={dirtyFields.has("posting_cadence")}
        >
          <RadioList
            name="posting_cadence"
            options={CADENCE_OPTIONS}
            value={edited.posting_cadence}
            onChange={(v) => set({ posting_cadence: v })}
          />
        </Section>

        <Section
          title="Never be mistaken for"
          subtitle="Affects archetype assignment."
          archetypeAffecting
          dirty={dirtyFields.has("never_be_mistaken_for")}
        >
          <input
            className="field-input"
            value={edited.never_be_mistaken_for}
            onChange={(e) => set({ never_be_mistaken_for: e.target.value })}
          />
        </Section>

        <div className="card stack-3" style={{ marginTop: 32 }}>
          <h3 style={{ margin: 0 }}>Start over</h3>
          <p className="muted" style={{ margin: 0 }}>
            Walk through the questionnaire from the beginning. Your account stays. Your current
            answers will be replaced when you finish.
          </p>
          {!confirmRetake ? (
            <button
              className="btn btn-ghost"
              onClick={() => setConfirmRetake(true)}
              style={{ alignSelf: "flex-start" }}
            >
              Retake questionnaire
            </button>
          ) : (
            <ConfirmCard
              tone="warning"
              title="Clear answers and start over?"
              body={
                isDirty
                  ? "You have unsaved changes that will be lost. Continue?"
                  : "We'll walk you through the full questionnaire from the top."
              }
              confirmLabel="Yes, start the questionnaire"
              cancelLabel="Cancel"
              onConfirm={handleRetakeConfirmed}
              onCancel={() => setConfirmRetake(false)}
            />
          )}
        </div>

        <div style={{ height: 60 }} />
      </div>
    </div>
  );
}

/* ----- shared inline controls ----- */

function Section({
  title,
  subtitle,
  children,
  dirty,
  archetypeAffecting,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  dirty: boolean;
  archetypeAffecting?: boolean;
}) {
  return (
    <section
      className="stack-3"
      style={{
        background: "var(--color-white)",
        borderRadius: "var(--radius-lg)",
        padding: "22px 24px",
        marginBottom: 16,
        boxShadow: "var(--shadow-card)",
        border: `1px solid ${dirty ? "rgba(255,46,204,0.25)" : "var(--border-soft)"}`,
        borderLeft: `${dirty ? 4 : 1}px solid ${dirty ? "var(--color-pink)" : "var(--border-soft)"}`,
        transition: "border-color 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {subtitle ? (
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {archetypeAffecting ? <Badge tone="muted">Archetype</Badge> : null}
          {dirty ? <Badge tone="pink">Edited</Badge> : null}
        </div>
      </div>
      <div className="stack-3">{children}</div>
    </section>
  );
}

function Badge({ tone, children }: { tone: "pink" | "muted"; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        padding: "4px 10px",
        borderRadius: "var(--radius-pill)",
        background: tone === "pink" ? "var(--color-pink)" : "var(--color-light-grey)",
        color: tone === "pink" ? "var(--color-white)" : "var(--text-on-light-muted)",
      }}
    >
      {children}
    </span>
  );
}

function DirtyDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: active ? "var(--color-pink)" : "var(--color-light-grey)",
        boxShadow: active ? "0 0 0 4px rgba(255,46,204,0.18)" : "none",
        transition: "background 0.15s ease, box-shadow 0.15s ease",
      }}
    />
  );
}

function Slider({
  label,
  labelRight,
  value,
  originalValue,
  onChange,
}: {
  label: string;
  labelRight: string;
  value: number;
  originalValue: number;
  onChange: (n: number) => void;
}) {
  const dirty = value !== originalValue;
  return (
    <div className="stack-2">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-display)",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-on-light-muted)",
        }}
      >
        <span>{label}</span>
        <span style={{ color: dirty ? "var(--color-pink)" : "var(--text-on-light-muted)" }}>
          {value}/10{dirty ? ` (was ${originalValue})` : ""}
        </span>
        <span>{labelRight}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--color-pink)" }}
      />
    </div>
  );
}

function SnippetPicker({
  options,
  value,
  onChange,
}: {
  options: SnippetRow[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="stack-3">
      {options.map((opt) => {
        const active = value === opt.snippet_key;
        return (
          <button
            key={opt.snippet_key}
            type="button"
            onClick={() => onChange(opt.snippet_key)}
            style={{
              textAlign: "left",
              padding: "16px 18px",
              borderRadius: "var(--radius-md)",
              background: active ? "rgba(255, 46, 204, 0.06)" : "var(--color-white)",
              border: active ? "2px solid var(--color-pink)" : "1.5px solid var(--border-soft)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 15,
              lineHeight: 1.55,
              color: "var(--text-on-light)",
              width: "100%",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: active ? "var(--color-pink)" : "var(--text-on-light-muted)",
                display: "block",
                marginBottom: 6,
              }}
            >
              Option {opt.option_label}
            </span>
            {opt.body}
          </button>
        );
      })}
    </div>
  );
}

function RadioList({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="stack-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <label
            key={opt.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              border: active ? "2px solid var(--color-pink)" : "1.5px solid var(--border-soft)",
              background: active ? "rgba(255, 46, 204, 0.06)" : "var(--color-white)",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={active}
              onChange={() => onChange(opt.value)}
              style={{ accentColor: "var(--color-pink)" }}
            />
            <span style={{ fontWeight: 500 }}>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function ChipEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div>
      {values.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {values.map((v) => (
            <span
              key={v}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: "var(--radius-pill)",
                background: "var(--surface-card-soft)",
                color: "var(--text-on-light)",
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--text-on-light-muted)",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="field-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder ?? "Add..."}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-ghost" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

function ConfirmCard({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy,
  tone,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  tone: "warning" | "default";
}) {
  return (
    <div
      role="dialog"
      style={{
        background: tone === "warning" ? "var(--color-navy)" : "var(--color-white)",
        color: tone === "warning" ? "var(--color-white)" : "var(--text-on-light)",
        padding: "20px 22px",
        borderRadius: "var(--radius-lg)",
        marginBottom: 20,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <h3 style={{ margin: 0, color: "inherit" }}>{title}</h3>
      <p style={{ margin: "8px 0 16px", opacity: 0.86 }}>{body}</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
        <button
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={busy}
          style={{
            color: tone === "warning" ? "var(--color-white)" : undefined,
            borderColor: tone === "warning" ? "rgba(255,255,255,0.25)" : undefined,
            background: "transparent",
          }}
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

/* ----- helpers ----- */

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  return false;
}

function padTo(arr: string[], n: number): string[] {
  const out = arr.slice(0, n);
  while (out.length < n) out.push("");
  return out;
}

function groupSnippets(snippets: SnippetRow[]) {
  return {
    hook_style: snippets.filter((s) => s.pick_group === "hook_style"),
    opening_style: snippets.filter((s) => s.pick_group === "opening_style"),
    cta_style: snippets.filter((s) => s.pick_group === "cta_style"),
  };
}

function extraCustomTopics(values: string[], known: TopicRow[]): string[] {
  const knownSet = new Set(known.map((k) => k.label));
  return values.filter((v) => !knownSet.has(v));
}

