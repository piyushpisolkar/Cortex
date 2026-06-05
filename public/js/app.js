// ══════════════════════════════════════════
// CORTEX — app.js (complete clean version)
// ══════════════════════════════════════════

// ── SPLASH SCREEN ──

(function () {
  const splash = document.getElementById("splashScreen");
  if (!splash) return;
  if (typeof THREE === "undefined") {
    setTimeout(() => {
      splash.style.opacity = "0";
      setTimeout(() => {
        splash.style.display = "none";
      }, 1000);
    }, 2500);
    return;
  }
  const canvas = document.getElementById("splashCanvas");
  if (!canvas) {
    setTimeout(() => {
      splash.style.opacity = "0";
      setTimeout(() => {
        splash.style.display = "none";
      }, 1000);
    }, 2500);
    return;
  }

  const size = Math.min(window.innerWidth * 0.6, 240);
  canvas.width = size;
  canvas.height = size;

  const splashRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  splashRenderer.setSize(size, size);
  splashRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const splashScene = new THREE.Scene();
  const splashCam = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  splashCam.position.set(0, 0, 5.5);
  splashCam.lookAt(0, 0, 0);

  // Lights
  splashScene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const pl1 = new THREE.PointLight(0x8877ff, 3, 18);
  pl1.position.set(4, 2, 4);
  splashScene.add(pl1);
  const pl2 = new THREE.PointLight(0x4444ff, 1.5, 14);
  pl2.position.set(-3, 3, 2);
  splashScene.add(pl2);

  const pl3 = new THREE.PointLight(0xffffff, 1.2, 12);
  pl3.position.set(0, 4, 3);
  splashScene.add(pl3);

  // ── BRAIN (flat, exactly matching the logo) ──
  const bc = 0x88aaff;
  function bt(pts, r) {
    return new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, r, 8, false),
      new THREE.MeshPhysicalMaterial({
        color: bc,
        metalness: 0.85,
        roughness: 0.1,
        emissive: bc,
        emissiveIntensity: 0.18,
        clearcoat: 1,
      }),
    );
  }

  const brain = new THREE.Group();

  // Left outer
  brain.add(
    bt(
      [
        new THREE.Vector3(-0.02, 0.52, 0.08),
        new THREE.Vector3(-0.2, 0.52, 0.09),
        new THREE.Vector3(-0.4, 0.36, 0.1),
        new THREE.Vector3(-0.48, 0.12, 0.1),
        new THREE.Vector3(-0.46, -0.1, 0.1),
        new THREE.Vector3(-0.34, -0.28, 0.09),
        new THREE.Vector3(-0.14, -0.36, 0.08),
        new THREE.Vector3(-0.02, -0.36, 0.08),
      ],
      0.04,
    ),
  );

  // Left gyrus 1
  brain.add(
    bt(
      [
        new THREE.Vector3(-0.02, 0.18, 0.09),
        new THREE.Vector3(-0.18, 0.22, 0.1),
        new THREE.Vector3(-0.3, 0.1, 0.1),
        new THREE.Vector3(-0.32, -0.06, 0.1),
        new THREE.Vector3(-0.22, -0.16, 0.09),
      ],
      0.032,
    ),
  );

  // Left gyrus 2
  brain.add(
    bt(
      [
        new THREE.Vector3(-0.02, -0.1, 0.09),
        new THREE.Vector3(-0.12, -0.08, 0.09),
        new THREE.Vector3(-0.18, 0.02, 0.1),
        new THREE.Vector3(-0.16, 0.12, 0.1),
      ],
      0.024,
    ),
  );

  // Right outer
  brain.add(
    bt(
      [
        new THREE.Vector3(0.02, 0.52, 0.08),
        new THREE.Vector3(0.2, 0.52, 0.09),
        new THREE.Vector3(0.4, 0.36, 0.1),
        new THREE.Vector3(0.48, 0.12, 0.1),
        new THREE.Vector3(0.46, -0.1, 0.1),
        new THREE.Vector3(0.34, -0.28, 0.09),
        new THREE.Vector3(0.14, -0.36, 0.08),
        new THREE.Vector3(0.02, -0.36, 0.08),
      ],
      0.04,
    ),
  );

  // Right gyrus 1
  brain.add(
    bt(
      [
        new THREE.Vector3(0.02, 0.18, 0.09),
        new THREE.Vector3(0.18, 0.22, 0.1),
        new THREE.Vector3(0.3, 0.1, 0.1),
        new THREE.Vector3(0.32, -0.06, 0.1),
        new THREE.Vector3(0.22, -0.16, 0.09),
      ],
      0.032,
    ),
  );

  // Right gyrus 2
  brain.add(
    bt(
      [
        new THREE.Vector3(0.02, -0.1, 0.09),
        new THREE.Vector3(0.12, -0.08, 0.09),
        new THREE.Vector3(0.18, 0.02, 0.1),
        new THREE.Vector3(0.16, 0.12, 0.1),
      ],
      0.024,
    ),
  );

  // Bottom stem
  brain.add(
    bt(
      [
        new THREE.Vector3(-0.02, -0.36, 0.08),
        new THREE.Vector3(0, -0.44, 0.08),
        new THREE.Vector3(0.02, -0.36, 0.08),
      ],
      0.04,
    ),
  );

  // Center dashes
  for (let i = 0; i < 5; i++) {
    const d = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.06, 6),
      new THREE.MeshPhysicalMaterial({
        color: 0x5544aa,
        emissive: 0x332288,
        emissiveIntensity: 0.4,
      }),
    );
    d.position.set(0, 0.42 - i * 0.19, 0.09);
    brain.add(d);
  }

  splashScene.add(brain);
  // ── SPINNING HEX (2D clockwise only) ──
  function hexShape(r) {
    const s = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      i === 0
        ? s.moveTo(r * Math.cos(a), r * Math.sin(a))
        : s.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    s.closePath();
    return s;
  }

  const hs = hexShape(1.52);
  hs.holes.push(hexShape(1.2));
  const spinHex = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hs, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.055,
      bevelSize: 0.055,
      bevelSegments: 10,
    }),
    new THREE.MeshPhysicalMaterial({
      color: 0x5555bb,
      metalness: 1.0,
      roughness: 0.06,
      clearcoat: 1.0,
      emissive: 0x222266,
      emissiveIntensity: 0.15,
    }),
  );
  spinHex.position.z = -0.09;

  const innerPanel = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hexShape(1.16), {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 4,
    }),
    new THREE.MeshPhysicalMaterial({
      color: 0x070710,
      metalness: 0.2,
      roughness: 0.7,
    }),
  );
  innerPanel.position.z = -0.04;

  const hexGroup = new THREE.Group();
  hexGroup.add(spinHex, innerPanel);
  splashScene.add(hexGroup);

  let splashT = 0,
    splashAnimId;
  function animateSplash() {
    splashAnimId = requestAnimationFrame(animateSplash);
    splashT += 0.012;
    // Only hex spins clockwise in 2D
    hexGroup.rotation.z = -splashT;
    // Brain stays still — subtle float only
    brain.position.y = Math.sin(splashT * 0.7) * 0.015;
    pl1.intensity = 3 + Math.sin(splashT * 1.5) * 0.4;
    splashRenderer.render(splashScene, splashCam);
  }
  animateSplash();

  setTimeout(() => {
    splash.style.opacity = "0";
    setTimeout(() => {
      splash.style.display = "none";
      cancelAnimationFrame(splashAnimId);
      splashRenderer.dispose();
    }, 1000);
  }, 3200);
})();
// ══════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════

// ── STATE ──
let chatHistory = [];
let panicMode = false;
let vivaMode = false;
let isListening = false;

// ── ELEMENTS ──
const chatArea = document.getElementById("chatArea");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const panicBtn = document.getElementById("panicBtn");
const vivaBtn = document.getElementById("vivaBtn");
const canvasArea = document.getElementById("canvasArea");
const canvasEmpty = document.getElementById("canvasEmpty");
const clearCanvas = document.getElementById("clearCanvas");
const dropZone = document.getElementById("dropZone");
const scanOverlay = document.getElementById("scanOverlay");

// ── AUTO RESIZE TEXTAREA ──
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = userInput.scrollHeight + "px";
});

// ── SEND ON ENTER ──
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

// ── PANIC MODE ──
panicBtn.addEventListener("click", () => {
  panicMode = !panicMode;
  if (vivaMode) {
    vivaMode = false;
    vivaBtn.classList.remove("active");
    vivaBtn.textContent = "🎓 Viva Mode";
  }
  panicBtn.classList.toggle("active", panicMode);
  panicBtn.textContent = panicMode ? "⚡ Panic ON" : "⚡ Panic Mode";
  const notice = document.createElement("div");
  notice.className = "msg msg-ai";
  notice.innerHTML = panicMode
    ? `<span class="msg-label">Cortex</span>⚡ <strong>Panic Mode ON.</strong> Bullet points and key facts only. Let's go.`
    : `<span class="msg-label">Cortex</span>Panic Mode off. Back to normal explanations.`;
  chatArea.appendChild(notice);
  scrollChat();
});

// ── VIVA MODE ──
vivaBtn.addEventListener("click", () => {
  vivaMode = !vivaMode;
  if (panicMode) {
    panicMode = false;
    panicBtn.classList.remove("active");
    panicBtn.textContent = "⚡ Panic Mode";
  }
  vivaBtn.classList.toggle("active", vivaMode);
  vivaBtn.textContent = vivaMode ? "🎓 Viva ON" : "🎓 Viva Mode";
  if (vivaMode) {
    chatHistory = [];
    const notice = document.createElement("div");
    notice.className = "msg msg-ai";
    notice.innerHTML = `<span class="msg-label">Cortex</span>🎓 <strong>Viva Mode ON.</strong> Tell me the topic and I'll fire questions at you.`;
    chatArea.appendChild(notice);
  } else {
    const notice = document.createElement("div");
    notice.className = "msg msg-ai";
    notice.innerHTML = `<span class="msg-label">Cortex</span>Viva Mode off. Good session!`;
    chatArea.appendChild(notice);
  }
  scrollChat();
});

// ── CLEAR CANVAS ──
clearCanvas.addEventListener("click", () => {
  canvasArea.innerHTML = "";
  canvasArea.appendChild(canvasEmpty);
  canvasEmpty.style.display = "flex";
});

// ── SEND MESSAGE ──
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;
  appendUserMessage(text);
  userInput.value = "";
  userInput.style.height = "auto";
  const typing = showTyping();
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history: chatHistory,
        mode: panicMode ? "panic" : vivaMode ? "viva" : "normal",
      }),
    });
    const data = await res.json();
    removeTyping(typing);
    if (data.reply) {
      chatHistory.push({ role: "user", content: text });
      chatHistory.push({ role: "assistant", content: data.reply });
      appendAIMessage(data.reply);
    } else {
      appendAIMessage("Something went wrong. Try again.");
    }
  } catch (err) {
    removeTyping(typing);
    appendAIMessage("Could not reach Cortex. Check your connection.");
  }
}

// ── APPEND USER MESSAGE ──
function appendUserMessage(text) {
  const div = document.createElement("div");
  div.className = "msg msg-user";
  div.textContent = text;
  chatArea.appendChild(div);
  scrollChat();
}

// ── APPEND AI MESSAGE ──
function appendAIMessage(text) {
  const isLong = text.length > 1200 || text.includes("```");
  if (isLong) {
    pushToCanvas(text);
    const div = document.createElement("div");
    div.className = "msg msg-ai";
    div.innerHTML = `<span class="msg-label">Cortex</span>Pushed to <strong style="color:var(--teal)">Canvas →</strong>`;
    chatArea.appendChild(div);
    const actions = makeActions(text);
    chatArea.appendChild(actions);
  } else {
    const div = document.createElement("div");
    div.className = "msg msg-ai";
    div.innerHTML = `<span class="msg-label">Cortex</span>${formatMessage(text)}`;
    chatArea.appendChild(div);
    const actions = makeActions(text);
    chatArea.appendChild(actions);
  }
  scrollChat();
  // Read aloud if enabled
  if (
    document.getElementById("readAloudToggle") &&
    document.getElementById("readAloudToggle").checked
  ) {
    speak(text.replace(/[#*`]/g, "").substring(0, 500));
  }
}

function makeActions(text) {
  const actions = document.createElement("div");
  actions.className = "msg-actions";
  actions.dataset.fullText = text;
  actions.innerHTML = `
    <button class="action-btn" data-tooltip="Shorter summary" onclick="summarize(this,'shorter')">Shorter</button>
    <button class="action-btn" data-tooltip="More detail" onclick="summarize(this,'longer')">More detail</button>
    <button class="action-btn" data-tooltip="Make flashcards" onclick="makeFlashcard(this)">⊞ Flashcard</button>
    <button class="action-btn" data-tooltip="Read aloud" onclick="speakText(this)">🔊</button>
  `;
  return actions;
}

// ── PUSH TO CANVAS ──
function pushToCanvas(text) {
  canvasEmpty.style.display = "none";
  const card = document.createElement("div");
  card.className = "canvas-card";
  const title = document.createElement("div");
  title.className = "canvas-card-title";
  title.textContent = "▸ Study note — " + new Date().toLocaleTimeString();
  card.appendChild(title);
  const body = document.createElement("div");
  body.style.cssText = "font-size:14px;line-height:1.7;color:var(--text-muted)";
  body.innerHTML = formatMessage(text);
  card.appendChild(body);
  canvasArea.insertBefore(card, canvasArea.firstChild);
  scrollCanvas();
  if (isMobile()) switchTab("canvas");
}

// ── FORMAT MESSAGE ──
function formatMessage(text) {
  text = text.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_, lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`,
  );
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  text = text
    .split("\n")
    .map((line) =>
      line.match(/^\s*[\*\-]\s+/)
        ? '<div class="bullet">• ' +
          line.replace(/^\s*[\*\-]\s+/, "") +
          "</div>"
        : line,
    )
    .join("\n");
  text = text.replace(/\n/g, "<br>");
  return text;
}

function escapeHtml(t) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── TYPING INDICATOR ──
function showTyping() {
  const div = document.createElement("div");
  div.className = "typing";
  div.innerHTML = "<span></span><span></span><span></span>";
  chatArea.appendChild(div);
  scrollChat();
  return div;
}
function removeTyping(el) {
  if (el?.parentNode) el.parentNode.removeChild(el);
}

// ── SCROLL ──
function scrollChat() {
  chatArea.scrollTop = chatArea.scrollHeight;
}
function scrollCanvas() {
  canvasArea.scrollTop = 0;
}

// ── SUMMARIZE ──
async function summarize(btn, type) {
  const actionsDiv = btn.parentElement;
  const text =
    actionsDiv.dataset.fullText ||
    actionsDiv.previousElementSibling?.innerText ||
    "";
  btn.textContent = "...";
  btn.disabled = true;
  try {
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, type }),
    });
    const data = await res.json();
    if (data.reply) pushToCanvas(data.reply);
  } catch (e) {
    console.error(e);
  }
  btn.textContent = type === "shorter" ? "Shorter" : "More detail";
  btn.disabled = false;
}

// ── FLASHCARD ──
async function makeFlashcard(btn) {
  const actionsDiv = btn.parentElement;
  const text =
    actionsDiv.dataset.fullText ||
    actionsDiv.previousElementSibling?.innerText ||
    "";
  btn.textContent = "...";
  btn.disabled = true;
  try {
    const res = await fetch("/api/flashcard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.flashcards) pushFlashcardsToCanvas(data.flashcards);
  } catch (e) {
    console.error(e);
  }
  btn.textContent = "⊞ Flashcard";
  btn.disabled = false;
}

// ── PUSH FLASHCARDS ──
function pushFlashcardsToCanvas(flashcards) {
  canvasEmpty.style.display = "none";
  const card = document.createElement("div");
  card.className = "canvas-card";
  const title = document.createElement("div");
  title.className = "canvas-card-title";
  title.textContent = "▸ Flashcard deck — " + new Date().toLocaleTimeString();
  card.appendChild(title);
  flashcards.forEach((fc) => {
    const fcDiv = document.createElement("div");
    fcDiv.className = "flashcard";
    fcDiv.innerHTML = `<div class="flashcard-q">Q: ${fc.q}</div><div class="flashcard-a">A: ${fc.a}</div><div class="flashcard-hint">Tap to reveal</div>`;
    fcDiv.addEventListener("click", () => {
      fcDiv.classList.toggle("revealed");
      fcDiv.querySelector(".flashcard-hint").textContent =
        fcDiv.classList.contains("revealed") ? "Tap to hide" : "Tap to reveal";
    });
    card.appendChild(fcDiv);
  });
  canvasArea.insertBefore(card, canvasArea.firstChild);
  scrollCanvas();
  if (isMobile()) switchTab("canvas");
}

// ── VOICE INPUT ──
function initVoice() {
  const voiceBtn = document.getElementById("voiceBtn");
  if (!voiceBtn) return;
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.style.display = "none";
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.onresult = (e) => {
    userInput.value = e.results[0][0].transcript;
    userInput.style.height = "auto";
    userInput.style.height = userInput.scrollHeight + "px";
    isListening = false;
    voiceBtn.classList.remove("listening");
    voiceBtn.textContent = "🎤";
  };
  recognition.onerror = () => {
    isListening = false;
    voiceBtn.classList.remove("listening");
    voiceBtn.textContent = "🎤";
  };
  recognition.onend = () => {
    isListening = false;
    voiceBtn.classList.remove("listening");
    voiceBtn.textContent = "🎤";
  };
  voiceBtn.addEventListener("click", () => {
    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
      isListening = true;
      voiceBtn.classList.add("listening");
      voiceBtn.textContent = "⏹";
    }
  });
}

// ── READ ALOUD ──
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-IN";
  utter.rate = 0.95;
  window.speechSynthesis.speak(utter);
}

function speakText(btn) {
  const actionsDiv = btn.parentElement;
  const text =
    actionsDiv.dataset.fullText ||
    actionsDiv.previousElementSibling?.innerText ||
    "";
  speak(text.replace(/[#*`<>]/g, "").substring(0, 800));
}

// ── DRAG & DROP ──
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!file.name.endsWith(".txt")) {
    appendAIMessage("Only .txt files supported. PDF support coming in v2!");
    return;
  }
  scanOverlay.classList.add("active");
  const reader = new FileReader();
  reader.onload = (ev) => {
    setTimeout(() => {
      scanOverlay.classList.remove("active");
      userInput.value = `File uploaded:\n\n${ev.target.result.slice(0, 2000)}`;
      userInput.style.height = "auto";
      userInput.style.height = userInput.scrollHeight + "px";
    }, 2000);
  };
  reader.readAsText(file);
});

// ── MOBILE TABS ──
function isMobile() {
  return window.innerWidth <= 768;
}

function switchTab(tab) {
  const left = document.querySelector(".left-pane");
  const right = document.querySelector(".right-pane");
  const chatTab = document.getElementById("chatTab");
  const canvasTab = document.getElementById("canvasTab");
  if (tab === "chat") {
    left.classList.add("mobile-active");
    right.classList.remove("mobile-active");
    chatTab?.classList.add("active");
    canvasTab?.classList.remove("active");
  } else {
    right.classList.add("mobile-active");
    left.classList.remove("mobile-active");
    canvasTab?.classList.add("active");
    chatTab?.classList.remove("active");
  }
}

if (isMobile()) {
  document.querySelector(".left-pane")?.classList.add("mobile-active");
}

// ── SWIPE GESTURE ──
let touchStartX = 0,
  touchStartY = 0;
document.addEventListener(
  "touchstart",
  (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  },
  { passive: true },
);
document.addEventListener(
  "touchend",
  (e) => {
    if (!isMobile()) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    switchTab(dx < 0 ? "canvas" : "chat");
  },
  { passive: true },
);

// ── PROFILE DROPDOWN ──
function toggleProfileMenu() {
  document.getElementById("profileDropdown")?.classList.toggle("open");
}

document.addEventListener("click", (e) => {
  const profile = document.getElementById("userProfile");
  const dropdown = document.getElementById("profileDropdown");
  if (profile && dropdown && !profile.contains(e.target)) {
    dropdown.classList.remove("open");
  }
});

// ── LOAD USER ──
async function loadUser() {
  try {
    const res = await fetch("/api/user");
    if (!res.ok) {
      window.location.href = "/login";
      return;
    }
    const user = await res.json();
    const p = document.getElementById("userPhoto");
    const n = document.getElementById("userName");
    const dp = document.getElementById("dropdownPhoto");
    const dn = document.getElementById("dropdownName");
    const de = document.getElementById("dropdownEmail");
    if (p) p.src = user.photo;
    if (n) n.textContent = user.name.split(" ")[0];
    if (dp) dp.src = user.photo;
    if (dn) dn.textContent = user.name;
    if (de) de.textContent = user.email;
  } catch (err) {
    window.location.href = "/login";
  }
}

loadUser();
initVoice();

// ── SERVICE WORKER ──
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then(() => console.log("Cortex PWA ready"))
      .catch((err) => console.log("SW error:", err));
  });
}
