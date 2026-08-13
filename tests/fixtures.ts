import { mergeTests } from "@playwright/test";

import { test as geobotTest } from "./fixtures/geobot";
import { test as guestTest } from "./fixtures/guest";

export const test = mergeTests(geobotTest, guestTest);
export { expect } from "@playwright/test";
