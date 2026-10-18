import { formatPrice } from '@flower-man/api-client';
import { type CustomOffer, type CustomRequestView, type OrderDetail, type OrderSummary, PRODUCT_CATEGORIES, type Product } from '@flower-man/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { api } from '../api';
import { useNavigation } from '../navigation';
import { attempt, Body, Button, Card, Field, Loading, Muted, Pill, Screen, Strong } from '../ui';

const FILTERS = ['PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERED'] as const;

export function SellerOrdersScreen() {
  const navigation = useNavigation();
  const [status, setStatus] = useState<string>('PAID');
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const load = useCallback(async () => setOrders((await api.request<{ items: OrderSummary[] }>(`seller/orders?status=${status}`)).items), [status]);
  useEffect(() => {
    void attempt(load);
    const timer = setInterval(() => void load().catch(() => undefined), 20_000);
    return () => clearInterval(timer);
  }, [load]);
  return (
    <Screen title="Orders" onBack={navigation.back}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {FILTERS.map((value) => <Button key={value} kind={status === value ? 'primary' : 'secondary'} title={value === 'PAID' ? 'New' : value.replaceAll('_', ' ').toLowerCase()} onPress={() => setStatus(value)} />)}
      </View>
      {!orders ? <Loading /> : orders.length === 0 && <Muted>No orders here.</Muted>}
      {orders?.map((order) => (
        <Card key={order.id} onPress={() => navigation.push({ name: 'sellerOrder', orderId: order.id })}>
          <Strong>#{order.orderNumber} · {formatPrice(order.subtotalMinor)}</Strong>
          <Muted>{order.recipientName} · {order.requestedDeliveryAt ? new Date(order.requestedDeliveryAt).toLocaleString('it-IT') : 'as soon as possible'}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

export function SellerOrderScreen({ orderId }: { orderId: string }) {
  const navigation = useNavigation();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  useEffect(() => {
    void attempt(async () => setOrder(await api.request<OrderDetail>(`seller/orders/${orderId}`)));
  }, [orderId]);
  if (!order) return <Screen title="Order" onBack={navigation.back}><Loading /></Screen>;
  const step = (action: 'accept' | 'prepare' | 'ready') => attempt(async () => setOrder(await api.request<OrderDetail>(`seller/orders/${order.id}/${action}`, { method: 'POST' })));
  const reject = () =>
    Alert.alert('Reject order', 'The customer will be refunded in full.', [
      { text: 'Back', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => void attempt(async () => setOrder(await api.request<OrderDetail>(`seller/orders/${order.id}/reject`, { method: 'POST', body: { reason: 'Rejected by the florist' } }))) },
    ]);
  return (
    <Screen title={`Order #${order.orderNumber}`} onBack={navigation.back}>
      <Pill label={order.status} />
      <Card>
        {order.items.map((item) => <Body key={item.name}>{item.quantity} × {item.name}</Body>)}
        <Strong>{formatPrice(order.subtotalMinor)}</Strong>
        {order.giftMessage && <Body>Card message: “{order.giftMessage}”</Body>}
        {order.deliveryNotes && <Muted>Notes: {order.deliveryNotes}</Muted>}
      </Card>
      <Muted>For {order.recipientName}, {order.deliveryAddress}</Muted>
      {order.status === 'PAID' && <Button title="Accept order" onPress={() => step('accept')} />}
      {order.status === 'CONFIRMED' && <Button title="Start preparing" onPress={() => step('prepare')} />}
      {order.status === 'PREPARING' && <Button title="Ready for pickup" onPress={() => step('ready')} />}
      {(order.status === 'PAID' || order.status === 'CONFIRMED') && <Button kind="danger" title="Reject" onPress={reject} />}
      {order.delivery && <Muted>Courier: {order.delivery.courierName ?? 'being assigned'} · {order.delivery.status}</Muted>}
    </Screen>
  );
}

export function ProductsScreen() {
  const navigation = useNavigation();
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    void attempt(async () => setProducts((await api.request<{ items: Product[] }>('seller/products')).items));
  }, []);
  return (
    <Screen title="Products" onBack={navigation.back} right={<Button kind="secondary" title="Add" onPress={() => navigation.push({ name: 'productEdit', product: null })} />}>
      {!products ? <Loading /> : products.length === 0 && <Muted>Add your first bouquet.</Muted>}
      {products?.map((product) => (
        <Card key={product.id} onPress={() => navigation.push({ name: 'productEdit', product })}>
          <Strong>{product.name} · {formatPrice(product.priceMinor)}</Strong>
          <Muted>{product.available ? 'Available' : 'Hidden'} · {product.stock === null ? 'made to order' : `${product.stock} in stock`}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

export function ProductEditScreen({ product }: { product: Product | null }) {
  const navigation = useNavigation();
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [category, setCategory] = useState<string>(product?.category ?? 'BOUQUET');
  const [price, setPrice] = useState(product ? (product.priceMinor / 100).toFixed(2) : '');
  const [stock, setStock] = useState(product?.stock === null || product?.stock === undefined ? '' : String(product.stock));
  const [available, setAvailable] = useState(product?.available ?? true);

  const save = () =>
    attempt(async () => {
      const body = {
        name,
        ...(description ? { description } : {}),
        category,
        priceMinor: Math.round(Number(price.replace(',', '.')) * 100),
        available,
        stock: stock.trim() === '' ? null : Number(stock),
      };
      if (product) await api.request(`seller/products/${product.id}`, { method: 'PATCH', body });
      else await api.request('seller/products', { method: 'POST', body });
      navigation.reset({ name: 'products' });
    });

  return (
    <Screen title={product ? 'Edit product' : 'New product'} onBack={navigation.back}>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Description" value={description} onChangeText={setDescription} multiline />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {PRODUCT_CATEGORIES.map((value) => <Button key={value} kind={category === value ? 'primary' : 'secondary'} title={value.toLowerCase()} onPress={() => setCategory(value)} />)}
      </View>
      <Field label="Price (€)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      <Field label="Stock (empty = made to order)" value={stock} onChangeText={setStock} keyboardType="number-pad" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body>Visible to customers</Body>
        <Switch value={available} onValueChange={setAvailable} />
      </View>
      <Button title="Save" onPress={save} />
      {product && <Button kind="danger" title="Archive" onPress={() => attempt(async () => { await api.request(`seller/products/${product.id}`, { method: 'DELETE' }); navigation.reset({ name: 'products' }); })} />}
    </Screen>
  );
}

type FeedItem = CustomRequestView & { myOffer: CustomOffer | null };

export function RequestFeedScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  useEffect(() => {
    void attempt(async () => setItems((await api.request<{ items: FeedItem[] }>('seller/custom-requests')).items));
  }, []);
  return (
    <Screen title="Custom requests" onBack={navigation.back}>
      {!items ? <Loading /> : items.length === 0 && <Muted>No open requests in your area right now.</Muted>}
      {items?.map((request) => (
        <Card key={request.id} onPress={() => navigation.push({ name: 'offer', request })}>
          <Strong>{request.occasion} · budget {formatPrice(request.budgetMinor)}</Strong>
          <Muted>{[request.flowerPreferences, request.colourPreferences].filter(Boolean).join(' · ')}</Muted>
          <Muted>{new Date(request.deliveryWindowStart).toLocaleString('it-IT')}</Muted>
          {request.myOffer && <Pill label={`My offer ${formatPrice(request.myOffer.priceMinor)}`} />}
        </Card>
      ))}
    </Screen>
  );
}

export function OfferScreen({ request }: { request: FeedItem }) {
  const navigation = useNavigation();
  const [description, setDescription] = useState(request.myOffer?.description ?? '');
  const [price, setPrice] = useState(request.myOffer ? (request.myOffer.priceMinor / 100).toFixed(2) : '');
  const [hours, setHours] = useState('2');
  const [notes, setNotes] = useState(request.myOffer?.notes ?? '');
  return (
    <Screen title={request.occasion} onBack={navigation.back}>
      <Card>
        <Body>Budget {formatPrice(request.budgetMinor)}</Body>
        {request.flowerPreferences && <Body>Flowers: {request.flowerPreferences}</Body>}
        {request.colourPreferences && <Body>Colours: {request.colourPreferences}</Body>}
        {request.notes && <Body>Notes: {request.notes}</Body>}
        <Muted>Deliver between {new Date(request.deliveryWindowStart).toLocaleString('it-IT')} and {new Date(request.deliveryWindowEnd).toLocaleTimeString('it-IT')}</Muted>
      </Card>
      <Field label="Your proposal" value={description} onChangeText={setDescription} multiline />
      <Field label="Price (€)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      <Field label="Preparation time (hours)" value={hours} onChangeText={setHours} keyboardType="decimal-pad" />
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} />
      <Button
        title={request.myOffer ? 'Update offer' : 'Send offer'}
        onPress={() =>
          attempt(async () => {
            await api.request(`seller/custom-requests/${request.id}/offer`, {
              method: 'POST',
              body: {
                description,
                priceMinor: Math.round(Number(price.replace(',', '.')) * 100),
                preparationMinutes: Math.max(10, Math.round(Number(hours.replace(',', '.')) * 60)),
                availableFrom: new Date(Date.now() + 5 * 60_000).toISOString(),
                ...(notes ? { notes } : {}),
              },
            });
            navigation.reset({ name: 'requestFeed' });
          })
        }
      />
      {request.myOffer?.status === 'SUBMITTED' && <Button kind="danger" title="Withdraw offer" onPress={() => attempt(async () => { await api.request(`seller/custom-requests/${request.id}/offer/withdraw`, { method: 'POST' }); navigation.reset({ name: 'requestFeed' }); })} />}
    </Screen>
  );
}
