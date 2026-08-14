import * as z from "zod";

import { member } from "./member";
import { party } from "./party";

export type InitialProps = z.infer<typeof initialProps>;

export const initialProps = z.object({
  buildId: z.string().nullish(),
  props: z.object({
    pageProps: z.object({
      initialParty: party,
      initialMemberInfo: z.object({
        members: z.array(member),
        totalCount: z.number(),
      }),
    }),
  }),
});
