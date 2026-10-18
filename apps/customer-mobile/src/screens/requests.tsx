import { formatPrice } from '@flower-man/api-client';
import type { CheckoutResponse, CustomRequestView } from '@flower-man/contracts';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
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
    <Screen title="Custom bouquets" right={<Button kind="secondary" title="New" onPress={() => navigation.push({ name: 'newRequest' })} />}>
      {!requests ? <Loading /> : requests.length === 0 && <Muted>Describe the bouquet you dream of and local florists will make you offers.</Muted>}
      {requests?.map((request) => (
        <Card key={request.id} onPress={() => navigation.push({ name: 'request', requestId: request.id })}>
          <Pill label={request.status} />
          <Strong>{request.occasion}</Strong>
          <Muted>Budget {formatPrice(request.budgetMinor)} · {request.offers.length} offer(s)</Muted>
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
    <Screen title="Custom bouquet" onBack={navigation.back}>
      <Field label="Occasion" value={form.occasion} onChangeText={set('occasion')} placeholder="Birthday, anniversary…" />
      <Field label="Flowers you like" value={form.flowerPreferences} onChangeText={set('flowerPreferences')} />
      <Field label="Colours" value={form.colourPreferences} onChangeText={set('colourPreferences')} />
      <Field label="Message / notes" value={form.notes} onChangeText={set('notes')} multiline />
      <Field label="Budget (€)" value={form.budget} onChangeText={set('budget')} keyboardType="decimal-pad" />
      <Field label="Delivery date (YYYY-MM-DD)" value={form.date} onChangeText={set('date')} />
      <Field label="From hour" value={form.fromHour} onChangeText={set('fromHour')} keyboardType="number-pad" />
      <Field label="To hour" value={form.toHour} onChangeText={set('toHour')} keyboardType="number-pad" />
      <Field label="Recipient name" value={form.recipientName} onChangeText={set('recipientName')} />
      <Field label="Recipient phone" value={form.recipientPhone} onChangeText={set('recipientPhone')} keyboardType="phone-pad" />
      <Field label="Delivery address" value={form.deliveryAddress} onChangeText={set('deliveryAddress')} />
      <Button title="Ask florists for offers" onPress={submit} />
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

  if (!request) return <Screen title="Request" onBack={navigation.back}><Loading /></Screen>;
  return (
    <Screen title={request.occasion} onBack={navigation.back}>
      <Pill label={request.status} />
      <Muted>Budget {formatPrice(request.budgetMinor)} · {new Date(request.deliveryWindowStart).toLocaleString('it-IT')}</Muted>
      {request.offers.length === 0 && request.status === 'OPEN' && <Muted>Waiting for offers from florists near you…</Muted>}
      {request.offers.map((offer) => (
        <Card key={offer.id}>
          <Strong>{offer.sellerName} · {formatPrice(offer.priceMinor)}</Strong>
          <Body>{offer.description}</Body>
          <Muted>Ready in about {Math.round(offer.preparationMinutes / 60)} h{offer.notes ? ` · ${offer.notes}` : ''}</Muted>
          {request.status === 'OPEN' && (
            <Button
              title="Choose this offer"
              onPress={() =>
                attempt(async () => {
                  const checkout = await api.request<CheckoutResponse>(`custom-requests/${request.id}/offers/${offer.id}/select`, { method: 'POST' });
                  navigation.reset({ name: 'payment', checkout });
                })
              }
            />
          )}
          {offer.status !== 'SUBMITTED' && <Pill label={offer.status} />}
        </Card>
      ))}
      {request.status === 'OPEN' && <Button kind="danger" title="Cancel request" onPress={() => attempt(async () => setRequest(await api.request<CustomRequestView>(`custom-requests/${request.id}/cancel`, { method: 'POST' })))} />}
    </Screen>
  );
}
