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
        setError("Проверь корректность введенных данных");
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

  const title = showRecovery ? "Восстановление" : mode === "login" ? "Вход" : "Регистрация";
  const subtitle = showRecovery
    ? "Обновите пароль с помощью recovery key."
    : mode === "login"
      ? "Откройте свои списки и продолжайте покупки."
      : "Создайте пространство и начните вести покупки вместе.";

  return (
    <main className={styles.page}>
      <form onSubmit={showRecovery ? handleRecovery : handleSubmit} className={styles.form}>
        <div className={styles.formHeader}>
          <span className={styles.kicker}>Shop List</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

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
                aria-label={showRecoveryPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showRecoveryPassword ? <EyeOffIcon /> : <EyeIcon />}
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
                aria-label={showRecoveryMasterKey ? "Скрыть recovery key" : "Показать recovery key"}
              >
                {showRecoveryMasterKey ? <EyeOffIcon /> : <EyeIcon />}
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
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {mode === "register" ? (
              <>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ваше имя, если хотите"
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

        <button disabled={loading} type="submit" className={styles.submitButton}>
          {loading ? "..." : showRecovery ? "Сбросить пароль" : mode === "login" ? "Войти" : "Создать аккаунт"}
        </button>

        {error ? <p className={styles.error}>{error}</p> : null}
        {info ? <p className={styles.info}>{info}</p> : null}

        <div className={styles.footerActions}>
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
        </div>
      </form>
    </main>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.eyeSvg}>
      <path
        d="M12 5c4.7 0 8.5 2.7 10.4 7-.4.9-.9 1.8-1.5 2.6C19 17.3 15.8 19 12 19s-7-1.7-8.9-4.4C2.5 13.8 2 12.9 1.6 12 3.5 7.7 7.3 5 12 5Zm0 2C8.4 7 5.4 9 3.8 12c1.6 3 4.6 5 8.2 5s6.6-2 8.2-5c-1.6-3-4.6-5-8.2-5Zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.eyeSvg}>
      <path
        d="M4.7 3.3 20.7 19.3l-1.4 1.4-3.1-3.1A11.7 11.7 0 0 1 12 19c-3.8 0-7-1.7-8.9-4.4-.6-.8-1.1-1.7-1.5-2.6 1-2.3 2.6-4.2 4.5-5.5L3.3 4.7l1.4-1.4ZM7.6 8l1.5 1.5a3.9 3.9 0 0 0 5.4 5.4L16 16.4c-1.2.4-2.5.6-4 .6-3.6 0-6.6-2-8.2-5A10 10 0 0 1 7.6 8Zm4.2-3c4.7 0 8.5 2.7 10.4 7-.4.9-.9 1.8-1.5 2.6-.7 1-1.6 1.9-2.6 2.6l-1.5-1.5A10 10 0 0 0 20.2 12c-1.6-3-4.6-5-8.2-5-.9 0-1.8.1-2.6.3L7.7 5.6c1.3-.4 2.6-.6 4.1-.6Z"
        fill="currentColor"
      />
    </svg>
  );
}
