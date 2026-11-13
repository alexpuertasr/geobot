/**
 * A promise settled from the outside that nobody may end up awaiting, so its
 * rejection must not crash the process as an unhandled one.
 */
export const deferred = <T>(): PromiseWithResolvers<T> => {
  const resolvers = Promise.withResolvers<T>();
  resolvers.promise.catch(() => {});
  return resolvers;
};
