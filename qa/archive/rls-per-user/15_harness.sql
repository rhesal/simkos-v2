-- QA harness: qa.expect(id, deskripsi, sql, hasil_diharapkan)
-- Menjalankan sql sebagai role/claim yang sedang aktif (security invoker),
-- di dalam subtransaksi yang SELALU di-rollback, lalu mencatat hasilnya.
-- Hasil: 'denied' (error 42501 / RLS violation), 'rows:N', atau 'error:...'.
create schema if not exists qa;
create table if not exists qa.results (
  seq serial primary key, test_id text, descr text, actor text,
  expected text, actual text, pass boolean
);
grant usage on schema qa to anon, authenticated;
grant insert on qa.results to anon, authenticated;
grant usage on sequence qa.results_seq_seq to anon, authenticated;

create or replace function qa.try(sql text) returns text language plpgsql as $$
declare n bigint;
begin
  begin
    execute sql;
    get diagnostics n = row_count;
    raise exception using errcode = 'QA001', message = n::text;
  exception
    when sqlstate 'QA001' then return 'rows:' || sqlerrm;
    when insufficient_privilege then return 'denied';
    when others then return 'error:' || sqlstate || ' ' || sqlerrm;
  end;
end $$;

create or replace function qa.expect(test_id text, descr text, sql text, expected text) returns void
language plpgsql as $$
declare actual text; ok boolean;
begin
  actual := qa.try(sql);
  ok := actual = expected;
  insert into qa.results (test_id, descr, actor, expected, actual, pass)
  values (test_id, descr, current_user || coalesce(' sub=' || auth.uid()::text, ''), expected, actual, ok);
end $$;
grant execute on function qa.try(text), qa.expect(text, text, text, text) to anon, authenticated;
