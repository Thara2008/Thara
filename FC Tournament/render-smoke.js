// Render smoke: seeds localStorage with varied tournaments (champion finished, group-stage w/
// setup-only ko, empty), renders every tab in read-only AND admin mode; asserts no crash + markers.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const appScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const T1 = {
  id: 't1', name: 'Completed Cup', createdAt: Date.now(),
  groups: [
    { id: 'gA', name: 'Group A', teams: ['a0','a1','a2','a3'].map((id,i)=>({ id, name:'A'+(i+1), note:'' })) },
    { id: 'gB', name: 'Group B', teams: ['b0','b1','b2','b3'].map((id,i)=>({ id, name:'B'+(i+1), note:'' })) },
  ],
  matches: [
    { id:'m1', groupId:'gA', homeId:'a0', awayId:'a1', homeGoals:2, awayGoals:1 },
    { id:'m2', groupId:'gA', homeId:'a2', awayId:'a3', homeGoals:0, awayGoals:0 },
    { id:'m3', groupId:'gA', homeId:'a0', awayId:'a2', homeGoals:1, awayGoals:0 },
    { id:'m4', groupId:'gB', homeId:'b0', awayId:'b1', homeGoals:3, awayGoals:2 },
  ],
  knockouts: {
    config: { counts: { gA: 2, gB: 2 }, wildcards: 0 },
    rounds: [
      [ // Quarter-finals (4)
        { id:'k1', homeId:'a0', awayId:'b1', homeScore:2, awayScore:0, penWinner:null },
        { id:'k2', homeId:'a1', awayId:'b0', homeScore:1, awayScore:1, penWinner:'away' },
        { id:'k3', homeId:'a2', awayId:'b3', homeScore:0, awayScore:1, penWinner:null },
        { id:'k4', homeId:'a3', awayId:'b2', homeScore:2, awayScore:2, penWinner:'home' },
      ],
      [ // Semi-finals (2)
        { id:'k5', homeId:'a0', awayId:'b0', homeScore:2, awayScore:1, penWinner:null },
        { id:'k6', homeId:'b3', awayId:'a3', homeScore:0, awayScore:2, penWinner:null },
      ],
      [ // Final (1)
        { id:'k7', homeId:'a0', awayId:'a3', homeScore:3, awayScore:1, penWinner:null },
      ],
    ],
  },
};
const T2 = { id:'t2', name:'Group Stage Only', createdAt: Date.now(),
  groups: [
    { id: 'gc', name:'Group A', teams: ['c0','c1'].map((id,i)=>({ id, name:'P'+(i+1), note:'alt' })) },
    { id: 'gd', name:'Group B', teams: ['d0','d1'].map((id,i)=>({ id, name:'Q'+(i+1), note:'' })) },
  ],
  matches: [{ id:'m5', groupId:'gc', homeId:'c0', awayId:'c1', homeGoals:5, awayGoals:2 }],
  knockouts: null };
const T3 = { id:'t3', name:'Fresh League', createdAt: Date.now(), groups:[], teams:[], matches:[], knockouts:null };
// legacy-shaped tournament to prove migration render path
const T4 = { id:'t4', name:'Legacy Shape', createdAt: Date.now(),
  teams: ['x0','x1'].map((id,i)=>({ id, name:'X'+(i+1), note:'' })),
  matches: [{ id:'m6', homeId:'x0', awayId:'x1', homeGoals:1, awayGoals:1 }],
  knockouts: null };

const seed = JSON.stringify({ tournaments: [T1, T2, T3, T4] });
const storage = (init) => { let d = init; return { getItem: () => d, setItem: (k, v) => { d = v; }, removeItem: () => { d = null; } }; };
const appEl = { innerHTML: '' };
const els = {};
function buildSandbox(admin){
  return {
    console,
    document: {
      addEventListener() {},
      getElementById(id){ if (id === 'app') return appEl; if (!els[id]) els[id] = { value:'', dataset:{} }; return els[id]; },
      querySelector(){ return { value:'' }; },
      querySelectorAll(sel){
        const trs = (appEl.innerHTML.match(/<tr/g) || []).length;
        const theads = (appEl.innerHTML.match(/<thead/g) || []).length;
        const counts = {
          '.card': (appEl.innerHTML.match(/class="card"/g) || []).length,
          '.table tbody tr': Math.max(0, trs - theads),
          '.match-row': (appEl.innerHTML.match(/class="match-row"/g) || []).length,
          '[data-qual-slot]': (appEl.innerHTML.match(/data-qual-slot=/g) || []).length,
          '.group-pill': (appEl.innerHTML.match(/class="group-pill/g) || []).length,
          '.ko-card': (appEl.innerHTML.match(/class="ko-card"/g) || []).length,
          '.ko-round': (appEl.innerHTML.match(/class="ko-round"/g) || []).length,
          '.rank-row': (appEl.innerHTML.match(/class="rank-row/g) || []).length,
        };
        const n = counts[sel] || 0;
        return Array.from({ length: n }, () => ({}));
      },
      createElement(){ return {}; }
    },
    localStorage: storage(seed),
    sessionStorage: storage(admin ? '1' : null),
    alert(){}, confirm:()=>true, prompt(){}, URL:{}, FileReader(){}, Blob(){}
  };
}

// --- read-only context ---
const sbRO = buildSandbox(false);
vm.createContext(sbRO);
vm.runInContext(appScript + `
(function(){
  let fails = 0;
  const T = (name, cond) => { if (cond) console.log('  ✅ ' + name); else { console.log('  ❌ ' + name); fails++; } };
  const app = document.getElementById('app');
  const has = (txt) => app.innerHTML.includes(txt);
  const rlen = () => app.innerHTML.length;

  T('legacy T4 migrated to a group', state.tournaments[3].groups && state.tournaments[3].groups.length === 1
    && state.tournaments[3].groups[0].teams.length === 2);

  T('dashboard read-only: 4 cards, no admin actions', rlen() > 1000
    && document.querySelectorAll('.card').length === 4 && !has('data-action="add-team"') && !has('Admin Mode'));
  T('champion shown on completed cup card', has('🏆 Champion: A1'));

  view = { type:'tournament', id:'t1' }; render();
  T('table tab: group pills + group table', rlen() > 800 && has('Group A') && has('Group B')
    && document.querySelectorAll('.table tbody tr').length === 4 && has('Standings'));
  tab = 'matches'; render();
  T('matches tab: group chips + RO hides the add-match form', !has('matchGroup') && document.querySelectorAll('.match-row').length === 4 && has('win-side'));
  tab = 'knockouts'; render();
  T('knockouts: bracket rounds + champion', has('Quarter-finals') && has('Semi-finals') && has('Final') && has('Champion!'));
  T('knockouts: 3 rounds rendered', document.querySelectorAll('.ko-round').length === 3);
  T('winner animations: WINNER stamps + confetti', has('WINNER') && has('confetti'));

  // overall rankings + advice
  tab = 'rankings'; render();
  T('rankings tab: every team, every stat + advice cards', rlen() > 800 && has('Overall Rankings')
    && has('Advice for the Next Tournament') && document.querySelectorAll('.rank-row').length === 8 && has('Pts'));
  T('rankings show medals, groups and knockout badge', has('🥇') && has('Group A') && has('KNOCKOUTS'));

  // group-stage-only tournament
  view = { type:'tournament', id:'t2' };
  tab = 'table'; render();
  T('T2 table renders with 2 groups', has('Group A') && has('Group B'));
  tab = 'knockouts'; render();
  T('T2 setup panel: qualify inputs + 4 pick slots', rlen() > 600 && has('Set Up Knockouts')
    && document.querySelectorAll('[data-qual-slot]').length === 4 && has('Total qualifiers'));
  tab = 'matches'; render();
  T('T2 matches with filter chips', has('All') && has('Group B'));

  // empty tournament
  view = { type:'tournament', id:'t3' };
  tab = 'table'; render();
  T('T3 empty: no groups yet', has('No groups yet'));
  tab = 'knockouts'; render();
  T('T3 knockouts: need teams notice', has('at least') && has('2'));

  console.log('\\n' + (fails === 0 ? '🎉 RO SMOKE PASSED' : '⚠️  ' + fails + ' RO FAILED'));
  globalThis.__exitCode = fails;
})();
`, sbRO);

// --- admin context: exercise editing flows through real actions that render ---
const sbAD = buildSandbox(true);
vm.createContext(sbAD);
vm.runInContext(appScript + `
(function(){
  let fails = 0;
  const T = (name, cond) => { if (cond) console.log('  ✅ ' + name); else { console.log('  ❌ ' + name); fails++; } };
  const app = document.getElementById('app');
  const has = (txt) => app.innerHTML.includes(txt);

  T('admin mode on', unlocked === true);
  const t2 = state.tournaments.find(x => x.id === 't2');
  openTournamentState(t2);

  // add a group while in table tab
  click_group: {
    handle('select-group', t2.groups[0].id, {});
    handle('add-group', null, {});
    T('admin added Group C', t2.groups.length === 3 && t2.groups[2].name === 'Group C');
  }
  // add a team to Group C
  view.groupId = t2.groups[2].id;
  document.getElementById('newTeamName').value = 'Fresh Face';
  handle('add-team', null, {});
  T('admin added team to Group C', t2.groups[2].teams.length === 1 && t2.groups[2].teams[0].name === 'Fresh Face');
  // move team between groups
  const mvSelect = { value: t2.groups[0].id };
  document.querySelector = (sel) => sel.includes('data-team-group') ? mvSelect : { value:'' };
  handle('move-team', t2.groups[2].teams[0].id, {});
  T('move team -> Group A', t2.groups[0].teams.length === 3 && t2.groups[2].teams.length === 0);
  document.querySelector = () => ({ value:'' });

  // matches tab: admin sees the group-aware add-match form
  tab = 'matches'; render();
  T('admin matches tab shows group select + filtered home/away', has('matchGroup') && t2.groups.length === 3);

  // knockout setup via UI actions: set counts 1 per group, create bracket -> 4 teams? (A3 teams + B2 teams -> 2+2? counts: A:1, B:1 -> total 2)
  view.qgValues = { [t2.groups[0].id]: 1, [t2.groups[1].id]: 1 };
  view.pickOverrides = {}; view.wildcards = 0;
  globalThis.__qualSlots = null; // target: querySelectorAll returns [] => auto picks
  document.querySelectorAll = (sel) => sel === '[data-qual-slot]' ? [] : [];
  handle('create-bracket', null, {});
  T('created 2-team single Final bracket', t2.knockouts && t2.knockouts.rounds.map(r=>r.length).join(',') === '1');
  // set final score + pen => champion
  t2.knockouts.rounds[0][0].homeScore = 1; t2.knockouts.rounds[0][0].awayScore = 1;
  t2.knockouts.rounds[0][0].penWinner = 'home';
  autoAdvance(t2);
  T('champion via penalty win', champion(t2) === t2.knockouts.rounds[0][0].homeId);
  tab = 'knockouts'; render();
  T('admin knockout view renders champion banner', has('is the Champion!'));

  console.log('\\n' + (fails === 0 ? '🎉 ADMIN SMOKE PASSED' : '⚠️  ' + fails + ' ADM FAILED'));
  globalThis.__exitCode = fails;
})();
`, sbAD);

const code = (sbRO.__exitCode || 0) + (sbAD.__exitCode || 0);
console.log('(smoke exit codes sum: ' + code + ')');
process.exit(code === 0 ? 0 : 1);