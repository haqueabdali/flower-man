import { formatPrice } from '@flower-man/api-client';
import { type Cart, PRODUCT_CATEGORIES, type Product, type ZoneCheckResponse } from '@flower-man/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

import { api } from '../api';
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
    <Screen title="Flowers near you" right={<Pressable onPress={() => navigation.push({ name: 'cart' })}><Text style={{ fontSize: 22 }}>🛒</Text></Pressable>}>
      {!emailVerified && <VerifyEmailBanner />}
      {zone && !zone.served && <Card><Strong>We don't deliver here yet</Strong><Muted>Flower Man currently serves Bergamo. More Italian cities are coming soon.</Muted></Card>}
      {zone?.zone && <Muted>Delivering in {zone.zone.name} · delivery {formatPrice(zone.zone.deliveryFeeMinor)}</Muted>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {[null, ...PRODUCT_CATEGORIES].map((value) => (
          <Pressable key={value ?? 'all'} onPress={() => setCategory(value)}>
            <Text style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: category === value ? colors.brand : '#fff', color: category === value ? '#fff' : colors.ink, borderWidth: 1, borderColor: colors.line }}>
              {value ? value.charAt(0) + value.slice(1).toLowerCase() : 'All'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {products === null ? <Loading /> : products.length === 0 && zone?.served ? <Muted>No flowers available right now.</Muted> : null}
      {products?.map((product) => (
        <Card key={product.id} onPress={() => navigation.push({ name: 'product', product })}>
          {product.imageUrl && <Image source={{ uri: product.imageUrl }} style={{ height: 160, borderRadius: 8 }} />}
          <Strong>{product.name}</Strong>
          <Muted>{product.sellerName}{product.distanceMeters !== undefined ? ` · ${(product.distanceMeters / 1000).toFixed(1)} km` : ''}</Muted>
          <Body>{formatPrice(product.priceMinor)}</Body>
        </Card>
      ))}
      <Card onPress={() => navigation.push({ name: 'newRequest' })}>
        <Strong>💐 Want something special?</Strong>
        <Muted>Describe your bouquet and local florists will send you offers.</Muted>
      </Card>
    </Screen>
  );
}

function VerifyEmailBanner() {
  const [sent, setSent] = useState(false);
  return (
    <Card>
      <Strong>Confirm your email</Strong>
      <Muted>Open the link we emailed you before placing an order.</Muted>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind="secondary" title={sent ? 'Sent' : 'Resend email'} disabled={sent} onPress={() => attempt(async () => { await api.request('auth/email-verification/request', { method: 'POST' }); setSent(true); })} />
        <Button kind="secondary" title="I've confirmed" onPress={() => attempt(async () => { await api.refreshUser(); })} />
      </View>
    </Card>
  );
}

export function ProductScreen({ product }: { product: Product }) {
  const navigation = useNavigation();
  const [quantity, setQuantity] = useState(1);
  return (
    <Screen title={product.name} onBack={navigation.back}>
      {product.imageUrl && <Image source={{ uri: product.imageUrl }} style={{ height: 240, borderRadius: 12 }} />}
      <Pill label={product.category} />
      <Strong>{formatPrice(product.priceMinor)}</Strong>
      <Muted>by {product.sellerName} ({product.sellerKind === 'SHOP' ? 'flower shop' : 'independent florist'})</Muted>
      {product.description && <Body>{product.description}</Body>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Button kind="secondary" title="−" onPress={() => setQuantity((q) => Math.max(1, q - 1))} />
        <Strong>{quantity}</Strong>
        <Button kind="secondary" title="+" onPress={() => setQuantity((q) => Math.min(20, q + 1))} />
      </View>
      <Button
        title={`Add to cart · ${formatPrice(product.priceMinor * quantity)}`}
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
