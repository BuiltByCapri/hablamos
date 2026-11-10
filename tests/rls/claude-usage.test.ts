import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, deleteUsers, makeUser, uniqueEmail } from "./helpers";

let user: Awaited<ReturnType<typeof makeUser>>;
const day = "2030-01-01";

beforeAll(async () => {
  user = await makeUser(uniqueEmail("usage"));
});
afterAll(deleteUsers);

describe("increment_claude_usage", () => {
  it("is not executable by an authenticated user", async () => {
    const { error } = await user.client.rpc("increment_claude_usage", { p_user: user.id, p_day: day });
    expect(error).not.toBeNull();
  });

  it("counts two concurrent increments as 2", async () => {
    const results = await Promise.all([
      admin().rpc("increment_claude_usage", { p_user: user.id, p_day: day }),
      admin().rpc("increment_claude_usage", { p_user: user.id, p_day: day }),
    ]);
    results.forEach((r) => expect(r.error).toBeNull());
    expect(results.map((r) => r.data).sort()).toEqual([1, 2]);
    const { data } = await admin().from("claude_usage").select("calls").eq("user_id", user.id).eq("day", day).single();
    expect(data?.calls).toBe(2);
  });
});
