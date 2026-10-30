import assert from "node:assert/strict";
import { chooseDestination } from "./notification_service.ts";

assert.equal(chooseDestination({ online: true }), "realtime");
assert.equal(chooseDestination({ online: false }), "queue");
console.log("notification destination test passed");
