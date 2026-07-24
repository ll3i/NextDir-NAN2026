(() => {
  const W = 960, H = 540, PAD = 28;
  const QS = new URLSearchParams(location.search);
  const DEMO = QS.has("demo");
  const PLAYTEST = QS.has("playtest");
  const BOT = DEMO || PLAYTEST;
  const FORK_PREF = QS.get("fork") || "elite"; // playtest: safe|elite

  function makeRooms() {
    const full = [
      { id: "R1", template: "arena", intent: "BUILD", tutorial: true },
      { id: "R2", template: "corridor", intent: "BUILD" },
      { id: "R3", template: "cover", intent: "SUSTAIN_PEAK" },
      { id: "R4", template: "fork", intent: "FORK", fork: true },
      { id: "R5", template: "spikes", intent: "PEAK" },
      { id: "R6", template: "arena", intent: "SUSTAIN_PEAK", elite: true },
      { id: "R7", template: "boss", intent: "SUSTAIN_PEAK", boss: true },
    ];
    if (DEMO) return [full[0], full[2], full[3], full[6]].map((r) => ({ ...r }));
    return full.map((r) => ({ ...r }));
  }
  let RUN_ROOMS = makeRooms();

  const MODS = {
    none: { id: "none", name: "STANDARD", desc: "표준 규칙", enemySpd: 1, enemyHp: 1, playerDmgTaken: 1, xpMul: 1, budgetMul: 1, fog: false },
    haste: { id: "haste", name: "HASTE", desc: "적 이속 +22%", enemySpd: 1.22, enemyHp: 1, playerDmgTaken: 1, xpMul: 1, budgetMul: 1, fog: false },
    brittle: { id: "brittle", name: "BRITTLE", desc: "적 약화 · 피격 +12%", enemySpd: 1, enemyHp: 0.85, playerDmgTaken: 1.12, xpMul: 1.05, budgetMul: 1, fog: false },
    rich: { id: "rich", name: "RICH", desc: "XP +35%", enemySpd: 1, enemyHp: 1, playerDmgTaken: 1, xpMul: 1.35, budgetMul: 1, fog: false },
    fog: { id: "fog", name: "FOG", desc: "시야 제한 · 근거리 유리", enemySpd: 0.95, enemyHp: 1, playerDmgTaken: 1, xpMul: 1, budgetMul: 1, fog: true },
    pressure: { id: "pressure", name: "PRESSURE", desc: "Director budget 가속", enemySpd: 1.05, enemyHp: 1.05, playerDmgTaken: 1, xpMul: 1, budgetMul: 1.35, fog: false },
  };
  function pickRoomMod(room) {
    if (room.safe || room.fork) return MODS.none;
    if (room.boss) return MODS.pressure;
    if (room.elite) return MODS.brittle;
    const pool = [MODS.haste, MODS.brittle, MODS.rich, MODS.fog, MODS.pressure, MODS.none];
    return pool[(roomIndex + (room.id?.charCodeAt(1) || 0)) % pool.length];
  }

  // Patch E tags for sets: gunner=ATK/SPD, survivor=SUR/MOB, pupil=DIR
  const CARDS = {
    ATK1: { name: "Overcharge", desc: "공격력 +25%", rare: false, tags: ["gunner"], apply: (p) => (p.dmgMul *= 1.25) },
    ATK2: { name: "Hollow Point", desc: "치명타 15%(x2)", rare: true, tags: ["gunner"], apply: (p) => (p.crit = 0.15) },
    SPD1: { name: "Rapid Coil", desc: "연사 +20%", rare: false, tags: ["gunner"], apply: (p) => (p.fireRate *= 0.8) },
    SPD2: { name: "Hot Barrel", desc: "연사 +12%", rare: false, tags: ["gunner"], apply: (p) => (p.fireRate *= 0.88) },
    SUR1: { name: "Nano Mesh", desc: "MaxHP +25", rare: false, tags: ["survivor"], apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
    SUR2: { name: "Second Wind", desc: "피격 i-frame↑", rare: true, tags: ["survivor"], apply: (p) => (p.extraIFrame = 1.2) },
    MOB1: { name: "Afterimage", desc: "대시 CD -30%", rare: false, tags: ["survivor"], apply: (p) => (p.dashMaxCd *= 0.7) },
    MOB2: { name: "Slipstream", desc: "이동 +15%", rare: false, tags: ["survivor"], apply: (p) => (p.speed *= 1.15) },
    ECO1: { name: "Magnet Core", desc: "XP 자석↑", rare: false, tags: [], apply: (p) => (p.magnet = 150) },
    ECO2: { name: "Scavenger", desc: "pity 강화", rare: true, tags: [], apply: (p) => (p.pityBonus = 1) },
    DIR1: { name: "Insight", desc: "budget +10 · 기억 상세", rare: false, tags: ["pupil"], apply: (p, d) => { d.budget += 10; p.insight = true; } },
    DIR2: { name: "Counterplay", desc: "피격 반격 폭발", rare: true, tags: ["pupil"], apply: (p) => (p.thorns = true) },
  };
  const CARD_IDS = Object.keys(CARDS);

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $("overlay"), result: $("result"), cardPick: $("cardPick"), branchPick: $("branchPick"),
    cardChoices: $("cardChoices"), banner: $("banner"), startBtn: $("startBtn"), restartBtn: $("restartBtn"),
    skipBtn: $("skipBtn"), branchSafe: $("branchSafe"), branchElite: $("branchElite"),
    roomLabel: $("roomLabel"), scoreLabel: $("scoreLabel"), lvLabel: $("lvLabel"),
    comboLabel: $("comboLabel"), styleLabel: $("styleLabel"), buildLine: $("buildLine"),
    modLabel: $("modLabel"), skillLine: $("skillLine"),
    hpFill: $("hpFill"), hpText: $("hpText"), xpFill: $("xpFill"), xpText: $("xpText"),
    tensionFill: $("tensionFill"), tensionText: $("tensionText"),
    phaseChip: $("phaseChip"), budgetChip: $("budgetChip"),
    intensityText: $("intensityText"), actionText: $("actionText"), whyText: $("whyText"),
    memoryText: $("memoryText"),
    traceList: $("traceList"), pickEyebrow: $("pickEyebrow"), pickTitle: $("pickTitle"),
    resultTips: $("resultTips"), resultReport: $("resultReport"),
  };

  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, down: false };
  let audioCtx = null, running = false, paused = false, lastTs = 0, startedAt = 0;
  let score = 0, roomIndex = -1, shake = 0, flash = 0, hitstop = 0, chrome = 0;
  let walls = [], enemies = [], bullets = [], drops = [], xpGems = [], particles = [], floats = [], trails = [];
  let portal = null, roomClearT = 0, nothingStreak = 0, rarePity = 0;
  let bannerT = 0, tutorialT = 0, combo = 0, comboT = 0, maxCombo = 0, levelFlash = 0;
  let demoAim = { x: W / 2, y: H / 2 }, demoDashCd = 0;
  let roomDmgStart = 0, lastRoomNoHit = false, lastRoomHeavyDamage = false;
  let forkChoice = null; // "safe" | "elite"
  let pickMode = "level"; // level | clear | rareForce
  let keyActions = [];
  let pickQueue = 0; // queued level-up / reward picks (fix multi-level + clear race)
  let pendingForceRare = false;
  let roomSpawnLeft = 2;
  let roomCleared = false;
  let roomTime = 0;
  let lastKillAt = 0;
  let forkPicked = "—"; // safe | elite for report
  let interventionLog = []; // {action, why, t}
  let whyText = "대기 · 개입 사유가 여기 표시됩니다";
  let roomMod = MODS.none;
  let chargeT = 0, muzzle = 0;

  const player = basePlayer();
  const director = {
    intensity: 0.2, phase: "BUILD", phaseT: 0, style: "—", prevStyle: "—",
    budget: 25, cd: 0, actions: 0, lastAction: "—", memory: "대기",
    peakThreshold: 0.72, fadeTimeout: 4,
  };
  const stats = {
    nearMiss: 0, damageWindow: 0,
    styleAcc: { Aggressive: 0, Cautious: 0, Mobile: 0 },
    phaseCounts: { BUILD: 0, SUSTAIN_PEAK: 0, PEAK_FADE: 0, RELAX: 0 },
    phaseTime: { BUILD: 0, SUSTAIN_PEAK: 0, PEAK_FADE: 0, RELAX: 0 },
  };

  function basePlayer() {
    return {
      x: W * 0.2, y: H * 0.5, r: 14,
      hp: 100, maxHp: 100, speed: 230,
      dashCd: 0, dashMaxCd: 0.9, dashT: 0, inv: 0, blink: 0,
      fireCd: 0, fireRate: 0.16, dmgMul: 1, crit: 0, pierce: false, slowField: false,
      magnet: 70, pityBonus: 0, extraIFrame: 0.7, thorns: false, insight: false,
      skillCd: 0, skillMaxCd: 7.5, overdrive: 0,
      xp: 0, level: 1, nextXp: 20, cards: [], setName: "—",
      kills: 0, damageTaken: 0, dashes: 0, moveDist: 0, shots: 0, skills: 0, charged: 0,
    };
  }

  function beep(freq = 440, dur = 0.05, type = "square", gain = 0.03) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = gain;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur);
    } catch {}
  }
  function sfxHit(kind) {
    if (kind === "light") beep(520, 0.03, "square", 0.02);
    else if (kind === "crit") { beep(880, 0.05, "sawtooth", 0.03); beep(440, 0.08, "triangle", 0.02); }
    else if (kind === "boss") { beep(120, 0.1, "sawtooth", 0.04); beep(60, 0.12, "square", 0.03); }
    else beep(360, 0.045, "square", 0.025);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
  function pushTrace(msg) {
    const li = document.createElement("li"); li.textContent = msg;
    els.traceList.prepend(li);
    while (els.traceList.children.length > 12) els.traceList.lastChild.remove();
  }
  function showBanner(text, t = 2.2) {
    els.banner.textContent = text; els.banner.classList.remove("hidden"); bannerT = t;
  }
  function float(x, y, text, color = "#fff") { floats.push({ x, y, text, color, t: 0.8 }); }
  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 160;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, color, r: 2 + Math.random() * 2 });
    }
  }
  function remember(msg) {
    director.memory = msg;
    els.memoryText.textContent = msg;
    keyActions.push(msg);
    if (keyActions.length > 6) keyActions.shift();
  }
  function setWhy(text) {
    whyText = text;
    if (els.whyText) els.whyText.textContent = text;
  }
  function logIntervention(action, why) {
    director.lastAction = action;
    director.actions += 1;
    setWhy(why);
    els.actionText.textContent = action;
    interventionLog.push({ action, why, t: ((performance.now() - startedAt) / 1000).toFixed(1) });
    if (interventionLog.length > 12) interventionLog.shift();
    pushTrace(`${action} · ${why}`);
  }
  function cardStackLabel(id) {
    const n = player.cards.filter((c) => c === id).length;
    const name = CARDS[id]?.name || id;
    return n > 1 ? `${name} x${n}` : name;
  }

  // Patch E set bonuses
  function refreshSets() {
    const tags = player.cards.flatMap((id) => CARDS[id]?.tags || []);
    const gun = tags.filter((t) => t === "gunner").length;
    const sur = tags.filter((t) => t === "survivor").length;
    const pup = tags.filter((t) => t === "pupil").length;
    player.pierce = gun >= 2;
    player.slowField = sur >= 2;
    player.pupil = pup >= 2;
    const next = gun >= 2 ? "Gunner" : sur >= 2 ? "Survivor" : pup >= 2 ? "Director's Pupil" : "—";
    const prev = player.setName;
    player.setName = next;
    if (next !== "—" && next !== prev) {
      showBanner(`SET UNLOCKED · ${next}`, 1.8);
      remember(`세트 달성: ${next}`);
      beep(660, 0.1, "triangle", 0.04);
      chrome = 0.4;
    }
  }

  function roomWalls(template) {
    const list = [
      { x: 0, y: 0, w: W, h: PAD }, { x: 0, y: H - PAD, w: W, h: PAD },
      { x: 0, y: 0, w: PAD, h: H }, { x: W - PAD, y: 0, w: PAD, h: H },
    ];
    if (template === "corridor") {
      // Split pillars with a mid gap so fights cannot softlock behind full-height walls
      list.push({ x: W * 0.28, y: 70, w: 22, h: 150 }, { x: W * 0.28, y: H - 220, w: 22, h: 150 });
      list.push({ x: W * 0.62, y: 70, w: 22, h: 150 }, { x: W * 0.62, y: H - 220, w: 22, h: 150 });
    } else if (template === "cover") {
      list.push({ x: W * 0.42, y: H * 0.22, w: 120, h: 18 }, { x: W * 0.42, y: H * 0.68, w: 120, h: 18 });
    } else if (template === "spikes") {
      list.push({ x: W * 0.35, y: H * 0.35, w: 90, h: 18 }, { x: W * 0.55, y: H * 0.55, w: 90, h: 18 });
    } else if (template === "boss") {
      list.push({ x: W * 0.2, y: H * 0.25, w: 70, h: 16 }, { x: W * 0.7, y: H * 0.7, w: 70, h: 16 });
    } else if (template === "safe") {
      list.push({ x: W * 0.35, y: H * 0.3, w: 280, h: 16 }, { x: W * 0.35, y: H * 0.68, w: 280, h: 16 });
    }
    return list;
  }
  function hitsWall(x, y, r) {
    for (const w of walls) {
      const cx = clamp(x, w.x, w.x + w.w), cy = clamp(y, w.y, w.y + w.h);
      if (Math.hypot(x - cx, y - cy) < r) return true;
    }
    return false;
  }
  /** Push entity out if overlapping walls (safety after spawn / geometry). */
  function unstick(ent) {
    if (!hitsWall(ent.x, ent.y, ent.r)) return;
    const tries = [[40, 0], [-40, 0], [0, 40], [0, -40], [60, 60], [-60, -60], [80, 0], [-80, 0]];
    for (const [dx, dy] of tries) {
      const nx = clamp(ent.x + dx, PAD + ent.r + 2, W - PAD - ent.r - 2);
      const ny = clamp(ent.y + dy, PAD + ent.r + 2, H - PAD - ent.r - 2);
      if (!hitsWall(nx, ny, ent.r)) { ent.x = nx; ent.y = ny; return; }
    }
    ent.x = W * 0.2; ent.y = H * 0.5;
  }

  function spawnEnemy(type, x, y) {
    const defs = {
      chaser: { hp: 36, speed: 125, r: 13, color: "#fb7185", score: 40, xp: 6, intent: "dash", shape: "tri" },
      ranged: { hp: 28, speed: 90, r: 12, color: "#c084fc", score: 55, xp: 8, intent: "shot", shape: "diamond" },
      tank: { hp: 90, speed: 64, r: 18, color: "#f59e0b", score: 80, xp: 12, intent: "slam", shape: "square" },
      elite: { hp: 120, speed: 138, r: 16, color: "#f43f5e", score: 150, xp: 20, intent: "burst", shape: "hex" },
      swarm: { hp: 14, speed: 175, r: 8, color: "#fda4af", score: 18, xp: 3, intent: "dash", shape: "dot" },
      sniper: { hp: 34, speed: 70, r: 11, color: "#a5b4fc", score: 70, xp: 10, intent: "shot", shape: "diamond" },
      boss: { hp: DEMO ? 200 : 400, speed: 92, r: 28, color: "#ef4444", score: 900, xp: 60, intent: "nova", shape: "boss" },
    };
    const d = { ...defs[type] || defs.chaser };
    const scale = DEMO ? 0.5 : clamp(0.78 + roomIndex * 0.07, 0.78, 1.15);
    if (type !== "boss" || DEMO) d.hp = Math.ceil(d.hp * (DEMO && type === "boss" ? 1 : scale));
    if (DEMO && type !== "boss") d.hp = Math.ceil((defs[type] || defs.chaser).hp * 0.5);
    d.hp = Math.max(1, Math.ceil(d.hp * (roomMod?.enemyHp || 1)));
    d.speed *= (roomMod?.enemySpd || 1);
    enemies.push({
      type, x, y, ...d, maxHp: d.hp,
      fireCd: 0.5 + Math.random(), hurt: 0, telegraph: 0, wind: 0, pattern: 0,
      aiT: Math.random(), vx: 0, vy: 0,
      bossPhase: type === "boss" ? 1 : 0,
      dashWind: 0, minionDone: false, laserT: 0,
    });
  }
  function spawnByStyle(n, style) {
    for (let i = 0; i < n; i++) {
      let type = "chaser";
      const r = Math.random();
      if (style === "Aggressive") type = r > 0.55 ? "ranged" : r > 0.28 ? "swarm" : "chaser";
      else if (style === "Cautious") type = r > 0.55 ? "tank" : r > 0.28 ? "sniper" : "chaser";
      else if (style === "Mobile") type = r > 0.5 ? "swarm" : r > 0.25 ? "chaser" : "ranged";
      else type = r > 0.78 ? "sniper" : r > 0.55 ? "tank" : r > 0.32 ? "swarm" : "chaser";
      const side = i % 4;
      const pos = [
        { x: 70, y: 100 + Math.random() * (H - 200) },
        { x: W - 70, y: 100 + Math.random() * (H - 200) },
        { x: 120 + Math.random() * (W - 240), y: 70 },
        { x: 120 + Math.random() * (W - 240), y: H - 70 },
      ][side];
      spawnEnemy(type, pos.x, pos.y);
    }
  }

  function queueCardPick(mode = "level", forceRare = false) {
    if (forceRare) pendingForceRare = true;
    pickQueue += 1;
    if (!els.cardPick.classList.contains("hidden")) return; // already showing; drain after close
    openCardPick(mode, forceRare || pendingForceRare);
  }
  function openCardPick(mode = "level", forceRare = false) {
    pickMode = mode;
    const rareNow = forceRare || pendingForceRare;
    if (rareNow) pendingForceRare = false;
    paused = true;
    els.pickEyebrow.textContent = mode === "clear" ? "ROOM CLEAR · 보상 선택" : rareNow ? "ELITE REWARD · Rare" : "LEVEL UP · 카드 선택";
    els.pickTitle.textContent = rareNow ? "Rare 카드 확정" : "강화 선택 (Skip 가능)";
    const pool = CARD_IDS.slice();
    const picks = [];
    while (picks.length < 3 && pool.length) {
      let id;
      if (rareNow || (rarePity >= 4 && Math.random() < 0.7)) {
        const rares = pool.filter((c) => CARDS[c].rare);
        id = (rares.length ? rares : pool)[Math.floor(Math.random() * (rares.length || pool.length))];
      } else {
        id = pool[Math.floor(Math.random() * pool.length)];
      }
      const idx = pool.indexOf(id);
      pool.splice(idx, 1);
      if (!picks.includes(id)) picks.push(id);
    }
    els.cardChoices.innerHTML = "";
    for (const id of picks) {
      const c = CARDS[id];
      const btn = document.createElement("button");
      btn.className = "choice" + (c.rare ? " rare" : "");
      btn.innerHTML = `<b>${c.rare ? "★ " : ""}${c.name}</b><span>${c.desc}</span>`;
      btn.onclick = () => takeCard(id);
      els.cardChoices.appendChild(btn);
    }
    els.skipBtn.style.display = rareNow ? "none" : "block";
    els.cardPick.classList.remove("hidden");
    if (BOT) {
      const tryPick = () => {
        if (els.cardPick.classList.contains("hidden")) return;
        const choices = [...els.cardChoices.querySelectorAll("button")];
        if (!choices.length) return;
        const rare = choices.find((b) => b.classList.contains("rare"));
        const dps = choices.find((b) => /Overcharge|Hollow|Rapid|Hot/.test(b.textContent || ""));
        (rare || dps || choices[0])?.click();
      };
      setTimeout(tryPick, PLAYTEST ? 180 : 450);
      setTimeout(tryPick, PLAYTEST ? 500 : 900);
    }
  }
  function takeCard(id) {
    const c = CARDS[id];
    c.apply(player, director);
    player.cards.push(id);
    if (c.rare) rarePity = 0; else rarePity += 1;
    refreshSets();
    const label = cardStackLabel(id);
    pushTrace(`Card: ${label}${c.rare ? " (Rare)" : ""}`);
    showBanner(`${c.rare ? "RARE " : ""}GET · ${label}`, 1.4);
    levelFlash = 0.35; chrome = 0.25;
    beep(c.rare ? 920 : 720, 0.08, "triangle", 0.035);
    closePick();
  }
  function closePick() {
    els.cardPick.classList.add("hidden");
    pickQueue = Math.max(0, pickQueue - 1);
    if (pickQueue > 0) {
      openCardPick("level", pendingForceRare);
      return;
    }
    paused = false;
    lastTs = performance.now();
  }

  function openBranch() {
    paused = true;
    els.branchPick.classList.remove("hidden");
    showBanner("Director: 경로 분기 — Safe vs Elite", 2);
    remember("경로 분기 제시: Safe(안정) / Elite(희귀 보상)");
    if (BOT) setTimeout(() => (FORK_PREF === "safe" ? els.branchSafe : els.branchElite).click(), PLAYTEST ? 250 : 600);
  }

  function resolveFork(choice) {
    forkChoice = choice;
    forkPicked = choice;
    els.branchPick.classList.add("hidden");
    paused = false;
    lastTs = performance.now();
    const room = RUN_ROOMS[roomIndex];
    room.template = choice === "safe" ? "safe" : "arena";
    room.safe = choice === "safe";
    room.elite = choice === "elite";
    room.fork = false;
    room.intent = choice === "safe" ? "RELAX" : "SUSTAIN_PEAK";
    const why = choice === "safe"
      ? "Why: 플레이어 안정 선택 · RELAX/회복 루트"
      : "Why: 플레이어 고위험 선택 · Rare 확정 루트";
    setWhy(why);
    remember(choice === "safe" ? "플레이어 Safe 선택 → 회복 루트" : "플레이어 Elite 선택 → 고위험 루트");
    pushTrace(`Fork → ${choice}`);
    showBanner(`DIRECTOR: FORK · ${choice.toUpperCase()}`, 1.8);
    beginRoomContent(room);
  }

  function addXp(v) {
    player.xp += Math.ceil(v * (roomMod?.xpMul || 1));
    while (player.xp >= player.nextXp) {
      player.xp -= player.nextXp;
      player.level += 1;
      player.nextXp = Math.floor(20 + player.level * 12);
      levelFlash = 0.5; chrome = 0.35;
      showBanner(`LEVEL ${player.level}`, 1.2);
      beep(760, 0.09, "triangle", 0.04);
      queueCardPick("level");
    }
  }

  function useSkill() {
    if (player.skillCd > 0 || paused || !running) return;
    player.skillCd = player.skillMaxCd;
    player.skills += 1;
    const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const set = player.setName;
    if (set === "Gunner") {
      for (let i = -2; i <= 2; i++) fire(player, ang + i * 0.12, 620, 22 * player.dmgMul, true, true);
      showBanner("Q · GUNNER BARRAGE", 1.2);
      setWhy("Why: Player Q · Gunner pierce barrage");
    } else if (set === "Survivor") {
      player.inv = Math.max(player.inv, 1.25);
      player.hp = clamp(player.hp + 18, 0, player.maxHp);
      player.overdrive = 2.2;
      burst(player.x, player.y, "#4ade80", 18);
      showBanner("Q · SURVIVOR WARD", 1.2);
      setWhy("Why: Player Q · Survivor ward + heal");
    } else if (set === "Director's Pupil") {
      director.budget = clamp(director.budget + 18, 0, 100);
      drops.push({ x: player.x + 40, y: player.y, kind: "heal", r: 11, life: 10 });
      remember("Pupil Q · Director 협력");
      showBanner("Q · DIRECTOR CALL", 1.2);
      setWhy("Why: Player Q · Pupil budget+heal call");
    } else {
      for (const e of enemies) if (dist(e, player) < 110) { e.hp -= 28 * player.dmgMul; e.hurt = 0.15; }
      burst(player.x, player.y, "#fbbf24", 20);
      showBanner("Q · PULSE", 1.1);
      setWhy("Why: Player Q · baseline pulse");
    }
    chrome = 0.3; shake = Math.min(0.35, shake + 0.15);
    beep(520, 0.08, "sawtooth", 0.035);
  }
  function gainXp(amount, x, y) {
    xpGems.push({ x, y, r: 6, val: amount, life: 8, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40 });
  }

  function roomClearReward(noHit) {
    lastRoomNoHit = noHit;
    lastRoomHeavyDamage = player.damageTaken - roomDmgStart >= 35;
    const room = RUN_ROOMS[roomIndex];
    if (forkChoice === "elite" && room?.elite) {
      queueCardPick("clear", true);
      forkChoice = null;
    } else {
      const threshold = player.pityBonus ? 1 : 2;
      if (nothingStreak >= threshold || Math.random() < 0.55 || noHit) {
        nothingStreak = 0;
        queueCardPick("clear", false);
      } else {
        nothingStreak += 1;
        float(W * 0.5, H * 0.4, "NO DROP", "#94a3b8");
        pushTrace("Clear reward skipped by RNG (pity++)");
      }
    }
    if (noHit) {
      drops.push({ x: W * 0.55, y: H * 0.55, kind: "heal", r: 11, life: 14 });
      float(W * 0.5, H * 0.32, "NO-HIT BONUS", "#fde68a");
      remember("직전 방 No-Hit — Peak 강화 후보");
    } else if (lastRoomHeavyDamage) {
      remember("직전 방 다수 피격 — Relax heal 후보");
    }
  }

  function detectStyle() {
    const t = Math.max(8, (performance.now() - startedAt) / 1000);
    const killRate = player.kills / t;
    const dmgRate = player.damageTaken / t;
    const mobility = player.moveDist / t + player.dashes * 6;
    if (mobility > 160 && player.dashes > Math.max(2, player.kills * 0.3)) return "Mobile";
    if (killRate > 0.22 && dmgRate > 3.5) return "Aggressive";
    if (dmgRate < 2.8) return "Cautious";
    return mobility > 130 ? "Mobile" : "Cautious";
  }

  function setPhase(next, reason) {
    if (director.phase === next) return;
    director.phase = next; director.phaseT = 0;
    stats.phaseCounts[next] = (stats.phaseCounts[next] || 0) + 1;
    pushTrace(`Phase → ${next} (${reason})`);
    showBanner(`DIRECTOR: ${next} · ${reason}`, 1.8);
    setWhy(`Why: Phase ${next} ← ${reason}`);
    beep(next.includes("PEAK") ? 160 : next === "RELAX" ? 520 : 300, 0.08, "sawtooth", 0.03);
  }

  function updateDirector(dt) {
    const threat = enemies.reduce((s, e) => s + ({ boss: 0.4, elite: 0.2, tank: 0.12, ranged: 0.09, sniper: 0.11, swarm: 0.05, chaser: 0.07 }[e.type] || 0.07), 0);
    const hpF = 1 - player.hp / player.maxHp;
    const target = clamp(threat * 0.5 + hpF * 0.3 + stats.damageWindow * 0.25 + (stats.nearMiss > 0.2 ? 0.1 : 0), 0, 1);
    director.intensity += (target - director.intensity) * clamp((target > director.intensity ? 2 : 0.45) * dt, 0, 1);
    stats.damageWindow = Math.max(0, stats.damageWindow - dt * 0.35);
    stats.nearMiss = Math.max(0, stats.nearMiss - dt);
    director.phaseT += dt;
    if (stats.phaseTime[director.phase] != null) stats.phaseTime[director.phase] += dt;
    director.budget = clamp(director.budget + dt * (player.pupil ? 9 : 7) * (roomMod?.budgetMul || 1), 0, 100);
    director.cd = Math.max(0, director.cd - dt);

    const style = detectStyle();
    if (style !== director.style) {
      director.prevStyle = director.style;
      director.style = style;
      remember(`${style} 감지${director.prevStyle !== "—" ? ` (이전 ${director.prevStyle})` : ""}`);
      setWhy(`Why: Style → ${style} (플레이 패턴 재분류)`);
    }
    stats.styleAcc[style] += dt;

    if (director.phase === "BUILD" && director.intensity >= director.peakThreshold) setPhase("SUSTAIN_PEAK", "intensity peak");
    else if (director.phase === "SUSTAIN_PEAK" && director.phaseT >= 3.5) setPhase("PEAK_FADE", "sustain done");
    else if (director.phase === "PEAK_FADE" && (enemies.length <= 2 || director.phaseT >= director.fadeTimeout)) setPhase("RELAX", "fade complete");
    else if (director.phase === "RELAX" && director.phaseT >= 8 && !RUN_ROOMS[roomIndex]?.safe) setPhase("BUILD", "relax end");

    const intent = RUN_ROOMS[roomIndex]?.intent;
    if (intent === "RELAX" && director.phase !== "RELAX") setPhase("RELAX", "safe/room intent");
    if ((intent === "SUSTAIN_PEAK" || intent === "PEAK") && director.phase === "BUILD" && director.phaseT > 1) setPhase("SUSTAIN_PEAK", "room intent");

    if (director.phase === "PEAK_FADE") {
      if (director.cd <= 0 && enemies.length > 0) {
        director.cd = 1.5;
        setWhy("Why: PEAK_FADE · spawn 억제 (호흡 구간)");
        pushTrace("PEAK_FADE suppress spawn");
      }
      return;
    }

    if (director.cd <= 0 && !portal && !roomCleared && enemies.length > 0 && !RUN_ROOMS[roomIndex]?.safe && !RUN_ROOMS[roomIndex]?.fork) intervene();

    if (
      director.phase === "BUILD" &&
      enemies.length >= 2 && enemies.length <= 3 &&
      roomSpawnLeft > 0 && !portal && !roomCleared &&
      director.budget >= 12 && !RUN_ROOMS[roomIndex]?.boss
    ) {
      director.budget -= 12; roomSpawnLeft -= 1;
      spawnByStyle(2, director.style);
      logIntervention("BUILD pack", `Why: BUILD top-up · budget-12`);
      showBanner("DIRECTOR: BUILD · 압박 팩", 1.5);
      director.cd = 3.2;
    }
  }

  function intervene() {
    if (roomCleared || enemies.length === 0 || enemies.length >= 7 || roomSpawnLeft <= 0) {
      director.cd = Math.max(director.cd, 1.0);
      return;
    }
    if (director.phase === "PEAK_FADE") {
      setWhy("Why: PEAK_FADE · intervene blocked");
      director.cd = 1.2;
      return;
    }
    const st = director.style;
    if (lastRoomNoHit && director.phase !== "RELAX" && director.budget >= 28 && enemies.length < 5 && roomIndex >= 2) {
      director.budget -= 28; roomSpawnLeft -= 1;
      spawnEnemy("elite", W * 0.78, H * 0.3);
      spawnByStyle(1, st);
      logIntervention("punish no-hit", "Why: Memory No-Hit · budget 28 · Elite Pack");
      showBanner("DIRECTOR: 기억 · No-Hit → Elite Pack", 2);
      remember("직전 No-Hit 기억 → Peak 강화 실행");
      lastRoomNoHit = false; shake = 0.3; director.cd = 5; return;
    }
    if (lastRoomHeavyDamage && director.budget >= 18) {
      director.budget -= 18;
      drops.push({ x: W * 0.5, y: H * 0.5, kind: "heal", r: 12, life: 12 });
      logIntervention("heal after heavy", "Why: Memory 다수 피격 · budget 18 · Heal");
      showBanner("DIRECTOR: 기억 · 다수 피격 → Heal", 2);
      remember("직전 다수 피격 기억 → Heal 실행");
      lastRoomHeavyDamage = false; director.cd = 4; return;
    }
    if (director.phase === "RELAX" && player.hp < 75 && director.budget >= 20) {
      director.budget -= 20;
      drops.push({ x: W * 0.5, y: H * 0.5, kind: "heal", r: 11, life: 12 });
      logIntervention("RELAX heal", `Why: RELAX · HP<75 · ${st} · budget-20`);
      showBanner(`DIRECTOR: RELAX · ${st} · Heal`, 1.8);
      director.cd = 4; return;
    }
    if ((director.phase === "SUSTAIN_PEAK" || director.phase === "BUILD") && director.budget >= 30 && enemies.length >= 2 && enemies.length < 5 && roomIndex >= 2) {
      director.budget -= 30; roomSpawnLeft -= 1;
      spawnEnemy("elite", W * 0.78, H * 0.35);
      spawnByStyle(1, st);
      logIntervention("PEAK elite", `Why: ${st} 지속 · Peak · budget-30 · Elite`);
      showBanner(`DIRECTOR: PEAK · ${st} 대응 · Elite`, 1.8);
      remember(`${st} 지속 감지 → 엘리트 웨이브`);
      shake = 0.3; director.cd = 6; return;
    }
  }

  function startRoom() {
    roomIndex += 1;
    const room = RUN_ROOMS[roomIndex];
    enemies = []; bullets = []; drops = []; particles = []; portal = null; roomClearT = 0;
    window.__clearArmed = false;
    roomCleared = false;
    roomSpawnLeft = room.boss ? 1 : room.elite ? 2 : 2;
    roomTime = 0;
    lastKillAt = 0;
    roomDmgStart = player.damageTaken;
    tutorialT = room.tutorial ? 3.5 : 0;

    if (room.fork) {
      walls = roomWalls("arena");
      openBranch();
      return;
    }
    beginRoomContent(room);
  }

  function beginRoomContent(room) {
    walls = roomWalls(room.template);
    player.x = W * 0.2; player.y = H * 0.5; player.inv = 1;
    unstick(player);
    roomMod = pickRoomMod(room);
    if (els.modLabel) els.modLabel.textContent = `MOD ${roomMod.name}`;
    showBanner(`${room.id} · ${room.template.toUpperCase()} · ${roomMod.name}`, 1.8);
    pushTrace(`Enter ${room.id} · MOD ${roomMod.name}`);
    if (roomMod.id !== "none") {
      setWhy(`Why: Room mod ${roomMod.name} — ${roomMod.desc}`);
      remember(`방 규칙: ${roomMod.name} · ${roomMod.desc}`);
    }

    if (room.safe) {
      setPhase("RELAX", "safe");
      forkChoice = null;
      drops.push({ x: W * 0.45, y: H * 0.5, kind: "heal", r: 12, life: 20 });
      drops.push({ x: W * 0.55, y: H * 0.5, kind: "heal", r: 12, life: 20 });
      openPortalSoon(0.2);
      addXp(Math.max(4, player.nextXp - player.xp));
      return;
    }
    if (room.boss) {
      spawnEnemy("boss", W * 0.72, H * 0.5);
      spawnByStyle(DEMO ? 1 : 2, director.style);
      setPhase("SUSTAIN_PEAK", "boss");
      showBanner("BOSS ENCOUNTER · PHASE 1", 2.4);
      setWhy("Why: Boss arena · Phase 1 nova");
      chrome = 0.4; return;
    }
    if (room.elite) {
      drops.push({ x: W * 0.4, y: H * 0.55, kind: "heal", r: 12, life: 18 });
      if (player.hp < 80) drops.push({ x: W * 0.5, y: H * 0.4, kind: "heal", r: 11, life: 16 });
      director.budget = Math.min(director.budget, 45);
    }
    const n = 3 + Math.floor(Math.min(roomIndex, 5) * 0.55);
    spawnByStyle(n, director.style || "—");
    if (room.elite) spawnEnemy("elite", W * 0.8, H * 0.3);
    if (roomMod.id === "haste" || roomMod.id === "pressure") spawnEnemy("swarm", W * 0.75, H * 0.25);
    if (player.hp < 55) drops.push({ x: W * 0.35, y: H * 0.5, kind: "heal", r: 11, life: 16 });
    setPhase(room.intent === "PEAK" || room.intent === "SUSTAIN_PEAK" ? "SUSTAIN_PEAK" : "BUILD", "room start");
  }

  function openPortalSoon(delay = 0.4) { roomClearT = delay; }
  function openPortal() {
    portal = { x: W * 0.86, y: H * 0.5, r: 24, t: 0 };
    pushTrace("Portal open"); beep(880, 0.1, "triangle", 0.03);
  }

  function hurtPlayer(dmg) {
    if (player.inv > 0) return;
    dmg = Math.ceil(dmg * (roomMod?.playerDmgTaken || 1) * (player.overdrive > 0 ? 0.75 : 1));
    player.hp -= dmg; player.damageTaken += dmg;
    stats.damageWindow = Math.min(1, stats.damageWindow + dmg / 25);
    player.inv = player.extraIFrame; player.blink = player.inv;
    flash = 0.18; shake = Math.min(0.35, shake + 0.22); hitstop = Math.min(0.05, Math.max(hitstop, 0.04)); combo = 0;
    float(player.x, player.y - 22, `-${dmg}`, "#fb7185");
    sfxHit("boss");
    if (player.thorns) {
      for (const e of enemies) if (dist(e, player) < 90) { e.hp -= 18; e.hurt = 0.1; }
      burst(player.x, player.y, "#fbbf24", 14);
    }
    if (player.slowField) {
      for (const e of enemies) if (dist(e, player) < 120) e.speed *= 0.85;
    }
    if (player.hp <= 0) endRun(false);
  }

  function endRun(win) {
    running = false; paused = false; window.__NAN_DEMO_DONE__ = true;
    window.__PT_DONE__ = true;
    const dominant = Object.entries(stats.styleAcc).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    const styleTotal = Object.values(stats.styleAcc).reduce((a, b) => a + b, 0) || 1;
    const stylePct = (k) => Math.round((stats.styleAcc[k] / styleTotal) * 100);
    const phaseLine = ["BUILD", "SUSTAIN_PEAK", "PEAK_FADE", "RELAX"]
      .map((p) => `${p} ${stats.phaseTime[p].toFixed(1)}s`)
      .join(" · ");
    const topActs = interventionLog.slice(-3);
    window.__PT_REPORT__ = {
      win, score, level: player.level, kills: player.kills, maxCombo,
      set: player.setName, cards: player.cards.slice(),
      actions: director.actions, damageTaken: player.damageTaken,
      room: roomIndex + 1, rooms: RUN_ROOMS.length, fork: forkPicked,
      hp: Math.max(0, player.hp), duration: (performance.now() - startedAt) / 1000,
    };
    els.result.classList.remove("hidden");
    $("resultEyebrow").textContent = win ? "DIRECTOR LOOP CLEAR" : "RUN FAILED";
    $("resultTitle").textContent = win ? "보스 처치 · 디렉팅 완료" : "런 종료";
    $("resultDesc").textContent = `Style ${dominant} · Fork ${forkPicked} · Set ${player.setName} · Actions ${director.actions}`;
    if (els.resultReport) {
      els.resultReport.innerHTML = `
        <div class="cell"><strong>Style mix</strong>Agg ${stylePct("Aggressive")}% · Cau ${stylePct("Cautious")}% · Mob ${stylePct("Mobile")}%</div>
        <div class="cell"><strong>Fork / Set</strong>${forkPicked} · ${player.setName}</div>
        <div class="cell span2"><strong>Phase dwell</strong>${phaseLine}</div>
        <div class="cell span2"><strong>Key interventions</strong>${topActs.length ? topActs.map((a) => `${a.t}s ${a.action}: ${a.why}`).join("<br>") : "—"}</div>`;
    }
    const tip = dominant === "Cautious"
      ? "Safe 대신 Elite를 한 번 노려 Rare 시너지를 열어보세요."
      : dominant === "Aggressive"
        ? "대시로 Near-miss를 줄이면 Relax heal이 더 자주 뜹니다."
        : "Peak 중 지형 압박을 대시로 끊고 PEAK_FADE 호흡을 쓰세요.";
    els.resultTips.innerHTML = keyActions.slice(-3).map((t) => `<li>${t}</li>`).join("") + `<li>다음 팁: ${tip}</li>`;
    $("resultStats").innerHTML = `
      <div><strong>SCORE</strong>${score}</div><div><strong>LEVEL</strong>${player.level}</div>
      <div><strong>KILLS</strong>${player.kills}</div><div><strong>COMBO MAX</strong>${maxCombo}</div>`;
  }

  function fire(from, ang, speed, dmg, friendly, pierce = false, opts = {}) {
    bullets.push({
      x: from.x, y: from.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      r: opts.r || (friendly ? 4 : 5), dmg, friendly, life: opts.life || 1.25, pierce, hit: new Set(),
      charged: !!opts.charged,
    });
  }

  function updatePlayer(dt) {
    let mx = 0, my = 0;
    if (keys.has("w") || keys.has("arrowup")) my -= 1;
    if (keys.has("s") || keys.has("arrowdown")) my += 1;
    if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
    if (keys.has("d") || keys.has("arrowright")) mx += 1;

    if (DEMO) {
      demoDashCd -= dt;
      const target = enemies[0] || portal || { x: W * 0.7, y: H * 0.5 };
      demoAim.x += (target.x - demoAim.x) * clamp(dt * 5, 0, 1);
      demoAim.y += (target.y - demoAim.y) * clamp(dt * 5, 0, 1);
      mouse.x = demoAim.x; mouse.y = demoAim.y;
      const to = norm(target.x - player.x, target.y - player.y);
      const d = dist(player, target);
      if (portal) { mx = to.x; my = to.y; mouse.down = false; }
      else if (d > 130) { mx = to.x; my = to.y; mouse.down = true; }
      else if (d < 70) { mx = -to.x; my = -to.y; mouse.down = true; }
      else { mx = -to.y; my = to.x; mouse.down = true; }
      if (player.hp < 50 && demoDashCd <= 0) { keys.add("shift"); demoDashCd = 1.1; } else keys.delete("shift");
      if (enemies.length >= 3 && player.skillCd <= 0) useSkill();
    } else if (PLAYTEST) {
      demoDashCd -= dt;
      let target = enemies.reduce((best, e) => {
        if (!best) return e;
        const score = (e.type === "boss" ? 1000 : e.type === "elite" ? 400 : e.type === "sniper" ? 250 : 100) - dist(player, e) * 0.05;
        const bestScore = (best.type === "boss" ? 1000 : best.type === "elite" ? 400 : best.type === "sniper" ? 250 : 100) - dist(player, best) * 0.05;
        return score > bestScore ? e : best;
      }, null) || portal || { x: W * 0.75, y: H * 0.5 };
      if (player.hp < 45) {
        const heal = drops.find((d) => d.kind === "heal");
        if (heal) target = heal;
      }
      if (portal && (enemies.length === 0 || roomCleared)) target = portal;
      demoAim.x += (target.x - demoAim.x) * clamp(dt * 7, 0, 1);
      demoAim.y += (target.y - demoAim.y) * clamp(dt * 7, 0, 1);
      mouse.x = demoAim.x; mouse.y = demoAim.y;
      const to = norm(target.x - player.x, target.y - player.y);
      const d = dist(player, target);
      if (portal && enemies.length === 0) { mx = to.x; my = to.y; mouse.down = false; }
      else if (d > 150) { mx = to.x; my = to.y; mouse.down = true; }
      else if (d < 95) { mx = -to.x; my = -to.y; mouse.down = true; }
      else { mx = -to.y * 1.2 + to.x * 0.2; my = to.x * 1.2 + to.y * 0.2; mouse.down = true; }
      if (Math.abs(player.y - H * 0.5) > 70) my += player.y > H * 0.5 ? -0.8 : 0.8;
      const threatNear = enemies.some((e) => dist(e, player) < 110);
      if ((player.hp < 60 || threatNear) && demoDashCd <= 0 && player.dashCd <= 0) {
        keys.add("shift"); demoDashCd = 0.85;
      } else keys.delete("shift");
      if ((player.hp < 55 || enemies.length >= 4) && player.skillCd <= 0) useSkill();
      // charge periodically
      if (enemies.length && Math.floor(performance.now() / 900) % 3 === 0) chargeT += dt;
    }

    if (mx || my) {
      const n = norm(mx, my);
      const spd = player.speed * (player.dashT > 0 ? 2.35 : 1) * (player.overdrive > 0 ? 1.12 : 1);
      const nx = player.x + n.x * spd * dt, ny = player.y + n.y * spd * dt;
      if (!hitsWall(nx, player.y, player.r)) { player.moveDist += Math.abs(nx - player.x); player.x = nx; }
      if (!hitsWall(player.x, ny, player.r)) { player.moveDist += Math.abs(ny - player.y); player.y = ny; }
      if (player.dashT > 0) trails.push({ x: player.x, y: player.y, life: 0.25 });
    }
    player.dashCd = Math.max(0, player.dashCd - dt);
    player.dashT = Math.max(0, player.dashT - dt);
    player.inv = Math.max(0, player.inv - dt);
    player.blink = Math.max(0, player.blink - dt);
    player.fireCd = Math.max(0, player.fireCd - dt);
    player.skillCd = Math.max(0, player.skillCd - dt);
    player.overdrive = Math.max(0, player.overdrive - dt);
    comboT = Math.max(0, comboT - dt);
    if (comboT <= 0) combo = 0;
    muzzle = Math.max(0, muzzle - dt);

    if (keys.has("shift") && player.dashCd <= 0) {
      player.dashCd = player.dashMaxCd; player.dashT = 0.15; player.inv = Math.max(player.inv, 0.15);
      player.dashes += 1; burst(player.x, player.y, "#7dd3fc", 8); beep(240, 0.04, "square", 0.02);
    }
    if (keys.has("q")) { useSkill(); keys.delete("q"); }

    const wantFire = mouse.down || keys.has(" ");
    if (wantFire && !PLAYTEST) chargeT += dt;
    if (!wantFire && chargeT > 0) {
      const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
      if (chargeT >= 0.42 && player.fireCd <= 0.05) {
        let dmg = 34 * player.dmgMul;
        if (player.crit && Math.random() < player.crit) { dmg *= 2; float(player.x, player.y - 16, "CRIT", "#fde68a"); }
        fire(player, ang, 480, dmg, true, true, { r: 7, charged: true, life: 1.4 });
        player.fireCd = player.fireRate * 1.35; player.shots += 1; player.charged += 1;
        muzzle = 0.12; hitstop = Math.min(0.08, Math.max(hitstop, 0.05));
        showBanner("CHARGED SHOT", 0.7); sfxHit("crit");
      } else if (player.fireCd <= 0) {
        let dmg = 15 * player.dmgMul;
        let crit = false;
        if (player.crit && Math.random() < player.crit) { dmg *= 2; crit = true; float(player.x, player.y - 16, "CRIT", "#fde68a"); }
        fire(player, ang, 540, dmg, true, player.pierce);
        player.fireCd = player.fireRate; player.shots += 1; muzzle = 0.06; sfxHit(crit ? "crit" : "light");
      }
      chargeT = 0;
    } else if (BOT && wantFire && player.fireCd <= 0) {
      // bots keep auto-fire for reliability; occasional charged already via PLAYTEST chargeT
      const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
      if (chargeT >= 0.42) {
        fire(player, ang, 480, 34 * player.dmgMul, true, true, { r: 7, charged: true });
        player.charged += 1; chargeT = 0; player.fireCd = player.fireRate * 1.2; muzzle = 0.1; sfxHit("crit");
      } else {
        let dmg = 15 * player.dmgMul;
        if (player.crit && Math.random() < player.crit) dmg *= 2;
        fire(player, ang, 540, dmg, true, player.pierce);
        player.fireCd = player.fireRate; player.shots += 1; muzzle = 0.05;
      }
    }
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      e.hurt = Math.max(0, e.hurt - dt);
      e.telegraph = Math.max(0, e.telegraph - dt);
      e.wind = Math.max(0, e.wind - dt);
      const toP = norm(player.x - e.x, player.y - e.y);
      let tx = 0, ty = 0;
      if (e.type === "chaser") {
        if (e.wind > 0) { tx = e.vx; ty = e.vy; }
        else if (dist(e, player) < 170 && e.aiT <= 0) { e.telegraph = 0.4; e.aiT = 1.7; e.intent = "dash"; }
        else if (e.telegraph <= 0 && e.aiT > 1.25) { e.wind = 0.22; e.vx = toP.x * 3.2; e.vy = toP.y * 3.2; }
        else { tx = toP.x; ty = toP.y; }
        e.aiT -= dt;
      } else if (e.type === "ranged") {
        const d = dist(e, player);
        if (d < 160) { tx = -toP.x; ty = -toP.y; } else if (d > 250) { tx = toP.x; ty = toP.y; } else { tx = -toP.y; ty = toP.x; }
        e.fireCd -= dt;
        if (e.fireCd <= 0.3) { e.telegraph = e.fireCd; e.intent = "shot"; }
        if (e.fireCd <= 0) { fire(e, Math.atan2(player.y - e.y, player.x - e.x), 270, 8, false); e.fireCd = 1.15; }
      } else if (e.type === "tank") {
        tx = toP.x * 0.85; ty = toP.y * 0.85;
        e.fireCd -= dt;
        if (e.fireCd <= 0.45 && dist(e, player) < 120) { e.telegraph = e.fireCd; e.intent = "slam"; }
        if (e.fireCd <= 0 && dist(e, player) < 110) { hurtPlayer(14); burst(e.x, e.y, "#f59e0b", 12); e.fireCd = 2.2; shake = 0.2; }
        else if (e.fireCd <= 0) e.fireCd = 1.2;
      } else if (e.type === "swarm") {
        tx = toP.x; ty = toP.y;
        e.intent = "dash";
        if (dist(e, player) < 140 && e.aiT <= 0) { e.telegraph = 0.25; e.aiT = 1.1; }
        if (e.telegraph <= 0 && e.aiT > 0.75) { e.wind = 0.18; e.vx = toP.x * 3.6; e.vy = toP.y * 3.6; }
        e.aiT -= dt;
      } else if (e.type === "sniper") {
        const d = dist(e, player);
        if (d < 200) { tx = -toP.x; ty = -toP.y; } else { tx = -toP.y * 0.4; ty = toP.x * 0.4; }
        e.fireCd -= dt;
        e.intent = "shot";
        if (e.fireCd <= 0.7) {
          e.telegraph = e.fireCd;
          e.laserAim = { x: player.x, y: player.y };
        }
        if (e.fireCd <= 0) {
          const ang = Math.atan2(player.y - e.y, player.x - e.x);
          fire(e, ang, 520, 16, false, false, { r: 4, life: 1.6 });
          e.fireCd = 1.8; e.laserAim = null; shake = Math.max(shake, 0.12); sfxHit("mid");
        }
      } else if (e.type === "elite") {
        e.pattern += dt;
        if (e.pattern % 4 < 2) { tx = toP.x; ty = toP.y; } else { tx = -toP.y; ty = toP.x; }
        e.fireCd -= dt; e.intent = "burst";
        if (e.fireCd <= 0.25) e.telegraph = e.fireCd;
        if (e.fireCd <= 0) {
          for (let i = -1; i <= 1; i++) fire(e, Math.atan2(player.y - e.y, player.x - e.x) + i * 0.18, 320, 11, false);
          e.fireCd = 1.1;
        }
      } else if (e.type === "boss") {
        const hpRatio = e.hp / e.maxHp;
        const wantPhase = hpRatio > 0.6 ? 1 : hpRatio > 0.3 ? 2 : 3;
        if (wantPhase !== e.bossPhase) {
          e.bossPhase = wantPhase;
          e.telegraph = 0.55;
          e.fireCd = 0.7;
          showBanner(`BOSS PHASE ${e.bossPhase}`, 1.6);
          pushTrace(`Boss → Phase ${e.bossPhase}`);
          setWhy(`Why: Boss HP ${(hpRatio * 100).toFixed(0)}% → Phase ${e.bossPhase}`);
          shake = Math.min(0.4, shake + 0.25); chrome = 0.35;
        }
        tx = toP.x * (e.bossPhase === 3 ? 1.15 : 0.9);
        ty = toP.y * (e.bossPhase === 3 ? 1.15 : 0.9);
        e.fireCd -= dt;
        if (e.dashWind > 0) {
          e.dashWind -= dt;
          tx = e.vx; ty = e.vy;
          e.intent = "dash";
        } else if (e.fireCd <= 0.4) {
          e.telegraph = e.fireCd;
          e.intent = e.bossPhase === 1 ? "nova" : e.bossPhase === 2 ? "burst" : "slam";
        }
        if (e.fireCd <= 0) {
          if (e.bossPhase === 1) {
            for (let i = 0; i < 10; i++) fire(e, (Math.PI * 2 * i) / 10 + e.pattern, 250, 11, false);
            e.fireCd = 1.4;
          } else if (e.bossPhase === 2) {
            for (let i = 0; i < 8; i++) fire(e, (Math.PI * 2 * i) / 8 + e.pattern, 240, 10, false);
            const ang = Math.atan2(player.y - e.y, player.x - e.x);
            fire(e, ang, 340, 12, false);
            fire(e, ang + 0.12, 320, 10, false);
            e.dashWind = 0.28; e.vx = toP.x * 2.8; e.vy = toP.y * 2.8;
            e.fireCd = 1.25;
          } else {
            for (let i = 0; i < 12; i++) fire(e, (Math.PI * 2 * i) / 12 + e.pattern, 280, 11, false);
            if (!e.minionDone) {
              spawnByStyle(2, director.style);
              e.minionDone = true;
              remember("Boss P3 · minion wave");
            }
            if (dist(e, player) < 130) { hurtPlayer(10); burst(e.x, e.y, "#ef4444", 16); }
            e.fireCd = 1.1;
          }
          e.pattern += 0.22;
          shake = Math.min(0.4, Math.max(shake, 0.22));
          sfxHit("boss");
        }
      }
      const spd = e.speed * (e.wind > 0 && (e.type === "chaser" || e.type === "swarm") ? 0.55 : 1);
      if ((e.type === "chaser" || e.type === "swarm") && e.wind > 0) {
        const nx = e.x + e.vx * spd * dt, ny = e.y + e.vy * spd * dt;
        if (!hitsWall(nx, e.y, e.r)) e.x = nx; else e.wind = 0;
        if (!hitsWall(e.x, ny, e.r)) e.y = ny; else e.wind = 0;
      } else {
        const nx = e.x + tx * spd * dt, ny = e.y + ty * spd * dt;
        if (!hitsWall(nx, e.y, e.r)) e.x = nx;
        if (!hitsWall(e.x, ny, e.r)) e.y = ny;
      }
      if (dist(e, player) < e.r + player.r - 2) hurtPlayer(e.type === "boss" ? 12 : e.type === "tank" ? 10 : e.type === "swarm" ? 5 : 7);
      if (dist(e, player) < 55) stats.nearMiss += dt;
    }
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (hitsWall(b.x, b.y, b.r)) b.life = 0;
      if (b.friendly) {
        for (const e of enemies) {
          if (b.hit.has(e) || dist(b, e) >= b.r + e.r) continue;
          e.hp -= b.dmg; e.hurt = 0.12; b.hit.add(e);
          const heavy = b.dmg >= 28 || e.type === "boss";
          const hs = heavy ? 0.07 : b.dmg >= 20 ? 0.045 : 0.025;
          // Cap hitstop so i-frames / feel don't stack into mush
          hitstop = Math.min(0.09, Math.max(hitstop, player.inv > 0 ? hs * 0.5 : hs));
          shake = Math.min(0.4, Math.max(shake, heavy ? 0.18 : 0.08));
          burst(e.x, e.y, e.color, heavy ? 12 : 5);
          sfxHit(heavy ? "boss" : "mid");
          if (!b.pierce) b.life = 0;
          if (e.hp <= 0) {
            score += e.score; player.kills += 1; combo += 1; comboT = 2.2;
            maxCombo = Math.max(maxCombo, combo);
            lastKillAt = roomTime;
            float(e.x, e.y, `+${e.score}`, "#fde68a");
            if (combo >= 5) float(e.x, e.y - 18, `COMBO ${combo}`, "#fbbf24");
            burst(e.x, e.y, e.color, 16); gainXp(e.xp, e.x, e.y); sfxHit("crit");
          }
        }
      } else if (dist(b, player) < b.r + player.r) { hurtPlayer(b.dmg); b.life = 0; }
    }
    bullets = bullets.filter((b) => b.life > 0);
    enemies = enemies.filter((e) => e.hp > 0);
  }

  function updateDrops(dt) {
    for (const d of drops) {
      d.life -= dt;
      if (dist(d, player) < d.r + player.r) {
        player.hp = clamp(player.hp + 30, 0, player.maxHp);
        float(player.x, player.y - 18, "+HP", "#4ade80");
        d.life = 0; beep(640, 0.05, "sine", 0.02);
      }
    }
    drops = drops.filter((d) => d.life > 0);
    for (const g of xpGems) {
      g.life -= dt;
      const d = dist(g, player);
      if (d < player.magnet) {
        const n = norm(player.x - g.x, player.y - g.y);
        g.x += n.x * 280 * dt; g.y += n.y * 280 * dt;
      } else { g.x += g.vx * dt; g.y += g.vy * dt; g.vx *= 0.95; g.vy *= 0.95; }
      if (d < player.r + 8) { addXp(g.val); g.life = 0; }
    }
    xpGems = xpGems.filter((g) => g.life > 0);
  }

  function updateFx(dt) {
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) els.banner.classList.add("hidden"); }
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt);
    hitstop = Math.max(0, hitstop - dt); chrome = Math.max(0, chrome - dt);
    levelFlash = Math.max(0, levelFlash - dt); tutorialT = Math.max(0, tutorialT - dt);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.vx *= 0.96; p.vy *= 0.96; }
    particles = particles.filter((p) => p.life > 0);
    for (const t of trails) t.life -= dt;
    trails = trails.filter((t) => t.life > 0);
    for (const f of floats) { f.y -= 30 * dt; f.t -= dt; }
    floats = floats.filter((f) => f.t > 0);
  }

  function intentIcon(intent) {
    return ({ dash: "»", shot: "●", slam: "◎", burst: "※", nova: "✦" })[intent] || "!";
  }

  function drawEnemyBody(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = e.hurt > 0 ? "#fff" : e.color;
    ctx.globalAlpha = e.hurt > 0 ? 0.7 : 1;
    const r = e.r;
    if (e.shape === "tri" || e.type === "chaser") {
      ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, r * 0.75); ctx.lineTo(-r * 0.7, -r * 0.75); ctx.closePath(); ctx.fill();
    } else if (e.shape === "square" || e.type === "tank") {
      ctx.fillRect(-r, -r, r * 2, r * 2);
    } else if (e.shape === "hex" || e.type === "elite") {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    } else if (e.shape === "dot" || e.type === "swarm") {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.6, -r * 0.3, r * 0.55, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === "boss") {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fecaca"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function updateHud() {
    const ratePct = Math.round((0.16 / player.fireRate) * 100);
    const counts = {};
    for (const id of player.cards) counts[id] = (counts[id] || 0) + 1;
    const stackHint = Object.entries(counts).filter(([, n]) => n > 1).map(([id, n]) => `${CARDS[id].name}×${n}`).slice(0, 2).join(" · ");
    els.buildLine.textContent = `ATK ${Math.round(player.dmgMul * 100)}% · RATE ${ratePct}% · SET ${player.setName}${stackHint ? " · " + stackHint : ""}`;
    if (els.skillLine) {
      const ready = player.skillCd <= 0;
      const chargePct = Math.min(100, Math.round((chargeT / 0.42) * 100));
      const skillName = player.setName === "Gunner" ? "Barrage" : player.setName === "Survivor" ? "Ward" : player.setName === "Director's Pupil" ? "Call" : "Pulse";
      els.skillLine.textContent = ready
        ? `Q ${skillName} READY · 차지 ${chargePct}%`
        : `Q ${skillName} ${player.skillCd.toFixed(1)}s · 차지 ${chargePct}%`;
    }
    if (els.modLabel) els.modLabel.textContent = `MOD ${roomMod?.name || "—"}`;
    els.roomLabel.textContent = `ROOM ${Math.min(roomIndex + 1, RUN_ROOMS.length)}/${RUN_ROOMS.length}`;
    els.scoreLabel.textContent = `SCORE ${score}`;
    els.lvLabel.textContent = `LV ${player.level}`;
    els.comboLabel.textContent = `COMBO ${combo}`;
    els.styleLabel.textContent = `STYLE ${director.style}`;
    els.hpFill.style.transform = `scaleX(${clamp(player.hp / player.maxHp, 0, 1)})`;
    els.hpText.textContent = `HP ${Math.max(0, Math.ceil(player.hp))}`;
    els.xpFill.style.transform = `scaleX(${clamp(player.xp / player.nextXp, 0, 1)})`;
    els.xpText.textContent = `XP ${player.xp}/${player.nextXp}`;
    els.tensionFill.style.transform = `scaleX(${clamp(director.intensity, 0, 1)})`;
    els.tensionText.textContent = `INTENSITY ${Math.round(director.intensity * 100)}%`;
    els.budgetChip.textContent = `budget ${Math.round(director.budget)}`;
    els.intensityText.textContent = `I=${director.intensity.toFixed(2)} · ${director.phase} · ${director.style}`;
    els.phaseChip.textContent = director.phase;
    els.phaseChip.className = "chip " + director.phase.toLowerCase();
    els.memoryText.textContent = director.memory;
    if (els.whyText) els.whyText.textContent = whyText;
  }

  function draw() {
    const ox = (Math.random() - 0.5) * shake * 16;
    const oy = (Math.random() - 0.5) * shake * 16;
    ctx.save(); ctx.translate(ox, oy);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#07111f"); g.addColorStop(1, "#12081b");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 40) { ctx.strokeStyle = "#ffffff08"; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (const w of walls) {
      ctx.fillStyle = "#1f2937"; ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = "#475569"; ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
    }
    for (const t of trails) {
      ctx.globalAlpha = t.life * 2; ctx.fillStyle = "#7dd3fc";
      ctx.beginPath(); ctx.arc(t.x, t.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (portal) {
      portal.t += 0.05;
      ctx.strokeStyle = "#5eead4"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(portal.x, portal.y, portal.r + Math.sin(portal.t * 6) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#5eead455"; ctx.beginPath(); ctx.arc(portal.x, portal.y, portal.r - 4, 0, Math.PI * 2); ctx.fill();
    }
    for (const d of drops) { ctx.fillStyle = "#4ade80"; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
    for (const gem of xpGems) { ctx.fillStyle = "#38bdf8"; ctx.beginPath(); ctx.arc(gem.x, gem.y, gem.r, 0, Math.PI * 2); ctx.fill(); }
    for (const e of enemies) {
      if (e.type === "sniper" && e.laserAim && e.telegraph > 0) {
        ctx.strokeStyle = e.fireCd <= 0.12 ? "#f87171cc" : "#a5b4fc88";
        ctx.lineWidth = e.fireCd <= 0.12 ? 3 : 1.5;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.laserAim.x, e.laserAim.y); ctx.stroke();
      }
      if (e.telegraph > 0) {
        ctx.strokeStyle = "#fbbf24aa"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 12 + e.telegraph * 25, 0, Math.PI * 2); ctx.stroke();
        if (e.type === "chaser" || e.type === "swarm") {
          const a = Math.atan2(player.y - e.y, player.x - e.x);
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90); ctx.stroke();
        }
        ctx.fillStyle = "#fde68a"; ctx.font = "800 14px Segoe UI";
        ctx.fillText(intentIcon(e.intent), e.x - 6, e.y - e.r - 16);
      }
      drawEnemyBody(e);
      ctx.fillStyle = "#0008"; ctx.fillRect(e.x - 16, e.y - e.r - 10, 32, 4);
      ctx.fillStyle = "#4ade80"; ctx.fillRect(e.x - 16, e.y - e.r - 10, 32 * clamp(e.hp / e.maxHp, 0, 1), 4);
      if (e.type === "boss") {
        ctx.fillStyle = "#fecaca"; ctx.font = "800 11px Segoe UI";
        ctx.fillText(`P${e.bossPhase || 1}`, e.x - 8, e.y - e.r - 14);
      }
    }
    for (const b of bullets) {
      ctx.fillStyle = b.charged ? "#fde68a" : b.friendly ? "#7dd3fc" : "#fda4af";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }
    if (player.blink <= 0 || Math.floor(player.blink * 20) % 2 === 0) {
      ctx.fillStyle = player.overdrive > 0 ? "#86efac" : "#38bdf8";
      ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2); ctx.fill();
      const a = Math.atan2(mouse.y - player.y, mouse.x - player.x);
      ctx.strokeStyle = "#e0f2fe"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + Math.cos(a) * 22, player.y + Math.sin(a) * 22); ctx.stroke();
      if (muzzle > 0) {
        ctx.fillStyle = `#fde68a${Math.floor(muzzle * 40).toString(16).padStart(2, "0")}`;
        ctx.beginPath(); ctx.arc(player.x + Math.cos(a) * 18, player.y + Math.sin(a) * 18, 6, 0, Math.PI * 2); ctx.fill();
      }
      if (chargeT > 0.05) {
        ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 8 + chargeT * 10, 0, Math.PI * 2 * clamp(chargeT / 0.42, 0, 1)); ctx.stroke();
      }
    }
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    for (const f of floats) {
      ctx.globalAlpha = clamp(f.t, 0, 1); ctx.fillStyle = f.color; ctx.font = "800 14px Segoe UI";
      ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#5eead4cc"; ctx.font = "800 13px Segoe UI";
    ctx.fillText(`DIRECTOR ${director.phase} · ${director.style} · ${roomMod?.name || ""}`, 36, 40);
    if (tutorialT > 0) {
      ctx.fillStyle = "#e2e8f0"; ctx.font = "700 15px Segoe UI";
      ctx.fillText("WASD · SHIFT 대시 · 홀드 차지샷 · Q 액티브", 36, 68);
    }
    if (DEMO) { ctx.fillStyle = "#fde68acc"; ctx.fillText("DEMO", 36, H - 24); }
    ctx.restore();
    if (roomMod?.fog) {
      const vg = ctx.createRadialGradient(player.x, player.y, 90, player.x, player.y, 320);
      vg.addColorStop(0, "#0000"); vg.addColorStop(1, "#020617cc");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    if (flash > 0) { ctx.fillStyle = `rgba(251,113,133,${flash * 0.35})`; ctx.fillRect(0, 0, W, H); }
    if (levelFlash > 0 || chrome > 0) {
      ctx.fillStyle = `rgba(125,211,252,${Math.max(levelFlash, chrome) * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function tick(ts) {
    if (!running) return;
    requestAnimationFrame(tick);
    if (paused) { draw(); return; }
    let dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    if (hitstop > 0) {
      // Critical: hitstop must decay here (updateFx is skipped during freeze)
      hitstop = Math.max(0, hitstop - dt);
      if (roomClearT > 0) {
        roomClearT -= dt * 0.4;
        if (roomClearT <= 0 && !portal) openPortal();
      }
      // light FX so freeze still feels alive
      shake = Math.max(0, shake - dt);
      flash = Math.max(0, flash - dt);
      draw(); updateHud();
      return;
    }

    updatePlayer(dt); updateEnemies(dt); updateBullets(dt); updateDrops(dt); updateDirector(dt); updateFx(dt);
    unstick(player);
    roomTime += dt;
    // Anti soft-lock: no kills for 28s → chip remaining foes
    if (!roomCleared && !portal && enemies.length > 0 && roomTime - lastKillAt > 28) {
      for (const e of enemies) e.hp -= Math.max(10, e.maxHp * 0.05) * dt;
      if (roomTime - lastKillAt < 28.08) {
        showBanner("DIRECTOR: 교착 해제 · 압박 완화", 1.6);
        remember("교착 감지 → 적 약화");
      }
    }

    if (!portal && enemies.length === 0 && roomIndex >= 0 && !RUN_ROOMS[roomIndex]?.safe && !RUN_ROOMS[roomIndex]?.fork) {
      if (!window.__clearArmed) {
        window.__clearArmed = true;
        roomCleared = true;
        roomClearReward(player.damageTaken === roomDmgStart);
        openPortalSoon(0.5);
      }
    }
    if (roomClearT > 0) {
      roomClearT -= dt;
      if (roomClearT <= 0 && !portal) openPortal();
    }
    if (portal && dist(player, portal) < portal.r + player.r) {
      if (roomIndex >= RUN_ROOMS.length - 1) endRun(true);
      else startRoom();
    }
    updateHud(); draw();
  }

  function startRun() {
    if (audioCtx?.state === "suspended") audioCtx.resume();
    running = true; paused = false; window.__NAN_DEMO_DONE__ = false; window.__PT_DONE__ = false;
    RUN_ROOMS = makeRooms(); // reset fork mutations each run
    els.overlay.classList.add("hidden"); els.result.classList.add("hidden");
    els.cardPick.classList.add("hidden"); els.branchPick.classList.add("hidden");
    els.traceList.innerHTML = "";
    Object.assign(player, basePlayer());
    Object.assign(director, {
      intensity: 0.2, phase: "BUILD", phaseT: 0, style: "—", prevStyle: "—",
      budget: 25, cd: 0, actions: 0, lastAction: "—", memory: "Director boot",
    });
    Object.assign(stats, {
      nearMiss: 0, damageWindow: 0,
      styleAcc: { Aggressive: 0, Cautious: 0, Mobile: 0 },
      phaseCounts: { BUILD: 0, SUSTAIN_PEAK: 0, PEAK_FADE: 0, RELAX: 0 },
      phaseTime: { BUILD: 0, SUSTAIN_PEAK: 0, PEAK_FADE: 0, RELAX: 0 },
    });
    score = 0; roomIndex = -1; nothingStreak = 0; rarePity = 0; combo = 0; maxCombo = 0; keyActions = [];
    pickQueue = 0; pendingForceRare = false;
    forkChoice = null; forkPicked = "—"; lastRoomNoHit = false; lastRoomHeavyDamage = false;
    interventionLog = []; whyText = "Director boot · Why 대기";
    chargeT = 0; muzzle = 0; roomMod = MODS.none;
    if (els.whyText) els.whyText.textContent = whyText;
    enemies = []; bullets = []; drops = []; xpGems = []; particles = []; floats = []; trails = [];
    portal = null; walls = roomWalls("arena");
    els.actionText.textContent = "Director online";
    remember("Director boot · Steam-hit lessons loaded");
    pushTrace("Completeness pass ready");
    setWhy("Why: 런 시작 · Observe 대기");
    if (PLAYTEST) {
      // Compensate for bot aim waste — still dies if routing/pacing is unfair
      player.dmgMul *= 1.2;
      player.extraIFrame = 0.85;
    }
    startedAt = performance.now(); lastTs = startedAt;
    startRoom();
    requestAnimationFrame(tick);
  }

  window.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * W;
    mouse.y = ((e.clientY - rect.top) / rect.height) * H;
  });
  canvas.addEventListener("mousedown", () => (mouse.down = true));
  window.addEventListener("mouseup", () => (mouse.down = false));
  els.startBtn.onclick = startRun;
  els.restartBtn.onclick = startRun;
  els.skipBtn.onclick = () => { pushTrace("Card skipped"); closePick(); };
  els.branchSafe.onclick = () => resolveFork("safe");
  els.branchElite.onclick = () => resolveFork("elite");

  walls = roomWalls("arena"); draw(); updateHud();
  if (BOT) setTimeout(() => els.startBtn.click(), PLAYTEST ? 300 : 600);
  window.__NAN_START__ = startRun;
})();
