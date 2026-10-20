import { formatPrice } from '@flower-man/api-client';
import type { OrderDetail, OrderSummary, PaymentInstructions } from '@flower-man/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { api } from '../api';
import { useNavigation } from '../navigation';
import { attempt, Body, Button, Card, Loading, Muted, Pill, Screen, Strong } from '../ui';

const LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  PAID: 'Paid · waiting for the florist',
  CONFIRMED: 'Confirmed by the florist',
  PREPARING: 'Being prepared',
  READY_FOR_PICKUP: 'Ready · waiting for a courier',
  COURIER_ASSIGNED: 'Courier on the way to the florist',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'On the way to you',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export function OrdersScreen() {
  const navigation = useNavigation();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  useEffect(() => {
    void attempt(async () => setOrders((await api.request<{ items: OrderSummary[] }>('orders')).items));
  }, []);
  return (
    <Screen title="My orders">
      {!orders ? <Loading /> : orders.length === 0 && <Muted>No orders yet.</Muted>}
      {orders?.map((order) => (
        <Card key={order.id} onPress={() => navigation.push({ name: 'order', orderId: order.id })}>
          <Strong>#{order.orderNumber} · {order.sellerName}</Strong>
          <Muted>{LABELS[order.status] ?? order.status}</Muted>
          <Body>{formatPrice(order.totalMinor)} → {order.recipientName}</Body>
        </Card>
      ))}
    </Screen>
  );
}

/** Order detail with live tracking: refreshes every 10 seconds while the order is active. */
export function OrderScreen({ orderId }: { orderId: string }) {
  const navigation = useNavigation();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const load = useCallback(async () => setOrder(await api.request<OrderDetail>(`orders/${orderId}`)), [orderId]);

  useEffect(() => {
    void attempt(load);
    const timer = setInterval(() => void load().catch(() => undefined), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  if (!order) return <Screen title="Order" onBack={navigation.back}><Loading /></Screen>;
  const delivery = order.delivery;
  const cancellable = order.status === 'PENDING_PAYMENT' || order.status === 'PAID';

  return (
    <Screen title={`Order #${order.orderNumber}`} onBack={navigation.back}>
      <Card>
        <Pill label={order.status} />
        <Strong>{LABELS[order.status] ?? order.status}</Strong>
        <Muted>{order.sellerName}</Muted>
        {order.items.map((item) => <Body key={item.name}>{item.quantity} × {item.name} · {formatPrice(item.lineTotalMinor)}</Body>)}
        <Body>Delivery {formatPrice(order.deliveryFeeMinor)}</Body>
        <Strong>Total {formatPrice(order.totalMinor)}</Strong>
      </Card>
      {delivery && (
        <Card>
          <Strong>Delivery</Strong>
          <Body>Courier: {delivery.courierName ?? 'being assigned'}</Body>
          {delivery.etaAt && order.status === 'IN_TRANSIT' && <Body>Arriving around {new Date(delivery.etaAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</Body>}
          {delivery.lastLocation && !delivery.deliveredAt && (
            <>
              <Muted>Last update {delivery.lastLocationAt ? new Date(delivery.lastLocationAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}</Muted>
              <Button
                kind="secondary"
                title="See courier on the map"
                onPress={() => {
                  const { latitude, longitude } = delivery.lastLocation!;
                  void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
                }}
              />
            </>
          )}
          {delivery.arrivedAt && !delivery.deliveredAt && <Strong>Your courier has arrived!</Strong>}
        </Card>
      )}
      <Card>
        <Strong>History</Strong>
        {order.history.map((entry) => <Muted key={entry.at + entry.to}>{new Date(entry.at).toLocaleString('it-IT')} · {LABELS[entry.to] ?? entry.to}</Muted>)}
      </Card>
      <Muted>To {order.recipientName}, {order.deliveryAddress}</Muted>
      {order.status === 'PENDING_PAYMENT' && (
        <Button
          title="Pay now"
          onPress={() =>
            attempt(async () => {
              const payment = await api.request<PaymentInstructions>(`orders/${order.id}/pay`, { method: 'POST' });
              navigation.push({ name: 'payment', checkout: { order, payment } });
            })
          }
        />
      )}
      {cancellable && (
        <View>
          <Button
            kind="danger"
            title="Cancel order"
            onPress={() =>
              Alert.alert('Cancel order', order.status === 'PAID' ? 'You will be refunded in full.' : 'Cancel this order?', [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Cancel order', style: 'destructive', onPress: () => void attempt(async () => setOrder(await api.request<OrderDetail>(`orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'Cancelled by customer in the app' } }))) },
              ])
            }
          />
        </View>
      )}
    </Screen>
  );
}
