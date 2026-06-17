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
  splashScene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const pl1 = new THREE.PointLight(0x8ab4ff, 4, 18);
  pl1.position.set(4, 2, 4);
  splashScene.add(pl1);
  const pl2 = new THREE.PointLight(0x6a3fc8, 2, 14);
  pl2.position.set(-3, 3, 2);
  splashScene.add(pl2);

  const pl3 = new THREE.PointLight(0xffffff, 1.8, 12);
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

  const hs = hexShape(1.42);
  hs.holes.push(hexShape(1.34)); // thinner ring (was 1.28)
  const spinHex = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hs, {
      depth: 0.06, // shallower (was 0.1)
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 6,
    }),
    new THREE.MeshPhysicalMaterial({
      color: 0x9fc8ff, // lighter blue (was 0x88aaff)
      metalness: 0.2, // less heavy metal
      roughness: 0.1, // smoother
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.92,
      emissive: 0x8ab4ff, // brighter emissive (was 0x6699ff)
      emissiveIntensity: 0.7, // much brighter glow (was 0.35)
    }),
  );
  spinHex.position.z = -0.03;

  const innerPanel = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hexShape(1.24), {
      depth: 0.04,
      bevelEnabled: false,
    }),
    new THREE.MeshPhysicalMaterial({
      color: 0x0d0d14,
      metalness: 0,
      roughness: 1,
      transparent: true,
      opacity: 0.0,
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
const panicBtn = document.getElementById("panicBtnMenu");
const vivaBtn = document.getElementById("vivaBtnMenu");
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

// ── CLEAR CANVAS ──
clearCanvas.addEventListener("click", () => {
  canvasArea.innerHTML = "";
  canvasArea.appendChild(canvasEmpty);
  canvasEmpty.style.display = "flex";
});

// ── SEND MESSAGE ──
async function sendMessage() {
  const text = userInput.value.trim();

  // If file is selected, upload and analyze it
  if (selectedFile) {
    const message = text || null;
    userInput.value = "";
    userInput.style.height = "auto";
    await uploadAndAnalyze(selectedFile, message);
    return;
  }

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
  const isLong = text.includes("```") && text.length > 800;
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
  // Code blocks
  text = text.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_, lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`,
  );
  // Inline code
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Headers
  text = text.replace(
    /^### (.+)$/gm,
    '<p style="font-weight:600;font-size:15px;color:var(--text);margin:10px 0 4px">$1</p>',
  );
  text = text.replace(
    /^## (.+)$/gm,
    '<p style="font-weight:600;font-size:16px;color:var(--text);margin:10px 0 4px">$1</p>',
  );
  text = text.replace(
    /^# (.+)$/gm,
    '<p style="font-weight:700;font-size:17px;color:var(--accent);margin:10px 0 4px">$1</p>',
  );
  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Italic
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // Numbered list
  text = text.replace(
    /^\d+\.\s+(.+)$/gm,
    '<div class="numbered-item">$1</div>',
  );
  // Bullet points
  text = text
    .split("\n")
    .map((line) =>
      line.match(/^\s*[\*\-]\s+/)
        ? '<div class="bullet">' + line.replace(/^\s*[\*\-]\s+/, "") + "</div>"
        : line,
    )
    .join("\n");
  // Clean up extra line breaks
  text = text.replace(/(<\/div>|<\/pre>|<\/p>)\n/g, "$1");
  text = text.replace(/\n{2,}/g, "<br><br>");
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

  const originalHTML = voiceBtn.innerHTML;
  const micIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
  const stopIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;

  function resetBtn() {
    isListening = false;
    voiceBtn.classList.remove("listening");
    voiceBtn.innerHTML = micIcon;
  }

  recognition.onresult = (e) => {
    userInput.value = e.results[0][0].transcript;
    userInput.style.height = "auto";
    userInput.style.height = userInput.scrollHeight + "px";
    resetBtn();
  };

  recognition.onerror = () => resetBtn();
  recognition.onend = () => resetBtn();

  voiceBtn.addEventListener("click", () => {
    if (isListening) {
      recognition.stop();
      resetBtn();
    } else {
      recognition.start();
      isListening = true;
      voiceBtn.classList.add("listening");
      voiceBtn.innerHTML = stopIcon;
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

// ── FILE HANDLING ──
let selectedFile = null;

function showFilePreview(file) {
  // Remove existing preview
  const existing = document.getElementById("filePreview");
  if (existing) existing.remove();

  const icon = file.type.startsWith("image/")
    ? "🖼️"
    : file.name.endsWith(".pdf")
      ? "📄"
      : "📝";
  const preview = document.createElement("div");
  preview.className = "file-preview";
  preview.id = "filePreview";
  preview.innerHTML = `
    <span class="file-preview-icon">${icon}</span>
    <span class="file-preview-name">${file.name}</span>
    <button class="file-preview-remove" onclick="removeFile()">✕</button>
  `;
  dropZone.insertBefore(preview, dropZone.querySelector(".input-pill"));
  selectedFile = file;
}

function removeFile() {
  const existing = document.getElementById("filePreview");
  if (existing) existing.remove();
  selectedFile = null;
  document.getElementById("fileInput").value = "";
}

// File input change
document.getElementById("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) showFilePreview(file);
});

// Drag & drop
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
  if (file) showFilePreview(file);
});

// ── UPLOAD & ANALYZE FILE ──
async function uploadAndAnalyze(file, message) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "message",
    message ||
      `Analyze this ${file.name.endsWith(".pdf") ? "PDF" : "file"} and give me a clear summary of the key points and important information.`,
  );

  // Show uploading indicator
  const uploadingDiv = document.createElement("div");
  uploadingDiv.className = "uploading-indicator";
  uploadingDiv.id = "uploadingIndicator";
  uploadingDiv.textContent = `📤 Analyzing ${file.name}...`;
  chatArea.appendChild(uploadingDiv);
  scrollChat();

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    document.getElementById("uploadingIndicator")?.remove();

    const data = await res.json();
    if (data.reply) {
      // Show file message in chat
      const fileMsg = document.createElement("div");
      fileMsg.className = "msg msg-user";
      fileMsg.innerHTML = `📎 <em>${file.name}</em>`;
      chatArea.appendChild(fileMsg);

      chatHistory.push({
        role: "user",
        content: `[Uploaded file: ${file.name}]`,
      });
      chatHistory.push({ role: "assistant", content: data.reply });
      appendAIMessage(data.reply);
    } else {
      appendAIMessage(
        "Could not analyze file: " + (data.error || "Unknown error"),
      );
    }
  } catch (err) {
    document.getElementById("uploadingIndicator")?.remove();
    appendAIMessage("File upload failed. Check your connection.");
  }

  removeFile();
}

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
  // First unregister ALL old service workers and clear ALL caches
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => reg.unregister());
  });
  caches.keys().then((keys) => {
    keys.forEach((key) => caches.delete(key));
  });

  // Re-register fresh after a short delay
  window.addEventListener("load", () => {
    setTimeout(() => {
      navigator.serviceWorker
        .register("/service-worker.js")
        .then(() => console.log("Cortex PWA ready"))
        .catch((err) => console.log("SW error:", err));
    }, 2000);
  });
}

function toggleViva() {
  vivaBtn.click ? null : null;
  vivaMode = !vivaMode;
  if (panicMode) {
    panicMode = false;
    document.getElementById("panicBtnMenu").classList.remove("active");
  }
  document.getElementById("vivaBtnMenu").classList.toggle("active", vivaMode);
  document.getElementById("vivaBtnMenu").textContent = vivaMode
    ? "🎓 Viva ON"
    : "🎓 Viva Mode";
  if (vivaMode) {
    chatHistory = [];
    appendSystemNotice(
      "🎓 <strong>Viva Mode ON.</strong> Tell me the topic and I'll fire questions at you.",
    );
  } else {
    appendSystemNotice("Viva Mode off. Good session!");
  }
}

function togglePanic() {
  panicMode = !panicMode;
  if (vivaMode) {
    vivaMode = false;
    document.getElementById("vivaBtnMenu").classList.remove("active");
  }
  document.getElementById("panicBtnMenu").classList.toggle("active", panicMode);
  document.getElementById("panicBtnMenu").textContent = panicMode
    ? "⚡ Panic ON"
    : "⚡ Panic Mode";
  appendSystemNotice(
    panicMode
      ? "⚡ <strong>Panic Mode ON.</strong> Bullet points and key facts only."
      : "Panic Mode off. Back to normal explanations.",
  );
}

function appendSystemNotice(html) {
  const notice = document.createElement("div");
  notice.className = "msg msg-ai";
  notice.innerHTML = `<span class="msg-label">Cortex</span>${html}`;
  chatArea.appendChild(notice);
  scrollChat();
}

// ══════════════════════════════════════
// NAV & TAB SWITCHING
// ══════════════════════════════════════

function switchNav(tab) {
  // Update sidebar active state
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.nav === tab);
  });
  // Update mobile nav active state
  document.querySelectorAll(".mobile-nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.nav === tab);
  });
  // Show/hide tab views
  document.querySelectorAll(".tab-view").forEach((section) => {
    section.classList.toggle("hidden", section.id !== `tab-${tab}`);
  });
  // Update home greeting
  if (tab === "home") updateGreeting();
  // Load history when switching to history tab
  if (tab === "history") loadHistory();
}

function updateGreeting() {
  const h = new Date().getHours();
  const greet =
    h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const titleEl = document.querySelector("#tab-home .tab-title");
  if (titleEl) titleEl.textContent = `${greet} 👋`;
}
updateGreeting();

// ── MODE SELECTOR ──
let currentMode = "normal";

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document
    .getElementById(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`)
    ?.classList.add("active");

  // Sync with vivaMode / panicMode flags
  if (mode === "viva") {
    vivaMode = true;
    panicMode = false;
    appendSystemNotice(
      "🎓 <strong>Viva Mode ON.</strong> Tell me the topic and I'll fire questions at you.",
    );
  } else if (mode === "panic") {
    panicMode = true;
    vivaMode = false;
    appendSystemNotice(
      "⚡ <strong>Panic Mode ON.</strong> Bullet points and key facts only.",
    );
  } else {
    vivaMode = false;
    panicMode = false;
    appendSystemNotice("Normal mode. Full explanations resumed.");
  }

  // Update settings toggles
  syncModeToggles();
}

function syncModeToggles() {
  const vivaToggle = document.getElementById("vivaToggle");
  const panicToggle = document.getElementById("panicToggle");
  if (vivaToggle) {
    vivaToggle.textContent = vivaMode ? "On" : "Off";
    vivaToggle.classList.toggle("on", vivaMode);
  }
  if (panicToggle) {
    panicToggle.textContent = panicMode ? "On" : "Off";
    panicToggle.classList.toggle("on", panicMode);
  }
}

// ── THEME TOGGLE ──
function toggleTheme() {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("cortex-theme", isLight ? "light" : "dark");
  const btn = document.getElementById("themeToggleSetting");
  if (btn) btn.textContent = isLight ? "Light" : "Dark";
  const topBtn = document.getElementById("themeToggleBtn");
  if (topBtn) topBtn.title = isLight ? "Switch to Dark" : "Switch to Light";
}

// Load saved theme
(function () {
  const saved = localStorage.getItem("cortex-theme");
  if (saved === "light") {
    document.body.classList.add("light");
    const btn = document.getElementById("themeToggleSetting");
    if (btn) btn.textContent = "Light";
  }
})();

// ── LANGUAGE ──
let selectedLanguage = "English";

function setLanguage(lang) {
  selectedLanguage = lang;
  localStorage.setItem("cortex-language", lang);
  appendSystemNotice(`🌐 Cortex will now respond in <strong>${lang}</strong>.`);
}

// Load saved language
(function () {
  const saved = localStorage.getItem("cortex-language");
  if (saved) {
    selectedLanguage = saved;
    const sel = document.getElementById("langSelect");
    if (sel) sel.value = saved;
  }
})();

// ── STUDY PLANNER ──
let plannerSessions = JSON.parse(
  localStorage.getItem("cortex-planner") || "[]",
);

function openPlannerModal() {
  document.getElementById("plannerModal")?.classList.remove("hidden");
}

function closePlannerModal() {
  document.getElementById("plannerModal")?.classList.add("hidden");
  document.getElementById("plannerSubject").value = "";
  document.getElementById("plannerDate").value = "";
  document.getElementById("plannerDuration").value = "";
}

function savePlannerSession() {
  const subject = document.getElementById("plannerSubject").value.trim();
  const date = document.getElementById("plannerDate").value;
  const duration = document.getElementById("plannerDuration").value.trim();
  if (!subject || !date) return;

  const session = { id: Date.now(), subject, date, duration };
  plannerSessions.unshift(session);
  localStorage.setItem("cortex-planner", JSON.stringify(plannerSessions));
  renderPlanner();
  closePlannerModal();
}

function deletePlannerSession(id) {
  plannerSessions = plannerSessions.filter((s) => s.id !== id);
  localStorage.setItem("cortex-planner", JSON.stringify(plannerSessions));
  renderPlanner();
}

function renderPlanner() {
  const list = document.getElementById("plannerList");
  if (!list) return;
  if (plannerSessions.length === 0) {
    list.innerHTML =
      '<p class="empty-hint">No sessions planned. Add one to get started.</p>';
    return;
  }
  list.innerHTML = plannerSessions
    .map((s) => {
      const d = s.date
        ? new Date(s.date + "T00:00:00").toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })
        : "";
      return `<div class="planner-item">
      <div class="planner-item-dot"></div>
      <div class="planner-item-info">
        <div class="planner-item-subject">${s.subject}</div>
        <div class="planner-item-meta">${d}${s.duration ? " · " + s.duration : ""}</div>
      </div>
      <button class="planner-item-delete" onclick="deletePlannerSession(${s.id})">×</button>
    </div>`;
    })
    .join("");
}
renderPlanner();

// ── HISTORY ──
async function loadHistory() {
  const list = document.getElementById("historyList");
  if (!list) return;

  try {
    const res = await fetch("/api/history");
    if (!res.ok) throw new Error("not ok");
    const sessions = await res.json();

    if (!sessions || sessions.length === 0) {
      list.innerHTML = `<div class="history-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <p>No history yet</p><span>Your chat sessions will appear here</span>
      </div>`;
      return;
    }

    list.innerHTML = sessions
      .map((s) => {
        const date = new Date(s.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        const time = new Date(s.createdAt).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const preview =
          s.title ||
          s.messages?.[0]?.content?.slice(0, 60) + "..." ||
          "Chat session";
        return `<div class="history-item" onclick="continueSession('${s._id}')">
        <div class="history-item-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="history-item-info">
          <div class="history-item-title">${preview}</div>
          <div class="history-item-meta">${date} at ${time} · ${s.messages?.length || 0} messages</div>
        </div>
        <button class="history-continue-btn" onclick="event.stopPropagation(); continueSession('${s._id}')">Continue →</button>
      </div>`;
      })
      .join("");
  } catch {
    list.innerHTML = `<div class="history-empty"><p>History unavailable</p><span>Save chats to see them here</span></div>`;
  }
}

async function continueSession(id) {
  try {
    const res = await fetch(`/api/history/${id}`);
    if (!res.ok) return;
    const session = await res.json();
    chatHistory = session.messages || [];
    switchNav("chat");
    const chatArea = document.getElementById("chatArea");
    chatArea.innerHTML = "";
    chatHistory.forEach((msg) => {
      if (msg.role === "user") appendUserMessage(msg.content);
      else if (msg.role === "assistant") appendAIMessage(msg.content);
    });
    scrollChat();
  } catch (e) {
    console.error("Could not load session", e);
  }
}

// ── STATS ──
function updateStats() {
  const chats = parseInt(localStorage.getItem("cortex-stat-chats") || "0");
  const flashcards = parseInt(
    localStorage.getItem("cortex-stat-flashcards") || "0",
  );
  const notes = parseInt(localStorage.getItem("cortex-stat-notes") || "0");
  const ce = document.getElementById("statChats");
  const fe = document.getElementById("statFlashcards");
  const ne = document.getElementById("statNotes");
  if (ce) ce.textContent = chats;
  if (fe) fe.textContent = flashcards;
  if (ne) ne.textContent = notes;
}
updateStats();
