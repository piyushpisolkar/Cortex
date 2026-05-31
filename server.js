require("dotenv").config();
const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");
const MongoStore = require("connect-mongo").default || require("connect-mongo");
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
app.set("trust proxy", 1);
app.use(express.static(path.join(__dirname, "public")));

// ── SESSION WITH MONGODB ──
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  ttl: 24 * 60 * 60,
  autoRemove: "native",
  touchAfter: 24 * 3600,
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: true,
      sameSite: "none",
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

// ── ICONS ──
app.get("/icons/icon-192.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`<svg width="192" height="192" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#1a1a2e"/>
        <stop offset="100%" style="stop-color:#0d0d14"/>
      </radialGradient>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#9d97e8"/>
        <stop offset="100%" style="stop-color:#5550a0"/>
      </linearGradient>
    </defs>
    <rect width="192" height="192" fill="url(#bg)" rx="38"/>
    <polygon points="96,18 154,51 154,117 96,150 38,117 38,51" fill="none" stroke="url(#g)" stroke-width="4"/>
    <polygon points="96,32 142,58 142,110 96,136 50,110 50,58" fill="#0d0d14" stroke="#3a3660" stroke-width="2"/>
    <path d="M82,96 C82,80 90,72 94,73 C94,73 92,82 91,88 C90,94 89,102 92,107 C93,110 94,111 94,111" fill="none" stroke="#7F77DD" stroke-width="4" stroke-linecap="round"/>
    <path d="M110,96 C110,80 102,72 98,73 C98,73 100,82 101,88 C102,94 103,102 100,107 C99,110 98,111 98,111" fill="none" stroke="#7F77DD" stroke-width="4" stroke-linecap="round"/>
    <line x1="96" y1="73" x2="96" y2="111" stroke="#5550a0" stroke-width="2" stroke-dasharray="4,4"/>
    <path d="M91,107 C92,116 100,116 101,107" fill="none" stroke="#7F77DD" stroke-width="4" stroke-linecap="round"/>
    <circle cx="96" cy="73" r="5" fill="#7F77DD"/>
    <circle cx="96" cy="111" r="5" fill="#7F77DD"/>
    <line x1="50" y1="96" x2="64" y2="96" stroke="#3a3660" stroke-width="2.5"/>
    <circle cx="64" cy="96" r="4" fill="#3C3489"/>
    <line x1="142" y1="96" x2="128" y2="96" stroke="#3a3660" stroke-width="2.5"/>
    <circle cx="128" cy="96" r="4" fill="#3C3489"/>
    <line x1="96" y1="32" x2="96" y2="46" stroke="#3a3660" stroke-width="2.5"/>
    <circle cx="96" cy="46" r="4" fill="#3C3489"/>
    <line x1="96" y1="150" x2="96" y2="136" stroke="#3a3660" stroke-width="2.5"/>
    <circle cx="96" cy="136" r="4" fill="#3C3489"/>
  </svg>`);
});

app.get("/icons/icon-512.png", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:#1a1a2e"/>
        <stop offset="100%" style="stop-color:#0d0d14"/>
      </radialGradient>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#9d97e8"/>
        <stop offset="100%" style="stop-color:#5550a0"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#bg)" rx="100"/>
    <polygon points="256,48 410,136 410,312 256,400 102,312 102,136" fill="none" stroke="url(#g)" stroke-width="10"/>
    <polygon points="256,86 378,154 378,290 256,358 134,290 134,154" fill="#0d0d14" stroke="#3a3660" stroke-width="5"/>
    <path d="M218,256 C218,214 230,192 250,195 C250,195 246,218 244,234 C242,250 240,272 246,284 C248,290 250,294 250,294" fill="none" stroke="#7F77DD" stroke-width="11" stroke-linecap="round"/>
    <path d="M294,256 C294,214 282,192 262,195 C262,195 266,218 268,234 C270,250 272,272 266,284 C264,290 262,294 262,294" fill="none" stroke="#7F77DD" stroke-width="11" stroke-linecap="round"/>
    <line x1="256" y1="195" x2="256" y2="294" stroke="#5550a0" stroke-width="5" stroke-dasharray="10,10"/>
    <path d="M244,284 C246,308 266,308 268,284" fill="none" stroke="#7F77DD" stroke-width="11" stroke-linecap="round"/>
    <circle cx="256" cy="195" r="13" fill="#7F77DD"/>
    <circle cx="256" cy="294" r="13" fill="#7F77DD"/>
    <line x1="134" y1="256" x2="170" y2="256" stroke="#3a3660" stroke-width="6"/>
    <circle cx="170" cy="256" r="10" fill="#3C3489"/>
    <line x1="378" y1="256" x2="342" y2="256" stroke="#3a3660" stroke-width="6"/>
    <circle cx="342" cy="256" r="10" fill="#3C3489"/>
    <line x1="256" y1="86" x2="256" y2="122" stroke="#3a3660" stroke-width="6"/>
    <circle cx="256" cy="122" r="10" fill="#3C3489"/>
    <line x1="256" y1="400" x2="256" y2="364" stroke="#3a3660" stroke-width="6"/>
    <circle cx="256" cy="364" r="10" fill="#3C3489"/>
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cortex is running at http://localhost:${PORT}`);
});
