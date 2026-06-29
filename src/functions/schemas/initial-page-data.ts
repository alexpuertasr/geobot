import * as z from "zod";

export type InitialPageData = z.infer<typeof initialPageData>;

export const initialPageData = z.object({
  props: z.object({
    pageProps: z.object({
      party: z.object({
        gameSettings: z.object({
          mapSlug: z.string(),
          roundCount: z.number(),
          roundTime: z.number(),
        }),
        joinCode: z.object({
          code: z.string(),
        }),
      }),
    }),
  }),
});
