require("dotenv").config();
const express = require("express");
const path    = require("path");
const fs      = require("fs");
const Groq    = require("groq-sdk");
const passport       = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session    = require("express-session");
const MongoStore = require("connect-mongo").default || require("connect-mongo");
const mongoose   = require("mongoose");
const multer     = require("multer");

const isProduction =
  process.env.NODE_ENV === "production" || !!process.env.RENDER;

// ── PWA ICON PATHS ──
const ICONS_DIR   = path.join(__dirname, "public", "icons");
const ICON_192    = path.join(ICONS_DIR, "cortex-icon-192.png");
const ICON_512    = path.join(ICONS_DIR, "cortex-icon-512.png");

// V3 Double Ring Neural Mark — single source of truth
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="115" fill="#534AB7"/>
  <g transform="translate(256,256) scale(8.8)">
    <circle cx="0" cy="0" r="26" stroke="rgba(255,255,255,0.28)" stroke-width="1.2" fill="none"/>
    <circle cx="0"   cy="-26" r="3"   fill="rgba(255,255,255,0.5)"/>
    <circle cx="26"  cy="0"   r="3"   fill="rgba(255,255,255,0.5)"/>
    <circle cx="0"   cy="26"  r="3"   fill="rgba(255,255,255,0.5)"/>
    <circle cx="-26" cy="0"   r="3"   fill="rgba(255,255,255,0.5)"/>
    <circle cx="0" cy="0" r="16" stroke="white" stroke-width="5.5" fill="none"/>
    <line x1="0"    y1="-6.5" x2="0"    y2="-12.5" stroke="white" stroke-width="4"   stroke-linecap="round"/>
    <line x1="6.5"  y1="0"    x2="12.5" y2="0"     stroke="white" stroke-width="4"   stroke-linecap="round"/>
    <line x1="0"    y1="6.5"  x2="0"    y2="12.5"  stroke="white" stroke-width="4"   stroke-linecap="round"/>
    <line x1="-6.5" y1="0"    x2="-12.5" y2="0"    stroke="white" stroke-width="4"   stroke-linecap="round"/>
    <circle cx="0" cy="0" r="5.5" fill="white"/>
  </g>
</svg>`;

// ── AUTO-GENERATE PWA ICONS ON STARTUP ──
async function generateIcons() {
  try {
    if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

    // Skip if both PNGs already exist
    if (fs.existsSync(ICON_192) && fs.existsSync(ICON_512)) {
      console.log("✓ PWA icons already exist, skipping generation");
      return;
    }

    let sharp;
    try {
      sharp = require("sharp");
    } catch {
      console.warn("⚠ sharp not installed — PWA PNG icons will not be generated.");
      console.warn("  Run: npm install sharp");
      return;
    }

    const svgBuffer = Buffer.from(LOGO_SVG);
    await Promise.all([
      sharp(svgBuffer).resize(192, 192).png().toFile(ICON_192),
      sharp(svgBuffer).resize(512, 512).png().toFile(ICON_512),
    ]);
    console.log("✓ PWA icons generated: cortex-icon-192.png & cortex-icon-512.png");
  } catch (err) {
    console.error("✗ Icon generation failed:", err.message);
  }
}

generateIcons();

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
// Serve the master SVG logo
app.get("/icons/cortex-logo.svg", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(LOGO_SVG);
});

// Serve generated PNGs (or fall back to SVG if sharp never ran)
app.get(["/icons/cortex-icon-192.png", "/icons/icon-192.png"], (req, res) => {
  if (fs.existsSync(ICON_192)) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(ICON_192);
  }
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(LOGO_SVG);
});

app.get(["/icons/cortex-icon-512.png", "/icons/icon-512.png"], (req, res) => {
  if (fs.existsSync(ICON_512)) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(ICON_512);
  }
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
    const { messages, title } = req.body;
    if (!messages || messages.length < 2) return res.json({ ok: false });
    const autoTitle =
      messages.find((m) => m.role === "user")?.content?.slice(0, 60) ||
      "Chat session";
    const session = await ChatSession.create({
      userId: req.user.id,
      title: title || autoTitle,
      messages,
    });
    res.json({ ok: true, id: session._id });
  } catch (e) {
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
const SYSTEM_PROMPT = `You are Cortex, an elite AI study assistant built specifically for engineering students.
Your personality: sharp, clear, and intelligent — like a friendly brilliant senior student helping a junior.
Rules:
- Keep responses SHORT, simple to understand and focused — max 3-4 sentences for simple questions
- Only give long responses when the question genuinely requires detail
- For code requests, always use proper code blocks with backticks
- For concepts, give a clear 2-3 line explanation in simple words first, then bullet points only if needed
- Never add unnecessary padding or filler sentences`;

const PANIC_PROMPT = `You are Cortex in PANIC MODE. The student has an exam in 2 hours.
Rules:
- Be extremely concise — bullet points only
- Give only the most important points
- No long explanations — just facts, formulas, and key terms
- Start every response with "⚡ PANIC MODE:"`;

const VIVA_PROMPT = `You are a strict engineering professor conducting a viva exam.
Rules:
- Ask ONE question at a time — never multiple questions
- Wait for the student's answer before asking the next question
- After each answer, give brief feedback (correct/incorrect/partial)
- Then immediately ask the next question
- Questions should go from easy to hard
- Start by asking: "Ready for your viva? Tell me the topic you want to be examined on."
- Keep feedback short and sharp — max 2 sentences`;

// ── CHAT API ──
app.post("/api/chat", isLoggedIn, async (req, res) => {
  const { message, history, mode } = req.body;
  try {
    const systemPrompt =
      mode === "panic"
        ? PANIC_PROMPT
        : mode === "viva"
          ? VIVA_PROMPT
          : SYSTEM_PROMPT;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 1024,
    });

    res.json({ reply: response.choices[0].message.content });
  } catch (error) {
    console.error("Groq error:", error);
    res.status(500).json({ error: "Something went wrong." });
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

// ── START ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🧠 Cortex running → http://localhost:${PORT}`);
});
