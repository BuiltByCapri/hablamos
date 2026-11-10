-- Supabase's usual default privileges, written down so the schema does not
-- depend on how a project was created. Projects made with the Data API's
-- automatic table exposure turned off start without them, and then every
-- table refuses signed-in users before row-level security is even consulted.
-- RLS and the explicit revokes in later migrations do the actual narrowing.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
