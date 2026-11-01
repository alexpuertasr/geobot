import { mergeTests } from "@playwright/test";

import { test as geobotTest } from "./fixtures/geobot";
import { test as playerTest } from "./fixtures/player";

export const test = mergeTests(geobotTest, playerTest);
export { expect } from "@playwright/test";
