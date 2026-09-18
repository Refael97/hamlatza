begin;
-- Canonical schema. See migrations for the deployable copy.
create schema if not exists private;
create table public.profiles (
 id uuid primary key, nickname text not null check(char_length(nickname) between 3 and 24),
 bio text not null default '' check(char_length(bio)<=300), avatar integer not null default 0 check(avatar between 0 and 19),
 status text not null default 'active' check(status in ('active','suspended','deleted')),
 created_at timestamptz not null default now(), nickname_changed_at timestamptz
);
create unique index profiles_nickname on public.profiles(lower(nickname));
create table private.accounts (user_id uuid primary key references public.profiles, full_name text not null, adult boolean not null check(adult), terms_version text not null, accepted_at timestamptz not null default now(), in_app boolean not null default true);
create table private.admins(user_id uuid primary key references public.profiles, role text not null check(role in ('admin','moderator','data_operator','support')));
create table public.events (
 id uuid primary key default gen_random_uuid(), sport text not null check(sport in ('football','basketball')), league text not null,
 home text not null, away text not null, starts_at timestamptz not null, lock_at timestamptz not null,
 status text not null default 'scheduled' check(status in ('scheduled','live','finished','postponed','canceled')),
 source text not null, external_id text not null, is_demo boolean not null default false,
 updated_at timestamptz not null default now(), unique(source,external_id), check(lock_at<=starts_at)
);
create table public.markets(id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events,
 code text not null, label text not null, line_value numeric, rule_version text not null default '1', status text not null default 'open' check(status in ('open','suspended','closed','settled')),
 unique(event_id,code));
create table public.selections(id uuid primary key default gen_random_uuid(), market_id uuid not null references public.markets,
 code text not null, label text not null, odds numeric(10,4) not null check(odds>1 and odds<=1000), updated_at timestamptz not null default now(), unique(market_id,code));
create table public.recommendations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles,
 event_id uuid not null references public.events, market_id uuid not null references public.markets, selection_id uuid not null references public.selections,
 published_odds numeric(10,4) not null, analysis text not null default '' check(char_length(analysis)<=600),
 status text not null default 'published' check(status in ('published','locked','won','lost','void','postponed','disputed')),
 published_at timestamptz not null default now(), settled_at timestamptz, profit_units numeric(12,4), published_hash text not null,
 hidden boolean not null default false, idempotency_key uuid not null,
 unique(user_id,market_id), unique(user_id,idempotency_key)
);
create table public.audit_logs(id uuid primary key default gen_random_uuid(), recommendation_id uuid references public.recommendations, action text not null, actor uuid, old_value jsonb, new_value jsonb, reason text not null, created_at timestamptz not null default now());
create table public.follows(follower_id uuid references public.profiles, followed_id uuid references public.profiles, created_at timestamptz not null default now(), primary key(follower_id,followed_id), check(follower_id<>followed_id));
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles, type text not null, title text not null, href text not null, dedup_key text not null, read_at timestamptz, created_at timestamptz not null default now(), unique(user_id,dedup_key));
create table public.reports(id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles, target_type text not null check(target_type in ('pick','profile')), target_id uuid not null, reason text not null check(char_length(reason) between 3 and 1000), status text not null default 'open', created_at timestamptz not null default now());
create table private.outbox(id uuid primary key default gen_random_uuid(), recommendation_id uuid unique not null references public.recommendations, created_at timestamptz not null default now(), processed_at timestamptz, attempts integer not null default 0, last_error text);
create table private.rate_limits(user_id uuid not null, action text not null, bucket_start timestamptz not null, count integer not null, primary key(user_id,action,bucket_start));
create table private.provider_runs(id uuid primary key default gen_random_uuid(), provider text not null, status text not null, details text, created_at timestamptz not null default now());
create index recommendations_time on public.recommendations(published_at desc);
create index recommendations_user on public.recommendations(user_id,published_at);
create index notifications_user on public.notifications(user_id,created_at desc);
create index events_lock on public.events(lock_at);
create index follows_target on public.follows(followed_id);

-- Immutable publication payload, even if a future policy accidentally allows UPDATE.
create function private.guard_pick() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'PUBLISHED_IMMUTABLE'; end if;
 if (new.user_id,new.event_id,new.market_id,new.selection_id,new.published_odds,new.analysis,new.published_at,new.published_hash,new.idempotency_key) is distinct from (old.user_id,old.event_id,old.market_id,old.selection_id,old.published_odds,old.analysis,old.published_at,old.published_hash,old.idempotency_key) then raise exception 'PUBLISHED_IMMUTABLE'; end if;
 return new;
end $$;
create trigger immutable_pick before update or delete on public.recommendations for each row execute function private.guard_pick();
create function private.guard_audit() returns trigger language plpgsql as $$ begin raise exception 'AUDIT_IMMUTABLE'; end $$;
create trigger immutable_audit before update or delete on public.audit_logs for each row execute function private.guard_audit();

create function private.require_user() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); begin
 if u is null or not exists(select 1 from public.profiles where id=u and status='active') then raise exception 'AUTH_REQUIRED'; end if; return u; end $$;
create function private.require_role(roles text[]) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); begin
 if not exists(select 1 from private.admins where user_id=u and role=any(roles)) then raise exception 'FORBIDDEN'; end if; return u; end $$;
create function private.throttle(a text, max_count integer) returns void language plpgsql security definer set search_path='' as $$
declare n integer; u uuid:=private.require_user(); begin
 insert into private.rate_limits values(u,a,date_trunc('minute',now()),1) on conflict(user_id,action,bucket_start) do update set count=private.rate_limits.count+1 returning count into n;
 if n>max_count then raise exception 'RATE_LIMIT'; end if; end $$;

create function private.save_profile(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); old public.profiles; nick text:=trim(p->>'nickname'); begin
 if u is null then raise exception 'AUTH_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 select * into old from public.profiles where id=u for update;
 if old.status in ('suspended','deleted') then raise exception 'FORBIDDEN'; end if;
 if nick !~ '^[a-zA-Z0-9א-ת_]{3,24}$' then raise exception 'INVALID_NICKNAME'; end if;
 if old.id is not null and nick<>old.nickname and old.nickname_changed_at>now()-interval '30 days' then raise exception 'NICKNAME_COOLDOWN'; end if;
 if old.id is null and (coalesce((p->>'adult')::boolean,false)=false or coalesce((p->>'terms')::boolean,false)=false or length(trim(p->>'full_name'))<2) then raise exception 'PROFILE_INCOMPLETE'; end if;
 insert into public.profiles(id,nickname,bio,avatar) values(u,nick,coalesce(p->>'bio',''),coalesce((p->>'avatar')::int,0)) on conflict(id) do update set nickname=excluded.nickname,bio=excluded.bio,avatar=excluded.avatar,nickname_changed_at=case when profiles.nickname<>excluded.nickname then now() else profiles.nickname_changed_at end;
 if old.id is null then insert into private.accounts(user_id,full_name,adult,terms_version) values(u,p->>'full_name',true,'2026-09-17'); end if;
 return jsonb_build_object('id',u); end $$;

create function private.publish_pick(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); s public.selections; m public.markets; e public.events; r public.recommendations; t timestamptz:=clock_timestamp(); k uuid:=(p->>'key')::uuid; h text; begin
 perform pg_advisory_xact_lock(hashtext(u::text));
 select * into r from public.recommendations where user_id=u and idempotency_key=k;
 if r.id is not null then
 if r.selection_id<>(p->>'selection_id')::uuid then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 return jsonb_build_object('id',r.id); end if;
 perform private.throttle('publish',10);
 if not exists(select 1 from private.accounts where user_id=u and adult) then raise exception 'PROFILE_INCOMPLETE'; end if;
 select * into s from public.selections where id=(p->>'selection_id')::uuid for share;
 select * into m from public.markets where id=s.market_id for share;
 select * into e from public.events where id=m.event_id for share;
 if e.id is null or e.status<>'scheduled' or m.status<>'open' or clock_timestamp()>=e.lock_at then raise exception 'EVENT_LOCKED'; end if;
 if s.odds<>(p->>'odds')::numeric then raise exception 'ODDS_CHANGED'; end if;
 if exists(select 1 from public.recommendations where user_id=u and market_id=m.id) then raise exception 'DUPLICATE_MARKET'; end if;
 h:=encode(sha256(convert_to(concat_ws('|',u,e.id,m.id,s.id,s.odds,t),'UTF8')),'hex');
 insert into public.recommendations(user_id,event_id,market_id,selection_id,published_odds,analysis,published_at,published_hash,idempotency_key)
 values(u,e.id,m.id,s.id,s.odds,coalesce(p->>'analysis',''),t,h,k) returning * into r;
 insert into public.audit_logs(recommendation_id,action,actor,new_value,reason) values(r.id,'published',u,jsonb_build_object('odds',s.odds,'hash',h),'פרסום ונעילת פרטי ההמלצה');
 insert into private.outbox(recommendation_id) values(r.id);
 return jsonb_build_object('id',r.id); end $$;

create function private.follow_user(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); target uuid:=(p->>'id')::uuid; begin
 perform private.throttle('follow',30);
 if target=u then raise exception 'SELF_FOLLOW'; end if;
 if (p->>'follow')::boolean then
 if not exists(select 1 from public.profiles where id=target and status='active') then raise exception 'NOT_FOUND'; end if;
 insert into public.follows values(u,target,now()) on conflict do nothing;
 insert into public.notifications(user_id,type,title,href,dedup_key) select target,'follow','עוקב חדש בפרופיל שלך','/tipsters/'||nickname,'follow:'||u from public.profiles where id=u on conflict do nothing;
 else delete from public.follows where follower_id=u and followed_id=target; end if;
 return '{}'::jsonb; end $$;

create function private.process_jobs() returns jsonb language plpgsql security definer set search_path='' as $$
declare job record; n int:=0; begin
 update public.recommendations r set status='locked' from public.events e where r.event_id=e.id and r.status='published' and e.lock_at<=now();
 for job in select * from private.outbox where processed_at is null and attempts<5 order by created_at limit 100 for update skip locked loop
 begin
 insert into public.notifications(user_id,type,title,href,dedup_key)
 select f.follower_id,'pick','המלצה חדשה של '||p.nickname,'/picks/'||r.id,'pick:'||r.id
 from public.recommendations r join public.profiles p on p.id=r.user_id join public.follows f on f.followed_id=r.user_id join private.accounts a on a.user_id=f.follower_id
 where r.id=job.recommendation_id and f.created_at<=r.published_at and a.in_app
 on conflict do nothing;
 update private.outbox set processed_at=now() where id=job.id; n:=n+1;
 exception when others then update private.outbox set attempts=attempts+1,last_error=SQLSTATE where id=job.id; end;
 end loop;
 return jsonb_build_object('processed',n); end $$;

create function private.settle_market(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; m public.markets; r record; outcome text; profit numeric; reason text:=trim(p->>'reason'); override boolean:=coalesce((p->>'override')::boolean,false); begin
 if auth.uid() is not null then u:=private.require_role(array['admin','data_operator']);
 elsif current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception 'FORBIDDEN'; end if;
 if length(coalesce(reason,''))<5 then raise exception 'REASON_REQUIRED'; end if;
 select * into m from public.markets where id=(p->>'market_id')::uuid for update;
 if m.id is null then raise exception 'NOT_FOUND'; end if;
 if not coalesce((p->>'void')::boolean,false) and not exists(select 1 from public.selections where market_id=m.id and code=p->>'winner') then raise exception 'INVALID_WINNER'; end if;
 if (select starts_at>now() from public.events where id=m.event_id) and not (select is_demo from public.events where id=m.event_id) then raise exception 'EVENT_NOT_STARTED'; end if;
 if m.status='settled' and not override then return jsonb_build_object('already_settled',true); end if;
 for r in select rec.*,s.code from public.recommendations rec join public.selections s on s.id=rec.selection_id where rec.market_id=m.id for update of rec loop
 outcome:=case when coalesce((p->>'void')::boolean,false) then 'void' when r.code=p->>'winner' then 'won' else 'lost' end;
 profit:=case when outcome='won' then r.published_odds-1 when outcome='lost' then -1 else 0 end;
 if r.status=outcome and r.profit_units=profit then continue; end if;
 update public.recommendations set status=outcome,profit_units=profit,settled_at=now() where id=r.id;
 insert into public.audit_logs(recommendation_id,action,actor,old_value,new_value,reason) values(r.id,case when override then 'override' else 'settled' end,u,jsonb_build_object('status',r.status,'profit_units',r.profit_units),jsonb_build_object('status',outcome,'profit_units',profit,'source',coalesce(p->>'source','manual')),reason);
 insert into public.notifications(user_id,type,title,href,dedup_key) values(r.user_id,'result','עודכנה תוצאת ההמלצה שלך','/picks/'||r.id,'result:'||r.id||':'||outcome) on conflict do nothing;
 end loop;
 update public.markets set status='settled' where id=m.id;
 if not exists(select 1 from public.markets where event_id=m.event_id and status<>'settled') then update public.events set status='finished' where id=m.event_id; end if;
 return '{}'::jsonb; end $$;

create function private.stats(p jsonb) returns jsonb language sql stable security definer set search_path='' as $$
with filtered as (
 select r.* from public.recommendations r join public.events e on e.id=r.event_id
 where r.status in ('won','lost') and (coalesce(p->>'days','all')='all' or r.published_at>=now()-make_interval(days => case when p->>'days'='30' then 30 else 90 end))
 and (coalesce(p->>'sport','all')='all' or e.sport=p->>'sport') and (coalesce(p->>'league','all')='all' or e.league=p->>'league')
), scores as (
 select pr.id,pr.nickname,pr.avatar,pr.bio,pr.created_at,count(r.id)::int settled,
 count(r.id) filter(where r.status='won')::int wins,coalesce(sum(r.profit_units),0) units,
 coalesce(round(100.0*count(r.id) filter(where r.status='won')/nullif(count(r.id),0),2),0) hit_rate,
 coalesce(round(100*sum(r.profit_units)/nullif(count(r.id),0),2),0) roi,
 coalesce(round(avg(r.published_odds),2),0) average_odds,
 coalesce(round(100*sum(r.profit_units)/(count(r.id)+30),2),0) score,
 (select count(*) from public.follows where followed_id=pr.id)::int followers
 from public.profiles pr left join filtered r on r.user_id=pr.id where pr.status<>'deleted' group by pr.id
) select coalesce(jsonb_agg(to_jsonb(scores) order by score desc),'[]') from scores;
$$;

-- One read RPC gives a consistent, privacy-preserving application snapshot.
create function private.app_snapshot(p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb; begin
 select jsonb_build_object(
 'profiles',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.profiles t),
 'events',(select coalesce(jsonb_agg(to_jsonb(t) order by starts_at),'[]') from public.events t),
 'markets',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.markets t),
 'selections',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.selections t),
 'picks',(select coalesce(jsonb_agg(to_jsonb(t) order by published_at desc),'[]') from (select id,user_id,event_id,market_id,selection_id,published_odds,case when hidden then '' else analysis end analysis,case when status='published' and exists(select 1 from public.events e where e.id=r.event_id and e.lock_at<=now()) then 'locked' else status end status,published_at,settled_at,profit_units,published_hash,hidden from public.recommendations r) t),
 'stats',private.stats(p),
 'following',(select coalesce(jsonb_agg(followed_id),'[]') from public.follows where follower_id=u),
 'notifications',(select coalesce(jsonb_agg(to_jsonb(t) order by created_at desc),'[]') from public.notifications t where user_id=u),
 'audit',(select coalesce(jsonb_agg(to_jsonb(t) order by created_at),'[]') from public.audit_logs t where recommendation_id is not null),
 'me',(select to_jsonb(t) from public.profiles t where id=u),
 'role',(select role from private.admins where user_id=u),
 'in_app',(select in_app from private.accounts where user_id=u),
 'auth_id',u
 ) into result;
 return result; end $$;

create function private.account_action(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); begin
 if p->>'action'='read' then update public.notifications set read_at=now() where user_id=u and (p->>'id'='all' or id::text=p->>'id');
 elsif p->>'action'='preferences' then update private.accounts set in_app=(p->>'in_app')::boolean where user_id=u;
 elsif p->>'action'='export' then return jsonb_build_object('profile',(select to_jsonb(t) from public.profiles t where id=u),'private',(select to_jsonb(t) from private.accounts t where user_id=u),'picks',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.recommendations t where user_id=u),'notifications',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.notifications t where user_id=u));
 elsif p->>'action'='delete' then
 update public.profiles set nickname='deleted_'||substr(replace(u::text,'-',''),1,16),bio='',avatar=0,status='deleted' where id=u;
 delete from private.accounts where user_id=u; delete from public.follows where follower_id=u or followed_id=u; delete from public.notifications where user_id=u;
 elsif p->>'action'='report' then
 perform private.throttle('report',5);
 insert into public.reports(reporter_id,target_type,target_id,reason) values(u,p->>'target_type',(p->>'target_id')::uuid,p->>'reason');
 else raise exception 'INVALID_ACTION'; end if;
 return '{}'::jsonb; end $$;

create function private.admin_action(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; r jsonb; eid uuid; mid uuid; row jsonb; reason text:=trim(p->>'reason'); begin
 if p->>'action'='overview' then
 perform private.require_role(array['admin','moderator','data_operator','support']);
 return jsonb_build_object('reports',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.reports t),'jobs',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from private.outbox t where processed_at is null),'runs',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from private.provider_runs t)); end if;
 if length(coalesce(reason,''))<5 then raise exception 'REASON_REQUIRED'; end if;
 if p->>'action' in ('suspend','resolve','hide') then
 u:=private.require_role(array['admin','moderator']);
 if p->>'action'='suspend' then update public.profiles set status=case when coalesce((p->>'suspend')::boolean,true) then 'suspended' else 'active' end where id=(p->>'id')::uuid and id<>u;
 elsif p->>'action'='resolve' then update public.reports set status='resolved' where id=(p->>'id')::uuid;
 else update public.recommendations set hidden=true where id=(p->>'id')::uuid; end if;
 elsif p->>'action'='import' then
 u:=private.require_role(array['admin','data_operator']);
 if jsonb_array_length(p->'rows')>1000 then raise exception 'IMPORT_TOO_LARGE'; end if;
 for row in select * from jsonb_array_elements(p->'rows') loop
 if (row->>'starts_at')::timestamptz<=now()+interval '2 minutes' then raise exception 'EVENT_LOCKED'; end if;
 insert into public.events(sport,league,home,away,starts_at,lock_at,source,external_id,is_demo) values(row->>'sport_code',row->>'league_name',row->>'home_participant',row->>'away_participant',(row->>'starts_at')::timestamptz,(row->>'starts_at')::timestamptz-interval '2 minutes','manual',row->>'external_event_id',false)
 on conflict(source,external_id) do nothing returning id into eid;
 if eid is null then
 select id into eid from public.events where source='manual' and external_id=row->>'external_event_id';
 if exists(select 1 from public.events where id=eid and (home<>row->>'home_participant' or away<>row->>'away_participant' or starts_at<>(row->>'starts_at')::timestamptz)) then raise exception 'EVENT_MAPPING_CONFLICT'; end if; end if;
 insert into public.markets(event_id,code,label,line_value) values(eid,row->>'market_code',coalesce(row->>'market_label_he',row->>'market_code'),nullif(row->>'line_value','')::numeric) on conflict(event_id,code) do nothing returning id into mid;
 if mid is null then select id into mid from public.markets where event_id=eid and code=row->>'market_code'; end if;
 insert into public.selections(market_id,code,label,odds,updated_at) values(mid,row->>'selection_code',row->>'selection_label_he',(row->>'decimal_odds')::numeric,(row->>'source_updated_at')::timestamptz) on conflict(market_id,code) do update set odds=excluded.odds,updated_at=excluded.updated_at;
 end loop;
 else raise exception 'INVALID_ACTION'; end if;
 insert into public.audit_logs(action,actor,new_value,reason) values(p->>'action',u,p-'rows',reason);
 return '{}'::jsonb; end $$;

-- Deny direct writes, including server-side clients with end-user credentials.
DO $$ declare t record; begin for t in select schemaname,tablename from pg_tables where schemaname in ('public','private') loop execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename); end loop; end $$;
revoke all on all tables in schema public,private from anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
grant usage on schema private to anon,authenticated,service_role;
-- Public RPC wrappers are invokers, private implementations have narrowly granted execution.
create function public.app_snapshot(p jsonb default '{}') returns jsonb language sql set search_path='' as $$ select private.app_snapshot(p) $$;
create function public.save_profile(p jsonb) returns jsonb language sql set search_path='' as $$ select private.save_profile(p) $$;
create function public.publish_pick(p jsonb) returns jsonb language sql set search_path='' as $$ select private.publish_pick(p) $$;
create function public.follow_user(p jsonb) returns jsonb language sql set search_path='' as $$ select private.follow_user(p) $$;
create function public.account_action(p jsonb) returns jsonb language sql set search_path='' as $$ select private.account_action(p) $$;
create function public.admin_action(p jsonb) returns jsonb language sql set search_path='' as $$ select private.admin_action(p) $$;
create function public.settle_market(p jsonb) returns jsonb language sql set search_path='' as $$ select private.settle_market(p) $$;
create function public.process_jobs() returns jsonb language sql set search_path='' as $$ select private.process_jobs() $$;
revoke all on all functions in schema public from public,anon,authenticated;
grant execute on function public.app_snapshot(jsonb),private.app_snapshot(jsonb) to anon,authenticated;
grant execute on function public.save_profile(jsonb),private.save_profile(jsonb),public.publish_pick(jsonb),private.publish_pick(jsonb),public.follow_user(jsonb),private.follow_user(jsonb),public.account_action(jsonb),private.account_action(jsonb),public.admin_action(jsonb),private.admin_action(jsonb),public.settle_market(jsonb),private.settle_market(jsonb) to authenticated;
grant execute on all functions in schema public,private to service_role;

commit;
