import type { AuthUser, NotificationItem } from '@flower-man/contracts';
import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { api } from '../api';
import { attempt, Body, Button, Card, Loading, Muted, Screen, Strong } from '../ui';

export function InboxScreen() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  useEffect(() => {
    void attempt(async () => setItems((await api.request<{ items: NotificationItem[] }>('me/notifications')).items));
  }, []);
  return (
    <Screen title="Notifications">
      {!items ? <Loading /> : items.length === 0 && <Muted>No notifications yet.</Muted>}
      {items?.map((item) => (
        <Card key={item.id} onPress={() => void api.request(`me/notifications/${item.id}/read`, { method: 'POST' }).catch(() => undefined)}>
          <Strong>{item.readAt ? '' : '● '}{item.title}</Strong>
          <Body>{item.body}</Body>
          <Muted>{new Date(item.createdAt).toLocaleString('it-IT')}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

export function AccountScreen({ user, onSignedOut }: { user: AuthUser; onSignedOut: () => void }) {
  const privacy = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  const terms = process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL;
  return (
    <Screen title="Account">
      <Card>
        <Strong>{user.fullName}</Strong>
        <Body>{user.email}</Body>
        <Muted>{user.emailVerified ? 'Email confirmed' : 'Email not confirmed yet'}</Muted>
      </Card>
      {privacy && <Button kind="secondary" title="Privacy policy" onPress={() => void Linking.openURL(privacy)} />}
      {terms && <Button kind="secondary" title="Terms of service" onPress={() => void Linking.openURL(terms)} />}
      <Button kind="secondary" title="Sign out" onPress={() => attempt(async () => { await api.signOut(); onSignedOut(); })} />
      <Button
        kind="danger"
        title="Delete my account"
        onPress={() =>
          Alert.alert('Delete account', 'We will delete your account and personal data. Orders are kept anonymously for legal bookkeeping.', [
            { text: 'Keep my account', style: 'cancel' },
            { text: 'Request deletion', style: 'destructive', onPress: () => void attempt(async () => { await api.request('me/deletion-request', { method: 'POST', body: {} }); Alert.alert('Flower Man', 'Your request has been received.'); }) },
          ])
        }
      />
    </Screen>
  );
}
