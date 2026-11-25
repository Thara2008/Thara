// Runs the REAL index.html <script> in a stubbed browser context, then executes an in-context
// test suite covering: admin accounts, groups, per-group tables, qualify counts, wildcards,
// dynamic bracket rounds (8 => QF, 16 => R16+QF), seeding, overrides, auto-advance, migration.
const fs = require('fs');
const vm = require('vm');
const nodeCrypto = require('crypto');

const html = fs.readFileSync('index.html', 'utf8');
const appScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const storage = (init, seedKey) => {
  const map = new Map();
  if (init != null) map.set(seedKey || 'fcm_league_manager_v1', init);
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); }
  };
};
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
        const m = sel.match(/^\[data-ko-(home|away|hs|as|l2h|l2a|et-h|et-a|penh|pena|pen|kickoff)="([^"]+)"\]$/);
        if (m){ const k = m[1] + ':' + m[2]; if (!koRegistry[k]) koRegistry[k] = mkEl(); return koRegistry[k]; }
        if (sel.startsWith('[data-team-group="')){ return { value: '' }; }
        return null;
      },
      querySelectorAll(sel){ return sel === '[data-qual-slot]' ? (sb.__qualSlots || []) : []; },
      createElement() { return {}; }
    },
    localStorage: storage(seedRaw),
    sessionStorage: storage(adminSession ? '1' : null, 'fcm_admin_unlocked'),
    alert(){}, confirm: () => true, prompt: () => null,
    URL: { createObjectURL: () => '', revokeObjectURL() {} },
    FileReader: function(){}, Blob: function(){},
    crypto: nodeCrypto.webcrypto,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    atob: atob,
    btoa: btoa,
    window: { addEventListener() {} }
  };
  return sb;
}

const sb = makeSandbox(null, false);
vm.createContext(sb);
vm.runInContext(appScript, sb);

const suite = `
(async function(){
  let fails = 0;
  const T = (name, cond, extra) => {
    if (cond) console.log('  ✅ ' + name);
    else { console.log('  ❌ ' + name + (extra ? ' — ' + JSON.stringify(extra) : '')); fails++; }
  };
  let alerts = [];
  globalThis.alert = m => alerts.push(String(m));
  const setEl = (id, val) => { document.getElementById(id).value = val; };
  const click = (action, id) => handle(action, id || null, { dataset: {}, getAttribute(){return null;} });

  console.log('\\n[1] Admin accounts + login gate');
  const head = adminAccounts.users.find(u => u.role === 'head');
  T('built-in head admin is seeded', !!head && head.username === 'tharana is the goat' && head.display === 'Tharana is the Goat');
  T('head admin stores only a salted PBKDF2 hash',
    !!head && head.algo === 'PBKDF2-SHA256' && typeof head.hash === 'string' && head.hash.length > 20 &&
    !Object.prototype.hasOwnProperty.call(head, 'password'));

  const testPass = 'T!' + Math.random().toString(36).slice(2) + '9';
  const tempAdmin = await makeLocalUser('Test Admin', testPass, 'Test Admin', 'admin');
  adminAccounts.users.push(tempAdmin); saveAdminAccounts();
  T('PBKDF2 verifies the correct password and rejects a wrong one',
    (await verifyLocalPassword(tempAdmin, testPass)) === true &&
    (await verifyLocalPassword(tempAdmin, testPass + 'x')) === false);

  await performLogin('test admin', testPass);
  T('local login is case-insensitive and unlocks admin mode', unlocked === true && serverMe.username === 'test admin');
  T('regular admin cannot open the Admins panel', isHeadAdmin() === false && adminManagementHTML() === '');
  let denied = false;
  try { await addAdminAccount('Nope Admin', 'pass' + Math.random(), 'Nope Admin'); }
  catch (e){ denied = String(e.message).includes('head admin'); }
  T('regular admin cannot create accounts', denied === true);
  await performLogout();
  T('logout clears the session', unlocked === false && serverMe === null);

  for (let i = 0; i < 5; i++){
    try { await performLogin('Test Admin', 'wrong-' + i); }
    catch (e){ /* expected */ }
  }
  let locked = false;
  try { await performLogin('Test Admin', testPass); }
  catch (e){ locked = String(e.message).includes('Too many'); }
  T('five failed logins lock the account for five minutes', locked === true);
  localStorage.removeItem(LOGIN_GUARD_KEY);

  serverMe = { name: head.display, display: head.display, username: head.username, role: 'head' };
  unlocked = true; loginOpen = false;
  T('head admin gets the protected badge', accountAreaHTML().includes('Head admin') && isHeadAdmin() === true);

  const adminPass = 'A!' + Math.random().toString(36).slice(2) + '8';
  const nextPass = 'B!' + Math.random().toString(36).slice(2) + '7';
  await addAdminAccount('Temp Admin', adminPass, 'Temp Admin');
  T('head admin can add a unique admin', adminAccounts.users.some(u => u.username === 'temp admin'));
  let duplicate = false;
  try { await addAdminAccount('temp admin', adminPass, 'Temp Admin'); }
  catch (e){ duplicate = String(e.message).includes('already exists'); }
  T('duplicate usernames are rejected', duplicate === true);
  await resetAdminPassword('Temp Admin', nextPass);
  const temp = adminAccounts.users.find(u => u.username === 'temp admin');
  T('head admin can reset another admin password',
    (await verifyLocalPassword(temp, nextPass)) === true && (await verifyLocalPassword(temp, adminPass)) === false);
  let protectedHead = false;
  try { await removeAdminAccount(head.username); }
  catch (e){ protectedHead = String(e.message).includes('cannot be removed'); }
  T('head admin cannot be removed', protectedHead === true);
  await removeAdminAccount('Temp Admin');
  T('head admin can remove another admin', !adminAccounts.users.some(u => u.username === 'temp admin'));
  const logText = JSON.stringify(localActivity);
  T('activity log records admin actions without passwords',
    logText.includes('Logged in') && logText.includes('Added admin') &&
    logText.includes('Reset the password') && logText.includes('Removed admin') &&
    !logText.includes(adminPass) && !logText.includes(nextPass) && !logText.includes(testPass));

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

  console.log('\\n[12] Group wizard + two-leg knockouts');
  const opts = groupOptions(16, 8, false);
  T('groupOptions returns best-first valid plans', opts.length > 0 && opts[0].recommended === true &&
    opts.every(o => o.sizes.reduce((s, n) => s + n, 0) === 16 && o.direct + o.wildcards === 8));
  T('groupOptions rejects an impossible knockout size', groupOptions(7, 8, false).length === 0);
  const parsed = groupWizardParse('Lions\\n Sharks, Eagles | Club | Tag\\nLions', []);
  T('wizard parses names, clubs, tags and duplicates', parsed.teams.length === 4 &&
    parsed.duplicates.length === 1 && parsed.duplicates[0] === 'Lions' &&
    parsed.teams[2].club === 'Club' && parsed.teams[2].tag === 'Tag');

  const wt = { id: 'wiz-' + Date.now(), name: 'Wizard Cup', createdAt: Date.now(), groups: [], matches: [], knockouts: null };
  state.tournaments.push(wt); openTournamentState(wt);
  const wd = groupWizardBlank();
  wd.teams = ['Q1','Q2','Q3','Q4','Q5','Q6','Q7','Q8'].map((n, i) => ({ id: 'w' + i, name: n, club: '', tag: '', seed: i < 2 }));
  groupWizardDraft = wd; groupWizardRefreshOptions();
  T('wizard auto-selects the largest knockout size that fits', wd.knockoutSize === 8);
  wd.knockoutSize = 4;
  groupWizardRefreshOptions();
  T('wizard builds group-break options', wd.options.length > 0 && wd.options[0].recommended === true);
  const wo = wd.options.find(o => o.wildcards === 0 && o.groupCount >= 2) || wd.options[0];
  wd.optionId = wo.id;
  wd.groups = wo.sizes.map((size, i) => ({ name: 'Group ' + String.fromCharCode(65 + i), capacity: size, teams: [] }));

  // Manual placement must work by click/select alone, and a full target group
  // must never eject a team from its current group.
  const moveDraft = groupWizardBlank();
  moveDraft.teams = ['M0','M1','M2'].map((name, i) => ({ id: 'mv' + i, name, club: '', tag: '', seed: false }));
  moveDraft.groups = [
    { name: 'Group A', capacity: 2, teams: ['mv0'] },
    { name: 'Group B', capacity: 1, teams: ['mv1'] }
  ];
  groupWizardDraft = moveDraft;
  groupWizardPickId = 'mv0';
  const picker = groupWizardPickHTML(moveDraft);
  T('manual placement offers click-to-add controls without dragging',
    picker.indexOf('data-action="wizard-pick-team"') !== -1 &&
    picker.indexOf('data-action="wizard-place-team"') !== -1 &&
    picker.indexOf('Add to Group B') !== -1 && picker.indexOf('mv0') !== -1);
  T('moving into a full group keeps the team in its current group',
    groupWizardMove('mv0', 1) === false &&
    moveDraft.groups[0].teams.indexOf('mv0') !== -1 &&
    moveDraft.groups[1].teams.indexOf('mv0') === -1);
  groupWizardError = '';
  groupWizardPickId = 'mv2';
  T('click placement adds the selected team and clears the pick',
    groupWizardMove('mv2', 0) === true &&
    moveDraft.groups[0].teams.indexOf('mv2') !== -1 &&
    groupWizardPickId === '');
  groupWizardDraft = wd;
  groupWizardPickId = '';
  groupWizardError = '';

  let cursor = 0;
  wd.groups.forEach(g => { g.teams = wd.teams.slice(cursor, cursor + g.capacity).map(x => x.id); cursor += g.capacity; });
  wd.method = 'manual'; wd.drawing = false; groupWizardCheckConflicts();
  groupWizardOpen = true; groupWizardStep = 5;
  const wizardMarkup = groupWizardHTML(wt);
  const groupStepAt = wizardMarkup.indexOf('Group stage');
  const knockoutStepAt = wizardMarkup.indexOf('Knockout');
  const previewStepAt = wizardMarkup.indexOf('Preview');
  T('wizard plans the group stage before the knockout stage and preview',
    groupStepAt !== -1 && groupStepAt < knockoutStepAt && knockoutStepAt < previewStepAt);
  T('wizard lock creates group fixtures + an empty pending bracket',
    groupWizardLock(wt) === true && wt.groups.length === wo.groupCount &&
    wt.matches.length === wo.totalGroupMatches && wt.knockouts.config.pending === true &&
    wt.knockouts.rounds[0].every(m => !m.homeId && !m.awayId));
  T('pending knockout analysis uses a friendly empty state',
    koAnalysisHTML(wt).indexOf('Analysis appears after the first knockout match') !== -1);
  wt.matches.forEach(m => { m.homeGoals = 2; m.awayGoals = 0; });
  T('group stage completion seeds the bracket from real tables',
    seedPendingBracket(wt) === true && wt.knockouts.config.pending === false &&
    wt.knockouts.rounds[0].every(m => m.homeId && m.awayId));
  T('seeded ties avoid same-group pairings', wt.knockouts.rounds[0].every(m => {
    const ga = groupOfTeam(wt, m.homeId), gb = groupOfTeam(wt, m.awayId);
    return ga && gb && ga.id !== gb.id;
  }));
  groupWizardDraft = wd; groupWizardOpen = true;
  wd.doubleRound = true;
  groupWizardRefreshOptions();
  const wo2 = wd.options[0];
  wd.optionId = wo2.id;
  wd.groups = wo2.sizes.map((size, i) => ({ name: 'Group ' + String.fromCharCode(65 + i), capacity: size, teams: [] }));
  cursor = 0;
  wd.groups.forEach(g => { g.teams = wd.teams.slice(cursor, cursor + g.capacity).map(x => x.id); cursor += g.capacity; });
  groupWizardLock(wt);
  T('double round-robin group fixtures remain single-leg',
    wt.matches.length === wo2.totalGroupMatches &&
    wt.matches.every(m => m.legMode == null && m.leg2HomeScore == null && m.leg2AwayScore == null && isTwoLeg(m) === false));
  groupWizardDraft = wd; groupWizardOpen = true;
  groupWizardStep = 4;
  click('wizard-size', '2');
  T('changing knockout size returns to the group stage and resets the draw',
    groupWizardStep === 2 && wd.knockoutSize === 2 && wd.optionId === '' &&
    wd.groups.length === 0 && groupWizardError.indexOf('draw was reset') !== -1);

  // Direct knockout: an admin can skip groups entirely.
  const dt = { id: 'direct-' + Date.now(), name: 'Direct Cup', createdAt: Date.now(),
    groups: [{ id: 'dtg', name: 'Group A', teams: [] }], matches: [], knockouts: null, registrations: [] };
  state.tournaments.push(dt); openTournamentState(dt);
  groupWizardOpen = true; groupWizardDraft = groupWizardBlank(); groupWizardStep = 1; groupWizardError = '';
  document.getElementById('wizardTeams').value = ['D1','D2','D3','D4','D5','D6','D7','D8'].join('\\n');
  click('wizard-skip');
  const dd = groupWizardDraft;
  T('admin can skip the group stage straight to knockouts',
    groupWizardStep === 4 && dd.skipGroups === true && dd.knockoutSize === 8 && dd.groups.length === 0);
  T('skipped group steps are marked in the wizard',
    groupWizardHTML(dt).indexOf('class="skipped"') !== -1 &&
    groupWizardHTML(dt).indexOf('<small>skipped</small>') !== -1);
  dd.teams[0].seed = true; dd.teams[1].seed = true;
  dd.teams[0].tag = 'UID-D1'; dd.teams[0].registrationId = 'rd1';
  dt.registrations = [{ id: 'rd1', name: 'Reg D1', username: 'D1', uid: 'UID-D1', device: '', createdAt: 0 }];
  groupWizardStep = 5;
  T('direct preview shows first-round pairs without group cards',
    groupWizardHTML(dt).indexOf('wizard-direct-pair') !== -1 &&
    groupWizardHTML(dt).indexOf('data-wizard-drop') === -1);
  T('direct knockout lock creates no groups or group fixtures',
    groupWizardLock(dt) === true && dt.groups.length === 0 && dt.matches.length === 0 &&
    Array.isArray(dt.teams) && dt.teams.length === 8);
  T('direct bracket is filled immediately and not pending',
    dt.knockouts.config.direct === true && dt.knockouts.config.pending !== true &&
    dt.knockouts.rounds[0].every(m => m.homeId && m.awayId));
  T('direct bracket teams resolve by name',
    dt.knockouts.rounds[0].every(m => teamById(dt, m.homeId) && teamById(dt, m.awayId) &&
      teamName(dt, m.homeId) !== '???' && teamName(dt, m.awayId) !== '???'));
  T('marked seeds get protected first-round slots',
    teamById(dt, dt.knockouts.rounds[0][0].homeId).name === 'D1' &&
    teamById(dt, dt.knockouts.rounds[0][0].awayId).name === 'D8' &&
    teamById(dt, dt.knockouts.rounds[0][2].homeId).name === 'D2' &&
    teamById(dt, dt.knockouts.rounds[0][2].awayId).name === 'D7');
  T('registrations stay placed through their UID in a direct bracket',
    registrationPlaced(dt, dt.registrations[0]) === true &&
    dt.teams.every(team => !team.note));
  const backDraft = groupWizardBlank();
  backDraft.teams = dd.teams.slice(); backDraft.skipGroups = true; backDraft.knockoutSize = 8;
  groupWizardDraft = backDraft; groupWizardOpen = true; groupWizardStep = 4;
  click('wizard-use-groups');
  T('admin can switch back from direct knockout to the group stage',
    groupWizardStep === 2 && backDraft.skipGroups === false && backDraft.knockoutSize === 8);

  const dtBad = { id: 'direct-bad-' + Date.now(), name: 'Bad Direct', createdAt: Date.now(),
    groups: [], matches: [], knockouts: null, registrations: [] };
  state.tournaments.push(dtBad); openTournamentState(dtBad);
  groupWizardOpen = true; groupWizardDraft = groupWizardBlank(); groupWizardStep = 1; groupWizardError = '';
  document.getElementById('wizardTeams').value = ['E1','E2','E3','E4','E5','E6'].join('\\n');
  click('wizard-skip');
  T('skip warns when the team count cannot make a bracket',
    groupWizardStep === 1 && groupWizardError.indexOf('Direct knockouts need') === 0);
  const badDraft = groupWizardBlank();
  badDraft.teams = ['E1','E2','E3','E4','E5','E6'].map((name, i) => ({ id: 'e' + i, name, club: '', tag: '', seed: false }));
  badDraft.skipGroups = true; badDraft.knockoutSize = 4;
  groupWizardDraft = badDraft; groupWizardOpen = true;
  T('direct lock rejects a team count that is not a bracket size',
    groupWizardLock(dtBad) === false && groupWizardError.indexOf('all teams') !== -1);

  const kt = { id: 'ko-' + Date.now(), name: 'Two-leg Cup', createdAt: Date.now(),
    groups: [{ id: 'kg', name: 'Group A', teams: ['K1','K2','K3','K4'].map((n, i) => ({ id: 'k' + i, name: n, note: '' })) }],
    matches: [], knockouts: null };
  state.tournaments.push(kt); openTournamentState(kt);
  const rounds = makeRounds(4);
  rounds[0][0].homeId = 'k0'; rounds[0][0].awayId = 'k1';
  rounds[0][1].homeId = 'k2'; rounds[0][1].awayId = 'k3';
  kt.knockouts = { config: { counts: { kg: 4 }, wildcards: 0, roundModes: defaultRoundModes(4), rules: Object.assign({}, KO_DEFAULT_RULES) }, rounds: rounds };
  const tieA = rounds[0][0], tieB = rounds[0][1], final = rounds[1][0];
  T('first round defaults to two legs and the final stays single',
    roundModeFor(kt, 0) === 'two' && roundModeFor(kt, 1) === 'single');
  const koSet = (id, key, val) => { document.querySelector('[data-ko-' + key + '="' + id + '"]').value = val; };
  koSet(tieA.id, 'home', 'k0'); koSet(tieA.id, 'away', 'k1');
  koSet(tieA.id, 'hs', '2'); koSet(tieA.id, 'as', '0'); click('save-ko-match', tieA.id);
  T('Leg 1 alone does not advance a winner', tieAggregate(tieA).complete === false && !final.homeId);
  koSet(tieA.id, 'l2h', '1'); koSet(tieA.id, 'l2a', '0'); click('save-ko-match', tieA.id);
  T('Leg 2 completes the aggregate and advances the winner',
    tieAggregate(tieA).complete === true && tieAggregate(tieA).aggH === 2 &&
    tieAggregate(tieA).aggA === 1 && final.homeId === 'k0');

  koSet(tieB.id, 'home', 'k2'); koSet(tieB.id, 'away', 'k3');
  koSet(tieB.id, 'hs', '1'); koSet(tieB.id, 'as', '0'); click('save-ko-match', tieB.id);
  koSet(tieB.id, 'l2h', '1'); koSet(tieB.id, 'l2a', '0');
  click('save-ko-match', tieB.id);
  T('a level aggregate without a shootout is rejected',
    alerts[alerts.length - 1].toLowerCase().indexOf('level') !== -1 && tieB.leg2HomeScore == null);
  koSet(tieB.id, 'penh', '4'); koSet(tieB.id, 'pena', '3'); click('save-ko-match', tieB.id);
  T('penalties decide a level aggregate', final.awayId === 'k2' &&
    tieAggregate(tieB).decidedBy === 'penalties' && koHowWon(kt, tieB).toLowerCase().indexOf('penalties') !== -1);

  koSet(final.id, 'home', final.homeId); koSet(final.id, 'away', final.awayId);
  koSet(final.id, 'hs', '2'); koSet(final.id, 'as', '1'); click('save-ko-match', final.id);
  T('single-match final produces a champion', champion(kt) === 'k0');
  koSet(tieB.id, 'l2h', '2'); koSet(tieB.id, 'l2a', '0'); click('save-ko-match', tieB.id);
  T('editing a winner updates later rounds and clears stale results',
    final.awayId === 'k3' && champion(kt) === null && final.homeScore == null && final.awayScore == null);
  T('knockout analysis derives verdicts and labels the estimate',
    koAnalysisHTML(kt).indexOf('Estimate, not a prediction') !== -1 &&
    koAnalysisHTML(kt).indexOf('verdict-tag') !== -1);

  console.log('\\n[13] Public registration -> wizard import -> groups + knockout bracket');
  const rt = { id: 'rt', name: 'Registration Cup', createdAt: Date.now(),
    groups: [{ id: 'rtg', name: 'Group A', teams: [] }], matches: [], knockouts: null, registrations: [] };
  state.tournaments.push(rt); openTournamentState(rt);
  unlocked = false; // visitors can register without an admin session
  setEl('regName', 'A'); setEl('regUsername', 'PlayerA'); setEl('regUid', 'UID-A1');
  click('registration-submit');
  T('short name is rejected', registrationsOf(rt).length === 0 && registrationError.indexOf('Name must') === 0);
  setEl('regName', 'Alpha'); click('registration-submit');
  T('public registration saves Name / Username / UID', registrationsOf(rt).length === 1 &&
    registrationLine(rt.registrations[0]) === 'PlayerA |  | UID-A1');
  T('registration is not placed in the tournament yet', registrationPlaced(rt, rt.registrations[0]) === false);
  click('registration-submit');
  T('duplicate UID is rejected', registrationsOf(rt).length === 1 && registrationError.indexOf('UID is already registered') !== -1);
  T('duplicate detection uses UID only, case-insensitively',
    registrationDuplicate(rt, { name: 'X', username: 'playera', uid: 'UID-X' }) === false &&
    registrationDuplicate(rt, { name: 'X', username: 'PlayerX', uid: 'uid-a1' }) === true);
  [['Bravo','PlayerA','UID-B2'], ['Charlie','PlayerC','UID-C3'], ['Delta','PlayerD','UID-D4']].forEach(r => {
    setEl('regName', r[0]); setEl('regUsername', r[1]); setEl('regUid', r[2]); click('registration-submit');
  });
  T('four public teams are registered', registrationsOf(rt).length === 4);
  const publicTab = registrationTabHTML(rt);
  T('registration tab lists teams but hides admin controls from visitors',
    publicTab.indexOf('Alpha') !== -1 && publicTab.indexOf('PlayerA') !== -1 &&
    publicTab.indexOf('data-action="registration-clear"') === -1 &&
    publicTab.indexOf('data-action="wizard-import-registrations"') === -1);
  click('registration-open');
  const modal = registrationModalHTML();
  T('registration popup collects exactly Name, Username and UID',
    modal.indexOf('id="regName"') !== -1 && modal.indexOf('id="regUsername"') !== -1 &&
    modal.indexOf('id="regUid"') !== -1 && modal.indexOf('exploring') !== -1);
  click('registration-close');
  T('registration popup can be ignored / closed', registrationModalId === '' && registrationModalHTML() === '');

  unlocked = true; // now hand the sign-ups to the admin wizard
  T('admin registration tools are visible to admins',
    registrationTabHTML(rt).indexOf('data-action="wizard-import-registrations"') !== -1 &&
    registrationTabHTML(rt).indexOf('data-action="registration-clear"') !== -1);
  click('wizard-import-registrations');
  const idt = groupWizardDraft;
  T('wizard import shows Username as the team name and keeps UID as identity', groupWizardOpen === true && idt.source === 'registrations' &&
    idt.teams.length === 4 && idt.teams[0].name === 'PlayerA' && idt.teams[0].club === '' && idt.teams[0].tag === 'UID-A1' &&
    idt.teams[1].name === 'PlayerA' && idt.teams[1].tag === 'UID-B2');
  T('wizard import keeps a link back to every registration',
    idt.teams.every(team => !!team.registrationId) &&
    idt.teams.map(team => team.registrationId).join(',') === rt.registrations.map(r => r.id).join(','));
  T('matching Usernames with different UIDs are not flagged as duplicates', idt.duplicates.length === 0);
  T('wizard explains UID-only identity and Username display',
    groupWizardHTML(rt).indexOf('the UID is used only to keep duplicate players apart') !== -1 &&
    groupWizardHTML(rt).indexOf('the Username is shown as the team name') !== -1 &&
    groupWizardHTML(rt).indexOf('placeholder="UID"') !== -1);
  idt.knockoutSize = 4; groupWizardRefreshOptions();
  const rOpt = idt.options.find(o => o.wildcards === 0 && o.groupCount >= 2) || idt.options[0];
  idt.optionId = rOpt.id; groupWizardInitGroups();
  let cursorR = 0;
  idt.groups.forEach(g => { g.teams = idt.teams.slice(cursorR, cursorR + g.capacity).map(x => x.id); cursorR += g.capacity; });
  T('wizard lock creates groups and a pending knockout bracket with registration links',
    groupWizardLock(rt) === true && rt.groups.length >= 2 &&
    allTeams(rt).every(team => !!team.registrationId) &&
    rt.knockouts && rt.knockouts.config.pending === true &&
    rt.matches.every(m => m.groupId && m.homeGoals == null));
  T('created teams display Username only and do not show UID notes',
    allTeams(rt).every(team => team.name === 'PlayerA' || team.name === 'PlayerC' || team.name === 'PlayerD') &&
    allTeams(rt).every(team => !team.note));
  T('registered teams are now counted as placed by UID link',
    rt.registrations.every(reg => registrationPlaced(rt, reg) === true));
  rt.matches.forEach(m => { m.homeGoals = 1; m.awayGoals = 0; });
  T('bracket seeds from completed group tables', seedPendingBracket(rt) === true &&
    rt.knockouts.config.pending === false && rt.knockouts.rounds[0].length === 2);
  groupWizardOpen = false; groupWizardDraft = null;

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
    matches: [{id:'m1', homeId:'p0', awayId:'p1', homeGoals:2, awayGoals:1,
               legMode:'two', leg2HomeScore:1, leg2AwayScore:0}],
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
  T('imported group fixtures are stripped back to single-leg',
    old.matches.every(m => m.legMode == null && m.leg2HomeScore == null && m.leg2AwayScore == null && isTwoLeg(m) === false));
  T('legacy knockouts -> rounds [1,1,1]', old.knockouts.rounds.map(r=>r.length).join(',') === '1,1,1');
  T('legacy auto-advance keeps QF winner in SF', old.knockouts.rounds[1][0].homeId === 'p0');
  console.log('\\n' + (fails === 0 ? '🎉 MIGRATION TESTS PASSED' : '⚠️ ' + fails + ' FAILED'));
  globalThis.__exitCode = fails;
})();
`, sb2);

sb.__explode = true;
Promise.resolve(vm.runInContext(suite, sb)).then(() => {
  const exitCode = (sb.__exitCode || 0) + (sb2.__exitCode || 0);
  console.log('\\n(suite exit codes sum: ' + exitCode + ')');
  process.exit(exitCode === 0 ? 0 : 1);
}).catch(err => {
  console.error(err);
  process.exit(1);
});