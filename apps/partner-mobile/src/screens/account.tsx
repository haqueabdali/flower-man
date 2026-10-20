import type { AuthUser, NotificationItem } from '@flower-man/contracts';
import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { api } from '../api';
import { locale, t } from '../i18n';
import { attempt, Body, Button, Card, Loading, Muted, Screen, Strong } from '../ui';

export function InboxScreen() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  useEffect(() => {
    void attempt(async () => setItems((await api.request<{ items: NotificationItem[] }>('me/notifications')).items));
  }, []);
  return (
    <Screen title={t('inboxTitle')}>
      {!items ? <Loading /> : items.length === 0 && <Muted>{t('inboxEmpty')}</Muted>}
      {items?.map((item) => (
        <Card key={item.id} onPress={() => void api.request(`me/notifications/${item.id}/read`, { method: 'POST' }).catch(() => undefined)}>
          <Strong>{item.readAt ? '' : '● '}{item.title}</Strong>
          <Body>{item.body}</Body>
          <Muted>{new Date(item.createdAt).toLocaleString(locale)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

export function AccountScreen({ user, onSignedOut }: { user: AuthUser; onSignedOut: () => void }) {
  const privacy = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  const terms = process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL;
  return (
    <Screen title={t('accountTitle')}>
      <Card>
        <Strong>{user.fullName}</Strong>
        <Body>{user.email}</Body>
        <Muted>{user.emailVerified ? t('accountEmailConfirmed') : t('accountEmailNotConfirmed')}</Muted>
      </Card>
      {privacy && <Button kind="secondary" title={t('accountPrivacy')} onPress={() => void Linking.openURL(privacy)} />}
      {terms && <Button kind="secondary" title={t('accountTerms')} onPress={() => void Linking.openURL(terms)} />}
      <Button kind="secondary" title={t('accountSignOut')} onPress={() => attempt(async () => { await api.signOut(); onSignedOut(); })} />
      <Button
        kind="danger"
        title={t('accountDelete')}
        onPress={() =>
          Alert.alert(t('accountDeleteTitle'), t('accountDeleteBody'), [
            { text: t('accountDeleteKeep'), style: 'cancel' },
            { text: t('accountDeleteConfirm'), style: 'destructive', onPress: () => void attempt(async () => { await api.request('me/deletion-request', { method: 'POST', body: {} }); Alert.alert(t('appName'), t('accountDeleteReceived')); }) },
          ])
        }
      />
    </Screen>
  );
}
