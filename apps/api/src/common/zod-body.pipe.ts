import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Validates a request body against a shared contracts schema: @Body(new ZodBodyPipe(schema)) */
export class ZodBodyPipe<TSchema extends z.ZodType> implements PipeTransform<unknown, z.infer<TSchema>> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: result.error.issues.map((issue) =>
          issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
        ),
        // Kept for the exception filter, which renders them in the client's language.
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
