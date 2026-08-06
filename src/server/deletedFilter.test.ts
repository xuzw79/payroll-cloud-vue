import assert from "node:assert/strict";
import { deletedFilterFromQuery } from "./deletedFilter.js";

assert.equal(deletedFilterFromQuery({}), false);
assert.equal(deletedFilterFromQuery({ includeDeleted: "true" }), undefined);
assert.equal(deletedFilterFromQuery({ deletedOnly: "true" }), true);
assert.equal(deletedFilterFromQuery({ includeDeleted: "true", deletedOnly: "true" }), true);

console.log("deletedFilter ok");
