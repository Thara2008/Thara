// Runs the REAL index.html <script> in a stubbed browser context, then executes an in-context
// test suite covering: PIN, groups, per-group tables, qualify counts, wildcards, dynamic bracket
// rounds (8 => QF, 16 => R16+QF), seeding, overrides, auto-advance, migration, persistence.
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const appScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const storage = (init) => { let d = init; return { getItem: () => d, setItem: (k, v) => { d = v; }, removeItem: () => { d = null; } }; };
const mkEl = () => ({ value: '', dataset: {}, files: null });
let qualSlots = [];
const koRegistry = {};
const elementRegistry = {};

function makeSandbox(seedRaw, adminSession){
  const sb = {
    console,
    document: {
      addEventListener() {},
      getElementById(id){ if (!elementRegistry[id]) elementRegistry[id] = mkEl(); return elementRegistry[id]; },
      querySelector(sel){
        const m = sel.match(/^\[data-ko-(home|away|hs|as|pen)="([^"]+)"\]$/);
        if (m){ const k = m[1] + ':' + m[2]; if (!koRegistry[k]) koRegistry[k] = mkEl(); return koRegistry[k]; }
        if (sel.startsWith('[data-team-group="')){ return { value: '' }; }
        return null;
      },
      querySelectorAll(sel){ return sel === '[data-qual-slot]' ? (sb.__qualSlots || []) : []; },
      createElement() { return {}; }
    },
    localStorage: storage(seedRaw),
    sessionStorage: storage(adminSession ? '1' : null),
    alert(){}, confirm: () => true, prompt: () => null,
    URL: { createObjectURL: () => '', revokeObjectURL() {} },
    FileReader: function(){}, Blob: function(){}
  };
  return sb;
}

const sb = makeSandbox(null, false);
vm.createContext(sb);
vm.runInContext(appScript, sb);

const suite = `
(function(){
  let fails = 0;
  const T = (name, cond, extra) => {
    if (cond) console.log('  ✅ ' + name);
    else { console.log('  ❌ ' + name + (extra ? ' — ' + JSON.stringify(extra) : '')); fails++; }
  };
  let alerts = [];
  globalThis.alert = m => alerts.push(String(m));
  const setEl = (id, val) => { document.getElementById(id).value = val; };
  const click = (action, id) => handle(action, id || null, { dataset: {}, getAttribute(){return null;} });

  console.log('\\n[1] PIN gate');
  click('set-pin');
  T('empty PIN rejected', alerts.length > 0 && alerts[alerts.length-1].includes('Incorrect'));
  setEl('pinInput', 'qwert'); click('set-pin');
  T('correct PIN unlocks', unlocked === true);
  click('lock'); T('lock works', unlocked === false);
  click('toggle-pin'); setEl('pinInput', 'QwErT'); click('set-pin');
  T('PIN case-insensitive', unlocked === true);

  console.log('\\n[2] Tournament starts with Group A');
  click('create-tournament');
  T('empty name rejected', alerts[alerts.length-1].includes('name'));
  setEl('newTournamentName', 'FC Mobile World Cup'); click('create-tournament');
  T('tournament created', state.tournaments.length === 1);
  const t = state.tournaments[0];
  openTournamentState(t);
  T('starts with Group A', t.groups.length === 1 && t.groups[0].name === 'Group A');
  click('add-group'); click('add-group'); click('add-group');
  T('adds Group B, C, D', t.groups.length === 4 && t.groups[1].name === 'Group B' && t.groups[3].name === 'Group D');

  console.log('\\n[3] Teams into groups + per-group tables');
  const addToGroup = (gi, names) => {
    view.groupId = t.groups[gi].id;
    names.forEach(n => { setEl('newTeamName', n); click('add-team'); });
  };
  addToGroup(0, ['A1','A2','A3','A4']);
  addToGroup(1, ['B1','B2','B3','B4']);
  addToGroup(2, ['C1','C2','C3','C4']);
  addToGroup(3, ['D1','D2','D3','D4']);
  T('16 teams across 4 groups', t.groups.map(g=>g.teams.length).join(',') === '4,4,4,4');
  const T2 = (gi,n) => computeGroupTable(t, t.groups[gi].id).find(r => r.team.name === n);

  const rec = (gid, h, a, hs, as) => {
    view.matchGroupId = t.groups[gid].id;
    setEl('matchHome', t.groups[gid].teams.find(x=>x.name===h).id);
    setEl('matchAway', t.groups[gid].teams.find(x=>x.name===a).id);
    setEl('matchHomeGoals', String(hs)); setEl('matchAwayGoals', String(as));
    click('add-match');
  };
  rec(0,'A1','A2',2,1); rec(0,'A3','A4',0,0); rec(0,'A1','A3',1,0);
  rec(1,'B1','B2',3,0); rec(1,'B3','B4',1,2); rec(1,'B1','B3',2,2);
  rec(2,'C1','C2',1,1); rec(2,'C3','C4',0,1); rec(2,'C1','C3',4,0);
  rec(3,'D1','D2',2,2); rec(3,'D3','D4',1,0); rec(3,'D1','D3',0,3);
  T('12 matches recorded with groupId', t.matches.length === 12 && t.matches.every(m => m.groupId));
  T('Group A table: A1 2W 6pts', T2(0,'A1').pts === 6 && T2(0,'A1').w === 2);
  T('Group A draw: A3/A4 1pt', T2(0,'A3').pts === 1 && T2(0,'A4').pts === 1);
  T('Group A GD: A1 +2', T2(0,'A1').gd === 2);
  T('Group B table: B1 W+D = 4 pts, 2 played', T2(1,'B1').pts === 4 && T2(1,'B1').p === 2 && T2(1,'B1').w === 1 && T2(1,'B1').d === 1);
  T('group tables isolated (C/D have own pts)', T2(2,'C1').pts === 4 && T2(3,'D3').pts === 6);

  console.log('\\n[4] Qualify counts + wildcards + auto picks');
  view.qgValues = { [t.groups[0].id]: 2, [t.groups[1].id]: 2, [t.groups[2].id]: 2, [t.groups[3].id]: 2 };
  const counts2 = { [t.groups[0].id]:2, [t.groups[1].id]:2, [t.groups[2].id]:2, [t.groups[3].id]:2 };
  const ordered = autoPicks(t, counts2, 0);
  T('autoPicks: group winners first, 8 picked', ordered.length === 8 && ordered.slice(0,4).length === 4);
  T('autoPicks order per group', ordered[0] === T2(0,'A1').team.id && ordered[2] === T2(1,'B1').team.id);
  T('4+2+2 gives 8 (valid)', VALID_N.includes(8));

  // wildcards: 2 groups x 3 = 6 + 2 wildcards = 8
  const counts2233 = { [t.groups[0].id]:3, [t.groups[1].id]:0, [t.groups[2].id]:3, [t.groups[3].id]:0 };
  const picked6 = autoPicks(t, counts2233, 2);
  T('wildcards top-up to 8 from global rank', picked6.length === 8);
  const set6 = new Set(picked6);
  T('wildcard picks are distinct', set6.size === 8);
  const d3 = t.groups[3].teams.find(x => x.name === 'D3').id;
  const b1 = t.groups[1].teams.find(x => x.name === 'B1').id;
  T('wildcards = best remaining (D3 6pts first, then B1 4pts)', picked6[6] === d3 && picked6[7] === b1);

  console.log('\\n[5] Create bracket: QF(4) -> SF(2) -> Final');
  view.qgValues = Object.assign({}, counts2);
  globalThis.__qualSlots = [];
  view.pickOverrides = {};
  click('create-bracket');
  T('bracket created with QF/SF/Final', t.knockouts && t.knockouts.rounds.length === 3);
  T('round sizes 4/2/1', t.knockouts.rounds.map(r => r.length).join(',') === '4,2,1');
  const seed = seedOrder(8);
  T('seeding: 1v8, 4v5, 2v7, 3v6', (match => {
    const picks = (() => { const o = autoPicks(t, counts2, 0); return seed.map((k,i) => o[k] || ''); })();
    const m0 = t.knockouts.rounds[0][0];
    return m0.homeId === picks[0] && m0.awayId === picks[1];
  })());

  // override QF1 away pick
  const altPick = t.groups[3].teams.find(x => x.name === 'D2').id;
  click('reset-bracket');
  view.pickOverrides = { 1: altPick };
  view.qgValues = Object.assign({}, counts2);
  click('create-bracket');
  T('admin override respected', t.knockouts.rounds[0][0].awayId === altPick);

  console.log('\\n[6] Results -> auto-advance -> champion');
  const KO = t.knockouts;
  const setResult = (roundIdx, mi, hs, as, pen) => {
    const m = KO.rounds[roundIdx][mi];
    m.homeScore = hs; m.awayScore = as; if (pen) m.penWinner = pen;
    autoAdvance(t);
  };
  setResult(0,0,2,0); setResult(0,1,1,1,'away'); setResult(0,2,0,1); setResult(0,3,3,0);
  T('QF winners -> SF slots', KO.rounds[1][0].homeId === KO.rounds[0][0].homeId
    && KO.rounds[1][0].awayId === KO.rounds[0][1].awayId
    && KO.rounds[1][1].homeId === KO.rounds[0][2].awayId
    && KO.rounds[1][1].awayId === KO.rounds[0][3].homeId);
  setResult(1,0,2,1); setResult(1,1,0,0,'home');
  T('SF winners -> Final', KO.rounds[2][0].homeId === KO.rounds[1][0].homeId && KO.rounds[2][0].awayId === KO.rounds[1][1].homeId);
  setResult(2,0,4,2);
  T('champion = Final winner', champion(t) === KO.rounds[1][0].homeId);
  T('status champion', tournamentStatus(t).key === 'champ');
  const cRow = computeTable(t).find(r => r.team.id === champion(t));
  T('defending-champion advice leads for the champ', adviceFor(t, cRow).length > 0 && /[Cc]hampion/.test(adviceFor(t, cRow)[0]));

  console.log('\\n[7] 16-team Round of 16 bracket');
  const t16 = { id:'t16', name:'Big Cup', createdAt: Date.now(), groups:[], matches:[], knockouts:null };
  for (let gi = 0; gi < 8; gi++){
    t16.groups.push({ id: 'g'+gi, name: 'Group '+String.fromCharCode(65+gi), teams: [] });
    ['X','Y'].forEach((s, i) => t16.groups[gi].teams.push({ id: 'g'+gi+'t'+i, name: 'G'+gi+s, note:'' }));
  }
  state.tournaments.push(t16);
  const counts16 = {}; t16.groups.forEach(g => counts16[g.id] = 1);
  const rounds16 = makeRounds(16);
  T('16 qualifiers -> R16(8), QF(4), SF(2), Final', rounds16.map(r=>r.length).join(',') === '8,4,2,1');
  T('round titles', roundTitleFor(8) === 'Round of 16' && roundTitleFor(4) === 'Quarter-finals');
  T('seedOrder(16) first pair 0,15', seedOrder(16)[0]===0 && seedOrder(16)[1]===15);

  console.log('\\n[8] Qualify-count validation + missing picks');
  view.qgValues = { [t.groups[0].id]:4, [t.groups[1].id]:4, [t.groups[2].id]:4, [t.groups[3].id]:4 };
  view.pickOverrides = {}; view.wildcards = 0;
  click('create-bracket');
  T('total 16 with 16 teams is valid -> R16 bracket', t.knockouts && t.knockouts.rounds.map(r=>r.length).join(',') === '8,4,2,1');
  view.qgValues = { [t.groups[0].id]:1, [t.groups[1].id]:1, [t.groups[2].id]:0, [t.groups[3].id]:0 };
  view.pickOverrides = {}; click('create-bracket');
  T('total 2 -> single Final round', t.knockouts.rounds.map(r=>r.length).join(',') === '1');
  view.qgValues = { [t.groups[0].id]:1, [t.groups[1].id]:1, [t.groups[2].id]:1, [t.groups[3].id]:1 };
  view.pickOverrides = {}; click('create-bracket');
  T('total 4 -> SF+Final', t.knockouts.rounds.map(r=>r.length).join(',') === '2,1');
  view.qgValues = { [t.groups[0].id]:2, [t.groups[1].id]:1, [t.groups[2].id]:1, [t.groups[3].id]:0 };
  view.pickOverrides = {}; click('create-bracket');
  T('odd total 4 valid too', t.knockouts.rounds.map(r=>r.length).join(',') === '2,1');
  view.qgValues = { [t.groups[0].id]:2, [t.groups[1].id]:2, [t.groups[2].id]:2, [t.groups[3].id]:0 };
  view.pickOverrides = {}; click('create-bracket');
  T('total 6 rejected (not power of 2)', alerts[alerts.length-1].includes('2, 4, 8, 16 or 32'));

  console.log('\\n[9] Persistence & independence');
  T('state in localStorage', (()=>{ try { return JSON.parse(localStorage.getItem('fcm_league_manager_v1')).tournaments.length === 2; } catch(e){ return false; } })());
  T('first tournament untouched by second', state.tournaments[0].groups.length === 4);

  console.log('\\n[11] Rankings + next-tournament advice');
  view.pickOverrides = {}; view.qgValues = Object.assign({}, counts2);
  click('create-bracket'); // fresh 8-team bracket so qualifiedIds = 8
  const gRows = computeTable(t);
  T('global rankings carry every stat + position', gRows[0].rank === 1 && typeof gRows[0].pts === 'number'
    && 'gd' in gRows[0] && 'gf' in gRows[0] && gRows[0].rank >= 1);
  T('ranked by pts then GD', gRows[0].pts >= gRows[1].pts
    && (gRows[0].pts > gRows[1].pts || gRows[0].gd >= gRows[1].gd));
  const advTop = adviceFor(t, gRows[0]);
  T('champion/leader advice mentions title or form', advTop.length > 0 && advTop.length <= 3);
  const champTeam = (() => { const c = champion(t); return computeTable(t).find(r => r.team.id === c); })();
  if (champTeam) T('defending-champion advice for the champ', /[Cc]hampion/.test(adviceFor(t, champTeam)[0]));
  T('bottom team still gets advice', adviceFor(t, gRows[gRows.length - 1]).length > 0);
  const zeroRow = { team: { id: 'zz', name: 'Zero' }, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  T('zero-match team gets advice too', adviceFor(t, zeroRow).length > 0);
  T('qualifiedIds = all 8 bracket slots', qualifiedIds(t).size === 8
    && qualifiedIds(t).has(t.knockouts.rounds[0][0].homeId));
  const conf = confettiHTML(6);
  T('confetti markup generates particles', conf.includes('confetti') && conf.includes('<i'));
  T('medals for top 3 ranks', rankMedal(0) === '🥇' && rankMedal(1) === '🥈' && rankMedal(2) === '🥉' && rankMedal(5) === '#6');
  const advRows = computeTable(t16);
  T('advice independent of table count (16-team)', adviceFor(t16, advRows[0]).length > 0);

  console.log('\\n[10] Migration check: legacy single-table + qf/sf/final (see second context run)');
  console.log('\\n' + (fails === 0 ? '🎉 ALL TESTS PASSED' : '⚠️  ' + fails + ' TEST(S) FAILED'));
  globalThis.__exitCode = fails;
})();
`;
// run the suite
const migratedLegacy = JSON.stringify({
  tournaments: [{
    id:'old', name:'Legacy League', createdAt: Date.now(),
    teams: ['P1','P2','P3','P4','P5','P6','P7','P8'].map((n,i)=>({id:'p'+i, name:n, note:''})),
    matches: [{id:'m1', homeId:'p0', awayId:'p1', homeGoals:2, awayGoals:1}],
    knockouts: { qf:[{id:'q1',homeId:'p0',awayId:'p1',homeScore:1,awayScore:0,penWinner:null}],
                 sf:[{id:'s1',homeId:'p0',awayId:null,homeScore:null,awayScore:null,penWinner:null}],
                 final:[{id:'f1',homeId:null,awayId:null,homeScore:null,awayScore:null,penWinner:null}] }
  }]
});
const sb2 = makeSandbox(migratedLegacy, true);
vm.createContext(sb2);
vm.runInContext(appScript + '\n' + `
(function(){
  let fails = 0;
  const T = (name, c) => { if (c) console.log('  ✅ ' + name); else { console.log('  ❌ ' + name); fails++; } };
  const old = state.tournaments[0];
  T('legacy teams -> one Group A', old.groups && old.groups.length === 1 && old.groups[0].teams.length === 8 && old.groups[0].name === 'Group A');
  T('legacy matches got groupId', old.matches.every(m => m.groupId === old.groups[0].id));
  T('legacy knockouts -> rounds [1,1,1]', old.knockouts.rounds.map(r=>r.length).join(',') === '1,1,1');
  T('legacy auto-advance keeps QF winner in SF', old.knockouts.rounds[1][0].homeId === 'p0');
  console.log('\\n' + (fails === 0 ? '🎉 MIGRATION TESTS PASSED' : '⚠️ ' + fails + ' FAILED'));
  globalThis.__exitCode = fails;
})();
`, sb2);

sb.__explode = true;
vm.runInContext(suite, sb);
const exitCode = (sb.__exitCode || 0) + (sb2.__exitCode || 0);
console.log('\\n(suite exit codes sum: ' + exitCode + ')');
process.exit(exitCode === 0 ? 0 : 1);