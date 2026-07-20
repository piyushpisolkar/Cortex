// ══════════════════════════════════════════
// CORTEX
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
  canvasItemCount = 0;
  const badge = document.getElementById("canvasBadge");
  if (badge) badge.style.display = "none";
  closeCanvasDrawer();
});

// ── NEW CHAT ──
function newChat() {
  chatHistory = [];
  currentSessionId = null; // Reset so next save creates a NEW session
  clearTimeout(_saveTimer); // Cancel any pending save from previous chat
  if (chatArea) {
    chatArea.innerHTML = "";
    const welcome = document.createElement("div");
    welcome.className = "msg msg-ai";
    welcome.innerHTML = `<div class="msg-ai-spinner"><svg class="cx-chat-mark done" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><g class="cx-spin-orbit"><circle cx="14" cy="14" r="12.5" stroke="#AFA9EC" stroke-width="0.8" fill="none"/><circle cx="14" cy="1.5" r="1.6" fill="#AFA9EC"/><circle cx="26.5" cy="14" r="1.6" fill="#AFA9EC"/><circle cx="14" cy="26.5" r="1.6" fill="#AFA9EC"/><circle cx="1.5" cy="14" r="1.6" fill="#AFA9EC"/></g><g class="cx-breathe"><circle cx="14" cy="14" r="7.5" stroke="#534AB7" stroke-width="3.2" fill="none" class="cx-pulse"/><line x1="14" y1="9.8" x2="14" y2="7" stroke="#534AB7" stroke-width="2.2" stroke-linecap="round"/><line x1="18.2" y1="14" x2="21" y2="14" stroke="#534AB7" stroke-width="2.2" stroke-linecap="round"/><line x1="14" y1="18.2" x2="14" y2="21" stroke="#534AB7" stroke-width="2.2" stroke-linecap="round"/><line x1="9.8" y1="14" x2="7" y2="14" stroke="#534AB7" stroke-width="2.2" stroke-linecap="round"/><circle cx="14" cy="14" r="2.8" fill="#534AB7"/></g></svg><span>Hey! I'm Cortex, your personal study intelligence. Ask me anything — concepts, code, theory, viva prep. What are we studying today?</span></div>`;
    chatArea.appendChild(welcome);
  }
  setMode("normal");
  switchNav("chat");
}

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
      // Auto-save to history after every exchange
      autoSaveHistory();
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
    <button class="action-btn read-aloud-btn" data-tooltip="Read aloud" onclick="speakText(this)" data-speaking="false">
      <svg class="icon-speaker" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
      <svg class="icon-pause" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="display:none">
        <line x1="6" y1="4" x2="6" y2="20"/>
        <line x1="18" y1="4" x2="18" y2="20"/>
      </svg>
    </button>
  `;
  return actions;
}

// ── CANVAS DRAWER (mobile) ──
let canvasItemCount = 0;

function toggleCanvasDrawer() {
  const panel = document.getElementById("canvasPanel");
  const backdrop = document.getElementById("canvasBackdrop");
  const isOpen = panel?.classList.contains("drawer-open");
  if (isOpen) {
    closeCanvasDrawer();
  } else {
    panel?.classList.add("drawer-open");
    backdrop.style.display = "block";
    document.body.style.overflow = "hidden";
    // Reset badge when user views canvas
    canvasItemCount = 0;
    const badge = document.getElementById("canvasBadge");
    if (badge) badge.style.display = "none";
  }
}

function closeCanvasDrawer() {
  const panel = document.getElementById("canvasPanel");
  const backdrop = document.getElementById("canvasBackdrop");
  panel?.classList.remove("drawer-open");
  if (backdrop) backdrop.style.display = "none";
  document.body.style.overflow = "";
}

function updateCanvasBadge() {
  canvasItemCount++;
  const badge = document.getElementById("canvasBadge");
  const btn = document.getElementById("canvasToggleBtn");
  if (badge) {
    badge.textContent = canvasItemCount;
    badge.style.display = "inline-block";
  }
  if (btn) {
    // Pulse animation to draw attention
    btn.style.transform = "scale(1.12)";
    setTimeout(() => { btn.style.transform = ""; }, 200);
  }
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
  updateCanvasBadge();
  // On mobile auto-open the drawer so user sees the content
  if (isMobile()) {
    setTimeout(() => toggleCanvasDrawer(), 300);
  }
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
  updateCanvasBadge();
  if (isMobile()) {
    setTimeout(() => toggleCanvasDrawer(), 300);
  }
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

// ── READ ALOUD — with pause/resume toggle ──
let currentSpeakBtn = null;

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-IN";
  utter.rate = 0.95;
  utter.onend = () => resetSpeakBtn(currentSpeakBtn);
  utter.onerror = () => resetSpeakBtn(currentSpeakBtn);
  window.speechSynthesis.speak(utter);
}

function resetSpeakBtn(btn) {
  if (!btn) return;
  btn.dataset.speaking = "false";
  const speaker = btn.querySelector(".icon-speaker");
  const pause = btn.querySelector(".icon-pause");
  if (speaker) speaker.style.display = "";
  if (pause) pause.style.display = "none";
  btn.style.color = "";
  currentSpeakBtn = null;
}

function speakText(btn) {
  const isSpeaking = btn.dataset.speaking === "true";
  const speaker = btn.querySelector(".icon-speaker");
  const pause = btn.querySelector(".icon-pause");

  // If this button is currently speaking → pause
  if (isSpeaking) {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      // show speaker icon (paused state)
      if (speaker) speaker.style.display = "";
      if (pause) pause.style.display = "none";
      btn.style.color = "var(--text-muted)";
    } else if (window.speechSynthesis.paused) {
      // Resume
      window.speechSynthesis.resume();
      if (speaker) speaker.style.display = "none";
      if (pause) pause.style.display = "";
      btn.style.color = "var(--accent)";
    }
    return;
  }

  // Stop any previous read aloud
  if (currentSpeakBtn && currentSpeakBtn !== btn) {
    resetSpeakBtn(currentSpeakBtn);
  }
  window.speechSynthesis.cancel();

  // Start new read aloud
  const actionsDiv = btn.parentElement;
  const text =
    actionsDiv.dataset.fullText ||
    actionsDiv.previousElementSibling?.innerText ||
    "";
  const clean = text.replace(/[#*`<>]/g, "").substring(0, 800);

  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = "en-IN";
  utter.rate = 0.95;
  utter.onend = () => resetSpeakBtn(btn);
  utter.onerror = () => resetSpeakBtn(btn);

  currentSpeakBtn = btn;
  btn.dataset.speaking = "true";
  if (speaker) speaker.style.display = "none";
  if (pause) pause.style.display = "";
  btn.style.color = "var(--accent)";

  window.speechSynthesis.speak(utter);
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
let currentUserName = "";

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
    // Store first name globally and update greeting
    currentUserName = user.name.split(" ")[0];
    updateGreeting();
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
  if (vivaMode) {
    setMode("normal");
    appendSystemNotice("Viva Mode off.");
  } else {
    setMode("viva");
    chatHistory = [];
    appendSystemNotice(
      "🎓 <strong>Viva Mode ON.</strong> Tell me the topic and I'll fire questions at you.",
    );
  }
  switchNav("chat");
}

function togglePanic() {
  if (panicMode) {
    setMode("normal");
    appendSystemNotice("Panic Mode off. Back to normal explanations.");
  } else {
    setMode("panic");
    appendSystemNotice(
      "⚡ <strong>Panic Mode ON.</strong> Bullet points and key facts only.",
    );
  }
  switchNav("chat");
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
  const subtitleEl = document.querySelector("#tab-home .tab-subtitle");
  if (titleEl) {
    titleEl.textContent = currentUserName
      ? `${greet}, ${currentUserName}! 👋`
      : `${greet} 👋`;
  }
  if (subtitleEl) {
    const msgs = [
      "What are we studying today?",
      "Ready to learn something new?",
      "Let's make today productive!",
      "Your study session awaits.",
    ];
    subtitleEl.textContent = msgs[Math.floor(Math.random() * msgs.length)];
  }
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
  } else if (mode === "panic") {
    panicMode = true;
    vivaMode = false;
  } else {
    vivaMode = false;
    panicMode = false;
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
  // Update language badge in topbar if present
  const badge = document.getElementById("langBadge");
  if (badge) badge.textContent = lang;
  // Sync select
  const sel = document.getElementById("langSelect");
  if (sel) sel.value = lang;
  // No system notice - just silently switch
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

// ── STUDY PLANNER — MongoDB backed, cross-device ──
let plannerSessions = [];

async function loadPlanner() {
  try {
    const res = await fetch("/api/planner", {
      headers: { "Cache-Control": "no-cache" },
    });
    if (res.ok) {
      plannerSessions = await res.json();
      renderPlanner();
    }
  } catch (e) {
    // Fall back to localStorage if offline
    plannerSessions = JSON.parse(
      localStorage.getItem("cortex-planner") || "[]",
    );
    renderPlanner();
  }
}

function openPlannerModal() {
  document.getElementById("plannerModal")?.classList.remove("hidden");
}

function closePlannerModal() {
  document.getElementById("plannerModal")?.classList.add("hidden");
  document.getElementById("plannerSubject").value = "";
  document.getElementById("plannerDate").value = "";
  document.getElementById("plannerDuration").value = "";
}

async function savePlannerSession() {
  const subject = document.getElementById("plannerSubject").value.trim();
  const date = document.getElementById("plannerDate").value;
  const duration = document.getElementById("plannerDuration").value.trim();
  if (!subject || !date) return;

  try {
    const res = await fetch("/api/planner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, date, duration }),
    });
    const data = await res.json();
    if (data.ok && data.session) {
      plannerSessions.unshift(data.session);
      renderPlanner();
    }
  } catch (e) {
    // Offline fallback
    const session = { _id: Date.now(), subject, date, duration };
    plannerSessions.unshift(session);
    localStorage.setItem("cortex-planner", JSON.stringify(plannerSessions));
    renderPlanner();
  }
  closePlannerModal();
}

async function deletePlannerSession(id) {
  try {
    await fetch(`/api/planner/${id}`, { method: "DELETE" });
  } catch (e) {
    /* ignore */
  }
  plannerSessions = plannerSessions.filter((s) => String(s._id) !== String(id));
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
      <button class="planner-item-delete" onclick="deletePlannerSession('${s._id}')">×</button>
    </div>`;
    })
    .join("");
}
loadPlanner();

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
        return `<div class="history-item" id="hist-${s._id}">
        <div class="history-item-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="history-item-info" onclick="continueSession('${s._id}')" style="cursor:pointer">
          <div class="history-item-title">${preview}</div>
          <div class="history-item-meta">${date} at ${time} · ${s.messages?.length || 0} messages</div>
        </div>
        <div class="history-item-actions">
          <button class="history-continue-btn" onclick="continueSession('${s._id}')">Continue →</button>
          <button class="history-delete-btn" onclick="deleteSession('${s._id}')" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
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
    currentSessionId = id;
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

async function deleteSession(id) {
  if (!confirm("Delete this chat session?")) return;
  try {
    const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      const el = document.getElementById(`hist-${id}`);
      if (el) {
        el.style.opacity = "0";
        el.style.transform = "translateX(20px)";
        el.style.transition = "all 0.3s ease";
        setTimeout(() => {
          el.remove();
        }, 300);
      }
    }
  } catch (e) {
    console.error("Could not delete session", e);
  }
}

// ── STATS — fetch from server for cross-device sync ──
async function updateStats() {
  try {
    const res = await fetch("/api/history", {
      headers: { "Cache-Control": "no-cache" },
    });
    if (res.ok) {
      const sessions = await res.json();
      const chats = sessions.length || 0;
      const ce = document.getElementById("statChats");
      if (ce) ce.textContent = chats;
    }
  } catch {
    /* silently fail */
  }
  // Flashcards and notes still local for now
  const flashcards = parseInt(
    localStorage.getItem("cortex-stat-flashcards") || "0",
  );
  const notes = parseInt(localStorage.getItem("cortex-stat-notes") || "0");
  const fe = document.getElementById("statFlashcards");
  const ne = document.getElementById("statNotes");
  if (fe) fe.textContent = flashcards;
  if (ne) ne.textContent = notes;
}
updateStats();

// ── CUSTOM LANGUAGE PICKER ──
function toggleLangPicker(e) {
  e.stopPropagation();
  const dd = document.getElementById("langPickerDropdown");
  if (dd) dd.classList.toggle("open");
}

function pickLanguage(lang, flag, btn) {
  setLanguage(lang);
  // Update picker button display
  const label = document.getElementById("langPickerLabel");
  const flagEl = document.getElementById("langPickerFlag");
  if (label) label.textContent = lang;
  if (flagEl) flagEl.textContent = flag;
  // Update lang badge (2-letter code)
  const badge = document.getElementById("langBadge");
  if (badge) {
    const codes = {
      English: "EN",
      Hindi: "HI",
      Marathi: "MR",
      Tamil: "TA",
      Telugu: "TE",
      Bengali: "BN",
      Gujarati: "GU",
    };
    badge.textContent = codes[lang] || lang.substring(0, 2).toUpperCase();
  }
  // Update active state
  document
    .querySelectorAll(".lang-option")
    .forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  // Close dropdown
  const dd = document.getElementById("langPickerDropdown");
  if (dd) dd.classList.remove("open");
}

// Close lang picker on outside click
document.addEventListener("click", function (e) {
  const picker = document.getElementById("langPicker");
  if (picker && !picker.contains(e.target)) {
    const dd = document.getElementById("langPickerDropdown");
    if (dd) dd.classList.remove("open");
  }
});

// Restore saved language on load
(function () {
  const saved = localStorage.getItem("cortex-language");
  if (saved && saved !== "English") {
    const flags = {
      Hindi: "🇮🇳",
      Marathi: "🇮🇳",
      Tamil: "🇮🇳",
      Telugu: "🇮🇳",
      Bengali: "🇮🇳",
      Gujarati: "🇮🇳",
    };
    const codes = {
      Hindi: "HI",
      Marathi: "MR",
      Tamil: "TA",
      Telugu: "TE",
      Bengali: "BN",
      Gujarati: "GU",
    };
    const label = document.getElementById("langPickerLabel");
    const flag = document.getElementById("langPickerFlag");
    const badge = document.getElementById("langBadge");
    if (label) label.textContent = saved;
    if (flag) flag.textContent = flags[saved] || "🌐";
    if (badge)
      badge.textContent = codes[saved] || saved.substring(0, 2).toUpperCase();
    selectedLanguage = saved;
    // Mark active option
    document.querySelectorAll(".lang-option").forEach((b) => {
      if (b.textContent.trim().includes(saved)) b.classList.add("active");
      else b.classList.remove("active");
    });
  }
})();

// ── AUTO-SAVE HISTORY ──
// currentSessionId tracks the current session — set once, reused for updates
let currentSessionId = null;
let _saveTimer = null;

async function autoSaveHistory() {
  // Debounce — wait 1s after last message before saving
  // This prevents rapid duplicate saves during fast exchanges
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      if (chatHistory.length < 2) return;

      // Always pass currentSessionId if we have one — server will UPDATE not CREATE
      const body = {
        messages: chatHistory.map(({ role, content }) => ({ role, content })),
        id: currentSessionId || undefined,
      };

      const res = await fetch("/api/history/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.ok && data.id) {
        // Lock this session ID — all future saves will UPDATE this same session
        currentSessionId = data.id;
      }
      updateStats();
    } catch (e) {
      // Silently fail — history save is non-critical
    }
  }, 1000);
}
