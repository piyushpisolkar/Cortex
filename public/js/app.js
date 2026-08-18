// ══════════════════════════════════════════
// CORTEX
// ══════════════════════════════════════════

// ── STATE (all at top — const is not hoisted) ──
let chatHistory = [];
let panicMode   = false;
let vivaMode    = false;
let isListening = false;
let currentSessionId = null;
let _saveTimer       = null;
let selectedLanguage = localStorage.getItem("cortex-language") || "English";
let canvasItemCount  = 0;
let plannerSessions  = [];
let currentSpeakBtn  = null;
let selectedFile     = null;
let drawerTouchStartY = 0;

// ── CORTEX SPINNER MARK ──
const CX_MARK_SVG = `<svg class="cx-chat-mark" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g class="cx-spin-orbit">
    <circle cx="14" cy="14" r="12.5" stroke="#AFA9EC" stroke-width="0.8" fill="none"/>
    <circle cx="14" cy="1.5"  r="1.6" fill="#AFA9EC"/>
    <circle cx="26.5" cy="14" r="1.6" fill="#AFA9EC"/>
    <circle cx="14" cy="26.5" r="1.6" fill="#AFA9EC"/>
    <circle cx="1.5"  cy="14" r="1.6" fill="#AFA9EC"/>
  </g>
  <g class="cx-breathe">
    <circle cx="14" cy="14" r="7.5" stroke="#534AB7" stroke-width="3.2" fill="none" class="cx-pulse"/>
    <line x1="14"   y1="9.8"  x2="14"   y2="7"    stroke="#534AB7" stroke-width="2.2" stroke-linecap="round"/>
    <line x1="18.2" y1="14"   x2="21"   y2="14"   stroke="#534AB7" stroke-width="2.2" stroke-linecap="round"/>
    <line x1="14"   y1="18.2" x2="14"   y2="21"   stroke="#534AB7" stroke-width="2.2" stroke-linecap="round"/>
    <line x1="9.8"  y1="14"   x2="7"    y2="14"   stroke="#534AB7" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="14" cy="14" r="2.8" fill="#534AB7"/>
  </g>
</svg>`;

// ── ELEMENTS ──
const chatArea   = document.getElementById("chatArea");
const userInput  = document.getElementById("userInput");
const sendBtn    = document.getElementById("sendBtn");
const canvasArea = document.getElementById("canvasArea");
const canvasEmpty = document.getElementById("canvasEmpty");
const clearCanvas = document.getElementById("clearCanvas");
const dropZone   = document.getElementById("dropZone");

// ── AUTO RESIZE TEXTAREA ──
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = userInput.scrollHeight + "px";
});

// ── SEND ON ENTER ──
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
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
  currentSessionId = null;
  clearTimeout(_saveTimer);
  if (chatArea) {
    chatArea.innerHTML = "";
    const welcome = document.createElement("div");
    welcome.className = "msg msg-ai";
    const lm = CX_MARK_SVG.replace("cx-chat-mark", "cx-chat-mark done");
    welcome.innerHTML = `<div class="msg-ai-spinner">${lm}<span>Hey! I'm Cortex, your personal study intelligence. Ask me anything — concepts, code, theory, viva prep. What are we studying today?</span></div>`;
    chatArea.appendChild(welcome);
  }
  setMode("normal");
  switchNav("chat");
}

// ── SEND MESSAGE ──
async function sendMessage() {
  const text = userInput.value.trim();
  if (selectedFile) {
    const msg = text || null;
    userInput.value = "";
    userInput.style.height = "auto";
    await uploadAndAnalyze(selectedFile, msg);
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
        language: selectedLanguage || "English",
        snapshot: cachedStudentSnapshot,
      }),
    });
    const data = await res.json();
    removeTyping(typing);
    if (data.reply) {
      chatHistory.push({ role: "user", content: text });
      chatHistory.push({ role: "assistant", content: data.reply });
      appendAIMessage(data.reply);
      autoSaveHistory();
    } else {
      appendAIMessage(data.error || "Something went wrong. Try again.");
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
  const lm = CX_MARK_SVG.replace("cx-chat-mark", "cx-chat-mark done");
  const isLong = text.includes("```") && text.length > 800;
  const div = document.createElement("div");
  div.className = "msg msg-ai";
  if (isLong) {
    pushToCanvas(text);
    div.innerHTML = `<div class="msg-ai-spinner">${lm}<span>Pushed to <strong style="color:var(--teal)">Canvas →</strong></span></div>`;
  } else {
    div.innerHTML = `<div class="msg-ai-spinner">${lm}<div class="msg-ai-content">${formatMessage(text)}</div></div>`;
  }
  chatArea.appendChild(div);
  chatArea.appendChild(makeActions(text));
  scrollChat();
  if (document.getElementById("readAloudToggle")?.checked) {
    speak(text.replace(/[#*`]/g, "").substring(0, 500));
  }
}

// ── MAKE ACTIONS ──
function makeActions(text) {
  const actions = document.createElement("div");
  actions.className = "msg-actions";
  actions.dataset.fullText = text;
  actions.innerHTML = `
    <button class="action-btn" onclick="summarize(this,'shorter')">Shorter</button>
    <button class="action-btn" onclick="summarize(this,'longer')">More detail</button>
    <button class="action-btn" onclick="makeFlashcard(this)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px;vertical-align:middle"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>Flashcard
    </button>
    <button class="action-btn" onclick="pinNote(this)">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px;vertical-align:middle"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>Pin Note
    </button>
    <button class="action-btn read-aloud-btn" onclick="speakText(this)" data-speaking="false">
      <svg class="icon-speaker" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
      <svg class="icon-pause" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="display:none">
        <line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/>
      </svg>
    </button>`;
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
  if (isMobile()) setTimeout(() => toggleCanvasDrawer(), 300);
  else updateCanvasBadge();
}

// ── FORMAT MESSAGE ──
function formatMessage(text) {
  const blocks = [];
  text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const i = blocks.length;
    blocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `%%CB${i}%%`;
  });
  text = text.replace(/`([^`]+)`/g, (_, c) => {
    const i = blocks.length;
    blocks.push(`<code>${escapeHtml(c)}</code>`);
    return `%%CB${i}%%`;
  });
  text = text.replace(/^### (.+)$/gm, '<p class="msg-h3">$1</p>');
  text = text.replace(/^## (.+)$/gm,  '<p class="msg-h2">$1</p>');
  text = text.replace(/^# (.+)$/gm,   '<p class="msg-h1">$1</p>');
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g,    '<em>$1</em>');
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]))
        items.push(`<li>${lines[i++].replace(/^\d+\.\s+/, '')}</li>`);
      out.push(`<ol>${items.join('')}</ol>`); continue;
    }
    if (/^\s*[\*\-]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[\*\-]\s+/.test(lines[i]))
        items.push(`<li>${lines[i++].replace(/^\s*[\*\-]\s+/, '')}</li>`);
      out.push(`<ul>${items.join('')}</ul>`); continue;
    }
    if (/^>\s/.test(line)) { out.push(`<blockquote>${line.replace(/^>\s/, '')}</blockquote>`); i++; continue; }
    if (line.trim() === '') { out.push('<br>'); i++; continue; }
    out.push(line); i++;
  }
  text = out.join('');
  text = text.replace(/%%CB(\d+)%%/g, (_, i) => blocks[parseInt(i)]);
  return text;
}

function escapeHtml(t) {
  return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── TYPING INDICATOR ──
function showTyping() {
  const div = document.createElement("div");
  div.className = "msg msg-ai";
  div.id = "__cxThinking";
  div.innerHTML = `<div class="msg-ai-spinner">${CX_MARK_SVG}<div class="cx-thinking-dots"><span></span><span></span><span></span></div></div>`;
  chatArea.appendChild(div);
  scrollChat();
  return div;
}
function removeTyping(el) { el?.parentNode?.removeChild(el); }

// ── SCROLL ──
function scrollChat()   { chatArea.scrollTop = chatArea.scrollHeight; }
function scrollCanvas() { canvasArea.scrollTop = 0; }

// ── SUMMARIZE ──
async function summarize(btn, type) {
  const text = btn.parentElement.dataset.fullText || btn.parentElement.previousElementSibling?.innerText || "";
  btn.textContent = "..."; btn.disabled = true;
  try {
    const res = await fetch("/api/summarize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, type }),
    });
    const data = await res.json();
    if (data.reply) pushToCanvas(data.reply);
    else showToast(data.error || "Could not summarize right now.");
  } catch (e) {
    showToast("Network error — could not summarize.");
  }
  btn.textContent = type === "shorter" ? "Shorter" : "More detail";
  btn.disabled = false;
}

// ── FLASHCARD ──
async function makeFlashcard(btn) {
  const text = btn.parentElement.dataset.fullText || btn.parentElement.previousElementSibling?.innerText || "";
  const origHTML = btn.innerHTML;
  btn.textContent = "..."; btn.disabled = true;
  try {
    const res = await fetch("/api/flashcard", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.flashcards) await pushFlashcardsToCanvas(data.flashcards);
    else showToast(data.error || "Could not generate flashcards right now.");
  } catch (e) {
    showToast("Network error — could not generate flashcards.");
  }
  btn.innerHTML = origHTML; btn.disabled = false;
}

// ── PIN NOTE ──
async function pinNote(btn) {
  const text = btn.parentElement.dataset.fullText || btn.parentElement.previousElementSibling?.innerText || "";
  if (!text.trim()) return;
  const origHTML = btn.innerHTML;
  btn.textContent = "..."; btn.disabled = true;
  try {
    const res = await fetch("/api/summarize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, type: "shorter" }),
    });
    const data = await res.json();
    if (data.reply) {
      await saveNoteToCanvas(data.reply);
    } else {
      showToast(data.error || "Could not pin this note — saving as-is instead.", "info");
      await saveNoteToCanvas(text); // graceful fallback: still pin the raw text so the action isn't a total dead end
    }
  } catch (e) { await saveNoteToCanvas(text); }
  btn.innerHTML = origHTML; btn.disabled = false;
}

async function saveNoteToCanvas(text) {
  const savedNotes = document.getElementById("savedNotes");
  if (savedNotes) {
    savedNotes.querySelector(".empty-section-hint")?.remove();
    const time = new Date().toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
    const bullets = text.split("\n").filter(l => l.trim()).map(l => l.replace(/^[\*\-\d\.]+\s*/, "").trim()).filter(Boolean).slice(0, 6);
    let dbId = null;
    try {
      const res = await fetch("/api/canvas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "note", content: { text, bullets, time } }),
      });
      const d = await res.json();
      if (d.ok) dbId = d.id;
    } catch (e) {}
    const card = document.createElement("div");
    card.className = "saved-note-card";
    card.dataset.dbId = dbId || "";
    card.innerHTML = `
      <div class="note-title">📌 Note — ${time}</div>
      <div class="note-bullets">${bullets.map(b => `<div class="note-bullet">• ${b}</div>`).join("")}</div>
      <button class="note-delete-btn" onclick="deleteCanvasItem(this,'note')">×</button>`;
    savedNotes.insertBefore(card, savedNotes.firstChild);
    updateNotesCount();
    updateStats();
  }
  pushToCanvas(text);
}

async function deleteCanvasItem(btn, type) {
  const card = btn.parentElement;
  if (card.dataset.dbId) {
    try { await fetch(`/api/canvas/${card.dataset.dbId}`, { method: "DELETE" }); } catch (e) {}
  }
  card.style.opacity = "0"; card.style.transition = "opacity 0.2s";
  setTimeout(() => { card.remove(); type === "note" ? updateNotesCount() : updateFlashcardCount(); }, 200);
}

function updateNotesCount() {
  const el = document.getElementById("notesCount");
  const n  = document.getElementById("savedNotes");
  if (el && n) el.textContent = n.querySelectorAll(".saved-note-card").length + " saved";
}
function updateFlashcardCount() {
  const el = document.getElementById("flashcardCount");
  const g  = document.getElementById("savedFlashcards");
  if (el && g) el.textContent = g.querySelectorAll(".saved-flashcard-card").length + " saved";
}

async function loadCanvasItems() {
  try {
    const res = await fetch("/api/canvas", { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) return;
    const items = await res.json();
    if (!items.length) return;
    const savedNotes = document.getElementById("savedNotes");
    const savedFlashcards = document.getElementById("savedFlashcards");
    items.forEach(item => {
      if (item.type === "note" && savedNotes) {
        savedNotes.querySelector(".empty-section-hint")?.remove();
        const card = document.createElement("div");
        card.className = "saved-note-card"; card.dataset.dbId = item._id;
        const bullets = item.content?.bullets || [];
        card.innerHTML = `
          <div class="note-title">📌 Note — ${item.content?.time || ""}</div>
          <div class="note-bullets">${bullets.map(b => `<div class="note-bullet">• ${b}</div>`).join("")}</div>
          <button class="note-delete-btn" onclick="deleteCanvasItem(this,'note')">×</button>`;
        savedNotes.appendChild(card);
      } else if (item.type === "flashcard" && savedFlashcards) {
        savedFlashcards.querySelector(".empty-section-hint")?.remove();
        const card = document.createElement("div");
        card.className = "saved-flashcard-card"; card.dataset.dbId = item._id;
        card.innerHTML = `
          <div class="question">Q: ${item.content?.q || ""}</div>
          <div class="answer">A: ${item.content?.a || ""}</div>
          <button class="note-delete-btn" onclick="deleteCanvasItem(this,'flashcard')">×</button>`;
        card.addEventListener("click", e => { if (!e.target.classList.contains("note-delete-btn")) card.classList.toggle("revealed"); });
        savedFlashcards.appendChild(card);
      }
    });
    updateNotesCount(); updateFlashcardCount();
  } catch (e) {}
}
loadCanvasItems();

// ── ANSWERLAB ──
let alSubjectsCache = null;

// ── UNIFIED INTELLIGENCE — STUDENT SNAPSHOT ──
// Fetched once when Chat opens (not per-message) — quiet background context Chat can
// naturally draw on if relevant. Cached client-side; refreshes each time Chat tab is reopened.
let cachedStudentSnapshot = null;
async function refreshStudentSnapshot() {
  try {
    const res = await fetch("/api/student-snapshot");
    const data = await res.json();
    cachedStudentSnapshot = data.snapshot || null;
  } catch (e) {
    cachedStudentSnapshot = null; // silently degrade — chat still works fine without it
  }
}

async function alLoadSubjects() {
  if (alSubjectsCache) return alSubjectsCache;
  try {
    const res = await fetch("/api/subjects");
    alSubjectsCache = await res.json();
  } catch (e) {
    alSubjectsCache = { sem5: { core: [], electives: [] }, sem6: { core: [], electives: [] } };
  }
  return alSubjectsCache;
}

async function alPopulateSubjects() {
  const sem = document.getElementById("alSemester")?.value || "sem5";
  const subjects = await alLoadSubjects();
  const sel = document.getElementById("alSubject");
  if (!sel) return;
  const list = [...(subjects[sem]?.core || []), ...(subjects[sem]?.electives || [])];
  sel.innerHTML = list.map(s => `<option value="${s.code}">${s.name} (${s.abbr})</option>`).join("");
}

async function submitAnswerForScoring() {
  const btn = document.getElementById("alSubmitBtn");
  const semester = document.getElementById("alSemester")?.value;
  const subjectCode = document.getElementById("alSubject")?.value;
  const maxMarks = document.getElementById("alMaxMarks")?.value;
  const question = document.getElementById("alQuestion")?.value.trim();
  const studentAnswer = document.getElementById("alAnswer")?.value.trim();

  if (!subjectCode) { showToast("Subject list is still loading — try again in a moment."); return; }
  if (!maxMarks) { document.getElementById("alMaxMarks")?.focus(); showToast("Select how many marks this question is worth."); return; }
  if (!question) { document.getElementById("alQuestion")?.focus(); return; }
  if (!studentAnswer) { document.getElementById("alAnswer")?.focus(); return; }

  btn.disabled = true; btn.textContent = "Scoring...";
  try {
    const res = await fetch("/api/answer-sim/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semester, subjectCode, question, maxMarks, studentAnswer }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) { showToast(data.error || "Could not score this answer."); return; }
    alRenderResult(data.attempt);
    alPrependHistory(data.attempt);
  } catch (e) {
    showToast("Network error — could not score this answer.");
  } finally {
    btn.disabled = false; btn.textContent = "Score my answer";
  }
}

function alRenderResult(attempt) {
  const box = document.getElementById("alResult");
  if (!box) return;
  box.classList.remove("hidden");
  const badge = document.getElementById("alScoreBadge");
  badge.textContent = `${attempt.score}/${attempt.maxMarks}`;
  document.getElementById("alResultSubject").textContent = attempt.subjectName || "";

  const isFullMarks = Number(attempt.score) >= Number(attempt.maxMarks);
  const perfectBadge = document.getElementById("alPerfectBadge");
  badge.classList.toggle("full-marks", isFullMarks);
  perfectBadge.classList.toggle("hidden", !isFullMarks);
  if (isFullMarks) {
    perfectBadge.classList.remove("pop");
    void perfectBadge.offsetWidth; // restart animation if triggered twice in a row
    perfectBadge.classList.add("pop");
    alFireConfetti(badge);
  }

  const missingWrap = document.getElementById("alMissingKeywords");
  const missingBlock = document.getElementById("alMissingBlock");
  if (attempt.missingKeywords?.length) {
    missingBlock.style.display = "";
    missingWrap.innerHTML = attempt.missingKeywords.map(k => `<span class="answerlab-keyword-chip">${k}</span>`).join("");
  } else {
    missingBlock.style.display = "none";
  }

  document.getElementById("alFeedback").textContent = attempt.feedback || "No feedback available.";
  document.getElementById("alModelAnswer").textContent = attempt.modelAnswer || "Not available.";

  // Unified Intelligence handoff — only offer when there's actually something to explain
  currentAlAttempt = attempt;
  document.getElementById("alAskCortexBtn").classList.toggle("hidden", isFullMarks);

  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── UNIFIED INTELLIGENCE — AnswerLab → Chat handoff ──
let currentAlAttempt = null;
function alAskCortex() {
  if (!currentAlAttempt) return;
  const a = currentAlAttempt;
  const missing = a.missingKeywords?.length ? ` It said I was missing: ${a.missingKeywords.join(", ")}.` : "";
  const msg = `I got this wrong on AnswerLab — "${a.question}" (${a.subjectName}). I scored ${a.score}/${a.maxMarks}.${missing} Can you explain it to me properly?`;
  switchNav("chat");
  userInput.value = msg;
  sendMessage();
}

// ── LIGHTWEIGHT CONFETTI BURST (full marks celebration, no external libs) ──
function alFireConfetti(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const colors = ["#8b83e8", "#4fd1c5", "#f6ad55", "#fc8181", "#68d391", "#f6e05e"];
  const count = 28;

  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "al-confetti-particle";
    const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.5 - 0.25);
    const distance = 90 + Math.random() * 90;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 40; // slight upward bias
    p.style.setProperty("--dx", `${dx}px`);
    p.style.setProperty("--dy", `${dy}px`);
    p.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    p.style.left = `${originX}px`;
    p.style.top = `${originY}px`;
    p.style.background = colors[i % colors.length];
    p.style.width = p.style.height = `${5 + Math.random() * 4}px`;
    p.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1100);
  }
}

function alPrependHistory(attempt) {
  const list = document.getElementById("alHistoryList");
  if (!list) return;
  list.querySelector(".history-empty")?.remove();
  const item = document.createElement("div");
  item.className = "history-item";
  item.id = `al-hist-${attempt._id}`;
  item.innerHTML = `
    <div class="history-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
    <div class="history-item-info" onclick="alLoadAttempt('${attempt._id}')" style="cursor:pointer">
      <div class="history-item-title">${attempt.subjectName} — ${attempt.question.slice(0, 60)}</div>
      <div class="history-item-meta">Score: ${attempt.score}/${attempt.maxMarks} · ${fmt(attempt.createdAt)}</div>
    </div>
    <div class="history-item-actions">
      <button class="history-delete-btn" onclick="alDeleteAttempt('${attempt._id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
      </button>
    </div>`;
  list.insertBefore(item, list.firstChild);
}

async function alLoadAttempt(id) {
  try {
    const res = await fetch(`/api/answer-sim/history/${id}`);
    if (!res.ok) return;
    const attempt = await res.json();
    alRenderResult(attempt);
  } catch (e) {}
}

async function alDeleteAttempt(id) {
  if (!await showConfirm("Delete this attempt?")) return;
  try {
    await fetch(`/api/answer-sim/history/${id}`, { method: "DELETE" });
    document.getElementById(`al-hist-${id}`)?.remove();
    const list = document.getElementById("alHistoryList");
    if (list && !list.querySelector(".history-item")) {
      list.innerHTML = `<div class="history-empty"><p>No attempts yet</p><span>Score your first answer to see it here</span></div>`;
    }
  } catch (e) {}
}

async function alLoadHistory() {
  const list = document.getElementById("alHistoryList");
  if (!list) return;
  try {
    const res = await fetch("/api/answer-sim/history");
    const attempts = await res.json();
    if (!attempts.length) return; // keep default empty state markup
    list.innerHTML = "";
    attempts.forEach(a => alPrependHistoryFromList(a, list));
  } catch (e) {}
}

function alPrependHistoryFromList(attempt, list) {
  const item = document.createElement("div");
  item.className = "history-item";
  item.id = `al-hist-${attempt._id}`;
  item.innerHTML = `
    <div class="history-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
    <div class="history-item-info" onclick="alLoadAttempt('${attempt._id}')" style="cursor:pointer">
      <div class="history-item-title">${attempt.subjectName} — ${(attempt.question || "").slice(0, 60)}</div>
      <div class="history-item-meta">Score: ${attempt.score}/${attempt.maxMarks} · ${fmt(attempt.createdAt)}</div>
    </div>
    <div class="history-item-actions">
      <button class="history-delete-btn" onclick="alDeleteAttempt('${attempt._id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
      </button>
    </div>`;
  list.appendChild(item);
}

// Populate subject dropdown on first load so it's ready before the tab is even opened
alPopulateSubjects();

// ── PROJECTLAB ──
let pjCurrentProjectId = null;
let pjVivaQuestions = [];
let pjVivaIndex = 0;
const PJ_STAGE_COUNT = 4; // must match server-side PROJECT_STAGES length

async function pjStartProject() {
  const btn = document.getElementById("pjStartBtn");
  const title = document.getElementById("pjTitle")?.value.trim();
  const difficulty = document.getElementById("pjDifficulty")?.value;
  const techUsed = document.getElementById("pjTechUsed")?.value.trim();

  if (!title) { document.getElementById("pjTitle")?.focus(); return; }

  btn.disabled = true; btn.textContent = "Starting...";
  try {
    const res = await fetch("/api/microproject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, difficulty, techUsed }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) { showToast(data.error || "Could not start project."); return; }
    document.getElementById("pjTitle").value = "";
    document.getElementById("pjTechUsed").value = "";
    pjRenderActive(data.project);
    pjLoadList();
  } catch (e) {
    showToast("Network error — could not start project.");
  } finally {
    btn.disabled = false; btn.textContent = "Start Project";
  }
}

function pjRenderActive(project) {
  pjCurrentProjectId = project._id;
  document.getElementById("pjNewForm").classList.add("hidden");
  document.getElementById("pjListSection").classList.add("hidden");
  document.getElementById("pjActive").classList.remove("hidden");

  document.getElementById("pjActiveTitle").textContent = project.title;
  document.getElementById("pjActiveSubject").textContent = project.techUsed ? `${project.difficulty} · ${project.techUsed}` : project.difficulty;

  // Progress dots — one per stage, filled for understood stages, accent for current
  const progress = document.getElementById("pjProgress");
  let dots = "";
  for (let i = 0; i < PJ_STAGE_COUNT; i++) {
    const stage = project.stages[i];
    let cls = "";
    if (stage?.understood) cls = "done";
    else if (stage) cls = "active";
    dots += `<div class="projectlab-progress-dot ${cls}"></div>`;
  }
  progress.innerHTML = dots;

  const currentStage = project.stages[project.stages.length - 1];
  const feedbackBlock = document.getElementById("pjFeedbackBlock");
  const stageBlock = document.getElementById("pjStageBlock");
  const vivaSection = document.getElementById("pjVivaSection");

  if (project.status === "completed") {
    stageBlock.classList.add("hidden");
    vivaSection.classList.remove("hidden");
    if (project.vivaQuestions?.length) {
      pjRenderViva(project.vivaQuestions);
      document.getElementById("pjGenerateVivaBtn").classList.add("hidden");
    } else {
      document.getElementById("pjGenerateVivaBtn").classList.remove("hidden");
      document.getElementById("pjVivaNav").classList.add("hidden");
    }
    // Show feedback from the final stage
    if (currentStage?.feedback) {
      feedbackBlock.classList.remove("hidden");
      feedbackBlock.className = "answerlab-block projectlab-feedback understood";
      document.getElementById("pjFeedbackHeading").textContent = `${currentStage.title} — understood ✓`;
      document.getElementById("pjFeedbackText").textContent = currentStage.feedback;
    }
    document.getElementById("pjAskCortexBtn").classList.add("hidden");
    return;
  }

  stageBlock.classList.remove("hidden");
  vivaSection.classList.add("hidden");
  document.getElementById("pjStageTitle").textContent = currentStage.title;
  document.getElementById("pjStagePrompt").textContent = currentStage.followUpQuestion || currentStage.prompt;
  document.getElementById("pjExplanation").value = "";

  // Unified Intelligence handoff — same "stuck" definition the backend snapshot uses:
  // attempts >= 2, still not understood
  currentPjContext = { project, stage: currentStage };
  const isStuck = (currentStage.attempts || 0) >= 2 && !currentStage.understood;

  if (currentStage.attempts > 0 && currentStage.feedback) {
    feedbackBlock.classList.remove("hidden");
    feedbackBlock.className = "answerlab-block projectlab-feedback not-understood";
    document.getElementById("pjFeedbackHeading").textContent = "Not quite yet — try again";
    document.getElementById("pjFeedbackText").textContent = currentStage.feedback;
    document.getElementById("pjAskCortexBtn").classList.toggle("hidden", !isStuck);
  } else {
    feedbackBlock.classList.add("hidden");
    document.getElementById("pjAskCortexBtn").classList.add("hidden");
  }
}

// ── UNIFIED INTELLIGENCE — ProjectLab → Chat handoff ──
let currentPjContext = null;
function pjAskCortex() {
  if (!currentPjContext) return;
  const { project, stage } = currentPjContext;
  const msg = `I'm stuck on the "${stage.title}" stage of my micro-project "${project.title}". The question was: "${stage.prompt}". My last attempt was: "${stage.studentExplanation}" — and the feedback was: "${stage.feedback}". Can you help me actually understand this?`;
  switchNav("chat");
  userInput.value = msg;
  sendMessage();
}

async function pjSubmitStage() {
  if (!pjCurrentProjectId) return;
  const btn = document.getElementById("pjSubmitStageBtn");
  const explanation = document.getElementById("pjExplanation")?.value.trim();
  if (!explanation) { document.getElementById("pjExplanation")?.focus(); return; }

  btn.disabled = true; btn.textContent = "Checking...";
  try {
    const res = await fetch(`/api/microproject/${pjCurrentProjectId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ explanation }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) { showToast(data.error || "Could not evaluate this stage."); return; }
    pjRenderActive(data.project);
    if (data.readyForViva) pjLoadList();
  } catch (e) {
    showToast("Network error — could not submit.");
  } finally {
    btn.disabled = false; btn.textContent = "Submit";
  }
}

async function pjGenerateViva() {
  if (!pjCurrentProjectId) return;
  const btn = document.getElementById("pjGenerateVivaBtn");
  btn.disabled = true; btn.textContent = "Generating...";
  try {
    const res = await fetch(`/api/microproject/${pjCurrentProjectId}/generate-viva`, { method: "POST" });
    const data = await res.json();
    if (!res.ok || !data.ok) { showToast(data.error || "Could not generate viva questions."); return; }
    pjRenderViva(data.project.vivaQuestions);
    btn.classList.add("hidden");
    pjLoadList();
  } catch (e) {
    showToast("Network error — could not generate viva questions.");
  } finally {
    btn.disabled = false; btn.textContent = "Generate Viva Questions";
  }
}

// ── VIVA PREV/NEXT NAVIGATION ──
function pjRenderViva(questions) {
  pjVivaQuestions = questions || [];
  pjVivaIndex = 0;
  const nav = document.getElementById("pjVivaNav");
  if (!nav) return;
  if (!pjVivaQuestions.length) { nav.classList.add("hidden"); return; }
  nav.classList.remove("hidden");
  pjShowVivaQuestion();
}

function pjShowVivaQuestion() {
  const q = pjVivaQuestions[pjVivaIndex];
  if (!q) return;
  document.getElementById("pjVivaCounter").textContent = `Question ${pjVivaIndex + 1} of ${pjVivaQuestions.length}`;
  document.getElementById("pjVivaQuestionText").textContent = q.question;
  document.getElementById("pjVivaAnsweredCheck").checked = !!q.answered;
  document.getElementById("pjVivaPrevBtn").disabled = pjVivaIndex === 0;
  document.getElementById("pjVivaNextBtn").disabled = pjVivaIndex === pjVivaQuestions.length - 1;
}

function pjVivaPrev() {
  if (pjVivaIndex > 0) { pjVivaIndex--; pjShowVivaQuestion(); }
}

function pjVivaNext() {
  if (pjVivaIndex < pjVivaQuestions.length - 1) { pjVivaIndex++; pjShowVivaQuestion(); }
}

async function pjToggleAnswered() {
  if (!pjCurrentProjectId) return;
  const checked = document.getElementById("pjVivaAnsweredCheck").checked;
  pjVivaQuestions[pjVivaIndex].answered = checked; // optimistic local update
  try {
    await fetch(`/api/microproject/${pjCurrentProjectId}/viva/${pjVivaIndex}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answered: checked }),
    });
  } catch (e) {}
}

function pjBackToList() {
  pjCurrentProjectId = null;
  pjVivaQuestions = [];
  pjVivaIndex = 0;
  document.getElementById("pjActive").classList.add("hidden");
  document.getElementById("pjNewForm").classList.remove("hidden");
  document.getElementById("pjListSection").classList.remove("hidden");
}

async function pjOpenProject(id) {
  try {
    const res = await fetch(`/api/microproject/${id}`);
    if (!res.ok) return;
    const project = await res.json();
    pjRenderActive(project);
  } catch (e) {}
}

async function pjDeleteProject(id) {
  if (!await showConfirm("Delete this project?")) return;
  try {
    await fetch(`/api/microproject/${id}`, { method: "DELETE" });
    if (pjCurrentProjectId === id) pjBackToList();
    pjLoadList();
  } catch (e) {}
}

async function pjLoadList() {
  const list = document.getElementById("pjList");
  if (!list) return;
  try {
    const res = await fetch("/api/microproject");
    const projects = await res.json();
    if (!projects.length) {
      list.innerHTML = `<div class="history-empty"><p>No projects yet</p><span>Start your first micro-project above</span></div>`;
      return;
    }
    list.innerHTML = projects.map(p => {
      const doneStages = p.stages.filter(s => s.understood).length;
      const statusLabel = p.status === "completed" ? "Completed · Viva ready" : `Stage ${doneStages + 1}/${PJ_STAGE_COUNT}`;
      return `
        <div class="history-item" id="pj-hist-${p._id}">
          <div class="history-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
          <div class="history-item-info" onclick="pjOpenProject('${p._id}')" style="cursor:pointer">
            <div class="history-item-title">${p.title}</div>
            <div class="history-item-meta">${p.difficulty} · ${statusLabel} · ${fmt(p.updatedAt)}</div>
          </div>
          <div class="history-item-actions">
            <button class="history-delete-btn" onclick="pjDeleteProject('${p._id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
            </button>
          </div>
        </div>`;
    }).join("");
  } catch (e) {}
}

// ── PUSH FLASHCARDS ──
async function pushFlashcardsToCanvas(flashcards) {
  const savedFlashcards = document.getElementById("savedFlashcards");
  if (savedFlashcards) {
    savedFlashcards.querySelector(".empty-section-hint")?.remove();
    for (const fc of flashcards) {
      let dbId = null;
      try {
        const res = await fetch("/api/canvas", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "flashcard", content: { q: fc.q, a: fc.a } }),
        });
        const d = await res.json();
        if (d.ok) dbId = d.id;
      } catch (e) {}
      const card = document.createElement("div");
      card.className = "saved-flashcard-card"; card.dataset.dbId = dbId || "";
      card.innerHTML = `
        <div class="question">Q: ${fc.q}</div>
        <div class="answer">A: ${fc.a}</div>
        <button class="note-delete-btn" onclick="deleteCanvasItem(this,'flashcard')">×</button>`;
      card.addEventListener("click", e => { if (!e.target.classList.contains("note-delete-btn")) card.classList.toggle("revealed"); });
      savedFlashcards.insertBefore(card, savedFlashcards.firstChild);
    }
    updateFlashcardCount(); updateStats();
  }
  canvasEmpty.style.display = "none";
  const card = document.createElement("div");
  card.className = "canvas-card";
  const title = document.createElement("div");
  title.className = "canvas-card-title";
  title.textContent = "▸ Flashcard deck — " + new Date().toLocaleTimeString();
  card.appendChild(title);
  flashcards.forEach(fc => {
    const fcDiv = document.createElement("div");
    fcDiv.className = "flashcard";
    fcDiv.innerHTML = `<div class="flashcard-q">Q: ${fc.q}</div><div class="flashcard-a">A: ${fc.a}</div><div class="flashcard-hint">Tap to reveal</div>`;
    fcDiv.addEventListener("click", () => {
      fcDiv.classList.toggle("revealed");
      fcDiv.querySelector(".flashcard-hint").textContent = fcDiv.classList.contains("revealed") ? "Tap to hide" : "Tap to reveal";
    });
    card.appendChild(fcDiv);
  });
  canvasArea.insertBefore(card, canvasArea.firstChild);
  scrollCanvas();
  if (isMobile()) setTimeout(() => toggleCanvasDrawer(), 300);
}

// ── CANVAS DRAWER ──
function toggleCanvasDrawer() {
  const panel = document.getElementById("canvasPanel");
  if (!panel) return;
  if (panel.classList.contains("drawer-open")) {
    closeCanvasDrawer();
  } else {
    panel.classList.add("drawer-open");
    document.getElementById("canvasCloseBtn")?.style && (document.getElementById("canvasCloseBtn").style.display = "flex");
    canvasItemCount = 0;
    const badge = document.getElementById("canvasBadge");
    if (badge) badge.style.display = "none";
  }
}
function closeCanvasDrawer() {
  document.getElementById("canvasPanel")?.classList.remove("drawer-open");
  const cb = document.getElementById("canvasCloseBtn");
  if (cb) cb.style.display = "none";
}
function updateCanvasBadge() {
  if (!isMobile()) return;
  if (document.getElementById("canvasPanel")?.classList.contains("drawer-open")) return;
  canvasItemCount++;
  const badge = document.getElementById("canvasBadge");
  const btn   = document.getElementById("canvasToggleBtn");
  if (badge) { badge.textContent = canvasItemCount; badge.style.display = "inline-block"; }
  if (btn)   { btn.style.transform = "scale(1.12)"; setTimeout(() => { btn.style.transform = ""; }, 200); }
}

// ── SWIPE DOWN TO CLOSE DRAWER ──
document.addEventListener("touchstart", e => {
  if (document.getElementById("canvasPanel")?.classList.contains("drawer-open"))
    drawerTouchStartY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener("touchend", e => {
  if (!document.getElementById("canvasPanel")?.classList.contains("drawer-open")) return;
  if (e.changedTouches[0].clientY - drawerTouchStartY > 60) closeCanvasDrawer();
}, { passive: true });

// ── VOICE INPUT ──
function initVoice() {
  const voiceBtn = document.getElementById("voiceBtn");
  if (!voiceBtn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { voiceBtn.style.display = "none"; return; }
  const recognition = new SR();
  recognition.continuous = false; recognition.lang = "en-IN"; recognition.interimResults = false;
  const micSVG  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
  const stopSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`;
  function reset() { isListening = false; voiceBtn.classList.remove("listening"); voiceBtn.innerHTML = micSVG; }
  recognition.onresult = e => {
    userInput.value = e.results[0][0].transcript;
    userInput.style.height = "auto"; userInput.style.height = userInput.scrollHeight + "px"; reset();
  };
  recognition.onerror = reset; recognition.onend = reset;
  voiceBtn.addEventListener("click", () => {
    if (isListening) { recognition.stop(); reset(); }
    else { recognition.start(); isListening = true; voiceBtn.classList.add("listening"); voiceBtn.innerHTML = stopSVG; }
  });
}

// ── READ ALOUD ──
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-IN"; utter.rate = 0.95;
  utter.onend = () => resetSpeakBtn(currentSpeakBtn);
  utter.onerror = () => resetSpeakBtn(currentSpeakBtn);
  window.speechSynthesis.speak(utter);
}
function resetSpeakBtn(btn) {
  if (!btn) return;
  btn.dataset.speaking = "false";
  const sp = btn.querySelector(".icon-speaker"), pa = btn.querySelector(".icon-pause");
  if (sp) sp.style.display = ""; if (pa) pa.style.display = "none";
  btn.style.color = ""; currentSpeakBtn = null;
}
function speakText(btn) {
  const isSpeaking = btn.dataset.speaking === "true";
  const sp = btn.querySelector(".icon-speaker"), pa = btn.querySelector(".icon-pause");
  if (isSpeaking) {
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      if (sp) sp.style.display = ""; if (pa) pa.style.display = "none";
      btn.style.color = "var(--text-muted)";
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      if (sp) sp.style.display = "none"; if (pa) pa.style.display = "";
      btn.style.color = "var(--accent)";
    }
    return;
  }
  if (currentSpeakBtn && currentSpeakBtn !== btn) resetSpeakBtn(currentSpeakBtn);
  window.speechSynthesis.cancel();
  const text = btn.parentElement.dataset.fullText || btn.parentElement.previousElementSibling?.innerText || "";
  const clean = text.replace(/[#*`<>]/g, "").substring(0, 800);
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = "en-IN"; utter.rate = 0.95;
  utter.onend = () => resetSpeakBtn(btn); utter.onerror = () => resetSpeakBtn(btn);
  currentSpeakBtn = btn; btn.dataset.speaking = "true";
  if (sp) sp.style.display = "none"; if (pa) pa.style.display = "";
  btn.style.color = "var(--accent)";
  window.speechSynthesis.speak(utter);
}

// ── FILE HANDLING ──
function showFilePreview(file) {
  document.getElementById("filePreview")?.remove();
  const icon = file.type.startsWith("image/") ? "🖼️" : file.name.endsWith(".pdf") ? "📄" : "📝";
  const preview = document.createElement("div");
  preview.className = "file-preview"; preview.id = "filePreview";
  preview.innerHTML = `<span class="file-preview-icon">${icon}</span><span class="file-preview-name">${file.name}</span><button class="file-preview-remove" onclick="removeFile()">✕</button>`;
  dropZone.insertBefore(preview, dropZone.querySelector(".input-pill"));
  selectedFile = file;
}
function removeFile() { document.getElementById("filePreview")?.remove(); selectedFile = null; document.getElementById("fileInput").value = ""; }

document.getElementById("fileInput").addEventListener("change", e => { if (e.target.files[0]) showFilePreview(e.target.files[0]); });
dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", e => { e.preventDefault(); dropZone.classList.remove("dragover"); if (e.dataTransfer.files[0]) showFilePreview(e.dataTransfer.files[0]); });

async function uploadAndAnalyze(file, message) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("message", message || `Analyze this ${file.name.endsWith(".pdf") ? "PDF" : "file"} and give me a clear summary of the key points.`);
  const ind = document.createElement("div");
  ind.className = "uploading-indicator"; ind.id = "uploadingIndicator";
  ind.textContent = `📤 Analyzing ${file.name}...`;
  chatArea.appendChild(ind); scrollChat();
  try {
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    document.getElementById("uploadingIndicator")?.remove();
    const data = await res.json();
    if (data.reply) {
      const fm = document.createElement("div");
      fm.className = "msg msg-user"; fm.innerHTML = `📎 <em>${file.name}</em>`;
      chatArea.appendChild(fm);
      chatHistory.push({ role: "user", content: `[Uploaded file: ${file.name}]` });
      chatHistory.push({ role: "assistant", content: data.reply });
      appendAIMessage(data.reply);
    } else { appendAIMessage("Could not analyze file: " + (data.error || "Unknown error")); }
  } catch (err) { document.getElementById("uploadingIndicator")?.remove(); appendAIMessage("File upload failed. Check your connection."); }
  removeFile();
}

// ── MOBILE ──
function isMobile() { return window.innerWidth <= 768; }
function switchTab(tab) {
  const left = document.querySelector(".left-pane"), right = document.querySelector(".right-pane");
  if (tab === "chat") { left?.classList.add("mobile-active"); right?.classList.remove("mobile-active"); }
  else { right?.classList.add("mobile-active"); left?.classList.remove("mobile-active"); }
}
if (isMobile()) document.querySelector(".left-pane")?.classList.add("mobile-active");

// ── SWIPE LEFT/RIGHT (tabs) ──
let touchStartX = 0, touchStartY = 0;
document.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }, { passive: true });
document.addEventListener("touchend", e => {
  if (!isMobile()) return;
  if (document.getElementById("canvasPanel")?.classList.contains("drawer-open")) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
  switchTab(dx < 0 ? "canvas" : "chat");
}, { passive: true });

// ── LOAD USER ── (fills the Account tab profile card)
let currentUserName = "";
async function loadUser() {
  try {
    const res = await fetch("/api/user");
    if (!res.ok) { window.location.href = "/login"; return; }
    const user = await res.json();
    const ap = document.getElementById("accountPhoto"), an = document.getElementById("accountName"), ae = document.getElementById("accountEmail");
    if (ap) ap.src = user.photo; if (an) an.textContent = user.name; if (ae) ae.textContent = user.email;
    currentUserName = user.name.split(" ")[0];
    updateGreeting();
  } catch (err) { window.location.href = "/login"; }
  loadUsageStats();
}

// ── USAGE METER — Account tab ──
async function loadUsageStats() {
  const fill = document.getElementById("usageMeterFill");
  const count = document.getElementById("usageMeterCount");
  const tierEl = document.getElementById("usageMeterTier");
  if (!fill || !count || !tierEl) return;
  try {
    const res = await fetch("/api/usage-stats");
    const data = await res.json();
    const pct = data.limit ? Math.min(100, Math.round((data.used / data.limit) * 100)) : 0;
    fill.style.width = pct + "%";
    fill.classList.toggle("near-limit", pct >= 75 && pct < 100);
    fill.classList.toggle("at-limit", pct >= 100);
    count.textContent = `${data.used} of ${data.limit} requests used today`;
    tierEl.textContent = data.tier === "premium" ? "⭐ Premium" : "Free";
    tierEl.classList.toggle("premium", data.tier === "premium");
  } catch (e) {
    count.textContent = "Usage data unavailable";
  }
}
loadUser();
initVoice();

// ── SERVICE WORKER ──
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister()));
  caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  window.addEventListener("load", () => {
    setTimeout(() => {
      navigator.serviceWorker.register("/service-worker.js")
        .then(() => console.log("Cortex PWA ready"))
        .catch(err => console.log("SW error:", err));
    }, 2000);
  });
}

// ── NAV & TAB SWITCHING ──
function switchNav(tab) {
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.nav === tab));
  document.querySelectorAll(".mobile-nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.nav === tab));
  document.querySelectorAll(".tab-view").forEach(s => s.classList.toggle("hidden", s.id !== `tab-${tab}`));
  if (tab === "home")       { updateGreeting(); updateStats(); loadStudyPulse(); }
  if (tab === "library")    loadHistory();
  if (tab === "account")    loadUser();
  if (tab === "answerlab")  alLoadHistory();
  if (tab === "chat")       refreshStudentSnapshot();
  if (tab === "projectlab") { if (!pjCurrentProjectId) pjBackToList(); pjLoadList(); }
  // Push state for Android back button
  history.pushState({ tab }, "", "#" + tab);
}

// ── LIBRARY SUB-TABS (Saved / History) ──
function switchLibraryTab(sub) {
  document.querySelectorAll(".library-subtab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.libtab === sub));
  document.querySelectorAll(".library-panel").forEach(p => p.classList.toggle("hidden", p.id !== `libpanel-${sub}`));
  if (sub === "history") loadHistory();
}

// ── ANDROID BACK BUTTON ──
history.replaceState({ tab: "home" }, "", "#home");
window.addEventListener("popstate", e => {
  const tab = e.state?.tab || "home";
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.nav === tab));
  document.querySelectorAll(".mobile-nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.nav === tab));
  document.querySelectorAll(".tab-view").forEach(s => s.classList.toggle("hidden", s.id !== `tab-${tab}`));
  if (tab === "home")       { updateGreeting(); updateStats(); loadStudyPulse(); }
  if (tab === "library")    loadHistory();
  if (tab === "account")    loadUser();
  if (tab === "answerlab")  alLoadHistory();
  if (tab === "chat")       refreshStudentSnapshot();
  if (tab === "projectlab") { if (!pjCurrentProjectId) pjBackToList(); pjLoadList(); }
});

function updateGreeting() {
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const titleEl = document.querySelector("#tab-home .tab-title");
  const subtitleEl = document.querySelector("#tab-home .tab-subtitle");
  if (titleEl) titleEl.textContent = currentUserName ? `${greet}, ${currentUserName}! 👋` : `${greet} 👋`;
  if (subtitleEl) subtitleEl.textContent = ["What are we studying today?","Ready to learn something new?","Let's make today productive!","Your study session awaits."][Math.floor(Math.random() * 4)];
}
updateGreeting();

// ── MODE SELECTOR ──
let currentMode = "normal";
function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".mode-btn").forEach(btn => btn.classList.remove("active"));
  document.getElementById(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`)?.classList.add("active");
  vivaMode  = mode === "viva";
  panicMode = mode === "panic";
  syncModeToggles();
}
function syncModeToggles() {
  const vt = document.getElementById("vivaToggle"), pt = document.getElementById("panicToggle");
  if (vt) { vt.textContent = vivaMode  ? "On" : "Off"; vt.classList.toggle("on", vivaMode); }
  if (pt) { pt.textContent = panicMode ? "On" : "Off"; pt.classList.toggle("on", panicMode); }
}

// ── THEME ──
function toggleTheme() {
  document.body.classList.toggle("light");
  const isLight = document.body.classList.contains("light");
  localStorage.setItem("cortex-theme", isLight ? "light" : "dark");
  const btn = document.getElementById("themeToggleSetting");
  if (btn) btn.textContent = isLight ? "Light" : "Dark";
}
(function () {
  if (localStorage.getItem("cortex-theme") === "light") {
    document.body.classList.add("light");
    const btn = document.getElementById("themeToggleSetting");
    if (btn) btn.textContent = "Light";
  }
})();

// ── LANGUAGE ──
function setLanguage(lang) {
  selectedLanguage = lang;
  localStorage.setItem("cortex-language", lang);
  const sel = document.getElementById("langSelect");
  if (sel) sel.value = lang;
}
// Sync the dropdown to the saved preference on load — without this, the select always
// visually defaults to English even when another language is actively saved/applied.
(function () {
  const sel = document.getElementById("langSelect");
  if (sel) sel.value = selectedLanguage;
})();

// ── TOGGLE VIVA / PANIC ──
function toggleViva() {
  if (vivaMode) { setMode("normal"); appendSystemNotice("Viva Mode off."); }
  else { setMode("viva"); chatHistory = []; appendSystemNotice("🎓 <strong>Viva Mode ON.</strong> Tell me the topic and I'll fire questions at you."); }
  switchNav("chat");
}
function togglePanic() {
  if (panicMode) { setMode("normal"); appendSystemNotice("Panic Mode off. Back to normal explanations."); }
  else { setMode("panic"); appendSystemNotice("⚡ <strong>Panic Mode ON.</strong> Bullet points and key facts only."); }
  switchNav("chat");
}
function appendSystemNotice(html) {
  const lm = CX_MARK_SVG.replace("cx-chat-mark", "cx-chat-mark done");
  const notice = document.createElement("div");
  notice.className = "msg msg-ai";
  notice.innerHTML = `<div class="msg-ai-spinner">${lm}<span>${html}</span></div>`;
  chatArea.appendChild(notice); scrollChat();
}

// ── TOAST NOTIFICATIONS ── (replaces native alert() — non-blocking, matches app styling)
function showToast(message, type = "error") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = type === "error" ? "⚠" : type === "success" ? "✓" : "ℹ";
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg"></span>`;
  toast.querySelector(".toast-msg").textContent = message; // textContent, not innerHTML — avoids injecting error strings as markup
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, 3800);
}

// ── CUSTOM CONFIRM MODAL ── (replaces native confirm() — returns a Promise<boolean>)
function showConfirm(message, confirmLabel = "Delete") {
  return new Promise(resolve => {
    let overlay = document.getElementById("confirmModalOverlay");
    if (overlay) overlay.remove(); // clear any stale instance
    overlay = document.createElement("div");
    overlay.id = "confirmModalOverlay";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal confirm-modal">
        <div class="modal-body">
          <p class="confirm-modal-msg"></p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn-secondary" id="confirmModalCancel">Cancel</button>
          <button class="modal-btn-primary confirm-modal-danger" id="confirmModalOk">${confirmLabel}</button>
        </div>
      </div>`;
    overlay.querySelector(".confirm-modal-msg").textContent = message;
    document.body.appendChild(overlay);

    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector("#confirmModalCancel").onclick = () => cleanup(false);
    overlay.querySelector("#confirmModalOk").onclick = () => cleanup(true);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
  });
}

// ── SHARED DATE FORMATTER ── (used by chat History and AnswerLab history)
function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { timeZone:"Asia/Kolkata", day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true });
}

// ── HISTORY ──
async function loadHistory() {
  const list = document.getElementById("historyList");
  if (!list) return;
  list.innerHTML = `<div class="history-empty" style="opacity:0.5"><p>Loading...</p></div>`;
  try {
    const res = await fetch("/api/history", { headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" } });
    if (!res.ok) throw new Error("not ok");
    const sessions = await res.json();
    if (!sessions?.length) {
      list.innerHTML = `<div class="history-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>No history yet</p><span>Your chat sessions will appear here</span></div>`;
      return;
    }
    list.innerHTML = sessions.map(s => `
      <div class="history-item" id="hist-${s._id}">
        <div class="history-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
        <div class="history-item-info" onclick="continueSession('${s._id}')" style="cursor:pointer">
          <div class="history-item-title">${s.title || s.messages?.[0]?.content?.slice(0,60) || "Chat session"}</div>
          <div class="history-item-meta">${fmt(s.updatedAt || s.createdAt)} · ${s.messages?.length || 0} messages</div>
        </div>
        <div class="history-item-actions">
          <button class="history-continue-btn" onclick="continueSession('${s._id}')">Continue →</button>
          <button class="history-delete-btn" onclick="deleteSession('${s._id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>`).join("");
  } catch { list.innerHTML = `<div class="history-empty"><p>History unavailable</p><span>Check your connection</span></div>`; }
}

async function continueSession(id) {
  try {
    const res = await fetch(`/api/history/${id}`);
    if (!res.ok) return;
    const session = await res.json();
    chatHistory = (session.messages || []).map(({ role, content }) => ({ role, content }));
    currentSessionId = id;
    switchNav("chat");
    chatArea.innerHTML = "";
    chatHistory.forEach(msg => {
      if (msg.role === "user") appendUserMessage(msg.content);
      else if (msg.role === "assistant") appendAIMessage(msg.content);
    });
    scrollChat();
  } catch (e) { console.error("Could not load session", e); }
}

async function deleteSession(id) {
  if (!await showConfirm("Delete this chat session?")) return;
  try {
    const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      const el = document.getElementById(`hist-${id}`);
      if (el) { el.style.opacity="0"; el.style.transform="translateX(20px)"; el.style.transition="all 0.3s ease"; setTimeout(() => el.remove(), 300); }
    }
  } catch (e) {}
}

async function dedupeHistory() {
  const btn = document.getElementById("dedupeBtn");
  if (btn) { btn.textContent = "Cleaning..."; btn.disabled = true; }
  try {
    const res = await fetch("/api/history/dedupe", { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      await loadHistory();
      if (btn) btn.textContent = `Removed ${data.removed} duplicates`;
      setTimeout(() => { if (btn) { btn.textContent = "Remove Duplicates"; btn.disabled = false; } }, 3000);
    }
  } catch (e) { if (btn) { btn.textContent = "Remove Duplicates"; btn.disabled = false; } }
}

// ── STATS ──
async function updateStats() {
  try {
    const res = await fetch("/api/stats", { headers: { "Cache-Control": "no-cache" } });
    if (res.ok) {
      const { chats, flashcards, notes } = await res.json();
      const ce = document.getElementById("statChats"), fe = document.getElementById("statFlashcards"), ne = document.getElementById("statNotes");
      if (ce) ce.textContent = chats; if (fe) fe.textContent = flashcards; if (ne) ne.textContent = notes;
    }
  } catch {}
}
updateStats();

// ── STUDY PULSE — automatic, trend-based subject risk from real AnswerLab performance ──
async function loadStudyPulse() {
  const focusBox = document.getElementById("pulseFocus");
  const list = document.getElementById("pulseSubjectList");
  if (!focusBox || !list) return;
  try {
    const res = await fetch("/api/study-pulse", { headers: { "Cache-Control": "no-cache" } });
    const data = await res.json();

    // Focus banner
    focusBox.className = "pulse-focus" + (data.focus?.status ? ` ${data.focus.status}` : "");
    focusBox.innerHTML = `<p style="margin:0">${data.focus?.message || "Score a couple more answers in AnswerLab to start seeing your subject-wise trend here."}</p>`;

    // Subject list
    if (!data.subjects?.length) {
      list.innerHTML = "";
      return;
    }
    list.innerHTML = data.subjects.map(s => {
      const meta = s.status === "unassessed" ? `${s.attemptCount} attempt${s.attemptCount === 1 ? "" : "s"}` : `${s.avgPercent}% · ${s.attemptCount}`;
      return `<div class="pulse-subject-row" onclick="pulseGoToSubject('${s.subjectCode}')">
        <div class="pulse-dot ${s.status}"></div>
        <div class="pulse-subject-name">${s.subjectName}</div>
        <div class="pulse-subject-meta">${meta}</div>
      </div>`;
    }).join("");
  } catch (e) {
    focusBox.innerHTML = `<p style="margin:0">Could not load Study Pulse right now.</p>`;
  }
}
loadStudyPulse();

async function pulseGoToSubject(subjectCode) {
  switchNav("answerlab");
  const subjects = await alLoadSubjects();
  let targetSem = null;
  for (const sem of ["sem5", "sem6"]) {
    const all = [...(subjects[sem]?.core || []), ...(subjects[sem]?.electives || [])];
    if (all.some(x => x.code === subjectCode)) { targetSem = sem; break; }
  }
  if (targetSem) {
    const semSelect = document.getElementById("alSemester");
    if (semSelect) semSelect.value = targetSem;
    await alPopulateSubjects();
    const subjSelect = document.getElementById("alSubject");
    if (subjSelect) subjSelect.value = subjectCode;
  }
}

// ── STUDY PLANNER ──
async function loadPlanner() {
  try {
    const res = await fetch("/api/planner",{headers:{"Cache-Control":"no-cache"}});
    if(res.ok){plannerSessions=await res.json();renderPlanner();}
  } catch(e){plannerSessions=JSON.parse(localStorage.getItem("cortex-planner")||"[]");renderPlanner();}
}
function openPlannerModal(){document.getElementById("plannerModal")?.classList.remove("hidden");}
function closePlannerModal(){
  document.getElementById("plannerModal")?.classList.add("hidden");
  ["plannerSubject","plannerDate","plannerDuration"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
}
async function savePlannerSession(){
  const subject=document.getElementById("plannerSubject")?.value.trim();
  const date=document.getElementById("plannerDate")?.value;
  const duration=document.getElementById("plannerDuration")?.value.trim();
  if(!subject||!date)return;
  try{
    const res=await fetch("/api/planner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject,date,duration})});
    const data=await res.json();
    if(data.ok&&data.session){plannerSessions.unshift(data.session);renderPlanner();}
  }catch(e){plannerSessions.unshift({_id:Date.now(),subject,date,duration});renderPlanner();}
  closePlannerModal();
}
async function deletePlannerSession(id){
  try{await fetch(`/api/planner/${id}`,{method:"DELETE"});}catch(e){}
  plannerSessions=plannerSessions.filter(s=>String(s._id)!==String(id));renderPlanner();
}
function renderPlanner(){
  const list=document.getElementById("plannerList");
  if(!list)return;
  if(!plannerSessions.length){list.innerHTML='<p class="empty-hint">No sessions planned. Add one to get started.</p>';return;}
  list.innerHTML=plannerSessions.map(s=>{
    const d=s.date?new Date(s.date+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"}):"";
    return `<div class="planner-item">
      <div class="planner-item-dot"></div>
      <div class="planner-item-info">
        <div class="planner-item-subject">${s.subject}</div>
        <div class="planner-item-meta">${d}${s.duration?" · "+s.duration:""}</div>
      </div>
      <button class="planner-item-delete" onclick="deletePlannerSession('${s._id}')">×</button></div>`;
  }).join("");
}
loadPlanner();

// ── AUTO-SAVE HISTORY ──
async function autoSaveHistory() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      if (chatHistory.length < 2) return;
      const body = { messages: chatHistory.map(({ role, content }) => ({ role, content })), id: currentSessionId || undefined };
      const res = await fetch("/api/history/save", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
      const data = await res.json();
      if (data.ok && data.id) currentSessionId = data.id;
      updateStats();
    } catch (e) {}
  }, 1000);
}

// ── MOBILE KEYBOARD FIX ──
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    const inputArea = document.querySelector(".input-area");
    if (!inputArea) return;
    const kbHeight = window.innerHeight - window.visualViewport.height;
    inputArea.style.paddingBottom = kbHeight > 100 ? kbHeight + "px" : "";
    if (kbHeight > 100) scrollChat();
  });
}
