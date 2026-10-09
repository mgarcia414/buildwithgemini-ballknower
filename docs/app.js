import {getGuide, getTeamForm, localDate, timeLabel} from './sports-data.js';

const $ = id => document.getElementById(id);
const el = (tag,cls,text) => {
  const node=document.createElement(tag);
  if (cls) node.className=cls;
  if (text != null) node.textContent=text;
  return node;
};
const SLOT_WIDTH=190, LANE_HEIGHT=74, FAVORITES_KEY='ballknower:favorites:v1';
let currentWeekOffset=0, lastGuideData=null, loadVersion=0, activePopover=null, activeGame=null;
let selectedFavorites=new Set(['59','278','87']), allTeams=[];
try {
  const saved=JSON.parse(localStorage.getItem(FAVORITES_KEY));
  if (Array.isArray(saved) && saved.every(x=>typeof x==='string' && /^\d+$/.test(x))) selectedFavorites=new Set(saved);
} catch { /* Favorites remain usable when storage is blocked. */ }
$('fav-count').textContent=selectedFavorites.size;
const isFavorite = event => [event.team1?.id,event.team2?.id].some(id=>selectedFavorites.has(id));
function saveFavorites() {
  try { localStorage.setItem(FAVORITES_KEY,JSON.stringify([...selectedFavorites])); }
  catch { $('data-warning').hidden=false; $('data-warning').textContent='Browser storage is unavailable; favorites will last for this visit only.'; }
}
async function initTeams() {
  try {
    const response=await fetch('./fbs_teams.json');
    if (!response.ok) throw new Error('Team list unavailable');
    allTeams=await response.json();
    renderTeams();
  } catch { $('team-list-scroll').textContent='Team list unavailable. Reload the page to retry.'; }
}
function renderTeams() {
  const filter=$('team-search-input').value.toLowerCase();
  $('team-list-scroll').replaceChildren();
  for (const team of allTeams.filter(t=>t.name.toLowerCase().includes(filter))) {
    const label=el('label','team-item'), checkbox=el('input');
    checkbox.type='checkbox'; checkbox.checked=selectedFavorites.has(team.id);
    checkbox.addEventListener('change',()=>{
      if (checkbox.checked) selectedFavorites.add(team.id); else selectedFavorites.delete(team.id);
      $('fav-count').textContent=selectedFavorites.size;
      saveFavorites();
      if (lastGuideData) renderGuide(lastGuideData);
    });
    label.append(checkbox,document.createTextNode(team.name));
    $('team-list-scroll').append(label);
  }
}
function toggleTeams(open) {
  $('team-dropdown-menu').classList.toggle('open',open);
  $('team-picker-btn').setAttribute('aria-expanded',String(open));
  if (open) $('team-search-input').focus();
}
$('team-picker-btn').addEventListener('click',()=>toggleTeams(!$('team-dropdown-menu').classList.contains('open')));
$('team-search-input').addEventListener('input',renderTeams);
document.addEventListener('click',e=>{
  if (!e.target.closest('.team-picker-container')) toggleTeams(false);
});

async function loadGuide(offset,{quiet=false}={}) {
  if (Math.abs(offset)>104) return;
  const version=++loadVersion;
  currentWeekOffset=offset;
  $('refresh-btn').disabled=true;
  $('prev-week-btn').disabled=offset<=-104;
  $('next-week-btn').disabled=offset>=104;
  if (!quiet) {
    lastGuideData=null;
    hidePopover(); closeDetails();
    $('week-label').textContent='Loading Saturday…';
    $('channel-rows-container').replaceChildren(el('div','empty-state','Loading schedules…'));
    $('data-status').textContent='Loading ESPN schedules…';
    $('data-warning').hidden=true;
    $('live-alerts').hidden=true;
  }
  try {
    const data=await getGuide(offset);
    if (version!==loadVersion) return;
    lastGuideData=data;
    renderGuide(data);
    $('data-status').textContent=`ESPN · ${data.events.filter(e=>e.category==='CFB').length} games · ${data.events.filter(e=>e.category==='UFC').length} UFC windows · ${data.stale?'Cached':'Updated'} ${timeLabel(data.updated_at)}`;
    $('data-warning').hidden=!data.warnings.length;
    $('data-warning').textContent=data.warnings.join(' ');
  } catch(error) {
    if (version!==loadVersion) return;
    $('data-status').textContent=error.message;
    if (!quiet) {
      $('week-label').textContent='Schedule unavailable';
      $('channel-rows-container').replaceChildren(el('div','empty-state','No schedule loaded. Use Refresh to try again.'));
    } else {
      $('data-warning').hidden=false;
      $('data-warning').textContent=`Refresh failed. Displaying the last loaded guide from ${timeLabel(lastGuideData?.updated_at)}.`;
    }
  } finally { if (version===loadVersion) $('refresh-btn').disabled=false; }
}
function assignLanes(events) {
  const ends=[],assigned=[];
  for (const event of [...events].sort((a,b)=>a.start_hour-b.start_hour)) {
    let lane=ends.findIndex(end=>end<=event.start_hour);
    if (lane<0) lane=ends.length;
    ends[lane]=event.start_hour+event.duration_hours;
    assigned.push({event,lane});
  }
  return {assigned,count:Math.max(1,ends.length)};
}
function renderGuide(data) {
  hidePopover();
  $('week-label').textContent=data.week_label;
  document.documentElement.style.setProperty('--slot-count',data.time_slots.length);
  $('time-slots-header').replaceChildren(...data.time_slots.map(s=>el('div','time-slot-cell',s.label+' PT')));
  const onlyFavorites=$('favorites-only').checked;
  const events=data.events.filter(e=>!onlyFavorites||isFavorite(e));
  $('channel-rows-container').replaceChildren();
  const live=events.filter(e=>!isFavorite(e)&&e.alerts?.length);
  $('live-alerts').hidden=!live.length;
  $('live-alerts').textContent=live.map(e=>`${e.alerts.join(' / ')}: ${e.title} · ${e.team1.score}–${e.team2.score} · ${e.channel}`).join(' | ');
  if (!events.length) {
    $('channel-rows-container').append(el('div','empty-state',onlyFavorites?'No games for your favorite teams on this Saturday. Turn off Favorites only to see the full guide.':'No events published for this Saturday. Try another week.'));
    return;
  }
  for (const channel of data.channels) {
    const channelEvents=events.filter(e=>e.channel===channel);
    if (!channelEvents.length) continue;
    const timed=channelEvents.filter(e=>e.start_hour!=null);
    const {assigned,count}=assignLanes(timed);
    const row=el('div','channel-row'); row.style.height=`${count*LANE_HEIGHT+12}px`;
    const label=el('div','channel-cell');
    const noun=channelEvents.some(e=>e.category==='UFC')?'card window':'game';
    label.append(el('div','channel-name',channel),el('div','channel-tag',`${channelEvents.length} ${noun}${channelEvents.length===1?'':'s'}`));
    const track=el('div','events-track');
    for (const {event,lane} of assigned) {
      const block=el('button','game-block'); block.type='button';
      block.style.left=`${(event.start_hour-data.base_hour)*SLOT_WIDTH}px`;
      block.style.width=`${event.duration_hours*SLOT_WIDTH-6}px`;
      block.style.top=`${5+lane*LANE_HEIGHT}px`;
      block.setAttribute('aria-label',`${event.title}, ${event.time_display}, ${event.channel}. View details`);
      block.classList.toggle('favorite',isFavorite(event));
      block.classList.toggle('alert',Boolean(event.alerts?.length));
      if (event.is_ufc_window) {
        block.classList.add('ufc-window'); block.style.height='66px';
        const heading=el('div','ufc-window-header');
        heading.append(el('div','ufc-window-title',event.title),el('span','ufc-badge-pill','UFC'));
        const footer=el('div','ufc-window-footer');
        footer.append(el('span',null,event.time_display),el('span','ufc-inspect-hint','View card →'));
        block.append(heading,el('div','ufc-window-sub',`${event.bouts.length} bouts · Published card start`),footer);
        block.addEventListener('click',()=>openUfc(event));
      } else {
        const title=el('div','game-block-title');
        if (isFavorite(event)) title.append(el('span','favorite-badge','FAV'));
        title.append(document.createTextNode(event.title));
        const meta=el('div','game-block-meta');
        const score=event.state!=='pre'&&event.team1.score!=null&&event.team2.score!=null ? `${event.team1.score}–${event.team2.score} · ${event.status}` : event.betting_line||'Lines unavailable';
        meta.append(el('span',null,event.time_display),el('span',null,score));
        block.append(title,meta);
        block.addEventListener('mouseenter',e=>showPopover(event,e));
        block.addEventListener('mousemove',positionPopover);
        block.addEventListener('mouseleave',hidePopover);
        block.addEventListener('click',()=>openGame(event));
      }
      track.append(block);
    }
    if (!timed.length) track.append(el('div','empty-state','Start time not yet published — see below.'));
    row.append(label,track); $('channel-rows-container').append(row);
  }
  const untimed=events.filter(e=>e.start_hour==null);
  if (untimed.length) {
    $('channel-rows-container').append(el('div','empty-state','Start times to be announced'));
    const list=el('div','unscheduled');
    for (const event of untimed) {
      const button=el('button','team-picker-btn',`${event.title} · ${event.channel} · Time TBA`);
      button.addEventListener('click',()=>event.is_ufc_window?openUfc(event):openGame(event));
      list.append(button);
    }
    $('channel-rows-container').append(list);
  }
}

function sourceLink(event) {
  if (!event.url) return el('span');
  const a=el('a','source-link','View full event on ESPN ↗');
  a.href=event.url; a.target='_blank'; a.rel='noopener noreferrer';
  return a;
}
let detailTrigger=null;
function closeDetails(restore=false) {
  $('ufc-sidebar').classList.add('collapsed'); $('game-sidebar').classList.add('collapsed'); activeGame=null;
  if (restore && detailTrigger?.isConnected) detailTrigger.focus();
}
function openUfc(event) {
  detailTrigger=document.activeElement;
  closeDetails(); hidePopover();
  $('ufc-sidebar-card-title').textContent=`${event.title} · ${event.time_display}`;
  const body=$('ufc-sidebar-body');
  body.replaceChildren(el('p','detail-note',`Broadcast: ${event.channels?.join(' / ')||'Network TBA'}. Bouts are grouped by ESPN's published card start. Individual walk times and a main/prelim label are not supplied. Order may change; block length is an estimate.`),sourceLink(event));
  if (!event.bouts?.length) body.append(el('p','detail-note','Bouts have not been published.'));
  for (const bout of event.bouts || []) {
    const card=el('div','ufc-bout-card'), top=el('div','ufc-bout-top');
    top.append(el('span','ufc-bout-badge',bout.status),el('span','ufc-bout-time','Walk time TBA'));
    const matchup=el('div','ufc-bout-matchup-horizontal');
    [bout.fighter1,bout.fighter2].forEach((fighter,i)=>{
      if (i) matchup.append(el('div','ufc-vs-badge','VS.'));
      const col=el('div',`ufc-fighter-col ${i?'right':'left'}`);
      col.append(el('div','ufc-fname',fighter?.name||'Fighter TBA'),el('div','ufc-frec',`${fighter?.record||'Record unavailable'}${fighter?.winner?' · Winner':''}`));
      matchup.append(col);
    });
    card.append(top,matchup,el('div','ufc-bout-division',bout.weight_class));
    body.append(card);
  }
  $('ufc-sidebar').classList.remove('collapsed'); $('ufc-sidebar-close').focus();
}

const forms=new Map();
async function fillForm(container,event) {
  container.replaceChildren(el('p','detail-note','Loading recent results…'));
  const rows=await Promise.all([event.team1,event.team2].map(async team=>{
    const key=`${event.id}:${team.id}`;
    let data=forms.get(key);
    if (data && Date.now()-data.cachedAt>=3600000) data=null;
    try {
      if (!data) {
        data={...await getTeamForm(event,team.id),cachedAt:Date.now()};
        if (!data.stale) forms.set(key,data);
        if (forms.size>80) forms.delete(forms.keys().next().value);
      }
      return {team,...data};
    } catch { return {team,error:true}; }
  }));
  // The caller gives each render its own container, preventing a late response
  // from replacing the next selected game's details.
  container.replaceChildren();
  for (const {team,games,error,stale} of rows) {
    const row=el('div','cfb-team-form-row');
    row.append(el('span','cfb-team-name-small',`${team.name}${team.record?' ('+team.record+')':''}`));
    const pills=el('div','cfb-form-pills');
    for (const game of games || []) {
      const pill=el('span',`form-pill ${game.res.toLowerCase()}`,`${game.opp} ${game.res} ${game.score}`);
      pill.title=`${game.week}: ${game.opp}, ${game.res}, ${game.score}`;
      pills.append(pill);
    }
    if (!games?.length) pills.append(el('span','detail-note',error?'Recent results unavailable':'No earlier completed games this season'));
    if (stale) pills.append(el('span','detail-note','Cached results'));
    row.append(pills); container.append(row);
  }
  container.append(el('p','detail-note','Up to 5 completed games before this matchup · Newest first'));
}
function openGame(event) {
  detailTrigger=document.activeElement;
  closeDetails(); hidePopover(); activeGame=event;
  $('game-sidebar-title').textContent=event.title;
  const body=$('game-sidebar-body'), form=el('div','cfb-form-section');
  body.replaceChildren(el('p','detail-note',`${event.time_display} · ${event.channels.join(' / ')||'Network TBA'}`));
  if (event.state!=='pre') body.append(el('p','detail-note',`${event.team1.abbreviation||event.team1.name} ${event.team1.score??'—'} – ${event.team2.score??'—'} ${event.team2.abbreviation||event.team2.name} · ${event.status}`));
  else body.append(el('p','detail-note',event.status));
  if (event.venue) body.append(el('p','detail-note',event.venue));
  body.append(el('div','cfb-popover-line',event.betting_line||'Betting lines unavailable'));
  if (event.odds_provider) body.append(el('p','detail-note',`Odds supplied by ${event.odds_provider} via ESPN`));
  body.append(sourceLink(event),form);
  fillForm(form,event);
  $('game-sidebar').classList.remove('collapsed'); $('game-sidebar-close').focus();
}
function showPopover(event,pointer) {
  if (activeGame) return;
  activePopover=event;
  $('cfb-pop-title').textContent=event.title;
  $('cfb-pop-line').textContent=event.betting_line||'Betting lines unavailable';
  const form=el('div'); $('cfb-pop-form').replaceChildren(form);
  $('cfb-popover').style.display='block'; positionPopover(pointer);
  fillForm(form,event);
}
function positionPopover(e) {
  if (!activePopover) return;
  const node=$('cfb-popover');
  node.style.left=`${Math.max(10,Math.min(e.clientX+15,window.innerWidth-node.offsetWidth-10))}px`;
  node.style.top=`${Math.max(10,Math.min(e.clientY+15,window.innerHeight-node.offsetHeight-10))}px`;
}
function hidePopover() { activePopover=null; $('cfb-popover').style.display='none'; }
$('game-sidebar-close').addEventListener('click',()=>closeDetails(true));
$('ufc-sidebar-close').addEventListener('click',()=>closeDetails(true));
document.addEventListener('keydown',e=>{ if (e.key==='Escape') { closeDetails(true); hidePopover(); toggleTeams(false); } });
$('prev-week-btn').addEventListener('click',()=>loadGuide(currentWeekOffset-1));
$('next-week-btn').addEventListener('click',()=>loadGuide(currentWeekOffset+1));
$('today-btn').addEventListener('click',()=>loadGuide(0));
$('refresh-btn').addEventListener('click',()=>{ forms.clear(); loadGuide(currentWeekOffset); });
$('favorites-only').addEventListener('change',()=>{ if (lastGuideData) renderGuide(lastGuideData); });
$('scroll-now-btn').addEventListener('click',()=>{
  const base=lastGuideData?.base_hour??8;
  $('guide-viewport').scrollTo({left:SLOT_WIDTH*Math.max(0,12.5-base),behavior:'smooth'});
});
// Refresh only while viewing today's slate in a visible tab. Browsing future or
// past weeks makes no recurring requests; the cache limits feed requests to 1/min.
setInterval(()=>{
  if (!document.hidden && lastGuideData?.date===localDate(new Date()) && !$('refresh-btn').disabled) loadGuide(currentWeekOffset,{quiet:true});
},60000);
initTeams(); loadGuide(0);
