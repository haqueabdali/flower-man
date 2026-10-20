import { formatPrice } from '@flower-man/api-client';
import type { CheckoutResponse, CustomRequestView } from '@flower-man/contracts';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import { locale, offerStatusLabel, requestStatusLabel, t } from '../i18n';
import { currentLocation } from '../location';
import { useNavigation } from '../navigation';
import { attempt, Body, Button, Card, Field, Loading, Muted, Pill, Screen, Strong } from '../ui';

export function RequestsScreen() {
  const navigation = useNavigation();
  const [requests, setRequests] = useState<CustomRequestView[] | null>(null);
  useEffect(() => {
    void attempt(async () => setRequests((await api.request<{ items: CustomRequestView[] }>('custom-requests')).items));
  }, []);
  return (
    <Screen title={t('requestsTitle')} right={<Button kind="secondary" title={t('requestsNew')} onPress={() => navigation.push({ name: 'newRequest' })} />}>
      {!requests ? <Loading /> : requests.length === 0 && <Muted>{t('requestsEmpty')}</Muted>}
      {requests?.map((request) => (
        <Card key={request.id} onPress={() => navigation.push({ name: 'request', requestId: request.id })}>
          <Pill label={requestStatusLabel(request.status)} />
          <Strong>{request.occasion}</Strong>
          <Muted>{t('requestsSummary', { budget: formatPrice(request.budgetMinor), count: request.offers.length })}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

export function NewRequestScreen() {
  const navigation = useNavigation();
  const tomorrow = new Date(Date.now() + 24 * 3_600_000);
  tomorrow.setHours(10, 0, 0, 0);
  const [form, setForm] = useState({ occasion: '', flowerPreferences: '', colourPreferences: '', notes: '', budget: '', recipientName: '', recipientPhone: '+39', deliveryAddress: '', date: tomorrow.toISOString().slice(0, 10), fromHour: '10', toHour: '13' });
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = () =>
    attempt(async () => {
      const location = await currentLocation();
      const start = new Date(`${form.date}T${form.fromHour.padStart(2, '0')}:00:00`);
      const end = new Date(`${form.date}T${form.toHour.padStart(2, '0')}:00:00`);
      const created = await api.request<CustomRequestView>('custom-requests', {
        method: 'POST',
        body: {
          occasion: form.occasion,
          ...(form.flowerPreferences ? { flowerPreferences: form.flowerPreferences } : {}),
          ...(form.colourPreferences ? { colourPreferences: form.colourPreferences } : {}),
          ...(form.notes ? { notes: form.notes } : {}),
          budgetMinor: Math.round(Number(form.budget.replace(',', '.')) * 100),
          deliveryWindowStart: start.toISOString(),
          deliveryWindowEnd: end.toISOString(),
          recipientName: form.recipientName,
          recipientPhone: form.recipientPhone,
          deliveryAddress: form.deliveryAddress,
          deliveryLocation: { latitude: location.latitude, longitude: location.longitude },
        },
      });
      navigation.reset({ name: 'request', requestId: created.id });
    });

  return (
    <Screen title={t('newRequestTitle')} onBack={navigation.back}>
      <Field label={t('newRequestOccasion')} value={form.occasion} onChangeText={set('occasion')} placeholder={t('newRequestOccasionPlaceholder')} />
      <Field label={t('newRequestFlowers')} value={form.flowerPreferences} onChangeText={set('flowerPreferences')} />
      <Field label={t('newRequestColours')} value={form.colourPreferences} onChangeText={set('colourPreferences')} />
      <Field label={t('newRequestNotes')} value={form.notes} onChangeText={set('notes')} multiline />
      <Field label={t('newRequestBudget')} value={form.budget} onChangeText={set('budget')} keyboardType="decimal-pad" />
      <Field label={t('newRequestDate')} value={form.date} onChangeText={set('date')} />
      <Field label={t('newRequestFrom')} value={form.fromHour} onChangeText={set('fromHour')} keyboardType="number-pad" />
      <Field label={t('newRequestTo')} value={form.toHour} onChangeText={set('toHour')} keyboardType="number-pad" />
      <Field label={t('checkoutRecipientName')} value={form.recipientName} onChangeText={set('recipientName')} />
      <Field label={t('checkoutRecipientPhone')} value={form.recipientPhone} onChangeText={set('recipientPhone')} keyboardType="phone-pad" />
      <Field label={t('checkoutAddress')} value={form.deliveryAddress} onChangeText={set('deliveryAddress')} />
      <Button title={t('newRequestSubmit')} onPress={submit} />
    </Screen>
  );
}

export function RequestScreen({ requestId }: { requestId: string }) {
  const navigation = useNavigation();
  const [request, setRequest] = useState<CustomRequestView | null>(null);
  const load = useCallback(async () => setRequest(await api.request<CustomRequestView>(`custom-requests/${requestId}`)), [requestId]);
  useEffect(() => {
    void attempt(load);
    const timer = setInterval(() => void load().catch(() => undefined), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  if (!request) return <Screen title={t('requestTitle')} onBack={navigation.back}><Loading /></Screen>;
  return (
    <Screen title={request.occasion} onBack={navigation.back}>
      <Pill label={requestStatusLabel(request.status)} />
      <Muted>{t('requestBudget', { budget: formatPrice(request.budgetMinor), date: new Date(request.deliveryWindowStart).toLocaleString(locale) })}</Muted>
      {request.offers.length === 0 && request.status === 'OPEN' && <Muted>{t('requestWaiting')}</Muted>}
      {request.offers.map((offer) => (
        <Card key={offer.id}>
          <Strong>{offer.sellerName} · {formatPrice(offer.priceMinor)}</Strong>
          <Body>{offer.description}</Body>
          <Muted>{t('requestReadyIn', { hours: Math.round(offer.preparationMinutes / 60) })}{offer.notes ? ` · ${offer.notes}` : ''}</Muted>
          {request.status === 'OPEN' && (
            <Button
              title={t('requestChoose')}
              onPress={() =>
                attempt(async () => {
                  const checkout = await api.request<CheckoutResponse>(`custom-requests/${request.id}/offers/${offer.id}/select`, { method: 'POST' });
                  navigation.reset({ name: 'payment', checkout });
                })
              }
            />
          )}
          {offer.status !== 'SUBMITTED' && <Pill label={offerStatusLabel(offer.status)} />}
        </Card>
      ))}
      {request.status === 'OPEN' && <Button kind="danger" title={t('requestCancel')} onPress={() => attempt(async () => setRequest(await api.request<CustomRequestView>(`custom-requests/${request.id}/cancel`, { method: 'POST' })))} />}
    </Screen>
  );
}
