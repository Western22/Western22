import type { Messages } from "./en";

/** Recursively optional, for languages that are still being translated. */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : T[K] extends readonly string[] ? string[] : DeepPartial<T[K]> };

export type PartialMessages = DeepPartial<Messages>;
