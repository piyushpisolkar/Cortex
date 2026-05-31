// ── FLAT BRAIN SHAPE (matching new logo) ──
function svgBrainToMesh() {
  // Left hemisphere outer
  function tube(pts, r) {
    return new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 50, r, 8, false),
      new THREE.MeshPhysicalMaterial({
        color: 0x7f77dd,
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0x4444aa,
        emissiveIntensity: 0.3,
        clearcoat: 1,
      }),
    );
  }

  const brainGroup = new THREE.Group();

  // Left outer
  brainGroup.add(
    tube(
      [
        new THREE.Vector3(-0.04, 0.55, 0.1),
        new THREE.Vector3(-0.24, 0.55, 0.1),
        new THREE.Vector3(-0.42, 0.42, 0.1),
        new THREE.Vector3(-0.5, 0.2, 0.1),
        new THREE.Vector3(-0.48, -0.02, 0.1),
        new THREE.Vector3(-0.36, -0.22, 0.1),
        new THREE.Vector3(-0.18, -0.32, 0.1),
        new THREE.Vector3(-0.04, -0.32, 0.1),
      ],
      0.044,
    ),
  );

  // Left gyrus 1
  brainGroup.add(
    tube(
      [
        new THREE.Vector3(-0.04, 0.28, 0.1),
        new THREE.Vector3(-0.22, 0.28, 0.1),
        new THREE.Vector3(-0.36, 0.14, 0.1),
        new THREE.Vector3(-0.38, -0.04, 0.1),
        new THREE.Vector3(-0.28, -0.16, 0.1),
      ],
      0.034,
    ),
  );

  // Left gyrus 2
  brainGroup.add(
    tube(
      [
        new THREE.Vector3(-0.04, -0.04, 0.1),
        new THREE.Vector3(-0.18, -0.04, 0.1),
        new THREE.Vector3(-0.26, 0.06, 0.1),
        new THREE.Vector3(-0.24, 0.18, 0.1),
      ],
      0.028,
    ),
  );

  // Right outer
  brainGroup.add(
    tube(
      [
        new THREE.Vector3(0.04, 0.55, 0.1),
        new THREE.Vector3(0.24, 0.55, 0.1),
        new THREE.Vector3(0.42, 0.42, 0.1),
        new THREE.Vector3(0.5, 0.2, 0.1),
        new THREE.Vector3(0.48, -0.02, 0.1),
        new THREE.Vector3(0.36, -0.22, 0.1),
        new THREE.Vector3(0.18, -0.32, 0.1),
        new THREE.Vector3(0.04, -0.32, 0.1),
      ],
      0.044,
    ),
  );

  // Right gyrus 1
  brainGroup.add(
    tube(
      [
        new THREE.Vector3(0.04, 0.28, 0.1),
        new THREE.Vector3(0.22, 0.28, 0.1),
        new THREE.Vector3(0.36, 0.14, 0.1),
        new THREE.Vector3(0.38, -0.04, 0.1),
        new THREE.Vector3(0.28, -0.16, 0.1),
      ],
      0.034,
    ),
  );

  // Right gyrus 2
  brainGroup.add(
    tube(
      [
        new THREE.Vector3(0.04, -0.04, 0.1),
        new THREE.Vector3(0.18, -0.04, 0.1),
        new THREE.Vector3(0.26, 0.06, 0.1),
        new THREE.Vector3(0.24, 0.18, 0.1),
      ],
      0.028,
    ),
  );

  // Bottom curve
  brainGroup.add(
    tube(
      [
        new THREE.Vector3(-0.04, -0.32, 0.1),
        new THREE.Vector3(0, -0.42, 0.1),
        new THREE.Vector3(0.04, -0.32, 0.1),
      ],
      0.044,
    ),
  );

  // Center line
  for (let i = 0; i < 5; i++) {
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.08, 6),
      new THREE.MeshPhysicalMaterial({
        color: 0x5550a0,
        emissive: 0x333388,
        emissiveIntensity: 0.3,
      }),
    );
    cyl.position.set(0, 0.44 - i * 0.19, 0.1);
    brainGroup.add(cyl);
  }

  return brainGroup;
}

// Static brain (doesn't rotate)
const brainGroup = svgBrainToMesh();
scene.add(brainGroup);

// Spinning hex ring (2D clockwise rotation)
function hexShape(rad) {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    i === 0
      ? s.moveTo(rad * Math.cos(a), rad * Math.sin(a))
      : s.lineTo(rad * Math.cos(a), rad * Math.sin(a));
  }
  s.closePath();
  return s;
}

const outerS = hexShape(1.52);
outerS.holes.push(hexShape(1.22));
const spinHex = new THREE.Mesh(
  new THREE.ExtrudeGeometry(outerS, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 8,
  }),
  new THREE.MeshPhysicalMaterial({
    color: 0x6060bb,
    metalness: 1.0,
    roughness: 0.06,
    clearcoat: 1.0,
    emissive: 0x222266,
    emissiveIntensity: 0.15,
  }),
);
spinHex.position.z = -0.09;

const innerPanel = new THREE.Mesh(
  new THREE.ExtrudeGeometry(hexShape(1.18), {
    depth: 0.08,
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
scene.add(hexGroup);

// Circuit nodes on hex
function node(x, y, z) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 12),
    new THREE.MeshPhysicalMaterial({
      color: 0x9999ff,
      metalness: 1.0,
      roughness: 0.04,
      emissive: 0x4444bb,
      emissiveIntensity: 0.5,
    }),
  );
  m.position.set(x, y, z);
  return m;
}

const nodesGroup = new THREE.Group();
nodesGroup.add(node(0, 1.58, 0.04));
nodesGroup.add(node(0, -1.58, 0.04));
nodesGroup.add(node(1.37, 0.79, 0.04));
nodesGroup.add(node(-1.37, 0.79, 0.04));
nodesGroup.add(node(1.37, -0.79, 0.04));
nodesGroup.add(node(-1.37, -0.79, 0.04));
scene.add(nodesGroup);

let t = 0,
  animId;
function animate() {
  animId = requestAnimationFrame(animate);
  t += 0.012;
  // Only hex ring spins clockwise in Z axis (2D spin)
  hexGroup.rotation.z = -t;
  nodesGroup.rotation.z = -t;
  // Brain stays still — just subtle float
  brainGroup.position.y = Math.sin(t * 0.8) * 0.02;
  pl1.intensity = 2.5 + Math.sin(t * 1.5) * 0.3;
  renderer.render(scene, cam);
}
animate();
// ── STATE ──
let chatHistory = [];
let panicMode = false;
let vivaMode = false;

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
  vivaBtn.classList.toggle("active", vivaMode);
  vivaBtn.textContent = vivaMode ? "🎓 Viva ON" : "🎓 Viva Mode";
  if (vivaMode) {
    chatHistory = [];
    const notice = document.createElement("div");
    notice.className = "msg msg-ai";
    notice.innerHTML = `<span class="msg-label">Cortex</span>🎓 <strong>Viva Mode ON.</strong> I'm your professor now. Type your topic and I'll start firing questions.`;
    chatArea.appendChild(notice);
  } else {
    const notice = document.createElement("div");
    notice.className = "msg msg-ai";
    notice.innerHTML = `<span class="msg-label">Cortex</span>Viva Mode off. Good session! Back to normal.`;
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
  const isLongContent = text.length > 1200 || text.includes("```");

  if (isLongContent) {
    pushToCanvas(text);
    const div = document.createElement("div");
    div.className = "msg msg-ai";
    div.innerHTML = `<span class="msg-label">Cortex</span>I've pushed the detailed response to your <strong style="color:var(--teal)">Canvas →</strong>`;
    chatArea.appendChild(div);
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    actions.dataset.fullText = text;
    actions.innerHTML = `
      <button class="action-btn" data-tooltip="Summarize into bullet points" onclick="summarize(this, 'shorter')">Shorter</button>
      <button class="action-btn" data-tooltip="Expand into detailed explanation" onclick="summarize(this, 'longer')">More detail</button>
      <button class="action-btn" data-tooltip="Convert into flashcards on canvas" onclick="makeFlashcard(this)">⊞ Flashcard</button>
    `;
    chatArea.appendChild(actions);
  } else {
    const div = document.createElement("div");
    div.className = "msg msg-ai";
    div.innerHTML = `<span class="msg-label">Cortex</span>${formatMessage(text)}`;
    chatArea.appendChild(div);
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    actions.dataset.fullText = text;
    actions.innerHTML = `
      <button class="action-btn" data-tooltip="Summarize into bullet points" onclick="summarize(this, 'shorter')">Shorter</button>
      <button class="action-btn" data-tooltip="Expand into detailed explanation" onclick="summarize(this, 'longer')">More detail</button>
      <button class="action-btn" data-tooltip="Convert into flashcards on canvas" onclick="makeFlashcard(this)">⊞ Flashcard</button>
    `;
    chatArea.appendChild(actions);
  }
  scrollChat();
}

// ── PUSH LONG CONTENT TO CANVAS ──
function pushToCanvas(text) {
  canvasEmpty.style.display = "none";
  const card = document.createElement("div");
  card.className = "canvas-card";
  const title = document.createElement("div");
  title.className = "canvas-card-title";
  title.textContent = "▸ Study note — " + new Date().toLocaleTimeString();
  card.appendChild(title);
  const body = document.createElement("div");
  body.style.fontSize = "14px";
  body.style.lineHeight = "1.7";
  body.style.color = "var(--text-muted)";
  body.innerHTML = formatMessage(text);
  card.appendChild(body);
  canvasArea.insertBefore(card, canvasArea.firstChild);
  scrollCanvas();
}

// ── FORMAT MESSAGE ──
function formatMessage(text) {
  text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  text = text
    .split("\n")
    .map((line) => {
      if (line.match(/^\s*[\*\-]\s+/)) {
        return (
          '<div class="bullet">• ' +
          line.replace(/^\s*[\*\-]\s+/, "") +
          "</div>"
        );
      }
      return line;
    })
    .join("\n");
  text = text.replace(/\n/g, "<br>");
  return text;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// ── SCROLL ──
function scrollChat() {
  chatArea.scrollTop = chatArea.scrollHeight;
}
function scrollCanvas() {
  canvasArea.scrollTop = 0;
}

// ── SHORTER / MORE DETAIL ──
async function summarize(btn, type) {
  const actionsDiv = btn.parentElement;
  const originalText =
    actionsDiv.dataset.fullText || actionsDiv.previousElementSibling.innerText;
  btn.textContent = "...";
  btn.disabled = true;
  try {
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: originalText, type }),
    });
    const data = await res.json();
    if (data.reply) pushToCanvas(data.reply);
  } catch (err) {
    console.error(err);
  }
  btn.textContent = type === "shorter" ? "Shorter" : "More detail";
  btn.disabled = false;
}

// ── FLASHCARD GENERATOR ──
async function makeFlashcard(btn) {
  const actionsDiv = btn.parentElement;
  const text =
    actionsDiv.dataset.fullText || actionsDiv.previousElementSibling.innerText;
  btn.textContent = "Generating...";
  btn.disabled = true;
  try {
    const res = await fetch("/api/flashcard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.flashcards) pushFlashcardsToCanvas(data.flashcards);
  } catch (err) {
    console.error(err);
  }
  btn.textContent = "⊞ Flashcard";
  btn.disabled = false;
}

// ── PUSH FLASHCARDS TO CANVAS ──
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
    fcDiv.innerHTML = `
      <div class="flashcard-q">Q: ${fc.q}</div>
      <div class="flashcard-a">A: ${fc.a}</div>
      <div class="flashcard-hint">Tap to reveal answer</div>
    `;
    fcDiv.addEventListener("click", () => {
      fcDiv.classList.toggle("revealed");
      fcDiv.querySelector(".flashcard-hint").textContent =
        fcDiv.classList.contains("revealed")
          ? "Tap to hide"
          : "Tap to reveal answer";
    });
    card.appendChild(fcDiv);
  });
  canvasArea.insertBefore(card, canvasArea.firstChild);
  scrollCanvas();
}

// ── DRAG & DROP FILE ──
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
    appendAIMessage(
      "Currently only .txt files are supported. PDF support coming in v2!",
    );
    return;
  }
  scanOverlay.classList.add("active");
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const content = ev.target.result;
    setTimeout(() => {
      scanOverlay.classList.remove("active");
      userInput.value = `I've uploaded a file. Here's its content:\n\n${content.slice(0, 2000)}`;
      userInput.style.height = "auto";
      userInput.style.height = userInput.scrollHeight + "px";
    }, 2000);
  };
  reader.readAsText(file);
});

// ── MOBILE TABS ──
function switchTab(tab) {
  const leftPane = document.querySelector(".left-pane");
  const rightPane = document.querySelector(".right-pane");
  const chatTab = document.getElementById("chatTab");
  const canvasTab = document.getElementById("canvasTab");
  if (tab === "chat") {
    leftPane.classList.add("mobile-active");
    rightPane.classList.remove("mobile-active");
    chatTab.classList.add("active");
    canvasTab.classList.remove("active");
  } else {
    rightPane.classList.add("mobile-active");
    leftPane.classList.remove("mobile-active");
    canvasTab.classList.add("active");
    chatTab.classList.remove("active");
  }
}
function isMobile() {
  return window.innerWidth <= 768;
}

if (isMobile()) {
  document.querySelector(".left-pane").classList.add("mobile-active");
}

// ── PROFILE DROPDOWN ──
function toggleProfileMenu() {
  const dropdown = document.getElementById("profileDropdown");
  if (dropdown) dropdown.classList.toggle("open");
}

document.addEventListener("click", (e) => {
  const profile = document.getElementById("userProfile");
  const dropdown = document.getElementById("profileDropdown");
  if (profile && dropdown && !profile.contains(e.target)) {
    dropdown.classList.remove("open");
  }
});

// ── LOAD USER INFO ──
async function loadUser() {
  try {
    const res = await fetch("/api/user");
    if (!res.ok) {
      window.location.href = "/login";
      return;
    }
    const user = await res.json();
    const photo = document.getElementById("userPhoto");
    const name = document.getElementById("userName");
    const dropdownPhoto = document.getElementById("dropdownPhoto");
    const dropdownName = document.getElementById("dropdownName");
    const dropdownEmail = document.getElementById("dropdownEmail");
    if (photo) photo.src = user.photo;
    if (name) name.textContent = user.name.split(" ")[0];
    if (dropdownPhoto) dropdownPhoto.src = user.photo;
    if (dropdownName) dropdownName.textContent = user.name;
    if (dropdownEmail) dropdownEmail.textContent = user.email;
  } catch (err) {
    window.location.href = "/login";
  }
}

loadUser();

// ── SERVICE WORKER ──
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then(() => console.log("Cortex PWA ready"))
      .catch((err) => console.log("SW error:", err));
  });
}
// ── SWIPE GESTURE FOR MOBILE ──
let touchStartX = 0;
let touchStartY = 0;

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

    // Only horizontal swipes (dx > dy means horizontal)
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) {
      // Swipe left → go to Canvas
      switchTab("canvas");
    } else {
      // Swipe right → go to Chat
      switchTab("chat");
    }
  },
  { passive: true },
);
