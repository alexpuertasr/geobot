/** `promise`, unless `signal` aborts first: then a rejection with its reason. */
export const abortable = <T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> => {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
};
