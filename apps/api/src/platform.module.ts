import { Module } from '@nestjs/common';

import { AdminController } from './admin/admin.controller.js';
import { AdminService } from './admin/admin.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogController, SellerProductsController } from './catalog/catalog.controller.js';
import { CatalogService } from './catalog/catalog.service.js';
import type { AppConfig } from './config/app-config.js';
import { APP_CONFIG } from './config/config.module.js';
import { CustomRequestsService } from './custom-requests/custom-requests.service.js';
import { CourierController } from './delivery/courier.controller.js';
import { DeliveryService } from './delivery/delivery.service.js';
import { LedgerService } from './ledger/ledger.service.js';
import { MaintenanceService } from './maintenance/maintenance.service.js';
import { MeController } from './me/me.controller.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { NotificationsService } from './notifications/notifications.service.js';
import { CommerceService } from './orders/commerce.service.js';
import { CustomerController } from './orders/customer.controller.js';
import { SellerController } from './orders/seller.controller.js';
import { PartnersController } from './partners/partners.controller.js';
import { PartnersService } from './partners/partners.service.js';
import { createPaymentProvider, createStripeClient, PAYMENT_PROVIDER } from './payments/payment-provider.js';
import { PaymentsController } from './payments/payments.controller.js';
import { STRIPE_CLIENT } from './payments/payments.module-tokens.js';
import { PaymentsService } from './payments/payments.service.js';
import { createObjectStorage, OBJECT_STORAGE } from './storage/object-storage.js';
import { ZonesController } from './zones/zones.controller.js';
import { ZonesService } from './zones/zones.service.js';

/** The marketplace: zones, partners, catalogue, custom requests, orders, payments, delivery, ledger, admin. */
@Module({
  imports: [AuthModule],
  controllers: [
    ZonesController,
    PartnersController,
    CatalogController,
    SellerProductsController,
    CustomerController,
    SellerController,
    CourierController,
    PaymentsController,
    NotificationsController,
    MeController,
    AdminController,
  ],
  providers: [
    ZonesService,
    PartnersService,
    CatalogService,
    CustomRequestsService,
    CommerceService,
    PaymentsService,
    DeliveryService,
    LedgerService,
    NotificationsService,
    AdminService,
    MaintenanceService,
    { provide: PAYMENT_PROVIDER, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createPaymentProvider(config.payments) },
    { provide: STRIPE_CLIENT, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createStripeClient(config.payments) },
    { provide: OBJECT_STORAGE, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createObjectStorage(config.storage) },
  ],
  exports: [MaintenanceService, NotificationsService],
})
export class PlatformModule {}
