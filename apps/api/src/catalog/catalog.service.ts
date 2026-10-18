import type { NearbySeller, Product, ProductRequest, UpdateProductRequest } from '@flower-man/contracts';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { pointSql } from '../common/geo.js';
import { PG_POOL } from '../database/database.module.js';
import type { ActingPartner } from '../partners/partners.service.js';
import { ZonesService } from '../zones/zones.service.js';

interface ProductRow {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_kind: Product['sellerKind'];
  name: string;
  description: string | null;
  category: Product['category'];
  price_minor: number;
  available: boolean;
  stock: number | null;
  image_url: string | null;
  distance_m?: number | null;
}

const PRODUCT_COLUMNS = `pr.id, pr.seller_id, p.display_name AS seller_name, p.kind AS seller_kind, pr.name, pr.description,
  pr.category, pr.price_minor, pr.available, pr.stock, pr.image_url`;

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  sellerId: row.seller_id,
  sellerName: row.seller_name,
  sellerKind: row.seller_kind,
  name: row.name,
  description: row.description,
  category: row.category,
  priceMinor: row.price_minor,
  currency: 'EUR',
  available: row.available,
  stock: row.stock,
  imageUrl: row.image_url,
  ...(row.distance_m === undefined || row.distance_m === null ? {} : { distanceMeters: Math.round(row.distance_m) }),
});

export interface BrowseQuery {
  readonly latitude: number;
  readonly longitude: number;
  readonly category?: string;
  readonly search?: string;
  readonly sellerId?: string;
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly zones: ZonesService,
  ) {}

  // ---------------------------------------------------------------- seller side
  async listForSeller(seller: ActingPartner): Promise<Product[]> {
    const result = await this.pool.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM products pr JOIN partner_accounts p ON p.id = pr.seller_id
        WHERE pr.seller_id = $1 AND pr.archived_at IS NULL ORDER BY pr.created_at DESC`,
      [seller.partnerId],
    );
    return result.rows.map(toProduct);
  }

  async create(seller: ActingPartner, input: ProductRequest): Promise<Product> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO products (seller_id, name, description, category, price_minor, available, stock, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [seller.partnerId, input.name, input.description ?? null, input.category, input.priceMinor, input.available, input.stock ?? null, input.imageUrl ?? null],
    );
    return this.getById(result.rows[0]?.id as string);
  }

  async update(seller: ActingPartner, productId: string, input: UpdateProductRequest): Promise<Product> {
    const result = await this.pool.query(
      `UPDATE products SET name = COALESCE($3, name), description = COALESCE($4, description),
         category = COALESCE($5, category), price_minor = COALESCE($6, price_minor), available = COALESCE($7, available),
         stock = CASE WHEN $8::boolean THEN $9 ELSE stock END, image_url = COALESCE($10, image_url), updated_at = now()
       WHERE id = $1 AND seller_id = $2 AND archived_at IS NULL`,
      [
        productId, seller.partnerId, input.name ?? null, input.description ?? null, input.category ?? null,
        input.priceMinor ?? null, input.available ?? null, input.stock !== undefined, input.stock ?? null, input.imageUrl ?? null,
      ],
    );
    if (result.rowCount !== 1) {
      throw new NotFoundException('Product not found.');
    }
    return this.getById(productId);
  }

  /** Archived, not deleted: past orders keep referring to it. */
  async archive(seller: ActingPartner, productId: string): Promise<void> {
    const result = await this.pool.query(
      'UPDATE products SET archived_at = now(), available = false, updated_at = now() WHERE id = $1 AND seller_id = $2 AND archived_at IS NULL',
      [productId, seller.partnerId],
    );
    if (result.rowCount !== 1) {
      throw new NotFoundException('Product not found.');
    }
  }

  // ---------------------------------------------------------------- customer side
  /** Products customers at this location can order: approved sellers of the same zone, available, in stock. */
  async browse(query: BrowseQuery): Promise<Product[]> {
    const zone = await this.zones.requireActiveZone(query.latitude, query.longitude);
    const result = await this.pool.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS}, ST_Distance(p.location, ${pointSql(2, 3)}) AS distance_m
         FROM products pr JOIN partner_accounts p ON p.id = pr.seller_id
        WHERE p.service_zone_id = $1 AND p.verification_status = 'APPROVED'
          AND pr.available AND pr.archived_at IS NULL AND (pr.stock IS NULL OR pr.stock > 0)
          AND ($4::text IS NULL OR pr.category = $4)
          AND ($5::text IS NULL OR pr.name ILIKE '%' || $5 || '%' OR pr.description ILIKE '%' || $5 || '%')
          AND ($6::uuid IS NULL OR pr.seller_id = $6)
        ORDER BY distance_m ASC, pr.price_minor ASC LIMIT 200`,
      [zone.id, query.longitude, query.latitude, query.category ?? null, query.search?.slice(0, 80) ?? null, query.sellerId ?? null],
    );
    return result.rows.map(toProduct);
  }

  async nearbySellers(latitude: number, longitude: number): Promise<NearbySeller[]> {
    const zone = await this.zones.requireActiveZone(latitude, longitude);
    const result = await this.pool.query<{ id: string; kind: NearbySeller['kind']; display_name: string; description: string | null; distance_m: number; product_count: string }>(
      `SELECT p.id, p.kind, p.display_name, p.description, ST_Distance(p.location, ${pointSql(2, 3)}) AS distance_m,
              (SELECT count(*) FROM products pr WHERE pr.seller_id = p.id AND pr.available AND pr.archived_at IS NULL) AS product_count
         FROM partner_accounts p
        WHERE p.service_zone_id = $1 AND p.verification_status = 'APPROVED' AND p.kind IN ('SHOP', 'FREELANCE_SELLER')
        ORDER BY distance_m LIMIT 100`,
      [zone.id, longitude, latitude],
    );
    return result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      displayName: row.display_name,
      description: row.description,
      distanceMeters: Math.round(row.distance_m),
      productCount: Number(row.product_count),
    }));
  }

  async getById(productId: string): Promise<Product> {
    const result = await this.pool.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM products pr JOIN partner_accounts p ON p.id = pr.seller_id WHERE pr.id = $1 AND pr.archived_at IS NULL`,
      [productId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Product not found.');
    }
    return toProduct(row);
  }
}
