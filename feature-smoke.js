'use strict';
/* Feature smoke: renders every public route and exercises fan actions + admin CRUD
 * against a realistic seeded state. Runs fully offline in a VM (no browser needed).
 * Run: node feature-smoke.js   (also part of `npm test`) */
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('index.html has no inline app script');
const appScript = match[1];
const LS_KEY = 'fcm_league_manager_v1';

const createdAt = Date.parse('2026-10-01T09:00:00.000Z');
const T1 = {
  id: 't1',
  name: 'Ceylon Cup',
  createdAt,
  groups: [{
    id: 'ga', name: 'Group A', teams: [
      { id: 'a1', name: 'Lions', note: '' },
      { id: 'a2', name: 'Sharks', note: '' },
      { id: 'b1', name: 'Eagles', note: '' },
      { id: 'b2', name: 'Tigers', note: '' }
    ]
  }],
  matches: [
    { id: 'm1', groupId: 'ga', homeId: 'a1', awayId: 'a2', homeGoals: 2, awayGoals: 0, kickoff: '2026-09-01T10:00:00.000Z' },
    { id: 'm2', groupId: 'ga', homeId: 'b1', awayId: 'b2', kickoff: '2099-01-01T10:00:00.000Z' },
    { id: 'm3', groupId: 'ga', homeId: 'a1', awayId: 'b1', kickoff: '2099-02-01T10:00:00.000Z' }
  ],
  knockouts: {
    config: { counts: { ga: 4 }, wildcards: 0 },
    rounds: [[
      { id: 'k1', homeId: 'a1', awayId: 'b1', homeScore: 3, awayScore: 1, penWinner: null, kickoff: '2026-09-02T10:00:00.000Z' }
    ]]
  }
};

const teamIds = ['a1', 'a1', 'a1', 'a2', 'a2', 'a2', 'b1', 'b1', 'b1', 'b2', 'b2', 'b2'];
const players = teamIds.map((teamId, i) => ({
  id: 'p' + (i + 1),
  name: i === 0 ? 'Lions Star' : 'Player ' + (i + 1),
  teamId,
  tournamentId: 't1',
  position: i === 0 ? 'FWD' : i === 1 ? 'GK' : i < 6 ? 'MID' : 'DEF',
  photo: '',
  bonusXp: i === 0 ? 40 : 0,
  badges: i === 0 ? ['Captain'] : []
}));

const seedState = {
  tournaments: [T1],
  site: {
    logo: '',
    season: 'Season 1 · 2026',
    announcement: { text: 'Matchday: cup final tonight', enabled: true, style: 'urgent', updatedAt: 1000 },
    about: {
      story: 'A community league built for FC Mobile players.',
      mission: 'Fair matches every week.',
      format: 'Groups then knockouts.',
      staff: [{ id: 's1', name: 'League Admin', role: 'Founder', photo: '' }],
      links: [],
      sponsors: []
    },
    honours: [
      { id: 'h1', label: 'Titles won', value: 3, icon: '🏆', note: 'Champions crowned' },
      { id: 'h2', label: 'Golden Boots', value: 2, icon: '👟', note: 'Top scorers' },
      { id: 'h3', label: 'Matches played', value: 48, icon: '📅', note: 'Every fixture' }
    ],
    news: [
      { id: 'n1', title: 'Cup final preview', category: 'Match reports', author: 'Media', date: '2026-10-20', cover: '', body: 'The Lions are ready.\n\nKickoff is near.', createdAt: 300 },
      { id: 'n2', title: 'New signing announced', category: 'Transfers', author: 'Media', date: '2026-09-01', cover: '', body: 'A new midfielder joins the squad.', createdAt: 200 }
    ],
    reports: {
      't1:g:m1': {
        score: { home: 2, away: 0 },
        scorers: [{ id: 'sc1', playerId: 'p1', name: '', teamId: 'a1', minute: 12 }],
        lineups: { home: ['p1', 'p2'], away: ['p4'] },
        motmPlayerId: 'p1',
        motmName: '',
        report: 'A composed win for the Lions.\n\nThey controlled midfield.',
        gallery: [],
        updatedAt: 1000
      }
    },
    players,
    predictions: {
      't1:g:m1': {
        entries: [
          { device: 'other1', name: 'Exact Fan', home: 2, away: 0, at: 10 },
          { device: 'other2', name: 'Home Win Fan', home: 1, away: 0, at: 20 }
        ]
      }
    },
    motm: {
      't1:g:m1': { open: true, votes: [{ device: 'other', playerId: 'p2', at: 10 }], winner: '' }
    },
    fantasy: {
      't1:G': {
        picks: players.slice(0, 11).map(p => p.id),
        note: 'Balanced best XI',
        submissions: []
      }
    },
    power: {
      updatedAt: 0,
      entries: [
        { id: 'pw1', rank: 1, name: 'Lions', teamId: 'a1', tournamentId: 't1', movement: 2, note: 'Flying' },
        { id: 'pw2', rank: 2, name: 'Eagles', teamId: 'b1', tournamentId: 't1', movement: -1, note: 'Slipped' }
      ]
    },
    polls: [
      { id: 'poll1', question: 'Who lifts the cup?', open: true, createdAt: 200, options: [{ id: 'o1', label: 'Lions' }, { id: 'o2', label: 'Eagles' }], votes: [{ device: 'other', optionId: 'o1', at: 10 }] },
      { id: 'poll2', question: 'Was the final a classic?', open: false, createdAt: 100, options: [{ id: 'o3', label: 'Yes' }, { id: 'o4', label: 'No' }], votes: [{ device: 'other', optionId: 'o3', at: 10 }] }
    ],
    spotlight: {
      enabled: true,
      playerId: 'p1',
      name: 'Lions Star',
      teamId: 'a1',
      tournamentId: 't1',
      month: 'October',
      stats: '7 goals · 4 assists',
      writeup: 'The in-form forward carrying the title race.',
      photo: ''
    }
  }
};

function makeStorage(initial){
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem(k){ return map.has(k) ? map.get(k) : null; },
    setItem(k, v){ map.set(k, String(v)); },
    removeItem(k){ map.delete(k); },
    clear(){ map.clear(); }
  };
}

function buildSandbox(admin, empty){
  const els = {};
  const alerts = [];
  const app = { innerHTML: '' };
  const initial = {};
  if (!empty){
    initial[LS_KEY] = JSON.stringify(seedState);
    initial['ceylonfc_myteam_v1'] = 'a1';
    initial['ceylonfc_device_v1'] = 'device-test-12345';
  }
  const ctx = {
    console,
    document: {
      addEventListener(){},
      getElementById(id){
        if (id === 'app') return app;
        if (!els[id]) els[id] = { value: '', checked: false, selectedOptions: [], dataset: {} };
        return els[id];
      },
      querySelector(){ return { value: '' }; },
      querySelectorAll(){ return []; },
      createElement(){ return { style: {}, setAttribute(){}, click(){}, appendChild(){}, remove(){} }; },
      body: { appendChild(){}, removeChild(){} }
    },
    localStorage: makeStorage(initial),
    sessionStorage: makeStorage(admin ? {
      ceylonfc_admin_session_v1: JSON.stringify({
        username: 'tharana is the goat',
        name: 'Tharana is the Goat',
        role: 'head',
        sessionVersion: 1
      })
    } : {}),
    alert(msg){ alerts.push(String(msg)); },
    confirm(){ return true; },
    prompt(){ return ''; },
    URL: { createObjectURL(){ return 'blob:test'; }, revokeObjectURL(){} },
    setTimeout,
    clearTimeout
  };
  ctx.globalThis = ctx;
  const context = vm.createContext(ctx);
  return { context, app, els, alerts };
}

function runFeatures(){
  const results = [];
  const T = (name, cond, extra) => {
    results.push({ name, ok: !!cond, extra: extra || '' });
  };
  const app = document.getElementById('app');
  const has = s => app.innerHTML.indexOf(s) !== -1;
  const count = s => app.innerHTML.split(s).length - 1;
  const go = (tabId, page, param, sub) => {
    route = tabId;
    routePage = page || null;
    routeParam = param || '';
    if (sub) fanSub = sub;
    routeTouched = true;
    render();
  };
  const fill = (id, value) => { document.getElementById(id).value = value; };
  const check = (id, value) => { document.getElementById(id).checked = value; };
  const adminMsgs = [];
  const baseSave = save;
  save = function(message){ if (message) adminMsgs.push(String(message)); return baseSave(message); };

  /* ---------- public navigation + Home ---------- */
  go('home');
  T('home renders brand, fixtures, news, honours, poll and spotlight',
    has('Ceylon FC') && has('Next up') && has('Lions') && has('Latest news') &&
    has('Club honours') && has('Who lifts the cup?') && has('Lions Star'));
  T('announcement banner renders its text and urgent style',
    has('announce-banner ann-urgent') && has('Matchday: cup final tonight'));
  T('remembered My team is active', has('data-action="fixture-myteam"') && !has('My team (set)'));
  T('home honours expose count-up values', count('data-count="') >= 3 && has('data-count="3"'));
  T('home explains local-time fixtures and calendar exports',
    has('local time zone') && has('Add to calendar'));
  T('global search bar is available in the header',
    has('id="siteSearch"') && has('id="siteSearchResults"') && has('aria-label="Clear search"'));

  const lionsSearch = globalSearchResultsHTML('Lions');
  T('global search finds a team and its next fixture',
    lionsSearch.indexOf('data-action="open-tournament"') !== -1 &&
    lionsSearch.indexOf('Next fixture') !== -1 &&
    lionsSearch.indexOf('Lions <span class="search-vs">vs</span> Eagles') !== -1);
  T('global search finds players, news and site pages',
    globalSearchResultsHTML('Lions Star').indexOf('data-action="open-player"') !== -1 &&
    globalSearchResultsHTML('Cup final preview').indexOf('data-action="open-news"') !== -1 &&
    globalSearchResultsHTML('predictions').indexOf('data-action="search-fan"') !== -1);
  T('global search is case-insensitive and reports empty results',
    globalSearchResultsHTML('lIoNs').indexOf('Lions') !== -1 &&
    globalSearchResultsHTML('no-such-entity').indexOf('No results for') !== -1);
  T('global search escapes user input', globalSearchResultsHTML('<img src=x onerror=alert(1)>').indexOf('&lt;img') !== -1 &&
    globalSearchResultsHTML('<img src=x onerror=alert(1)>').indexOf('<img') === -1);

  const allStrips = count('class="strip-match');
  fixtureTeamFilter = 'a1';
  render();
  const filteredStrips = count('class="strip-match');
  T('home fixture team filter narrows the strip', allStrips === 2 && filteredStrips === 1, allStrips + ' -> ' + filteredStrips);
  fixtureTeamFilter = 'b1';
  handle('fixture-myteam');
  T('My team action stores the remembered team', myTeamRead() === 'b1');
  handle('fixture-clear');
  T('clear filter resets the strip', fixtureTeamFilter === '');

  const oldSig = announcementSignature();
  dismissAnnouncement();
  T('announcement dismissal is remembered', announcementDismissed());
  state.site.announcement.text = 'Matchday: kickoff moved';
  state.site.announcement.updatedAt = oldSig.length + 1;
  T('changing the announcement resets dismissal', !announcementDismissed());
  render();
  T('updated announcement is visible again', has('kickoff moved'));
  dismissAnnouncement();
  render();
  T('dismissed announcement is hidden for visitors', unlocked || !has('announce-banner'));

  /* ---------- fixtures + match reports ---------- */
  go('fixtures');
  T('fixtures page lists upcoming group matches and results',
    has('Upcoming fixtures') && has('Lions') && has('Eagles') && has('Results'));
  T('fixtures page links every result to a match report',
    has('data-action="open-match"') && has('data-id="t1:g:m1"') && has('data-id="t1:k:k1"'));
  const ics = buildMatchICS(findMatchMeta('t1:g:m2'));
  T('calendar export contains a UTC event with both teams',
    ics.indexOf('BEGIN:VCALENDAR') === 0 && ics.indexOf('DTSTART:') !== -1 &&
    ics.indexOf('SUMMARY:Eagles vs Tigers') !== -1);

  go('fixtures', 'match', 't1:g:m1');
  T('match report page shows score, scorers, lineups, MOTM and report',
    has('Match report') && has('2') && has('A composed win for the Lions') &&
    has('Lions Star') && has('Lineups') && has('Man of the Match'));

  /* ---------- news ---------- */
  go('news');
  T('news feed shows hero + latest articles and categories',
    has('Cup final preview') && has('New signing announced') && has('Match reports') && has('Transfers'));
  handle('news-filter', 'Transfers');
  T('news category filter applies', has('New signing announced') && !has('Cup final preview'));
  handle('news-filter', 'All');
  go('news', 'post', 'n1');
  T('news post page renders its body', has('Cup final preview') && has('The Lions are ready.') && has('Kickoff is near.'));
  T('news detail route round-trips through the hash parser',
    JSON.stringify(parseHashRoute(matchPageHash('t1:g:m1'))) === JSON.stringify({ tab: 'fixtures', page: 'match', param: 't1:g:m1', sub: null }));

  /* ---------- honours + about + players + power ---------- */
  go('hall');
  T('honours page shows counters and champion history',
    has('data-count="3"') && has('Past champions') && has('Ceylon Cup') && has('Lions'));
  go('about');
  T('about page renders story, staff and links', has('A community league built') && has('League Admin') && has('About Ceylon FC'));
  go('players');
  T('players page lists player cards and XP guidance',
    has('Lions Star') && has('Player 2') && has('XP') && has('Captain'),
    [has('Lions Star'), has('Player 2'), has('XP'), has('Captain'), has('No players added')].join(','));
  go('players', 'player', 'p1');
  T('player profile shows level, XP and badges',
    has('Lions Star') && has('Level') && has('XP') && has('Captain'),
    [has('Lions Star'), has('Level'), has('XP'), has('Captain'), has('Player not found')].join(','));
  go('power');
  T('power rankings show rise/fall arrows and notes',
    has('Lions') && has('▲ 2') && has('▼ 1') && has('Flying') && has('Slipped'));

  /* ---------- predictions ---------- */
  go('fans', null, null, 'predict');
  T('prediction page lists an open match and the leaderboard',
    has('Predict the score') && has('id="predict-name-t1:g:m2"') && has('Fan leaderboard'));
  T('prediction leaderboard scores exact = 3 and result = 1',
    predictionLeaderboardRows()[0].name === 'Exact Fan' && predictionLeaderboardRows()[0].points === 3 &&
    predictionLeaderboardRows()[1].points === 1);
  fill('predict-name-t1:g:m2', 'Fan One');
  fill('predict-home-t1:g:m2', '3');
  fill('predict-away-t1:g:m2', '2');
  handle('predict-submit', 't1:g:m2');
  T('prediction saves locally for this device',
    state.site.predictions['t1:g:m2'].entries.length === 1 &&
    state.site.predictions['t1:g:m2'].entries[0].home === 3);
  fill('predict-name-t1:g:m2', 'Fan One');
  fill('predict-home-t1:g:m2', '1');
  fill('predict-away-t1:g:m2', '0');
  handle('predict-submit', 't1:g:m2');
  T('changing a prediction keeps one entry per device',
    state.site.predictions['t1:g:m2'].entries.length === 1 &&
    state.site.predictions['t1:g:m2'].entries[0].away === 0);
  T('predictions lock once a match is finished', predictionOpen(findMatchMeta('t1:g:m1')) === false);

  /* ---------- MOTM ---------- */
  go('fans', null, null, 'motm');
  T('MOTM page lists open voting', has('motm-player-t1:g:m1') && has('Man of the Match'));
  const motmBefore = motmBox('t1:g:m1').votes.length;
  fill('motm-player-t1:g:m1', 'p1');
  handle('motm-vote', 't1:g:m1');
  T('MOTM vote is stored for this device', motmBox('t1:g:m1').votes.length === motmBefore + 1);
  fill('motm-player-t1:g:m1', 'p2');
  handle('motm-vote', 't1:g:m1');
  T('MOTM duplicate vote is blocked locally', motmBox('t1:g:m1').votes.length === motmBefore + 1);

  /* ---------- fantasy ---------- */
  go('fans', null, null, 'fantasy');
  T('fantasy page shows an official pitch and 11 slots',
    has('Team of the Week') && has('Official Team of the Week') && count('class="pitch-player') === 11);
  T('fantasy options are restricted to round teams', fantasyPlayerOptions(fantasyRoundMeta('t1:G')).length === 12);
  fill('fantasy-name', 'Fan XI');
  state.site.players.slice(0, 11).forEach((p, i) => fill('fan-pick-' + i, p.id));
  handle('fantasy-submit');
  T('fantasy submission saves one XI per device',
    fantasyStore('t1:G').submissions.length === 1 && readFantasyPicks('fan-pick').length === 11);

  /* ---------- polls ---------- */
  go('fans', null, null, 'polls');
  T('polls page shows an open poll and a closed poll',
    has('Who lifts the cup?') && has('Was the final a classic?') && has('id="poll-option-poll1"') && !has('id="poll-option-poll2"'));
  const pollBefore = state.site.polls.find(p => p.id === 'poll1').votes.length;
  fill('poll-option-poll1', 'o1');
  handle('poll-vote', 'poll1');
  T('poll vote is stored for this device',
    state.site.polls.find(p => p.id === 'poll1').votes.length === pollBefore + 1);
  fill('poll-option-poll1', 'o2');
  handle('poll-vote', 'poll1');
  T('poll duplicate vote is blocked locally',
    state.site.polls.find(p => p.id === 'poll1').votes.length === pollBefore + 1);

  /* ---------- admin CRUD ---------- */
  if (unlocked) {
    go('home');
    handle('announce-edit');
    fill('announceText', 'Admin wrote a new notice');
    fill('announceStyle', 'warning');
    check('announceEnabled', true);
    handle('announce-save');
    T('admin saves the announcement', state.site.announcement.text === 'Admin wrote a new notice' &&
      state.site.announcement.style === 'warning' && state.site.announcement.enabled === true);

    go('fixtures');
    fill('kickoff-t1:g:m2', '2099-04-05T18:30');
    handle('save-kickoff', 't1:g:m2');
    T('admin kickoff save updates the match', !!findMatchMeta('t1:g:m2').m.kickoff);

    handle('news-new');
    fill('news-title', 'Admin test article');
    fill('news-category', 'Announcements');
    fill('news-date', '2026-10-25');
    fill('news-author', 'Admin');
    fill('news-cover-url', '');
    fill('news-body', 'Body written during the feature smoke test.');
    handle('news-save');
    const newsItem = state.site.news.find(n => n.title === 'Admin test article');
    T('admin creates a news article', !!newsItem && newsItem.category === 'Announcements');
    if (newsItem){
      handle('news-delete', newsItem.id);
      T('admin deletes a news article', !state.site.news.some(n => n.id === newsItem.id));
    }

    handle('report-edit', 't1:g:m1');
    fill('report-body', 'Updated report body.');
    fill('report-scorer-player-sc1', 'p1');
    fill('report-scorer-name-sc1', 'Lions Star');
    fill('report-scorer-minute-sc1', '18');
    fill('report-scorer-team-sc1', 'a1');
    fill('report-motm', 'p1');
    handle('report-save');
    T('admin updates a match report', state.site.reports['t1:g:m1'].report === 'Updated report body.');

    handle('honour-edit');
    honoursDraft.forEach(h => {
      fill('honour-label-' + h.id, h.label);
      fill('honour-value-' + h.id, String(h.value));
      fill('honour-icon-' + h.id, h.icon);
      fill('honour-note-' + h.id, h.note || '');
    });
    const honourCount = honoursDraft.length;
    handle('honour-add');
    const newHonour = honoursDraft[honoursDraft.length - 1];
    fill('honour-label-' + newHonour.id, 'Clean sheets');
    fill('honour-value-' + newHonour.id, '11');
    fill('honour-icon-' + newHonour.id, '🧤');
    fill('honour-note-' + newHonour.id, 'Defensive record');
    handle('honour-save');
    T('admin adds an honour', state.site.honours.length === honourCount + 1 &&
      state.site.honours.some(h => h.label === 'Clean sheets' && h.value === 11));

    handle('player-new');
    fill('player-name', 'New Signing');
    fill('player-team', 'a1');
    fill('player-position', 'MID');
    fill('player-bonus', '25');
    handle('player-save');
    const newPlayer = state.site.players.find(p => p.name === 'New Signing');
    T('admin adds a player', !!newPlayer && newPlayer.teamId === 'a1' && newPlayer.bonusXp === 25);
    if (newPlayer){
      handle('player-edit', newPlayer.id);
      fill('player-name', 'New Signing');
      fill('player-team', 'a1');
      fill('player-position', 'MID');
      fill('player-bonus', '25');
      fill('player-badge', 'Fan Favourite');
      handle('player-badge-add', newPlayer.id);
      handle('player-save');
      T('admin adds a manual player badge',
        state.site.players.find(p => p.id === newPlayer.id).badges.indexOf('Fan Favourite') !== -1);
    }

    handle('power-edit');
    powerDraft.forEach(e => {
      fill('power-name-' + e.id, e.name);
      fill('power-rank-' + e.id, String(e.rank));
      fill('power-move-' + e.id, String(e.movement));
      fill('power-note-' + e.id, e.note || '');
    });
    fill('power-name-pw1', 'Lions FC');
    fill('power-rank-pw1', '1');
    fill('power-move-pw1', '3');
    fill('power-note-pw1', 'Still flying');
    handle('power-save');
    T('admin edits power rankings', state.site.power.entries.some(e => e.name === 'Lions FC' && e.movement === 3));

    handle('poll-new');
    fill('poll-question', 'Admin poll question?');
    pollDraft.options.forEach((o, i) => fill('poll-option-label-' + o.id, i === 0 ? 'Yes' : 'No'));
    check('poll-open', true);
    handle('poll-save');
    const newPoll = state.site.polls.find(p => p.question === 'Admin poll question?');
    T('admin creates a poll', !!newPoll && newPoll.open === true && newPoll.options.length === 2);

    handle('spotlight-edit');
    fill('spotlight-player', 'p1');
    fill('spotlight-name', 'Lions Star');
    fill('spotlight-team', 'Lions');
    fill('spotlight-month', 'October');
    fill('spotlight-stats', '8 goals · 5 assists');
    fill('spotlight-writeup', 'Admin spotlight writeup.');
    check('spotlight-enabled', true);
    handle('spotlight-save');
    T('admin saves the player of the month spotlight',
      state.site.spotlight.playerId === 'p1' && state.site.spotlight.stats === '8 goals · 5 assists' && state.site.spotlight.writeup === 'Admin spotlight writeup.');

    fantasyRoundKey = 't1:G';
    handle('fantasy-edit');
    state.site.players.slice(0, 11).forEach((p, i) => fill('admin-pick-' + i, p.id));
    fill('fantasy-note', 'Admin best XI');
    handle('fantasy-save');
    T('admin saves the official fantasy XI',
      fantasyStore('t1:G').picks.length === 11 && fantasyStore('t1:G').note === 'Admin best XI');

    handle('motm-close', 't1:g:m1');
    T('admin closes MOTM voting', motmBox('t1:g:m1').open === false);
    fill('motm-confirm-t1:g:m1', 'p1');
    handle('motm-confirm', 't1:g:m1');
    T('admin confirms the MOTM winner',
      motmBox('t1:g:m1').winner === 'p1' && state.site.reports['t1:g:m1'].motmPlayerId === 'p1');
    T('every admin edit attaches an activity-log message', adminMsgs.length >= 13, adminMsgs.length + ' messages');
  }

  /* ---------- escaping ---------- */
  const xss = '<img src=x onerror="window.__xss=1"><script>alert(1)</script>';
  state.site.announcement.text = xss;
  state.site.announcement.enabled = true;
  state.site.about.story = xss;
  state.site.honours[0].label = xss;
  state.site.honours[0].note = xss;
  state.site.news[0].title = xss;
  state.site.news[0].body = xss;
  state.site.news[0].author = xss;
  state.site.players[0].name = xss;
  state.site.players[0].badges = [xss];
  state.site.power.entries[0].name = xss;
  state.site.power.entries[0].note = xss;
  state.site.polls[0].question = xss;
  state.site.polls[0].options[0].label = xss;
  state.site.spotlight.name = xss;
  state.site.spotlight.stats = xss;
  state.site.spotlight.writeup = xss;
  state.site.reports['t1:g:m1'].report = xss;
  state.site.reports['t1:g:m1'].scorers[0].name = xss;
  const clean = () => !has('<img src=x onerror=') && !has('<script>alert(1)') && has('&lt;img');
  go('home');
  T('Home escapes announcement, news, honours, poll and spotlight text', clean());
  go('about');
  T('About escapes editable story text', clean());
  go('news', 'post', 'n1');
  T('News post escapes title, author and body', clean());
  go('players');
  T('Players page escapes names and badges', clean());
  go('players', 'player', 'p1');
  T('Player profile escapes names and badges', clean());
  go('power');
  T('Power rankings escape names and notes', clean());
  go('fans', null, null, 'polls');
  T('Poll questions and options are escaped', clean());
  go('fixtures', 'match', 't1:g:m1');
  T('Match reports escape report text and scorer names', clean());

  return results;
}

function runEmptyStates(){
  const results = [];
  const T = (name, cond, extra) => {
    results.push({ name, ok: !!cond, extra: extra || '' });
  };
  const app = document.getElementById('app');
  const has = s => app.innerHTML.indexOf(s) !== -1;
  const go = (tabId, page, param, sub) => {
    route = tabId;
    routePage = page || null;
    routeParam = param || '';
    fanSub = sub || 'predict';
    routeTouched = true;
    render();
  };

  go('home');
  T('empty Home shows friendly fixtures, news and poll prompts',
    has('waiting for the draw') && has('No news yet') && has('No polls yet'));
  go('fixtures');
  T('empty fixtures page explains how fixtures appear',
    has('No upcoming fixtures yet') && has('No results yet'));
  go('news');
  T('empty news page invites the first article', has('No news yet'));
  go('news', 'post', 'missing');
  T('missing news article shows a recovery link', has('Article not found') && has('Back to all news'));
  go('fixtures', 'match', 'missing');
  T('missing match report shows a recovery link', has('That match could not be found') && has('Back to fixtures'));
  go('players');
  T('empty players page explains squads are coming', has('No players added yet'));
  go('players', 'player', 'missing');
  T('missing player profile shows a recovery link', has('Player not found') && has('Back to players'));
  go('power');
  T('empty power rankings show an admin prompt', has('No power rankings yet'));
  go('hall');
  T('empty honours page keeps a champion placeholder', has('No champions crowned yet'));
  go('fans', null, null, 'predict');
  T('empty predictions explain when matches appear', has('No upcoming matches to predict yet'));
  go('fans', null, null, 'motm');
  T('empty MOTM page waits for a finished match', has('No finished matches yet'));
  go('fans', null, null, 'fantasy');
  T('empty fantasy page waits for a round', has('No rounds yet'));
  go('fans', null, null, 'polls');
  T('empty polls page invites the next vote', has('No polls yet'));
  return results;
}

let allResults = [];
try {
  const ro = buildSandbox(false);
  vm.runInContext(appScript + '\n' + runFeatures.toString() + '\n;globalThis.__featureResults = runFeatures();', ro.context, { filename: 'index.html<script>' });
  allResults = allResults.concat(ro.context.__featureResults || []);

  const adm = buildSandbox(true);
  vm.runInContext(appScript + '\n' + runFeatures.toString() + '\n;globalThis.__featureResults = runFeatures();', adm.context, { filename: 'index.html<script>' });
  allResults = allResults.concat(adm.context.__featureResults || []);

  const empty = buildSandbox(false, true);
  vm.runInContext(appScript + '\n' + runEmptyStates.toString() + '\n;globalThis.__featureResults = runEmptyStates();', empty.context, { filename: 'index.html<script>' });
  allResults = allResults.concat(empty.context.__featureResults || []);
} catch (err){
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}

let fails = 0;
console.log('\nFeature smoke tests\n');
allResults.forEach(r => {
  if (r.ok) console.log('  ✅ ' + r.name);
  else { console.log('  ❌ ' + r.name + (r.extra ? ' — ' + r.extra : '')); fails++; }
});
console.log('\n' + (fails ? '❌ ' + fails + ' feature test(s) failed.' : '🎉 ALL FEATURE SMOKE TESTS PASSED') + '\n');
process.exit(fails ? 1 : 0);
