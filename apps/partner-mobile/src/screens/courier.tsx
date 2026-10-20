import { formatPrice } from '@flower-man/api-client';
import type { CourierJob, LedgerEntryView, SettlementView } from '@flower-man/contracts';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { api } from '../api';
import { DELIVERY_STATUS_LABELS, locale, SETTLEMENT_STATUS_LABELS, t } from '../i18n';
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
    <Screen title={t('jobsTitle')} onBack={navigation.back}>
      <Strong>{t('jobsMine')}</Strong>
      {!mine ? <Loading /> : mine.length === 0 && <Muted>{t('jobsNone')}</Muted>}
      {mine?.map((job) => (
        <Card key={job.deliveryId} onPress={() => navigation.push({ name: 'courierJob', job })}>
          <Pill label={DELIVERY_STATUS_LABELS[job.status]} />
          <Strong>#{job.orderNumber} · {job.pickupName}</Strong>
          <Muted>{t('jobsTo', { address: job.dropoffAddress })}</Muted>
        </Card>
      ))}
      <Strong>{t('jobsAvailable')}</Strong>
      {offered?.length === 0 && <Muted>{t('jobsEmpty')}</Muted>}
      {offered?.map((job) => (
        <Card key={job.deliveryId}>
          <Strong>{t('jobsEarn', { number: job.orderNumber, price: formatPrice(job.feeMinor) })}</Strong>
          <Muted>{t('jobsPickUpAt', { name: job.pickupName, distance: km(job.distanceMeters) })}</Muted>
          <Muted>{t('jobsDeliverTo', { address: job.dropoffAddress })}</Muted>
          <Button
            title={t('jobsAccept')}
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
      if (!permission.granted) throw new Error(t('jobCameraNeeded'));
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
    <Screen title={t('jobTitle', { number: job.orderNumber })} onBack={navigation.back}>
      <Pill label={DELIVERY_STATUS_LABELS[job.status]} />
      <Card>
        <Strong>{t('jobPickUp', { name: job.pickupName })}</Strong>
        <Body>{job.pickupAddress ?? ''}</Body>
        {job.pickupLocation && job.status === 'ASSIGNED' && <Button kind="secondary" title={t('jobNavigatePickup')} onPress={() => openMaps(job.pickupLocation!.latitude, job.pickupLocation!.longitude)} />}
      </Card>
      <Card>
        <Strong>{t('jobDeliverTo', { name: job.recipientName })}</Strong>
        <Body>{job.dropoffAddress}</Body>
        {job.recipientPhone && <Button kind="secondary" title={t('jobCall', { phone: job.recipientPhone })} onPress={() => void Linking.openURL(`tel:${job.recipientPhone}`)} />}
        {job.status !== 'ASSIGNED' && <Button kind="secondary" title={t('jobNavigateCustomer')} onPress={() => openMaps(job.dropoffLocation.latitude, job.dropoffLocation.longitude)} />}
      </Card>
      {job.status === 'ASSIGNED' && <Button title={t('jobPickedUp')} onPress={() => act('pickup')} />}
      {job.status === 'ASSIGNED' && <Button kind="secondary" title={t('jobRelease')} onPress={() => attempt(async () => { await api.request(`courier/deliveries/${job.deliveryId}/release`, { method: 'POST' }); await stopTracking(); navigation.reset({ name: 'courierJobs' }); })} />}
      {job.status === 'PICKED_UP' && <Button title={t('jobStart')} onPress={() => act('start')} />}
      {job.status === 'IN_TRANSIT' && (
        <>
          <Button kind="secondary" title={t('jobSharePosition')} onPress={() => attempt(() => sendCurrentPosition(job.deliveryId))} />
          {!arrived && <Button title={t('jobArrived')} onPress={() => attempt(async () => { setJob(await api.request<CourierJob>(`courier/deliveries/${job.deliveryId}/arrive`, { method: 'POST' })); setArrived(true); })} />}
          <Button kind={hasProof ? 'secondary' : 'primary'} title={hasProof ? t('jobRetakeProof') : t('jobTakeProof')} onPress={captureProof} />
          {hasProof && <Button title={t('jobComplete')} onPress={complete} />}
        </>
      )}
      {job.status === 'DELIVERED' && <Card><Strong>{t('jobDelivered')}</Strong><Muted>{t('jobEarned', { price: formatPrice(job.feeMinor) })}</Muted></Card>}
      <Muted>{t('jobPrivacy')}</Muted>
    </Screen>
  );
}

export function EarningsScreen({ mode }: { mode: 'seller' | 'courier' }) {
  const navigation = useNavigation();
  const [data, setData] = useState<{ balanceMinor: number; entries: LedgerEntryView[]; settlements: SettlementView[] } | null>(null);
  useEffect(() => {
    void attempt(async () => setData(await api.request(`${mode}/earnings`)));
  }, [mode]);
  if (!data) return <Screen title={t('earnings')} onBack={navigation.back}><Loading /></Screen>;
  return (
    <Screen title={t('earnings')} onBack={navigation.back}>
      <Card><Muted>{t('earningsUnpaid')}</Muted><Strong>{formatPrice(data.balanceMinor)}</Strong></Card>
      <Strong>{t('earningsPayouts')}</Strong>
      {data.settlements.length === 0 && <Muted>{t('earningsNoPayouts')}</Muted>}
      {data.settlements.map((s) => <Card key={s.id}><Pill label={SETTLEMENT_STATUS_LABELS[s.status]} /><Body>{formatPrice(s.totalMinor)} · {new Date(s.updatedAt).toLocaleDateString(locale)}</Body>{s.externalReference && <Muted>{t('earningsRef', { reference: s.externalReference })}</Muted>}</Card>)}
      <Strong>{t('earningsMovements')}</Strong>
      {data.entries.map((e) => <Card key={e.id}><Body>{e.description}</Body><Strong>{formatPrice(e.amountMinor)}</Strong><Muted>{new Date(e.createdAt).toLocaleString(locale)}{e.settlementId ? t('earningsPaidOut') : ''}</Muted></Card>)}
    </Screen>
  );
}
