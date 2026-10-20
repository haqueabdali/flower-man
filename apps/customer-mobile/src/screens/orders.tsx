import { formatPrice } from '@flower-man/api-client';
import type { OrderDetail, OrderSummary, PaymentInstructions } from '@flower-man/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Linking, View } from 'react-native';

import { api } from '../api';
import { locale, orderStatusLabel, t } from '../i18n';
import { useNavigation } from '../navigation';
import { attempt, Body, Button, Card, Loading, Muted, Screen, Strong } from '../ui';

export function OrdersScreen() {
  const navigation = useNavigation();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  useEffect(() => {
    void attempt(async () => setOrders((await api.request<{ items: OrderSummary[] }>('orders')).items));
  }, []);
  return (
    <Screen title={t('ordersTitle')}>
      {!orders ? <Loading /> : orders.length === 0 && <Muted>{t('ordersEmpty')}</Muted>}
      {orders?.map((order) => (
        <Card key={order.id} onPress={() => navigation.push({ name: 'order', orderId: order.id })}>
          <Strong>#{order.orderNumber} · {order.sellerName}</Strong>
          <Muted>{orderStatusLabel(order.status)}</Muted>
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

  if (!order) return <Screen title={t('orderTitle')} onBack={navigation.back}><Loading /></Screen>;
  const delivery = order.delivery;
  const cancellable = order.status === 'PENDING_PAYMENT' || order.status === 'PAID';

  return (
    <Screen title={t('orderNumberTitle', { number: order.orderNumber })} onBack={navigation.back}>
      <Card>
        <Strong>{orderStatusLabel(order.status)}</Strong>
        <Muted>{order.sellerName}</Muted>
        {order.items.map((item) => <Body key={item.name}>{item.quantity} × {item.name} · {formatPrice(item.lineTotalMinor)}</Body>)}
        <Body>{t('orderDeliveryFee', { price: formatPrice(order.deliveryFeeMinor) })}</Body>
        <Strong>{t('orderTotal', { price: formatPrice(order.totalMinor) })}</Strong>
      </Card>
      {delivery && (
        <Card>
          <Strong>{t('orderDelivery')}</Strong>
          <Body>{t('orderCourier', { name: delivery.courierName ?? t('orderCourierPending') })}</Body>
          {delivery.etaAt && order.status === 'IN_TRANSIT' && <Body>{t('orderEta', { time: new Date(delivery.etaAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}</Body>}
          {delivery.lastLocation && !delivery.deliveredAt && (
            <>
              <Muted>{t('orderLastUpdate', { time: delivery.lastLocationAt ? new Date(delivery.lastLocationAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '' })}</Muted>
              <Button
                kind="secondary"
                title={t('orderMap')}
                onPress={() => {
                  const { latitude, longitude } = delivery.lastLocation!;
                  void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
                }}
              />
            </>
          )}
          {delivery.arrivedAt && !delivery.deliveredAt && <Strong>{t('orderArrived')}</Strong>}
          {delivery.status === 'DELIVERED' && <DeliveryPhoto orderId={order.id} />}
        </Card>
      )}
      <Card>
        <Strong>{t('orderHistory')}</Strong>
        {order.history.map((entry) => <Muted key={entry.at + entry.to}>{new Date(entry.at).toLocaleString(locale)} · {orderStatusLabel(entry.to)}</Muted>)}
      </Card>
      <Muted>{t('orderTo', { name: order.recipientName, address: order.deliveryAddress })}</Muted>
      {order.status === 'PENDING_PAYMENT' && (
        <Button
          title={t('orderPayNow')}
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
            title={t('orderCancel')}
            onPress={() =>
              Alert.alert(t('orderCancel'), order.status === 'PAID' ? t('orderCancelRefund') : t('orderCancelConfirm'), [
                { text: t('orderKeep'), style: 'cancel' },
                { text: t('orderCancel'), style: 'destructive', onPress: () => void attempt(async () => setOrder(await api.request<OrderDetail>(`orders/${order.id}/cancel`, { method: 'POST', body: { reason: 'Cancelled by customer in the app' } }))) },
              ])
            }
          />
        </View>
      )}
    </Screen>
  );
}

/** The courier's proof photo, loaded with the customer's token (the endpoint is private to this order's customer). */
function DeliveryPhoto({ orderId }: { orderId: string }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    void api.accessToken().then(setToken);
  }, []);
  if (!token) return null;
  return (
    <>
      <Muted>{t('orderPhoto')}</Muted>
      <Image
        source={{ uri: `${api.baseUrl}/orders/${orderId}/delivery-proof`, headers: { Authorization: `Bearer ${token}` } }}
        style={{ height: 220, borderRadius: 8 }}
        resizeMode="cover"
        accessibilityLabel={t('orderPhotoLabel')}
      />
    </>
  );
}
