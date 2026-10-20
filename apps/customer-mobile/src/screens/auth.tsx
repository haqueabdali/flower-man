import { useState } from 'react';
import { Text, View } from 'react-native';

import { api } from '../api';
import { t } from '../i18n';
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
          setMessage(t('authResetSent'));
          return;
        }
        onSignedIn();
      } finally {
        setBusy(false);
      }
    });

  return (
    <Screen title={mode === 'login' ? t('authSignInTitle') : mode === 'register' ? t('authRegisterTitle') : t('authResetTitle')}>
      <Text style={{ fontSize: 28, textAlign: 'center' }}>🌸 Flower Man</Text>
      <Muted>{t('authTagline')}</Muted>
      {mode === 'register' && <Field label={t('authFullName')} value={fullName} onChangeText={setFullName} autoComplete="name" />}
      <Field label={t('authEmail')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      {mode !== 'forgot' && <Field label={t('authPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />}
      {mode === 'register' && <Field label={t('authPhone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />}
      <Button title={busy ? t('pleaseWait') : mode === 'login' ? t('authSignIn') : mode === 'register' ? t('authCreateAccount') : t('authSendReset')} onPress={submit} disabled={busy} />
      {message && <Muted>{message}</Muted>}
      <View style={{ gap: 8, marginTop: 8 }}>
        {mode !== 'login' && <Button kind="secondary" title={t('authHaveAccount')} onPress={() => setMode('login')} />}
        {mode !== 'register' && <Button kind="secondary" title={t('authNewAccount')} onPress={() => setMode('register')} />}
        {mode === 'login' && <Button kind="secondary" title={t('authForgot')} onPress={() => setMode('forgot')} />}
      </View>
    </Screen>
  );
}

export function VerifyEmailScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'ok'>('idle');
  return (
    <Screen title={t('verifyTitle')} onBack={onDone}>
      {state === 'ok' ? <Muted>{t('verifyDone')}</Muted> : <Muted>{t('verifyIntro')}</Muted>}
      {state === 'idle' && (
        <Button
          title={t('verifyButton')}
          onPress={() =>
            attempt(async () => {
              await api.request('auth/email-verification/confirm', { method: 'POST', body: { token }, auth: false });
              await api.refreshUser().catch(() => null);
              setState('ok');
            })
          }
        />
      )}
      {state === 'ok' && <Button title={t('verifyContinue')} onPress={onDone} />}
    </Screen>
  );
}

export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  return (
    <Screen title={t('resetTitle')} onBack={onDone}>
      <Field label={t('resetPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <Button
        title={t('resetSave')}
        onPress={() =>
          attempt(async () => {
            await api.request('auth/password-reset/confirm', { method: 'POST', body: { token, newPassword: password }, auth: false });
            await api.signOut();
            onDone();
          })
        }
      />
      <Muted>{t('resetSignedOut')}</Muted>
    </Screen>
  );
}
