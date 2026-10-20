import { formatPrice, productImageUri } from '@flower-man/api-client';
import { type Cart, PRODUCT_CATEGORIES, type Product, type ZoneCheckResponse } from '@flower-man/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { api } from '../api';
import { categoryLabel, t } from '../i18n';
import { currentLocation } from '../location';
import { useNavigation } from '../navigation';
import { attempt, Body, Button, Card, colors, Loading, Muted, Pill, Screen, Strong } from '../ui';

export function ShopScreen({ emailVerified }: { emailVerified: boolean }) {
  const navigation = useNavigation();
  const [zone, setZone] = useState<ZoneCheckResponse | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [where, setWhere] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    void currentLocation().then(setWhere);
  }, []);

  const load = useCallback(async () => {
    if (!where) return;
    const check = await api.request<ZoneCheckResponse>(`zones/check?lat=${where.latitude}&lng=${where.longitude}`, { auth: false });
    setZone(check);
    if (!check.served) {
      setProducts([]);
      return;
    }
    const query = `catalog/products?lat=${where.latitude}&lng=${where.longitude}${category ? `&category=${category}` : ''}`;
    setProducts((await api.request<{ items: Product[] }>(query, { auth: false })).items);
  }, [where, category]);

  useEffect(() => {
    void attempt(load);
  }, [load]);

  return (
    <Screen title={t('shopTitle')} right={<Pressable onPress={() => navigation.push({ name: 'cart' })}><Text style={{ fontSize: 22 }}>🛒</Text></Pressable>}>
      {!emailVerified && <VerifyEmailBanner />}
      {zone && !zone.served && <Card><Strong>{t('shopNotServedTitle')}</Strong><Muted>{t('shopNotServedBody')}</Muted></Card>}
      {zone?.zone && <Muted>{t('shopDeliveringIn', { zone: zone.zone.name, fee: formatPrice(zone.zone.deliveryFeeMinor) })}</Muted>}
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
          <Body>{formatPrice(product.priceMinor)}</Body>
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
    </Screen>
  );
}
