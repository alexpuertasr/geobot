import * as z from "zod";

/*
 * Every schema here is lenient on purpose: it requires only the fields the
 * SDK reads and keeps the rest (`.loose()`), because GeoGuessr changing a
 * field we don't use must not stop a game.
 */

/**
 * An enum-like field: any string passes at runtime, so a value GeoGuessr
 * adds never drops a frame, but the type offers only the known values, so
 * a typo in a comparison is a compile error.
 */
export const lenientEnum = <Values extends string>() =>
  z.string() as unknown as z.ZodType<Values, string>;
