import { formatPrice, productImageUri } from '@flower-man/api-client';
import { type CustomOffer, type CustomRequestView, LOW_STOCK_THRESHOLD, type OrderDetail, type OrderSummary, PRODUCT_CATEGORIES, type Product, type PublicReview, type Rating } from '@flower-man/contracts';
import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Alert, Image, Switch, View } from 'react-native';

import { api } from '../api';
import { CATEGORY_LABELS, DELIVERY_STATUS_LABELS, locale, ORDER_STATUS_LABELS, t } from '../i18n';
import { useNavigation } from '../navigation';
import { ratingText } from './home';
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
    <Screen title={t('ordersTitle')} onBack={navigation.back}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {FILTERS.map((value) => <Button key={value} kind={status === value ? 'primary' : 'secondary'} title={value === 'PAID' ? t('ordersFilterNew') : ORDER_STATUS_LABELS[value]} onPress={() => setStatus(value)} />)}
      </View>
      {!orders ? <Loading /> : orders.length === 0 && <Muted>{t('ordersEmpty')}</Muted>}
      {orders?.map((order) => (
        <Card key={order.id} onPress={() => navigation.push({ name: 'sellerOrder', orderId: order.id })}>
          <Strong>#{order.orderNumber} · {formatPrice(order.subtotalMinor)}</Strong>
          <Muted>{order.recipientName} · {order.requestedDeliveryAt ? new Date(order.requestedDeliveryAt).toLocaleString(locale) : t('ordersAsap')}</Muted>
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
  if (!order) return <Screen title={t('orderFallbackTitle')} onBack={navigation.back}><Loading /></Screen>;
  const step = (action: 'accept' | 'prepare' | 'ready') => attempt(async () => setOrder(await api.request<OrderDetail>(`seller/orders/${order.id}/${action}`, { method: 'POST' })));
  const reject = () =>
    Alert.alert(t('orderRejectTitle'), t('orderRejectBody'), [
      { text: t('orderRejectCancel'), style: 'cancel' },
      { text: t('orderReject'), style: 'destructive', onPress: () => void attempt(async () => setOrder(await api.request<OrderDetail>(`seller/orders/${order.id}/reject`, { method: 'POST', body: { reason: t('orderRejectReason') } }))) },
    ]);
  return (
    <Screen title={t('orderTitle', { number: order.orderNumber })} onBack={navigation.back}>
      <Pill label={ORDER_STATUS_LABELS[order.status]} />
      <Card>
        {order.items.map((item) => <Body key={item.name}>{item.quantity} × {item.name}</Body>)}
        <Strong>{formatPrice(order.subtotalMinor)}</Strong>
        {order.giftMessage && <Body>{t('orderCardMessage', { message: order.giftMessage })}</Body>}
        {order.deliveryNotes && <Muted>{t('orderNotes', { notes: order.deliveryNotes })}</Muted>}
      </Card>
      <Muted>{t('orderFor', { name: order.recipientName, address: order.deliveryAddress })}</Muted>
      {order.status === 'PAID' && <Button title={t('orderAccept')} onPress={() => step('accept')} />}
      {order.status === 'CONFIRMED' && <Button title={t('orderPrepare')} onPress={() => step('prepare')} />}
      {order.status === 'PREPARING' && <Button title={t('orderReady')} onPress={() => step('ready')} />}
      {(order.status === 'PAID' || order.status === 'CONFIRMED') && <Button kind="danger" title={t('orderReject')} onPress={reject} />}
      {order.delivery && <Muted>{t('orderCourier', { name: order.delivery.courierName ?? t('orderCourierPending'), status: DELIVERY_STATUS_LABELS[order.delivery.status] })}</Muted>}
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
    <Screen title={t('productsTitle')} onBack={navigation.back} right={<Button kind="secondary" title={t('productsAdd')} onPress={() => navigation.push({ name: 'productEdit', product: null })} />}>
      {!products ? <Loading /> : products.length === 0 && <Muted>{t('productsEmpty')}</Muted>}
      {products?.map((product) => (
        <Card key={product.id} onPress={() => navigation.push({ name: 'productEdit', product })}>
          {productImageUri(api, product) && <Image source={{ uri: productImageUri(api, product) as string }} style={{ height: 120, borderRadius: 8 }} resizeMode="cover" />}
          <Strong>{product.name} · {formatPrice(product.priceMinor)}</Strong>
          {product.stock !== null && product.stock <= LOW_STOCK_THRESHOLD && <Pill label={product.stock === 0 ? t('productSoldOut') : t('productLowStock')} />}
          <Muted>{CATEGORY_LABELS[product.category]} · {product.available ? t('productAvailable') : t('productHidden')} · {product.stock === null ? t('productMadeToOrder') : t('productInStock', { count: product.stock })}</Muted>
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
      if (product) {
        await api.request(`seller/products/${product.id}`, { method: 'PATCH', body });
        navigation.reset({ name: 'products' });
      } else {
        // New products open again in edit mode, where the photo can be added.
        const created = await api.request<Product>('seller/products', { method: 'POST', body });
        navigation.reset({ name: 'products' });
        navigation.push({ name: 'productEdit', product: created });
      }
    });

  return (
    <Screen title={product ? t('productEditTitle') : t('productNewTitle')} onBack={navigation.back}>
      <Field label={t('productName')} value={name} onChangeText={setName} />
      <Field label={t('productDescription')} value={description} onChangeText={setDescription} multiline />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {PRODUCT_CATEGORIES.map((value) => <Button key={value} kind={category === value ? 'primary' : 'secondary'} title={CATEGORY_LABELS[value]} onPress={() => setCategory(value)} />)}
      </View>
      <Field label={t('priceEuro')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      <Field label={t('productStock')} value={stock} onChangeText={setStock} keyboardType="number-pad" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body>{t('productVisible')}</Body>
        <Switch value={available} onValueChange={setAvailable} />
      </View>
      {product && <ProductPhotoEditor product={product} />}
      <Button title={t('save')} onPress={save} />
      {product && <Button kind="danger" title={t('productArchive')} onPress={() => attempt(async () => { await api.request(`seller/products/${product.id}`, { method: 'DELETE' }); navigation.reset({ name: 'products' }); })} />}
    </Screen>
  );
}

/** Photo from the camera or the gallery, cropped square and compressed before upload (max 5 MB on the API). */
/** A square, compressed photo from the camera or the gallery (null when cancelled), ready to upload. */
async function choosePhoto(source: 'camera' | 'gallery'): Promise<{ data: Blob; contentType: string } | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, exif: false };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error(t('photoCameraNeeded'));
  }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return { data: await (await fetch(asset.uri)).blob(), contentType: asset.mimeType ?? 'image/jpeg' };
}

/** Photo card with camera/gallery buttons; `upload` sends the bytes and `image` shows the current photo. */
function PhotoEditor({ image, hint, upload }: { image: ReactNode; hint: string; upload: (photo: { data: Blob; contentType: string }) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const pick = (source: 'camera' | 'gallery') =>
    attempt(async () => {
      const photo = await choosePhoto(source);
      if (!photo) return;
      setBusy(true);
      try {
        await upload(photo);
      } finally {
        setBusy(false);
      }
    });
  return (
    <Card>
      <Strong>{t('photoTitle')}</Strong>
      {image ?? <Muted>{hint}</Muted>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind="secondary" title={t('photoTake')} disabled={busy} onPress={() => pick('camera')} />
        <Button kind="secondary" title={t('photoGallery')} disabled={busy} onPress={() => pick('gallery')} />
      </View>
      {busy && <Muted>{t('photoUploading')}</Muted>}
    </Card>
  );
}

function ProductPhotoEditor({ product }: { product: Product }) {
  const [current, setCurrent] = useState(product);
  const uri = productImageUri(api, current);
  return (
    <PhotoEditor
      hint={t('photoHint')}
      image={uri ? <Image source={{ uri }} style={{ height: 200, borderRadius: 8 }} resizeMode="cover" /> : null}
      upload={async (photo) => setCurrent(await api.request<Product>(`seller/products/${product.id}/image`, { method: 'PUT', binary: photo }))}
    />
  );
}

/** The offer photo is private (customer + this seller), so it is loaded with the signed-in token. */
function OfferPhotoEditor({ requestId, offer }: { requestId: string; offer: CustomOffer }) {
  const [current, setCurrent] = useState(offer);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    void api.accessToken().then(setToken);
  }, [current.imagePath]);
  return (
    <PhotoEditor
      hint={t('offerPhotoHint')}
      image={current.imagePath && token ? <Image source={{ uri: `${api.baseUrl}/${current.imagePath}`, headers: { Authorization: `Bearer ${token}` } }} style={{ height: 200, borderRadius: 8 }} resizeMode="cover" /> : null}
      upload={async (photo) => setCurrent(await api.request<CustomOffer>(`seller/custom-requests/${requestId}/offer/image`, { method: 'PUT', binary: photo }))}
    />
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
    <Screen title={t('requestsTitle')} onBack={navigation.back}>
      {!items ? <Loading /> : items.length === 0 && <Muted>{t('requestsEmpty')}</Muted>}
      {items?.map((request) => (
        <Card key={request.id} onPress={() => navigation.push({ name: 'offer', request })}>
          <Strong>{t('requestsBudget', { occasion: request.occasion, price: formatPrice(request.budgetMinor) })}</Strong>
          <Muted>{[request.flowerPreferences, request.colourPreferences].filter(Boolean).join(' · ')}</Muted>
          <Muted>{new Date(request.deliveryWindowStart).toLocaleString(locale)}</Muted>
          {request.myOffer && <Pill label={t('requestsMyOffer', { price: formatPrice(request.myOffer.priceMinor) })} />}
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
        <Body>{t('offerBudget', { price: formatPrice(request.budgetMinor) })}</Body>
        {request.flowerPreferences && <Body>{t('offerFlowers', { value: request.flowerPreferences })}</Body>}
        {request.colourPreferences && <Body>{t('offerColours', { value: request.colourPreferences })}</Body>}
        {request.notes && <Body>{t('offerNotes', { value: request.notes })}</Body>}
        <Muted>{t('offerWindow', { start: new Date(request.deliveryWindowStart).toLocaleString(locale), end: new Date(request.deliveryWindowEnd).toLocaleTimeString(locale) })}</Muted>
      </Card>
      <Field label={t('offerProposal')} value={description} onChangeText={setDescription} multiline />
      <Field label={t('priceEuro')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      <Field label={t('offerPreparation')} value={hours} onChangeText={setHours} keyboardType="decimal-pad" />
      <Field label={t('notesOptional')} value={notes} onChangeText={setNotes} />
      <Button
        title={request.myOffer ? t('offerUpdate') : t('offerSend')}
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
      {request.myOffer?.status === 'SUBMITTED' && <OfferPhotoEditor requestId={request.id} offer={request.myOffer} />}
      {request.myOffer?.status === 'SUBMITTED' && <Button kind="danger" title={t('offerWithdraw')} onPress={() => attempt(async () => { await api.request(`seller/custom-requests/${request.id}/offer/withdraw`, { method: 'POST' }); navigation.reset({ name: 'requestFeed' }); })} />}
    </Screen>
  );
}

export function ReviewsScreen() {
  const navigation = useNavigation();
  const [data, setData] = useState<{ rating: Rating | null; items: PublicReview[] } | null>(null);
  useEffect(() => {
    void attempt(async () => setData(await api.request<{ rating: Rating | null; items: PublicReview[] }>('seller/reviews')));
  }, []);
  return (
    <Screen title={t('reviewsTitle')} onBack={navigation.back}>
      {!data ? <Loading /> : <Strong>{ratingText(data.rating)}</Strong>}
      {data?.items.length === 0 && <Muted>{t('reviewsEmpty')}</Muted>}
      {data?.items.map((review) => (
        <Card key={review.createdAt}>
          <Body>{'★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)}</Body>
          {review.comment && <Body>“{review.comment}”</Body>}
          <Muted>{new Date(review.createdAt).toLocaleDateString(locale)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
