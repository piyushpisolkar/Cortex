require("dotenv").config();
const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");

// ── INIT ──
const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── MIDDLEWARE ──
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── SESSION ──
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
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
      callbackURL: "/auth/google/callback",
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

// ── SERVE ICONS AS BASE64 ──
app.get("/icons/icon-192.png", (req, res) => {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAF";
  // Redirect to inline SVG instead
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`<svg width="192" height="192" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
    <rect width="80" height="80" fill="#0d0d14"/>
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#7F77DD"/><stop offset="100%" style="stop-color:#3C3489"/></linearGradient></defs>
    <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" fill="none" stroke="url(#g)" stroke-width="1.5"/>
    <polygon points="40,12 65,26 65,54 40,68 15,54 15,26" fill="#141420" stroke="#3a3660" stroke-width="0.8"/>
    <path d="M28,38 C28,30 33,26 38,27 C38,27 37,32 36,35 C35,38 34,42 36,45 C37,47 38,48 38,48" fill="none" stroke="#7F77DD" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M52,38 C52,30 47,26 42,27 C42,27 43,32 44,35 C45,38 46,42 44,45 C43,47 42,48 42,48" fill="none" stroke="#7F77DD" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="40" y1="27" x2="40" y2="48" stroke="#5550a0" stroke-width="1" stroke-dasharray="2,2"/>
    <path d="M36,45 C37,50 43,50 44,45" fill="none" stroke="#7F77DD" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="40" cy="27" r="2" fill="#7F77DD"/>
    <circle cx="40" cy="48" r="2" fill="#7F77DD"/>
    <line x1="15" y1="40" x2="24" y2="40" stroke="#3a3660" stroke-width="1"/>
    <line x1="65" y1="40" x2="56" y2="40" stroke="#3a3660" stroke-width="1"/>
    <circle cx="24" cy="40" r="1.5" fill="#3C3489"/>
    <circle cx="56" cy="40" r="1.5" fill="#3C3489"/>
    <line x1="40" y1="12" x2="40" y2="19" stroke="#3a3660" stroke-width="1"/>
    <circle cx="40" cy="19" r="1.5" fill="#3C3489"/>
    <line x1="40" y1="61" x2="40" y2="68" stroke="#3a3660" stroke-width="1"/>
    <circle cx="40" cy="61" r="1.5" fill="#3C3489"/>
  </svg>`);
});

app.get("/icons/icon-512.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`<svg width="512" height="512" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
    <rect width="80" height="80" fill="#0d0d14"/>
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#7F77DD"/><stop offset="100%" style="stop-color:#3C3489"/></linearGradient></defs>
    <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" fill="none" stroke="url(#g)" stroke-width="1.5"/>
    <polygon points="40,12 65,26 65,54 40,68 15,54 15,26" fill="#141420" stroke="#3a3660" stroke-width="0.8"/>
    <path d="M28,38 C28,30 33,26 38,27 C38,27 37,32 36,35 C35,38 34,42 36,45 C37,47 38,48 38,48" fill="none" stroke="#7F77DD" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M52,38 C52,30 47,26 42,27 C42,27 43,32 44,35 C45,38 46,42 44,45 C43,47 42,48 42,48" fill="none" stroke="#7F77DD" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="40" y1="27" x2="40" y2="48" stroke="#5550a0" stroke-width="1" stroke-dasharray="2,2"/>
    <path d="M36,45 C37,50 43,50 44,45" fill="none" stroke="#7F77DD" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="40" cy="27" r="2" fill="#7F77DD"/>
    <circle cx="40" cy="48" r="2" fill="#7F77DD"/>
    <line x1="15" y1="40" x2="24" y2="40" stroke="#3a3660" stroke-width="1"/>
    <line x1="65" y1="40" x2="56" y2="40" stroke="#3a3660" stroke-width="1"/>
    <circle cx="24" cy="40" r="1.5" fill="#3C3489"/>
    <circle cx="56" cy="40" r="1.5" fill="#3C3489"/>
    <line x1="40" y1="12" x2="40" y2="19" stroke="#3a3660" stroke-width="1"/>
    <circle cx="40" cy="19" r="1.5" fill="#3C3489"/>
    <line x1="40" y1="61" x2="40" y2="68" stroke="#3a3660" stroke-width="1"/>
    <circle cx="40" cy="61" r="1.5" fill="#3C3489"/>
  </svg>`);
});

app.get("/service-worker.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(__dirname, "service-worker.js"));
});

// ── AUTH ROUTES ──
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  }),
);

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

// ── MAIN APP (protected) ──
app.get("/", isLoggedIn, (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ── USER INFO API ──
app.get("/api/user", isLoggedIn, (req, res) => {
  res.json({
    name: req.user.displayName,
    email: req.user.emails[0].value,
    photo: req.user.photos[0].value,
  });
});

// ── SYSTEM PROMPTS ──
const SYSTEM_PROMPT = `You are Cortex, an elite AI study assistant built specifically for engineering students.
Your personality: sharp, clear, and intelligent — like a brilliant senior student helping a junior.
Rules:
- Keep responses SHORT and focused — max 3-4 sentences for simple questions
- Only give long responses when the question genuinely requires detail
- For code requests, always use proper code blocks with backticks
- For concepts, give a clear 2-3 line explanation first, then bullet points only if needed
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

// ── START SERVER ──
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Cortex is running at http://localhost:${PORT}`);
});
