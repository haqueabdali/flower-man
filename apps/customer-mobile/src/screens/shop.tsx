import { formatPrice, productImageUri } from '@flower-man/api-client';
import { type Cart, type FavouriteSeller, PRODUCT_CATEGORIES, type Product, type PublicReview, type Rating, type ZoneCheckResponse } from '@flower-man/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { api } from '../api';
import { categoryLabel, locale, t } from '../i18n';
import { currentLocation } from '../location';
import { useNavigation } from '../navigation';
import { attempt, Body, Button, Card, colors, Loading, Muted, Pill, Screen, stars, Strong } from '../ui';

export function ShopScreen({ emailVerified }: { emailVerified: boolean }) {
  const navigation = useNavigation();
  const [zone, setZone] = useState<ZoneCheckResponse | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [where, setWhere] = useState<{ latitude: number; longitude: number } | null>(null);
  const [favourites, setFavourites] = useState<FavouriteSeller[]>([]);
  const [sellerId, setSellerId] = useState<string | null>(null);

  useEffect(() => {
    void currentLocation().then(setWhere);
    void api.request<{ items: FavouriteSeller[] }>('favourites').then((result) => setFavourites(result.items)).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (!where) return;
    const check = await api.request<ZoneCheckResponse>(`zones/check?lat=${where.latitude}&lng=${where.longitude}`, { auth: false });
    setZone(check);
    if (!check.served) {
      setProducts([]);
      return;
    }
    const query = `catalog/products?lat=${where.latitude}&lng=${where.longitude}${category ? `&category=${category}` : ''}${sellerId ? `&sellerId=${sellerId}` : ''}`;
    setProducts((await api.request<{ items: Product[] }>(query, { auth: false })).items);
  }, [where, category, sellerId]);

  useEffect(() => {
    void attempt(load);
  }, [load]);

  return (
    <Screen title={t('shopTitle')} right={<Pressable onPress={() => navigation.push({ name: 'cart' })}><Text style={{ fontSize: 22 }}>🛒</Text></Pressable>}>
      {!emailVerified && <VerifyEmailBanner />}
      {zone && !zone.served && <Card><Strong>{t('shopNotServedTitle')}</Strong><Muted>{t('shopNotServedBody')}</Muted></Card>}
      {zone?.zone && <Muted>{t('shopDeliveringIn', { zone: zone.zone.name, fee: formatPrice(zone.zone.deliveryFeeMinor) })}</Muted>}
      {favourites.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[null, ...favourites].map((seller) => (
            <Pressable key={seller?.id ?? 'all'} onPress={() => setSellerId(seller?.id ?? null)}>
              <Text style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: sellerId === (seller?.id ?? null) ? colors.brand : '#fff', color: sellerId === (seller?.id ?? null) ? '#fff' : colors.ink, borderWidth: 1, borderColor: colors.line }}>
                {seller ? `♥ ${seller.displayName}` : t('favouritesAll')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {[null, ...PRODUCT_CATEGORIES].map((value) => (
          <Pressable key={value ?? 'all'} onPress={() => setCategory(value)}>
            <Text style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: category === value ? colors.brand : '#fff', color: category === value ? '#fff' : colors.ink, borderWidth: 1, borderColor: colors.line }}>
              {value ? categoryLabel(value) : t('shopAll')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {products === null ? <Loading /> : products.length === 0 && zone?.served ? <Muted>{t('shopEmpty')}</Muted> : null}
      {products?.map((product) => (
        <Card key={product.id} onPress={() => navigation.push({ name: 'product', product })}>
          <ProductPhoto product={product} height={160} />
          <Strong>{product.name}</Strong>
          <Muted>{product.sellerName}{product.distanceMeters !== undefined ? ` · ${t('shopDistance', { km: (product.distanceMeters / 1000).toFixed(1) })}` : ''}</Muted>
          <Body>{formatPrice(product.priceMinor)}{product.sellerRating ? `  ·  ${ratingText(product.sellerRating)}` : ''}</Body>
        </Card>
      ))}
      <Card onPress={() => navigation.push({ name: 'newRequest' })}>
        <Strong>{t('shopSpecialTitle')}</Strong>
        <Muted>{t('shopSpecialBody')}</Muted>
      </Card>
    </Screen>
  );
}

function ProductPhoto({ product, height }: { product: Product; height: number }) {
  const uri = productImageUri(api, product);
  if (!uri) {
    return (
      <View style={{ height: height / 2, borderRadius: 8, backgroundColor: '#fbeef3', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 40 }}>💐</Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={{ height, borderRadius: 8 }} resizeMode="cover" accessibilityLabel={product.name} />;
}

function VerifyEmailBanner() {
  const [sent, setSent] = useState(false);
  return (
    <Card>
      <Strong>{t('shopVerifyTitle')}</Strong>
      <Muted>{t('shopVerifyBody')}</Muted>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind="secondary" title={sent ? t('shopSent') : t('shopResend')} disabled={sent} onPress={() => attempt(async () => { await api.request('auth/email-verification/request', { method: 'POST' }); setSent(true); })} />
        <Button kind="secondary" title={t('shopConfirmed')} onPress={() => attempt(async () => { await api.refreshUser(); })} />
      </View>
    </Card>
  );
}

export function ProductScreen({ product }: { product: Product }) {
  const navigation = useNavigation();
  const [quantity, setQuantity] = useState(1);
  return (
    <Screen title={product.name} onBack={navigation.back}>
      <ProductPhoto product={product} height={240} />
      <Pill label={categoryLabel(product.category)} />
      <Strong>{formatPrice(product.priceMinor)}</Strong>
      <Muted>{t('productBy', { seller: product.sellerName, kind: product.sellerKind === 'SHOP' ? t('productKindShop') : t('productKindFreelancer') })}</Muted>
      <Muted>{product.sellerRating ? ratingText(product.sellerRating) : t('ratingNone')}</Muted>
      {product.description && <Body>{product.description}</Body>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Button kind="secondary" title="−" onPress={() => setQuantity((q) => Math.max(1, q - 1))} />
        <Strong>{quantity}</Strong>
        <Button kind="secondary" title="+" onPress={() => setQuantity((q) => Math.min(20, q + 1))} />
      </View>
      <Button
        title={t('productAddToCart', { price: formatPrice(product.priceMinor * quantity) })}
        onPress={() =>
          attempt(async () => {
            await api.request<Cart>('cart/items', { method: 'PUT', body: { productId: product.id, quantity } });
            navigation.push({ name: 'cart' });
          })
        }
      />
      <FavouriteButton sellerId={product.sellerId} />
      <SellerReviews sellerId={product.sellerId} />
    </Screen>
  );
}

const ratingText = (rating: Rating) => t('ratingSummary', { average: rating.average.toLocaleString(locale, { minimumFractionDigits: 1 }), count: rating.count });

function SellerReviews({ sellerId }: { sellerId: string }) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  useEffect(() => {
    void api
      .request<{ items: PublicReview[] }>(`catalog/sellers/${sellerId}/reviews`, { auth: false })
      .then((result) => setReviews(result.items.filter((review) => review.comment).slice(0, 3)))
      .catch(() => undefined);
  }, [sellerId]);
  if (reviews.length === 0) return null;
  return (
    <Card>
      <Strong>{t('reviewsLatest')}</Strong>
      {reviews.map((review) => (
        <View key={review.createdAt}>
          <Body>{stars(review.rating)}</Body>
          <Muted>“{review.comment}” · {new Date(review.createdAt).toLocaleDateString(locale)}</Muted>
        </View>
      ))}
    </Card>
  );
}

function FavouriteButton({ sellerId }: { sellerId: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  useEffect(() => {
    void api
      .request<{ items: FavouriteSeller[] }>('favourites')
      .then((result) => setSaved(result.items.some((seller) => seller.id === sellerId)))
      .catch(() => undefined);
  }, [sellerId]);
  if (saved === null) return null;
  return (
    <Button
      kind="secondary"
      title={saved ? t('favouriteSaved') : t('favouriteSave')}
      onPress={() =>
        attempt(async () => {
          await api.request(`favourites/${sellerId}`, { method: saved ? 'DELETE' : 'PUT' });
          setSaved(!saved);
        })
      }
    />
  );
}
