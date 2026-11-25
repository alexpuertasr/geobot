import * as z from "zod";

import { member } from "./entities/member";

export const partyMembersResponse = z.object({
  members: z.array(member),
  totalCount: z.number(),
});
