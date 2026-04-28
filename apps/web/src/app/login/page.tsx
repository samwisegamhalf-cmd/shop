"use client";

import { FormEvent, useState } from "react";

import styles from "./page.module.css";

type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Семейный список");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [recoveryMasterKey, setRecoveryMasterKey] = useState("");
  const [showRecoveryMasterKey, setShowRecoveryMasterKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
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
      if (data.error === "Invalid credentials") {
        setError("Неверный email или пароль");
      } else if (data.error === "User already exists") {
        setError("Пользователь с таким email уже существует");
      } else if (data.error === "Invalid payload") {
        setError("Проверьте корректность введенных данных");
      } else {
        setError("Ошибка авторизации");
      }
      return;
    }

    window.location.href = "/";
  }

  async function handleRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const res = await fetch("/api/auth/recovery/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: recoveryEmail,
        newPassword: recoveryPassword,
        masterKey: recoveryMasterKey,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.error === "User not found") {
        setError("Пользователь с таким email не найден");
      } else if (data.error === "Invalid recovery key") {
        setError("Неверный recovery key");
      } else if (data.error === "Recovery is not configured") {
        setError("Recovery не настроен на сервере");
      } else {
        setError("Не удалось сбросить пароль");
      }
      return;
    }

    setInfo("Пароль обновлен. Войдите с новым паролем.");
    setShowRecovery(false);
    setMode("login");
  }

  return (
    <main className={styles.page}>
      <form onSubmit={showRecovery ? handleRecovery : handleSubmit} className={styles.form}>
        <h1>{mode === "login" ? "Вход" : "Регистрация"}</h1>
        {showRecovery ? (
          <>
            <input
              type="email"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              placeholder="Email аккаунта"
              required
            />
            <div className={styles.passwordRow}>
              <input
                type={showRecoveryPassword ? "text" : "password"}
                value={recoveryPassword}
                onChange={(e) => setRecoveryPassword(e.target.value)}
                placeholder="Новый пароль"
                minLength={6}
                required
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowRecoveryPassword((value) => !value)}
              >
                {showRecoveryPassword ? "🙈" : "👁"}
              </button>
            </div>
            <div className={styles.passwordRow}>
              <input
                type={showRecoveryMasterKey ? "text" : "password"}
                value={recoveryMasterKey}
                onChange={(e) => setRecoveryMasterKey(e.target.value)}
                placeholder="Recovery master key"
                minLength={8}
                required
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowRecoveryMasterKey((value) => !value)}
              >
                {showRecoveryMasterKey ? "🙈" : "👁"}
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
            />
            <div className={styles.passwordRow}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Пароль"
                minLength={6}
                required
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
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
          </>
        )}

        <button disabled={loading} type="submit">
          {loading ? "..." : showRecovery ? "Сбросить пароль" : mode === "login" ? "Войти" : "Создать аккаунт"}
        </button>
        {error ? <p className={styles.error}>{error}</p> : null}
        {info ? <p className={styles.info}>{info}</p> : null}

        {mode === "login" ? (
          <button
            type="button"
            className={styles.switch}
            onClick={() => {
              setShowRecovery((value) => !value);
              setError(null);
              setInfo(null);
            }}
          >
            {showRecovery ? "Назад ко входу" : "Забыли пароль?"}
          </button>
        ) : null}

        {!showRecovery ? (
          <button
            type="button"
            className={styles.switch}
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
              setInfo(null);
              setShowRecovery(false);
            }}
          >
            {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
          </button>
        ) : null}
      </form>
    </main>
  );
}
