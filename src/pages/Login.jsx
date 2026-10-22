import { useState } from "react";
import { useKopri } from "../state/KopriContext.jsx";
import { Button, Field, TextInput } from "../components/ui.jsx";

export default function Login() {
  const { login } = useKopri();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!login(username, password)) setError("Wrong username or password.");
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}>
          <div className="brand-logo">K</div>
          <div>
            <div className="brand-name">Kopri Manager</div>
            <div className="brand-sub">Sign in to continue</div>
          </div>
        </div>
        <div className="stack">
          <Field label="Username">
            <TextInput
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError("");
              }}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              autoComplete="current-password"
            />
          </Field>
          {error && (
            <div className="alert alert-red">
              <div className="small">{error}</div>
            </div>
          )}
          <Button variant="primary" type="submit" disabled={!username.trim() || !password}>
            Sign in
          </Button>
        </div>
      </form>
    </div>
  );
}
