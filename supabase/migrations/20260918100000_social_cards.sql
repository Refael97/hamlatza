begin;
create table public.pick_likes(user_id uuid not null references public.profiles, recommendation_id uuid not null references public.recommendations, created_at timestamptz not null default now(),primary key(user_id,recommendation_id));
create index pick_likes_recommendation_idx on public.pick_likes(recommendation_id);
alter table public.pick_likes enable row level security;
revoke all on public.pick_likes from anon,authenticated;
create function private.like_pick(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); target uuid:=(p->>'id')::uuid; begin
 perform private.throttle('like',120);
 if not exists(select 1 from public.recommendations where id=target and not hidden) then raise exception 'NOT_FOUND'; end if;
 if (p->>'liked')::boolean then insert into public.pick_likes(user_id,recommendation_id) values(u,target) on conflict do nothing;
 else delete from public.pick_likes where user_id=u and recommendation_id=target; end if;
 return jsonb_build_object('ok',true); end $$;
create function public.like_pick(p jsonb) returns jsonb language sql set search_path='' as $$ select private.like_pick(p) $$;
revoke all on function public.like_pick(jsonb),private.like_pick(jsonb) from public,anon,authenticated;
grant execute on function public.like_pick(jsonb),private.like_pick(jsonb) to authenticated,service_role;
create or replace function private.stats(p jsonb) returns jsonb language sql stable security definer set search_path='' as $$
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
 (select count(*) from public.follows where followed_id=pr.id)::int followers,
 (select count(*)::int from public.recommendations w where w.user_id=pr.id and w.status='won' and not exists(select 1 from public.recommendations loss where loss.user_id=pr.id and loss.status='lost' and (loss.published_at,loss.id)>(w.published_at,w.id))) win_streak
 from public.profiles pr left join filtered r on r.user_id=pr.id where pr.status<>'deleted' group by pr.id
) select coalesce(jsonb_agg(to_jsonb(scores) order by score desc),'[]') from scores;
$$;

create or replace function private.app_snapshot(p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb; begin
 select jsonb_build_object(
 'profiles',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.profiles t),
 'events',(select coalesce(jsonb_agg(to_jsonb(t) order by starts_at),'[]') from public.events t),
 'markets',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.markets t),
 'selections',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.selections t),
 'picks',(select coalesce(jsonb_agg(to_jsonb(t) order by published_at desc),'[]') from (select id,user_id,event_id,market_id,selection_id,published_odds,case when hidden then '' else analysis end analysis,case when status='published' and exists(select 1 from public.events e where e.id=r.event_id and e.lock_at<=now()) then 'locked' else status end status,published_at,settled_at,profit_units,published_hash,hidden from public.recommendations r) t),
 'stats',private.stats(p),
 'likes',(select coalesce(jsonb_object_agg(recommendation_id,n),'{}') from (select recommendation_id,count(*) n from public.pick_likes group by recommendation_id) l),
 'liked',(select coalesce(jsonb_agg(recommendation_id),'[]') from public.pick_likes where user_id=u),
 'following',(select coalesce(jsonb_agg(followed_id),'[]') from public.follows where follower_id=u),
 'notifications',(select coalesce(jsonb_agg(to_jsonb(t) order by created_at desc),'[]') from public.notifications t where user_id=u),
 'audit',(select coalesce(jsonb_agg(to_jsonb(t) order by created_at),'[]') from public.audit_logs t where recommendation_id is not null),
 'me',(select to_jsonb(t) from public.profiles t where id=u),
 'role',(select role from private.admins where user_id=u),
 'in_app',(select in_app from private.accounts where user_id=u),
 'auth_id',u
 ) into result;
 return result; end $$;

commit;
