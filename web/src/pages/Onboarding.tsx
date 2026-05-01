import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client";
import { useAuth } from "../auth/context";
import { CoachBubble } from "../components/ChatBubble";
import { Logo } from "../components/Logo";

type OnboardingCopy = {
  copy_key: string;
  step_index: number | null;
  title: string | null;
  body: string | null;
  hint: string | null;
  cta: string | null;
};

type SnippetRow = {
  snippet_key: string;
  pick_group: "hook_style" | "opening_style" | "cta_style";
  option_label: string;
  style_tag: string;
  body: string;
};

type TopicRow = { topic_key: string; label: string };

type OnboardingConfig = {
  copy: OnboardingCopy[];
  snippets: SnippetRow[];
  topics: TopicRow[];
};

type Archetype = {
  archetype_key: string;
  display_name: string;
  description: string;
  who_this_is: string;
  sample_post: string;
};

type Answers = {
  role_identity: string;
  snippet_pick_hook: string;
  topic_authorities: string[];
  custom_topic: string;
  snippet_pick_opening: string;
  topic_exclusions: string;
  vocabulary_favors: string[];
  vocabulary_avoids: string[];
  linkedin_goal: string;
  target_audience: string;
  snippet_pick_cta: string;
  posting_cadence: string;
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

const STORAGE_KEY = "powerpost_onboarding_state";

type Phase =
  | "linkedin"
  | "linkedin_pending"
  | "questionnaire"
  | "processing"
  | "reveal"
  | "customize"
  | "done";

export function Onboarding() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<OnboardingConfig | null>(null);
  const [phase, setPhase] = useState<Phase>("linkedin");
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>(loadDraft);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<{
    archetype: Archetype;
    alternative: Archetype | null;
  } | null>(null);
  const [tone, setTone] = useState({ warmth: 5, storytelling: 5, provocation: 5 });
  const [signaturePhrases, setSignaturePhrases] = useState<string[]>(["", "", ""]);
  const [extraExclusions, setExtraExclusions] = useState("");

  useEffect(() => {
    void api
      .get<OnboardingConfig>("/voice-profile/onboarding-config")
      .then(setConfig)
      .catch(() => setSubmitError("Failed to load onboarding"));
  }, []);

  useEffect(() => {
    void api
      .get<{ connected: boolean }>("/linkedin/status")
      .then((status) => {
        if (status.connected) setPhase("questionnaire");
      })
      .catch(() => {
        // ignore
      });
  }, []);

  useEffect(() => {
    saveDraft(answers);
  }, [answers]);

  const copyByKey = useMemo(() => {
    const map = new Map<string, OnboardingCopy>();
    for (const c of config?.copy ?? []) map.set(c.copy_key, c);
    return map;
  }, [config]);

  const snippetsByGroup = useMemo(() => {
    const map = { hook_style: [], opening_style: [], cta_style: [] } as Record<
      SnippetRow["pick_group"],
      SnippetRow[]
    >;
    for (const s of config?.snippets ?? []) {
      map[s.pick_group].push(s);
    }
    return map;
  }, [config]);

  if (!config) {
    return (
      <PageBg>
        <CoachBubble>
          <p style={{ margin: 0 }}>Loading your coach...</p>
        </CoachBubble>
      </PageBg>
    );
  }

  if (phase === "linkedin") {
    return (
      <PageBg>
        <CoachBubble>
          <h2 style={{ marginTop: 0 }}>Welcome, {user?.name?.split(" ")[0] ?? "there"}.</h2>
          <p>
            First step. Connect your LinkedIn so I can read your past posts and learn what is
            already landing for you. We use Unipile, so I never see your password and you can
            disconnect any time.
          </p>
          <p className="muted" style={{ fontSize: 14, marginBottom: 0 }}>
            No Unipile credentials configured? You will be connected in demo mode with a set
            of sample posts so we can keep going.
          </p>
        </CoachBubble>
        <Center>
          <button
            className="btn btn-primary"
            onClick={async () => {
              setSubmitting(true);
              setSubmitError(null);
              try {
                const res = await api.post<{ hosted_auth_url: string; demo_mode: boolean }>(
                  "/linkedin/connect",
                );
                console.log("LinkedIn connect response:", res);
                if (res.demo_mode) {
                  await refresh();
                  setPhase("questionnaire");
                } else {
                  setPhase("linkedin_pending");
                  window.location.href = res.hosted_auth_url;
                }
              } catch (err) {
                if (err instanceof ApiError) setSubmitError(err.message);
                else setSubmitError("Could not start LinkedIn connection");
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={submitting}
          >
            {submitting ? "Connecting..." : "Connect LinkedIn"}
          </button>
          {submitError ? <ErrorText message={submitError} /> : null}
        </Center>
      </PageBg>
    );
  }

  if (phase === "linkedin_pending") {
    return (
      <PageBg>
        <CoachBubble>
          <p>Finish the LinkedIn connection in the new tab. Come back when you are done.</p>
        </CoachBubble>
        <Center>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              await refresh();
              setPhase("questionnaire");
            }}
          >
            I have connected my LinkedIn
          </button>
        </Center>
      </PageBg>
    );
  }

  if (phase === "processing") {
    const c = copyByKey.get("processing");
    return (
      <PageBg>
        <CoachBubble>
          <h2 style={{ marginTop: 0 }}>{c?.title ?? "Dialing in your PowerPost voice."}</h2>
          <p style={{ margin: 0 }}>{c?.body}</p>
        </CoachBubble>
        <Center>
          <Spinner />
        </Center>
      </PageBg>
    );
  }

  if (phase === "reveal" && assignment) {
    const c = copyByKey.get("reveal_intro");
    return (
      <PageBg>
        <div className="card stack-5" style={{ width: "min(720px, 100%)", padding: 36 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-on-light-muted)",
            }}
          >
            {c?.title ?? "Meet your voice."}
          </span>
          <h1 style={{ marginBottom: 4 }}>
            You are <span className="accent">{assignment.archetype.display_name}</span>.
          </h1>
          <p
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: "var(--text-on-light)",
              margin: 0,
            }}
          >
            {assignment.archetype.description}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {assignment.archetype.who_this_is}
          </p>
          <div
            style={{
              background: "var(--color-off-white)",
              borderLeft: "3px solid var(--color-pink)",
              padding: "20px 24px",
              borderRadius: "var(--radius-md)",
              fontSize: 16,
              lineHeight: 1.6,
            }}
          >
            {assignment.archetype.sample_post}
          </div>
          {assignment.alternative ? (
            <p style={{ margin: 0, fontSize: 14 }}>
              You are also showing strong signals of{" "}
              <span className="accent">{assignment.alternative.display_name}</span>. You can
              explore that in your voice settings later.
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-primary" onClick={() => setPhase("customize")}>
              {c?.cta ?? "Tune your voice"}
            </button>
          </div>
        </div>
      </PageBg>
    );
  }

  if (phase === "customize" && assignment) {
    const c = copyByKey.get("customize");
    return (
      <PageBg>
        <div className="card stack-6" style={{ width: "min(720px, 100%)" }}>
          <div>
            <h2 style={{ marginBottom: 8 }}>{c?.title ?? "Your voice, your way."}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {c?.body}
            </p>
          </div>

          <div className="stack-5">
            <Slider
              label="Authority"
              labelRight="Warmth"
              value={tone.warmth}
              onChange={(v) => setTone({ ...tone, warmth: v })}
            />
            <Slider
              label="Insight"
              labelRight="Storytelling"
              value={tone.storytelling}
              onChange={(v) => setTone({ ...tone, storytelling: v })}
            />
            <Slider
              label="Safe"
              labelRight="Provocative"
              value={tone.provocation}
              onChange={(v) => setTone({ ...tone, provocation: v })}
            />
          </div>

          <div>
            <label className="field">
              <span className="field-label">Signature phrases (up to 3)</span>
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  className="field-input"
                  placeholder={`Phrase ${i + 1}`}
                  value={signaturePhrases[i] ?? ""}
                  onChange={(e) => {
                    const next = [...signaturePhrases];
                    next[i] = e.target.value;
                    setSignaturePhrases(next);
                  }}
                  style={{ marginTop: i === 0 ? 0 : 8 }}
                />
              ))}
            </label>
          </div>

          <label className="field">
            <span className="field-label">Anything else off limits?</span>
            <textarea
              className="field-textarea"
              rows={3}
              placeholder="One per line. We will add these to your guardrails."
              value={extraExclusions}
              onChange={(e) => setExtraExclusions(e.target.value)}
            />
          </label>

          {submitError ? <ErrorText message={submitError} /> : null}

          <button
            className="btn btn-primary"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              setSubmitError(null);
              try {
                await api.patch("/voice-profile", {
                  tone_warmth: tone.warmth,
                  tone_storytelling: tone.storytelling,
                  tone_provocation: tone.provocation,
                  signature_phrases: signaturePhrases.map((p) => p.trim()).filter(Boolean),
                  topic_exclusions_extra: extraExclusions
                    .split(/\n+/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                clearDraft();
                await refresh();
                navigate("/dashboard");
              } catch (err) {
                if (err instanceof ApiError) setSubmitError(err.message);
                else setSubmitError("Could not save your voice settings");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Saving..." : c?.cta ?? "This is my voice, let's go"}
          </button>
        </div>
      </PageBg>
    );
  }

  // Questionnaire phase: render the active step.
  const stepKeys = [
    "welcome",
    "role_identity",
    "snippet_pick_hook",
    "topics_authority",
    "snippet_pick_opening",
    "content_guardrails",
    "vocabulary_signals",
    "linkedin_goal",
    "target_audience",
    "snippet_pick_cta",
    "posting_cadence",
    "never_be_mistaken_for",
  ];

  const currentKey = stepKeys[stepIndex] ?? "welcome";
  const currentCopy = copyByKey.get(currentKey);
  const totalSteps = stepKeys.length;
  const goNext = () => setStepIndex((i) => Math.min(i + 1, stepKeys.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const submitProfile = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setPhase("processing");
    try {
      const customTopic = answers.custom_topic.trim();
      const topicAuthorities = customTopic
        ? Array.from(new Set([...answers.topic_authorities, customTopic]))
        : answers.topic_authorities;
      const exclusions = answers.topic_exclusions
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);

      const res = await api.post<{
        archetype: Archetype;
        alternative: Archetype | null;
      }>("/voice-profile", {
        role_identity: answers.role_identity,
        snippet_pick_hook: answers.snippet_pick_hook,
        topic_authorities: topicAuthorities,
        snippet_pick_opening: answers.snippet_pick_opening,
        topic_exclusions: exclusions,
        vocabulary_favors: answers.vocabulary_favors.filter(Boolean),
        vocabulary_avoids: answers.vocabulary_avoids.filter(Boolean),
        linkedin_goal: answers.linkedin_goal,
        target_audience: answers.target_audience,
        snippet_pick_cta: answers.snippet_pick_cta,
        posting_cadence: answers.posting_cadence,
        never_be_mistaken_for: answers.never_be_mistaken_for,
      });
      setAssignment({ archetype: res.archetype, alternative: res.alternative });
      // Brief delay so the loading state is felt rather than skipped.
      setTimeout(() => setPhase("reveal"), 1100);
    } catch (err) {
      if (err instanceof ApiError) setSubmitError(err.message);
      else setSubmitError("Something went wrong saving your voice profile");
      setPhase("questionnaire");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageBg>
      <ProgressDots count={totalSteps} active={stepIndex} />
      <div className="stack-4" style={{ width: "min(760px, 100%)" }}>
        <CoachBubble>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>{currentCopy?.title}</h2>
          {currentCopy?.body ? (
            <p style={{ margin: 0, color: "var(--text-on-light-muted)" }}>{currentCopy.body}</p>
          ) : null}
          {currentCopy?.hint ? (
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 14, color: "var(--text-on-light-muted)" }}>
              {currentCopy.hint}
            </p>
          ) : null}
        </CoachBubble>

        <StepContent
          stepKey={currentKey}
          answers={answers}
          setAnswers={setAnswers}
          snippets={snippetsByGroup}
          topics={config.topics}
        />

        <div style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
          {stepIndex > 0 ? (
            <button className="btn btn-ghost" onClick={goBack}>
              Back
            </button>
          ) : (
            <span />
          )}

          {stepIndex < stepKeys.length - 1 ? (
            <button
              className="btn btn-primary"
              onClick={goNext}
              disabled={!isStepComplete(currentKey, answers)}
            >
              {currentCopy?.cta ?? "Continue"}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={submitProfile}
              disabled={!isStepComplete(currentKey, answers) || submitting}
            >
              {submitting ? "Working..." : currentCopy?.cta ?? "Lock it in"}
            </button>
          )}
        </div>

        {submitError ? <ErrorText message={submitError} /> : null}
      </div>
    </PageBg>
  );
}

function StepContent({
  stepKey,
  answers,
  setAnswers,
  snippets,
  topics,
}: {
  stepKey: string;
  answers: Answers;
  setAnswers: (next: Answers) => void;
  snippets: Record<"hook_style" | "opening_style" | "cta_style", SnippetRow[]>;
  topics: TopicRow[];
}) {
  switch (stepKey) {
    case "welcome":
      return null;
    case "role_identity":
      return (
        <FieldCard>
          <textarea
            className="field-textarea"
            rows={3}
            placeholder="One or two sentences. The way you would say it out loud."
            value={answers.role_identity}
            onChange={(e) => setAnswers({ ...answers, role_identity: e.target.value })}
            autoFocus
          />
        </FieldCard>
      );
    case "snippet_pick_hook":
      return (
        <SnippetPicker
          options={snippets.hook_style}
          value={answers.snippet_pick_hook}
          onChange={(v) => setAnswers({ ...answers, snippet_pick_hook: v })}
        />
      );
    case "topics_authority":
      return (
        <FieldCard>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {topics.map((t) => {
              const active = answers.topic_authorities.includes(t.label);
              return (
                <button
                  key={t.topic_key}
                  type="button"
                  onClick={() => {
                    const set = new Set(answers.topic_authorities);
                    if (set.has(t.label)) set.delete(t.label);
                    else set.add(t.label);
                    setAnswers({ ...answers, topic_authorities: Array.from(set) });
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
          <input
            className="field-input"
            placeholder="Add your own"
            value={answers.custom_topic}
            onChange={(e) => setAnswers({ ...answers, custom_topic: e.target.value })}
            style={{ marginTop: 16 }}
          />
        </FieldCard>
      );
    case "snippet_pick_opening":
      return (
        <SnippetPicker
          options={snippets.opening_style}
          value={answers.snippet_pick_opening}
          onChange={(v) => setAnswers({ ...answers, snippet_pick_opening: v })}
        />
      );
    case "content_guardrails":
      return (
        <FieldCard>
          <textarea
            className="field-textarea"
            rows={4}
            placeholder="Optional. One per line, or a few comma-separated phrases."
            value={answers.topic_exclusions}
            onChange={(e) => setAnswers({ ...answers, topic_exclusions: e.target.value })}
          />
        </FieldCard>
      );
    case "vocabulary_signals":
      return (
        <FieldCard>
          <div className="field-label">Words you love (up to 3)</div>
          <PhraseList
            values={answers.vocabulary_favors}
            onChange={(next) => setAnswers({ ...answers, vocabulary_favors: next })}
          />
          <div className="field-label" style={{ marginTop: 16 }}>Words you hate (up to 3)</div>
          <PhraseList
            values={answers.vocabulary_avoids}
            onChange={(next) => setAnswers({ ...answers, vocabulary_avoids: next })}
          />
        </FieldCard>
      );
    case "linkedin_goal":
      return (
        <FieldCard>
          <RadioList
            name="linkedin_goal"
            options={GOAL_OPTIONS}
            value={answers.linkedin_goal}
            onChange={(v) => setAnswers({ ...answers, linkedin_goal: v })}
          />
        </FieldCard>
      );
    case "target_audience":
      return (
        <FieldCard>
          <textarea
            className="field-textarea"
            rows={4}
            placeholder="Two or three sentences. Specifics beat broad."
            value={answers.target_audience}
            onChange={(e) => setAnswers({ ...answers, target_audience: e.target.value })}
            autoFocus
          />
        </FieldCard>
      );
    case "snippet_pick_cta":
      return (
        <SnippetPicker
          options={snippets.cta_style}
          value={answers.snippet_pick_cta}
          onChange={(v) => setAnswers({ ...answers, snippet_pick_cta: v })}
        />
      );
    case "posting_cadence":
      return (
        <FieldCard>
          <RadioList
            name="posting_cadence"
            options={CADENCE_OPTIONS}
            value={answers.posting_cadence}
            onChange={(v) => setAnswers({ ...answers, posting_cadence: v })}
          />
        </FieldCard>
      );
    case "never_be_mistaken_for":
      return (
        <FieldCard>
          <input
            className="field-input"
            placeholder="One sentence is enough."
            value={answers.never_be_mistaken_for}
            onChange={(e) => setAnswers({ ...answers, never_be_mistaken_for: e.target.value })}
            autoFocus
          />
        </FieldCard>
      );
    default:
      return null;
  }
}

function isStepComplete(stepKey: string, a: Answers): boolean {
  switch (stepKey) {
    case "welcome":
      return true;
    case "role_identity":
      return a.role_identity.trim().length > 0;
    case "snippet_pick_hook":
      return Boolean(a.snippet_pick_hook);
    case "topics_authority":
      return a.topic_authorities.length + (a.custom_topic.trim() ? 1 : 0) > 0;
    case "snippet_pick_opening":
      return Boolean(a.snippet_pick_opening);
    case "content_guardrails":
      return true;
    case "vocabulary_signals":
      return true;
    case "linkedin_goal":
      return Boolean(a.linkedin_goal);
    case "target_audience":
      return a.target_audience.trim().length > 0;
    case "snippet_pick_cta":
      return Boolean(a.snippet_pick_cta);
    case "posting_cadence":
      return Boolean(a.posting_cadence);
    case "never_be_mistaken_for":
      return a.never_be_mistaken_for.trim().length > 0;
    default:
      return false;
  }
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
              padding: "20px 22px",
              borderRadius: "var(--radius-lg)",
              background: active ? "rgba(255, 46, 204, 0.06)" : "var(--color-white)",
              border: active ? "2px solid var(--color-pink)" : "1.5px solid var(--border-soft)",
              boxShadow: active ? "0 18px 32px -22px rgba(255,46,204,0.45)" : "var(--shadow-card)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 15.5,
              lineHeight: 1.55,
              color: "var(--text-on-light)",
              width: "100%",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: active ? "var(--color-pink)" : "var(--text-on-light-muted)",
                display: "block",
                marginBottom: 8,
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
              padding: "14px 18px",
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

function PhraseList({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const v = [values[0] ?? "", values[1] ?? "", values[2] ?? ""];
  return (
    <div className="stack-2">
      {[0, 1, 2].map((i) => (
        <input
          key={i}
          className="field-input"
          placeholder={`Phrase ${i + 1}`}
          value={v[i]}
          onChange={(e) => {
            const next = [...v];
            next[i] = e.target.value;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

function FieldCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--color-white)",
        padding: 24,
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--border-soft)",
      }}
    >
      {children}
    </div>
  );
}

function Slider({
  label,
  labelRight,
  value,
  onChange,
}: {
  label: string;
  labelRight: string;
  value: number;
  onChange: (n: number) => void;
}) {
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
        <span style={{ color: "var(--color-pink)" }}>{value}/10</span>
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

function ProgressDots({ count, active }: { count: number; active: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          style={{
            width: i === active ? 28 : 8,
            height: 8,
            borderRadius: 999,
            background:
              i < active
                ? "var(--color-pink)"
                : i === active
                  ? "var(--color-pink)"
                  : "rgba(149, 154, 179, 0.4)",
            transition: "width 0.25s ease, background 0.2s ease",
          }}
        />
      ))}
    </div>
  );
}

function PageBg({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--gradient-onboarding)",
        padding: "var(--space-7) var(--space-5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 760, display: "flex", flexDirection: "column" }}>
        <div style={{ alignSelf: "flex-start", marginBottom: 32 }}>
          <Logo variant="primary" height={32} />
        </div>
        {children}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 24, gap: 12 }}>
      {children}
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <div
      style={{
        background: "rgba(255, 46, 204, 0.12)",
        color: "#c81d6a",
        padding: "12px 16px",
        borderRadius: "var(--radius-md)",
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        border: "3px solid rgba(255,255,255,0.25)",
        borderTopColor: "var(--color-pink)",
        borderRadius: "50%",
        animation: "ppspin 0.9s linear infinite",
      }}
      aria-label="Loading"
      role="status"
    >
      <style>{`@keyframes ppspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const EMPTY_ANSWERS: Answers = {
  role_identity: "",
  snippet_pick_hook: "",
  topic_authorities: [],
  custom_topic: "",
  snippet_pick_opening: "",
  topic_exclusions: "",
  vocabulary_favors: ["", "", ""],
  vocabulary_avoids: ["", "", ""],
  linkedin_goal: "",
  target_audience: "",
  snippet_pick_cta: "",
  posting_cadence: "",
  never_be_mistaken_for: "",
};

function loadDraft(): Answers {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_ANSWERS;
    const parsed = JSON.parse(raw) as Partial<Answers>;
    return { ...EMPTY_ANSWERS, ...parsed };
  } catch {
    return EMPTY_ANSWERS;
  }
}

function saveDraft(a: Answers): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    // ignore
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
