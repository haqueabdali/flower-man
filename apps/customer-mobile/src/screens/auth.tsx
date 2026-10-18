import { useState } from 'react';
import { Text, View } from 'react-native';

import { api } from '../api';
import { attempt, Button, Field, Muted, Screen } from '../ui';

export function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = () =>
    attempt(async () => {
      setBusy(true);
      try {
        if (mode === 'login') await api.signIn(email, password);
        else if (mode === 'register') await api.register({ email, password, fullName, ...(phone ? { phone } : {}) });
        else {
          await api.request('auth/password-reset/request', { method: 'POST', body: { email }, auth: false });
          setMessage('If an account exists for this email, a reset link is on its way.');
          return;
        }
        onSignedIn();
      } finally {
        setBusy(false);
      }
    });

  return (
    <Screen title={mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Reset password'}>
      <Text style={{ fontSize: 28, textAlign: 'center' }}>🌸 Flower Man</Text>
      <Muted>Fresh flowers delivered in Bergamo.</Muted>
      {mode === 'register' && <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" />}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      {mode !== 'forgot' && <Field label="Password (min. 10 characters)" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />}
      {mode === 'register' && <Field label="Phone (optional, +39…)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />}
      <Button title={busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'} onPress={submit} disabled={busy} />
      {message && <Muted>{message}</Muted>}
      <View style={{ gap: 8, marginTop: 8 }}>
        {mode !== 'login' && <Button kind="secondary" title="I have an account" onPress={() => setMode('login')} />}
        {mode !== 'register' && <Button kind="secondary" title="Create an account" onPress={() => setMode('register')} />}
        {mode === 'login' && <Button kind="secondary" title="Forgot password?" onPress={() => setMode('forgot')} />}
      </View>
    </Screen>
  );
}

export function VerifyEmailScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'ok'>('idle');
  return (
    <Screen title="Confirm email" onBack={onDone}>
      {state === 'ok' ? <Muted>Your email is confirmed. Thank you!</Muted> : <Muted>Confirm your email address to start ordering.</Muted>}
      {state === 'idle' && (
        <Button
          title="Confirm my email"
          onPress={() =>
            attempt(async () => {
              await api.request('auth/email-verification/confirm', { method: 'POST', body: { token }, auth: false });
              await api.refreshUser().catch(() => null);
              setState('ok');
            })
          }
        />
      )}
      {state === 'ok' && <Button title="Continue" onPress={onDone} />}
    </Screen>
  );
}

export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  return (
    <Screen title="New password" onBack={onDone}>
      <Field label="New password (min. 10 characters)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <Button
        title="Save password"
        onPress={() =>
          attempt(async () => {
            await api.request('auth/password-reset/confirm', { method: 'POST', body: { token, newPassword: password }, auth: false });
            await api.signOut();
            onDone();
          })
        }
      />
      <Muted>For your security you will be signed out on every device.</Muted>
    </Screen>
  );
}
