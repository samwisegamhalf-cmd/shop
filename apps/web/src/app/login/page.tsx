"use client";

import { FormEvent, useState } from "react";

import styles from "./page.module.css";

type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Семейный список");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload =
      mode === "login"
        ? { email, password }
        : { email, password, displayName: displayName || undefined, workspaceName };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Ошибка авторизации");
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className={styles.page}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <h1>{mode === "login" ? "Вход" : "Регистрация"}</h1>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          minLength={6}
          required
        />
        {mode === "register" ? (
          <>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ваше имя (опционально)"
            />
            <input
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Название пространства"
              required
            />
          </>
        ) : null}

        <button disabled={loading} type="submit">
          {loading ? "..." : mode === "login" ? "Войти" : "Создать аккаунт"}
        </button>
        {error ? <p className={styles.error}>{error}</p> : null}

        <button
          type="button"
          className={styles.switch}
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
      </form>
    </main>
  );
}
