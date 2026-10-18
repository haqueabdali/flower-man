import { BadRequestException, type PipeTransform } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rejects malformed IDs with 400 before they reach SQL (which would raise a 500 on uuid casts). */
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) {
      throw new BadRequestException('Invalid identifier.');
    }
    return value.toLowerCase();
  }
}
