-- QA: bucket lain (avatars, publik) untuk memastikan guard tidak mengganggunya.
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
insert into storage.objects (bucket_id, name, owner_id) values ('avatars', 'bbbbbbbb-0000-0000-0000-00000000000b/me.png', 'bbbbbbbb-0000-0000-0000-00000000000b');
create policy avatars_public_read on storage.objects for select to public using (bucket_id = 'avatars');
