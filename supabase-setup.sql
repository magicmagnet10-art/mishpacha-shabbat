-- הרץ את הקוד הזה ב-Supabase SQL Editor

create table if not exists registrations (
  event_id    text not null,
  couple_name text not null,
  constraint registrations_pkey primary key (event_id, couple_name)
);

alter table registrations enable row level security;

create policy "public_access" on registrations
  for all using (true) with check (true);

alter publication supabase_realtime add table registrations;
