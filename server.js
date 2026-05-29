require("dotenv").config();
const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");
const MongoStore = require("connect-mongo");
const mongoose = require("mongoose");

// ── INIT ──
const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── CONNECT MONGODB ──
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

// ── MIDDLEWARE ──
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── SESSION WITH MONGODB ──
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 24 * 60 * 60,
    }),
    cookie: {
      secure: true,
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000,
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
      callbackURL: "https://cortex-drab-one.vercel.app/auth/google/callback",
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

// ── ICONS ──
app.get("/icons/icon-192.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`<svg width="192" height="192" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" fill="#0d0d14"/>
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#7F77DD"/><stop offset="100%" style="stop-color:#3C3489"/></linearGradient></defs>
    <polygon points="50,8 82,26 82,64 50,82 18,64 18,26" fill="none" stroke="url(#g)" stroke-width="2"/>
    <polygon points="50,16 74,29 74,59 50,72 26,59 26,29" fill="#141420" stroke="#3a3660" stroke-width="1"/>
    <path d="M38,45 C38,37 43,33 48,34 C48,34 47,39 46,42 C45,45 44,49 46,52 C47,54 48,55 48,55" fill="none" stroke="#7F77DD" stroke-width="2" stroke-linecap="round"/>
    <path d="M62,45 C62,37 57,33 52,34 C52,34 53,39 54,42 C55,45 56,49 54,52 C53,54 52,55 52,55" fill="none" stroke="#7F77DD" stroke-width="2" stroke-linecap="round"/>
    <line x1="50" y1="34" x2="50" y2="55" stroke="#5550a0" stroke-width="1" stroke-dasharray="2,2"/>
    <path d="M46,52 C47,57 53,57 54,52" fill="none" stroke="#7F77DD" stroke-width="2" stroke-linecap="round"/>
    <circle cx="50" cy="34" r="2.5" fill="#7F77DD"/>
    <circle cx="50" cy="55" r="2.5" fill="#7F77DD"/>
    <line x1="26" y1="47" x2="34" y2="47" stroke="#3a3660" stroke-width="1.5"/>
    <circle cx="34" cy="47" r="2" fill="#3C3489"/>
    <line x1="74" y1="47" x2="66" y2="47" stroke="#3a3660" stroke-width="1.5"/>
    <circle cx="66" cy="47" r="2" fill="#3C3489"/>
    <line x1="50" y1="16" x2="50" y2="24" stroke="#3a3660" stroke-width="1.5"/>
    <circle cx="50" cy="24" r="2" fill="#3C3489"/>
    <line x1="50" y1="72" x2="50" y2="80" stroke="#3a3660" stroke-width="1.5"/>
    <circle cx="50" cy="76" r="2" fill="#3C3489"/>
  </svg>`);
});

app.get("/icons/icon-512.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`<svg width="512" height="512" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" fill="#0d0d14"/>
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#7F77DD"/><stop offset="100%" style="stop-color:#3C3489"/></linearGradient></defs>
    <polygon points="50,8 82,26 82,64 50,82 18,64 18,26" fill="none" stroke="url(#g)" stroke-width="2"/>
    <polygon points="50,16 74,29 74,59 50,72 26,59 26,29" fill="#141420" stroke="#3a3660" stroke-width="1"/>
    <path d="M38,45 C38,37 43,33 48,34 C48,34 47,39 46,42 C45,45 44,49 46,52 C47,54 48,55 48,55" fill="none" stroke="#7F77DD" stroke-width="2" stroke-linecap="round"/>
    <path d="M62,45 C62,37 57,33 52,34 C52,34 53,39 54,42 C55,45 56,49 54,52 C53,54 52,55 52,55" fill="none" stroke="#7F77DD" stroke-width="2" stroke-linecap="round"/>
    <line x1="50" y1="34" x2="50" y2="55" stroke="#5550a0" stroke-width="1" stroke-dasharray="2,2"/>
    <path d="M46,52 C47,57 53,57 54,52" fill="none" stroke="#7F77DD" stroke-width="2" stroke-linecap="round"/>
    <circle cx="50" cy="34" r="2.5" fill="#7F77DD"/>
    <circle cx="50" cy="55" r="2.5" fill="#7F77DD"/>
    <line x1="26" y1="47" x2="34" y2="47" stroke="#3a3660" stroke-width="1.5"/>
    <circle cx="34" cy="47" r="2" fill="#3C3489"/>
    <line x1="74" y1="47" x2="66" y2="47" stroke="#3a3660" stroke-width="1.5"/>
    <circle cx="66" cy="47" r="2" fill="#3C3489"/>
    <line x1="50" y1="16" x2="50" y2="24" stroke="#3a3660" stroke-width="1.5"/>
    <circle cx="50" cy="24" r="2" fill="#3C3489"/>
    <line x1="50" y1="72" x2="50" y2="80" stroke="#3a3660" stroke-width="1.5"/>
    <circle cx="50" cy="76" r="2" fill="#3C3489"/>
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
  let photo = req.user.photos[0].value;
  photo = photo.replace("=s96-c", "=s200-c");
  res.json({
    name: req.user.displayName,
    email: req.user.emails[0].value,
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
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Cortex is running at http://localhost:${PORT}`);
});
