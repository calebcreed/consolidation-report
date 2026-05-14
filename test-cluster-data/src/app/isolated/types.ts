
// Pure type definitions - no runtime dependencies
export type ID = string | number;
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export interface Dictionary<T> { [key: string]: T; }
export type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]>; };
export type ValueOf<T> = T[keyof T];
