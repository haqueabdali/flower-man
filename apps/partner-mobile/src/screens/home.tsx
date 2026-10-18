import type { PartnerAccount, PartnerApplicationRequest } from '@flower-man/contracts';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { api } from '../api';
import { useNavigation } from '../navigation';
import { attempt, Body, Button, Card, Field, Loading, Muted, Pill, Screen, Strong } from '../ui';

const STATUS_HELP: Record<string, string> = {
  DRAFT: 'Complete your profile and submit it for verification.',
  SUBMITTED: 'Submitted. Our team will review your application soon.',
  UNDER_REVIEW: 'Under review by the Flower Man team.',
  APPROVED: 'Approved: you can work on Flower Man.',
  REJECTED: 'Not approved. Read the notes, update your profile and submit again.',
  SUSPENDED: 'Suspended. Contact Flower Man support.',
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
    <Screen title="Flower Man Partner">
      {!partners ? <Loading /> : partners.length === 0 && <Card><Strong>Welcome!</Strong><Muted>Sell flowers as a shop or independent florist, or deliver as a courier.</Muted></Card>}
      {partners?.map((partner) => (
        <Card key={partner.id} onPress={() => navigation.push({ name: 'partner', partnerId: partner.id })}>
          <Pill label={partner.verificationStatus} />
          <Strong>{partner.displayName}</Strong>
          <Muted>{partner.kind === 'SHOP' ? 'Flower shop' : partner.kind === 'FREELANCE_SELLER' ? 'Independent florist' : 'Courier'} · {STATUS_HELP[partner.verificationStatus]}</Muted>
        </Card>
      ))}
      {seller && (
        <Card>
          <Strong>{seller.displayName}</Strong>
          <View style={{ gap: 8 }}>
            <Button title="Orders" onPress={() => navigation.push({ name: 'sellerOrders' })} />
            <Button kind="secondary" title="Custom bouquet requests" onPress={() => navigation.push({ name: 'requestFeed' })} />
            <Button kind="secondary" title="Products" onPress={() => navigation.push({ name: 'products' })} />
            <Button kind="secondary" title="Earnings" onPress={() => navigation.push({ name: 'earnings', mode: 'seller' })} />
          </View>
        </Card>
      )}
      {courier && <CourierPanel courier={courier} onChange={reload} />}
      <Button kind="secondary" title="Apply as shop, florist or courier" onPress={() => navigation.push({ name: 'apply' })} />
    </Screen>
  );
}

function CourierPanel({ courier, onChange }: { courier: PartnerAccount; onChange: () => Promise<void> }) {
  const navigation = useNavigation();
  return (
    <Card>
      <Strong>Courier · {courier.displayName}</Strong>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body>{courier.courierAvailable ? 'Available for deliveries' : 'Offline'}</Body>
        <Switch
          value={courier.courierAvailable}
          onValueChange={(available) => void attempt(async () => { await api.request('partner/courier/availability', { method: 'POST', body: { available } }); await onChange(); })}
        />
      </View>
      <Button title="Delivery jobs" onPress={() => navigation.push({ name: 'courierJobs' })} />
      <Button kind="secondary" title="Earnings" onPress={() => navigation.push({ name: 'earnings', mode: 'courier' })} />
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
      if (permission.status !== 'granted') throw new Error('Location is needed to know which area you serve.');
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
    <Screen title="Become a partner" onBack={navigation.back}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['FREELANCE_SELLER', 'SHOP', 'COURIER'] as const).map((value) => (
          <Button key={value} kind={kind === value ? 'primary' : 'secondary'} title={value === 'SHOP' ? 'Shop' : value === 'COURIER' ? 'Courier' : 'Florist'} onPress={() => setKind(value)} />
        ))}
      </View>
      <Field label={kind === 'COURIER' ? 'Your name' : 'Shop / brand name'} value={form.displayName} onChangeText={set('displayName')} />
      {kind === 'SHOP' && <Field label="Company legal name" value={form.legalName} onChangeText={set('legalName')} />}
      {kind === 'SHOP' && <Field label="VAT number (e.g. IT12345678901)" value={form.vatNumber} onChangeText={set('vatNumber')} autoCapitalize="characters" />}
      <Field label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      {kind !== 'COURIER' && <Field label="Address (where couriers pick up)" value={form.address} onChangeText={set('address')} />}
      <Field label="About you (optional)" value={form.description} onChangeText={set('description')} multiline />
      <Muted>Your current location sets the area you serve.</Muted>
      <Button title="Save application" onPress={submit} />
    </Screen>
  );
}

export function PartnerScreen({ partnerId }: { partnerId: string }) {
  const navigation = useNavigation();
  const [partner, setPartner] = useState<PartnerAccount | null>(null);
  useEffect(() => {
    void attempt(async () => setPartner(await api.request<PartnerAccount>(`partner/accounts/${partnerId}`)));
  }, [partnerId]);
  if (!partner) return <Screen title="Partner" onBack={navigation.back}><Loading /></Screen>;
  return (
    <Screen title={partner.displayName} onBack={navigation.back}>
      <Pill label={partner.verificationStatus} />
      <Body>{STATUS_HELP[partner.verificationStatus]}</Body>
      {partner.verificationNotes && <Card><Strong>Notes from Flower Man</Strong><Body>{partner.verificationNotes}</Body></Card>}
      <Muted>{partner.phone} · {partner.address ?? 'no address'}</Muted>
      {(partner.verificationStatus === 'DRAFT' || partner.verificationStatus === 'REJECTED') && partner.role === 'OWNER' && (
        <Button title="Submit for verification" onPress={() => attempt(async () => setPartner(await api.request<PartnerAccount>(`partner/accounts/${partner.id}/submit`, { method: 'POST' })))} />
      )}
    </Screen>
  );
}
