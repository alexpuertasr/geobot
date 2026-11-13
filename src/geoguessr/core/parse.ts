/** `text` as JSON, or `fallback` if it isn't JSON. */
export const parseJsonOr = (text: string, fallback: unknown): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};
