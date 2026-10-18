import {
  type NearbySeller,
  type Product,
  PRODUCT_CATEGORIES,
  type ProductRequest,
  productSchema,
  type UpdateProductRequest,
  updateProductSchema,
} from '@flower-man/contracts';
import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { type AuthenticatedContext, AuthGuard, CurrentAuth } from '../auth/auth.guard.js';
import { UuidPipe } from '../common/uuid-param.pipe.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { PartnersService, SELLER_HEADER } from '../partners/partners.service.js';
import { parseCoordinates } from '../zones/zones.controller.js';
import { CatalogService } from './catalog.service.js';

/** Public browsing: no account needed to look at flowers. */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  async browse(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('category') category?: string,
    @Query('q') search?: string,
    @Query('sellerId') sellerId?: string,
  ): Promise<{ items: Product[] }> {
    const { latitude, longitude } = parseCoordinates(lat, lng);
    if (category !== undefined && !(PRODUCT_CATEGORIES as readonly string[]).includes(category)) {
      throw new BadRequestException(`category must be one of ${PRODUCT_CATEGORIES.join(', ')}.`);
    }
    const seller = sellerId === undefined ? undefined : new UuidPipe().transform(sellerId);
    return { items: await this.catalog.browse({ latitude, longitude, ...(category ? { category } : {}), ...(search ? { search } : {}), ...(seller ? { sellerId: seller } : {}) }) };
  }

  @Get('products/:id')
  async product(@Param('id', UuidPipe) id: string): Promise<Product> {
    return this.catalog.getById(id);
  }

  @Get('sellers')
  async sellers(@Query('lat') lat?: string, @Query('lng') lng?: string): Promise<{ items: NearbySeller[] }> {
    const { latitude, longitude } = parseCoordinates(lat, lng);
    return { items: await this.catalog.nearbySellers(latitude, longitude) };
  }
}

@Controller('seller/products')
@UseGuards(AuthGuard)
export class SellerProductsController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly partners: PartnersService,
  ) {}

  @Get()
  async list(@CurrentAuth() auth: AuthenticatedContext, @Headers(SELLER_HEADER) sellerId?: string): Promise<{ items: Product[] }> {
    return { items: await this.catalog.listForSeller(await this.partners.requireSeller(auth.userId, sellerId)) };
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthenticatedContext,
    @Body(new ZodBodyPipe(productSchema)) body: ProductRequest,
    @Headers(SELLER_HEADER) sellerId?: string,
  ): Promise<Product> {
    return this.catalog.create(await this.partners.requireSeller(auth.userId, sellerId), body);
  }

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodBodyPipe(updateProductSchema)) body: UpdateProductRequest,
    @Headers(SELLER_HEADER) sellerId?: string,
  ): Promise<Product> {
    return this.catalog.update(await this.partners.requireSeller(auth.userId, sellerId), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Headers(SELLER_HEADER) sellerId?: string): Promise<void> {
    await this.catalog.archive(await this.partners.requireSeller(auth.userId, sellerId), id);
  }
}
