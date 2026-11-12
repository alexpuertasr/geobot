import * as z from "zod";

import { member } from "./entities/member";
import { party } from "./entities/party";

export type InitialProps = z.infer<typeof initialProps>;

export const initialProps = z.object({
  buildId: z.string().nullish(),
  props: z.object({
    pageProps: z.object({
      mode: z.string().nullish(),
      statusCode: z.number().nullish(),
      initialParty: party.nullish(),
      initialMemberInfo: z
        .object({
          members: z.array(member),
          totalCount: z.number(),
        })
        .nullish(),
    }),
  }),
});
