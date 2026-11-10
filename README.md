# Hablamos

Spanish speaking practice. This is now a Next.js 16 App Router app in TypeScript. The page is a placeholder while the tutor companion is built.

The original voice page and its Claude function are kept in `legacy/` for reference: `legacy/index.html` and `legacy/chat.js`. Nothing serves them.

## Scripts

- `npm run dev`: local dev server.
- `npm run build`: production build.
- `npm test`: unit tests with Vitest.
- `npm run test:rls`: row level security tests, `tests/rls`.
- `npm run e2e`: Playwright tests.

## Environment variables

Copy `.env.example` to `.env.local`.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase client config.
- `SUPABASE_SERVICE_ROLE_KEY`: server only.
- `ANTHROPIC_API_KEY`: the Anthropic key.
- `CLAUDE_MODEL`: model name.
- `CLAUDE_DAILY_CAP`: daily Claude usage cap.
- `RESEND_API_KEY`, `EMAIL_FROM`: outgoing email. Without a key, development and tests log the email instead of sending it, and production refuses to send.
- `CRON_SECRET`: guards cron routes.
- `APP_URL`: public URL of the app, used in sign-in and invite links. Required in production. Development and tests fall back to the request's host.
- `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `SUPABASE_TEST_ANON_KEY`: a separate Supabase project for the RLS tests.

Changing an env var needs a redeploy to take effect.

## Deploying

The Vercel project's framework preset must be changed to Next.js (Project Settings, Build and Deployment). It was "Other" when this was a static page.

## Sign-in

Sign-in is an email link through Supabase Auth. In the Supabase project, under Authentication, URL Configuration, set the Site URL to `APP_URL` and add `<APP_URL>/auth/callback**` to the redirect URLs, plus `http://localhost:3000/auth/callback**` for local development. Without that, Supabase sends people to the Site URL instead of the callback and they arrive signed out.
