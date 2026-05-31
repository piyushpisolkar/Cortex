// ── SPLASH SCREEN ──
(function () {
  const splash = document.getElementById("splashScreen");
  const canvas = document.getElementById("splashCanvas");
  if (!splash || !canvas || typeof THREE === "undefined") {
    setTimeout(() => {
      if (splash) splash.style.opacity = "0";
      setTimeout(() => {
        if (splash) splash.style.display = "none";
      }, 1000);
    }, 3000);
    return;
  }

  const size = Math.min(window.innerWidth * 0.65, 240);
  canvas.width = size;
  canvas.height = size;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(size, size);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  cam.position.set(0, 0, 5);

  // Lights — no center spotlight
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const pl1 = new THREE.PointLight(0x7f77dd, 2.5, 20);
  pl1.position.set(4, 4, 4);
  scene.add(pl1);
  const pl2 = new THREE.PointLight(0x1d9e75, 1.5, 20);
  pl2.position.set(-4, -3, 3);
  scene.add(pl2);
  const pl3 = new THREE.PointLight(0x7f77dd, 1, 15);
  pl3.position.set(0, 0, 6);
  scene.add(pl3);

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

  // Outer hex ring
  const outerS = hexShape(1.5);
  outerS.holes.push(hexShape(1.2));
  const outerHex = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outerS, {
      depth: 0.2,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 6,
    }),
    new THREE.MeshPhysicalMaterial({
      color: 0x7f77dd,
      metalness: 0.95,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      emissive: 0x3c3489,
      emissiveIntensity: 0.2,
    }),
  );
  outerHex.position.z = -0.1;

  // Inner hex panel
  const innerHex = new THREE.Mesh(
    new THREE.ExtrudeGeometry(hexShape(1.15), {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 4,
    }),
    new THREE.MeshPhysicalMaterial({
      color: 0x0d0d14,
      metalness: 0.5,
      roughness: 0.4,
    }),
  );
  innerHex.position.z = -0.05;

  // Brain lobes — matching original SVG exactly
  function brainTube(pts, r) {
    return new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts),
        40,
        r || 0.042,
        8,
        false,
      ),
      new THREE.MeshPhysicalMaterial({
        color: 0x7f77dd,
        metalness: 0.5,
        roughness: 0.3,
        emissive: 0x5550a0,
        emissiveIntensity: 0.4,
        clearcoat: 0.8,
      }),
    );
  }

  // Left lobe — matches SVG path M28,38 C28,30 33,26 38,27...
  const leftLobe = brainTube([
    new THREE.Vector3(-0.08, 0.52, 0.12),
    new THREE.Vector3(-0.38, 0.48, 0.16),
    new THREE.Vector3(-0.52, 0.18, 0.18),
    new THREE.Vector3(-0.48, -0.08, 0.16),
    new THREE.Vector3(-0.32, -0.28, 0.13),
    new THREE.Vector3(-0.08, -0.32, 0.11),
  ]);

  // Right lobe — matches SVG path M52,38...
  const rightLobe = brainTube([
    new THREE.Vector3(0.08, 0.52, 0.12),
    new THREE.Vector3(0.38, 0.48, 0.16),
    new THREE.Vector3(0.52, 0.18, 0.18),
    new THREE.Vector3(0.48, -0.08, 0.16),
    new THREE.Vector3(0.32, -0.28, 0.13),
    new THREE.Vector3(0.08, -0.32, 0.11),
  ]);

  // Bottom curve — matches SVG M36,45 C37,50 43,50 44,45
  const bottomCurve = brainTube([
    new THREE.Vector3(-0.08, -0.32, 0.11),
    new THREE.Vector3(0, -0.46, 0.12),
    new THREE.Vector3(0.08, -0.32, 0.11),
  ]);

  // Center dashed line — small cylinders
  for (let i = 0; i < 5; i++) {
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.1, 6),
      new THREE.MeshPhysicalMaterial({
        color: 0x5550a0,
        emissive: 0x5550a0,
        emissiveIntensity: 0.3,
      }),
    );
    cyl.position.set(0, 0.44 - i * 0.19, 0.12);
    cyl.rotation.z = Math.PI / 2;
    cyl.rotation.x = Math.PI / 2;
    scene.add(cyl);
  }

  // Circuit nodes
  function node(x, y, z, r, c) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 12, 12),
      new THREE.MeshPhysicalMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: 0.9,
        metalness: 0.8,
        roughness: 0.1,
      }),
    );
    m.position.set(x, y, z);
    return m;
  }

  // Circuit traces
  function trace(p1, p2, c) {
    const pts = [new THREE.Vector3(...p1), new THREE.Vector3(...p2)];
    return new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts),
        6,
        0.018,
        6,
        false,
      ),
      new THREE.MeshPhysicalMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: 0.2,
      }),
    );
  }

  // Glow ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.018, 8, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0x7f77dd,
      emissive: 0x7f77dd,
      emissiveIntensity: 0.6,
      metalness: 0.5,
    }),
  );
  ring.position.z = 0.04;

  const group = new THREE.Group();
  group.add(outerHex, innerHex, leftLobe, rightLobe, bottomCurve, ring);
  group.add(node(0, 0.52, 0.13, 0.055, 0x7f77dd));
  group.add(node(0, -0.32, 0.11, 0.055, 0x7f77dd));
  group.add(node(-1.12, 0, 0.04, 0.048, 0x3c3489));
  group.add(node(1.12, 0, 0.04, 0.048, 0x3c3489));
  group.add(node(0, 1.1, 0.03, 0.048, 0x3c3489));
  group.add(node(0, -1.1, 0.03, 0.048, 0x3c3489));
  group.add(trace([-1.08, 0, 0.04], [-0.72, 0, 0.07], 0x3a3660));
  group.add(trace([1.08, 0, 0.04], [0.72, 0, 0.07], 0x3a3660));
  group.add(trace([0, 1.06, 0.03], [0, 0.76, 0.08], 0x3a3660));
  group.add(trace([0, -1.06, 0.03], [0, -0.76, 0.08], 0x3a3660));
  scene.add(group);

  let t = 0,
    animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    t += 0.012;
    group.rotation.y = t;
    group.rotation.x = Math.sin(t * 0.4) * 0.15;
    pl1.intensity = 2.5 + Math.sin(t * 1.5) * 0.3;
    renderer.render(scene, cam);
  }
  animate();

  // Dismiss after 3.2 seconds
  setTimeout(() => {
    splash.style.opacity = "0";
    setTimeout(() => {
      splash.style.display = "none";
      cancelAnimationFrame(animId);
      renderer.dispose();
    }, 1000);
  }, 3200);
})();
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
