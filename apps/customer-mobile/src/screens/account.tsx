import type { AuthUser, NotificationItem, OccasionReminder } from '@flower-man/contracts';
import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { api } from '../api';
import { locale, t } from '../i18n';
import { useNavigation } from '../navigation';
import { attempt, Body, Button, Card, Field, Loading, Muted, Screen, Strong } from '../ui';

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
  const navigation = useNavigation();
  const privacy = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  const terms = process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL;
  return (
    <Screen title={t('accountTitle')}>
      <Card>
        <Strong>{user.fullName}</Strong>
        <Body>{user.email}</Body>
        <Muted>{user.emailVerified ? t('accountEmailConfirmed') : t('accountEmailPending')}</Muted>
      </Card>
      {privacy && <Button kind="secondary" title={t('accountPrivacy')} onPress={() => void Linking.openURL(privacy)} />}
      {terms && <Button kind="secondary" title={t('accountTerms')} onPress={() => void Linking.openURL(terms)} />}
      <Button kind="secondary" title={`🎂 ${t('remindersTitle')}`} onPress={() => navigation.push({ name: 'reminders' })} />
      <Button kind="secondary" title={`💬 ${t('supportTitle')}`} onPress={() => navigation.push({ name: 'support' })} />
      <Button kind="secondary" title={t('accountExport')} onPress={() => attempt(async () => { await api.request('me/data-export', { method: 'POST' }); Alert.alert(t('appName'), t('accountExportSent')); })} />
      <Button kind="secondary" title={t('accountSignOut')} onPress={() => attempt(async () => { await api.signOut(); onSignedOut(); })} />
      <Button
        kind="danger"
        title={t('accountDelete')}
        onPress={() =>
          Alert.alert(t('accountDeleteTitle'), t('accountDeleteBody'), [
            { text: t('accountKeep'), style: 'cancel' },
            { text: t('accountDeleteConfirm'), style: 'destructive', onPress: () => void attempt(async () => { await api.request('me/deletion-request', { method: 'POST', body: {} }); Alert.alert(t('appName'), t('accountDeleteReceived')); }) },
          ])
        }
      />
    </Screen>
  );
}

export function RemindersScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState<OccasionReminder[] | null>(null);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');
  const [daysBefore, setDaysBefore] = useState(3);
  useEffect(() => {
    void attempt(async () => setItems((await api.request<{ items: OccasionReminder[] }>('reminders')).items));
  }, []);

  const add = () =>
    attempt(async () => {
      const match = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*$/.exec(date);
      if (!match) throw new Error(t('remindersBadDate'));
      const result = await api.request<{ items: OccasionReminder[] }>('reminders', { method: 'POST', body: { label, day: Number(match[1]), month: Number(match[2]), daysBefore } });
      setItems(result.items);
      setLabel('');
      setDate('');
    });

  return (
    <Screen title={t('remindersTitle')} onBack={navigation.back}>
      <Muted>{t('remindersHelp')}</Muted>
      {!items ? <Loading /> : items.length === 0 && <Muted>{t('remindersEmpty')}</Muted>}
      {items?.map((item) => (
        <Card key={item.id}>
          <Strong>{item.label}</Strong>
          <Muted>{t('remindersNext', { date: new Date(`${item.nextDate}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long' }), days: item.daysBefore })}</Muted>
          <Button kind="secondary" title={t('remindersDelete')} onPress={() => attempt(async () => { await api.request(`reminders/${item.id}`, { method: 'DELETE' }); setItems((current) => current?.filter((r) => r.id !== item.id) ?? null); })} />
        </Card>
      ))}
      <Card>
        <Field label={t('remindersLabel')} value={label} onChangeText={setLabel} maxLength={60} />
        <Field label={t('remindersDate')} value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" placeholder="14/02" />
        <Body>{t('remindersBefore')}</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {[1, 3, 7].map((days) => (
            <Button key={days} kind={daysBefore === days ? 'primary' : 'secondary'} title={t('remindersDaysBefore', { days })} onPress={() => setDaysBefore(days)} />
          ))}
        </View>
        <Button title={t('remindersAdd')} onPress={add} disabled={label.trim().length < 2 || date.trim() === ''} />
      </Card>
    </Screen>
  );
}
