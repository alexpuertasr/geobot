import * as z from "zod";

import type { SdkLogger } from "../options";

/**
 * Parses GeoGuessr data, or logs why it couldn't and returns `null` — so a
 * change on their side shows up in CloudWatch instead of failing silently.
 */
export const parseOrLog = <Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
  { logger, message }: { logger: SdkLogger; message: string },
): z.output<Schema> | null => {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  logger.error(message, { data, reason: z.prettifyError(result.error) });
  return null;
};

/** `text` as JSON, or `fallback` if it isn't JSON. */
export const parseJsonOr = (text: string, fallback: unknown): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};
