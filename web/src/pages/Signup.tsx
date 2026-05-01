import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/context";

export function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signup({ name, email, password });
      navigate("/onboarding");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        flex: 1,
        background: "var(--gradient-onboarding)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-7)",
      }}
    >
      <form
        onSubmit={onSubmit}
        className="card stack-5"
        style={{ width: "min(440px, 100%)" }}
      >
        <div style={{ textAlign: "center" }}>
          <h2 style={{ marginBottom: 4 }}>Make a PowerPost account</h2>
          <p className="muted" style={{ margin: 0 }}>
            14 days of Builder. No credit card.
          </p>
        </div>

        <label className="field">
          <span className="field-label">Your name</span>
          <input
            className="field-input"
            placeholder="Carla Reyes"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={1}
            maxLength={120}
          />
        </label>

        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="field-input"
            type="email"
            value={email}
            placeholder="you@work.com"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="field-input"
            type="password"
            value={password}
            placeholder="At least 8 characters"
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>

        {error ? <div className="field-error">{error}</div> : null}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Creating account..." : "Create account"}
        </button>

        <p className="muted" style={{ textAlign: "center", margin: 0, fontSize: 14 }}>
          Already have one? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
