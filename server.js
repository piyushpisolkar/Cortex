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

// ── USER PROFILE SCHEMA — tracks every Google login ──
const UserProfileSchema = new mongoose.Schema({
  userId:    { type: String, unique: true },
  name:      String,
  email:     String,
  photo:     String,
  firstSeen: { type: Date, default: Date.now },
  lastSeen:  { type: Date, default: Date.now },
  loginCount:{ type: Number, default: 1 },
});
const UserProfile =
  mongoose.models.UserProfile ||
  mongoose.model("UserProfile", UserProfileSchema);

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

// ── PROGRESS SCHEMA ──
const ProgressItemSchema = new mongoose.Schema({
  userId:   String,
  subject:  String,
  percent:  { type: Number, default: 0, min: 0, max: 100 },
  color:    { type: String, default: "#534AB7" },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});
const ProgressItem =
  mongoose.models.ProgressItem ||
  mongoose.model("ProgressItem", ProgressItemSchema);

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
      // Record user profile in MongoDB on every login
      const email = profile.emails?.[0]?.value || "";
      const photo = (profile.photos?.[0]?.value || "").replace("=s96-c", "=s200-c");
      UserProfile.findOneAndUpdate(
        { userId: profile.id },
        {
          $set:  { name: profile.displayName, email, photo, lastSeen: new Date() },
          $inc:  { loginCount: 1 },
          $setOnInsert: { firstSeen: new Date() },
        },
        { upsert: true, new: true }
      ).catch(e => console.error("UserProfile update error:", e.message));
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

// ── PWA ICON ROUTES (V3 Double Ring) ──
// ── PWA ICON GENERATION ──
const ICONS_DIR = path.join(__dirname, "public", "icons");
const ICON_192  = path.join(ICONS_DIR, "cortex-icon-192.png");
const ICON_512  = path.join(ICONS_DIR, "cortex-icon-512.png");

const LOGO_SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="115" fill="#534AB7"/>
  <circle cx="256" cy="256" r="210" stroke="rgba(255,255,255,0.28)" stroke-width="6" fill="none"/>
  <circle cx="256" cy="46"  r="18" fill="rgba(255,255,255,0.5)"/>
  <circle cx="466" cy="256" r="18" fill="rgba(255,255,255,0.5)"/>
  <circle cx="256" cy="466" r="18" fill="rgba(255,255,255,0.5)"/>
  <circle cx="46"  cy="256" r="18" fill="rgba(255,255,255,0.5)"/>
  <circle cx="256" cy="256" r="128" stroke="white" stroke-width="28" fill="none"/>
  <line x1="256" y1="196" x2="256" y2="128" stroke="white" stroke-width="22" stroke-linecap="round"/>
  <line x1="316" y1="256" x2="384" y2="256" stroke="white" stroke-width="22" stroke-linecap="round"/>
  <line x1="256" y1="316" x2="256" y2="384" stroke="white" stroke-width="22" stroke-linecap="round"/>
  <line x1="196" y1="256" x2="128" y2="256" stroke="white" stroke-width="22" stroke-linecap="round"/>
  <circle cx="256" cy="256" r="38" fill="white"/>
</svg>`;

async function generatePWAIcons() {
  try {
    if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });
    let sharp;
    try { sharp = require("sharp"); } catch {
      console.warn("sharp not installed — PNG icons skipped");
      return;
    }
    const buf = Buffer.from(LOGO_SVG_ICON);
    await Promise.all([
      sharp(buf).resize(192, 192).png().toFile(ICON_192),
      sharp(buf).resize(512, 512).png().toFile(ICON_512),
    ]);
    console.log("✓ PWA icons generated");
  } catch (e) {
    console.error("Icon generation failed:", e.message);
  }
}
// Always regenerate on startup to pick up any SVG changes
generatePWAIcons();

app.get("/icons/cortex-logo.svg", (req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "no-cache");
  res.send(LOGO_SVG_ICON);
});

app.get(["/icons/cortex-icon-192.png", "/icons/icon-192.png"], (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  if (fs.existsSync(ICON_192)) return res.sendFile(ICON_192);
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(LOGO_SVG_ICON);
});

app.get(["/icons/cortex-icon-512.png", "/icons/icon-512.png"], (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  if (fs.existsSync(ICON_512)) return res.sendFile(ICON_512);
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(LOGO_SVG_ICON);
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

// ── ADMIN MIDDLEWARE — only your Google account can access ──
function isAdmin(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect("/login");
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
  const userEmail = req.user?.emails?.[0]?.value?.toLowerCase() || "";
  if (!adminEmails.includes(userEmail)) {
    return res.status(403).send(`
      <html><body style="background:#0d0d14;color:#e8e8f0;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;">
        <p style="font-size:24px;">⛔ Access Denied</p>
        <p style="color:#666;">This page is for Cortex developers only.</p>
        <a href="/" style="color:#534AB7;">← Back to Cortex</a>
      </body></html>
    `);
  }
  next();
}

// ── DEVELOPER DASHBOARD ──
app.get("/admin", isAdmin, async (req, res) => {
  try {
    const [users, totalChats, totalPlanner, totalProgress, totalCanvas] = await Promise.all([
      UserProfile.find().sort({ lastSeen: -1 }),
      ChatSession.countDocuments(),
      PlannerSession.countDocuments(),
      ProgressItem.countDocuments(),
      CanvasItem.countDocuments(),
    ]);

    // Per-user stats
    const userIds = users.map(u => u.userId);
    const [chatCounts, plannerCounts, progressCounts] = await Promise.all([
      ChatSession.aggregate([{ $match: { userId: { $in: userIds } } }, { $group: { _id: "$userId", count: { $sum: 1 } } }]),
      PlannerSession.aggregate([{ $match: { userId: { $in: userIds } } }, { $group: { _id: "$userId", count: { $sum: 1 } } }]),
      ProgressItem.aggregate([{ $match: { userId: { $in: userIds } } }, { $group: { _id: "$userId", count: { $sum: 1 } } }]),
    ]);

    const chatMap     = Object.fromEntries(chatCounts.map(x => [x._id, x.count]));
    const plannerMap  = Object.fromEntries(plannerCounts.map(x => [x._id, x.count]));
    const progressMap = Object.fromEntries(progressCounts.map(x => [x._id, x.count]));

    const fmt = d => d ? new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";

    const rows = users.map(u => `
      <tr>
        <td><img src="${u.photo || ""}" width="36" height="36" style="border-radius:50%;vertical-align:middle;margin-right:10px;" onerror="this.style.display='none'">${u.name || "—"}</td>
        <td>${u.email || "—"}</td>
        <td style="text-align:center">${chatMap[u.userId] || 0}</td>
        <td style="text-align:center">${plannerMap[u.userId] || 0}</td>
        <td style="text-align:center">${progressMap[u.userId] || 0}</td>
        <td style="text-align:center">${u.loginCount || 1}</td>
        <td>${fmt(u.firstSeen)}</td>
        <td>${fmt(u.lastSeen)}</td>
      </tr>
    `).join("");

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Cortex Admin</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d14;color:#e0e0f0;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;min-height:100vh}
  .topbar{background:#13131e;border-bottom:1px solid #1e1e30;padding:16px 32px;display:flex;align-items:center;justify-content:space-between}
  .topbar h1{font-size:18px;font-weight:600;color:#e8e8f0;display:flex;align-items:center;gap:10px}
  .topbar a{color:#534AB7;font-size:13px;text-decoration:none}
  .topbar a:hover{color:#AFA9EC}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;padding:32px 32px 0}
  .stat-card{background:#13131e;border:1px solid #1e1e30;border-radius:12px;padding:20px;text-align:center}
  .stat-num{font-size:32px;font-weight:700;color:#534AB7;line-height:1}
  .stat-label{font-size:12px;color:#666;margin-top:6px;letter-spacing:0.06em;text-transform:uppercase}
  .section{padding:32px}
  .section h2{font-size:14px;font-weight:600;color:#888;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:16px}
  .table-wrap{overflow-x:auto;border-radius:12px;border:1px solid #1e1e30}
  table{width:100%;border-collapse:collapse;background:#13131e;font-size:13px}
  th{background:#0d0d14;color:#666;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;font-size:11px;padding:12px 16px;text-align:left;border-bottom:1px solid #1e1e30}
  td{padding:14px 16px;border-bottom:1px solid #1a1a28;vertical-align:middle;color:#c8c8e0}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#15151f}
  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(83,74,183,0.2);color:#AFA9EC}
  .refresh{background:#534AB7;color:white;border:none;padding:8px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit}
  .refresh:hover{background:#4038a0}
  @media(max-width:600px){.stats{grid-template-columns:repeat(2,1fr)}.section{padding:16px}th,td{padding:10px 12px}}
</style>
</head>
<body>

<div class="topbar">
  <h1>
    <svg width="22" height="22" viewBox="-30 -30 60 60" fill="none">
      <circle cx="0" cy="0" r="26" stroke="#AFA9EC" stroke-width="1.5"/>
      <circle cx="0" cy="-26" r="3.2" fill="#AFA9EC"/>
      <circle cx="26" cy="0" r="3.2" fill="#AFA9EC"/>
      <circle cx="0" cy="26" r="3.2" fill="#AFA9EC"/>
      <circle cx="-26" cy="0" r="3.2" fill="#AFA9EC"/>
      <circle cx="0" cy="0" r="16" stroke="#534AB7" stroke-width="5.5"/>
      <line x1="0" y1="-6.5" x2="0" y2="-12.5" stroke="#534AB7" stroke-width="4" stroke-linecap="round"/>
      <line x1="6.5" y1="0" x2="12.5" y2="0" stroke="#534AB7" stroke-width="4" stroke-linecap="round"/>
      <line x1="0" y1="6.5" x2="0" y2="12.5" stroke="#534AB7" stroke-width="4" stroke-linecap="round"/>
      <line x1="-6.5" y1="0" x2="-12.5" y2="0" stroke="#534AB7" stroke-width="4" stroke-linecap="round"/>
      <circle cx="0" cy="0" r="5.5" fill="#534AB7"/>
    </svg>
    Cortex Developer Dashboard
  </h1>
  <div style="display:flex;align-items:center;gap:16px">
    <button class="refresh" onclick="location.reload()">↻ Refresh</button>
    <a href="/">← Back to App</a>
  </div>
</div>

<div class="stats">
  <div class="stat-card">
    <div class="stat-num">${users.length}</div>
    <div class="stat-label">Total Users</div>
  </div>
  <div class="stat-card">
    <div class="stat-num">${totalChats}</div>
    <div class="stat-label">Chat Sessions</div>
  </div>
  <div class="stat-card">
    <div class="stat-num">${totalPlanner}</div>
    <div class="stat-label">Planner Items</div>
  </div>
  <div class="stat-card">
    <div class="stat-num">${totalProgress}</div>
    <div class="stat-label">Progress Items</div>
  </div>
  <div class="stat-card">
    <div class="stat-num">${totalCanvas}</div>
    <div class="stat-label">Canvas Items</div>
  </div>
  <div class="stat-card">
    <div class="stat-num">${users.reduce((a,u) => a + (u.loginCount||1), 0)}</div>
    <div class="stat-label">Total Logins</div>
  </div>
</div>

<div class="section">
  <h2>All Users (${users.length})</h2>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>Email</th>
          <th style="text-align:center">Chats</th>
          <th style="text-align:center">Planner</th>
          <th style="text-align:center">Progress</th>
          <th style="text-align:center">Logins</th>
          <th>First Seen</th>
          <th>Last Active</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:#444;padding:32px">No users yet</td></tr>'}</tbody>
    </table>
  </div>
</div>

<div style="text-align:center;padding:24px;color:#333;font-size:12px">
  Cortex Admin · ${new Date().toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })}
</div>

</body></html>`);
  } catch (e) {
    console.error("Admin error:", e);
    res.status(500).send("Dashboard error: " + e.message);
  }
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
  const { message, history, mode, language } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    const systemPrompt =
      mode === "panic" ? PANIC_PROMPT :
      mode === "viva"  ? VIVA_PROMPT  : SYSTEM_PROMPT;

    // Language instruction — injected into system prompt
    const langInstruction = (language && language !== "English")
      ? `\n\nIMPORTANT: Respond entirely in ${language}. All explanations, examples, and text must be in ${language} only.`
      : "";

    // Strip _id and MongoDB fields — Groq only accepts {role, content}
    const cleanHistory = Array.isArray(history)
      ? history
          .filter(m => m && typeof m.role === "string" && typeof m.content === "string")
          .map(({ role, content }) => ({ role, content }))
          .slice(-20)
      : [];

    const messages = [
      { role: "system", content: systemPrompt + langInstruction },
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

// ── PROGRESS TRACKER API ──
app.get("/api/progress", isLoggedIn, async (req, res) => {
  try {
    const items = await ProgressItem.find({ userId: req.user.id }).sort({ createdAt: 1 });
    res.json(items);
  } catch (e) {
    console.error("Progress get error:", e.message);
    res.status(500).json([]);
  }
});

app.post("/api/progress", isLoggedIn, async (req, res) => {
  try {
    const { subject, percent } = req.body;
    if (!subject) return res.status(400).json({ ok: false, error: "Subject required" });
    const existing = await ProgressItem.findOne({ userId: req.user.id, subject: subject.trim() });
    if (existing) return res.status(400).json({ ok: false, error: "Subject already exists" });
    const item = await ProgressItem.create({
      userId: req.user.id,
      subject: subject.trim(),
      percent: Math.min(100, Math.max(0, parseInt(percent) || 0)),
    });
    res.json({ ok: true, item });
  } catch (e) {
    console.error("Progress save error:", e.message);
    res.status(500).json({ ok: false });
  }
});

app.patch("/api/progress/:id", isLoggedIn, async (req, res) => {
  try {
    const { percent } = req.body;
    const item = await ProgressItem.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { percent: Math.min(100, Math.max(0, parseInt(percent) || 0)), updatedAt: new Date() },
      { new: true }
    );
    res.json({ ok: !!item, item });
  } catch (e) {
    console.error("Progress update error:", e.message);
    res.status(500).json({ ok: false });
  }
});

app.delete("/api/progress/:id", isLoggedIn, async (req, res) => {
  try {
    await ProgressItem.deleteOne({ _id: req.params.id, userId: req.user.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// ── CANVAS/NOTES PERSISTENCE API ──
const CanvasItemSchema = new mongoose.Schema({
  userId:   String,
  type:     { type: String, enum: ["flashcard", "note"], required: true },
  content:  mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});
const CanvasItem = mongoose.models.CanvasItem || mongoose.model("CanvasItem", CanvasItemSchema);

app.get("/api/canvas", isLoggedIn, async (req, res) => {
  try {
    const items = await CanvasItem.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100);
    res.json(items);
  } catch (e) { res.json([]); }
});

app.post("/api/canvas", isLoggedIn, async (req, res) => {
  try {
    const { type, content } = req.body;
    if (!type || !content) return res.status(400).json({ ok: false });
    const item = await CanvasItem.create({ userId: req.user.id, type, content });
    res.json({ ok: true, id: item._id });
  } catch (e) { res.status(500).json({ ok: false }); }
});

app.delete("/api/canvas/:id", isLoggedIn, async (req, res) => {
  try {
    await CanvasItem.deleteOne({ _id: req.params.id, userId: req.user.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false }); }
});

// ── AUTO-CLEANUP: delete chat sessions older than 60 days ──
async function cleanupOldSessions() {
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const result = await ChatSession.deleteMany({ createdAt: { $lt: cutoff } });
    if (result.deletedCount > 0) console.log(`Cleaned up ${result.deletedCount} old sessions`);
  } catch (e) { console.error("Cleanup error:", e.message); }
}
// Run cleanup once on startup, then every 24 hours
cleanupOldSessions();
setInterval(cleanupOldSessions, 24 * 60 * 60 * 1000);

// ── HISTORY: DELETE DUPLICATE SESSIONS ──
app.post("/api/history/dedupe", isLoggedIn, async (req, res) => {
  try {
    const sessions = await ChatSession.find({ userId: req.user.id }).sort({ createdAt: 1 });
    const seen = new Map();
    const toDelete = [];
    for (const s of sessions) {
      const key = s.title?.trim()?.slice(0, 40) || "untitled";
      const timeKey = Math.floor(new Date(s.createdAt).getTime() / (5 * 60 * 1000));
      const dedupKey = `${key}-${timeKey}`;
      if (seen.has(dedupKey)) {
        toDelete.push(s._id);
      } else {
        seen.set(dedupKey, s._id);
      }
    }
    if (toDelete.length > 0) {
      await ChatSession.deleteMany({ _id: { $in: toDelete } });
    }
    res.json({ ok: true, removed: toDelete.length });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// ── SIMPLE RATE LIMITING ──
const rateLimitMap = new Map();
function rateLimit(maxReqs, windowMs) {
  return (req, res, next) => {
    const key = req.user?.id || req.ip;
    const now = Date.now();
    const record = rateLimitMap.get(key) || { count: 0, reset: now + windowMs };
    if (now > record.reset) { record.count = 0; record.reset = now + windowMs; }
    record.count++;
    rateLimitMap.set(key, record);
    if (record.count > maxReqs) {
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }
    next();
  };
}
// Apply rate limiting: 30 chat requests per minute per user
app.use("/api/chat", rateLimit(30, 60 * 1000));
app.use("/api/flashcard", rateLimit(20, 60 * 1000));
app.use("/api/summarize", rateLimit(20, 60 * 1000));

// ── START ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🧠 Cortex running → http://localhost:${PORT}`);

  // ── KEEP-ALIVE PING (free Render tier fix) ──
  // Pings itself every 10 minutes so Render never spins down
  if (isProduction) {
    const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://cortex-y7m6.onrender.com";
    setInterval(async () => {
      try {
        const https = require("https");
        https.get(`${RENDER_URL}/ping`, (res) => {
          console.log(`🔄 Keep-alive ping → ${res.statusCode}`);
        }).on("error", () => {});
      } catch (e) {}
    }, 10 * 60 * 1000); // every 10 minutes
    console.log("✓ Keep-alive ping active");
  }
});

// ── PING ROUTE ──
app.get("/ping", (req, res) => res.status(200).send("OK"));
