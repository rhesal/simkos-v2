-- =====================================================================
-- QA: SIMULASI efek supabase/scripts/move_root_files_to_org.mjs di level DB
-- (Postgres lokal tidak punya Storage API). Skrip aslinya dites terpisah
-- dengan stub storage: qa/move-script/move_script.test.mjs.
-- File yang direferensikan -> "<org_id>/<nama sama>", baris diperbarui.
-- File root yang tidak direferensikan (ktp_orphan.jpg) TIDAK dipindah.
-- =====================================================================
insert into qa.ids select 'org1', id from public.organizations where name = 'SimKos';

update storage.objects o set name = t.org_id || '/' || o.name
from public.tenants t
where o.bucket_id = 'ktp_images' and o.name = t.foto_ktp_url and position('/' in o.name) = 0;
update public.tenants set foto_ktp_url = org_id || '/' || foto_ktp_url
where foto_ktp_url is not null and position('/' in foto_ktp_url) = 0;

update storage.objects o set name = e.org_id || '/' || o.name
from public.expenses e
where o.bucket_id = 'receipt_images' and o.name = e.bukti_nota_url and position('/' in o.name) = 0;
update public.expenses set bukti_nota_url = org_id || '/' || bukti_nota_url
where bukti_nota_url is not null and position('/' in bukti_nota_url) = 0;
