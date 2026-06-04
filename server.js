require("dotenv").config();
const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");
const MongoStore = require("connect-mongo").default || require("connect-mongo");
const mongoose = require("mongoose");

const isProduction =
  process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT;

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

// ── MIDDLEWARE ──
app.use(express.json());
app.set("trust proxy", 1);
app.use(express.static(path.join(__dirname, "public")));

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
        "https://cortex-production-cd8b.up.railway.app/auth/google/callback",
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
  res.sendFile(path.join(__dirname, "service-worker.js"));
});

app.get(["/icons/icon-192.png", "/icons/icon-512.png"], (req, res) => {
  res.sendFile(path.join(__dirname, "public/icons/cortex-logo.svg"));
});

// ── ICONS ──
app.get("/icons/icon-192.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`<svg width="192" height="192" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#1a1a2e"/>
        <stop offset="100%" style="stop-color:#0d0d14"/>
      </radialGradient>
      <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#6699ff"/>
        <stop offset="100%" style="stop-color:#4433aa"/>
      </linearGradient>
      <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#7788ff"/>
        <stop offset="100%" style="stop-color:#5544bb"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#bg)" rx="20"/>
    <polygon points="50,5 88,27 88,73 50,95 12,73 12,27" fill="none" stroke="url(#hg)" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M47,28 C47,28 33,29 28,38 C23,47 24,58 28,66 C32,74 38,78 44,79 C46,79 48,79 48,79" fill="none" stroke="url(#bg2)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M47,41 C41,42 36,46 36,52 C36,58 40,62 46,63" fill="none" stroke="url(#bg2)" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M47,54 C44,55 41,58 42,62 C43,66 46,68 48,68" fill="none" stroke="url(#bg2)" stroke-width="2.0" stroke-linecap="round"/>
    <path d="M47,35 C43,36 39,38 38,42 C37,46 39,49 43,50" fill="none" stroke="url(#bg2)" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M53,28 C53,28 67,29 72,38 C77,47 76,58 72,66 C68,74 62,78 56,79 C54,79 52,79 52,79" fill="none" stroke="url(#bg2)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M53,41 C59,42 64,46 64,52 C64,58 60,62 54,63" fill="none" stroke="url(#bg2)" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M53,54 C56,55 59,58 58,62 C57,66 54,68 52,68" fill="none" stroke="url(#bg2)" stroke-width="2.0" stroke-linecap="round"/>
    <path d="M53,35 C57,36 61,38 62,42 C63,46 61,49 57,50" fill="none" stroke="url(#bg2)" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="50" y1="28" x2="50" y2="79" stroke="#5544aa" stroke-width="1.5" stroke-dasharray="3,3"/>
    <path d="M47,79 C48,83 52,83 53,79" fill="none" stroke="url(#bg2)" stroke-width="2.8" stroke-linecap="round"/>
  </svg>`);
});

app.get("/icons/icon-512.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`<svg width="512" height="512" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#1a1a2e"/>
        <stop offset="100%" style="stop-color:#0d0d14"/>
      </radialGradient>
      <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#6699ff"/>
        <stop offset="100%" style="stop-color:#4433aa"/>
      </linearGradient>
      <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#7788ff"/>
        <stop offset="100%" style="stop-color:#5544bb"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#bg)" rx="20"/>
    <polygon points="50,5 88,27 88,73 50,95 12,73 12,27" fill="none" stroke="url(#hg)" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M47,28 C47,28 33,29 28,38 C23,47 24,58 28,66 C32,74 38,78 44,79 C46,79 48,79 48,79" fill="none" stroke="url(#bg2)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M47,41 C41,42 36,46 36,52 C36,58 40,62 46,63" fill="none" stroke="url(#bg2)" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M47,54 C44,55 41,58 42,62 C43,66 46,68 48,68" fill="none" stroke="url(#bg2)" stroke-width="2.0" stroke-linecap="round"/>
    <path d="M47,35 C43,36 39,38 38,42 C37,46 39,49 43,50" fill="none" stroke="url(#bg2)" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M53,28 C53,28 67,29 72,38 C77,47 76,58 72,66 C68,74 62,78 56,79 C54,79 52,79 52,79" fill="none" stroke="url(#bg2)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M53,41 C59,42 64,46 64,52 C64,58 60,62 54,63" fill="none" stroke="url(#bg2)" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M53,54 C56,55 59,58 58,62 C57,66 54,68 52,68" fill="none" stroke="url(#bg2)" stroke-width="2.0" stroke-linecap="round"/>
    <path d="M53,35 C57,36 61,38 62,42 C63,46 61,49 57,50" fill="none" stroke="url(#bg2)" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="50" y1="28" x2="50" y2="79" stroke="#5544aa" stroke-width="1.5" stroke-dasharray="3,3"/>
    <path d="M47,79 C48,83 52,83 53,79" fill="none" stroke="url(#bg2)" stroke-width="2.8" stroke-linecap="round"/>
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

// ── START ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cortex is running at http://localhost:${PORT}`);
});
