-- Simulasi SQL dari hasil yang diharapkan skrip move (bukan skrip .mjs itu sendiri):
-- semua path yang dirujuk dan belum berawalan "<org_id>/" dipindah ke "<org_id>/<basename>".
do $$
declare r record;
begin
  for r in
    select 'tenants' t, id, org_id, foto_ktp_url p, 'ktp_images' b from public.tenants where foto_ktp_url is not null
    union all select 'expenses', id, org_id, bukti_nota_url, 'receipt_images' from public.expenses where bukti_nota_url is not null
  loop
    continue when left(r.p, length(r.org_id::text) + 1) = r.org_id::text || '/';
    update storage.objects set name = r.org_id || '/' || regexp_replace(r.p, '^.*/', '') where bucket_id = r.b and name = r.p;
    if r.t = 'tenants' then update public.tenants set foto_ktp_url = r.org_id || '/' || regexp_replace(r.p, '^.*/', '') where id = r.id;
    else update public.expenses set bukti_nota_url = r.org_id || '/' || regexp_replace(r.p, '^.*/', '') where id = r.id; end if;
  end loop;
end $$;
