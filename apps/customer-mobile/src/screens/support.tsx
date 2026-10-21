import type { SupportTicket } from '@flower-man/contracts';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { api } from '../api';
import { locale, t } from '../i18n';
import { useNavigation } from '../navigation';
import { attempt, Body, Button, Card, colors, Field, Loading, Muted, Pill, Screen, Strong } from '../ui';

const statusLabel = (status: SupportTicket['status']) => (status === 'OPEN' ? t('supportStatusOpen') : status === 'ANSWERED' ? t('supportStatusAnswered') : t('supportStatusClosed'));

/** Help & support: the user's conversations with the Flower Man team, and a form to start one. */
export function SupportScreen({ orderId }: { orderId?: string }) {
  const navigation = useNavigation();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => {
    void attempt(async () => setTickets((await api.request<{ items: SupportTicket[] }>('support/tickets')).items));
  }, []);

  const send = () =>
    attempt(async () => {
      const ticket = await api.request<SupportTicket>('support/tickets', { method: 'POST', body: { subject, body, ...(orderId ? { orderId } : {}) } });
      navigation.push({ name: 'supportTicket', ticketId: ticket.id });
    });

  return (
    <Screen title={t('supportTitle')} onBack={navigation.back}>
      <Card>
        <Strong>{t('supportNew')}</Strong>
        <Field label={t('supportSubject')} value={subject} onChangeText={setSubject} maxLength={120} />
        <Field label={t('supportMessage')} value={body} onChangeText={setBody} multiline maxLength={2000} />
        <Button title={t('supportSend')} onPress={send} disabled={subject.trim().length < 3 || body.trim() === ''} />
      </Card>
      {!tickets ? <Loading /> : tickets.length === 0 && <Muted>{t('supportEmpty')}</Muted>}
      {tickets?.map((ticket) => (
        <Card key={ticket.id} onPress={() => navigation.push({ name: 'supportTicket', ticketId: ticket.id })}>
          <Pill label={statusLabel(ticket.status)} />
          <Strong>{ticket.subject}</Strong>
          <Muted>{new Date(ticket.updatedAt).toLocaleString(locale)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

export function SupportTicketScreen({ ticketId }: { ticketId: string }) {
  const navigation = useNavigation();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState('');
  const load = useCallback(() => attempt(async () => setTicket(await api.request<SupportTicket>(`support/tickets/${ticketId}`))), [ticketId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!ticket) return <Screen title={t('supportTitle')} onBack={navigation.back}><Loading /></Screen>;
  return (
    <Screen title={ticket.subject} onBack={navigation.back}>
      <Pill label={statusLabel(ticket.status)} />
      {ticket.messages.map((message, index) => (
        <View key={index} style={{ alignSelf: message.author === 'USER' ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: message.author === 'USER' ? '#fbeef3' : '#fff', borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 10 }}>
          <Muted>{message.author === 'TEAM' ? t('supportTeam') : t('supportYou')} · {new Date(message.createdAt).toLocaleString(locale)}</Muted>
          <Body>{message.body}</Body>
        </View>
      ))}
      <Field label={t('supportReply')} value={reply} onChangeText={setReply} multiline maxLength={2000} />
      <Button
        title={t('supportSend')}
        disabled={reply.trim() === ''}
        onPress={() =>
          attempt(async () => {
            setTicket(await api.request<SupportTicket>(`support/tickets/${ticketId}/messages`, { method: 'POST', body: { body: reply } }));
            setReply('');
          })
        }
      />
    </Screen>
  );
}
