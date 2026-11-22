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

  // Push-to-Talk state
  let isHoldingMic = false;
  let mediaStream = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let recordedMimeType = "audio/webm";
  let maxRecordTimer = null;

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
      const badgeClass = rm.in_combat ? "active-room-badge combat" : "active-room-badge";
      const statusText = rm.ended
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
        `สมาชิก ${rm.player_count}/${rm.max_players} คน (ออนไลน์ ${rm.online_count}) · ${rm.scene_id}`;

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
        <div style="min-width:0;">
          <div style="font-weight:700; font-size:0.9rem;"></div>
          <div style="font-size:0.74rem; color:#a69a88;"></div>
          <div>${statusChips}</div>
        </div>
      </div>
      <div class="char-bars">
        <div class="mini-stat" title="พลังชีวิต (HP): หากเหลือ 0 จะหมดสติในฉากต่อสู้">
          <div class="mini-stat-head"><span style="color:#fca5a5;">พลังชีวิต</span><strong>${me.hp}/${me.max_hp}</strong></div>
          <div class="mini-bar-track"><div class="mini-bar-fill hp" style="width:${hpPct}%"></div></div>
        </div>
        <div class="mini-stat" title="สติ (Sanity): ลดลงเมื่อเจอเหตุหลอน/ผีโจมตีจิต หากเหลือ 0 จะเสียขวัญ">
          <div class="mini-stat-head"><span style="color:#93c5fd;">สติ</span><strong>${me.sanity}/${me.max_sanity}</strong></div>
          <div class="mini-bar-track"><div class="mini-bar-fill san" style="width:${sanPct}%"></div></div>
        </div>
        <div class="mini-stat" title="โฟกัส (Focus): ใช้จ่าย 1 แต้มเพื่อใช้ท่าประจำอาชีพ (ฟื้นได้ด้วยคำสั่ง ดึงสติ)">
          <div class="mini-stat-head"><span style="color:#f3d188;">โฟกัส</span><strong>${me.focus}/${me.max_focus}</strong></div>
          <div class="mini-bar-track"><div class="mini-bar-fill foc" style="width:${focPct}%"></div></div>
        </div>
      </div>
      <div class="char-attr-strip">${attrStrip}</div>
      <details class="stat-legend compact" ${prevDetailsOpen ? "open" : ""}>
        <summary>? คำอธิบายค่าสถานะ</summary>
        <div class="stat-legend-grid">
          <div><b>BODY:</b> โจมตีกายภาพ / ป้องกัน PDEF</div>
          <div><b>PER:</b> สังเกตพิรุธและรายละเอียดรอบตัว</div>
          <div><b>INT:</b> วิเคราะห์เอกสารและหลักฐาน</div>
          <div><b>SOC:</b> เจรจาพยานและกล่อมวิญญาณ</div>
          <div><b>SPI:</b> สัมผัสคลื่นผี / ต้านพลังหลอน MDEF</div>
          <div><b>RES:</b> ต้านทานความเสียหายกายและจิต</div>
          <div><b>HP / สติ / โฟกัส:</b> เลือด / ขวัญกำลังใจ / แต้มปล่อยท่าอาชีพ</div>
        </div>
      </details>
    `;
    box.querySelector(".char-top > div > div:nth-child(1)").textContent = `${me.name} — ${me.role_name}`;
    box.querySelector(".char-top > div > div:nth-child(2)").textContent =
      `ท่า: ${me.skill?.name || "-"}`;
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
    $("hud-turn-pill").textContent = `เทิร์นฉากนี้: ${state.scene_turn_count}/${state.anti_stall_turn_limit}`;
    $("hud-quota-pill").textContent = `เสียงสด: ${state.live_tts_used}/${state.live_tts_limit}`;

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
      chip.querySelector("span").textContent = `${p.name} · ♥${p.hp} 🧠${p.sanity}`;
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
        <div class="board-node-title">${node.unlocked ? "" : "🔒 "}${node.name}</div>
        <div class="board-node-sub">${node.subtitle}</div>
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
        ? `<span style="color:${p.acted_this_round ? "#34d399" : "#fbbf24"};"> · ${p.acted_this_round ? "ลงมือแล้ว" : "รอลงมือ"}</span>`
        : "";

      row.innerHTML = `
        <img src="${p.avatar}" alt="${p.role_name}" />
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:0.86rem;"></div>
          <div style="font-size:0.74rem; color:#93a4ba;"></div>
          <div style="font-size:0.72rem; margin-top:3px;"></div>
        </div>
      `;
      row.querySelector("div > div:nth-child(1)").innerHTML =
        `${p.name}${isMe ? " (คุณ)" : ""} ${onlineChip}`;
      row.querySelector("div > div:nth-child(2)").innerHTML =
        `${p.role_name}${combatBadge}`;
      row.querySelector("div > div:nth-child(3)").textContent =
        `HP ${p.hp}/${p.max_hp} · สติ ${p.sanity}/${p.max_sanity} · โฟกัส ${p.focus}/${p.max_focus}` +
        (statusText ? ` · [${statusText}]` : "");
      playersList.appendChild(row);
    });

    const tq = state.turn_queue || { busy: false, owner_id: null, owner_name: null, stage: "", items: [] };
    const queueBar = $("turn-queue-bar");
    if (queueBar) {
      if (tq.busy || (tq.items && tq.items.length > 0)) {
        const waitingText =
          tq.items && tq.items.length > 0
            ? `คิวรอ: ${tq.items.map((it, idx) => `${idx + 1}. ${it.player_name}`).join(", ")}`
            : "ยังไม่มีคนต่อคิว";
        queueBar.textContent = `⏳ ${tq.stage || `กำลังถึงคิวของ ${tq.owner_name || "ผู้เล่น"}`} · ${waitingText}`;
        queueBar.classList.remove("hidden");
      } else {
        queueBar.classList.add("hidden");
      }
    }

    const micBlockedByQueue = Boolean(
      (state.mic_locked && state.active_speaker_sid !== socket?.id) ||
        (tq.busy && state.active_speaker_sid !== socket?.id)
    );
    updateMicButtonUI(micBlockedByQueue, tq.owner_name || state.active_speaker_name);

    const inCombat = Boolean(state.combat?.active);
    const myId = myPlayer?.id;
    const iAmHoldingOrQueued = Boolean(
      myId && (tq.owner_id === myId || (tq.items || []).some((it) => it.player_id === myId))
    );
    const controlsPanel = document.querySelector(".controls-panel");
    const chatInput = $("chat-input");
    const chatSubmit = $("chat-form")?.querySelector('button[type="submit"]');
    if (controlsPanel) controlsPanel.classList.toggle("combat-locked", inCombat);

    const lockChatForMe = inCombat || iAmHoldingOrQueued;
    if (chatInput) {
      chatInput.disabled = lockChatForMe;
      chatInput.placeholder = inCombat
        ? "โหมดต่อสู้: ปิดการพิมพ์ชั่วคราว กรุณากดปุ่มคำสั่งต่อสู้ด้านบน..."
        : iAmHoldingOrQueued
          ? "คำสั่งของคุณกำลังประมวลผลหรืออยู่ในคิวแล้ว กรุณารอสักครู่..."
          : tq.busy
            ? `ขณะนี้ ${tq.owner_name || "ผู้เล่นอื่น"} กำลังใช้เทิร์น (พิมพ์เพื่อเข้าคิวรอได้)...`
            : "หรือพิมพ์คำถาม / การกระทำของคุณที่นี่...";
    }
    if (chatSubmit) {
      chatSubmit.disabled = lockChatForMe;
      chatSubmit.textContent = iAmHoldingOrQueued
        ? "อยู่ในคิวแล้ว..."
        : tq.busy
          ? "เข้าคิวส่ง"
          : "ส่งคำสั่ง";
    }
    document.querySelectorAll(".quick-chip").forEach((chip) => {
      chip.disabled = lockChatForMe;
    });
  }

  function updateMicButtonUI(lockedByOther, holderName = "") {
    const btn = $("ptt-btn");
    const label = $("ptt-label");
    if (currentState?.combat?.active) {
      btn.classList.remove("recording", "locked-other");
      btn.disabled = true;
      label.textContent = "ปิดไมค์ชั่วคราวระหว่างต่อสู้";
      return;
    }
    if (isHoldingMic) {
      btn.classList.add("recording");
      btn.classList.remove("locked-other");
      btn.disabled = false;
      label.textContent = "กำลังบันทึกเสียง... ปล่อยเพื่อส่งให้ AI DM";
      return;
    }
    btn.classList.remove("recording");
    if (lockedByOther) {
      btn.classList.add("locked-other");
      btn.disabled = true;
      label.textContent = `รอคิว: ${holderName || "ผู้เล่นอื่น"} กำลังใช้งาน...`;
    } else {
      btn.classList.remove("locked-other");
      btn.disabled = false;
      label.textContent = "กดค้างเพื่อพูด (หรือกด Space ค้าง)";
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

  async function startPushToTalk() {
    if (isHoldingMic || !socket) return;
    if (currentState?.combat?.active) {
      showToast("ขณะนี้อยู่ในฉากต่อสู้ ปิดการใช้ไมค์ชั่วคราว กรุณากดปุ่มคำสั่งต่อสู้ด้านบน");
      return;
    }
    if (
      (currentState?.mic_locked && currentState?.active_speaker_sid !== socket.id) ||
      (currentState?.turn_queue?.busy && currentState?.active_speaker_sid !== socket.id)
    ) {
      showToast(`รอคิว: ${currentState.turn_queue?.owner_name || currentState.active_speaker_name || "ผู้เล่นอื่น"} กำลังใช้งานอยู่`);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showToast("เบราว์เซอร์นี้ไม่รองรับการอัดเสียง กรุณาพิมพ์ในช่องแชทแทน");
      return;
    }

    isHoldingMic = true;
    updateMicButtonUI(false);
    socket.emit("mic:start", {});

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isHoldingMic) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
        socket.emit("mic:cancel", {});
        return;
      }

      const mime = pickSupportedMimeType();
      recordedMimeType = mime || "audio/webm";
      audioChunks = [];
      mediaRecorder = mime
        ? new MediaRecorder(mediaStream, { mimeType: mime })
        : new MediaRecorder(mediaStream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        if (mediaStream) {
          mediaStream.getTracks().forEach((t) => t.stop());
          mediaStream = null;
        }
        const blob = new Blob(audioChunks, { type: recordedMimeType });
        audioChunks = [];
        if (blob.size < 450) {
          socket.emit("mic:cancel", {});
          showToast("กดค้างนานกว่านี้อีกนิดขณะพูดนะครับ");
          return;
        }
        const arrayBuf = await blob.arrayBuffer();
        socket.emit("mic:audio", {
          audio: arrayBuf,
          mime_type: blob.type || recordedMimeType,
        });
      };

      mediaRecorder.start(200);
      maxRecordTimer = setTimeout(() => {
        if (isHoldingMic) stopPushToTalk();
      }, 15000);
    } catch (err) {
      isHoldingMic = false;
      updateMicButtonUI(false);
      socket.emit("mic:cancel", {});
      showToast(`ไม่สามารถเปิดไมโครโฟนได้: ${err.message}`);
    }
  }

  function stopPushToTalk() {
    if (!isHoldingMic) return;
    isHoldingMic = false;
    if (maxRecordTimer) {
      clearTimeout(maxRecordTimer);
      maxRecordTimer = null;
    }
    updateMicButtonUI(false);
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else if (socket) {
      socket.emit("mic:cancel", {});
    }
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

    socket.on("dice:result", (roll) => {
      audioFX?.playSfx(roll.tier === "failure" ? "dice_fail" : "dice_success");
      const banner = $("dice-result-banner");
      banner.className = `dice-result-banner ${roll.tier}`;
      banner.textContent =
        `🎲 ${roll.rolled_by} ทอย ${roll.stat}: D20 (${roll.d20}) + โบนัส (${roll.modifier}) = ${roll.total} / DC ${roll.dc} → ${roll.tier_label}`;
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

  function syncAudioControlsUI() {
    const voiceSlider = $("voice-vol-slider");
    const voiceBtn = $("voice-mute-btn");
    const ambSlider = $("ambient-vol-slider");
    const ambBtn = $("ambient-mute-btn");

    if (voiceSlider) voiceSlider.value = String(Math.round(voiceVolume * 100));
    if (voiceBtn) {
      const mutedVoice = isMuted || voiceVolume <= 0;
      voiceBtn.textContent = mutedVoice ? "🔇 พูด" : "🔊 พูด";
      voiceBtn.classList.toggle("muted", mutedVoice);
    }
    if (ambSlider) ambSlider.value = String(Math.round(ambientVolume * 100));
    if (ambBtn) {
      const ambOn = audioFX ? audioFX.ambientEnabled && ambientVolume > 0 : false;
      ambBtn.textContent = ambOn ? "🌧 ฝน/SFX" : "🔇 ฝน/SFX";
      ambBtn.classList.toggle("muted", !ambOn);
    }
  }

  function setupUIEvents() {
    syncAudioControlsUI();

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
      startPushToTalk();
    });
    window.addEventListener("pointerup", () => stopPushToTalk());
    window.addEventListener("pointercancel", () => stopPushToTalk());

    window.addEventListener("keydown", (e) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ($("game-screen").classList.contains("hidden")) return;
      if (currentState?.combat?.active || currentState?.turn_queue?.busy) return;
      e.preventDefault();
      startPushToTalk();
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") stopPushToTalk();
    });
  }

  setupUIEvents();
  loadScenarioMeta();
})();
