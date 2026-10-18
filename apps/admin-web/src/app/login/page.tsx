'use client';

import { type FormEvent, useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-flowerman-admin': '1' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });
    setBusy(false);
    if (response.ok) {
      window.location.href = '/';
      return;
    }
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    setError(body?.error?.message ?? 'Sign in failed.');
  }

  return (
    <form className="login card" onSubmit={submit}>
      <h1>🌸 Flower Man Admin</h1>
      <input name="email" type="email" placeholder="Email" autoComplete="username" required />
      <input name="password" type="password" placeholder="Password" autoComplete="current-password" required />
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
