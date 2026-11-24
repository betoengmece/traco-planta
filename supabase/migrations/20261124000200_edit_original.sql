create or replace function planta_private.save_reforma(p_id text, p_data jsonb, p_expected_version integer, p_edit_original boolean)
returns table(data jsonb, version integer, updated_at timestamp with time zone)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'codigo invalido';
  end if;
  if p_data is null or pg_column_size(p_data) > 2000000 or
     jsonb_typeof(p_data->'stages') is distinct from 'array' or
     jsonb_typeof(p_data->'original'->'walls') is distinct from 'array' or
     jsonb_typeof(p_data->'original'->'openings') is distinct from 'array' then
    raise exception 'reforma invalida ou grande demais';
  end if;
  return query
    update public.planta_projetos as t
       set data=p_data, version=t.version+1, updated_at=now()
     where t.id=p_id and t.version=p_expected_version
       and (p_edit_original or not (t.data ? 'stages') or t.data->'original'=p_data->'original')
    returning t.data,t.version,t.updated_at;
end;
$$;

revoke all on function planta_private.save_reforma(text,jsonb,integer,boolean) from public;
grant execute on function planta_private.save_reforma(text,jsonb,integer,boolean) to anon,authenticated;


create or replace function planta_private.save_reforma(p_id text, p_data jsonb, p_expected_version integer)
returns table(data jsonb, version integer, updated_at timestamp with time zone)
language sql
security invoker
set search_path = ''
as $$
  select * from planta_private.save_reforma(p_id,p_data,p_expected_version,false);
$$;

create or replace function public.planta_save_original(p_id text, p_data jsonb, p_expected_version integer)
returns table(data jsonb, version integer, updated_at timestamp with time zone)
language sql
security invoker
set search_path = ''
as $$
  select * from planta_private.save_reforma(p_id,p_data,p_expected_version,true);
$$;

revoke all on function public.planta_save_original(text,jsonb,integer) from public;
grant execute on function public.planta_save_original(text,jsonb,integer) to anon,authenticated;
