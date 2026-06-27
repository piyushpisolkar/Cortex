require("dotenv").config();
const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");
const MongoStore = require("connect-mongo").default || require("connect-mongo");
const mongoose = require("mongoose");
const multer = require("multer");
// pdf-parse removed — using buffer approach
const fs = require("fs");

const isProduction =
  process.env.NODE_ENV === "production" || !!process.env.RENDER;

// ── FILE UPLOAD CONFIG ──
const upload = multer({
  dest: "/tmp/uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});
// ── INIT ──
const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── CONNECT MONGODB ──
if (process.env.MONGODB_URI) {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) =>
      console.error("MongoDB unavailable, continuing locally:", err.message),
    );
} else {
  console.log("MONGODB_URI missing, continuing with local-only sessions");
}

// ── SCHEMAS ──
const ChatSessionSchema = new mongoose.Schema({
  userId: String,
  title: String,
  messages: [{ role: String, content: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const ChatSession =
  mongoose.models.ChatSession ||
  mongoose.model("ChatSession", ChatSessionSchema);

// ── MIDDLEWARE ──
app.use(express.json());
app.set("trust proxy", 1);
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    lastModified: false,
    setHeaders: (res, filePath) => {
      if (
        filePath.endsWith(".html") ||
        filePath.endsWith(".css") ||
        filePath.endsWith(".js")
      ) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  }),
);

// ── SESSION WITH MONGODB ──
let sessionStore;
if (isProduction && process.env.MONGODB_URI) {
  sessionStore = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60,
    autoRemove: "native",
    touchAfter: 24 * 3600,
  });
} else {
  console.log("Using in-memory sessions for local development");
}

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: false,
    ...(sessionStore ? { store: sessionStore } : {}),
    cookie: {
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
    },
  }),
);

// ── PASSPORT ──
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.CALLBACK_URL ||
        "https://cortex-y7m6.onrender.com/auth/google/callback",
    },
    (accessToken, refreshToken, profile, done) => {
      return done(null, profile);
    },
  ),
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ── AUTH MIDDLEWARE ──
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// ── PWA FILES ──
app.get("/manifest.json", (req, res) => {
  res.sendFile(path.join(__dirname, "manifest.json"));
});

app.get("/service-worker.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  // Serve a killer SW that wipes all caches and does no caching
  res.send(`
    self.addEventListener('install', function() { self.skipWaiting(); });
    self.addEventListener('activate', function(e) {
      e.waitUntil(
        caches.keys().then(function(keys) {
          return Promise.all(keys.map(function(k) { return caches.delete(k); }));
        }).then(function() {
          return self.clients.claim();
        }).then(function() {
          return self.clients.matchAll({ type: 'window' }).then(function(clients) {
            clients.forEach(function(client) { client.navigate(client.url); });
          });
        })
      );
    });
    self.addEventListener('fetch', function() {});
  `);
});

// /sw-kill — a page the SW has never seen, forces full cache wipe then redirects
app.get("/sw-kill", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <script>
    function kill() {
      var done = [];
      if ('serviceWorker' in navigator) {
        done.push(navigator.serviceWorker.getRegistrations().then(function(regs) {
          return Promise.all(regs.map(function(r) { return r.unregister(); }));
        }));
      }
      if ('caches' in window) {
        done.push(caches.keys().then(function(keys) {
          return Promise.all(keys.map(function(k) { return caches.delete(k); }));
        }));
      }
      Promise.all(done).then(function() {
        document.getElementById('msg').textContent = 'All caches cleared! Redirecting...';
        setTimeout(function() { window.location.replace('/'); }, 1500);
      });
    }
    window.onload = kill;
  </script>
  </head><body style="background:#0d0d14;color:#e8e8f0;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p id="msg" style="font-size:20px;letter-spacing:0.1em;">Clearing all caches...</p>
  </body></html>`);
});

// ── PWA ICON ROUTES ──
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="115" fill="#534AB7"/>
  <g transform="translate(256,256) scale(8.8)">
    <circle cx="0" cy="0" r="26" stroke="rgba(255,255,255,0.28)" stroke-width="1.2" fill="none"/>
    <circle cx="0"   cy="-26" r="3"   fill="rgba(255,255,255,0.5)"/>
    <circle cx="26"  cy="0"   r="3"   fill="rgba(255,255,255,0.5)"/>
    <circle cx="0"   cy="26"  r="3"   fill="rgba(255,255,255,0.5)"/>
    <circle cx="-26" cy="0"   r="3"   fill="rgba(255,255,255,0.5)"/>
    <circle cx="0" cy="0" r="16" stroke="white" stroke-width="5.5" fill="none"/>
    <line x1="0"    y1="-6.5" x2="0"    y2="-12.5" stroke="white" stroke-width="4" stroke-linecap="round"/>
    <line x1="6.5"  y1="0"    x2="12.5" y2="0"     stroke="white" stroke-width="4" stroke-linecap="round"/>
    <line x1="0"    y1="6.5"  x2="0"    y2="12.5"  stroke="white" stroke-width="4" stroke-linecap="round"/>
    <line x1="-6.5" y1="0"    x2="-12.5" y2="0"    stroke="white" stroke-width="4" stroke-linecap="round"/>
    <circle cx="0" cy="0" r="5.5" fill="white"/>
  </g>
</svg>`;

const ICONS_DIR = path.join(__dirname, "public", "icons");
const ICON_192  = path.join(ICONS_DIR, "cortex-icon-192.png");
const ICON_512  = path.join(ICONS_DIR, "cortex-icon-512.png");

async function generateIcons() {
  try {
    if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });
    if (fs.existsSync(ICON_192) && fs.existsSync(ICON_512)) {
      console.log("✓ PWA icons already exist");
      return;
    }
    let sharp;
    try { sharp = require("sharp"); } catch {
      console.warn("⚠ sharp not installed — run: npm install sharp");
      return;
    }
    const svgBuf = Buffer.from(LOGO_SVG);
    await Promise.all([
      sharp(svgBuf).resize(192, 192).png().toFile(ICON_192),
      sharp(svgBuf).resize(512, 512).png().toFile(ICON_512),
    ]);
    console.log("✓ PWA icons generated");
  } catch (err) {
    console.error("✗ Icon generation failed:", err.message);
  }
}
generateIcons();

app.get("/icons/cortex-logo.svg", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(LOGO_SVG);
});

app.get(["/icons/cortex-icon-192.png", "/icons/icon-192.png"], (req, res) => {
  if (fs.existsSync(ICON_192)) return res.sendFile(ICON_192);
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(LOGO_SVG);
});

app.get(["/icons/cortex-icon-512.png", "/icons/icon-512.png"], (req, res) => {
  if (fs.existsSync(ICON_512)) return res.sendFile(ICON_512);
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(LOGO_SVG);
});
// ── AUTH ROUTES ──
app.get("/auth/google", (req, res, next) => {
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })(req, res, next);
});

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => res.redirect("/"),
);

app.get("/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/login");
    });
  });
});

// ── LOGIN PAGE ──
app.get("/login", (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// ── MAIN APP ──
app.get("/", isLoggedIn, (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ── HISTORY API ──
app.get("/api/history", isLoggedIn, async (req, res) => {
  try {
    const sessions = await ChatSession.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .limit(30)
      .select("title messages createdAt updatedAt");
    res.json(sessions);
  } catch (e) {
    res.json([]);
  }
});

app.get("/api/history/:id", isLoggedIn, async (req, res) => {
  try {
    const session = await ChatSession.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!session) return res.status(404).json({ error: "Not found" });
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: "Error loading session" });
  }
});

app.post("/api/history/save", isLoggedIn, async (req, res) => {
  try {
    const { messages, title, id } = req.body;
    if (!messages || messages.length < 2) return res.json({ ok: false });

    // Strip _id and MongoDB fields — only keep {role, content}
    const cleanMessages = messages
      .filter(m => m && m.role && m.content)
      .map(({ role, content }) => ({ role, content }));

    const autoTitle =
      cleanMessages.find(m => m.role === "user")?.content?.slice(0, 60) || "Chat session";

    if (id) {
      // Update existing session instead of creating duplicate
      await ChatSession.findOneAndUpdate(
        { _id: id, userId: req.user.id },
        { messages: cleanMessages, title: title || autoTitle, updatedAt: new Date() },
        { new: true }
      );
      return res.json({ ok: true, id });
    } else {
      const session = await ChatSession.create({
        userId: req.user.id,
        title: title || autoTitle,
        messages: cleanMessages,
      });
      return res.json({ ok: true, id: session._id });
    }
  } catch (e) {
    console.error("History save error:", e.message);
    res.json({ ok: false });
  }
});

app.delete("/api/history/:id", isLoggedIn, async (req, res) => {
  try {
    await ChatSession.deleteOne({ _id: req.params.id, userId: req.user.id });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ── USER API ──
app.get("/api/user", isLoggedIn, (req, res) => {
  let photo = req.user.photos?.[0]?.value || "/icons/cortex-logo.svg";
  photo = photo.replace("=s96-c", "=s200-c");
  res.json({
    name: req.user.displayName || "Student",
    email: req.user.emails?.[0]?.value || "",
    photo: photo,
  });
});

// ── SYSTEM PROMPTS ──
const SYSTEM_PROMPT = `You are Cortex, an elite AI study assistant built exclusively for MSBTE (Maharashtra State Board of Technical Education) diploma engineering students in India.

You have deep knowledge of the MSBTE diploma engineering curriculum including:
- All 6 semesters across branches: Computer Engineering, Mechanical, Civil, Electrical, Electronics & Telecommunication
- Current MSBTE syllabus: K-Scheme (latest, currently running) — always refer to K-Scheme topics and structure
- K-Scheme features: competency-based curriculum, Course Outcomes (COs), theory + practical integrated, micro projects, online exam component
- Common subjects: Applied Mathematics, Applied Science, Engineering Drawing, Communication Skills, Professional Practices
- Branch-specific subjects for Computer Engineering K-Scheme:
  Sem 1-2: Applied Mathematics, Applied Science, Engineering Drawing, Communication Skills
  Sem 3: Data Structures using C, Digital Techniques, Computer Organization, Web Design, OOP using C++
  Sem 4: Database Management System, Operating System, Java Programming, Computer Networks, Python Programming
  Sem 5: Software Engineering, Microprocessor & Interfacing, Advanced Java, Linux Administration, Project
  Sem 6: Cloud Computing, Cyber Security, Mobile App Development, AI & ML Basics, Major Project
- MSBTE K-Scheme exam pattern: End semester theory (70 marks), Internal assessment (30 marks), Practical exams, Micro projects
- Important questions, PYQs patterns, and commonly asked topics in MSBTE K-Scheme papers

Your personality: sharp, clear, and intelligent — like a brilliant senior student helping a junior crack their MSBTE exams.

Rules:
- Always refer to K-Scheme when mentioning syllabus, topics, or exam structure
- Always relate answers to the MSBTE K-Scheme syllabus and exam perspective when relevant
- When a student asks about a topic, mention which unit/chapter it falls under if you know it
- For definitions, give the exact textbook-style definition first, then a simple explanation
- Keep responses focused — max 3-4 sentences for simple questions
- Only give long responses when the question genuinely requires detail
- For code, always use proper code blocks
- For concepts, give a 2-3 line explanation first, then bullet points if needed
- Mention "important for MSBTE K-Scheme exam" when a topic is frequently asked
- Never say you cannot access the internet — just answer from your training knowledge
- If asked to "fetch syllabus", explain the K-Scheme syllabus from your knowledge instead`;

const PANIC_PROMPT = `You are Cortex in PANIC MODE — built for MSBTE K-Scheme diploma students with exams in hours.
Rules:
- Bullet points ONLY — no paragraphs
- Only the most important points, definitions, and formulas
- Focus on what's most frequently asked in MSBTE K-Scheme exams
- Include key terms the examiner expects to see
- Start every response with "⚡ PANIC MODE:"
- Max 8-10 bullets per response`;

const VIVA_PROMPT = `You are a strict MSBTE K-Scheme engineering professor conducting an oral viva exam.
Rules:
- Ask ONE question at a time — never multiple
- Wait for the student's answer before asking the next
- After each answer: give brief feedback (Correct / Partially correct / Incorrect) in one line, then ask the next question
- Questions should go from basic definitions → applications → tricky conceptual questions
- Ask questions that are commonly asked in MSBTE K-Scheme viva exams
- Start by asking: "Ready for your viva? Tell me the subject you want to be examined on."
- Be strict but fair — exactly like a real MSBTE K-Scheme examiner`;

// ── CHAT API ──
app.post("/api/chat", isLoggedIn, async (req, res) => {
  const { message, history, mode } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    const systemPrompt =
      mode === "panic" ? PANIC_PROMPT :
      mode === "viva"  ? VIVA_PROMPT  : SYSTEM_PROMPT;

    // ── CRITICAL: strip _id and any MongoDB fields — Groq only accepts {role, content} ──
    const cleanHistory = Array.isArray(history)
      ? history
          .filter(m => m && typeof m.role === "string" && typeof m.content === "string")
          .map(({ role, content }) => ({ role, content }))
          .slice(-20) // keep last 20 messages max to avoid token overflow
      : [];

    const messages = [
      { role: "system", content: systemPrompt },
      ...cleanHistory,
      { role: "user", content: message.trim() },
    ];

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 1500,
      temperature: 0.7,
    });

    const reply = response.choices?.[0]?.message?.content;
    if (!reply) throw new Error("Empty response from Groq");

    res.json({ reply });
  } catch (error) {
    console.error("Groq chat error:", error?.message || error);
    const msg = error?.message?.includes("_id")
      ? "Session data error — please start a new chat."
      : error?.message?.includes("rate_limit")
      ? "Cortex is busy right now. Try again in a moment."
      : error?.message?.includes("context_length")
      ? "This conversation is too long. Please start a new chat."
      : "Cortex couldn't respond. Please try again.";
    res.status(500).json({ error: msg });
  }
});

// ── FLASHCARD API ──
app.post("/api/flashcard", isLoggedIn, async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length < 20)
    return res.status(400).json({ error: "Not enough content to make flashcards." });

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Convert the given text into exactly 3 flashcards for MSBTE engineering exam preparation.
Respond ONLY with a valid JSON array, no markdown, no explanation, nothing else:
[{"q":"question","a":"answer"},{"q":"question","a":"answer"},{"q":"question","a":"answer"}]`,
        },
        { role: "user", content: text.slice(0, 3000) },
      ],
      max_tokens: 600,
      temperature: 0.3,
    });

    const raw = response.choices[0].message.content.trim();
    const clean = raw.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("Invalid JSON response");
    const flashcards = JSON.parse(clean.slice(start, end + 1));
    res.json({ flashcards });
  } catch (error) {
    console.error("Flashcard error:", error.message);
    res.status(500).json({ error: "Could not generate flashcards. Try again." });
  }
});

// ── SUMMARIZE API ──
app.post("/api/summarize", isLoggedIn, async (req, res) => {
  const { text, type } = req.body;
  if (!text || text.trim().length < 10)
    return res.status(400).json({ error: "No content to summarize." });

  try {
    const instruction = type === "shorter"
      ? "Summarize this in 3-4 concise bullet points for an MSBTE engineering student. Keep only the most exam-relevant points."
      : "Expand this into a detailed technical explanation with examples. Structure it clearly with headings and bullet points for an MSBTE engineering student.";

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: text.slice(0, 3000) },
      ],
      max_tokens: 1024,
      temperature: 0.5,
    });

    res.json({ reply: response.choices[0].message.content });
  } catch (error) {
    console.error("Summarize error:", error.message);
    res.status(500).json({ error: "Could not summarize. Try again." });
  }
});

// ── FILE UPLOAD & ANALYSIS API ──
app.post("/api/upload", isLoggedIn, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const { mimetype, path: filePath, originalname } = req.file;
  const userMessage =
    req.body.message ||
    "Analyze this file and give me a summary of the key points.";

  try {
    let content = "";
    let isImage = false;

    if (mimetype === "application/pdf") {
      // Extract text from PDF by reading raw buffer and finding text streams
      const buffer = fs.readFileSync(filePath);
      const str = buffer.toString("latin1");
      const textMatches = str.match(/BT[\s\S]*?ET/g) || [];
      let extractedText = "";
      textMatches.forEach((block) => {
        const tjMatches = block.match(/\(([^)]+)\)\s*Tj/g) || [];
        tjMatches.forEach((tj) => {
          extractedText += tj.replace(/\(([^)]+)\)\s*Tj/, "$1") + " ";
        });
      });
      content = extractedText.trim().slice(0, 6000);
      if (!content) {
        return res.status(400).json({
          error:
            "Could not extract text. PDF may be scanned. Try uploading as image instead.",
        });
      }
    } else if (mimetype.startsWith("image/")) {
      isImage = true;
      const imageData = fs.readFileSync(filePath).toString("base64");
      content = imageData;
    } else {
      // Plain text
      content = fs.readFileSync(filePath, "utf8").slice(0, 6000);
    }

    // Clean up temp file
    fs.unlinkSync(filePath);

    if (isImage) {
      // Use Groq vision for images
      const response = await groq.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are Cortex, an AI study assistant. ${userMessage}`,
              },
              {
                type: "image_url",
                image_url: { url: `data:${mimetype};base64,${content}` },
              },
            ],
          },
        ],
        max_tokens: 1024,
      });
      return res.json({
        reply: response.choices[0].message.content,
        type: "image",
        filename: originalname,
      });
    } else {
      // Use text model for PDFs and text files
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are Cortex, an AI study assistant. The user has uploaded a file named "${originalname}". Analyze its content and help the student understand it. Be clear, structured, and highlight key points.`,
          },
          {
            role: "user",
            content: `${userMessage}\n\nFile content:\n${content}`,
          },
        ],
        max_tokens: 1024,
      });
      return res.json({
        reply: response.choices[0].message.content,
        type: "pdf",
        filename: originalname,
      });
    }
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error("Upload error:", error);
    res.status(500).json({ error: "Could not analyze file. Try again." });
  }
});

// ── START ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🧠 Cortex running → http://localhost:${PORT}`);
});
