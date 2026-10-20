import { type PartnerAccount, type PartnerApplicationRequest, type Rating, type VerificationStatus, type Weekday, WEEKDAYS } from '@flower-man/contracts';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { api } from '../api';
import { locale, PARTNER_KIND_LABELS, t, VERIFICATION_STATUS_LABELS } from '../i18n';
import { useNavigation } from '../navigation';
import { attempt, Body, Button, Card, Field, Loading, Muted, Pill, Screen, Strong } from '../ui';

export const ratingText = (rating: Rating | null) =>
  rating ? t('ratingSummary', { average: rating.average.toLocaleString(locale, { minimumFractionDigits: 1 }), count: rating.count }) : t('ratingNone');

const STATUS_HELP: Record<VerificationStatus, string> = {
  DRAFT: t('statusHelpDraft'),
  SUBMITTED: t('statusHelpSubmitted'),
  UNDER_REVIEW: t('statusHelpUnderReview'),
  APPROVED: t('statusHelpApproved'),
  REJECTED: t('statusHelpRejected'),
  SUSPENDED: t('statusHelpSuspended'),
};

export function usePartners(): { partners: PartnerAccount[] | null; reload: () => Promise<void> } {
  const [partners, setPartners] = useState<PartnerAccount[] | null>(null);
  const reload = useCallback(async () => setPartners((await api.request<{ items: PartnerAccount[] }>('partner/accounts')).items), []);
  useEffect(() => {
    void attempt(reload);
  }, [reload]);
  return { partners, reload };
}

/** Works for unapproved partners too: onboarding never depends on marketplace permissions. */
export function HomeScreen() {
  const navigation = useNavigation();
  const { partners, reload } = usePartners();
  const seller = partners?.find((p) => p.kind !== 'COURIER' && p.verificationStatus === 'APPROVED');
  const courier = partners?.find((p) => p.kind === 'COURIER' && p.verificationStatus === 'APPROVED');

  return (
    <Screen title={t('homeTitle')}>
      {!partners ? <Loading /> : partners.length === 0 && <Card><Strong>{t('homeWelcome')}</Strong><Muted>{t('homeWelcomeBody')}</Muted></Card>}
      {partners?.map((partner) => (
        <Card key={partner.id} onPress={() => navigation.push({ name: 'partner', partnerId: partner.id })}>
          <Pill label={VERIFICATION_STATUS_LABELS[partner.verificationStatus]} />
          <Strong>{partner.displayName}</Strong>
          <Muted>{PARTNER_KIND_LABELS[partner.kind]} · {STATUS_HELP[partner.verificationStatus]}</Muted>
        </Card>
      ))}
      {seller && (
        <Card>
          <Strong>{seller.displayName}</Strong>
          <Muted>{ratingText(seller.rating)}</Muted>
          <View style={{ gap: 8 }}>
            <Button title={t('homeOrders')} onPress={() => navigation.push({ name: 'sellerOrders' })} />
            <Button kind="secondary" title={t('homeRequests')} onPress={() => navigation.push({ name: 'requestFeed' })} />
            <Button kind="secondary" title={t('homeProducts')} onPress={() => navigation.push({ name: 'products' })} />
            <Button kind="secondary" title={t('reviewsButton')} onPress={() => navigation.push({ name: 'reviews' })} />
            <Button kind="secondary" title={t('earnings')} onPress={() => navigation.push({ name: 'earnings', mode: 'seller' })} />
          </View>
        </Card>
      )}
      {courier && <CourierPanel courier={courier} onChange={reload} />}
      <Button kind="secondary" title={t('homeApply')} onPress={() => navigation.push({ name: 'apply' })} />
    </Screen>
  );
}

function CourierPanel({ courier, onChange }: { courier: PartnerAccount; onChange: () => Promise<void> }) {
  const navigation = useNavigation();
  return (
    <Card>
      <Strong>{t('courierPanelTitle', { name: courier.displayName })}</Strong>
      <Muted>{ratingText(courier.rating)}</Muted>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body>{courier.courierAvailable ? t('courierAvailable') : t('courierOffline')}</Body>
        <Switch
          value={courier.courierAvailable}
          onValueChange={(available) => void attempt(async () => { await api.request('partner/courier/availability', { method: 'POST', body: { available } }); await onChange(); })}
        />
      </View>
      <Button title={t('courierJobsButton')} onPress={() => navigation.push({ name: 'courierJobs' })} />
      <Button kind="secondary" title={t('earnings')} onPress={() => navigation.push({ name: 'earnings', mode: 'courier' })} />
    </Card>
  );
}

export function ApplyScreen() {
  const navigation = useNavigation();
  const [kind, setKind] = useState<PartnerApplicationRequest['kind']>('FREELANCE_SELLER');
  const [form, setForm] = useState({ displayName: '', legalName: '', vatNumber: '', phone: '+39', address: '', description: '' });
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = () =>
    attempt(async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error(t('applyLocationNeeded'));
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const created = await api.request<PartnerAccount>('partner/accounts', {
        method: 'POST',
        body: {
          kind,
          displayName: form.displayName,
          phone: form.phone,
          location: { latitude: position.coords.latitude, longitude: position.coords.longitude },
          ...(form.address ? { address: form.address } : {}),
          ...(form.description ? { description: form.description } : {}),
          ...(kind === 'SHOP' ? { legalName: form.legalName, vatNumber: form.vatNumber.toUpperCase() } : {}),
        },
      });
      navigation.reset({ name: 'partner', partnerId: created.id });
    });

  return (
    <Screen title={t('applyTitle')} onBack={navigation.back}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['FREELANCE_SELLER', 'SHOP', 'COURIER'] as const).map((value) => (
          <Button key={value} kind={kind === value ? 'primary' : 'secondary'} title={value === 'SHOP' ? t('applyKindShop') : value === 'COURIER' ? t('applyKindCourier') : t('applyKindFlorist')} onPress={() => setKind(value)} />
        ))}
      </View>
      <Field label={kind === 'COURIER' ? t('applyYourName') : t('applyBrandName')} value={form.displayName} onChangeText={set('displayName')} />
      {kind === 'SHOP' && <Field label={t('applyLegalName')} value={form.legalName} onChangeText={set('legalName')} />}
      {kind === 'SHOP' && <Field label={t('applyVat')} value={form.vatNumber} onChangeText={set('vatNumber')} autoCapitalize="characters" />}
      <Field label={t('applyPhone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      {kind !== 'COURIER' && <Field label={t('applyAddress')} value={form.address} onChangeText={set('address')} />}
      <Field label={t('applyAbout')} value={form.description} onChangeText={set('description')} multiline />
      <Muted>{t('applyLocationHint')}</Muted>
      <Button title={t('applySave')} onPress={submit} />
    </Screen>
  );
}

export function PartnerScreen({ partnerId }: { partnerId: string }) {
  const navigation = useNavigation();
  const [partner, setPartner] = useState<PartnerAccount | null>(null);
  useEffect(() => {
    void attempt(async () => setPartner(await api.request<PartnerAccount>(`partner/accounts/${partnerId}`)));
  }, [partnerId]);
  if (!partner) return <Screen title={t('partnerTitle')} onBack={navigation.back}><Loading /></Screen>;
  return (
    <Screen title={partner.displayName} onBack={navigation.back}>
      <Pill label={VERIFICATION_STATUS_LABELS[partner.verificationStatus]} />
      <Body>{STATUS_HELP[partner.verificationStatus]}</Body>
      {partner.verificationNotes && <Card><Strong>{t('partnerNotes')}</Strong><Body>{partner.verificationNotes}</Body></Card>}
      <Muted>{partner.phone} · {partner.address ?? t('partnerNoAddress')}</Muted>
      {(partner.verificationStatus === 'DRAFT' || partner.verificationStatus === 'REJECTED') && partner.role === 'OWNER' && (
        <Button title={t('partnerSubmit')} onPress={() => attempt(async () => setPartner(await api.request<PartnerAccount>(`partner/accounts/${partner.id}/submit`, { method: 'POST' })))} />
      )}
      {partner.kind !== 'COURIER' && partner.role === 'OWNER' && <OpeningHoursCard partner={partner} onSaved={setPartner} />}
    </Screen>
  );
}

const DAY_LABELS: Record<Weekday, string> = {
  mon: t('dayMon'), tue: t('dayTue'), wed: t('dayWed'), thu: t('dayThu'), fri: t('dayFri'), sat: t('daySat'), sun: t('daySun'),
};

function OpeningHoursCard({ partner, onSaved }: { partner: PartnerAccount; onSaved: (partner: PartnerAccount) => void }) {
  const [hours, setHours] = useState<Record<Weekday, string>>(() =>
    Object.fromEntries(WEEKDAYS.map((day) => [day, partner.openingHours[day] && partner.openingHours[day] !== 'closed' ? (partner.openingHours[day] as string) : ''])) as Record<Weekday, string>,
  );
  const save = () =>
    attempt(async () => {
      const anySet = WEEKDAYS.some((day) => hours[day].trim() !== '');
      const openingHours = anySet ? Object.fromEntries(WEEKDAYS.map((day) => [day, hours[day].trim() || 'closed'])) : {};
      onSaved(await api.request<PartnerAccount>(`partner/accounts/${partner.id}`, { method: 'PATCH', body: { openingHours } }));
      Alert.alert(t('hoursSaved'));
    });
  return (
    <Card>
      <Strong>{t('hoursTitle')}</Strong>
      <Muted>{t('hoursHelp')}</Muted>
      {WEEKDAYS.map((day) => (
        <Field key={day} label={DAY_LABELS[day]} value={hours[day]} placeholder="09:00-19:00" onChangeText={(value) => setHours((current) => ({ ...current, [day]: value }))} keyboardType="numbers-and-punctuation" />
      ))}
      <Button title={t('hoursSave')} onPress={save} />
    </Card>
  );
}
