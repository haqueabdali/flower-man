/** Who is asking for a transition. Enforced by the API, never by the client. */
export type Actor = 'CUSTOMER' | 'SELLER' | 'COURIER' | 'ADMIN' | 'SYSTEM';

export interface Transition<S extends string> {
  readonly from: S;
  readonly to: S;
  readonly actors: readonly Actor[];
}

export class TransitionError extends Error {
  override readonly name = 'TransitionError';
}

export function findTransition<S extends string>(
  transitions: readonly Transition<S>[],
  from: S,
  to: S,
  actor: Actor,
): Transition<S> | undefined {
  return transitions.find((t) => t.from === from && t.to === to && t.actors.includes(actor));
}

export function assertTransition<S extends string>(
  name: string,
  transitions: readonly Transition<S>[],
  from: S,
  to: S,
  actor: Actor,
): void {
  if (!findTransition(transitions, from, to, actor)) {
    throw new TransitionError(`${name} cannot go from ${from} to ${to} (requested by ${actor}).`);
  }
}
