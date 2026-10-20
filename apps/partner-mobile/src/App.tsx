import type { AuthUser } from '@flower-man/contracts';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from './api';
import { language, t } from './i18n';
import { NavigationContext, type Navigator, type Route } from './navigation';
import { registerForPush } from './push';
import { AccountScreen, InboxScreen } from './screens/account';
import { AuthScreen, ResetPasswordScreen, VerifyEmailScreen } from './screens/auth';
import { CourierJobScreen, CourierJobsScreen, EarningsScreen } from './screens/courier';
import { ApplyScreen, HomeScreen, PartnerScreen } from './screens/home';
import { OfferScreen, ProductEditScreen, ProductsScreen, RequestFeedScreen, SellerOrderScreen, SellerOrdersScreen } from './screens/seller';
import { stopTracking } from './tracking';
import { colors, Loading } from './ui';

const TABS: { route: Route; label: string; icon: string }[] = [
  { route: { name: 'home' }, label: t('tabHome'), icon: '🏠' },
  { route: { name: 'inbox' }, label: t('tabInbox'), icon: '🔔' },
  { route: { name: 'account' }, label: t('tabAccount'), icon: '👤' },
];

function routeFromUrl(url: string | null): Route | null {
  if (!url) return null;
  const parsed = Linking.parse(url);
  const token = typeof parsed.queryParams?.['token'] === 'string' ? parsed.queryParams['token'] : null;
  if (!token) return null;
  if (parsed.path?.endsWith('verify-email')) return { name: 'verifyEmail', token };
  if (parsed.path?.endsWith('reset-password')) return { name: 'resetPassword', token };
  return null;
}

export function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const [pending, setPending] = useState<Route | null>(null);
  const url = Linking.useURL();

  const reloadUser = useCallback(async () => setUser((await api.refreshUser().catch(() => null)) ?? (await api.currentUser())), []);

  useEffect(() => {
    void reloadUser();
    return api.onSignedOut(() => {
      void stopTracking();
      setUser(null);
    });
  }, [reloadUser]);

  useEffect(() => {
    const route = routeFromUrl(url);
    if (route) setPending(route);
  }, [url]);

  useEffect(() => {
    if (!user) return;
    void registerForPush('partner').catch(() => undefined);
    // Notifications from the API are written in this language.
    void api.request('me/preferences', { method: 'PUT', body: { language } }).catch(() => undefined);
  }, [user?.id]);

  const navigator = useMemo<Navigator>(
    () => ({
      push: (route) => setStack((current) => [...current, route]),
      back: () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current)),
      // Keep Home under every reset so Back always leads somewhere sensible.
      reset: (route) => setStack(route.name === 'home' ? [route] : [{ name: 'home' }, route]),
    }),
    [],
  );

  const finishLink = () => {
    setPending(null);
    void reloadUser();
  };

  let content: ReactNode;
  if (pending?.name === 'verifyEmail') content = <VerifyEmailScreen token={pending.token} onDone={finishLink} />;
  else if (pending?.name === 'resetPassword') content = <ResetPasswordScreen token={pending.token} onDone={finishLink} />;
  else if (user === undefined) content = <Loading />;
  else if (user === null) content = <AuthScreen onSignedIn={() => void reloadUser()} />;
  else {
    const route = stack[stack.length - 1] ?? { name: 'home' };
    content = (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>{renderRoute(route, user, () => setUser(null))}</View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.line, backgroundColor: '#fff', paddingBottom: 20, paddingTop: 8 }}>
          {TABS.map((tab) => (
            <Pressable key={tab.label} style={{ flex: 1, alignItems: 'center' }} onPress={() => setStack([tab.route])}>
              <Text style={{ fontSize: 20 }}>{tab.icon}</Text>
              <Text style={{ fontSize: 11, color: route.name === tab.route.name ? colors.brand : colors.muted }}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContext.Provider value={navigator}>
        <StatusBar style="dark" />
        {content}
      </NavigationContext.Provider>
    </SafeAreaProvider>
  );
}

function renderRoute(route: Route, user: AuthUser, onSignedOut: () => void): ReactNode {
  switch (route.name) {
    case 'home': return <HomeScreen />;
    case 'apply': return <ApplyScreen />;
    case 'partner': return <PartnerScreen partnerId={route.partnerId} />;
    case 'sellerOrders': return <SellerOrdersScreen />;
    case 'sellerOrder': return <SellerOrderScreen orderId={route.orderId} />;
    case 'products': return <ProductsScreen />;
    case 'productEdit': return <ProductEditScreen product={route.product} />;
    case 'requestFeed': return <RequestFeedScreen />;
    case 'offer': return <OfferScreen request={route.request as Parameters<typeof OfferScreen>[0]['request']} />;
    case 'courierJobs': return <CourierJobsScreen />;
    case 'courierJob': return <CourierJobScreen job={route.job} />;
    case 'earnings': return <EarningsScreen mode={route.mode} />;
    case 'inbox': return <InboxScreen />;
    case 'account': return <AccountScreen user={user} onSignedOut={onSignedOut} />;
    case 'verifyEmail':
    case 'resetPassword':
      return null;
  }
}
