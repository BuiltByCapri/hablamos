// The email link's last step: the callback turns what the link carries into a
// session cookie. No email is sent. The admin API generates the same magic
// link Supabase would email, and the callback logic exchanges it.
import { afterAll, expect, it } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { admin, deleteUsers, makeUser, uniqueEmail } from "./helpers";
import { completeSignIn } from "../../lib/auth-callback";

afterAll(async () => {
  await deleteUsers();
});

function jarClient(jar: Map<string, string>) {
  return createServerClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_ANON_KEY!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
}

it("a magic link exchanged through the callback leaves a signed-in session cookie", async () => {
  const email = uniqueEmail("callback");
  const { id } = await makeUser(email);
  const { data: link, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(error.message);

  const jar = new Map<string, string>();
  const params = new URLSearchParams({ token_hash: link.properties.hashed_token, type: "magiclink", next: "/invite/abc" });
  const target = await completeSignIn(jarClient(jar), params);

  expect(target).toBe("/invite/abc");
  expect([...jar.keys()].some((k) => k.endsWith("-auth-token") || k.includes("-auth-token."))).toBe(true);

  // A fresh request carrying only those cookies is signed in as the user.
  const { data } = await jarClient(new Map(jar)).auth.getUser();
  expect(data.user?.id).toBe(id);
});

it("a used or bad link sends the user back to sign in with an error", async () => {
  const jar = new Map<string, string>();
  const target = await completeSignIn(jarClient(jar), new URLSearchParams({ token_hash: "nope", type: "magiclink" }));
  expect(target).toMatch(/^\/sign-in\?error=/);
  const none = await completeSignIn(jarClient(jar), new URLSearchParams());
  expect(none).toMatch(/^\/sign-in\?error=/);
});
