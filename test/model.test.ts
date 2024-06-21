import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { emit } from "./test-host.js";

describe("Model", () => {
  it("simple model", async () => {
    const results = await emit("model Person { firstName: string; lastName: string; }");
    let tsSource = results["models.ts"];
    tsSource = tsSource.replace(/\s+/g, " ").trimEnd();
    strictEqual(tsSource, "type Person = { firstName: string; lastName: string; };");
  });
})
