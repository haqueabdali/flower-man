/** A migration could not be planned or applied. Messages never contain connection secrets. */
export class MigrationError extends Error {
  override readonly name = 'MigrationError';
}
