import type { ZoneCheckResponse } from '@flower-man/contracts';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { ZonesService } from './zones.service.js';

export function parseCoordinates(lat: string | undefined, lng: string | undefined): { latitude: number; longitude: number } {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (lat === undefined || lng === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new BadRequestException('lat and lng query parameters are required (decimal degrees).');
  }
  return { latitude, longitude };
}

@Controller('zones')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  /** Public: "do you deliver here?" */
  @Get('check')
  async check(@Query('lat') lat?: string, @Query('lng') lng?: string): Promise<ZoneCheckResponse> {
    const { latitude, longitude } = parseCoordinates(lat, lng);
    const zone = await this.zones.findActiveZone(latitude, longitude);
    return { served: zone !== null, zone };
  }
}
