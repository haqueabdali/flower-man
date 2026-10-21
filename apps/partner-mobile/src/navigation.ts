import type { CourierJob, CustomRequestView, Product } from '@flower-man/contracts';
import { createContext, useContext } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'apply' }
  | { name: 'partner'; partnerId: string }
  | { name: 'sellerOrders' }
  | { name: 'sellerOrder'; orderId: string }
  | { name: 'products' }
  | { name: 'productEdit'; product: Product | null }
  | { name: 'reviews' }
  | { name: 'requestFeed' }
  | { name: 'offer'; request: CustomRequestView }
  | { name: 'courierJobs' }
  | { name: 'courierJob'; job: CourierJob }
  | { name: 'earnings'; mode: 'seller' | 'courier' }
  | { name: 'inbox' }
  | { name: 'account' }
  | { name: 'support'; orderId?: string }
  | { name: 'supportTicket'; ticketId: string }
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
