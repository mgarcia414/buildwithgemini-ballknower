import test from 'node:test';
import assert from 'node:assert/strict';
import {targetSaturday,localDate,timeLabel,normalizeCfb,normalizeUfc,buildGuide,recentResults,liveAlerts,fetchFeed,clearMemoryCache,getGuide,getTeamForm} from '../docs/sports-data.js';

function game(overrides={}) {
  return {id:'123',date:'2026-10-10T19:30Z',season:{year:2026,type:2},competitions:[{
    date:'2026-10-10T19:30Z',timeValid:true,broadcasts:[{names:['ESPN2']}],
    competitors:[{id:'59',homeAway:'home',team:{id:'59',displayName:'Georgia Tech',abbreviation:'GT'},score:'24',curatedRank:{current:99}},
      {id:'150',homeAway:'away',team:{id:'150',displayName:'Duke',abbreviation:'DUKE'},score:'21',curatedRank:{current:10}}],
    status:{period:4,type:{state:'in',detail:'4th quarter'}}}],...overrides};
}
test('Saturday calculation uses Pacific date across UTC midnight and year changes',()=>{
  assert.equal(targetSaturday(0,new Date('2026-10-11T02:00Z')),'2026-10-10');
  assert.equal(targetSaturday(0,new Date('2026-10-11T12:00Z')),'2026-10-17');
  assert.equal(targetSaturday(1,new Date('2026-12-26T20:00Z')),'2027-01-02');
  assert.equal(targetSaturday(-1,new Date('2026-10-09T20:00Z')),'2026-10-03');
  assert.throws(()=>targetSaturday(999));
});
test('times reflect daylight saving rather than a fixed PST label',()=>{
  assert.match(timeLabel('2026-10-10T19:30Z'),/12:30 PM PDT/);
  assert.match(timeLabel('2026-11-07T20:30Z'),/12:30 PM PST/);
  assert.equal(localDate('2026-10-11T05:30Z'),'2026-10-10');
});
test('actual broadcasts and missing lines are retained without invented stats',()=>{
  const raw=game();
  const event=normalizeCfb([raw],'2026-10-10')[0];
  assert.equal(event.channel,'ESPN2');
  assert.equal(event.betting_line,null);
  assert.equal(event.start_hour,12.5);
  assert.equal(event.team1.id,'150');
  assert.equal(event.team2.record,null);
  assert.equal(event.team1.last5,undefined);
  raw.competitions[0].broadcasts=[];
  assert.equal(normalizeCfb([raw],'2026-10-10')[0].channel,'Network TBA');
});
test('late Saturday games survive UTC Sunday; other dates are excluded',()=>{
  const late=game(); late.date=late.competitions[0].date='2026-10-11T05:30Z';
  assert.equal(normalizeCfb([late],'2026-10-10')[0].start_hour,22.5);
  assert.deepEqual(normalizeCfb([late],'2026-10-11'),[]);
  const guide=buildGuide([late],[],'2026-10-10',0);
  assert.equal(guide.time_slots.at(-1).hour,25);
});
test('unknown kickoff is not assigned a made-up timeline position',()=>{
  const raw=game(); raw.competitions[0].timeValid=false;
  const result=normalizeCfb([raw],'2026-10-10')[0];
  assert.equal(result.start_hour,null); assert.equal(result.time_display,'Time TBA');
});
test('odds use supplied values and provider',()=>{
  const raw=game(); raw.competitions[0].odds=[{details:'DUKE -3',overUnder:50,provider:{name:'Provider'}}];
  const event=normalizeCfb([raw],'2026-10-10')[0];
  assert.equal(event.betting_line,'DUKE -3 • O/U 50');
  assert.equal(event.odds_provider,'Provider');
});
test('live alerts require an in-progress game and available scores',()=>{
  const event=normalizeCfb([game()],'2026-10-10')[0];
  assert.deepEqual(liveAlerts(event),['One-score finish','Upset watch']);
  assert.deepEqual(liveAlerts({...event,state:'post'}),[]);
  assert.deepEqual(liveAlerts({...event,state:'pre'}),[]);
  assert.deepEqual(liveAlerts({...event,team1:{...event.team1,score:null}}),[]);
});
test('UFC grouping follows actual timestamps, records and weight classes',()=>{
  const bout=(id,date,type)=>({id,date,timeValid:true,type:{abbreviation:type},broadcasts:[{names:['Paramount+']}],competitors:[{athlete:{displayName:'A'},records:[{type:'total',summary:'9-3-2'}]},{athlete:{displayName:'B'}}]});
  const events=[{id:'55',name:'Fight Night',date:'2026-10-10T21:00Z',competitions:[bout('1','2026-10-10T21:00Z','Heavyweight'),bout('2','2026-10-10T21:00Z','Flyweight'),bout('3','2026-10-11T00:00Z','Middleweight')]}];
  const result=normalizeUfc(events,'2026-10-10');
  assert.equal(result.length,2); assert.equal(result[0].bouts.length,2); assert.equal(result[1].start_hour,17);
  assert.equal(result[0].bouts[0].weight_class,'Heavyweight');
  assert.equal(result[0].bouts[0].fighter1.record,'9-3-2');
  assert.equal(result[0].bouts[0].fighter2.record,'Record unavailable');
  assert.match(result[0].bouts[0].time_display,/unavailable/);
  assert.ok(!result[0].card_segment.includes('Prelim'));
});
test('an empty feed yields an empty guide, never demo matchups',()=>{
  assert.deepEqual(buildGuide([],[],'2026-07-04',0).events,[]);
});
test('recent form only includes prior completed matches, newest five first',()=>{
  const events=Array.from({length:8},(_,i)=>{
    const e=game({id:String(i),date:`2026-09-${String(i+1).padStart(2,'0')}T20:00Z`,week:{number:i+1}});
    e.competitions[0].status.type.completed=i!==6;
    e.competitions[0].competitors[0].score={displayValue:'24'};
    return e;
  });
  const form=recentResults(events,'59','2026-09-08T12:00Z');
  assert.equal(form.length,5); assert.equal(form[0].week,'W6');
  assert.equal(form[0].score,'24-21'); assert.equal(form[0].res,'W');
  assert.ok(!form.some(x=>['W7','W8'].includes(x.week)));
});
test('cache coalesces requests, observes TTL, and marks stale results',async()=>{
  clearMemoryCache(); let calls=0;
  const url='https://example.test/cache', fetcher=async()=>{calls++;return {ok:true,json:async()=>({events:[]})};};
  const opts={storage:null,fetcher,now:1000,ttl:100};
  const [a,b]=await Promise.all([fetchFeed(url,opts),fetchFeed(url,opts)]);
  assert.equal(calls,1); assert.equal(a.stale,false); assert.equal(b.at,1000);
  await fetchFeed(url,{...opts,now:1050}); assert.equal(calls,1);
  const broken=async()=>{throw new Error('offline');};
  const stale=await fetchFeed(url,{...opts,now:1200,fetcher:broken});
  assert.equal(stale.stale,true); assert.equal(stale.at,1000);
  await assert.rejects(fetchFeed(url,{...opts,now:10000,maxStale:500,fetcher:broken}),/offline/);
});
test('bad responses and empty offline startup do not masquerade as success',async()=>{
  clearMemoryCache();
  await assert.rejects(fetchFeed('https://example.test/schema',{storage:null,fetcher:async()=>({ok:true,json:async()=>({})})}),/Unexpected/);
  await assert.rejects(fetchFeed('https://example.test/error',{storage:null,fetcher:async()=>({ok:false,status:429})}),/429/);
});
test('week requests are date-specific, deduplicated, and disclose partial failure',async()=>{
  const urls=[];
  const d=await getGuide(0,{now:new Date('2026-10-09T20:00Z'),feed:async url=>{
    urls.push(url); if(url.includes('mma')) throw new Error('offline');
    return {at:1000,stale:false,data:{events:[game()]}};
  }});
  assert.equal(urls.length,4); assert.ok(urls.every(u=>/dates=2026101[01]/.test(u)));
  assert.ok(urls.every(u=>new URL(u).searchParams.get('limit')==='100'));
  assert.equal(d.events.length,1); assert.equal(d.warnings.length,2);
  await assert.rejects(getGuide(0,{feed:async()=>{throw new Error('offline');}}),/ESPN could not/);
});
test('postseason form includes regular season and uses the event season year',async()=>{
  const urls=[];
  await getTeamForm({season:2025,season_type:3,start_at:'2026-01-01T20:00Z'},'59',async(url)=>{
    urls.push(url);return {stale:false,data:{events:[]}};
  });
  assert.equal(urls.length,2);assert.ok(urls.every(u=>u.includes('season=2025')));
  assert.ok(urls.some(u=>u.includes('seasontype=3')));
});
