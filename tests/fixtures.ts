import { mergeTests } from "@playwright/test";

import { test as geobotTest } from "./fixtures/geobot";
import { test as guestTest } from "./fixtures/guest";
import { test as ownerTest } from "./fixtures/owner";

export const test = mergeTests(geobotTest, ownerTest, guestTest);
export { expect } from "@playwright/test";
