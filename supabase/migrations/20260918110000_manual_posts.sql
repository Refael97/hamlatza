begin;
alter table public.recommendations alter column event_id drop not null, alter column market_id drop not null, alter column selection_id drop not null, alter column published_odds drop not null;
alter table public.recommendations add constraint manual_post_payload check ((event_id is not null and market_id is not null and selection_id is not null and published_odds is not null) or (event_id is null and market_id is null and selection_id is null and published_odds is null and char_length(trim(analysis)) between 3 and 600 and status='published'));
create function private.publish_post(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); body text:=trim(p->>'analysis'); k uuid:=(p->>'key')::uuid; r public.recommendations; h text; t timestamptz:=clock_timestamp(); begin
 if body is null or char_length(body) not between 3 and 600 or k is null then raise exception 'INVALID_INPUT'; end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 select * into r from public.recommendations where user_id=u and idempotency_key=k;
 if r.id is not null then
 if r.event_id is not null or r.analysis<>body then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return jsonb_build_object('id',r.id); end if;
 perform private.throttle('publish',10);
 if not exists(select 1 from private.accounts where user_id=u and adult) then raise exception 'PROFILE_INCOMPLETE'; end if;
 h:=encode(sha256(convert_to(concat_ws('|',u,body,t),'UTF8')),'hex');
 insert into public.recommendations(user_id,analysis,published_at,published_hash,idempotency_key) values(u,body,t,h,k) returning * into r;
 insert into public.audit_logs(recommendation_id,action,actor,new_value,reason) values(r.id,'published',u,jsonb_build_object('hash',h,'type','manual'),'פרסום פוסט ידני');
 insert into private.outbox(recommendation_id) values(r.id);
 return jsonb_build_object('id',r.id); end $$;
create function public.publish_post(p jsonb) returns jsonb language sql set search_path='' as $$ select private.publish_post(p) $$;
revoke all on function public.publish_post(jsonb),private.publish_post(jsonb) from public,anon,authenticated;
grant execute on function public.publish_post(jsonb),private.publish_post(jsonb) to authenticated,service_role;
commit;
