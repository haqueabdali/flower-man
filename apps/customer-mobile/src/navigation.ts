import type { CheckoutResponse, Product } from '@flower-man/contracts';
import { createContext, useContext } from 'react';

export type Route =
  | { name: 'shop' }
  | { name: 'product'; product: Product }
  | { name: 'cart' }
  | { name: 'checkout' }
  | { name: 'payment'; checkout: CheckoutResponse }
  | { name: 'orders' }
  | { name: 'order'; orderId: string }
  | { name: 'requests' }
  | { name: 'newRequest' }
  | { name: 'request'; requestId: string }
  | { name: 'inbox' }
  | { name: 'account' }
  | { name: 'reminders' }
  | { name: 'verifyEmail'; token: string }
  | { name: 'resetPassword'; token: string };

export interface Navigator {
  push(route: Route): void;
  back(): void;
  reset(route: Route): void;
}

export const NavigationContext = createContext<Navigator | null>(null);

export function useNavigation(): Navigator {
  const navigator = useContext(NavigationContext);
  if (!navigator) throw new Error('NavigationContext missing');
  return navigator;
}
