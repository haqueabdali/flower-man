import type { AuthUser } from '@flower-man/contracts';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from './api';
import { language, t } from './i18n';
import { NavigationContext, type Navigator, type Route } from './navigation';
import { registerForPush } from './push';
import { SupportScreen, SupportTicketScreen } from './screens/support';
import { AccountScreen, InboxScreen, RemindersScreen } from './screens/account';
import { AuthScreen, ResetPasswordScreen, VerifyEmailScreen } from './screens/auth';
import { CartScreen, CheckoutScreen, PaymentScreen } from './screens/cart';
import { OrderScreen, OrdersScreen } from './screens/orders';
import { NewRequestScreen, RequestScreen, RequestsScreen } from './screens/requests';
import { ProductScreen, ShopScreen } from './screens/shop';
import { colors, Loading } from './ui';

const TABS: { route: Route; label: string; icon: string }[] = [
  { route: { name: 'shop' }, label: t('tabShop'), icon: '🌷' },
  { route: { name: 'requests' }, label: t('tabCustom'), icon: '💐' },
  { route: { name: 'orders' }, label: t('tabOrders'), icon: '📦' },
  { route: { name: 'inbox' }, label: t('tabInbox'), icon: '🔔' },
  { route: { name: 'account' }, label: t('tabAccount'), icon: '👤' },
];

/** Deep links from emails: flowerman://verify-email?token=… and flowerman://reset-password?token=… */
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
  const [stack, setStack] = useState<Route[]>([{ name: 'shop' }]);
  const [pending, setPending] = useState<Route | null>(null);
  const url = Linking.useURL();

  const reloadUser = useCallback(async () => setUser((await api.refreshUser().catch(() => null)) ?? (await api.currentUser())), []);

  useEffect(() => {
    void reloadUser();
    return api.onSignedOut(() => setUser(null));
  }, [reloadUser]);

  useEffect(() => {
    const route = routeFromUrl(url);
    if (route) setPending(route);
  }, [url]);

  useEffect(() => {
    if (!user) return;
    void registerForPush('customer').catch(() => undefined);
    // Notifications from the API are written in this language.
    void api.request('me/preferences', { method: 'PUT', body: { language } }).catch(() => undefined);
  }, [user?.id]);

  const navigator = useMemo<Navigator>(
    () => ({
      push: (route) => setStack((current) => [...current, route]),
      back: () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current)),
      reset: (route) => setStack([route]),
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
    const route = stack[stack.length - 1] ?? { name: 'shop' };
    content = (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>{renderRoute(route, user, () => setUser(null))}</View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.line, backgroundColor: '#fff', paddingBottom: 20, paddingTop: 8 }}>
          {TABS.map((tab) => (
            <Pressable key={tab.route.name} style={{ flex: 1, alignItems: 'center' }} onPress={() => navigator.reset(tab.route)}>
              <Text style={{ fontSize: 20 }}>{tab.icon}</Text>
              <Text style={{ fontSize: 11, color: route.name === tab.route.name ? colors.brand : colors.muted }}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  const tree = (
    <SafeAreaProvider>
      <NavigationContext.Provider value={navigator}>
        <StatusBar style="dark" />
        {content}
      </NavigationContext.Provider>
    </SafeAreaProvider>
  );
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return publishableKey ? (
    <StripeProvider publishableKey={publishableKey} merchantIdentifier={process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID ?? 'merchant.it.flowerman'} urlScheme="flowerman">
      {tree}
    </StripeProvider>
  ) : (
    tree
  );
}

function renderRoute(route: Route, user: AuthUser, onSignedOut: () => void): ReactNode {
  switch (route.name) {
    case 'shop': return <ShopScreen emailVerified={user.emailVerified} />;
    case 'product': return <ProductScreen product={route.product} />;
    case 'cart': return <CartScreen />;
    case 'reminders': return <RemindersScreen />;
    case 'checkout': return <CheckoutScreen />;
    case 'payment': return <PaymentScreen checkout={route.checkout} />;
    case 'orders': return <OrdersScreen />;
    case 'order': return <OrderScreen orderId={route.orderId} />;
    case 'requests': return <RequestsScreen />;
    case 'newRequest': return <NewRequestScreen />;
    case 'request': return <RequestScreen requestId={route.requestId} />;
    case 'inbox': return <InboxScreen />;
    case 'account': return <AccountScreen user={user} onSignedOut={onSignedOut} />;
    case 'support': return <SupportScreen {...(route.orderId ? { orderId: route.orderId } : {})} />;
    case 'supportTicket': return <SupportTicketScreen ticketId={route.ticketId} />;
    case 'verifyEmail':
    case 'resetPassword':
      return null;
  }
}
