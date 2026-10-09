// Public ESPN feeds only. No credentials, model calls, or server dependencies.
export const TIME_ZONE = 'America/Los_Angeles';
const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const memory = new Map();
const pending = new Map();
const CACHE_PREFIX = 'ballknower:feed:v1:';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {timeZone: TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit'});
const clockFormatter = new Intl.DateTimeFormat('en-US', {timeZone: TIME_ZONE, hour:'numeric', minute:'2-digit', timeZoneName:'short'});

export function localDate(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const p = Object.fromEntries(dateFormatter.formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function addDays(day, count) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0,10);
}
export function targetSaturday(offset = 0, now = new Date()) {
  if (!Number.isInteger(offset) || Math.abs(offset) > 104) throw new Error('Choose a week within two years.');
  const day = localDate(now);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, (6 - weekday + 7) % 7 + offset * 7);
}
export function localHour(value) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:TIME_ZONE, hourCycle:'h23', hour:'2-digit', minute:'2-digit'}).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return Number(p.hour) + Number(p.minute) / 60;
}
export function timeLabel(value) { return value && localDate(value) ? clockFormatter.format(new Date(value)) : 'Time TBA'; }

function readCache(url, storage) {
  if (memory.has(url)) return memory.get(url);
  try { return JSON.parse(storage?.getItem(CACHE_PREFIX + url) || 'null'); } catch { return null; }
}
function writeCache(url, value, storage) {
  memory.delete(url);
  memory.set(url, value);
  if (memory.size > 80) memory.delete(memory.keys().next().value);
  try {
    const keys = Object.keys(storage || {}).filter(k => k.startsWith(CACHE_PREFIX));
    if (keys.length >= 80) storage.removeItem(keys[0]);
    storage?.setItem(CACHE_PREFIX + url, JSON.stringify(value));
  } catch { /* Private mode or full storage: the in-memory cache still works. */ }
}
export function clearMemoryCache() { memory.clear(); pending.clear(); }

export async function fetchFeed(url, {ttl = 60000, maxStale = 21600000, fetcher = globalThis.fetch, storage, now = Date.now()} = {}) {
  if (storage === undefined) { try { storage = globalThis.sessionStorage; } catch { storage = null; } }
  const cached = readCache(url, storage);
  const valid = cached && Number.isFinite(cached.at) && Array.isArray(cached.data?.events);
  if (valid && now >= cached.at && now - cached.at < ttl) return {...cached, stale:false};
  if (pending.has(url)) return pending.get(url);
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetcher(url, {signal:controller.signal, credentials:'omit'});
      if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data?.events)) throw new Error('Unexpected ESPN response');
      const value = {at:now, data};
      writeCache(url, value, storage);
      return {...value, stale:false};
    } catch (error) {
      if (valid && now >= cached.at && now - cached.at < maxStale) return {...cached, stale:true};
      throw error;
    } finally { clearTimeout(timeout); }
  })();
  pending.set(url, request);
  try { return await request; } finally { pending.delete(url); }
}

function broadcasts(comp) {
  const names = (comp.broadcasts || []).flatMap(b => b.names || (b.media?.shortName ? [b.media.shortName] : []));
  if (!names.length && comp.broadcast) names.push(comp.broadcast);
  if (!names.length) names.push(...(comp.geoBroadcasts || []).filter(b => !b.region || b.region === 'us').map(b => b.media?.shortName).filter(Boolean));
  return [...new Set(names.map(x => /^fox$/i.test(x) ? 'FOX' : x))];
}
function scoreValue(score) {
  const value = typeof score === 'object' && score !== null ? score.displayValue ?? score.value : score;
  return value === undefined || value === null || value === '' ? null : String(value);
}
function record(comp) {
  const list = comp.records || comp.record || [];
  const r = list.find(r => r.type === 'total') || list[0];
  return r?.summary || r?.displayValue || null;
}
function team(comp) {
  const rank = comp.curatedRank?.current;
  return {id:String(comp.team?.id || comp.id || ''), name:comp.team?.displayName || 'Team TBA',
    abbreviation:comp.team?.abbreviation, rank:rank >= 1 && rank <= 25 ? rank : null,
    record:record(comp), score:scoreValue(comp.score)};
}
function sourceUrl(event, sport) {
  // Construct the known ESPN destination rather than following arbitrary feed links.
  return /^\d+$/.test(String(event.id)) ? `https://www.espn.com/${sport}/game/_/gameId/${event.id}` : null;
}
export function liveAlerts(event) {
  if (event.state !== 'in') return [];
  const [a,b] = [event.team1,event.team2];
  if (a?.score == null || b?.score == null) return [];
  const diff = Number(a.score) - Number(b.score);
  if (!Number.isFinite(diff)) return [];
  const alerts = [];
  if (event.period >= 4 && Math.abs(diff) <= 8 && (a.rank || b.rank)) alerts.push('One-score finish');
  const leader = diff > 0 ? a : b, trailer = diff > 0 ? b : a;
  if (diff !== 0 && event.period >= 3 && !leader.rank && trailer.rank) alerts.push('Upset watch');
  return alerts;
}
export function normalizeCfb(events, day) {
  const out = [];
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp || localDate(comp.date || ev.date) !== day) continue;
    const competitors = [...(comp.competitors || [])].sort((a,b) => (a.homeAway === 'away' ? -1 : 1) - (b.homeAway === 'away' ? -1 : 1));
    if (competitors.length < 2) continue;
    const [a,b] = competitors.map(team);
    const when = comp.date || ev.date;
    const status = comp.status || ev.status || {};
    const timingKnown = comp.timeValid !== false && !/TBD|TBA|POSTPONED|CANCELED/i.test(status.type?.name || '');
    const channels = broadcasts(comp);
    const odds = comp.odds?.[0];
    const line = [odds?.details, odds?.overUnder != null ? `O/U ${odds.overUnder}` : null].filter(Boolean).join(' • ');
    const event = {
      id:String(ev.id), category:'CFB', title:[a,b].map(t => `${t.rank ? `#${t.rank} ` : ''}${t.name}`).join(' vs '),
      channel:channels[0] || 'Network TBA', channels, start_at:when,
      start_hour:timingKnown ? localHour(when) : null, duration_hours:3.5,
      time_display:timingKnown ? timeLabel(when) : 'Time TBA',
      status:status.type?.state === 'pre' && timingKnown ? 'Scheduled' : status.type?.shortDetail || status.type?.detail || 'Scheduled', state:status.type?.state || 'pre', period:status.period || 0,
      betting_line:line || null, odds_provider:odds?.provider?.displayName || odds?.provider?.name || null,
      team1:a, team2:b, season:ev.season?.year || Number(day.slice(0,4)), season_type:ev.season?.type || 2,
      url:sourceUrl(ev,'college-football'), venue:comp.venue?.fullName || null,
    };
    event.alerts = liveAlerts(event);
    out.push(event);
  }
  return out;
}
export function normalizeUfc(events, day) {
  const out = [];
  for (const ev of events) {
    // An event can begin on Saturday even when its main card is dated Sunday UTC.
    const groups = new Map();
    for (const comp of ev.competitions || []) {
      const when = comp.date || ev.date;
      if (localDate(when) !== day) continue;
      const channels = broadcasts(comp);
      const key = `${when}|${channels.join('|')}`;
      if (!groups.has(key)) groups.set(key, {when,channels,comps:[]});
      groups.get(key).comps.push(comp);
    }
    for (const [key, group] of groups) {
      const bouts = group.comps.map((c, i) => {
        const fighters = (c.competitors || []).map(f => ({name:f.athlete?.displayName || 'Fighter TBA', record:record(f) || 'Record unavailable', winner:f.winner === true}));
        return {id:c.id, bout_number:i+1, status:c.status?.type?.state === 'post' ? c.status.type.shortDetail || 'Final' : `Bout ${i+1}`,
          weight_class:c.type?.text || c.type?.abbreviation || 'Division unavailable', fighter1:fighters[0],fighter2:fighters[1],
          time_display:'Individual start time unavailable'};
      });
      const known = group.comps.some(c => c.timeValid !== false);
      out.push({id:`ufc-${ev.id}-${key}`,category:'UFC',is_ufc_window:true,title:ev.name || 'UFC event',
        channel:group.channels[0] || 'Network TBA',channels:group.channels,start_at:group.when,
        start_hour:known ? localHour(group.when) : null,duration_hours:3,
        time_display:known ? timeLabel(group.when) : 'Time TBA',
        card_segment:known ? `${timeLabel(group.when)} card` : 'Fight card',
        subtitle:`${bouts.length} bouts · Published card start · 3h display estimate`,bouts,
        status:ev.status?.type?.shortDetail || 'Scheduled',state:ev.status?.type?.state || 'pre',
        url:/^\d+$/.test(String(ev.id)) ? `https://www.espn.com/mma/fightcenter/_/id/${ev.id}/league/ufc` : null});
    }
    if (!groups.size && localDate(ev.date) === day && !(ev.competitions || []).length) {
      out.push({id:`ufc-${ev.id}`,category:'UFC',is_ufc_window:true,title:ev.name || 'UFC event',channel:'Network TBA',channels:[],start_hour:null,duration_hours:3,time_display:'Time TBA',card_segment:'Fight card',bouts:[],subtitle:'Bouts not yet published'});
    }
  }
  return out;
}
export function buildGuide(cfbEvents, ufcEvents, day, offset) {
  const events = [...normalizeCfb(cfbEvents,day),...normalizeUfc(ufcEvents,day)];
  const timed = events.filter(e => e.start_hour != null);
  const baseHour = Math.min(8, ...timed.map(e => Math.floor(e.start_hour)));
  const endHour = Math.max(24, ...timed.map(e => Math.ceil(e.start_hour + e.duration_hours)));
  const preferred = ['ESPN','ESPN2','ABC','FOX','FS1','CBS','NBC','Peacock','Paramount+'];
  const actual = [...new Set(events.map(e => e.channel))];
  const channels = [...preferred.filter(c => actual.includes(c)), ...actual.filter(c => !preferred.includes(c)).sort()];
  return {date:day,week_offset:offset,week_label:`Saturday, ${new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'}).format(new Date(`${day}T12:00:00Z`))}`,
    base_hour:baseHour, channels, events, time_slots:Array.from({length:endHour-baseHour},(_,i) => {
      const h=i+baseHour; return {hour:h,label:`${h%12||12}:00 ${h%24<12?'AM':'PM'}${h>=24?' +1d':''}`};
    })};
}
export async function getGuide(offset = 0, {now = new Date(), feed = fetchFeed} = {}) {
  const day = targetSaturday(offset,now);
  // Fetch both calendar dates then filter to Pacific Saturday, retaining late games.
  const dates = [day,addDays(day,1)];
  const requests = ['football/college-football','mma/ufc'].flatMap(sport => dates.map(date => ({sport,date,
    // ESPN silently falls back to 25 games for limit=1000; 100 returns the full FBS slate.
    url:`${BASE}/${sport}/scoreboard?dates=${date.replaceAll('-','')}&limit=100${sport.startsWith('football')?'&groups=80':''}`})));
  const results = await Promise.allSettled(requests.map(r => feed(r.url)));
  const collected = {CFB:new Map(),UFC:new Map()}, warnings = [], times = [];
  let successes = 0;
  results.forEach((r,i) => {
    const label = requests[i].sport.startsWith('football') ? 'CFB' : 'UFC';
    if (r.status === 'rejected') { warnings.push(`${label} feed unavailable for ${requests[i].date}; the guide may be incomplete.`); return; }
    successes++;
    times.push(r.value.at);
    if (r.value.data.events.length >= 100) warnings.push(`${label}: feed limit reached; some events may be missing.`);
    if (r.value.stale) warnings.push(`${label}: showing cached data because ESPN could not be reached.`);
    for (const e of r.value.data.events) if (e.id) collected[label].set(e.id,e);
  });
  if (!successes) throw new Error('ESPN could not be reached. Check your connection and try Refresh.');
  return {...buildGuide([...collected.CFB.values()],[...collected.UFC.values()],day,offset), warnings:[...new Set(warnings)],updated_at:Math.min(...times),stale:results.some(r=>r.status==='fulfilled'&&r.value.stale)};
}

export function recentResults(events, teamId, before) {
  return events.filter(e => new Date(e.date) < new Date(before) && e.competitions?.[0]?.status?.type?.completed)
    .sort((a,b)=>new Date(b.date)-new Date(a.date)).flatMap(e => {
      const c=e.competitions[0], own=c.competitors?.find(x=>String(x.team?.id||x.id)===String(teamId)), other=c.competitors?.find(x=>String(x.team?.id||x.id)!==String(teamId));
      if (!own || !other) return [];
      const a=scoreValue(own.score), b=scoreValue(other.score);
      if (a === null || b === null || !Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return [];
      return [{week:e.week?.number ? `W${e.week.number}` : localDate(e.date),opp:other.team?.abbreviation || other.team?.displayName || 'Opponent',
        res:Number(a)>Number(b)?'W':Number(a)<Number(b)?'L':'T',score:`${a}-${b}`}];
    }).slice(0,5);
}
export async function getTeamForm(event, teamId, feed = fetchFeed) {
  if (!/^\d+$/.test(String(teamId))) throw new Error('Team unavailable');
  const types = event.season_type === 3 ? [2,3] : [event.season_type];
  const results = await Promise.all(types.map(type => feed(`${BASE}/football/college-football/teams/${teamId}/schedule?season=${event.season}&seasontype=${type}`, {ttl:3600000,maxStale:86400000})));
  const unique = new Map(results.flatMap(r => r.data.events).map(e => [e.id,e]));
  return {games:recentResults([...unique.values()],teamId,event.start_at),stale:results.some(r=>r.stale)};
}
