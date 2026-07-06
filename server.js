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
  process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT;

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

// ── PLANNER SCHEMA ──
const PlannerSessionSchema = new mongoose.Schema({
  userId:   String,
  subject:  String,
  date:     String,
  duration: String,
  createdAt: { type: Date, default: Date.now },
});
const PlannerSession =
  mongoose.models.PlannerSession ||
  mongoose.model("PlannerSession", PlannerSessionSchema);

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

app.get(["/icons/icon-192.png", "/icons/icon-512.png"], (req, res) => {
  res.sendFile(path.join(__dirname, "public/icons/cortex-logo.svg"));
});

// ── ICONS ──
app.get("/icons/icon-192.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`<svg width="192" height="192" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#1a1a2e"/>
        <stop offset="100%" style="stop-color:#0d0d14"/>
      </radialGradient>
      <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#6699ff"/>
        <stop offset="100%" style="stop-color:#4433aa"/>
      </linearGradient>
      <linearGradient id="bg2" x1="20%" y1="0%" x2="80%" y2="100%">
        <stop offset="0%" style="stop-color:#88aaff"/>
        <stop offset="100%" style="stop-color:#5544cc"/>
      </linearGradient>
    </defs>
    <rect width="200" height="200" fill="url(#bg)" rx="40"/>
    <polygon points="100,18 172,60 172,140 100,182 28,140 28,60" fill="none" stroke="url(#hg)" stroke-width="6" stroke-linejoin="round"/>
    <path d="M96,62 C96,62 74,63 66,76 C58,89 58,104 62,116 C66,128 72,136 80,140 C84,142 92,143 96,143" fill="none" stroke="url(#bg2)" stroke-width="5" stroke-linecap="round"/>
    <path d="M96,80 C88,81 80,86 78,94 C76,102 80,109 88,111" fill="none" stroke="url(#bg2)" stroke-width="4" stroke-linecap="round"/>
    <path d="M96,112 C91,113 86,117 86,123 C86,129 90,133 96,134" fill="none" stroke="url(#bg2)" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M104,62 C104,62 126,63 134,76 C142,89 142,104 138,116 C134,128 128,136 120,140 C116,142 108,143 104,143" fill="none" stroke="url(#bg2)" stroke-width="5" stroke-linecap="round"/>
    <path d="M104,80 C112,81 120,86 122,94 C124,102 120,109 112,111" fill="none" stroke="url(#bg2)" stroke-width="4" stroke-linecap="round"/>
    <path d="M104,112 C109,113 114,117 114,123 C114,129 110,133 104,134" fill="none" stroke="url(#bg2)" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="100" y1="62" x2="100" y2="143" stroke="#5544aa" stroke-width="2.5" stroke-dasharray="5,5"/>
    <path d="M96,143 C97,150 103,150 104,143" fill="none" stroke="url(#bg2)" stroke-width="5" stroke-linecap="round"/>
  </svg>`);
});

app.get("/icons/icon-512.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`<svg width="512" height="512" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#1a1a2e"/>
        <stop offset="100%" style="stop-color:#0d0d14"/>
      </radialGradient>
      <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#6699ff"/>
        <stop offset="100%" style="stop-color:#4433aa"/>
      </linearGradient>
      <linearGradient id="bg2" x1="20%" y1="0%" x2="80%" y2="100%">
        <stop offset="0%" style="stop-color:#88aaff"/>
        <stop offset="100%" style="stop-color:#5544cc"/>
      </linearGradient>
    </defs>
    <rect width="200" height="200" fill="url(#bg)" rx="40"/>
    <polygon points="100,18 172,60 172,140 100,182 28,140 28,60" fill="none" stroke="url(#hg)" stroke-width="6" stroke-linejoin="round"/>
    <path d="M96,62 C96,62 74,63 66,76 C58,89 58,104 62,116 C66,128 72,136 80,140 C84,142 92,143 96,143" fill="none" stroke="url(#bg2)" stroke-width="5" stroke-linecap="round"/>
    <path d="M96,80 C88,81 80,86 78,94 C76,102 80,109 88,111" fill="none" stroke="url(#bg2)" stroke-width="4" stroke-linecap="round"/>
    <path d="M96,112 C91,113 86,117 86,123 C86,129 90,133 96,134" fill="none" stroke="url(#bg2)" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M104,62 C104,62 126,63 134,76 C142,89 142,104 138,116 C134,128 128,136 120,140 C116,142 108,143 104,143" fill="none" stroke="url(#bg2)" stroke-width="5" stroke-linecap="round"/>
    <path d="M104,80 C112,81 120,86 122,94 C124,102 120,109 112,111" fill="none" stroke="url(#bg2)" stroke-width="4" stroke-linecap="round"/>
    <path d="M104,112 C109,113 114,117 114,123 C114,129 110,133 104,134" fill="none" stroke="url(#bg2)" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="100" y1="62" x2="100" y2="143" stroke="#5544aa" stroke-width="2.5" stroke-dasharray="5,5"/>
    <path d="M96,143 C97,150 103,150 104,143" fill="none" stroke="url(#bg2)" stroke-width="5" stroke-linecap="round"/>
  </svg>`);
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

    // Strip _id and MongoDB fields — Groq only accepts {role, content}
    const cleanMessages = messages
      .filter(m => m && m.role && m.content)
      .map(({ role, content }) => ({ role, content }));

    const autoTitle =
      cleanMessages.find(m => m.role === "user")?.content?.slice(0, 60) ||
      "Chat session";

    if (id) {
      // Update existing session — this is the key fix for duplicate sessions
      const updated = await ChatSession.findOneAndUpdate(
        { _id: id, userId: req.user.id },
        { messages: cleanMessages, title: title || autoTitle, updatedAt: new Date() },
        { new: true }
      );
      if (updated) return res.json({ ok: true, id: updated._id });
    }

    // Only create new session if no id provided or session not found
    const session = await ChatSession.create({
      userId: req.user.id,
      title: title || autoTitle,
      messages: cleanMessages,
    });
    res.json({ ok: true, id: session._id });
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

You have deep knowledge of the MSBTE K-Scheme diploma engineering curriculum:
- All 6 semesters across branches: Computer Engineering, Mechanical, Civil, Electrical, E&TC
- Current scheme: K-Scheme (competency-based, Course Outcomes, theory + practical, micro projects)
- Computer Engineering K-Scheme subjects:
  Sem 1-2: Applied Mathematics, Applied Science, Engineering Drawing, Communication Skills
  Sem 3: Data Structures using C, Digital Techniques, Computer Organization, Web Design, OOP with C++
  Sem 4: DBMS, Operating System, Java Programming, Computer Networks, Python Programming
  Sem 5: Software Engineering, Microprocessor & Interfacing, Advanced Java, Linux Administration, Project
  Sem 6: Cloud Computing, Cyber Security, Mobile App Development, AI & ML Basics, Major Project
- MSBTE K-Scheme exam: theory 70 marks, internal 30 marks, practicals, micro projects
- Deep knowledge of PYQs, important topics, and frequently asked exam questions

Your personality: sharp, clear, intelligent — like a brilliant senior student helping a junior crack MSBTE exams.

Rules:
- Always refer to K-Scheme syllabus and exam perspective
- Mention unit/chapter when relevant
- Definitions: textbook-style first, then simple explanation
- Keep responses focused — 3-4 sentences for simple questions
- Long responses only when genuinely needed
- Always use proper code blocks for code
- Flag topics as "important for MSBTE K-Scheme exam" when frequently asked
- If asked to fetch syllabus, explain from your knowledge instead`;

const PANIC_PROMPT = `You are Cortex in PANIC MODE — for MSBTE K-Scheme students with exams in hours.
Rules:
- Bullet points ONLY — no paragraphs ever
- Most important points, definitions, and formulas only
- Focus on frequently asked MSBTE K-Scheme exam topics
- Include key terms the examiner expects
- Start every response with "⚡ PANIC MODE:"
- Max 8-10 bullets per response`;

const VIVA_PROMPT = `You are a strict MSBTE K-Scheme engineering professor conducting an oral viva.
Rules:
- Ask ONE question at a time — never multiple
- Wait for the student answer before asking next
- After each answer: one line feedback (Correct / Partially correct / Incorrect), then next question
- Progress: basic definitions → applications → tricky conceptual
- Ask questions common in MSBTE K-Scheme viva exams
- Start: "Ready for your viva? Tell me the subject you want to be examined on."
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

    // Strip _id and MongoDB fields — Groq only accepts {role, content}
    const cleanHistory = Array.isArray(history)
      ? history
          .filter(m => m && typeof m.role === "string" && typeof m.content === "string")
          .map(({ role, content }) => ({ role, content }))
          .slice(-20)
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
      : "Cortex could not respond. Please try again.";
    res.status(500).json({ error: msg });
  }
});

// ── FLASHCARD API ──
app.post("/api/flashcard", isLoggedIn, async (req, res) => {
  const { text } = req.body;
  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Convert the given text into exactly 3 flashcards.
          Respond ONLY in this JSON format, nothing else:
          [
            {"q": "question here", "a": "answer here"},
            {"q": "question here", "a": "answer here"},
            {"q": "question here", "a": "answer here"}
          ]`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 512,
    });

    const raw = response.choices[0].message.content;
    const clean = raw.replace(/```json|```/g, "").trim();
    const flashcards = JSON.parse(clean);
    res.json({ flashcards });
  } catch (error) {
    console.error("Flashcard error:", error);
    res.status(500).json({ error: "Could not generate flashcards." });
  }
});

// ── SUMMARIZE API ──
app.post("/api/summarize", isLoggedIn, async (req, res) => {
  const { text, type } = req.body;
  try {
    const instruction =
      type === "shorter"
        ? "Summarize this in 3-4 bullet points. Be very concise."
        : "Expand this into a detailed technical explanation with examples.";

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: text },
      ],
      max_tokens: 1024,
    });

    res.json({ reply: response.choices[0].message.content });
  } catch (error) {
    console.error("Summarize error:", error);
    res.status(500).json({ error: "Could not summarize." });
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

// ── PLANNER API ──
app.get("/api/planner", isLoggedIn, async (req, res) => {
  try {
    const sessions = await PlannerSession.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(sessions);
  } catch (e) {
    console.error("Planner get error:", e.message);
    res.status(500).json([]);
  }
});

app.post("/api/planner", isLoggedIn, async (req, res) => {
  try {
    const { subject, date, duration } = req.body;
    if (!subject) return res.status(400).json({ ok: false });
    const session = await PlannerSession.create({
      userId: req.user.id,
      subject: subject.trim(),
      date: date || "",
      duration: duration?.trim() || "",
    });
    res.json({ ok: true, id: session._id, session });
  } catch (e) {
    console.error("Planner save error:", e.message);
    res.status(500).json({ ok: false });
  }
});

app.delete("/api/planner/:id", isLoggedIn, async (req, res) => {
  try {
    await PlannerSession.deleteOne({ _id: req.params.id, userId: req.user.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// ── START ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🧠 Cortex running → http://localhost:${PORT}`);
});
