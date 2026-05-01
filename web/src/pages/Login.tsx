import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/context";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password });
      navigate("/dashboard");
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
          <h2 style={{ marginBottom: 4 }}>Welcome back</h2>
          <p className="muted" style={{ margin: 0 }}>
            Pick up where your voice left off.
          </p>
        </div>

        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="field-input"
            type="email"
            value={email}
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
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error ? <div className="field-error">{error}</div> : null}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>

        <p className="muted" style={{ textAlign: "center", margin: 0, fontSize: 14 }}>
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
