import { formatPrice } from '@flower-man/api-client';
import type { CourierJob, LedgerEntryView, SettlementView } from '@flower-man/contracts';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { api } from '../api';
import { useNavigation } from '../navigation';
import { sendCurrentPosition, startTracking, stopTracking } from '../tracking';
import { attempt, Body, Button, Card, Loading, Muted, Pill, Screen, Strong } from '../ui';

const km = (meters: number | null) => (meters === null ? '' : ` · ${(meters / 1000).toFixed(1)} km`);

export function CourierJobsScreen() {
  const navigation = useNavigation();
  const [offered, setOffered] = useState<CourierJob[] | null>(null);
  const [mine, setMine] = useState<CourierJob[] | null>(null);
  const load = useCallback(async () => {
    setOffered((await api.request<{ items: CourierJob[] }>('courier/jobs/offered')).items);
    setMine((await api.request<{ items: CourierJob[] }>('courier/jobs')).items);
  }, []);
  useEffect(() => {
    void attempt(load);
    const timer = setInterval(() => void load().catch(() => undefined), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <Screen title="Deliveries" onBack={navigation.back}>
      <Strong>My active deliveries</Strong>
      {!mine ? <Loading /> : mine.length === 0 && <Muted>None.</Muted>}
      {mine?.map((job) => (
        <Card key={job.deliveryId} onPress={() => navigation.push({ name: 'courierJob', job })}>
          <Pill label={job.status} />
          <Strong>#{job.orderNumber} · {job.pickupName}</Strong>
          <Muted>to {job.dropoffAddress}</Muted>
        </Card>
      ))}
      <Strong>Available jobs</Strong>
      {offered?.length === 0 && <Muted>No jobs right now. Make sure you are set as available.</Muted>}
      {offered?.map((job) => (
        <Card key={job.deliveryId}>
          <Strong>#{job.orderNumber} · earn {formatPrice(job.feeMinor)}</Strong>
          <Muted>Pick up at {job.pickupName}{km(job.distanceMeters)}</Muted>
          <Muted>Deliver to {job.dropoffAddress}</Muted>
          <Button
            title="Accept"
            onPress={() =>
              attempt(async () => {
                const accepted = await api.request<CourierJob>(`courier/deliveries/${job.deliveryId}/accept`, { method: 'POST' });
                await startTracking(accepted.deliveryId);
                navigation.push({ name: 'courierJob', job: accepted });
              })
            }
          />
        </Card>
      ))}
    </Screen>
  );
}

function openMaps(latitude: number, longitude: number) {
  const url = Platform.OS === 'ios' ? `maps://?daddr=${latitude},${longitude}` : `google.navigation:q=${latitude},${longitude}`;
  void Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`));
}

export function CourierJobScreen({ job: initial }: { job: CourierJob }) {
  const navigation = useNavigation();
  const [job, setJob] = useState(initial);
  const [hasProof, setHasProof] = useState(false);
  const [arrived, setArrived] = useState(false);
  const act = (action: string) => attempt(async () => setJob(await api.request<CourierJob>(`courier/deliveries/${job.deliveryId}/${action}`, { method: 'POST' })));

  useEffect(() => {
    void startTracking(job.deliveryId).catch(() => undefined);
  }, [job.deliveryId]);

  const captureProof = () =>
    attempt(async () => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error('Camera permission is needed for the delivery photo.');
      const photo = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, exif: false });
      if (photo.canceled || !photo.assets[0]) return;
      const blob = await (await fetch(photo.assets[0].uri)).blob();
      await api.request(`courier/deliveries/${job.deliveryId}/proof`, { method: 'POST', binary: { data: blob, contentType: photo.assets[0].mimeType ?? 'image/jpeg' } });
      setHasProof(true);
    });

  const complete = () =>
    attempt(async () => {
      setJob(await api.request<CourierJob>(`courier/deliveries/${job.deliveryId}/complete`, { method: 'POST' }));
      await stopTracking();
    });

  return (
    <Screen title={`Delivery #${job.orderNumber}`} onBack={navigation.back}>
      <Pill label={job.status} />
      <Card>
        <Strong>Pick up · {job.pickupName}</Strong>
        <Body>{job.pickupAddress ?? ''}</Body>
        {job.pickupLocation && job.status === 'ASSIGNED' && <Button kind="secondary" title="Navigate to pickup" onPress={() => openMaps(job.pickupLocation!.latitude, job.pickupLocation!.longitude)} />}
      </Card>
      <Card>
        <Strong>Deliver to {job.recipientName}</Strong>
        <Body>{job.dropoffAddress}</Body>
        {job.recipientPhone && <Button kind="secondary" title={`Call ${job.recipientPhone}`} onPress={() => void Linking.openURL(`tel:${job.recipientPhone}`)} />}
        {job.status !== 'ASSIGNED' && <Button kind="secondary" title="Navigate to customer" onPress={() => openMaps(job.dropoffLocation.latitude, job.dropoffLocation.longitude)} />}
      </Card>
      {job.status === 'ASSIGNED' && <Button title="Picked up the flowers" onPress={() => act('pickup')} />}
      {job.status === 'ASSIGNED' && <Button kind="secondary" title="Give the job back" onPress={() => attempt(async () => { await api.request(`courier/deliveries/${job.deliveryId}/release`, { method: 'POST' }); await stopTracking(); navigation.reset({ name: 'courierJobs' }); })} />}
      {job.status === 'PICKED_UP' && <Button title="Start delivery" onPress={() => act('start')} />}
      {job.status === 'IN_TRANSIT' && (
        <>
          <Button kind="secondary" title="Share my position now" onPress={() => attempt(() => sendCurrentPosition(job.deliveryId))} />
          {!arrived && <Button title="I've arrived" onPress={() => attempt(async () => { setJob(await api.request<CourierJob>(`courier/deliveries/${job.deliveryId}/arrive`, { method: 'POST' })); setArrived(true); })} />}
          <Button kind={hasProof ? 'secondary' : 'primary'} title={hasProof ? 'Retake proof photo' : 'Take proof photo'} onPress={captureProof} />
          {hasProof && <Button title="Complete delivery" onPress={complete} />}
        </>
      )}
      {job.status === 'DELIVERED' && <Card><Strong>Delivered. Thank you! 🌸</Strong><Muted>You earned {formatPrice(job.feeMinor)}.</Muted></Card>}
      <Muted>Your position is shared only while this delivery is active.</Muted>
    </Screen>
  );
}

export function EarningsScreen({ mode }: { mode: 'seller' | 'courier' }) {
  const navigation = useNavigation();
  const [data, setData] = useState<{ balanceMinor: number; entries: LedgerEntryView[]; settlements: SettlementView[] } | null>(null);
  useEffect(() => {
    void attempt(async () => setData(await api.request(`${mode}/earnings`)));
  }, [mode]);
  if (!data) return <Screen title="Earnings" onBack={navigation.back}><Loading /></Screen>;
  return (
    <Screen title="Earnings" onBack={navigation.back}>
      <Card><Muted>Not yet paid out</Muted><Strong>{formatPrice(data.balanceMinor)}</Strong></Card>
      <Strong>Payouts</Strong>
      {data.settlements.length === 0 && <Muted>No payouts yet.</Muted>}
      {data.settlements.map((s) => <Card key={s.id}><Pill label={s.status} /><Body>{formatPrice(s.totalMinor)} · {new Date(s.updatedAt).toLocaleDateString('it-IT')}</Body>{s.externalReference && <Muted>Ref. {s.externalReference}</Muted>}</Card>)}
      <Strong>Movements</Strong>
      {data.entries.map((e) => <Card key={e.id}><Body>{e.description}</Body><Strong>{formatPrice(e.amountMinor)}</Strong><Muted>{new Date(e.createdAt).toLocaleString('it-IT')}{e.settlementId ? ' · paid out' : ''}</Muted></Card>)}
    </Screen>
  );
}
