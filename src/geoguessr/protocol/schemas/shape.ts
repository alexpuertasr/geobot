import * as z from "zod";

/**
 * The words a payload's schema is written in. Every schema describes the
 * payload's full shape, as GeoGuessr has been seen to send it, and is built
 * twice from that one description (see `shape()`).
 */
export type ShapeKit = {
  /** A field the SDK relies on: without it, the payload can't be used. */
  need<T extends z.ZodType>(schema: T): T;
  /** A known field the SDK doesn't rely on: if it drifts, it reads as `undefined`. */
  keep<T extends z.ZodType>(schema: T): z.ZodCatch<z.ZodOptional<T>>;
  /** Like `keep`, for a field GeoGuessr leaves out at times. */
  maybe<T extends z.ZodType>(schema: T): z.ZodCatch<z.ZodOptional<T>>;
  /** An object; fields nobody described are kept. */
  object<Fields extends z.core.$ZodLooseShape>(
    fields: Fields,
  ): z.ZodObject<Fields, z.core.$loose>;
  /** An enum-like string: any value passes, but it's typed as the known ones. */
  oneOf<const Values extends readonly [string, ...string[]]>(
    values: Values,
  ): z.ZodType<Values[number], string>;
  /** A field only ever seen as `null` (or absent), kept as whatever it holds. */
  unseen(): z.ZodType<unknown>;
};

/** What the SDK runs on: GeoGuessr changing a field it doesn't rely on never stops a game. */
const tolerant: ShapeKit = {
  need: (schema) => schema,
  keep: (schema) => schema.optional().catch(undefined),
  maybe: (schema) => schema.optional().catch(undefined),
  object: (fields) => z.looseObject(fields),
  oneOf: () => z.string() as never,
  unseen: () => z.unknown().optional(),
};

/**
 * The description taken literally — a new field, a new enum value, a missing
 * field or a changed type all fail it — to report drift. Only its issues are
 * used, never its output, so its types needn't match (hence the `never`s).
 */
const strict: ShapeKit = {
  need: (schema) => schema,
  keep: (schema) => schema as never,
  maybe: (schema) => schema.optional() as never,
  object: (fields) => z.strictObject(fields) as never,
  oneOf: (values) => z.enum(values),
  unseen: () => z.null().optional(),
};

export type Shape<Schema extends z.ZodType = z.ZodType> = {
  /** Names the payload in logs. */
  name: string;
  runtime: Schema;
  audit: z.ZodType;
};

export type ShapeOutput<S extends Shape> = z.output<S["runtime"]>;

/** A payload's schema, built tolerant to run on and strict to audit with. */
export const shape = <Schema extends z.ZodType>(
  name: string,
  define: (k: ShapeKit) => Schema,
): Shape<Schema> => ({
  name,
  runtime: define(tolerant),
  audit: define(strict),
});
