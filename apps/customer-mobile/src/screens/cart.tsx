import { formatPrice } from '@flower-man/api-client';
import type { Cart, CheckoutResponse } from '@flower-man/contracts';
import { useStripe } from '@stripe/stripe-react-native';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { api } from '../api';
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
    <Screen title="Your cart" onBack={navigation.back}>
      {!cart ? <Loading /> : cart.items.length === 0 ? <Muted>Your cart is empty.</Muted> : null}
      {cart?.items.map((item) => (
        <Card key={item.productId}>
          <Strong>{item.name}</Strong>
          {!item.available && <Muted>No longer available: please remove it.</Muted>}
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
          <Strong>Subtotal {formatPrice(cart.subtotalMinor)}</Strong>
          <Muted>Delivery fee and final total are confirmed at checkout.</Muted>
          <Button title="Checkout" onPress={() => navigation.push({ name: 'checkout' })} />
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
    <Screen title="Delivery details" onBack={navigation.back}>
      <Field label="Recipient name" value={recipientName} onChangeText={setRecipientName} />
      <Field label="Recipient phone" value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad" />
      <Field label="Delivery address" value={deliveryAddress} onChangeText={setDeliveryAddress} placeholder="Via, number, CAP Bergamo" />
      <Muted>The delivery position uses your current location; put the exact address above.</Muted>
      <Field label="Notes for the courier (optional)" value={deliveryNotes} onChangeText={setDeliveryNotes} />
      <Field label="Gift message (optional)" value={giftMessage} onChangeText={setGiftMessage} multiline />
      <Button title={busy ? 'Placing order…' : 'Continue to payment'} onPress={placeOrder} disabled={busy} />
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
      if (!checkout.payment.clientSecret) throw new Error('Payment is not ready. Please try again.');
      setBusy(true);
      try {
        const init = await initPaymentSheet({ merchantDisplayName: 'Flower Man', paymentIntentClientSecret: checkout.payment.clientSecret });
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
    <Screen title="Payment">
      <Card>
        <Strong>Order #{checkout.order.orderNumber}</Strong>
        <Muted>{checkout.order.sellerName}</Muted>
        <Body>Flowers {formatPrice(checkout.order.subtotalMinor)}</Body>
        <Body>Delivery {formatPrice(checkout.order.deliveryFeeMinor)}</Body>
        <Strong>Total {formatPrice(checkout.order.totalMinor)}</Strong>
      </Card>
      {checkout.payment.provider === 'STRIPE' ? (
        <Button title={busy ? 'Opening payment…' : `Pay ${formatPrice(checkout.payment.amountMinor)}`} onPress={payWithStripe} disabled={busy} />
      ) : __DEV__ ? (
        <Button title="Pay (development test payment)" onPress={simulate} />
      ) : (
        <Muted>Payments are not available right now.</Muted>
      )}
      <Button kind="secondary" title="Pay later" onPress={done} />
    </Screen>
  );
}
