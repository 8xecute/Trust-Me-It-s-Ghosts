(() => {
  "use strict";

  let socket = null;
  let scenarioMeta = null;
  let selectedRoleId = "investigator";
  let takenRoles = [];
  let myPlayer = null;
  let currentState = null;
  let isMuted = false;
  let voiceVolume = Math.max(0, Math.min(1, parseFloat(localStorage.getItem("ai_dm_voice_vol") ?? "1")));
  let ambientVolume = Math.max(0, Math.min(1, parseFloat(localStorage.getItem("ai_dm_ambient_vol") ?? "0.7")));
  let roomLookupTimer = null;
  let roomsPollTimer = null;

  const audioFX = window.AudioFXEngine ? new window.AudioFXEngine() : null;
  if (audioFX) {
    audioFX.setAmbientVolume(ambientVolume);
    audioFX.setSfxVolume(Math.min(1, ambientVolume + 0.1));
  }

  // Audio Queue state
  const audioQueue = [];
  let isPlayingQueue = false;
  let activeAudioEl = null;
  let activeSubtitleTimer = null;
  let pendingGapTimer = null;

  // Push-to-Talk & Click-to-Talk (Web Speech API th-TH primary + Gemini Audio STT fallback)
  const SpeechRecognitionCtor =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let speechRecognition = null;
  let useWebSpeechFallback = !SpeechRecognitionCtor;
  let isHoldingMic = false;
  let isToggleListening = false;
  let micPressStartTime = 0;
  let preSpeechInputText = "";
  let webSpeechHadResult = false;
  let isTranscribingMic = false;
  let mediaStream = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let recordedMimeType = "audio/webm";
  let maxRecordTimer = null;
  let stopTailTimer = null;

  const $ = (id) => document.getElementById(id);

  function normalizeRoomCode(val) {
    return (val || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 16) || "BANANA01";
  }

  function tokenStorageKey(roomCode) {
    return `ai_dm_token_${normalizeRoomCode(roomCode)}`;
  }

  function showToast(msg) {
    const container = $("toast-container");
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  function unlockBrowserAudio() {
    try {
      audioFX?.unlock();
      const silent = new Audio();
      silent.muted = true;
      silent.play().catch(() => {});
    } catch (_err) {
      // Ignore autoplay probe errors
    }
  }

  function pickSupportedMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return "";
  }

  async function refreshRoomRoles(roomCode) {
    const norm = normalizeRoomCode(roomCode);
    const savedToken = localStorage.getItem(tokenStorageKey(norm));
    $("reconnect-banner").classList.toggle("hidden", !savedToken);

    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(norm)}/roles`);
      const data = await res.json();
      takenRoles = data.taken_roles || [];
    } catch (_err) {
      takenRoles = [];
    }
    if (scenarioMeta?.roles) {
      renderRoles(scenarioMeta.roles);
    }
  }

  function renderActiveRooms(rooms) {
    const listEl = $("active-rooms-list");
    if (!listEl) return;
    const selectedCode = normalizeRoomCode($("room-code").value);

    if (!rooms || rooms.length === 0) {
      listEl.innerHTML =
        '<div class="active-rooms-empty">ยังไม่มีห้องเปิดอยู่ตอนนี้ — พิมพ์รหัสห้องใหม่แล้วกดเข้าห้องเพื่อสร้างได้เลย</div>';
      return;
    }

    listEl.innerHTML = "";
    rooms.forEach((rm) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `active-room-card ${rm.room_code === selectedCode ? "selected" : ""}`;
      const isEmptyRoom = rm.online_count === 0;
      const badgeClass = rm.in_combat ? "active-room-badge combat" : "active-room-badge";
      const statusText = isEmptyRoom
        ? "ห้องว่าง"
        : rm.ended
          ? "จบช่วง A แล้ว"
          : rm.in_combat
            ? "กำลังสู้ผี"
            : rm.started
              ? `กำลังเล่น (${rm.scene_id})`
              : "รอเริ่มคดี";

      btn.innerHTML = `
        <div class="active-room-top">
          <span class="active-room-code"></span>
          <span class="${badgeClass}">${statusText}</span>
        </div>
        <div class="active-room-meta"></div>
      `;
      btn.querySelector(".active-room-code").textContent = rm.room_code;
      btn.querySelector(".active-room-meta").textContent =
        isEmptyRoom && rm.closing_in_seconds != null
          ? `ไม่มีผู้เล่นออนไลน์ · ปิดอัตโนมัติใน ${rm.closing_in_seconds} วิ · ${rm.scene_id}`
          : `สมาชิก ${rm.player_count}/${rm.max_players} คน (ออนไลน์ ${rm.online_count}) · ${rm.scene_id}`;

      btn.addEventListener("click", () => {
        $("room-code").value = rm.room_code;
        refreshRoomRoles(rm.room_code);
        listEl.querySelectorAll(".active-room-card").forEach((c) => c.classList.remove("selected"));
        btn.classList.add("selected");
      });
      listEl.appendChild(btn);
    });
  }

  async function loadActiveRooms() {
    if ($("lobby-screen").classList.contains("hidden")) return;
    try {
      const res = await fetch("/api/rooms");
      if (!res.ok) return;
      const data = await res.json();
      renderActiveRooms(data.rooms || []);
    } catch (_err) {
      // Ignore transient poll errors during Render cold start
    }
  }

  async function loadScenarioMeta(attempt = 1) {
    const statusEl = $("lobby-server-status");
    try {
      const res = await fetch("/api/scenario");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      scenarioMeta = await res.json();
      if (statusEl) {
        statusEl.textContent = "เซิร์ฟเวอร์พร้อมใช้งาน";
        statusEl.className = "pill pill-ok";
      }
      updateApiPill(scenarioMeta);
      await Promise.all([refreshRoomRoles($("room-code").value), loadActiveRooms()]);
      if (!roomsPollTimer) {
        roomsPollTimer = setInterval(loadActiveRooms, 8000);
      }
    } catch (err) {
      if (attempt < 6) {
        if (statusEl) {
          statusEl.textContent = `กำลังปลุกเซิร์ฟเวอร์ (ครั้งที่ ${attempt}/5)...`;
          statusEl.className = "pill pill-warn";
        }
        setTimeout(() => loadScenarioMeta(attempt + 1), 2500);
      } else {
        if (statusEl) {
          statusEl.textContent = "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ";
          statusEl.className = "pill pill-warn";
        }
        $("role-grid").innerHTML = `<div class="role-loading">โหลดข้อมูลไม่สำเร็จ: ${err.message}</div>`;
      }
    }
  }

  function renderRoles(roles) {
    const grid = $("role-grid");
    grid.innerHTML = "";

    const takenSet = new Set(takenRoles || []);
    if (takenSet.has(selectedRoleId)) {
      const firstOpen = roles.find((r) => !takenSet.has(r.id));
      if (firstOpen) selectedRoleId = firstOpen.id;
    } else if (!roles.some((r) => r.id === selectedRoleId) && roles.length) {
      selectedRoleId = roles[0].id;
    }

    roles.forEach((role) => {
      const isTaken = takenSet.has(role.id);
      const card = document.createElement("div");
      card.className = `role-card ${role.id === selectedRoleId ? "selected" : ""} ${isTaken ? "taken" : ""}`;
      card.dataset.roleId = role.id;

      const statSummary = Object.entries(role.stats || {})
        .filter(([, val]) => val >= 3)
        .map(([k, val]) => `${k} ${val}`)
        .join(" · ");

      card.innerHTML = `
        <img class="role-avatar" src="${role.avatar}" alt="${role.name}" />
        <div>
          <div class="role-name">${role.name}</div>
          <div class="role-sub">${role.subtitle}</div>
          <div class="role-stats">${statSummary} · ท่า: ${role.skill?.name || "-"}</div>
          ${isTaken ? '<span class="role-taken-tag">มีเพื่อนเลือกแล้ว</span>' : ""}
        </div>
      `;
      card.addEventListener("click", () => {
        if (isTaken) {
          showToast(`อาชีพ '${role.name}' มีเพื่อนในห้องเลือกไปแล้ว`);
          return;
        }
        selectedRoleId = role.id;
        grid.querySelectorAll(".role-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
      });
      grid.appendChild(card);
    });
  }

  function updateApiPill(status) {
    const pill = $("hud-api-pill");
    if (!pill) return;
    const groqOk = Boolean(status?.groq_configured);
    const geminiOk = Boolean(status?.gemini_configured);
    if (groqOk && geminiOk) {
      pill.textContent = "Voice + Gemini AI พร้อม";
      pill.className = "pill pill-ok";
    } else if (geminiOk) {
      pill.textContent = "Gemini AI พร้อม (พิมพ์แชท)";
      pill.className = "pill pill-ok";
    } else {
      pill.textContent = "โหมดทดสอบออฟไลน์ (ยังไม่ใส่ API Key)";
      pill.className = "pill pill-warn";
    }
  }

  function appendTranscriptLog(speaker, text, kind = "dialogue") {
    const logEl = $("transcript-log");
    const item = document.createElement("div");
    item.className = `log-entry kind-${kind}`;
    item.innerHTML = `
      <div class="log-speaker"></div>
      <div class="log-text"></div>
    `;
    item.querySelector(".log-speaker").textContent = speaker;
    item.querySelector(".log-text").textContent = text;
    logEl.appendChild(item);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function statusTagThai(code) {
    if (code === "ROOTED") return "พันธนาการ (ถอยทัพไม่ได้ 1 รอบ)";
    if (code === "SHAKEN") return "หวาดกลัว (กล่อม/ใช้ท่าอาชีพไม่ได้ 1 รอบ)";
    return code;
  }

  const STAT_EXPLANATIONS = {
    BODY: "BODY (ร่างกาย): ใช้โจมตีกายภาพและต้านทานแรงปะทะ (PDEF)",
    PER: "PER (การสังเกต): ใช้จับพิรุธและสังเกตรายละเอียดในฉาก",
    INT: "INT (เชาวน์ปัญญา): ใช้ตรวจเอกสารและเชื่อมโยงหลักฐาน",
    SOC: "SOC (การเข้าสังคม): ใช้เจรจา ซักถาม และกล่อมวิญญาณ",
    SPI: "SPI (จิตวิญญาณ): ใช้สัมผัสคลื่นผี กล่อม และต้านพลังหลอน (MDEF)",
    RES: "RES (ความต้านทาน): ใช้ลดความเสี่ยงและป้องกันดาเมจทั้งกายและจิต",
  };

  function renderMyCharacter(me) {
    const box = $("my-character-bar");
    if (!me) {
      box.innerHTML = "";
      return;
    }
    const prevDetailsOpen = Boolean(box.querySelector(".stat-legend")?.open);
    const statusChips = (me.statuses || [])
      .map((st) => `<span class="status-chip">${statusTagThai(st)}</span>`)
      .join("");

    const hpPct = Math.max(0, Math.min(100, (me.hp / Math.max(1, me.max_hp)) * 100));
    const sanPct = Math.max(0, Math.min(100, (me.sanity / Math.max(1, me.max_sanity)) * 100));
    const focPct = Math.max(0, Math.min(100, (me.focus / Math.max(1, me.max_focus)) * 100));
    const attrStrip = ["BODY", "PER", "INT", "SOC", "SPI", "RES"]
      .map(
        (k) =>
          `<div class="attr-pill" title="${STAT_EXPLANATIONS[k]}">${k}<b>${me.stats?.[k] ?? 0}</b></div>`
      )
      .join("");

    box.innerHTML = `
      <div class="char-top">
        <img src="${me.avatar}" alt="${me.role_name}" />
        <div class="char-head-info">
          <div class="char-name"></div>
          <div class="char-skill"></div>
          <div class="char-statuses">${statusChips}</div>
        </div>
      </div>
      <div class="char-bars">
        <div class="mini-stat" title="พลังชีวิต (HP): หากเหลือ 0 จะหมดสติในฉากต่อสู้">
          <div class="mini-stat-head"><span class="mini-label-hp">พลังชีวิต</span><strong>${me.hp}/${me.max_hp}</strong></div>
          <div class="mini-bar-track"><div class="mini-bar-fill hp" style="width:${hpPct}%"></div></div>
        </div>
        <div class="mini-stat" title="สติ (Sanity): ลดลงเมื่อเจอเหตุหลอน/ผีโจมตีจิต หากเหลือ 0 จะเสียขวัญ">
          <div class="mini-stat-head"><span class="mini-label-san">สติ</span><strong>${me.sanity}/${me.max_sanity}</strong></div>
          <div class="mini-bar-track"><div class="mini-bar-fill san" style="width:${sanPct}%"></div></div>
        </div>
        <div class="mini-stat" title="โฟกัส (Focus): ใช้จ่าย 1 แต้มเพื่อใช้ท่าประจำอาชีพ (ฟื้นได้ด้วยคำสั่ง ดึงสติ)">
          <div class="mini-stat-head"><span class="mini-label-foc">โฟกัส</span><strong>${me.focus}/${me.max_focus}</strong></div>
          <div class="mini-bar-track"><div class="mini-bar-fill foc" style="width:${focPct}%"></div></div>
        </div>
      </div>
      <div class="char-attr-strip">${attrStrip}</div>
      <details class="stat-legend compact" ${prevDetailsOpen ? "open" : ""}>
        <summary>คำอธิบายค่าสถานะ</summary>
        <div class="stat-legend-grid">
          <div><b>BODY</b> โจมตีกายภาพและป้องกัน PDEF</div>
          <div><b>PER</b> สังเกตพิรุธและรายละเอียดรอบตัว</div>
          <div><b>INT</b> วิเคราะห์เอกสารและหลักฐาน</div>
          <div><b>SOC</b> เจรจาพยานและกล่อมวิญญาณ</div>
          <div><b>SPI</b> สัมผัสคลื่นผีและต้านพลังหลอน MDEF</div>
          <div><b>RES</b> ต้านทานความเสียหายกายและจิต</div>
          <div><b>HP / สติ / โฟกัส</b> เลือด / ขวัญกำลังใจ / แต้มใช้ท่า</div>
        </div>
      </details>
    `;
    box.querySelector(".char-name").textContent = `${me.name} — ${me.role_name}`;
    box.querySelector(".char-skill").textContent = `ท่าประจำอาชีพ: ${me.skill?.name || "-"}`;
  }

  function renderCombatUI(state, me) {
    const combat = state.combat;
    const active = Boolean(combat && combat.active);
    $("combat-stage").classList.toggle("hidden", !active);
    $("combat-actions-bar").classList.toggle("hidden", !active);
    $("npc-layer").classList.toggle("hidden", active);

    if (!active) return;

    $("scene-bg-img").src = combat.background_image;
    $("combat-enemy-name").textContent = combat.enemy_name;
    $("combat-round-badge").textContent =
      `รอบที่ ${combat.round_number} • ${combat.phase === "players" ? "ตาผู้สืบสวน" : "ตาผีเงาจมน้ำ"}`;

    const tags = [];
    if (combat.ghost_exposed) tags.push("เปิดจุดอ่อน (+2 ทอย)");
    if (combat.party_shield > 0) tags.push(`เกราะทีม +${combat.party_shield}`);
    $("combat-tags").textContent = tags.join(" · ");

    $("combat-hp-text").textContent = `${combat.enemy_hp} / ${combat.enemy_max_hp}`;
    $("combat-hp-fill").style.width = `${(combat.enemy_hp / Math.max(1, combat.enemy_max_hp)) * 100}%`;

    $("combat-soothe-text").textContent = `${combat.soothe_progress} / ${combat.soothe_goal}`;
    $("combat-soothe-fill").style.width = `${(combat.soothe_progress / Math.max(1, combat.soothe_goal)) * 100}%`;

    $("combat-retreat-text").textContent = `${combat.retreat_progress} / ${combat.retreat_goal}`;
    $("combat-retreat-fill").style.width = `${(combat.retreat_progress / Math.max(1, combat.retreat_goal)) * 100}%`;

    const lastLog = (combat.combat_log || []).slice(-1)[0] || "";
    $("combat-last-log").textContent = lastLog;

    if (me?.skill) {
      $("combat-skill-name").textContent = me.skill.name;
      $("combat-skill-desc").textContent = `${me.skill.description} (1 โฟกัส)`;
    }

    const conscious = me && me.hp > 0 && me.sanity > 0;
    const canAct = Boolean(conscious && !me.acted_this_round && combat.phase === "players");
    const isShaken = Boolean(me?.statuses?.includes("SHAKEN"));
    const isRooted = Boolean(me?.statuses?.includes("ROOTED"));

    let statusMsg = "เลือก 1 การกระทำของคุณในรอบนี้ (กดปุ่มคำสั่งด้านล่าง)";
    if (!conscious) statusMsg = "คุณหมดสติหรือเสียขวัญแล้ว รอเพื่อนร่วมทีมช่วยเหลือ";
    else if (combat.phase !== "players") statusMsg = "กำลังถึงตาของผีเงาจมน้ำ...";
    else if (me.acted_this_round) statusMsg = "คุณลงมือรอบนี้แล้ว รอเพื่อนร่วมทีมคนอื่น...";
    $("combat-turn-status").textContent = statusMsg;

    document.querySelectorAll(".combat-btn").forEach((btn) => {
      const act = btn.dataset.action;
      let disabled = !canAct;
      if (act === "soothe" && isShaken) disabled = true;
      if (act === "role_skill" && (isShaken || (me?.focus ?? 0) < 1)) disabled = true;
      if (act === "retreat" && isRooted) disabled = true;
      btn.disabled = disabled;
    });
  }

  function renderState(state) {
    currentState = state;
    const me = (state.players || []).find((p) => p.id === myPlayer?.id || p.sid === socket?.id);
    $("game-screen").classList.toggle("in-combat", Boolean(state.combat?.active));

    $("hud-room-code").textContent = state.room_code;
    $("hud-scene-title").textContent = state.combat?.active
      ? `เผชิญหน้า: ${state.combat.enemy_name} (ปากทางสวนกล้วย)`
      : state.scene_title;
    $("hud-scene-subtitle").textContent = state.combat?.active
      ? "ปะทะแบบผลัดเทิร์น 1 Action ต่อรอบ — เลือกว่าจะขับไล่ กล่อม หรือเปิดทางถอย"
      : state.scene_subtitle;
    $("hud-turn-pill").textContent = `เทิร์นฉากนี้ ${state.scene_turn_count}`;
    $("hud-quota-pill").textContent = `เสียงสด ${state.live_tts_used}/${state.live_tts_limit}`;

    if (!state.combat?.active) {
      $("scene-bg-img").src = state.background_image;
    }
    const prasertNpc = (state.npcs || []).find((n) => n.name === "ประเสริฐ");
    $("npc-card-prasert").classList.toggle("hidden", !prasertNpc || !prasertNpc.visible);

    // Overlays
    $("start-overlay").classList.toggle("hidden", Boolean(state.started));
    const endingOverlay = $("ending-overlay");
    if (state.ending) {
      endingOverlay.classList.remove("hidden");
      const badge = $("ending-badge");
      badge.textContent =
        state.ending.type === "true_ending" ? "TRUE ENDING • ACT A" : "BAD ENDING • ACT A";
      badge.className = `ending-badge ${state.ending.type === "true_ending" ? "true" : "bad"}`;
      $("ending-title").textContent = state.ending.title;
      $("ending-summary").textContent = state.ending.summary;
    } else {
      endingOverlay.classList.add("hidden");
    }

    renderMyCharacter(me);
    renderCombatUI(state, me);

    // Party strip
    const partyStrip = $("party-strip");
    partyStrip.innerHTML = "";
    (state.players || []).forEach((p) => {
      const chip = document.createElement("div");
      chip.className = "party-chip";
      chip.innerHTML = `<img src="${p.avatar}" alt="${p.role_name}" /><span></span>`;
      chip.querySelector("span").textContent = `${p.name} · HP ${p.hp} · สติ ${p.sanity}`;
      partyStrip.appendChild(chip);
    });

    // Board Map
    const nodesLayer = $("board-nodes-layer");
    nodesLayer.innerHTML = "";
    let activeNodeName = state.board_node;
    (state.board_nodes || []).forEach((node) => {
      const isActive = node.id === state.board_node;
      if (isActive) activeNodeName = node.name;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `board-node-btn ${isActive ? "active" : ""} ${node.unlocked ? "" : "locked"}`;
      btn.style.left = `${node.x}%`;
      btn.style.top = `${node.y}%`;
      btn.disabled = !node.unlocked || Boolean(state.combat?.active);
      btn.innerHTML = `
        <div class="board-node-title">${node.name}</div>
        <div class="board-node-sub">${node.unlocked ? node.subtitle : `${node.subtitle} (ยังไม่ปลดล็อก)`}</div>
      `;
      btn.addEventListener("click", () => {
        if (!socket || !node.unlocked) return;
        socket.emit("board:move", { node_id: node.id });
      });
      nodesLayer.appendChild(btn);
    });
    $("board-current-label").textContent = `ตำแหน่งปัจจุบัน: ${activeNodeName}`;

    // Dice Check panel
    const dicePanel = $("dice-panel");
    if (state.pending_check && !state.combat?.active) {
      const chk = state.pending_check;
      const mod = me?.stats?.[chk.stat] ?? 0;
      $("dice-check-title").textContent = chk.title;
      $("dice-check-meta").textContent = `ค่าสถานะ: ${chk.stat} (โบนัสของคุณ +${mod}) | เป้าหมาย DC ${chk.dc}`;
      dicePanel.classList.remove("hidden");
    } else {
      dicePanel.classList.add("hidden");
    }

    // Quick prompts
    const promptsWrap = $("quick-prompts");
    promptsWrap.innerHTML = "";
    if (!state.ending && !state.combat?.active) {
      (state.quick_prompts || []).forEach((promptText) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "quick-chip";
        chip.textContent = promptText;
        chip.addEventListener("click", () => sendTextMessage(promptText));
        promptsWrap.appendChild(chip);
      });
    }

    // Clues, Items, Trust
    const trustVal = state.npc_trust?.["ประเสริฐ"] ?? 0;
    const trustPct = ((trustVal + 3) / 8) * 100;
    $("trust-value-label").textContent =
      trustVal > 0 ? `เชื่อใจ (+${trustVal})` : trustVal < 0 ? `ระแวง (${trustVal})` : "ปกติ (0)";
    $("trust-fill").style.width = `${Math.max(5, Math.min(100, trustPct))}%`;

    const clues = state.clues_found || [];
    $("clues-count").textContent = String(clues.length);
    const cluesList = $("clues-list");
    cluesList.innerHTML = clues.length
      ? ""
      : `<li class="empty-note">ยังไม่มีเบาะแส — ลองสอบถามประเสริฐหรือสังเกตพื้นที่</li>`;
    clues.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong></strong><span></span>`;
      li.querySelector("strong").textContent = c.label;
      li.querySelector("span").textContent = c.detail;
      cluesList.appendChild(li);
    });

    const items = state.inventory || [];
    $("items-count").textContent = String(items.length);
    const itemsList = $("items-list");
    itemsList.innerHTML = items.length
      ? ""
      : `<li class="empty-note">ยังไม่มีเอกสารหรือไอเท็ม</li>`;
    items.forEach((it) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong></strong><span></span>`;
      li.querySelector("strong").textContent = it.label;
      li.querySelector("span").textContent = it.detail;
      itemsList.appendChild(li);
    });

    // Players list (full TRPG sheets)
    const playersList = $("players-list");
    playersList.innerHTML = "";
    (state.players || []).forEach((p) => {
      const row = document.createElement("div");
      row.className = "player-row";
      const isMe = p.id === myPlayer?.id;
      const statusText = (p.statuses || []).map(statusTagThai).join(", ");
      const onlineChip = p.connected
        ? '<span class="status-chip online">ออนไลน์</span>'
        : '<span class="status-chip offline">หลุดชั่วคราว</span>';
      const combatBadge = state.combat?.active
        ? `<span class="${p.acted_this_round ? "combat-acted" : "combat-waiting"}"> · ${p.acted_this_round ? "ลงมือแล้ว" : "รอลงมือ"}</span>`
        : "";

      row.innerHTML = `
        <img src="${p.avatar}" alt="${p.role_name}" />
        <div class="player-meta">
          <div class="player-name-row"></div>
          <div class="player-role-row"></div>
          <div class="player-stat-row"></div>
        </div>
      `;
      row.querySelector(".player-name-row").innerHTML =
        `${p.name}${isMe ? " (คุณ)" : ""} ${onlineChip}`;
      row.querySelector(".player-role-row").innerHTML =
        `${p.role_name}${combatBadge}`;
      row.querySelector(".player-stat-row").textContent =
        `HP ${p.hp}/${p.max_hp} · สติ ${p.sanity}/${p.max_sanity} · โฟกัส ${p.focus}/${p.max_focus}` +
        (statusText ? ` · ${statusText}` : "");
      playersList.appendChild(row);
    });

    const tq = state.turn_queue || { busy: false, owner_id: null, owner_name: null, stage: "", items: [] };
    const queueBar = $("turn-queue-bar");
    if (queueBar) {
      if (tq.busy || (tq.items && tq.items.length > 0)) {
        const waitingText =
          tq.items && tq.items.length > 0
            ? `คิวรอ: ${tq.items.map((it, idx) => `${idx + 1}. ${it.player_name}`).join(", ")}`
            : "ไม่มีคิวรอ";
        queueBar.textContent = `${tq.stage || `กำลังถึงคิวของ ${tq.owner_name || "ผู้เล่น"}`} · ${waitingText}`;
        queueBar.classList.remove("hidden");
      } else {
        queueBar.classList.add("hidden");
      }
    }

    const inCombat = Boolean(state.combat?.active);
    if (inCombat && (isHoldingMic || isToggleListening)) {
      stopListeningNow();
    }
    const myId = myPlayer?.id;
    const iAmHoldingOrQueued = Boolean(
      myId && (tq.owner_id === myId || (tq.items || []).some((it) => it.player_id === myId))
    );
    updateMicButtonUI(iAmHoldingOrQueued);

    const controlsPanel = document.querySelector(".controls-panel");
    const chatInput = $("chat-input");
    const chatSubmit = $("chat-form")?.querySelector('button[type="submit"]');
    if (controlsPanel) controlsPanel.classList.toggle("combat-locked", inCombat);

    const lockChatForMe = inCombat || iAmHoldingOrQueued;
    if (chatInput) {
      chatInput.disabled = lockChatForMe;
      chatInput.placeholder = inCombat
        ? "โหมดต่อสู้: เลือกคำสั่งต่อสู้ด้านบน"
        : iAmHoldingOrQueued
          ? "คำสั่งอยู่ในคิว กำลังประมวลผล"
          : tq.busy
            ? `${tq.owner_name || "ผู้เล่นอื่น"} กำลังใช้เทิร์น — พิมพ์เพื่อต่อคิวได้`
            : "พิมพ์คำถามหรือการกระทำ";
    }
    if (chatSubmit) {
      chatSubmit.disabled = lockChatForMe;
      chatSubmit.textContent = iAmHoldingOrQueued
        ? "อยู่ในคิว"
        : tq.busy
          ? "ต่อคิวส่ง"
          : "ส่งคำสั่ง";
    }
    document.querySelectorAll(".quick-chip").forEach((chip) => {
      chip.disabled = lockChatForMe;
    });
  }

  function updateMicButtonUI(lockedByOwnTurn = false) {
    const btn = $("ptt-btn");
    const label = $("ptt-label");
    if (currentState?.combat?.active) {
      btn.classList.remove("recording", "locked-other");
      btn.disabled = true;
      label.textContent = "ปิดไมค์ชั่วคราวระหว่างต่อสู้";
      return;
    }
    if (isToggleListening) {
      btn.classList.add("recording");
      btn.classList.remove("locked-other");
      btn.disabled = false;
      label.textContent = "กำลังฟังเสียงไทย... (คลิกอีกครั้งหรือกด Space เพื่อหยุด)";
      return;
    }
    if (isHoldingMic) {
      btn.classList.add("recording");
      btn.classList.remove("locked-other");
      btn.disabled = false;
      label.textContent = useWebSpeechFallback
        ? "กำลังบันทึกเสียง... ปล่อยเพื่อส่งถอดเสียง (หรือคลิกสั้นเพื่อเปิดค้าง)"
        : "กำลังฟังเสียงไทยแบบเรียลไทม์... ปล่อยเมื่อพูดจบ";
      return;
    }
    btn.classList.remove("recording");
    if (isTranscribingMic) {
      btn.classList.add("locked-other");
      btn.disabled = true;
      label.textContent = "กำลังถอดเสียงเป็นข้อความ...";
      return;
    }
    if (lockedByOwnTurn) {
      btn.classList.add("locked-other");
      btn.disabled = true;
      label.textContent = "คำสั่งของคุณอยู่ในคิวแล้ว...";
    } else {
      btn.classList.remove("locked-other");
      btn.disabled = false;
      label.textContent = "คลิกหรือกดค้างเพื่อพูด → ลงช่องแชท (Space)";
    }
  }

  function setSpeakingVisual(speaker, active) {
    $("audio-wave").classList.toggle("hidden", !active);
    const prasertWrap = $("npc-card-prasert");
    if (prasertWrap) {
      prasertWrap.classList.toggle("speaking", active && speaker === "ประเสริฐ");
    }
    const ghostWrap = $("ghost-sprite-wrap");
    if (ghostWrap) {
      ghostWrap.classList.toggle("speaking", active && speaker === "ผีเงาจมน้ำ");
    }
    audioFX?.setDucking(active);
  }

  function clearAudioQueue() {
    audioQueue.length = 0;
    if (activeAudioEl) {
      activeAudioEl.pause();
      activeAudioEl = null;
    }
    if (activeSubtitleTimer) {
      clearTimeout(activeSubtitleTimer);
      activeSubtitleTimer = null;
    }
    if (pendingGapTimer) {
      clearTimeout(pendingGapTimer);
      pendingGapTimer = null;
    }
    isPlayingQueue = false;
    setSpeakingVisual("", false);
  }

  function enqueueAudioEvent(ev) {
    audioQueue.push(ev);
    if (!isPlayingQueue) {
      processAudioQueue();
    }
  }

  function scheduleNextQueueItem(prevSpeaker, wasFiller) {
    if (audioQueue.length === 0) {
      processAudioQueue();
      return;
    }
    const nextSpeaker = audioQueue[0]?.character || "DM";
    const gapMs = wasFiller ? 350 : nextSpeaker !== prevSpeaker ? 950 : 750;
    setSpeakingVisual(prevSpeaker, false);
    pendingGapTimer = setTimeout(() => {
      pendingGapTimer = null;
      processAudioQueue();
    }, gapMs);
  }

  function processAudioQueue() {
    if (audioQueue.length === 0) {
      isPlayingQueue = false;
      setSpeakingVisual("", false);
      return;
    }

    isPlayingQueue = true;
    const ev = audioQueue.shift();
    const speaker = ev.character || "DM";
    const subtitle = ev.subtitle || "";

    if (ev.dialogue_id === "a2_radio_dm_intro" || ev.dialogue_id === "a2_radio_voice") {
      audioFX?.playSfx("radio_static");
    }

    const avatarEl = $("subtitle-avatar");
    if (avatarEl) {
      if (speaker === "ประเสริฐ") {
        avatarEl.src = "/assets/characters/prasert.png";
        avatarEl.classList.remove("hidden");
      } else if (speaker === "ผีเงาจมน้ำ") {
        avatarEl.src = "/assets/characters/drowned_echo.png";
        avatarEl.classList.remove("hidden");
      } else {
        avatarEl.classList.add("hidden");
      }
    }

    $("subtitle-speaker").textContent = speaker;
    $("subtitle-text").textContent = subtitle;
    setSpeakingVisual(speaker, true);

    let src = null;
    if (ev.audio_url) {
      src = ev.audio_url;
    } else if (ev.audio_base64) {
      src = `data:${ev.mime_type || "audio/wav"};base64,${ev.audio_base64}`;
    }

    if (!isMuted && voiceVolume > 0 && src) {
      const audio = new Audio(src);
      audio.volume = voiceVolume;
      activeAudioEl = audio;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (activeSubtitleTimer) {
          clearTimeout(activeSubtitleTimer);
          activeSubtitleTimer = null;
        }
        activeAudioEl = null;
        scheduleNextQueueItem(speaker, Boolean(ev.is_filler));
      };
      audio.addEventListener("ended", finish);
      audio.addEventListener("error", finish);
      activeSubtitleTimer = setTimeout(finish, 45000);
      audio.play().catch(() => {
        const readMs = ev.is_filler ? 800 : Math.min(6000, Math.max(2200, subtitle.length * 55));
        activeSubtitleTimer = setTimeout(finish, readMs);
      });
    } else {
      const readMs = ev.is_filler ? 700 : Math.min(6000, Math.max(2000, subtitle.length * 55));
      activeSubtitleTimer = setTimeout(() => {
        activeSubtitleTimer = null;
        scheduleNextQueueItem(speaker, Boolean(ev.is_filler));
      }, readMs);
    }
  }

  function sendTextMessage(text) {
    if (currentState?.combat?.active) {
      showToast("ขณะนี้อยู่ในฉากต่อสู้ ปิดการพิมพ์ชั่วคราว กรุณากดปุ่มคำสั่งต่อสู้ด้านบน");
      return;
    }
    const clean = (text || "").trim();
    if (!clean || !socket) return;
    if (!currentState?.started) {
      socket.emit("game:start", {});
    }
    socket.emit("chat:message", { text: clean });
  }

  function _focusChatInputEnd() {
    const input = $("chat-input");
    if (input && !input.disabled && input.value.trim()) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }

  function startWebSpeechRecognition() {
    if (!SpeechRecognitionCtor || useWebSpeechFallback) return false;
    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "th-TH";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      const input = $("chat-input");
      preSpeechInputText = input && input.value.trim() ? input.value.trim() : "";
      webSpeechHadResult = false;
      speechRecognition = recognition;

      recognition.onresult = (event) => {
        let finals = "";
        let interims = "";
        for (let i = 0; i < event.results.length; i += 1) {
          const res = event.results[i];
          const txt = res[0]?.transcript || "";
          if (res.isFinal) {
            finals += `${txt} `;
          } else {
            interims += txt;
          }
        }
        const combinedSpeech = `${finals} ${interims}`.trim().replace(/\s+/g, " ");
        if (combinedSpeech) webSpeechHadResult = true;
        if (input && !input.disabled) {
          const nextVal = preSpeechInputText
            ? combinedSpeech
              ? `${preSpeechInputText} ${combinedSpeech}`
              : preSpeechInputText
            : combinedSpeech;
          input.value = nextVal.slice(0, 300);
        }
      };

      recognition.onerror = (event) => {
        const errCode = event?.error || "";
        if (errCode === "aborted") return;
        isHoldingMic = false;
        isToggleListening = false;
        if (maxRecordTimer) {
          clearTimeout(maxRecordTimer);
          maxRecordTimer = null;
        }
        speechRecognition = null;
        audioFX?.setDucking(isPlayingQueue);
        updateMicButtonUI(false);

        if (errCode === "no-speech") {
          showToast("ไม่ได้ยินเสียงพูดชัดเจน กรุณาลองพูดใหม่อีกครั้ง");
        } else if (
          errCode === "network" ||
          errCode === "service-not-allowed" ||
          errCode === "language-not-supported"
        ) {
          useWebSpeechFallback = true;
          showToast("สลับเป็นโหมดถอดเสียงผ่าน Gemini Audio STT — กดพูดอีกครั้งได้เลย");
        } else if (errCode === "not-allowed" || errCode === "audio-capture") {
          showToast("ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตสิทธิ์ไมค์ในเบราว์เซอร์");
        } else {
          useWebSpeechFallback = true;
          showToast("ระบบถอดเสียงเบราว์เซอร์ขัดข้อง สลับเป็น Gemini Audio STT ให้แล้ว");
        }
      };

      recognition.onend = () => {
        const wasActive = speechRecognition === recognition;
        if (wasActive) {
          speechRecognition = null;
          isHoldingMic = false;
          isToggleListening = false;
          if (maxRecordTimer) {
            clearTimeout(maxRecordTimer);
            maxRecordTimer = null;
          }
          audioFX?.setDucking(isPlayingQueue);
          updateMicButtonUI(false);
          if (webSpeechHadResult) {
            _focusChatInputEnd();
            showToast("ถอดเสียงลงช่องแชทแล้ว — ตรวจสอบแล้วกด 'ส่งคำสั่ง' หรือ Enter");
          }
        }
      };

      recognition.start();
      maxRecordTimer = setTimeout(() => {
        if (isHoldingMic || isToggleListening) stopListeningNow();
      }, 20000);
      return true;
    } catch (_err) {
      useWebSpeechFallback = true;
      speechRecognition = null;
      return false;
    }
  }

  async function startPushToTalk() {
    if (isHoldingMic || isToggleListening || isTranscribingMic || !socket) return;
    if (currentState?.combat?.active) {
      showToast("ขณะนี้อยู่ในฉากต่อสู้ ปิดการใช้ไมค์ชั่วคราว กรุณากดปุ่มคำสั่งต่อสู้ด้านบน");
      return;
    }
    const tq = currentState?.turn_queue || {};
    const myId = myPlayer?.id;
    const iAmHoldingOrQueued = Boolean(
      myId && (tq.owner_id === myId || (tq.items || []).some((it) => it.player_id === myId))
    );
    if (iAmHoldingOrQueued) {
      showToast("คำสั่งของคุณกำลังประมวลผลหรืออยู่ในคิวแล้ว กรุณารอสักครู่");
      return;
    }

    if (stopTailTimer) {
      clearTimeout(stopTailTimer);
      stopTailTimer = null;
    }
    isHoldingMic = true;
    updateMicButtonUI(false);
    audioFX?.setDucking(true);

    // Tier 1: Real-time Google Thai Web Speech API (streams straight to #chat-input)
    if (!useWebSpeechFallback && SpeechRecognitionCtor && startWebSpeechRecognition()) {
      return;
    }

    // Tier 2 Fallback: MediaRecorder -> Backend Gemini Multimodal Audio STT / Groq Whisper
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      isHoldingMic = false;
      audioFX?.setDucking(isPlayingQueue);
      updateMicButtonUI(false);
      showToast("เบราว์เซอร์นี้ไม่รองรับการอัดเสียง กรุณาพิมพ์ในช่องแชทแทน");
      return;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      if (!isHoldingMic && !isToggleListening) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
        audioFX?.setDucking(isPlayingQueue);
        return;
      }

      const mime = pickSupportedMimeType();
      recordedMimeType = mime || "audio/webm";
      audioChunks = [];
      const recorderOpts = mime
        ? { mimeType: mime, audioBitsPerSecond: 64000 }
        : { audioBitsPerSecond: 64000 };
      mediaRecorder = new MediaRecorder(mediaStream, recorderOpts);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        if (mediaStream) {
          mediaStream.getTracks().forEach((t) => t.stop());
          mediaStream = null;
        }
        audioFX?.setDucking(isPlayingQueue);
        const blob = new Blob(audioChunks, { type: recordedMimeType });
        audioChunks = [];
        if (blob.size < 450) {
          isTranscribingMic = false;
          updateMicButtonUI(false);
          showToast("พูดนานกว่านี้อีกนิดนะครับ หรือใช้คลิกครั้งเดียวเพื่อเปิดไมค์ค้าง");
          return;
        }
        isTranscribingMic = true;
        updateMicButtonUI(false);
        const arrayBuf = await blob.arrayBuffer();
        socket.emit("mic:transcribe", {
          audio: arrayBuf,
          mime_type: blob.type || recordedMimeType,
        });
      };

      mediaRecorder.start(200);
      maxRecordTimer = setTimeout(() => {
        if (isHoldingMic || isToggleListening) stopListeningNow();
      }, 20000);
    } catch (err) {
      isHoldingMic = false;
      isToggleListening = false;
      isTranscribingMic = false;
      audioFX?.setDucking(isPlayingQueue);
      updateMicButtonUI(false);
      showToast(`ไม่สามารถเปิดไมโครโฟนได้: ${err.message}`);
    }
  }

  function stopListeningNow() {
    isHoldingMic = false;
    isToggleListening = false;
    if (maxRecordTimer) {
      clearTimeout(maxRecordTimer);
      maxRecordTimer = null;
    }
    if (stopTailTimer) {
      clearTimeout(stopTailTimer);
      stopTailTimer = null;
    }

    if (speechRecognition) {
      const activeRec = speechRecognition;
      // Delay ~200ms so Web Speech API finalizes the trailing Thai syllable
      stopTailTimer = setTimeout(() => {
        stopTailTimer = null;
        try {
          activeRec.stop();
        } catch (_err) {
          speechRecognition = null;
          audioFX?.setDucking(isPlayingQueue);
          updateMicButtonUI(false);
        }
      }, 200);
      updateMicButtonUI(false);
      return;
    }

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      isTranscribingMic = true;
      updateMicButtonUI(false);
      // Capture trailing ~250ms so the final Thai syllable isn't clipped on key/mouse release
      stopTailTimer = setTimeout(() => {
        stopTailTimer = null;
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        } else {
          isTranscribingMic = false;
          audioFX?.setDucking(isPlayingQueue);
          updateMicButtonUI(false);
        }
      }, 250);
    } else {
      isTranscribingMic = false;
      audioFX?.setDucking(isPlayingQueue);
      updateMicButtonUI(false);
    }
  }

  function handleMicPressStart() {
    if (isToggleListening) {
      stopListeningNow();
      return;
    }
    if (isHoldingMic || isTranscribingMic) return;
    micPressStartTime = Date.now();
    startPushToTalk();
  }

  function handleMicRelease() {
    if (!isHoldingMic) return;
    const elapsed = Date.now() - micPressStartTime;
    if (elapsed < 300) {
      // Quick click (<300ms): keep listening hands-free until clicked again
      isHoldingMic = false;
      isToggleListening = true;
      updateMicButtonUI(false);
      return;
    }
    stopListeningNow();
  }

  function connectAndJoin(playerName, roomCode, roleId) {
    if (socket) socket.disconnect();
    const normCode = normalizeRoomCode(roomCode);
    const savedToken = localStorage.getItem(tokenStorageKey(normCode));

    socket = io({
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1200,
    });

    socket.on("connect", () => {
      socket.emit("room:join", {
        player_name: playerName,
        room_code: normCode,
        role_id: roleId,
        player_token: savedToken || null,
      });
    });

    socket.on("connect_error", () => {
      showToast("กำลังเชื่อมต่อเซิร์ฟเวอร์... หากเพิ่งเปิดบน Render อาจใช้เวลาสักครู่");
    });

    socket.on("room:join_error", (err) => {
      showToast(err.message || "ไม่สามารถเข้าห้องได้");
      takenRoles = err.taken_roles || [];
      if (scenarioMeta?.roles) renderRoles(scenarioMeta.roles);
      socket.disconnect();
    });

    socket.on("room:joined", (payload) => {
      myPlayer = payload.player;
      if (payload.player_token) {
        localStorage.setItem(tokenStorageKey(payload.state.room_code), payload.player_token);
      }
      if (payload.reconnected) {
        showToast(`เชื่อมต่อกลับเป็น ${payload.player.name} (${payload.player.role_name}) แล้ว`);
      }
      updateApiPill(payload.api_status);
      $("lobby-screen").classList.add("hidden");
      $("game-screen").classList.remove("hidden");

      const logEl = $("transcript-log");
      logEl.innerHTML = "";
      (payload.history || []).forEach((h) => {
        appendTranscriptLog(h.speaker, h.text, h.kind);
      });
      renderState(payload.state);
    });

    socket.on("room:state", (state) => {
      renderState(state);
    });

    socket.on("player:transcript", (msg) => {
      appendTranscriptLog(`${msg.speaker} (${msg.role_name})`, msg.text, "player");
    });

    socket.on("dm:audio", (ev) => {
      if (!ev.is_filler && ev.subtitle) {
        appendTranscriptLog(ev.character || "DM", ev.subtitle, ev.mode || "dialogue");
      }
      enqueueAudioEvent(ev);
    });

    socket.on("dm:thinking", (data) => {
      $("thinking-status").textContent = data.active ? data.stage || "กำลังคิด..." : "";
    });

    socket.on("mic:locked", (data) => {
      if (data.sid !== socket.id) {
        updateMicButtonUI(true, data.speaker_name);
      }
    });

    socket.on("mic:unlocked", () => {
      updateMicButtonUI(false);
    });

    socket.on("mic:denied", (data) => {
      if (isHoldingMic) {
        isHoldingMic = false;
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      }
      updateMicButtonUI(true, data.holder_name);
      showToast(`ไมค์ถูกใช้งานโดย ${data.holder_name} อยู่`);
    });

    socket.on("mic:transcript", (data) => {
      isTranscribingMic = false;
      const tq = currentState?.turn_queue || {};
      const myId = myPlayer?.id;
      const iAmHoldingOrQueued = Boolean(
        myId && (tq.owner_id === myId || (tq.items || []).some((it) => it.player_id === myId))
      );
      updateMicButtonUI(iAmHoldingOrQueued);

      if (!data?.ok) {
        if (data?.error) showToast(data.error);
        return;
      }
      const text = (data.text || "").trim();
      if (!text) return;

      const input = $("chat-input");
      if (input && !input.disabled) {
        const existing = input.value.trim();
        const combined = existing ? `${existing} ${text}` : text;
        input.value = combined.slice(0, 300);
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
      showToast("ถอดเสียงลงช่องแชทแล้ว — ตรวจสอบแล้วกด 'ส่งคำสั่ง' หรือ Enter");
    });

    socket.on("dice:result", (roll) => {
      audioFX?.playSfx(roll.tier === "failure" ? "dice_fail" : "dice_success");
      const banner = $("dice-result-banner");
      banner.className = `dice-result-banner ${roll.tier}`;
      banner.textContent =
        `${roll.rolled_by} ทอย ${roll.stat}: D20 (${roll.d20}) + โบนัส (${roll.modifier}) = ${roll.total} / DC ${roll.dc} — ${roll.tier_label}`;
      banner.classList.remove("hidden");
      appendTranscriptLog(
        "ผลทอย D20",
        `${roll.rolled_by} ทอย ${roll.title} ได้ ${roll.total} (D20:${roll.d20}+${roll.modifier}) vs DC ${roll.dc} — ${roll.tier_label}`,
        "hint"
      );
    });

    socket.on("combat:sfx", (data) => {
      if (data?.sfx) audioFX?.playSfx(data.sfx);
    });

    socket.on("room:reset_done", (payload) => {
      clearAudioQueue();
      $("dice-result-banner").classList.add("hidden");
      $("subtitle-speaker").textContent = "ระบบ";
      $("subtitle-text").textContent = "เริ่มห้องใหม่แล้ว กด 'เริ่มบทนำ ACT A' เพื่อเริ่มต้น";
      const logEl = $("transcript-log");
      logEl.innerHTML = "";
      (payload.history || []).forEach((h) => {
        appendTranscriptLog(h.speaker, h.text, h.kind);
      });
      showToast("รีเซ็ตห้องเพื่อเริ่ม ACT A ใหม่แล้ว");
    });

    socket.on("dm:error", (err) => {
      showToast(err.message || "เกิดข้อผิดพลาด");
    });
  }

  const SVG_SPEAKER_ON = '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>';
  const SVG_SPEAKER_OFF = '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>';
  const SVG_RAIN_ON = '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M8 19v2" /><path d="M12 17v4" /><path d="M16 19v2" /></svg>';

  function syncAudioControlsUI() {
    const voiceSlider = $("voice-vol-slider");
    const voiceBtn = $("voice-mute-btn");
    const ambSlider = $("ambient-vol-slider");
    const ambBtn = $("ambient-mute-btn");

    if (voiceSlider) voiceSlider.value = String(Math.round(voiceVolume * 100));
    if (voiceBtn) {
      const mutedVoice = isMuted || voiceVolume <= 0;
      voiceBtn.innerHTML = `${mutedVoice ? SVG_SPEAKER_OFF : SVG_SPEAKER_ON}<span>เสียงพูด</span>`;
      voiceBtn.classList.toggle("muted", mutedVoice);
    }
    if (ambSlider) ambSlider.value = String(Math.round(ambientVolume * 100));
    if (ambBtn) {
      const ambOn = audioFX ? audioFX.ambientEnabled && ambientVolume > 0 : false;
      ambBtn.innerHTML = `${ambOn ? SVG_RAIN_ON : SVG_SPEAKER_OFF}<span>บรรยากาศ</span>`;
      ambBtn.classList.toggle("muted", !ambOn);
    }
  }

  function setupUIEvents() {
    syncAudioControlsUI();
    const playerNameInput = $("player-name");
    if (playerNameInput) {
      playerNameInput.value = "";
      window.addEventListener("pageshow", () => {
        playerNameInput.value = "";
      });
    }

    $("refresh-rooms-btn")?.addEventListener("click", () => {
      loadActiveRooms();
    });

    $("random-room-btn").addEventListener("click", () => {
      const num = Math.floor(10 + Math.random() * 89);
      $("room-code").value = `GHOST${num}`;
      refreshRoomRoles($("room-code").value);
    });

    $("room-code").addEventListener("input", (e) => {
      clearTimeout(roomLookupTimer);
      roomLookupTimer = setTimeout(() => refreshRoomRoles(e.target.value), 250);
    });

    $("join-form").addEventListener("submit", (e) => {
      e.preventDefault();
      unlockBrowserAudio();
      const playerName = $("player-name").value.trim() || "ผู้สืบสวน";
      const roomCode = $("room-code").value.trim() || "BANANA01";
      connectAndJoin(playerName, roomCode, selectedRoleId);
    });

    $("copy-room-btn").addEventListener("click", async () => {
      if (!currentState?.room_code) return;
      try {
        await navigator.clipboard.writeText(currentState.room_code);
        showToast(`คัดลอกรหัสห้อง ${currentState.room_code} แล้ว`);
      } catch (_err) {
        showToast(`รหัสห้องคือ ${currentState.room_code}`);
      }
    });

    $("start-game-btn").addEventListener("click", () => {
      unlockBrowserAudio();
      socket?.emit("game:start", {});
    });

    $("ambient-mute-btn")?.addEventListener("click", () => {
      unlockBrowserAudio();
      audioFX?.toggleAmbient();
      syncAudioControlsUI();
    });

    $("ambient-vol-slider")?.addEventListener("input", (e) => {
      unlockBrowserAudio();
      ambientVolume = Math.max(0, Math.min(1, Number(e.target.value) / 100));
      localStorage.setItem("ai_dm_ambient_vol", String(ambientVolume));
      if (audioFX) {
        if (ambientVolume > 0 && !audioFX.ambientEnabled) audioFX.setAmbientEnabled(true);
        audioFX.setAmbientVolume(ambientVolume);
        audioFX.setSfxVolume(Math.min(1, ambientVolume + 0.1));
      }
      syncAudioControlsUI();
    });

    $("voice-mute-btn")?.addEventListener("click", () => {
      isMuted = !isMuted;
      if (activeAudioEl) {
        activeAudioEl.volume = isMuted ? 0 : voiceVolume;
      }
      syncAudioControlsUI();
    });

    $("voice-vol-slider")?.addEventListener("input", (e) => {
      voiceVolume = Math.max(0, Math.min(1, Number(e.target.value) / 100));
      localStorage.setItem("ai_dm_voice_vol", String(voiceVolume));
      if (voiceVolume > 0 && isMuted) isMuted = false;
      if (activeAudioEl) {
        activeAudioEl.volume = isMuted ? 0 : voiceVolume;
      }
      syncAudioControlsUI();
    });

    $("demo-combat-btn").addEventListener("click", () => {
      unlockBrowserAudio();
      document.querySelector('.stage-tab[data-view="scene"]')?.click();
      socket?.emit("combat:start_demo", {});
    });

    $("reset-room-btn").addEventListener("click", () => {
      socket?.emit("room:reset", {});
    });

    $("ending-reset-btn").addEventListener("click", () => {
      socket?.emit("room:reset", {});
    });

    $("roll-dice-btn").addEventListener("click", () => {
      audioFX?.playSfx("dice_roll");
      socket?.emit("dice:roll", {});
    });

    document.querySelectorAll(".combat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const actionId = btn.dataset.action;
        if (!actionId || !socket) return;
        socket.emit("combat:action", { action_id: actionId });
      });
    });

    $("chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (speechRecognition) {
        try {
          speechRecognition.abort();
        } catch (_err) {
          // ignore
        }
        speechRecognition = null;
      }
      if (isHoldingMic || isToggleListening) {
        isHoldingMic = false;
        isToggleListening = false;
        if (maxRecordTimer) {
          clearTimeout(maxRecordTimer);
          maxRecordTimer = null;
        }
        audioFX?.setDucking(isPlayingQueue);
        updateMicButtonUI(false);
      }
      const input = $("chat-input");
      const val = input.value.trim();
      if (!val) return;
      input.value = "";
      sendTextMessage(val);
    });

    document.querySelectorAll(".stage-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const view = tab.dataset.view;
        document.querySelectorAll(".stage-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        $("scene-view").classList.toggle("hidden", view !== "scene");
        $("board-view").classList.toggle("hidden", view !== "board");
      });
    });

    document.querySelectorAll(".journal-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;
        document.querySelectorAll(".journal-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".journal-pane").forEach((pane) => {
          pane.classList.toggle("active", pane.id === `tab-${target}`);
        });
      });
    });

    const pttBtn = $("ptt-btn");
    pttBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handleMicPressStart();
    });
    window.addEventListener("pointerup", () => handleMicRelease());
    window.addEventListener("pointercancel", () => handleMicRelease());

    window.addEventListener("keydown", (e) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ($("game-screen").classList.contains("hidden")) return;
      if (currentState?.combat?.active) return;
      e.preventDefault();
      handleMicPressStart();
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") handleMicRelease();
    });
  }

  setupUIEvents();
  loadScenarioMeta();
})();
