import type { GeoPoint } from '@flower-man/contracts';

/** SQL for a geography point from two numbered parameters ($lng, $lat order is PostGIS x/y). */
export const pointSql = (longitudeParam: number, latitudeParam: number): string =>
  `ST_SetSRID(ST_MakePoint($${longitudeParam}::float8, $${latitudeParam}::float8), 4326)::geography`;

/** Columns selecting a geography point as {lat,lng} numbers: use with toGeoPoint. */
export const selectPoint = (column: string, alias: string): string =>
  `ST_Y(${column}::geometry) AS ${alias}_lat, ST_X(${column}::geometry) AS ${alias}_lng`;

export function toGeoPoint(latitude: number | null, longitude: number | null): GeoPoint | null {
  return latitude === null || longitude === null ? null : { latitude, longitude };
}
