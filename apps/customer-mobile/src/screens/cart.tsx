import { formatPrice } from '@flower-man/api-client';
import type { Cart, CheckoutResponse } from '@flower-man/contracts';
import { useStripe } from '@stripe/stripe-react-native';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { api } from '../api';
import { t } from '../i18n';
import { currentLocation } from '../location';
import { useNavigation } from '../navigation';
import { attempt, Body, Button, Card, Field, Loading, Muted, Screen, Strong } from '../ui';

export function CartScreen() {
  const navigation = useNavigation();
  const [cart, setCart] = useState<Cart | null>(null);
  const load = useCallback(() => attempt(async () => setCart(await api.request<Cart>('cart'))), []);
  useEffect(() => {
    void load();
  }, [load]);

  const change = (productId: string, quantity: number) =>
    attempt(async () => {
      setCart(quantity === 0 ? await api.request<Cart>(`cart/items/${productId}`, { method: 'DELETE' }) : await api.request<Cart>('cart/items', { method: 'PUT', body: { productId, quantity } }));
    });

  return (
    <Screen title={t('cartTitle')} onBack={navigation.back}>
      {!cart ? <Loading /> : cart.items.length === 0 ? <Muted>{t('cartEmpty')}</Muted> : null}
      {cart?.items.map((item) => (
        <Card key={item.productId}>
          <Strong>{item.name}</Strong>
          {!item.available && <Muted>{t('cartUnavailable')}</Muted>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Button kind="secondary" title="−" onPress={() => change(item.productId, item.quantity - 1)} />
            <Body>{item.quantity}</Body>
            <Button kind="secondary" title="+" onPress={() => change(item.productId, item.quantity + 1)} />
            <Body>{formatPrice(item.lineTotalMinor)}</Body>
          </View>
        </Card>
      ))}
      {cart && cart.items.length > 0 && (
        <>
          <Strong>{t('cartSubtotal', { price: formatPrice(cart.subtotalMinor) })}</Strong>
          <Muted>{t('cartFeeNote')}</Muted>
          <Button title={t('cartCheckout')} onPress={() => navigation.push({ name: 'checkout' })} />
        </>
      )}
    </Screen>
  );
}

export function CheckoutScreen() {
  const navigation = useNavigation();
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('+39');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const placeOrder = () =>
    attempt(async () => {
      setBusy(true);
      try {
        const location = await currentLocation();
        const checkout = await api.request<CheckoutResponse>('checkout', {
          method: 'POST',
          body: {
            recipientName,
            recipientPhone,
            deliveryAddress,
            deliveryLocation: { latitude: location.latitude, longitude: location.longitude },
            ...(deliveryNotes ? { deliveryNotes } : {}),
            ...(giftMessage ? { giftMessage } : {}),
          },
        });
        navigation.reset({ name: 'payment', checkout });
      } finally {
        setBusy(false);
      }
    });

  return (
    <Screen title={t('checkoutTitle')} onBack={navigation.back}>
      <Field label={t('checkoutRecipientName')} value={recipientName} onChangeText={setRecipientName} />
      <Field label={t('checkoutRecipientPhone')} value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad" />
      <Field label={t('checkoutAddress')} value={deliveryAddress} onChangeText={setDeliveryAddress} placeholder={t('checkoutAddressPlaceholder')} />
      <Muted>{t('checkoutLocationNote')}</Muted>
      <Field label={t('checkoutNotes')} value={deliveryNotes} onChangeText={setDeliveryNotes} />
      <Field label={t('checkoutGift')} value={giftMessage} onChangeText={setGiftMessage} multiline />
      <Button title={busy ? t('checkoutPlacing') : t('checkoutContinue')} onPress={placeOrder} disabled={busy} />
    </Screen>
  );
}

/** Payment: Stripe Payment Sheet in real builds; a test button only in development with the simulated provider. */
export function PaymentScreen({ checkout }: { checkout: CheckoutResponse }) {
  const navigation = useNavigation();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [busy, setBusy] = useState(false);
  const done = () => navigation.reset({ name: 'order', orderId: checkout.order.id });

  const payWithStripe = () =>
    attempt(async () => {
      if (!checkout.payment.clientSecret) throw new Error(t('paymentNotReady'));
      setBusy(true);
      try {
        const init = await initPaymentSheet({ merchantDisplayName: t('appName'), paymentIntentClientSecret: checkout.payment.clientSecret });
        if (init.error) throw new Error(init.error.message);
        const result = await presentPaymentSheet();
        if (result.error) {
          if (result.error.code !== 'Canceled') throw new Error(result.error.message);
          return;
        }
        // The order turns PAID when Stripe's webhook reaches the API; the order screen refreshes itself.
        done();
      } finally {
        setBusy(false);
      }
    });

  const simulate = () =>
    attempt(async () => {
      await api.request(`payments/simulated/${checkout.payment.reference}/succeed`, { method: 'POST', auth: false });
      done();
    });

  return (
    <Screen title={t('paymentTitle')}>
      <Card>
        <Strong>{t('paymentOrder', { number: checkout.order.orderNumber })}</Strong>
        <Muted>{checkout.order.sellerName}</Muted>
        <Body>{t('paymentFlowers', { price: formatPrice(checkout.order.subtotalMinor) })}</Body>
        <Body>{t('paymentDelivery', { price: formatPrice(checkout.order.deliveryFeeMinor) })}</Body>
        <Strong>{t('paymentTotal', { price: formatPrice(checkout.order.totalMinor) })}</Strong>
      </Card>
      {checkout.payment.provider === 'STRIPE' ? (
        <Button title={busy ? t('paymentOpening') : t('paymentPay', { price: formatPrice(checkout.payment.amountMinor) })} onPress={payWithStripe} disabled={busy} />
      ) : __DEV__ ? (
        <Button title={t('paymentTest')} onPress={simulate} />
      ) : (
        <Muted>{t('paymentUnavailable')}</Muted>
      )}
      <Button kind="secondary" title={t('paymentLater')} onPress={done} />
    </Screen>
  );
}
