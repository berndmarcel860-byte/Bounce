(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const menu = $('menu');
  const hud = $('hud');
  const deathPanel = $('death');
  const interstitialPanel = $('interstitial');
  const feedback = $('feedback');
  const subpanel = $('subpanel');
  const subTitle = $('subpanel-title');
  const subContent = $('subpanel-content');
  const ui = { score: $('score'), combo: $('combo'), finalScore: $('final-score'), bestScore: $('best-score'), high: $('high-score'), coins: $('coins'), xp: $('xp') };

  const cosmetics = {
    skins: ['Plasma Core', 'Fire Orb', 'Cyber Eye', 'Black Hole', 'Toxic Cell', 'Glitch Virus', 'Rainbow Pulse', 'Dark Matter'],
    trails: ['Lightning', 'Fire', 'Ice', 'Pixel', 'Shadow', 'Rainbow', 'Plasma', 'Digital Distortion'],
    explosions: ['Energy Burst', 'Neon Shatter', 'Pixel Explosion', 'Black Hole Collapse', 'Electric Overload'],
    worlds: ['Neon Reactor', 'Cyber Grid', 'Lava Core', 'Space Rift', 'Frozen Matrix', 'Quantum Storm']
  };

  const state = {
    mode: 'menu', paused: false, t: 0, score: 0, combo: 1, comboTimer: 0, near: 0, runTime: 0, speed: 220, phase: 1, nextSpawn: 0, canContinue: true,
    particles: [], obstacles: [], pool: [], shake: 0, sessions: [], lastFeedback: 0
  };
  const player = { x: 150, y: 0, vy: 0, r: 13, gravity: 1320, bounce: -450, invuln: 0, trail: [] };

  const storageKey = 'bounce-bolt-save-v1';
  const save = loadSave();
  let onInterstitialClose = null;
  hydrateDailySystems();

  function loadSave() {
    const defaults = {
      highScore: 0, coins: 0, xp: 0, selected: { skin: 0, trail: 0, explosion: 0, world: 0 },
      owned: { skin: [0], trail: [0], explosion: [0], world: [0] }, achievements: {}, missions: [], dailyRewardDay: '', weeklyTag: '',
      leaderboards: { daily: 0, weekly: 0, allTime: 0, friends: 0 }, premium: { noAds: false, premiumThemes: false },
      ad: { runCount: 0, interstitialEvery: 3 }, online: { status: 'Pending', syncedRuns: 0, cloudBest: 0, lastSync: 'Never' }
    };
    try { return merge(defaults, JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch { return defaults; }
  }
  function merge(a, b) { if (!b || typeof b !== 'object') return a; const o = { ...a }; Object.keys(b).forEach((k) => o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k] || {}, b[k]) : b[k]); return o; }
  function persist() { localStorage.setItem(storageKey, JSON.stringify(save)); }

  function hydrateDailySystems() {
    const n = new Date();
    const today = n.toISOString().slice(0, 10);
    const weekTag = getIsoWeekTag(n);
    if (!save.missions.length || save.dailyRewardDay !== today) {
      save.missions = [
        { text: 'Reach score 25', goal: 25, progress: 0, type: 'score', reward: 60, done: false },
        { text: 'Survive 60 seconds', goal: 60, progress: 0, type: 'time', reward: 90, done: false },
        { text: 'Perform 5 near misses', goal: 5, progress: 0, type: 'near', reward: 80, done: false },
        { text: 'Achieve 3 combo streaks', goal: 3, progress: 0, type: 'combo', reward: 100, done: false },
        { text: 'Use continue once', goal: 1, progress: 0, type: 'continue', reward: 120, done: false }
      ];
    }
    if (save.weeklyTag !== weekTag) { save.weeklyTag = weekTag; save.leaderboards.weekly = 0; }
    persist();
  }

  function resize() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    player.y = innerHeight * 0.5;
  }
  addEventListener('resize', resize);
  resize();

  function setUI() { ui.score.textContent = Math.floor(state.score); ui.combo.textContent = `x${Math.max(1, state.combo).toFixed(1)}`; ui.high.textContent = save.highScore; ui.coins.textContent = save.coins; ui.xp.textContent = save.xp; }
  function show(el, on) { el.classList.toggle('hidden', !on); el.classList.toggle('show', on); }

  function startRun() {
    Object.assign(state, { mode: 'playing', paused: false, t: 0, score: 0, combo: 1, comboTimer: 0, near: 0, runTime: 0, speed: 220, phase: 1, nextSpawn: 0, canContinue: true });
    state.obstacles.length = 0; state.particles.length = 0;
    player.y = innerHeight * 0.5; player.vy = 0; player.invuln = 0; player.trail.length = 0;
    setUI(); show(menu, false); show(deathPanel, false); show(interstitialPanel, false); show(subpanel, false); show(hud, true);
  }
  function tap() { if (state.mode === 'playing' && !state.paused) { player.vy = player.bounce; emit(player.x, player.y, 7, '#24f2ff'); sfx('tap'); } }

  function die(reason) {
    if (state.mode !== 'playing' || player.invuln > 0) return;
    state.mode = 'dead'; state.shake = 18; sfx('death'); emit(player.x, player.y, 55, '#ff2dbf');
    const runScore = Math.floor(state.score);
    save.coins += Math.floor(runScore * 0.5 + state.near * 4 + state.combo * 2);
    save.xp += Math.floor(runScore * 0.7 + state.runTime * 1.4);
    save.highScore = Math.max(save.highScore, runScore);
    save.leaderboards.allTime = Math.max(save.leaderboards.allTime, runScore);
    save.leaderboards.daily = Math.max(save.leaderboards.daily, runScore);
    save.leaderboards.weekly = Math.max(save.leaderboards.weekly, runScore);
    save.leaderboards.friends = Math.max(save.leaderboards.friends, Math.floor(runScore * 0.92));
    save.ad.runCount += 1;
    state.sessions.unshift({ score: runScore, duration: Math.floor(state.runTime), reason, when: new Date().toLocaleTimeString() });
    state.sessions = state.sessions.slice(0, 10);
    mission('score', runScore); mission('time', state.runTime); mission('near', state.near, true); mission('combo', state.combo - 1, true);
    ach('first_death', 'Warmup Complete'); if (runScore >= 100) ach('score100', 'Century Runner'); if (runScore >= 250) ach('score250', 'Impossible Save');
    updateLocalLeaderboardCache(runScore);
    persist(); setUI();
    ui.finalScore.textContent = runScore; ui.bestScore.textContent = save.highScore;
    show(hud, false);
    maybeShowInterstitial(() => show(deathPanel, true));
  }

  function maybeShowInterstitial(onClose) {
    const every = save.ad.interstitialEvery;
    if (save.premium.noAds || every <= 0 || save.ad.runCount % every !== 0) {
      show(interstitialPanel, false);
      onClose();
      return;
    }
    onInterstitialClose = onClose;
    show(interstitialPanel, true);
  }

  function updateLocalLeaderboardCache(score) {
    save.online.syncedRuns += 1;
    save.online.cloudBest = Math.max(save.online.cloudBest, score);
    save.online.status = navigator.onLine ? 'Local cache updated' : 'Local cache updated (offline)';
    save.online.lastSync = new Date().toLocaleTimeString();
  }
  function ach(id, name) { if (!save.achievements[id]) save.achievements[id] = { name, unlockedAt: Date.now() }; }
  function mission(type, amount, add = false) {
    save.missions.forEach((m) => {
      if (m.type !== type || m.done) return;
      m.progress = add ? Math.min(m.goal, m.progress + amount) : Math.min(m.goal, Math.max(m.progress, amount));
      if (m.progress >= m.goal) { m.done = true; save.coins += m.reward; flash('MISSION COMPLETE', '#57ff9e', 700); }
    });
  }

  function chooseObstacleType() {
    const p = state.phase;
    const weighted = [['wallGap', 16], ['movingBarrier', p > 1 ? 12 : 6], ['rotatingLaser', p > 1 ? 10 : 0], ['pulseBlock', p > 1 ? 8 : 0], ['gravityZone', p > 2 ? 7 : 0], ['speedTunnel', p > 2 ? 7 : 0], ['orbital', p > 2 ? 8 : 0], ['crusher', p > 2 ? 6 : 0], ['teleport', p > 2 ? 6 : 0], ['zigzag', p > 3 ? 8 : 0], ['movingSpikes', p > 3 ? 8 : 0], ['trapCombo', p > 3 ? 6 : 0]];
    const total = weighted.reduce((a, [, w]) => a + w, 0); let r = Math.random() * total;
    for (const [name, w] of weighted) { r -= w; if (r <= 0) return name; }
    return 'wallGap';
  }

  function spawn() {
    const ob = state.pool.pop() || {};
    const t = chooseObstacleType(); const h = innerHeight; const gapBase = Math.max(120, 220 - state.phase * 20 - state.speed * 0.04);
    Object.assign(ob, { type: t, x: innerWidth + 80, t: 0, phase: Math.random() * Math.PI * 2, passed: false, near: false, centered: false, done: false });
    if (t === 'wallGap' || t === 'trapCombo') { ob.width = t === 'trapCombo' ? 95 : 70; ob.gap = clamp(gapBase + (t === 'trapCombo' ? -10 : rand(-20, 30)), 90, 250); ob.gy = rand(85, h - 85 - ob.gap); if (t === 'trapCombo') ob.spin = rand(2, 5); }
    else if (t === 'movingBarrier') { ob.width = 44; ob.height = rand(130, 220); ob.y = rand(50, h - 250); ob.amp = rand(40, 130); ob.speed = rand(1.4, 2.5); }
    else if (t === 'rotatingLaser') { ob.len = rand(100, 220); ob.y = rand(100, h - 100); ob.rot = rand(0, Math.PI * 2); ob.rotSpeed = rand(1.8, 3.4) * (Math.random() > 0.5 ? 1 : -1); ob.radius = 8; }
    else if (t === 'pulseBlock') { ob.width = 70; ob.height = 70; ob.y = rand(80, h - 80); ob.period = rand(1, 1.8); }
    else if (t === 'gravityZone') { ob.width = 110; ob.invert = Math.random() > 0.5; }
    else if (t === 'speedTunnel') { ob.width = 130; ob.boost = rand(50, 180); }
    else if (t === 'orbital') { ob.radius = rand(22, 32); ob.orbit = rand(32, 70); ob.centerY = rand(100, h - 100); ob.orbitSpeed = rand(2, 4); }
    else if (t === 'crusher') { ob.width = 60; ob.gap = clamp(gapBase - 30, 86, 170); ob.gy = rand(80, h - 80 - ob.gap); ob.crush = rand(22, 55); }
    else if (t === 'teleport') { ob.width = 50; ob.y = rand(100, h - 100); ob.targetY = clamp(ob.y + rand(-160, 160), 60, h - 60); }
    else if (t === 'zigzag') { ob.width = 200; ob.segs = 6; ob.y = rand(70, h - 70); ob.amp = rand(30, 70); }
    else if (t === 'movingSpikes') { ob.width = 80; ob.count = 4; ob.y = rand(100, h - 140); ob.dir = Math.random() > 0.5 ? 1 : -1; }
    state.obstacles.push(ob);
  }

  function obstacleDistance(ob, px, py) {
    if (['wallGap', 'crusher', 'trapCombo'].includes(ob.type) && Math.abs(px - ob.x) < 46) { const g = ob.type === 'crusher' ? (ob.currentGap || ob.gap) : ob.gap; return Math.min(Math.abs(py - ob.gy), Math.abs(py - (ob.gy + g))) - player.r; }
    if (ob.type === 'movingBarrier') return rectDist(px, py, ob.x, ob.cy, ob.width, ob.height) - player.r;
    if (ob.type === 'pulseBlock') return rectDist(px, py, ob.x, ob.y, ob.width, ob.height) - player.r;
    if (ob.type === 'rotatingLaser') return lineDist(px, py, ob.x, ob.y, ob.x + Math.cos(ob.rot) * ob.len, ob.y + Math.sin(ob.rot) * ob.len) - 6;
    if (ob.type === 'orbital') { const ox = ob.x + Math.cos(state.t * ob.orbitSpeed + ob.phase) * ob.orbit; const oy = ob.centerY + Math.sin(state.t * ob.orbitSpeed + ob.phase) * ob.orbit; return Math.hypot(px - ox, py - oy) - (ob.radius + player.r); }
    return 99;
  }

  function collides(ob, px, py, r) {
    if (['wallGap', 'crusher', 'trapCombo'].includes(ob.type)) {
      const g = ob.type === 'crusher' ? (ob.currentGap || ob.gap) : ob.gap;
      if (px + r > ob.x && px - r < ob.x + ob.width && (py - r < ob.gy || py + r > ob.gy + g)) return true;
      if (ob.type === 'trapCombo') { const ly = ob.gy + g * 0.5 + Math.sin(state.t * ob.spin + ob.phase) * 35; if (lineDist(px, py, ob.x, ly, ob.x + ob.width, ly) < r + 5) return true; }
      const center = ob.gy + g * 0.5;
      if (!ob.centered && Math.abs(px - (ob.x + ob.width * 0.5)) < 10 && Math.abs(py - center) < 6) { ob.centered = true; state.score += 4; flash('PERFECT', '#24f2ff', 250); sfx('perfect'); }
      return false;
    }
    if (ob.type === 'movingBarrier') return circleRect(px, py, r, ob.x, ob.cy, ob.width, ob.height);
    if (ob.type === 'pulseBlock') { const visible = Math.sin((state.t + ob.phase) / ob.period * Math.PI * 2) > -0.15; ob.visible = visible; return visible && circleRect(px, py, r, ob.x, ob.y, ob.width, ob.height); }
    if (ob.type === 'rotatingLaser') return lineDist(px, py, ob.x, ob.y, ob.x + Math.cos(ob.rot) * ob.len, ob.y + Math.sin(ob.rot) * ob.len) < r + ob.radius;
    if (ob.type === 'orbital') { const ox = ob.x + Math.cos(state.t * ob.orbitSpeed + ob.phase) * ob.orbit; const oy = ob.centerY + Math.sin(state.t * ob.orbitSpeed + ob.phase) * ob.orbit; return Math.hypot(px - ox, py - oy) < ob.radius + r; }
    if (ob.type === 'zigzag') { for (let i = 0; i < ob.segs; i++) { const x1 = ob.x + i * (ob.width / ob.segs), x2 = ob.x + (i + 1) * (ob.width / ob.segs), y1 = ob.y + (i % 2 ? -ob.amp : ob.amp), y2 = ob.y + ((i + 1) % 2 ? -ob.amp : ob.amp); if (lineDist(px, py, x1, y1, x2, y2) < r + 5) return true; } }
    if (ob.type === 'movingSpikes') { const y = ob.y + Math.sin(state.t * 2.4 + ob.phase) * 45 * ob.dir; for (let i = 0; i < ob.count; i++) if (Math.hypot(px - (ob.x + i * 20), py - (y + (i % 2 ? -16 : 16))) < r + 10) return true; }
    return false;
  }

  function update(dt) {
    if (state.mode !== 'playing' || state.paused) return;
    state.t += dt; state.runTime += dt; player.invuln = Math.max(0, player.invuln - dt);
    state.phase = state.runTime > 125 ? 4 : state.runTime > 75 ? 3 : state.runTime > 35 ? 2 : 1;
    const targetSpeed = [220, 280, 350, 460][state.phase - 1];
    state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 0.8);

    let gScale = 1;
    player.vy += player.gravity * gScale * dt;
    player.y += player.vy * dt;
    if (player.y < -20 || player.y > innerHeight + 20) die('out_of_bounds');

    state.nextSpawn -= dt;
    if (state.nextSpawn <= 0) { spawn(); const tighten = clamp(1.2 - state.phase * 0.16 - Math.min(0.2, state.runTime * 0.002), 0.5, 1.4); state.nextSpawn = rand(0.5, 1.1) * tighten; }

    for (const ob of state.obstacles) {
      ob.t += dt; ob.x -= state.speed * dt;
      if (ob.type === 'movingBarrier') ob.cy = ob.y + Math.sin(state.t * ob.speed + ob.phase) * ob.amp;
      if (ob.type === 'rotatingLaser') ob.rot += ob.rotSpeed * dt;
      if (ob.type === 'crusher') { const crush = Math.sin(state.t * 2.6 + ob.phase) * ob.crush; ob.currentGap = clamp(ob.gap - Math.abs(crush), 68, 180); }
      if (ob.type === 'gravityZone' && aabb(player.x - player.r, player.y - player.r, player.r * 2, player.r * 2, ob.x, 0, ob.width, innerHeight)) gScale = ob.invert ? -0.38 : 1.4;
      if (ob.type === 'speedTunnel' && aabb(player.x - player.r, player.y - player.r, player.r * 2, player.r * 2, ob.x, 0, ob.width, innerHeight)) state.speed = Math.min(520, state.speed + ob.boost * dt * 3);
      if (ob.type === 'teleport' && !ob.done && Math.abs(player.x - ob.x) < 26 && Math.abs(player.y - ob.y) < 40) { player.y = ob.targetY; player.vy *= 0.6; ob.done = true; flash('IMPOSSIBLE SAVE', '#ffda4b', 450); emit(player.x, player.y, 20, '#b657ff'); }
      if (!ob.passed && ob.x < player.x - 20) { ob.passed = true; state.score += 1 * state.combo; state.combo += 1; state.comboTimer = 2.1; sfx('pass'); }
      const near = obstacleDistance(ob, player.x, player.y);
      if (!ob.near && near < 20 && near > 0) { ob.near = true; state.near += 1; state.score += 2; state.shake = 8; state.combo += 1; flash('CLOSE CALL', '#57ff9e', 320); sfx('near'); emit(player.x, player.y, 12, '#57ff9e'); }
      if (collides(ob, player.x, player.y, player.r)) die(ob.type);
    }

    if (state.comboTimer > 0) state.comboTimer -= dt; else state.combo = Math.max(1, state.combo - dt * 3);
    if (state.combo >= 12 && state.t - state.lastFeedback > 2.4) { state.lastFeedback = state.t; flash('ULTRA COMBO', '#ff74f2', 420); emit(player.x, player.y, 30, '#ff2dbf'); state.shake = 14; sfx('combo'); }
    if (state.combo >= 20 && state.t - state.lastFeedback > 2.4) { state.lastFeedback = state.t; flash('LEGENDARY DODGE', '#24f2ff', 500); }

    state.obstacles = state.obstacles.filter((ob) => { if (ob.x < -280) { state.pool.push(ob); return false; } return true; });
    updateParticles(dt); updateTrail(dt); state.shake = Math.max(0, state.shake - dt * 24); setUI();
  }

  function drawBg() {
    const world = cosmetics.worlds[save.selected.world];
    const themes = { 'Neon Reactor': ['#060b17', '#0f2c42', '#24f2ff'], 'Cyber Grid': ['#080914', '#1c1738', '#ff2dbf'], 'Lava Core': ['#1a0705', '#3b1709', '#ff7d29'], 'Space Rift': ['#05060f', '#10183a', '#7f93ff'], 'Frozen Matrix': ['#031018', '#103546', '#74e7ff'], 'Quantum Storm': ['#080619', '#221245', '#be6dff'] };
    const [bg1, bg2, line] = themes[world] || themes['Neon Reactor'];
    const g = ctx.createLinearGradient(0, 0, 0, innerHeight); g.addColorStop(0, bg2); g.addColorStop(1, bg1); ctx.fillStyle = g; ctx.fillRect(0, 0, innerWidth, innerHeight);
    for (let l = 1; l <= 3; l++) for (let i = 0; i < 16; i++) { const x = ((i * 220 - (state.t * ((state.speed * 0.05) / l) * 20) % 220) + innerWidth) % (innerWidth + 220) - 120; const y = (i * 90 + l * 50) % innerHeight; ctx.strokeStyle = `rgba(255,255,255,${0.04 / l})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 120, y + (l % 2 ? -16 : 16)); ctx.stroke(); }
    ctx.strokeStyle = `${line}66`; ctx.lineWidth = 2; for (let y = 0; y < innerHeight; y += 90) { const o = Math.sin(state.t + y * 0.02) * 15; ctx.beginPath(); ctx.moveTo(0, y + o); ctx.lineTo(innerWidth, y - o); ctx.stroke(); }
  }

  function drawObs() {
    state.obstacles.forEach((ob) => {
      if (['wallGap', 'crusher', 'trapCombo'].includes(ob.type)) { const g = ob.type === 'crusher' ? (ob.currentGap || ob.gap) : ob.gap; rect(ob.x, 0, ob.width, ob.gy, '#ff2dbf'); rect(ob.x, ob.gy + g, ob.width, innerHeight - ob.gy - g, '#ff2dbf'); if (ob.type === 'trapCombo') { const ly = ob.gy + g * 0.5 + Math.sin(state.t * ob.spin + ob.phase) * 35; line(ob.x, ly, ob.x + ob.width, ly, '#ffea6d', 3); } }
      else if (ob.type === 'movingBarrier') rect(ob.x, ob.cy, ob.width, ob.height, '#24f2ff');
      else if (ob.type === 'rotatingLaser') line(ob.x, ob.y, ob.x + Math.cos(ob.rot) * ob.len, ob.y + Math.sin(ob.rot) * ob.len, '#ff3d6f', 4);
      else if (ob.type === 'pulseBlock' && ob.visible !== false) rect(ob.x, ob.y, ob.width, ob.height, '#57ff9e');
      else if (ob.type === 'gravityZone') rect(ob.x, 0, ob.width, innerHeight, ob.invert ? '#8b74ff' : '#ffaa33', 0.12);
      else if (ob.type === 'speedTunnel') rect(ob.x, 0, ob.width, innerHeight, '#24f2ff', 0.1);
      else if (ob.type === 'orbital') { const ox = ob.x + Math.cos(state.t * ob.orbitSpeed + ob.phase) * ob.orbit, oy = ob.centerY + Math.sin(state.t * ob.orbitSpeed + ob.phase) * ob.orbit; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(ob.x, ob.centerY, ob.orbit, 0, Math.PI * 2); ctx.stroke(); circle(ox, oy, ob.radius, '#ff8f2a'); }
      else if (ob.type === 'teleport') { circle(ob.x, ob.y, 20, '#b657ff'); circle(ob.x + 28, ob.targetY, 12, '#57ff9e'); }
      else if (ob.type === 'zigzag') for (let i = 0; i < ob.segs; i++) { const x1 = ob.x + i * (ob.width / ob.segs), x2 = ob.x + (i + 1) * (ob.width / ob.segs), y1 = ob.y + (i % 2 ? -ob.amp : ob.amp), y2 = ob.y + ((i + 1) % 2 ? -ob.amp : ob.amp); line(x1, y1, x2, y2, '#ff4fe5', 3); }
      else if (ob.type === 'movingSpikes') { const y = ob.y + Math.sin(state.t * 2.4 + ob.phase) * 45 * ob.dir; for (let i = 0; i < ob.count; i++) circle(ob.x + i * 20, y + (i % 2 ? -16 : 16), 9, '#ff3d6f'); }
    });
  }

  function drawPlayer() {
    const skin = cosmetics.skins[save.selected.skin];
    const c = ({ 'Plasma Core': '#24f2ff', 'Fire Orb': '#ff7a2a', 'Cyber Eye': '#ff2dbf', 'Black Hole': '#8b74ff', 'Toxic Cell': '#57ff9e', 'Glitch Virus': '#ff4f6e', 'Rainbow Pulse': '#ffd24b', 'Dark Matter': '#9ba7ff' })[skin] || '#24f2ff';
    const pulse = Math.sin(state.t * 8) * 1.2;
    ctx.shadowColor = c; ctx.shadowBlur = 24; ctx.fillStyle = rgba(c, 0.45); ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 4 + pulse, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    drawTrail();
  }
  function updateTrail(dt) { player.trail.push({ x: player.x, y: player.y, life: 0.5, speed: Math.abs(player.vy) }); if (player.trail.length > 40) player.trail.shift(); player.trail.forEach((t) => t.life -= dt); player.trail = player.trail.filter((t) => t.life > 0); }
  function drawTrail() { const t = cosmetics.trails[save.selected.trail]; const c = ({ Lightning: '#24f2ff', Fire: '#ff7a2a', Ice: '#74e7ff', Pixel: '#57ff9e', Shadow: '#9ba7ff', Rainbow: '#ff2dbf', Plasma: '#be6dff', 'Digital Distortion': '#ffd24b' })[t] || '#24f2ff'; player.trail.forEach((p, i) => { ctx.fillStyle = rgba(c, p.life * (0.2 + Math.min(0.8, p.speed / 600))); ctx.beginPath(); ctx.arc(p.x - i * 0.6, p.y, Math.max(1, player.r * p.life * 0.7), 0, Math.PI * 2); ctx.fill(); }); }

  function emit(x, y, n, color) { for (let i = 0; i < n; i++) state.particles.push({ x, y, vx: rand(-180, 180), vy: rand(-180, 180), life: rand(0.25, 0.8), color }); if (state.particles.length > 400) state.particles.splice(0, state.particles.length - 400); }
  function updateParticles(dt) { state.particles.forEach((p) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985; }); state.particles = state.particles.filter((p) => p.life > 0); }
  function drawParticles() { state.particles.forEach((p) => { ctx.fillStyle = rgba(p.color, p.life); ctx.fillRect(p.x, p.y, 3, 3); }); }

  function flash(text, color, ms = 350) { feedback.textContent = text; feedback.style.color = color; show(feedback, true); clearTimeout(flash.t); flash.t = setTimeout(() => show(feedback, false), ms); }
  function rect(x, y, w, h, color, a = 0.22) { ctx.fillStyle = rgba(color, a); ctx.fillRect(x, y, w, h); ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.strokeStyle = color; ctx.strokeRect(x, y, w, h); ctx.shadowBlur = 0; }
  function line(x1, y1, x2, y2, color, w = 2) { ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.shadowBlur = 0; }
  function circle(x, y, r, color) { ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.fillStyle = rgba(color, 0.25); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = color; ctx.stroke(); ctx.shadowBlur = 0; }

  function openPanel(kind) {
    show(subpanel, true); subContent.innerHTML = '';
    if (kind === 'shop') {
      subTitle.textContent = 'Shop & Cosmetics';
      [['skin', cosmetics.skins], ['trail', cosmetics.trails], ['explosion', cosmetics.explosions], ['world', cosmetics.worlds]].forEach(([k, list]) => {
        h3(k.toUpperCase());
        list.forEach((name, i) => {
          const row = document.createElement('div'); row.className = 'row';
          const price = 120 + i * 80, owned = save.owned[k]?.includes(i);
          row.innerHTML = `<span>${name}</span><span class="small">${owned ? 'Owned' : `${price} coins`}</span>`;
          const b = document.createElement('button');
          b.textContent = save.selected[k] === i ? 'Selected' : owned ? 'Select' : 'Unlock';
          b.onclick = () => { if (!owned) { if (save.coins < price) return; save.coins -= price; save.owned[k].push(i); } save.selected[k] = i; persist(); setUI(); openPanel('shop'); sfx('unlock'); };
          row.appendChild(b); subContent.appendChild(row);
        });
      });
      rows('Monetization', [['Continue after death (Rewarded ad)', state.canContinue ? 'Ready' : 'Consumed'], ['Double rewards (Rewarded ad)', 'Available'], ['Unlock cosmetics faster', 'Rewarded optional'], ['Bonus coins', 'Rewarded optional'], ['Interstitial ads', save.premium.noAds ? 'Disabled by premium' : `Every ${save.ad.interstitialEvery} runs`], ['Remove ads', save.premium.noAds ? 'Purchased' : 'Optional'], ['Exclusive cosmetics/themes', save.premium.premiumThemes ? 'Unlocked' : 'Optional']]);
    } else if (kind === 'missions') {
      subTitle.textContent = 'Daily / Weekly / Achievements';
      rows('Daily Missions', save.missions.map((m) => [m.text, `${Math.floor(m.progress)}/${m.goal}${m.done ? ' ✓' : ''}`]));
      rows('Weekly Challenge', [[`Beat weekly score ${Math.max(80, save.leaderboards.weekly + 40)}`, `${save.leaderboards.weekly}`]]);
      const a = Object.values(save.achievements); rows('Achievements', a.length ? a.map((x) => [x.name, new Date(x.unlockedAt).toLocaleDateString()]) : [['No achievements yet', 'Play to unlock']]);
      rows('Session Stats', state.sessions.length ? state.sessions.map((s) => [`Score ${s.score} (${s.duration}s)`, `${s.reason} • ${s.when}`]) : [['No sessions yet', 'Start a run']]);
    } else if (kind === 'leaderboards') {
      subTitle.textContent = 'Leaderboards';
      rows('Daily', [['You', `${save.leaderboards.daily}`], ['NeonGhost', `${Math.max(25, save.leaderboards.daily - 7)}`], ['BoltRider', `${Math.max(18, save.leaderboards.daily - 12)}`]]);
      rows('Weekly', [['You', `${save.leaderboards.weekly}`], ['ArcStorm', `${Math.max(40, save.leaderboards.weekly - 15)}`], ['PulseDash', `${Math.max(35, save.leaderboards.weekly - 20)}`]]);
      rows('All-time', [['You', `${save.leaderboards.allTime}`], ['Legend-X', `${Math.max(120, save.leaderboards.allTime - 30)}`], ['NeoShift', `${Math.max(110, save.leaderboards.allTime - 40)}`]]);
      rows('Friends', [['You', `${save.leaderboards.friends}`], ['Alex', `${Math.max(10, save.leaderboards.friends - 8)}`], ['Mina', `${Math.max(9, save.leaderboards.friends - 11)}`]]);
      rows('Online Sync', [['Status', save.online.status], ['Cached runs', `${save.online.syncedRuns}`], ['Cached best', `${save.online.cloudBest}`], ['Last update', save.online.lastSync]]);
    } else if (kind === 'daily') {
      subTitle.textContent = 'Daily Reward';
      const today = new Date().toISOString().slice(0, 10), claimed = save.dailyRewardDay === today;
      rows('Reward', [[claimed ? 'Already claimed today' : 'Tap to claim 75 coins + 25 XP', claimed ? 'Come back tomorrow' : 'Ready']]);
      const b = document.createElement('button'); b.textContent = claimed ? 'Claimed' : 'Claim Reward'; b.disabled = claimed;
      b.onclick = () => { save.coins += 75; save.xp += 25; save.dailyRewardDay = today; persist(); setUI(); openPanel('daily'); sfx('unlock'); };
      subContent.appendChild(b);
    } else if (kind === 'settings') {
      subTitle.textContent = 'Settings';
      rows('Gameplay', [['Instant retry', 'Enabled'], ['Tap response', 'Low-latency input'], ['Target FPS', '60']]);
      const b = document.createElement('button'); b.textContent = save.premium.noAds ? 'Ads Removed' : 'Purchase: Remove Ads';
      b.onclick = () => { save.premium.noAds = true; persist(); openPanel('settings'); };
      subContent.appendChild(b);
    }
  }
  function h3(t) { const h = document.createElement('h3'); h.textContent = t; subContent.appendChild(h); }
  function rows(title, list) { h3(title); list.forEach(([a, b]) => { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<span>${a}</span><span class="small">${b}</span>`; subContent.appendChild(r); }); }

  const audio = initAudio();
  function initAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
    const ac = new Ctx(); const gain = ac.createGain(); gain.gain.value = 0.03; gain.connect(ac.destination);
    const m = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain();
    m.type = 'sawtooth'; m.frequency.value = 110; lfo.frequency.value = 0.4; lg.gain.value = 15;
    lfo.connect(lg).connect(m.frequency); m.connect(gain); m.start(); lfo.start();
    return { ac, gain, m };
  }
  function music(v) { if (!audio) return; const c = clamp(v, 0.08, 1); audio.gain.gain.linearRampToValueAtTime(0.015 + c * 0.045, audio.ac.currentTime + 0.08); audio.m.frequency.linearRampToValueAtTime(95 + c * 130, audio.ac.currentTime + 0.12); }
  function sfx(kind) {
    if (!audio) return;
    if (audio.ac.state === 'suspended') audio.ac.resume();
    const o = audio.ac.createOscillator(), g = audio.ac.createGain(); o.connect(g).connect(audio.ac.destination);
    let f = 240, d = 0.1; if (kind === 'tap') { f = 360; d = 0.04; } if (kind === 'pass') { f = 440; d = 0.06; } if (kind === 'near') { f = 520; d = 0.09; } if (kind === 'combo') { f = 620; d = 0.1; } if (kind === 'perfect') { f = 760; d = 0.08; } if (kind === 'death') { f = 120; d = 0.22; } if (kind === 'unlock') { f = 680; d = 0.12; }
    o.frequency.value = f; g.gain.value = 0.05; g.gain.exponentialRampToValueAtTime(0.00001, audio.ac.currentTime + d); o.start(); o.stop(audio.ac.currentTime + d);
  }

  function draw() { ctx.save(); if (state.shake > 0) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake)); drawBg(); drawObs(); drawParticles(); drawPlayer(); ctx.restore(); music(state.mode === 'playing' ? clamp((state.phase - 1) * 0.25 + (state.speed - 220) / 350, 0, 1) : 0.1); }

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function rgba(hex, a) { const c = hex.slice(1); return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`; }
  function circleRect(cx, cy, cr, rx, ry, rw, rh) { const tx = clamp(cx, rx, rx + rw), ty = clamp(cy, ry, ry + rh); return Math.hypot(cx - tx, cy - ty) < cr; }
  function aabb(x1, y1, w1, h1, x2, y2, w2, h2) { return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2; }
  function rectDist(px, py, rx, ry, rw, rh) { const dx = Math.max(rx - px, 0, px - (rx + rw)), dy = Math.max(ry - py, 0, py - (ry + rh)); return Math.hypot(dx, dy); }
  function lineDist(px, py, x1, y1, x2, y2) { const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2; if (l2 === 0) return Math.hypot(px - x1, py - y1); const t = clamp(((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2, 0, 1); return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))); }
  function getIsoWeekTag(date) { const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7); return `${d.getUTCFullYear()}-${week}`; }

  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', (e) => { const k = e.currentTarget.dataset.open; if (k === 'play') startRun(); else openPanel(k); }));
  $('retry').addEventListener('click', () => startRun());
  $('to-menu').addEventListener('click', () => { state.mode = 'menu'; show(deathPanel, false); show(interstitialPanel, false); show(menu, true); setUI(); });
  $('continue').addEventListener('click', () => { if (!state.canContinue) return; state.canContinue = false; mission('continue', 1, true); player.invuln = 2; player.y = innerHeight * 0.5; player.vy = -180; state.mode = 'playing'; show(deathPanel, false); show(interstitialPanel, false); show(hud, true); flash('CONTINUE', '#57ff9e', 360); });
  $('interstitial-close').addEventListener('click', () => {
    show(interstitialPanel, false);
    if (typeof onInterstitialClose === 'function') onInterstitialClose();
    onInterstitialClose = null;
  });
  $('pause').addEventListener('click', () => state.paused = !state.paused);
  $('subpanel-close').addEventListener('click', () => show(subpanel, false));
  addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; tap(); }, { passive: true });
  addEventListener('keydown', (e) => { if (e.code === 'Space') tap(); });

  let last = performance.now();
  function loop(now) { const dt = Math.min(0.033, (now - last) / 1000); last = now; update(dt); draw(); requestAnimationFrame(loop); }

  setUI();
  requestAnimationFrame(loop);
})();
