(() => {
  "use strict";

  let socket = null;
  let scenarioMeta = null;
  let selectedRoleId = "investigator";
  let selectedStartAct = "A";
  let takenRoles = [];
  let myPlayer = null;
  let currentState = null;
  let renderedNpcSignature = "";
  let renderedBoardAct = "";
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

  // Audio Queue & 2D Physical Dice Animation state
  const audioQueue = [];
  let isPlayingQueue = false;
  let activeAudioEl = null;
  let activeSubtitleTimer = null;
  let activeSubtitleFinishFn = null;
  let pendingGapTimer = null;
  let isDiceRolling = false;
  let activeDiceAnimFrame = null;
  let diceAutoCloseTimer = null;
  let diceRollRevealTimer = null;

  // Dossier filtering & mobile tabbed navigation state
  let activeDossierSubtab = "clues";
  let activeClueCategory = "all";
  let clueSearchQuery = "";
  let cluesExpandAll = false;
  let cluesHydrated = false;
  const knownClueIds = new Set();
  const recentClueIds = new Set();
  const expandedClueIds = new Set();
  const collapsedClueIds = new Set();
  let unreadClueCount = 0;
  let activeMobileTab = "play";

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

  const NPC_DISPLAY_LABELS = {
    "ประเสริฐ": "ผู้ใหญ่ประเสริฐ",
    "วิชัย": "วิชัย (ผู้ช่วยผู้ใหญ่)",
    "ต้น": "ต้น (อาสาสมัคร)",
    "ยายบุญมี": "ยายบุญมี (ผู้ดูแลศาล)",
    "แม่แก้ว (นางตานี)": "แม่แก้ว (นางตานี)",
    "ดล": "ดล (พยาน/ผู้สูญหาย)",
    "ผีเงาจมน้ำ": "ผีเงาจมน้ำ",
  };

  const SPEAKER_AVATARS = {
    "ประเสริฐ": "/assets/characters/prasert.png",
    "วิชัย": "/assets/characters/wichai.png",
    "ต้น": "/assets/characters/ton.png",
    "ดล": "/assets/characters/ton.png",
    "แม่แก้ว (นางตานี)": "/assets/characters/drowned_echo.png",
    "ผีเงาจมน้ำ": "/assets/characters/drowned_echo.png",
  };

  const CLUE_CATEGORY_META = {
    missing: { label: "คนหาย", cls: "cat-missing" },
    location: { label: "สถานที่", cls: "cat-location" },
    witness: { label: "พยาน/พิรุธ", cls: "cat-witness" },
    occult: { label: "ลี้ลับ", cls: "cat-occult" },
  };

  const CLUE_CATEGORY_BY_ID = {
    missing_names: "missing",
    report_timeline_gap: "missing",
    don_house_location: "missing",
    hostages_found: "missing",
    banana_grove_area: "location",
    headman_files_exist: "location",
    location_headman_house: "location",
    map_two_layers: "location",
    flood_waterway_clue: "location",
    flood_near_grove_clue: "location",
    double_track_clue: "location",
    cart_tracks_to_house: "location",
    evac_gap_discovered: "location",
    flood_timeline_confirmed: "location",
    flood_truth_disclosed: "location",
    prasert_nervous_clue: "witness",
    witnesses_at_house: "witness",
    wichai_hand_scratch: "witness",
    wichai_land_role: "witness",
    wichai_suspected_tell: "witness",
    wichai_evasive_clue: "witness",
    wichai_flood_survivor: "witness",
    ton_saw_person_at_grove: "witness",
    ton_black_bundle_clue: "witness",
    wichai_cart_suspect: "witness",
    don_table_found: "witness",
    don_notebook_found: "witness",
    land_price_pattern: "witness",
    knows_wichai_saved: "witness",
    wichai_kidnapper_confirmed: "witness",
    wichai_debt_evidence: "witness",
    wichai_confronted: "witness",
    kaew_mention: "occult",
    radio_still_alive: "occult",
    radio_no_recording: "occult",
    radio_memory_echo: "occult",
    radio_supernatural_chill: "occult",
    flood_photo_seen: "occult",
    photo_water_anomaly: "occult",
    black_thread_clue: "occult",
    spirit_echo_vision: "occult",
    boonmee_thread_warning: "occult",
    shrine_three_names: "occult",
    shrine_binding_core: "occult",
    kaew_coerced_truth: "occult",
    ritual_bracelet_core: "occult",
    ritual_plan_prepared: "occult",
    ritual_stopped: "occult",
    kaew_reconciled: "occult",
  };

  function getClueCategory(clue) {
    if (clue?.id && CLUE_CATEGORY_BY_ID[clue.id]) return CLUE_CATEGORY_BY_ID[clue.id];
    const txt = `${clue?.label || ""} ${clue?.detail || ""}`;
    if (/(ผี|วิญญาณ|วิทยุ|หยดน้ำ|แม่แก้ว|ชุดเขียว|ขนลุก|ลี้ลับ)/.test(txt)) return "occult";
    if (/(บ้าน|แผนที่|สวนกล้วย|ประตูน้ำ|ลำน้ำ|ทางแยก|พิกัด)/.test(txt)) return "location";
    if (/(คนหาย|รายชื่อ|ดล|นิด|เพิ่ม|เวลาหาย)/.test(txt)) return "missing";
    return "witness";
  }

  function resetDossierTracking() {
    cluesHydrated = false;
    knownClueIds.clear();
    recentClueIds.clear();
    expandedClueIds.clear();
    collapsedClueIds.clear();
    unreadClueCount = 0;
  }

  function setDossierSubtab(subtab) {
    activeDossierSubtab = subtab || "clues";
    document.querySelectorAll(".dossier-subtab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.subtab === activeDossierSubtab);
    });
    document.querySelectorAll(".dossier-subpane").forEach((pane) => {
      pane.classList.toggle("active", pane.id === `dossier-pane-${activeDossierSubtab}`);
    });
  }

  function updateMobileBadges(state) {
    const playDot = $("mobile-badge-play");
    if (playDot) {
      const alertPlay = Boolean(state?.pending_check || state?.combat?.active);
      playDot.classList.toggle("hidden", !alertPlay);
    }
    const cluesBadge = $("mobile-badge-clues");
    if (cluesBadge) {
      const total = (state?.clues_found || []).length;
      if (unreadClueCount > 0) {
        cluesBadge.textContent = `+${unreadClueCount}`;
        cluesBadge.classList.remove("hidden");
        cluesBadge.classList.add("is-new");
      } else if (total > 0) {
        cluesBadge.textContent = String(total);
        cluesBadge.classList.remove("hidden", "is-new");
      } else {
        cluesBadge.classList.add("hidden");
      }
    }
  }

  function setMobileTab(tabName) {
    activeMobileTab = tabName || "play";
    const screen = $("game-screen");
    if (screen) screen.dataset.mobileTab = activeMobileTab;
    document.querySelectorAll(".mobile-nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mobileTab === activeMobileTab);
    });

    if (activeMobileTab === "play") {
      document.querySelector('.stage-tab[data-view="scene"]')?.click();
    } else if (activeMobileTab === "board") {
      document.querySelector('.stage-tab[data-view="board"]')?.click();
    } else if (activeMobileTab === "clues") {
      document.querySelector('.journal-tab[data-tab="clues"]')?.click();
      if (unreadClueCount > 0) {
        unreadClueCount = 0;
        updateMobileBadges(currentState);
      }
    } else if (activeMobileTab === "party") {
      const activeJournal = document.querySelector(".journal-tab.active")?.dataset.tab;
      if (!activeJournal || activeJournal === "clues") {
        document.querySelector('.journal-tab[data-tab="players"]')?.click();
      }
    }

    const topbar = document.querySelector(".topbar");
    const toggleBtn = $("mobile-topbar-toggle");
    if (topbar?.classList.contains("mobile-drawer-open")) {
      topbar.classList.remove("mobile-drawer-open");
      toggleBtn?.setAttribute("aria-expanded", "false");
    }
  }

  function renderCluesDossier(clues, act) {
    const countEl = $("clues-count");
    const listEl = $("clues-list");
    const expandBtn = $("clue-expand-all-btn");
    if (!listEl) return;

    if (countEl) countEl.textContent = String(clues.length);

    if (!cluesHydrated) {
      clues.forEach((c) => knownClueIds.add(c.id));
      cluesHydrated = true;
    } else {
      let addedCount = 0;
      clues.forEach((c) => {
        if (!knownClueIds.has(c.id)) {
          knownClueIds.add(c.id);
          recentClueIds.add(c.id);
          expandedClueIds.add(c.id);
          collapsedClueIds.delete(c.id);
          addedCount += 1;
        }
      });
      if (addedCount > 0 && activeMobileTab !== "clues") {
        unreadClueCount += addedCount;
      }
    }

    const catCounts = { all: clues.length, missing: 0, location: 0, witness: 0, occult: 0 };
    clues.forEach((c) => {
      const cat = getClueCategory(c);
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });

    const catLabels = {
      all: "ทั้งหมด",
      missing: "คนหาย",
      location: "สถานที่",
      witness: "พยาน/พิรุธ",
      occult: "ลี้ลับ",
    };
    document.querySelectorAll("#clue-filter-chips .clue-filter-chip").forEach((chip) => {
      const cat = chip.dataset.cat || "all";
      const n = catCounts[cat] || 0;
      chip.textContent = n > 0 ? `${catLabels[cat]} (${n})` : catLabels[cat];
      chip.classList.toggle("active", activeClueCategory === cat);
    });

    if (expandBtn) {
      expandBtn.textContent = cluesExpandAll ? "ย่อทั้งหมด" : "ขยายทั้งหมด";
      expandBtn.classList.toggle("hidden", clues.length === 0);
    }

    const q = clueSearchQuery.trim().toLowerCase();
    const newestFirst = [...clues].reverse();
    const filtered = newestFirst.filter((c) => {
      const cat = getClueCategory(c);
      if (activeClueCategory !== "all" && cat !== activeClueCategory) return false;
      if (q && !`${c.label} ${c.detail}`.toLowerCase().includes(q)) return false;
      return true;
    });

    const emptyCluesHint =
      act === "B"
        ? "ยังไม่มีเบาะแส — สอบถามวิชัย/ต้น หรือตรวจแผนที่และผนังภาพเก่า"
        : "ยังไม่มีเบาะแส — ลองสอบถามประเสริฐหรือสังเกตพื้นที่";

    if (filtered.length === 0) {
      const emptyMsg = clues.length === 0 ? emptyCluesHint : "ไม่พบเบาะแสตามตัวกรองนี้";
      listEl.innerHTML = `<li class="empty-note">${emptyMsg}</li>`;
      return;
    }

    listEl.innerHTML = "";
    filtered.forEach((c, idx) => {
      const cat = getClueCategory(c);
      const catMeta = CLUE_CATEGORY_META[cat] || CLUE_CATEGORY_META.witness;
      const isRecent = recentClueIds.has(c.id);
      const defaultOpen = idx === 0 && collapsedClueIds.size === 0 && !q;
      const isExpanded =
        !collapsedClueIds.has(c.id) &&
        (cluesExpandAll || expandedClueIds.has(c.id) || Boolean(q) || defaultOpen);

      const li = document.createElement("li");
      li.className = `clue-card-item ${isExpanded ? "expanded" : "collapsed"} ${isRecent ? "is-new" : ""}`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "clue-card-head";
      btn.setAttribute("aria-expanded", isExpanded ? "true" : "false");

      const leftWrap = document.createElement("div");
      leftWrap.className = "clue-head-main";

      const metaRow = document.createElement("div");
      metaRow.className = "clue-meta-row";

      const catPill = document.createElement("span");
      catPill.className = `clue-cat-pill ${catMeta.cls}`;
      catPill.textContent = catMeta.label;
      metaRow.appendChild(catPill);

      if (isRecent) {
        const newTag = document.createElement("span");
        newTag.className = "clue-new-badge";
        newTag.textContent = "ใหม่";
        metaRow.appendChild(newTag);
      }

      const titleEl = document.createElement("strong");
      titleEl.className = "clue-card-title";
      titleEl.textContent = c.label;

      leftWrap.appendChild(metaRow);
      leftWrap.appendChild(titleEl);

      const chevron = document.createElement("span");
      chevron.className = "clue-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = isExpanded ? "▾" : "▸";

      btn.appendChild(leftWrap);
      btn.appendChild(chevron);

      const detailEl = document.createElement("div");
      detailEl.className = "clue-card-detail";
      detailEl.textContent = c.detail;

      btn.addEventListener("click", () => {
        const nextOpen = !li.classList.contains("expanded");
        if (nextOpen) {
          expandedClueIds.add(c.id);
          collapsedClueIds.delete(c.id);
        } else {
          expandedClueIds.delete(c.id);
          collapsedClueIds.add(c.id);
        }
        li.classList.toggle("expanded", nextOpen);
        li.classList.toggle("collapsed", !nextOpen);
        btn.setAttribute("aria-expanded", nextOpen ? "true" : "false");
        chevron.textContent = nextOpen ? "▾" : "▸";
      });

      li.appendChild(btn);
      li.appendChild(detailEl);
      listEl.appendChild(li);
    });
  }

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
      const roomAct = rm.act || (String(rm.scene_id || "").startsWith("B") ? "B" : "A");
      const badgeClass = rm.in_combat ? "active-room-badge combat" : "active-room-badge";
      const statusText = isEmptyRoom
        ? "ห้องว่าง"
        : rm.ended
          ? `จบช่วง ${roomAct} แล้ว`
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
      pill.textContent = "Voice + AI Ready";
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

  function _renderCombatRollCard(rollData, overrideNarration = "") {
    const rollCard = $("combat-roll-card");
    if (!rollCard) return;
    if (!rollData) {
      rollCard.classList.add("hidden");
      return;
    }
    rollCard.classList.remove("hidden", "tier-full", "tier-partial", "tier-failure", "tier-ghost");
    const tierCls = rollData.is_ghost ? "tier-ghost" : `tier-${rollData.tier || "partial"}`;
    rollCard.classList.add(tierCls);

    const dieEl = $("combat-roll-die");
    if (dieEl) {
      dieEl.textContent = rollData.d20 != null ? String(rollData.d20) : "★";
    }
    const tierEl = $("combat-roll-tier");
    if (tierEl) {
      tierEl.textContent = `${rollData.actor} · ${rollData.tier_label || rollData.action_label}`;
    }
    const mathEl = $("combat-roll-math");
    if (mathEl) {
      if (rollData.d20 != null) {
        const modStr = (rollData.modifier || 0) >= 0 ? `+${rollData.modifier || 0}` : String(rollData.modifier || 0);
        const bonusStr = rollData.bonus > 0 ? ` +โบนัส ${rollData.bonus}` : "";
        const reasonStr = rollData.bonus_reason ? ` (${rollData.bonus_reason})` : "";
        mathEl.textContent = `${rollData.action_label} [${rollData.stat}]: D20(${rollData.d20}) ${modStr}${bonusStr} = ${rollData.total} vs ${rollData.dc_label} ${rollData.target_dc}${reasonStr}`;
      } else {
        mathEl.textContent = `${rollData.action_label}${rollData.bonus_reason ? ` · ${rollData.bonus_reason}` : ""}`;
      }
    }
    const narEl = $("combat-roll-narration");
    if (narEl) {
      narEl.textContent = overrideNarration || "";
      narEl.classList.toggle("hidden", !narEl.textContent);
    }
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
    if ($("ghost-sprite-img")) {
      $("ghost-sprite-img").src = combat.enemy_sprite || "/assets/characters/drowned_echo.png";
      $("ghost-sprite-img").alt = combat.enemy_name;
    }
    $("combat-round-badge").textContent =
      `รอบที่ ${combat.round_number} • ${combat.phase === "players" ? "ตาผู้สืบสวน" : `ตาของ ${combat.enemy_name}`}`;

    const tags = [];
    if ((combat.ritual_max_steps || 0) > 0) {
      tags.push(
        combat.ritual_shield_up
          ? `เกราะกำไล 3 ชั้น (${combat.ritual_step}/${combat.ritual_max_steps})`
          : "เกราะสลายแล้ว: ปลดกำไลได้เลย!"
      );
    }
    if (combat.ghost_exposed) tags.push("เปิดจุดอ่อน (+2 ทอย)");
    if (combat.party_shield > 0) tags.push(`เกราะทีม +${combat.party_shield}`);
    if ((me?.assisted_bonus || 0) > 0) tags.push(`คุณได้เปรียบ +${me.assisted_bonus}`);
    if (me?.protected_by) tags.push(`${me.protected_by} คุ้มกันอยู่`);
    $("combat-tags").textContent = tags.join(" · ");

    $("combat-hp-text").textContent = `${combat.enemy_hp} / ${combat.enemy_max_hp}`;
    $("combat-hp-fill").style.width = `${(combat.enemy_hp / Math.max(1, combat.enemy_max_hp)) * 100}%`;

    $("combat-soothe-text").textContent = `${combat.soothe_progress} / ${combat.soothe_goal}`;
    $("combat-soothe-fill").style.width = `${(combat.soothe_progress / Math.max(1, combat.soothe_goal)) * 100}%`;

    $("combat-retreat-text").textContent = `${combat.retreat_progress} / ${combat.retreat_goal}`;
    $("combat-retreat-fill").style.width = `${(combat.retreat_progress / Math.max(1, combat.retreat_goal)) * 100}%`;

    const hasRitual = (combat.ritual_max_steps || 0) > 0;
    const ritualRow = $("combat-ritual-row");
    if (ritualRow) {
      ritualRow.classList.toggle("hidden", !hasRitual);
      if (hasRitual) {
        $("combat-ritual-text").textContent = combat.ritual_shield_up
          ? `${combat.ritual_step} / ${combat.ritual_max_steps}`
          : "ครบ 3 ขั้น · รอปลดกำไล!";
        $("combat-ritual-fill").style.width = `${(combat.ritual_step / Math.max(1, combat.ritual_max_steps)) * 100}%`;
      }
    }

    const teleBox = $("combat-telegraph-box");
    if (teleBox) {
      const tele = combat.telegraph;
      if (tele) {
        teleBox.classList.remove("hidden");
        $("combat-telegraph-target").textContent = `เป้าหมาย: ${tele.target_name} (${tele.move_name})`;
        $("combat-telegraph-hint").textContent = tele.hint;
        $("combat-telegraph-tip").textContent = `วิธีแก้ทาง: ${tele.counter_tip}`;
      } else {
        teleBox.classList.add("hidden");
      }
    }

    const turnStrip = $("combat-party-turn-strip");
    if (turnStrip) {
      turnStrip.innerHTML = "";
      (state.players || []).forEach((p) => {
        const chip = document.createElement("div");
        const isTeleTarget = combat.telegraph?.target_id === p.id;
        chip.className = `combat-turn-chip ${p.acted_this_round ? "done" : "ready"} ${isTeleTarget ? "targeted" : ""}`;
        const badges = [];
        if (p.protected_by) badges.push(`🛡 ${p.protected_by}`);
        if ((p.assisted_bonus || 0) > 0) badges.push(`+${p.assisted_bonus} ทอย`);
        if (isTeleTarget && combat.phase === "players") badges.push("ถูกเล็งเป้า");
        chip.textContent = `${p.name}: ${p.hp}/${p.max_hp}HP · สติ ${p.sanity}${badges.length ? ` (${badges.join(", ")})` : ""}`;
        turnStrip.appendChild(chip);
      });
    }

    const latestChronicle = (combat.chronicle || []).slice(-1)[0]?.text || "";
    _renderCombatRollCard(combat.last_roll, latestChronicle);

    const lastLog = (combat.combat_log || []).slice(-1)[0] || "";
    $("combat-last-log").textContent = lastLog;

    const strikeMod = Math.max(me?.stats?.BODY ?? 0, me?.stats?.SPI ?? 0);
    const strikeStat = (me?.stats?.BODY ?? 0) >= (me?.stats?.SPI ?? 0) ? "BODY" : "SPI";
    const sootheMod = Math.max(me?.stats?.SOC ?? 0, me?.stats?.SPI ?? 0);
    const sootheStat = (me?.stats?.SOC ?? 0) >= (me?.stats?.SPI ?? 0) ? "SOC" : "SPI";
    if ($("combat-strike-hint")) {
      $("combat-strike-hint").textContent = combat.ritual_shield_up
        ? "เกราะ 3 ชั้นกันดาเมจ! คลายเกราะก่อน"
        : `ทอย ${strikeStat} +${strikeMod} vs PDEF 12`;
    }
    const ritualBtn = $("combat-ritual-btn");
    if (ritualBtn) {
      ritualBtn.classList.toggle("hidden", !hasRitual);
      if (hasRitual) {
        const stepLabels = ["1) คุมแรงสะท้อน", "2) แยกสายคำสั่ง", "3) คลายปมเกราะ"];
        $("combat-ritual-btn-title").textContent = combat.ritual_shield_up
          ? `คลายเกราะ (${stepLabels[combat.ritual_step] || "ขั้นต่อไป"})`
          : "ปลดกำไลขั้นสุดท้าย!";
        $("combat-ritual-btn-desc").textContent = combat.ritual_shield_up
          ? `ขั้น ${combat.ritual_step}/${combat.ritual_max_steps} · ทอย INT/SPI คลายวงป้องกัน`
          : "Controlled Release — หยุดพิธีโดยไม่ฆ่าแม่แก้ว";
      }
    }
    if ($("combat-soothe-hint")) {
      $("combat-soothe-hint").textContent = `ทอย ${sootheStat} +${sootheMod} vs MDEF 13`;
    }
    if ($("combat-assist-hint")) {
      const targetName = combat.telegraph?.target_name;
      $("combat-assist-hint").textContent = targetName
        ? `ช่วย ${targetName} · เกราะ +2 · ได้เปรียบ +2`
        : "ล้างสถานะ · เกราะ +2 · ได้เปรียบ +2";
    }

    if (me?.skill) {
      $("combat-skill-name").textContent = me.skill.name;
      $("combat-skill-desc").textContent = `${me.skill.description} (1 โฟกัส)`;
    }

    const conscious = me && me.hp > 0 && me.sanity > 0;
    const canAct = Boolean(conscious && !me.acted_this_round && combat.phase === "players");
    const isShaken = Boolean(me?.statuses?.includes("SHAKEN"));
    const isRooted = Boolean(me?.statuses?.includes("ROOTED"));

    let statusMsg = "ตาของคุณ — กดปุ่มคำสั่ง หรือพิมพ์/พูดบรรยายวิธีรับมือ TRPG ด้านล่าง (ใช้ไฟฉาย/สิ่งแวดล้อมได้โบนัส!)";
    if (!conscious) statusMsg = "คุณหมดสติหรือเสียขวัญแล้ว รอเพื่อนร่วมทีมช่วยเหลือ";
    else if (combat.phase !== "players") statusMsg = `กำลังถึงตาของ ${combat.enemy_name}...`;
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

    const rpWrap = $("combat-rp-hints");
    if (rpWrap) {
      rpWrap.innerHTML = "";
      if (canAct && (combat.environment_features || []).length) {
        const prefix = document.createElement("span");
        prefix.className = "rp-hint-label";
        prefix.textContent = "แนวทางสวมบทบาทจากฉาก:";
        rpWrap.appendChild(prefix);
        (combat.environment_features || []).forEach((feat) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "rp-hint-chip";
          btn.title = feat.hint;
          btn.textContent = `+ ${feat.sample}`;
          btn.addEventListener("click", () => {
            const input = $("chat-input");
            if (input && !input.disabled) {
              input.value = feat.sample;
              input.focus();
            }
          });
          rpWrap.appendChild(btn);
        });
      }
    }
  }

  function renderNpcLayer(state) {
    const layer = $("npc-layer");
    if (!layer) return;
    const visibleNpcs = (state.npcs || []).filter((n) => n.visible !== false);
    const sig = visibleNpcs.map((n) => `${n.name}:${n.sprite || ""}`).join("|");
    layer.classList.toggle("multi-npc", visibleNpcs.length >= 2);
    if (sig === renderedNpcSignature) return;
    renderedNpcSignature = sig;
    layer.innerHTML = "";
    visibleNpcs.forEach((npc) => {
      const wrap = document.createElement("div");
      wrap.className = "npc-sprite-wrap";
      wrap.dataset.speaker = npc.name;
      const displayName = NPC_DISPLAY_LABELS[npc.name] || npc.name;
      if (npc.sprite) {
        const img = document.createElement("img");
        img.src = npc.sprite;
        img.alt = displayName;
        img.className = "npc-sprite";
        img.addEventListener("error", () => {
          img.remove();
          if (!wrap.querySelector(".npc-portrait-fallback")) {
            const fb = document.createElement("div");
            fb.className = "npc-portrait-fallback";
            fb.textContent = displayName.slice(0, 1);
            wrap.prepend(fb);
          }
        });
        wrap.appendChild(img);
      } else {
        const fb = document.createElement("div");
        fb.className = "npc-portrait-fallback";
        fb.textContent = displayName.slice(0, 1);
        wrap.appendChild(fb);
      }
      const label = document.createElement("span");
      label.className = "npc-label";
      label.textContent = displayName;
      wrap.appendChild(label);
      layer.appendChild(wrap);
    });
  }

  function renderBoardRoutes(act) {
    const routesLayer = $("board-routes-layer");
    if (!routesLayer || renderedBoardAct === act) return;
    renderedBoardAct = act;
    routesLayer.innerHTML = "";
    const routesByAct = {
      A: [
        { x1: 22, y1: 62, x2: 45, y2: 46, cls: "map-road" },
        { x1: 45, y1: 46, x2: 76, y2: 30, cls: "map-road" },
        { x1: 45, y1: 46, x2: 70, y2: 72, cls: "map-road map-road-danger" },
      ],
      B: [
        { x1: 42, y1: 50, x2: 24, y2: 66, cls: "map-road" },
        { x1: 42, y1: 50, x2: 68, y2: 36, cls: "map-road" },
        { x1: 42, y1: 50, x2: 82, y2: 72, cls: "map-road" },
        { x1: 68, y1: 36, x2: 82, y2: 72, cls: "map-road" },
      ],
      C: [
        { x1: 22, y1: 46, x2: 45, y2: 30, cls: "map-road" },
        { x1: 22, y1: 46, x2: 46, y2: 68, cls: "map-road" },
        { x1: 45, y1: 30, x2: 72, y2: 46, cls: "map-road" },
        { x1: 46, y1: 68, x2: 72, y2: 46, cls: "map-road" },
        { x1: 72, y1: 46, x2: 88, y2: 66, cls: "map-road map-road-danger" },
      ],
      D: [
        { x1: 18, y1: 56, x2: 45, y2: 42, cls: "map-road" },
        { x1: 45, y1: 42, x2: 58, y2: 64, cls: "map-road map-road-danger" },
        { x1: 45, y1: 42, x2: 76, y2: 36, cls: "map-road" },
        { x1: 58, y1: 64, x2: 76, y2: 36, cls: "map-road" },
        { x1: 76, y1: 36, x2: 88, y2: 72, cls: "map-road" },
      ],
      E: [
        { x1: 20, y1: 54, x2: 45, y2: 68, cls: "map-road" },
        { x1: 20, y1: 54, x2: 66, y2: 36, cls: "map-road" },
        { x1: 45, y1: 68, x2: 66, y2: 36, cls: "map-road" },
        { x1: 66, y1: 36, x2: 86, y2: 54, cls: "map-road map-road-danger" },
      ],
      F: [
        { x1: 36, y1: 46, x2: 62, y2: 46, cls: "map-road" },
        { x1: 62, y1: 46, x2: 84, y2: 64, cls: "map-road" },
      ],
    };
    const segments = routesByAct[act] || routesByAct.A;
    segments.forEach((seg) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(seg.x1));
      line.setAttribute("y1", String(seg.y1));
      line.setAttribute("x2", String(seg.x2));
      line.setAttribute("y2", String(seg.y2));
      line.setAttribute("class", seg.cls);
      routesLayer.appendChild(line);
    });
  }

  function renderNpcTrustList(act, trustMap) {
    const listEl = $("npc-trust-list");
    const titleEl = $("trust-card-title");
    if (!listEl) return;
    const npcsByAct = {
      A: ["ประเสริฐ"],
      B: ["วิชัย", "ต้น"],
      C: ["ยายบุญมี"],
      D: ["แม่แก้ว (นางตานี)"],
      E: ["ดล", "วิชัย"],
      F: ["แม่แก้ว (นางตานี)", "ประเสริฐ"],
    };
    const npcs = npcsByAct[act] || ["ประเสริฐ"];
    if (titleEl) {
      const titlesByAct = {
        A: "ท่าทีผู้ใหญ่ประเสริฐ",
        B: "ท่าทีพยานและผู้ช่วย (ACT B)",
        C: "ท่าทียายบุญมี (ACT C)",
        D: "ท่าทีแม่แก้ว (ACT D)",
        E: "ท่าทีดลและวิชัย (ACT E)",
        F: "ท่าทีแม่แก้ว & ประเสริฐ (FINAL)",
      };
      titleEl.textContent = titlesByAct[act] || "ท่าทีตัวละคร";
    }
    listEl.innerHTML = "";
    npcs.forEach((npcName) => {
      const val = trustMap?.[npcName] ?? 0;
      const pct = Math.max(5, Math.min(100, ((val + 3) / 8) * 100));
      const statusLabel =
        val > 0 ? `เชื่อใจ (+${val})` : val < 0 ? `ระแวง (${val})` : "ปกติ (0)";
      const item = document.createElement("div");
      item.className = "npc-trust-item";
      item.innerHTML = `
        <div class="npc-trust-head">
          <span class="npc-trust-name"></span>
          <span class="trust-label"></span>
        </div>
        <div class="trust-track">
          <div class="trust-fill" style="width: ${pct}%"></div>
        </div>
      `;
      item.querySelector(".npc-trust-name").textContent = NPC_DISPLAY_LABELS[npcName] || npcName;
      item.querySelector(".trust-label").textContent = statusLabel;
      listEl.appendChild(item);
    });
  }

  function renderState(state) {
    currentState = state;
    const scenePrefix = String(state.current_scene || "A1")[0];
    const act = state.act || (["A", "B", "C", "D", "E", "F"].includes(scenePrefix) ? scenePrefix : "A");
    const me = (state.players || []).find((p) => p.id === myPlayer?.id || p.sid === socket?.id);
    $("game-screen").classList.toggle("in-combat", Boolean(state.combat?.active));

    $("hud-room-code").textContent = state.room_code;
    $("hud-scene-title").textContent = state.combat?.active
      ? `เผชิญหน้า: ${state.combat.enemy_name}`
      : state.scene_title;
    $("hud-scene-subtitle").textContent = state.combat?.active
      ? (state.combat.ritual_max_steps > 0
          ? "ปะทะผลัดเทิร์น 1 Action/รอบ — คลายเกราะกำไล 3 ขั้นแล้วปลดกำไลขั้นสุดท้าย"
          : "ปะทะแบบผลัดเทิร์น 1 Action ต่อรอบ — เลือกว่าจะขับไล่ กล่อม หรือเปิดทางถอย")
      : state.scene_subtitle;
    $("hud-quota-pill").textContent = `เสียงสด ${state.live_tts_used}/${state.live_tts_limit}`;
    $("demo-combat-btn")?.classList.toggle("hidden", act === "B" || act === "E");
    if ($("reset-room-btn")) {
      $("reset-room-btn").title = `เริ่มเล่นช่วง ACT ${act} ใหม่`;
    }

    if (!state.combat?.active) {
      $("scene-bg-img").src = state.background_image;
    }
    renderNpcLayer(state);

    // Overlays
    $("start-overlay").classList.toggle("hidden", Boolean(state.started));
    if (!state.started) {
      const introCopy = {
        A: ["บทนำ ACT A", "พร้อมเข้าสู่หมู่บ้านหนองตาล", "กดปุ่มด้านล่างเพื่อให้ผู้ดำเนินเกมเริ่มเล่าเปิดคดี A1", "เริ่มบทนำ ACT A"],
        B: ["บทที่ 2 · ACT B", "ก้าวเข้าสู่บ้านผู้ใหญ่บ้าน", "กดปุ่มด้านล่างเพื่อให้ผู้ดำเนินเกมเริ่มเล่าเปิดฉาก B1", "เริ่มบท ACT B"],
        C: ["บทที่ 3 · ACT C", "ก้าวเข้าสู่บ้านดลและทางแยกศาล", "กดปุ่มด้านล่างเพื่อเริ่มบท ACT C (ระบบซับไตเติ้ล + AI DM)", "เริ่มบท ACT C"],
        D: ["บทที่ 4 · ACT D", "เข้าสู่สวนกล้วยและศาลด้ายดำ", "กดปุ่มด้านล่างเพื่อเริ่มบท ACT D (ระบบซับไตเติ้ล + AI DM)", "เริ่มบท ACT D"],
        E: ["บทที่ 5 · ACT E", "ถึงเรือนไม้ร้างท้ายสวนกล้วย", "กดปุ่มด้านล่างเพื่อเริ่มบท ACT E ช่วยตัวประกันและเปิดโปงวิชัย", "เริ่มบท ACT E"],
        F: ["บทสุดท้าย · FINAL ACT F", "วงป้องกันกำไลแม่แก้วกำลังทำงาน", "กดปุ่มด้านล่างเพื่อเข้าสู่ศึกสุดท้ายและบทส่งท้าย Ending A–D", "เริ่มบทสุดท้าย FINAL"],
      }[act] || ["บทนำ ACT A", "พร้อมเข้าสู่หมู่บ้านหนองตาล", "กดปุ่มด้านล่างเพื่อเริ่มต้น", `เริ่มบท ACT ${act}`];
      $("start-overlay-crest").textContent = introCopy[0];
      $("start-overlay-title").textContent = introCopy[1];
      $("start-overlay-desc").textContent = introCopy[2];
      $("start-game-btn").textContent = introCopy[3];
    }

    const endingOverlay = $("ending-overlay");
    if (state.ending) {
      endingOverlay.classList.remove("hidden");
      const nextActByEnding = {
        act_a_complete: ["B", "ไปต่อ ACT B: เข้าบ้านผู้ใหญ่บ้าน"],
        act_a_combat_clear: ["B", "ไปต่อ ACT B: เข้าบ้านผู้ใหญ่บ้าน"],
        act_b_complete: ["C", "ไปต่อ ACT C: มุ่งหน้าสู่บ้านดล"],
        act_c_complete: ["D", "ไปต่อ ACT D: เข้าสวนกล้วยและศาลด้ายดำ"],
        act_d_complete: ["E", "ไปต่อ ACT E: บุกเรือนไม้ร้างช่วยตัวประกัน"],
        act_e_complete: ["F", "ไปต่อ FINAL ACT F: คลายเกราะกำไลแม่แก้ว"],
      };
      const nextInfo = nextActByEnding[state.ending.id] || null;
      const endingActLabel = state.ending.id.startsWith("ending_")
        ? "FINAL"
        : `ACT ${act}`;
      const badge = $("ending-badge");
      badge.textContent =
        state.ending.type === "true_ending"
          ? `TRUE ENDING • ${endingActLabel}`
          : `BAD ENDING • ${endingActLabel}`;
      badge.className = `ending-badge ${state.ending.type === "true_ending" ? "true" : "bad"}`;
      $("ending-title").textContent = state.ending.title;
      $("ending-summary").textContent = state.ending.summary;

      const canAdvance = Boolean(nextInfo);
      const nextActBtn = $("ending-next-act-btn");
      const resetBtn = $("ending-reset-btn");
      const restartABtn = $("ending-restart-a-btn");
      if (nextActBtn) {
        nextActBtn.classList.toggle("hidden", !canAdvance);
        if (nextInfo) {
          nextActBtn.dataset.targetAct = nextInfo[0];
          nextActBtn.textContent = nextInfo[1];
        }
      }
      restartABtn?.classList.toggle("hidden", act === "A");
      if (resetBtn) {
        resetBtn.textContent = `เล่น ACT ${act} ใหม่อีกครั้ง`;
        resetBtn.className = canAdvance ? "btn btn-secondary" : "btn btn-primary";
      }
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
    renderBoardRoutes(act);
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
      const rollBtn = $("roll-dice-btn");
      if (rollBtn) rollBtn.disabled = false;
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
    renderNpcTrustList(act, state.npc_trust);

    const clues = state.clues_found || [];
    renderCluesDossier(clues, act);
    updateMobileBadges(state);

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
    const consciousInCombat = Boolean(me && me.hp > 0 && me.sanity > 0);
    const canActInCombat = Boolean(
      inCombat && state.combat.phase === "players" && consciousInCombat && !me.acted_this_round
    );
    if (inCombat && !canActInCombat && (isHoldingMic || isToggleListening)) {
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
    const lockForCombatWait = inCombat && !canActInCombat;
    if (controlsPanel) controlsPanel.classList.toggle("combat-locked", lockForCombatWait);

    const lockChatForMe = lockForCombatWait || iAmHoldingOrQueued;
    if (chatInput) {
      chatInput.disabled = lockChatForMe;
      chatInput.placeholder = lockForCombatWait
        ? "คุณลงมือแล้วหรือถึงตาผี — รอขึ้นรอบถัดไป"
        : inCombat
          ? "บรรยายการกระทำ TRPG ของคุณ (เช่น สาดไฟฉายใส่แอ่งโคลนแล้วคว้าแขนเพื่อนหลบ) หรือกดคำสั่งด้านบน"
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
          : inCombat
            ? "ประกาศแอ็กชัน"
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
      const me = (currentState.players || []).find((p) => p.id === myPlayer?.id || p.sid === socket?.id);
      const canAct = Boolean(
        currentState.combat.phase === "players" && me && me.hp > 0 && me.sanity > 0 && !me.acted_this_round
      );
      if (!canAct) {
        btn.classList.remove("recording", "locked-other");
        btn.disabled = true;
        label.textContent = "รอตาถัดไปในการต่อสู้";
        return;
      }
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
    document.querySelectorAll("#npc-layer .npc-sprite-wrap").forEach((el) => {
      el.classList.toggle("speaking", Boolean(active && el.dataset.speaker === speaker));
    });
    const ghostWrap = $("ghost-sprite-wrap");
    if (ghostWrap) {
      ghostWrap.classList.toggle("speaking", Boolean(active && speaker === "ผีเงาจมน้ำ"));
    }
    audioFX?.setDucking(active);
  }

  function cancelDiceRollAnimation() {
    if (activeDiceAnimFrame) {
      cancelAnimationFrame(activeDiceAnimFrame);
      activeDiceAnimFrame = null;
    }
    if (diceAutoCloseTimer) {
      clearTimeout(diceAutoCloseTimer);
      diceAutoCloseTimer = null;
    }
    if (diceRollRevealTimer) {
      clearTimeout(diceRollRevealTimer);
      diceRollRevealTimer = null;
    }
    isDiceRolling = false;
    $("dice-tray-overlay")?.classList.add("hidden");
  }

  function playPhysicalDiceRoll(opts, onReveal) {
    cancelDiceRollAnimation();

    const overlay = $("dice-tray-overlay");
    const card = $("dice-tray-card");
    const arena = $("dice-tray-arena");
    const die = $("dice-tray-die");
    const shadow = $("dice-tray-shadow");
    const ring = $("dice-tray-ring");
    const faceNum = $("dice-tray-face-num");
    const statusEl = $("dice-tray-status");
    const mathEl = $("dice-tray-math");
    const badgeEl = $("dice-tray-badge");
    const closeBtn = $("dice-tray-close-btn");

    if (!overlay || !arena || !die || !shadow || !faceNum) {
      if (typeof onReveal === "function") onReveal();
      return;
    }

    isDiceRolling = true;
    const tier = opts.tier || "partial";
    const targetD20 = Number(opts.d20 || 10);

    $("dice-tray-actor").textContent = opts.actor || "ผู้สืบสวน";
    $("dice-tray-title").textContent = opts.title || "กำลังทอยลูกเต๋า D20";
    $("dice-tray-target").textContent = opts.targetLabel || "D20";

    card.classList.remove("tier-full", "tier-partial", "tier-failure");
    die.classList.remove("is-nat20", "is-nat1");
    ring?.classList.add("hidden");
    ring?.classList.remove("tier-full", "tier-partial", "tier-failure");
    mathEl?.classList.add("hidden");
    badgeEl?.classList.add("hidden");
    badgeEl?.classList.remove("tier-full", "tier-partial", "tier-failure");
    closeBtn?.classList.add("hidden");
    statusEl.textContent = "กำลังโยนลูกเต๋า D20 ลงบนถาดสักหลาด...";

    overlay.classList.remove("hidden");

    const arenaW = Math.max(arena.clientWidth || 400, 260);
    const arenaH = Math.max(arena.clientHeight || 176, 140);
    const floorY = arenaH * 0.66;
    const startX = Math.max(46, arenaW * 0.14);
    const rimX = Math.min(arenaW - 48, arenaW * 0.80);
    const endX = arenaW * 0.54;
    const durationMs = 3600;
    const bounceWindows = [
      { start: 0.0, end: 0.30, amp: 54 },
      { start: 0.30, end: 0.56, amp: 32 },
      { start: 0.56, end: 0.77, amp: 17 },
      { start: 0.77, end: 0.91, amp: 7 },
    ];
    const startAngle = -35;
    const totalRotations = 1260;

    let lastBounceIdx = -1;
    let nextFaceChangeAt = 0;
    let shownFace = ((targetD20 + 6) % 20) + 1;
    faceNum.textContent = String(shownFace);

    const startTime = performance.now();
    audioFX?.playSfx("dice_clatter");

    function step(now) {
      const elapsed = now - startTime;
      const u = Math.min(1, elapsed / durationMs);

      // Horizontal trajectory: fast throw rightwards -> slight rim deflection -> settle center
      let x;
      if (u < 0.56) {
        const p = u / 0.56;
        const ease = 1 - Math.pow(1 - p, 2.2);
        x = startX + (rimX - startX) * ease;
      } else {
        const p = (u - 0.56) / 0.44;
        const ease = 1 - Math.pow(1 - p, 2.6);
        x = rimX + (endX - rimX) * ease;
      }

      // Vertical parabolic bounces with decaying amplitude
      let height = 0;
      let activeBounceIdx = bounceWindows.length;
      for (let i = 0; i < bounceWindows.length; i += 1) {
        const bw = bounceWindows[i];
        if (u >= bw.start && u < bw.end) {
          const bp = (u - bw.start) / (bw.end - bw.start);
          height = Math.sin(bp * Math.PI) * bw.amp;
          activeBounceIdx = i;
          break;
        }
      }
      if (activeBounceIdx > lastBounceIdx && activeBounceIdx > 0 && u < 0.94) {
        lastBounceIdx = activeBounceIdx;
        audioFX?.playSfx("dice_clatter");
      }

      // Subtle lateral rock during the roll
      const yBase = floorY + Math.sin(u * Math.PI * 2.5) * (1 - u) * 8;
      const y = yBase - height;

      // Decelerating rotation, snapping upright during final 10%
      let angle;
      if (u < 0.90) {
        const ru = u / 0.90;
        const spinEase = 1 - Math.pow(1 - ru, 2.9);
        angle = startAngle + totalRotations * spinEase;
      } else {
        const settleU = (u - 0.90) / 0.10;
        const wobble = Math.sin(settleU * Math.PI * 2) * (1 - settleU) * 10;
        angle = wobble;
      }

      const bounceSquash = height < 4 && u > 0.25 && u < 0.91 ? 1.07 : 1;
      const dieScaleX = bounceSquash;
      const dieScaleY = bounceSquash > 1 ? 0.93 : 1 + Math.min(0.08, height / 520);

      die.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${angle.toFixed(1)}deg) scale(${dieScaleX.toFixed(3)}, ${dieScaleY.toFixed(3)})`;

      const shadowOffsetX = x + height * 0.35;
      const shadowOffsetY = yBase + 27;
      const shadowScale = Math.max(0.55, 1 - height / 130);
      const shadowOpacity = Math.max(0.28, 0.85 - height / 110);
      shadow.style.transform = `translate(${shadowOffsetX.toFixed(1)}px, ${shadowOffsetY.toFixed(1)}px) scale(${shadowScale.toFixed(3)})`;
      shadow.style.opacity = shadowOpacity.toFixed(2);

      // Slowing face-number cycling that locks onto the authoritative D20 result
      if (u >= 0.88) {
        faceNum.textContent = String(targetD20);
      } else if (elapsed >= nextFaceChangeAt) {
        let next = Math.floor(Math.random() * 20) + 1;
        if (next === shownFace) next = (next % 20) + 1;
        shownFace = next;
        faceNum.textContent = String(shownFace);
        const interval = 45 + Math.pow(u, 2.2) * 260;
        nextFaceChangeAt = elapsed + interval;
      }

      if (u < 1) {
        activeDiceAnimFrame = requestAnimationFrame(step);
        return;
      }

      // Landed & reveal
      activeDiceAnimFrame = null;
      die.style.transform = `translate(${endX.toFixed(1)}px, ${floorY.toFixed(1)}px) rotate(0deg) scale(1, 1)`;
      shadow.style.transform = `translate(${endX.toFixed(1)}px, ${(floorY + 27).toFixed(1)}px) scale(1)`;
      shadow.style.opacity = "0.85";
      faceNum.textContent = String(targetD20);

      if (targetD20 === 20) die.classList.add("is-nat20");
      else if (targetD20 === 1) die.classList.add("is-nat1");

      card.classList.add(`tier-${tier}`);
      if (ring) {
        ring.style.left = `${endX.toFixed(1)}px`;
        ring.style.top = `${floorY.toFixed(1)}px`;
        ring.className = `dice-tray-ring tier-${tier}`;
      }

      audioFX?.playSfx(tier === "failure" ? "dice_fail" : "dice_success");

      const natTag = targetD20 === 20 ? " (NAT 20!)" : targetD20 === 1 ? " (NAT 1!)" : "";
      statusEl.textContent = `ลูกเต๋าหยุดที่ ${targetD20}${natTag}`;
      if (mathEl) {
        mathEl.textContent = opts.mathText || "";
        mathEl.classList.toggle("hidden", !opts.mathText);
      }
      if (badgeEl) {
        badgeEl.textContent = opts.tierLabel || "ผลลัพธ์";
        badgeEl.className = `dice-tray-badge tier-${tier}`;
      }
      closeBtn?.classList.remove("hidden");

      if (typeof onReveal === "function") {
        onReveal();
      }

      isDiceRolling = false;
      diceRollRevealTimer = setTimeout(() => {
        diceRollRevealTimer = null;
        if (!isPlayingQueue && audioQueue.length > 0) {
          processAudioQueue();
        }
      }, 350);

      diceAutoCloseTimer = setTimeout(() => {
        diceAutoCloseTimer = null;
        $("dice-tray-overlay")?.classList.add("hidden");
      }, 1700);
    }

    activeDiceAnimFrame = requestAnimationFrame(step);
  }

  function clearAudioQueue() {
    cancelDiceRollAnimation();
    audioQueue.length = 0;
    if (activeAudioEl) {
      activeAudioEl.pause();
      activeAudioEl = null;
    }
    if (activeSubtitleTimer) {
      clearTimeout(activeSubtitleTimer);
      activeSubtitleTimer = null;
    }
    activeSubtitleFinishFn = null;
    $("subtitle-skip-hint")?.classList.add("hidden");
    $("subtitle-box")?.classList.remove("clickable");
    if (pendingGapTimer) {
      clearTimeout(pendingGapTimer);
      pendingGapTimer = null;
    }
    isPlayingQueue = false;
    setSpeakingVisual("", false);
  }

  function enqueueAudioEvent(ev) {
    audioQueue.push(ev);
    if (!isPlayingQueue && !isDiceRolling) {
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
      activeSubtitleFinishFn = null;
      $("subtitle-skip-hint")?.classList.add("hidden");
      $("subtitle-box")?.classList.remove("clickable");
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
      const avatarUrl = SPEAKER_AVATARS[speaker];
      if (avatarUrl) {
        avatarEl.src = avatarUrl;
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
      $("subtitle-skip-hint")?.classList.add("hidden");
      $("subtitle-box")?.classList.remove("clickable");
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
        activeSubtitleFinishFn = null;
        activeAudioEl = null;
        scheduleNextQueueItem(speaker, Boolean(ev.is_filler));
      };
      activeSubtitleFinishFn = finish;
      audio.addEventListener("ended", finish);
      audio.addEventListener("error", finish);
      activeSubtitleTimer = setTimeout(finish, 45000);
      audio.play().catch(() => {
        const readMs = ev.is_filler ? 800 : Math.min(8500, Math.max(2400, subtitle.length * 60));
        activeSubtitleTimer = setTimeout(finish, readMs);
      });
    } else {
      const finishSubOnly = () => {
        if (activeSubtitleTimer) {
          clearTimeout(activeSubtitleTimer);
          activeSubtitleTimer = null;
        }
        activeSubtitleFinishFn = null;
        $("subtitle-skip-hint")?.classList.add("hidden");
        $("subtitle-box")?.classList.remove("clickable");
        scheduleNextQueueItem(speaker, Boolean(ev.is_filler));
      };
      activeSubtitleFinishFn = finishSubOnly;
      const showSkip = !ev.is_filler && audioQueue.length > 0;
      $("subtitle-skip-hint")?.classList.toggle("hidden", !showSkip);
      $("subtitle-box")?.classList.toggle("clickable", showSkip);
      const readMs = ev.is_filler ? 450 : Math.min(9000, Math.max(2600, subtitle.length * 62));
      activeSubtitleTimer = setTimeout(finishSubOnly, readMs);
    }
  }

  function _canMeActInCombat() {
    if (!currentState?.combat?.active) return true;
    const me = (currentState.players || []).find((p) => p.id === myPlayer?.id || p.sid === socket?.id);
    return Boolean(
      currentState.combat.phase === "players" && me && me.hp > 0 && me.sanity > 0 && !me.acted_this_round
    );
  }

  function sendTextMessage(text) {
    if (currentState?.combat?.active && !_canMeActInCombat()) {
      showToast("ตอนนี้ยังลงมือในรอบนี้ไม่ได้ กรุณารอตาถัดไป");
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
    if (currentState?.combat?.active && !_canMeActInCombat()) {
      showToast("ตอนนี้ยังลงมือในรอบนี้ไม่ได้ กรุณารอตาถัดไป");
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

  function connectAndJoin(playerName, roomCode, roleId, startAct = selectedStartAct) {
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
        start_act: startAct || "A",
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
      resetDossierTracking();
      $("lobby-screen").classList.add("hidden");
      $("game-screen").classList.remove("hidden");
      setMobileTab("play");

      const logEl = $("transcript-log");
      logEl.innerHTML = "";
      (payload.history || []).forEach((h) => {
        appendTranscriptLog(h.speaker, h.text, h.kind);
      });
      if (!payload.state?.started) {
        const joinedAct =
          payload.state?.act || (String(payload.state?.current_scene || "").startsWith("B") ? "B" : "A");
        $("subtitle-speaker").textContent = "ระบบ";
        $("subtitle-text").textContent =
          joinedAct === "B"
            ? "ยินดีต้อนรับสู่แฟ้มคดี ACT B: บ้านผู้ใหญ่บ้าน กด 'เริ่มบท ACT B' เพื่อเริ่มฟังเสียงบรรยาย"
            : "ยินดีต้อนรับสู่แฟ้มคดีบ้านหนองตาล กด 'เริ่มบทนำ ACT A' เพื่อเริ่มฟังเสียงบรรยายจากผู้ดำเนินเกม";
      }
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
      if (window.innerWidth <= 960 && activeMobileTab !== "play") {
        setMobileTab("play");
      }
      const modSign = roll.modifier >= 0 ? `+${roll.modifier}` : String(roll.modifier);
      const mathSummary = `${roll.stat}: D20 (${roll.d20}) ${modSign} = ${roll.total} vs DC ${roll.dc}`;
      playPhysicalDiceRoll(
        {
          actor: roll.rolled_by,
          title: roll.title,
          targetLabel: `${roll.stat} · DC ${roll.dc}`,
          d20: roll.d20,
          tier: roll.tier,
          tierLabel: roll.tier_label,
          mathText: mathSummary,
        },
        () => {
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
        }
      );
    });

    socket.on("combat:sfx", (data) => {
      if (data?.sfx) audioFX?.playSfx(data.sfx);
    });

    socket.on("combat:roll", (data) => {
      const applyCombatRollVisuals = () => {
        if (data?.roll) {
          _renderCombatRollCard(data.roll, data.narration || "");
        }
        const ghostWrap = $("ghost-sprite-wrap");
        const fx = data?.visual_fx;
        if (ghostWrap && fx && fx !== "miss") {
          ghostWrap.classList.remove("fx-hit", "fx-soothe", "fx-lunge");
          void ghostWrap.offsetWidth;
          const cls = fx === "ghost_hit" ? "fx-hit" : fx === "ghost_soothe" ? "fx-soothe" : fx === "ghost_lunge" ? "fx-lunge" : "";
          if (cls) {
            ghostWrap.classList.add(cls);
            setTimeout(() => ghostWrap.classList.remove(cls), 650);
          }
        }
      };

      const roll = data?.roll;
      if (roll && roll.d20 != null && !roll.is_ghost) {
        if (window.innerWidth <= 960 && activeMobileTab !== "play") {
          setMobileTab("play");
        }
        const modSign = (roll.modifier || 0) >= 0 ? `+${roll.modifier || 0}` : String(roll.modifier || 0);
        const bonusStr = roll.bonus > 0 ? ` +โบนัส ${roll.bonus}` : "";
        const mathSummary = `${roll.action_label} [${roll.stat}]: D20(${roll.d20}) ${modSign}${bonusStr} = ${roll.total} vs ${roll.dc_label} ${roll.target_dc}`;
        playPhysicalDiceRoll(
          {
            actor: roll.actor,
            title: roll.action_label,
            targetLabel: `${roll.stat} · ${roll.dc_label} ${roll.target_dc}`,
            d20: roll.d20,
            tier: roll.tier,
            tierLabel: roll.tier_label,
            mathText: mathSummary,
          },
          applyCombatRollVisuals
        );
      } else {
        applyCombatRollVisuals();
      }
    });

    socket.on("room:act_changed", (payload) => {
      clearAudioQueue();
      $("dice-result-banner").classList.add("hidden");
      renderedNpcSignature = "";
      renderedBoardAct = "";
      document.querySelector('.stage-tab[data-view="scene"]')?.click();
      const actLabel = payload?.act || "B";
      const actMsgMap = {
        B: "เข้าสู่บทที่ 2 (ACT B): บ้านผู้ใหญ่บ้าน — ห้องรับแขกและโต๊ะแผนที่",
        C: "เข้าสู่บทที่ 3 (ACT C): บ้านดลและบ้านยายบุญมีก่อนทางแยก",
        D: "เข้าสู่บทที่ 4 (ACT D): เข้าสวนกล้วยและศาลด้ายดำ",
        E: "เข้าสู่บทที่ 5 (ACT E): เรือนไม้ร้าง ตัวประกัน และหลักฐานวิชัย",
        F: "เข้าสู่บทสุดท้าย (ACT F): ศึกคลายเกราะกำไลแม่แก้วและบทส่งท้าย",
      };
      const msg = actMsgMap[actLabel] || `เข้าสู่ช่วง ACT ${actLabel} แล้ว`;
      appendTranscriptLog("ระบบ", msg, "system");
      showToast(`เข้าสู่ช่วง ACT ${actLabel} แล้ว`);
    });

    socket.on("room:reset_done", (payload) => {
      clearAudioQueue();
      resetDossierTracking();
      renderedNpcSignature = "";
      renderedBoardAct = "";
      const actLabel = payload?.act || "A";
      $("dice-result-banner").classList.add("hidden");
      $("subtitle-speaker").textContent = "ระบบ";
      $("subtitle-text").textContent =
        actLabel === "A"
          ? "เริ่มห้องใหม่แล้ว กด 'เริ่มบทนำ ACT A' เพื่อเริ่มต้น"
          : `เริ่มบท ACT ${actLabel} ใหม่แล้ว กดปุ่มเริ่มบทเพื่อดำเนินเรื่องต่อ`;
      const logEl = $("transcript-log");
      logEl.innerHTML = "";
      (payload.history || []).forEach((h) => {
        appendTranscriptLog(h.speaker, h.text, h.kind);
      });
      showToast(`รีเซ็ตห้องเพื่อเริ่ม ACT ${actLabel} ใหม่แล้ว`);
    });

    socket.on("dm:error", (err) => {
      const rollBtn = $("roll-dice-btn");
      if (rollBtn) rollBtn.disabled = false;
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

    document.querySelectorAll(".act-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedStartAct = btn.dataset.act === "B" ? "B" : "A";
        document.querySelectorAll(".act-toggle-btn").forEach((b) => {
          b.classList.toggle("selected", b === btn);
        });
      });
    });

    $("join-form").addEventListener("submit", (e) => {
      e.preventDefault();
      unlockBrowserAudio();
      const playerName = $("player-name").value.trim() || "ผู้สืบสวน";
      const roomCode = $("room-code").value.trim() || "BANANA01";
      connectAndJoin(playerName, roomCode, selectedRoleId, selectedStartAct);
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

    $("ending-next-act-btn")?.addEventListener("click", () => {
      unlockBrowserAudio();
      document.querySelector('.stage-tab[data-view="scene"]')?.click();
      const targetAct = $("ending-next-act-btn")?.dataset.targetAct || "B";
      socket?.emit("room:advance_act", { act: targetAct });
    });

    $("subtitle-box")?.addEventListener("click", () => {
      if (typeof activeSubtitleFinishFn === "function" && !activeAudioEl && audioQueue.length > 0) {
        activeSubtitleFinishFn();
      }
    });

    $("ending-reset-btn").addEventListener("click", () => {
      const curAct = currentState?.act || "A";
      socket?.emit("room:reset", { act: curAct });
    });

    $("ending-restart-a-btn")?.addEventListener("click", () => {
      socket?.emit("room:reset", { act: "A" });
    });

    $("roll-dice-btn").addEventListener("click", () => {
      const btn = $("roll-dice-btn");
      if (btn) btn.disabled = true;
      audioFX?.playSfx("dice_roll");
      socket?.emit("dice:roll", {});
    });

    $("dice-tray-close-btn")?.addEventListener("click", () => {
      if (!isDiceRolling) $("dice-tray-overlay")?.classList.add("hidden");
    });

    $("dice-tray-overlay")?.addEventListener("click", (e) => {
      if (e.target === $("dice-tray-overlay") && !isDiceRolling) {
        $("dice-tray-overlay")?.classList.add("hidden");
      }
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

    document.querySelectorAll(".dossier-subtab").forEach((btn) => {
      btn.addEventListener("click", () => setDossierSubtab(btn.dataset.subtab));
    });

    document.querySelectorAll("#clue-filter-chips .clue-filter-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        activeClueCategory = chip.dataset.cat || "all";
        renderCluesDossier(currentState?.clues_found || [], currentState?.act || "A");
      });
    });

    $("clue-search-input")?.addEventListener("input", (e) => {
      clueSearchQuery = e.target.value || "";
      renderCluesDossier(currentState?.clues_found || [], currentState?.act || "A");
    });

    $("clue-expand-all-btn")?.addEventListener("click", () => {
      cluesExpandAll = !cluesExpandAll;
      collapsedClueIds.clear();
      if (!cluesExpandAll) expandedClueIds.clear();
      renderCluesDossier(currentState?.clues_found || [], currentState?.act || "A");
    });

    document.querySelectorAll(".mobile-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => setMobileTab(btn.dataset.mobileTab));
    });

    $("mobile-topbar-toggle")?.addEventListener("click", () => {
      const topbar = document.querySelector(".topbar");
      if (!topbar) return;
      const open = topbar.classList.toggle("mobile-drawer-open");
      $("mobile-topbar-toggle")?.setAttribute("aria-expanded", open ? "true" : "false");
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
      if (currentState?.combat?.active && !_canMeActInCombat()) return;
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
