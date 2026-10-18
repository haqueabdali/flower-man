import type { PartnerAccount, PartnerApplicationRequest, ReviewPartnerRequest, UpdatePartnerRequest } from '@flower-man/contracts';
import {
  assertVerificationTransition,
  CAPABILITY_FOR_PARTNER_KIND,
  type PartnerKind,
  SELLER_KINDS,
  type VerificationStatus,
} from '@flower-man/domain';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { recordAudit } from '../common/audit.js';
import { pointSql, selectPoint, toGeoPoint } from '../common/geo.js';
import { PG_POOL } from '../database/database.module.js';
import { withTransaction } from '../database/transaction.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ZonesService } from '../zones/zones.service.js';

interface PartnerRow {
  id: string;
  kind: PartnerKind;
  display_name: string;
  legal_name: string | null;
  vat_number: string | null;
  phone: string | null;
  address: string | null;
  loc_lat: number | null;
  loc_lng: number | null;
  service_zone_id: string | null;
  description: string | null;
  verification_status: VerificationStatus;
  verification_notes: string | null;
  courier_available: boolean;
  role: 'OWNER' | 'STAFF';
}

const PARTNER_COLUMNS = `p.id, p.kind, p.display_name, p.legal_name, p.vat_number, p.phone, p.address,
  ${selectPoint('p.location', 'loc')}, p.service_zone_id, p.description, p.verification_status,
  p.verification_notes, p.courier_available`;

const toPartner = (row: PartnerRow): PartnerAccount => ({
  id: row.id,
  kind: row.kind,
  displayName: row.display_name,
  legalName: row.legal_name,
  vatNumber: row.vat_number,
  phone: row.phone,
  address: row.address,
  location: toGeoPoint(row.loc_lat, row.loc_lng),
  serviceZoneId: row.service_zone_id,
  description: row.description,
  verificationStatus: row.verification_status,
  verificationNotes: row.verification_notes,
  courierAvailable: row.courier_available,
  role: row.role,
});

/** The approved partner account a request acts as. */
export interface ActingPartner {
  readonly partnerId: string;
  readonly kind: PartnerKind;
  readonly serviceZoneId: string;
  readonly displayName: string;
  readonly role: 'OWNER' | 'STAFF';
}

/** Header a user with several seller accounts sends to choose one. */
export const SELLER_HEADER = 'x-seller-id';

@Injectable()
export class PartnersService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly zones: ZonesService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Starts onboarding (DRAFT). Works for any signed-in user, whatever their verification state. */
  async apply(userId: string, input: PartnerApplicationRequest): Promise<PartnerAccount> {
    const zoneId = input.location ? (await this.zones.requireActiveZone(input.location.latitude, input.location.longitude)).id : null;
    try {
      const partnerId = await withTransaction(this.pool, async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO partner_accounts (owner_user_id, kind, display_name, legal_name, vat_number, phone, address, location,
                                         service_zone_id, description, operating_hours)
           VALUES ($1, $2, $3, $4, $5, $6, $7,
                   CASE WHEN $8::float8 IS NULL THEN NULL ELSE ${pointSql(8, 9)} END,
                   $10, $11, $12) RETURNING id`,
          [
            userId, input.kind, input.displayName, input.legalName ?? null, input.vatNumber ?? null, input.phone,
            input.address ?? null, input.location?.longitude ?? null, input.location?.latitude ?? null,
            zoneId, input.description ?? null, JSON.stringify(input.operatingHours ?? {}),
          ],
        );
        const id = inserted.rows[0]?.id as string;
        await client.query(`INSERT INTO partner_members (partner_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [id, userId]);
        return id;
      });
      return this.getForMember(userId, partnerId);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(`You already have a ${input.kind} partner account.`);
      }
      throw error;
    }
  }

  async listMine(userId: string): Promise<PartnerAccount[]> {
    const result = await this.pool.query<PartnerRow>(
      `SELECT ${PARTNER_COLUMNS}, m.role FROM partner_accounts p JOIN partner_members m ON m.partner_id = p.id
        WHERE m.user_id = $1 ORDER BY p.created_at`,
      [userId],
    );
    return result.rows.map(toPartner);
  }

  async getForMember(userId: string, partnerId: string): Promise<PartnerAccount> {
    const result = await this.pool.query<PartnerRow>(
      `SELECT ${PARTNER_COLUMNS}, m.role FROM partner_accounts p JOIN partner_members m ON m.partner_id = p.id
        WHERE m.user_id = $1 AND p.id = $2`,
      [userId, partnerId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Partner account not found.');
    }
    return toPartner(row);
  }

  /** Owners edit their application while it is DRAFT or REJECTED (approved data changes go through support). */
  async update(userId: string, partnerId: string, input: UpdatePartnerRequest): Promise<PartnerAccount> {
    const current = await this.getForMember(userId, partnerId);
    if (current.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can edit the partner profile.');
    }
    if (!['DRAFT', 'REJECTED'].includes(current.verificationStatus) && (input.legalName || input.vatNumber)) {
      throw new ConflictException('Legal details of a submitted account cannot be changed. Contact support.');
    }
    const zoneId = input.location ? (await this.zones.requireActiveZone(input.location.latitude, input.location.longitude)).id : null;
    await this.pool.query(
      `UPDATE partner_accounts SET
         display_name = COALESCE($2, display_name), legal_name = COALESCE($3, legal_name),
         vat_number = COALESCE($4, vat_number), phone = COALESCE($5, phone), address = COALESCE($6, address),
         location = CASE WHEN $7::float8 IS NULL THEN location ELSE ${pointSql(7, 8)} END,
         service_zone_id = COALESCE($9, service_zone_id), description = COALESCE($10, description),
         operating_hours = COALESCE($11, operating_hours), updated_at = now()
       WHERE id = $1`,
      [
        partnerId, input.displayName ?? null, input.legalName ?? null, input.vatNumber ?? null, input.phone ?? null,
        input.address ?? null, input.location?.longitude ?? null, input.location?.latitude ?? null, zoneId,
        input.description ?? null, input.operatingHours ? JSON.stringify(input.operatingHours) : null,
      ],
    );
    return this.getForMember(userId, partnerId);
  }

  async submit(userId: string, partnerId: string): Promise<PartnerAccount> {
    const current = await this.getForMember(userId, partnerId);
    if (current.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can submit the application.');
    }
    assertVerificationTransition(current.verificationStatus, 'SUBMITTED', true);
    const missing: string[] = [];
    if (!current.location || !current.serviceZoneId) missing.push('location inside a service zone');
    if (!current.phone) missing.push('phone');
    if (current.kind !== 'COURIER' && !current.address) missing.push('address');
    if (current.kind === 'SHOP' && (!current.legalName || !current.vatNumber)) missing.push('legal name and VAT number');
    if (missing.length > 0) {
      throw new BadRequestException(`Complete your profile before submitting: ${missing.join(', ')}.`);
    }
    await this.pool.query(
      `UPDATE partner_accounts SET verification_status = 'SUBMITTED', submitted_at = now(), updated_at = now() WHERE id = $1`,
      [partnerId],
    );
    return this.getForMember(userId, partnerId);
  }

  /** Admin review. Approval grants the matching capability (SHOP_OWNER / FREELANCE_SELLER / COURIER). */
  async review(adminId: string, partnerId: string, input: ReviewPartnerRequest): Promise<void> {
    const notifyOwner = await withTransaction(this.pool, async (client) => {
      const found = await client.query<{ kind: PartnerKind; verification_status: VerificationStatus; owner_user_id: string; display_name: string }>(
        'SELECT kind, verification_status, owner_user_id, display_name FROM partner_accounts WHERE id = $1 FOR UPDATE',
        [partnerId],
      );
      const partner = found.rows[0];
      if (!partner) {
        throw new NotFoundException('Partner account not found.');
      }
      assertVerificationTransition(partner.verification_status, input.status, false);
      await client.query(
        `UPDATE partner_accounts SET verification_status = $2, verification_notes = $3, reviewed_at = now(), reviewed_by = $4,
           courier_available = CASE WHEN $2 = 'APPROVED' THEN courier_available ELSE false END, updated_at = now()
         WHERE id = $1`,
        [partnerId, input.status, input.notes ?? null, adminId],
      );
      if (input.status === 'APPROVED') {
        await client.query(
          `INSERT INTO user_capabilities (user_id, capability, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [partner.owner_user_id, CAPABILITY_FOR_PARTNER_KIND[partner.kind], adminId],
        );
      }
      await recordAudit(client, adminId, `PARTNER_${input.status}`, 'partner_account', partnerId, { from: partner.verification_status, notes: input.notes });
      return partner;
    });
    await this.notifications.safely(() =>
      this.notifications.notifyUser(notifyOwner.owner_user_id, {
        type: 'PARTNER_VERIFICATION',
        title: 'Flower Man partner account',
        body: `${notifyOwner.display_name}: verification status is now ${input.status}.`,
        data: { partnerId, status: input.status },
      }),
    );
  }

  /** Shop owners add staff by email (the person must already have a Flower Man account). */
  async addStaff(userId: string, partnerId: string, email: string): Promise<void> {
    const partner = await this.getForMember(userId, partnerId);
    if (partner.role !== 'OWNER' || partner.kind !== 'SHOP') {
      throw new ForbiddenException('Only shop owners can add staff.');
    }
    const user = await this.pool.query<{ id: string }>(`SELECT id FROM users WHERE email_normalized = $1 AND status = 'ACTIVE'`, [email.toLowerCase()]);
    const staffId = user.rows[0]?.id;
    if (!staffId) {
      throw new NotFoundException('No active Flower Man account with this email.');
    }
    await withTransaction(this.pool, async (client) => {
      await client.query(`INSERT INTO partner_members (partner_id, user_id, role) VALUES ($1, $2, 'STAFF') ON CONFLICT DO NOTHING`, [partnerId, staffId]);
      await client.query(`INSERT INTO user_capabilities (user_id, capability, granted_by) VALUES ($1, 'SHOP_STAFF', $2) ON CONFLICT DO NOTHING`, [staffId, userId]);
    });
  }

  /** The APPROVED seller account (shop or freelance) this user acts for. */
  async requireSeller(userId: string, requestedSellerId?: string): Promise<ActingPartner> {
    const result = await this.pool.query<{ id: string; kind: PartnerKind; service_zone_id: string; display_name: string; role: 'OWNER' | 'STAFF' }>(
      `SELECT p.id, p.kind, p.service_zone_id, p.display_name, m.role
         FROM partner_accounts p JOIN partner_members m ON m.partner_id = p.id
        WHERE m.user_id = $1 AND p.kind = ANY($2) AND p.verification_status = 'APPROVED'`,
      [userId, SELLER_KINDS],
    );
    const candidates = requestedSellerId ? result.rows.filter((row) => row.id === requestedSellerId) : result.rows;
    if (candidates.length === 0) {
      throw new ForbiddenException('An approved shop or freelance seller account is required.');
    }
    if (candidates.length > 1) {
      throw new BadRequestException(`You manage several seller accounts: send the ${SELLER_HEADER} header.`);
    }
    const row = candidates[0] as (typeof candidates)[number];
    return { partnerId: row.id, kind: row.kind, serviceZoneId: row.service_zone_id, displayName: row.display_name, role: row.role };
  }

  async requireCourier(userId: string): Promise<ActingPartner> {
    const result = await this.pool.query<{ id: string; service_zone_id: string; display_name: string }>(
      `SELECT id, service_zone_id, display_name FROM partner_accounts
        WHERE owner_user_id = $1 AND kind = 'COURIER' AND verification_status = 'APPROVED'`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ForbiddenException('An approved courier account is required.');
    }
    return { partnerId: row.id, kind: 'COURIER', serviceZoneId: row.service_zone_id, displayName: row.display_name, role: 'OWNER' };
  }

  async setCourierAvailability(userId: string, available: boolean): Promise<void> {
    const courier = await this.requireCourier(userId);
    await this.pool.query(
      'UPDATE partner_accounts SET courier_available = $2, courier_last_seen_at = now(), updated_at = now() WHERE id = $1',
      [courier.partnerId, available],
    );
  }

  async listForAdmin(status?: string, kind?: string): Promise<(PartnerAccount & { ownerEmail: string })[]> {
    const result = await this.pool.query<PartnerRow & { owner_email: string }>(
      `SELECT ${PARTNER_COLUMNS}, 'OWNER' AS role, u.email AS owner_email
         FROM partner_accounts p JOIN users u ON u.id = p.owner_user_id
        WHERE ($1::text IS NULL OR p.verification_status = $1) AND ($2::text IS NULL OR p.kind = $2)
        ORDER BY p.submitted_at NULLS LAST, p.created_at LIMIT 500`,
      [status ?? null, kind ?? null],
    );
    return result.rows.map((row) => ({ ...toPartner(row), ownerEmail: row.owner_email }));
  }
}
