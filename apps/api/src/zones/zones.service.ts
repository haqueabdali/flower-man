import type { CreateZoneRequest, ServiceZone, UpdateZoneRequest } from '@flower-man/contracts';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { recordAudit } from '../common/audit.js';
import { pointSql } from '../common/geo.js';
import { PG_POOL } from '../database/database.module.js';

interface ZoneRow {
  id: string;
  code: string;
  name: string;
  city: string;
  province: string;
  active: boolean;
  delivery_fee_minor: number;
}

const ZONE_COLUMNS = 'id, code, name, city, province, active, delivery_fee_minor';

export const toZone = (row: ZoneRow): ServiceZone => ({
  id: row.id,
  code: row.code,
  name: row.name,
  city: row.city,
  province: row.province,
  active: row.active,
  deliveryFeeMinor: row.delivery_fee_minor,
});

@Injectable()
export class ZonesService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** The active zone covering a point, or null when Flower Man does not serve it. */
  async findActiveZone(latitude: number, longitude: number, db: pg.ClientBase | pg.Pool = this.pool): Promise<ServiceZone | null> {
    const result = await db.query<ZoneRow>(
      `SELECT ${ZONE_COLUMNS} FROM service_zones
        WHERE active AND ST_Covers(area, ${pointSql(1, 2)})
        ORDER BY ST_Area(area) ASC LIMIT 1`,
      [longitude, latitude],
    );
    const row = result.rows[0];
    return row ? toZone(row) : null;
  }

  async requireActiveZone(latitude: number, longitude: number, db?: pg.ClientBase | pg.Pool): Promise<ServiceZone> {
    const zone = await this.findActiveZone(latitude, longitude, db);
    if (!zone) {
      throw new BadRequestException('Flower Man does not deliver to this location yet.');
    }
    return zone;
  }

  async list(): Promise<ServiceZone[]> {
    const result = await this.pool.query<ZoneRow>(`SELECT ${ZONE_COLUMNS} FROM service_zones ORDER BY code`);
    return result.rows.map(toZone);
  }

  async create(actorId: string, input: CreateZoneRequest): Promise<ServiceZone> {
    try {
      const result = await this.pool.query<ZoneRow>(
        `INSERT INTO service_zones (code, name, city, province, delivery_fee_minor, active, area)
         VALUES ($1, $2, $3, $4, $5, $6, ST_Multi(ST_GeomFromGeoJSON($7))::geography)
         RETURNING ${ZONE_COLUMNS}`,
        [input.code, input.name, input.city, input.province, input.deliveryFeeMinor, input.active, JSON.stringify(input.area)],
      );
      const zone = toZone(result.rows[0] as ZoneRow);
      await recordAudit(this.pool, actorId, 'ZONE_CREATED', 'service_zone', zone.id, { code: zone.code });
      return zone;
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(actorId: string, zoneId: string, input: UpdateZoneRequest): Promise<ServiceZone> {
    try {
      const result = await this.pool.query<ZoneRow>(
        `UPDATE service_zones SET
           name = COALESCE($2, name),
           delivery_fee_minor = COALESCE($3, delivery_fee_minor),
           active = COALESCE($4, active),
           area = COALESCE(ST_Multi(ST_GeomFromGeoJSON($5))::geography, area),
           updated_at = now()
         WHERE id = $1 RETURNING ${ZONE_COLUMNS}`,
        [zoneId, input.name ?? null, input.deliveryFeeMinor ?? null, input.active ?? null, input.area ? JSON.stringify(input.area) : null],
      );
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException('Zone not found.');
      }
      await recordAudit(this.pool, actorId, 'ZONE_UPDATED', 'service_zone', zoneId, { ...input, area: input.area ? 'changed' : undefined });
      return toZone(row);
    } catch (error) {
      throw this.translate(error);
    }
  }

  private translate(error: unknown): unknown {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      return new ConflictException('A zone with this code already exists.');
    }
    if (code === 'XX000' || code === '22023') {
      return new BadRequestException('Invalid zone area: expected a GeoJSON Polygon or MultiPolygon.');
    }
    return error;
  }
}
