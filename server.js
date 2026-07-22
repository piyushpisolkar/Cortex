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
    .then(async () => {
      console.log("MongoDB connected");
      // Auto-backfill unknown users from session data on every startup
      await autoBackfillProfiles();
    })
    .catch((err) =>
      console.error("MongoDB unavailable, continuing locally:", err.message),
    );
} else {
  console.log("MONGODB_URI missing, continuing with local-only sessions");
}

// ── AUTO BACKFILL — runs on startup silently ──
async function autoBackfillProfiles() {
  try {
    const db = mongoose.connection.db;
    const sessionsCol = db.collection("sessions");
    const allSessions = await sessionsCol.find({}).toArray();
    let fixed = 0;
    const seen = new Set();
    for (const s of allSessions) {
      try {
        let sessionData = s.session;
        if (typeof sessionData === "string") {
          try { sessionData = JSON.parse(sessionData); } catch { continue; }
        }
        const user = sessionData?.passport?.user;
        if (!user?.id || seen.has(user.id)) continue;
        seen.add(user.id);
        const email = user.emails?.[0]?.value || "";
        const photo = (user.photos?.[0]?.value || "").replace("=s96-c", "=s200-c");
        const name  = user.displayName || "";
        if (!name && !email) continue;
        const result = await UserProfile.findOneAndUpdate(
          { userId: user.id },
          { $set: { name: name || undefined, email: email || undefined, photo: photo || undefined }, $setOnInsert: { firstSeen: new Date(), loginCount: 1 } },
          { upsert: true, new: true }
        );
        if (result) fixed++;
      } catch {}
    }
    if (fixed > 0) console.log(`✓ Auto-backfill: fixed ${fixed} user profiles`);
  } catch (e) {
    console.error("Auto-backfill error:", e.message);
  }
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
    // Collect all userIds across collections — catches users before UserProfile tracking
    const [profileUsers, sessionUserIds] = await Promise.all([
      UserProfile.find().sort({ lastSeen: -1 }),
      ChatSession.distinct("userId"),
    ]);

    const profileMap = Object.fromEntries(profileUsers.map(u => [u.userId, u]));
    const allUserIds = [...new Set([
      ...profileUsers.map(u => u.userId),
      ...sessionUserIds,
    ])];

    // Global totals
    const [totalChats, totalPlanner, totalProgress, totalCanvas] = await Promise.all([
      ChatSession.countDocuments(),
      PlannerSession.countDocuments(),
      ProgressItem.countDocuments(),
      CanvasItem.countDocuments(),
    ]);

    // Per-user stats
    const [chatCounts, plannerCounts, progressCounts] = await Promise.all([
      ChatSession.aggregate([
        { $match: { userId: { $in: allUserIds } } },
        { $group: { _id: "$userId", count: { $sum: 1 }, lastChat: { $max: "$updatedAt" } } }
      ]),
      PlannerSession.aggregate([
        { $match: { userId: { $in: allUserIds } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } }
      ]),
      ProgressItem.aggregate([
        { $match: { userId: { $in: allUserIds } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } }
      ]),
    ]);

    const chatMap     = Object.fromEntries(chatCounts.map(x => [x._id, { count: x.count, lastChat: x.lastChat }]));
    const plannerMap  = Object.fromEntries(plannerCounts.map(x => [x._id, x.count]));
    const progressMap = Object.fromEntries(progressCounts.map(x => [x._id, x.count]));

    // Format date in IST
    const fmt = d => {
      if (!d) return "—";
      return new Date(d).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true
      });
    };

    const rows = allUserIds.map(uid => {
      const u = profileMap[uid];
      const chats = chatMap[uid]?.count || 0;
      const lastActive = u?.lastSeen || chatMap[uid]?.lastChat;
      return `
        <tr style="cursor:pointer" onclick="window.location='/admin/user/${uid}/chats'" title="Click to view chats">
          <td>
            ${u?.photo ? `<img src="${u.photo}" width="36" height="36" style="border-radius:50%;vertical-align:middle;margin-right:10px;" onerror="this.style.display='none'">` : `<span style="display:inline-block;width:36px;height:36px;border-radius:50%;background:#1e1e30;vertical-align:middle;margin-right:10px;"></span>`}
            <span style="color:#AFA9EC;font-size:11px;margin-right:6px">💬</span>${u?.name || '<span style="color:#444">Unknown</span>'}
          </td>
          <td>${u?.email || '<span style="color:#444">—</span>'}</td>
          <td style="text-align:center"><span class="badge" style="cursor:pointer">${chats}</span></td>
          <td style="text-align:center">${plannerMap[uid] || 0}</td>
          <td style="text-align:center">${progressMap[uid] || 0}</td>
          <td style="text-align:center">${u?.loginCount || "—"}</td>
          <td style="font-size:12px;color:#888">${fmt(u?.firstSeen)}</td>
          <td style="font-size:12px;color:#888">${fmt(lastActive)}</td>
        </tr>`;
    }).join("");

    const totalUsers = allUserIds.length;
    const totalLogins = profileUsers.reduce((a, u) => a + (u.loginCount || 1), 0);
    const nowIST = new Date().toLocaleString("en-IN", { timeZone:"Asia/Kolkata", day:"numeric", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true });

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Cortex Admin</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d14;color:#e0e0f0;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;min-height:100vh}
  .topbar{background:#13131e;border-bottom:1px solid #1e1e30;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
  .topbar h1{font-size:18px;font-weight:600;color:#e8e8f0;display:flex;align-items:center;gap:10px}
  .topbar a{color:#534AB7;font-size:13px;text-decoration:none}
  .topbar a:hover{color:#AFA9EC}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;padding:28px 32px 0}
  .stat-card{background:#13131e;border:1px solid #1e1e30;border-radius:12px;padding:18px;text-align:center}
  .stat-num{font-size:30px;font-weight:700;color:#534AB7;line-height:1}
  .stat-label{font-size:11px;color:#555;margin-top:6px;letter-spacing:0.06em;text-transform:uppercase}
  .section{padding:28px 32px}
  .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px}
  .section h2{font-size:12px;font-weight:600;color:#555;letter-spacing:0.1em;text-transform:uppercase}
  .tz-note{font-size:11px;color:#3a3a55;font-style:italic}
  .table-wrap{overflow-x:auto;border-radius:12px;border:1px solid #1e1e30}
  table{width:100%;border-collapse:collapse;background:#13131e;font-size:13px}
  th{background:#0a0a12;color:#444;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;font-size:11px;padding:12px 16px;text-align:left;border-bottom:1px solid #1e1e30;white-space:nowrap}
  td{padding:13px 16px;border-bottom:1px solid #181825;vertical-align:middle;color:#c0c0d8}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#14141e}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;background:rgba(83,74,183,0.2);color:#AFA9EC}
  .refresh{background:#534AB7;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;transition:background 0.2s}
  .refresh:hover{background:#4038a0}
  .footer{text-align:center;padding:24px;color:#252535;font-size:12px}
  @media(max-width:600px){.stats{grid-template-columns:repeat(2,1fr)}.section{padding:16px 16px}th,td{padding:10px 10px;font-size:12px}}
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
    Cortex — Developer Dashboard
  </h1>
  <div style="display:flex;align-items:center;gap:14px">
    <a href="/admin/backfill" style="background:#1a1a2a;color:#AFA9EC;border:1px solid #2a2a45;padding:8px 16px;border-radius:8px;font-size:13px;text-decoration:none;transition:all 0.2s" onmouseover="this.style.borderColor='#534AB7'" onmouseout="this.style.borderColor='#2a2a45'">⚙ Fix Unknown Users</a>
    <button class="refresh" onclick="location.reload()">↻ Refresh</button>
    <a href="/">← App</a>
  </div>
</div>

<div class="stats">
  <div class="stat-card"><div class="stat-num">${totalUsers}</div><div class="stat-label">Total Users</div></div>
  <div class="stat-card"><div class="stat-num">${totalChats}</div><div class="stat-label">Chat Sessions</div></div>
  <div class="stat-card"><div class="stat-num">${totalPlanner}</div><div class="stat-label">Planner Items</div></div>
  <div class="stat-card"><div class="stat-num">${totalProgress}</div><div class="stat-label">Progress Items</div></div>
  <div class="stat-card"><div class="stat-num">${totalCanvas}</div><div class="stat-label">Canvas Items</div></div>
  <div class="stat-card"><div class="stat-num">${totalLogins}</div><div class="stat-label">Total Logins</div></div>
</div>

<div class="section">
  <div class="section-header">
    <h2>All Users (${totalUsers})</h2>
    <span class="tz-note">All times IST · Click a row to view chats</span>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>User</th><th>Email</th>
          <th style="text-align:center">💬 Chats</th>
          <th style="text-align:center">📅 Planner</th>
          <th style="text-align:center">📊 Progress</th>
          <th style="text-align:center">🔑 Logins</th>
          <th>First Seen</th><th>Last Active</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:#2a2a40;padding:40px">No users yet</td></tr>'}</tbody>
    </table>
  </div>
</div>
<div class="footer">Cortex Admin · All times IST · ${nowIST}</div>
</body></html>`);
  } catch (e) {
    console.error("Admin dashboard error:", e);
    res.status(500).send("Dashboard error: " + e.message);
  }
});

// ── ADMIN: BACKFILL USER PROFILES FROM SESSIONS ──
async function backfillUserProfiles() {
  try {
    // Read raw sessions from MongoDB
    const db = mongoose.connection.db;
    if (!db) return 0;

    const sessionDocs = await db.collection("sessions").find({}).toArray();
    let created = 0;
    let updated = 0;

    for (const doc of sessionDocs) {
      try {
        // Session data is stored as JSON string
        const raw = typeof doc.session === "string" ? JSON.parse(doc.session) : doc.session;
        const profile = raw?.passport?.user;
        if (!profile || !profile.id) continue;

        const email = profile.emails?.[0]?.value || "";
        const photo = (profile.photos?.[0]?.value || "").replace("=s96-c", "=s200-c");
        const name  = profile.displayName || "";

        if (!email && !name) continue;

        const existing = await UserProfile.findOne({ userId: profile.id });
        if (!existing) {
          await UserProfile.create({
            userId:     profile.id,
            name,
            email,
            photo,
            firstSeen:  doc.expires ? new Date(doc.expires.getTime() - 7*24*60*60*1000) : new Date(),
            lastSeen:   doc.expires || new Date(),
            loginCount: 1,
          });
          created++;
        } else if (!existing.name || !existing.email) {
          // Fill in missing fields on partial profiles
          await UserProfile.findOneAndUpdate(
            { userId: profile.id },
            { $set: { name: existing.name || name, email: existing.email || email, photo: existing.photo || photo } }
          );
          updated++;
        }
      } catch (e) { /* skip malformed session */ }
    }
    console.log(`✓ Backfill complete: ${created} created, ${updated} updated`);
    return { created, updated };
  } catch (e) {
    console.error("Backfill error:", e.message);
    return { created: 0, updated: 0, error: e.message };
  }
}

// Run backfill automatically on every startup — fills in any missing profiles
mongoose.connection.once("open", () => {
  setTimeout(backfillUserProfiles, 3000); // wait 3s for models to register
});

app.get("/admin/backfill", isAdmin, async (req, res) => {
  const result = await backfillUserProfiles();
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Backfill Complete</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d14;color:#e0e0f0;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:20px}
  .card{background:#13131e;border:1px solid #1e1e30;border-radius:16px;padding:40px 48px;text-align:center;max-width:400px}
  .icon{font-size:48px;margin-bottom:12px}
  h1{font-size:20px;font-weight:600;color:#e8e8f0;margin-bottom:8px}
  p{font-size:14px;color:#666;margin-bottom:6px}
  .stat{font-size:28px;font-weight:700;color:#534AB7}
  .links{display:flex;gap:14px;justify-content:center;margin-top:24px}
  a{color:#534AB7;font-size:13px;text-decoration:none;padding:8px 18px;border:1px solid #534AB7;border-radius:8px;transition:all 0.2s}
  a:hover{background:#534AB7;color:white}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${result.error ? "⚠️" : "✅"}</div>
    <h1>${result.error ? "Backfill Error" : "Backfill Complete"}</h1>
    ${result.error ? `<p style="color:#e55a4e">${result.error}</p>` : `
    <p>Profiles created</p>
    <div class="stat">${result.created}</div>
    <p style="margin-top:16px">Profiles updated</p>
    <div class="stat">${result.updated}</div>
    `}
    <div class="links">
      <a href="/admin">← Dashboard</a>
      <a href="/admin/backfill">Run Again</a>
    </div>
  </div>
</body>
</html>`);
});

// ── ADMIN: BACKFILL USER PROFILES FROM SESSION DATA ──
app.get("/admin/backfill", isAdmin, async (req, res) => {
  try {
    // Read all sessions from MongoDB session store
    const db = mongoose.connection.db;
    const sessionsCol = db.collection("sessions");
    const allSessions = await sessionsCol.find({}).toArray();

    let created = 0, updated = 0, skipped = 0, errors = 0;
    const seen = new Set();

    for (const s of allSessions) {
      try {
        // Session data is stored as JSON string in 'session' field
        let sessionData = s.session;
        if (typeof sessionData === "string") {
          try { sessionData = JSON.parse(sessionData); } catch { continue; }
        }

        const passport = sessionData?.passport;
        const user = passport?.user;
        if (!user || !user.id) { skipped++; continue; }
        if (seen.has(user.id)) { skipped++; continue; }
        seen.add(user.id);

        const email = user.emails?.[0]?.value || "";
        const photo = (user.photos?.[0]?.value || "").replace("=s96-c", "=s200-c");
        const name  = user.displayName || "";

        if (!email && !name) { skipped++; continue; }

        const existing = await UserProfile.findOne({ userId: user.id });
        if (existing) {
          // Update if name/email/photo missing
          if (!existing.name || !existing.email) {
            await UserProfile.findOneAndUpdate(
              { userId: user.id },
              { $set: { name: name || existing.name, email: email || existing.email, photo: photo || existing.photo } }
            );
            updated++;
          } else {
            skipped++;
          }
        } else {
          await UserProfile.create({
            userId: user.id,
            name, email, photo,
            firstSeen: s.expires ? new Date(s.expires - 7 * 24 * 60 * 60 * 1000) : new Date(),
            lastSeen:  new Date(),
            loginCount: 1,
          });
          created++;
        }
      } catch (e) {
        errors++;
      }
    }

    // Also check chat sessions for any userIds still missing profiles
    const chatUserIds = await ChatSession.distinct("userId");
    let chatBackfill = 0;
    for (const uid of chatUserIds) {
      const exists = await UserProfile.findOne({ userId: uid });
      if (!exists) {
        // Create a placeholder so they show in dashboard (will fill when they log in)
        await UserProfile.create({
          userId: uid,
          name: "",
          email: "",
          photo: "",
          loginCount: 0,
        }).catch(() => {});
        chatBackfill++;
      }
    }

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Backfill Complete</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d14;color:#e0e0f0;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:24px;padding:32px}
  .card{background:#13131e;border:1px solid #1e1e30;border-radius:16px;padding:32px 40px;max-width:480px;width:100%;text-align:center}
  h1{font-size:18px;font-weight:600;margin-bottom:24px;color:#e8e8f0}
  .row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #1a1a28;font-size:14px}
  .row:last-child{border-bottom:none}
  .row span:first-child{color:#666}
  .num{font-weight:700;font-size:18px}
  .created{color:#20b882}
  .updated{color:#534AB7}
  .skipped{color:#444}
  .errors{color:#e55a4e}
  .btn{display:inline-block;margin-top:24px;background:#534AB7;color:white;text-decoration:none;padding:10px 24px;border-radius:10px;font-size:14px;transition:background 0.2s}
  .btn:hover{background:#4038a0}
  .note{font-size:12px;color:#444;margin-top:12px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
  <h1>✅ Backfill Complete</h1>
  <div class="row"><span>Profiles created</span><span class="num created">${created}</span></div>
  <div class="row"><span>Profiles updated</span><span class="num updated">${updated}</span></div>
  <div class="row"><span>Chat-only placeholders</span><span class="num updated">${chatBackfill}</span></div>
  <div class="row"><span>Already complete</span><span class="num skipped">${skipped}</span></div>
  <div class="row"><span>Errors</span><span class="num errors">${errors}</span></div>
  <a href="/admin" class="btn">← Back to Dashboard</a>
  <p class="note">Users who were "Unknown" will now show their name and email.<br>Any remaining unknowns will auto-fill on their next login.</p>
</div>
</body></html>`);
  } catch (e) {
    console.error("Backfill error:", e);
    res.status(500).send("Backfill failed: " + e.message);
  }
});

// ── ADMIN: VIEW USER CHATS ──
app.get("/admin/user/:userId/chats", isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await UserProfile.findOne({ userId });
    const sessions = await ChatSession.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(50);

    const fmt = d => d ? new Date(d).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata", day: "numeric", month: "short",
      year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
    }) : "—";

    const sessionCards = sessions.map(s => {
      const msgCount = s.messages?.length || 0;
      const preview = s.title || s.messages?.find(m => m.role === "user")?.content?.slice(0, 80) || "Chat session";
      return `
        <div class="session-card" onclick="toggleChat('${s._id}')">
          <div class="session-header">
            <div class="session-info">
              <div class="session-title">${preview}</div>
              <div class="session-meta">${fmt(s.updatedAt)} · ${msgCount} messages</div>
            </div>
            <span class="toggle-icon" id="icon-${s._id}">▶</span>
          </div>
          <div class="chat-messages hidden" id="chat-${s._id}">
            ${(s.messages || []).map(m => `
              <div class="msg-row ${m.role}">
                <div class="msg-role">${m.role === "user" ? "👤 User" : "🧠 Cortex"}</div>
                <div class="msg-content">${m.content?.replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>") || ""}</div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${user?.name || "User"} — Chats</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d14;color:#e0e0f0;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;min-height:100vh}
  .topbar{background:#13131e;border-bottom:1px solid #1e1e30;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .topbar-left{display:flex;align-items:center;gap:12px}
  .topbar h1{font-size:16px;font-weight:600;color:#e8e8f0}
  .topbar a{color:#534AB7;font-size:13px;text-decoration:none;transition:color 0.2s}
  .topbar a:hover{color:#AFA9EC}
  .user-chip{display:flex;align-items:center;gap:8px;background:#1a1a2a;border:1px solid #1e1e30;border-radius:24px;padding:6px 14px 6px 8px}
  .user-chip img{width:28px;height:28px;border-radius:50%}
  .user-chip span{font-size:13px;color:#c0c0d8}
  .user-email{font-size:11px;color:#444;margin-top:2px}
  .content{padding:28px 28px}
  .stat-row{display:flex;gap:14px;margin-bottom:24px;flex-wrap:wrap}
  .stat-pill{background:#13131e;border:1px solid #1e1e30;border-radius:10px;padding:12px 20px;text-align:center}
  .stat-pill .num{font-size:22px;font-weight:700;color:#534AB7}
  .stat-pill .lbl{font-size:11px;color:#555;letter-spacing:0.06em;text-transform:uppercase;margin-top:3px}
  .section-title{font-size:12px;font-weight:600;color:#555;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:14px}
  .session-card{background:#13131e;border:1px solid #1e1e30;border-radius:12px;margin-bottom:10px;overflow:hidden;transition:border-color 0.2s}
  .session-card:hover{border-color:#2a2a45}
  .session-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;cursor:pointer;gap:12px}
  .session-title{font-size:13px;color:#c8c8e0;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px}
  .session-meta{font-size:11px;color:#444;margin-top:4px}
  .toggle-icon{color:#444;font-size:12px;flex-shrink:0;transition:transform 0.2s}
  .toggle-icon.open{transform:rotate(90deg);color:#534AB7}
  .chat-messages{border-top:1px solid #1a1a28;padding:16px 18px;display:flex;flex-direction:column;gap:12px}
  .chat-messages.hidden{display:none}
  .msg-row{display:flex;flex-direction:column;gap:4px}
  .msg-role{font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#444}
  .msg-row.user .msg-role{color:#AFA9EC}
  .msg-row.assistant .msg-role{color:#20b882}
  .msg-content{font-size:13px;line-height:1.65;color:#b8b8d0;background:#0d0d14;border-radius:8px;padding:10px 14px;border-left:2px solid #1e1e30;white-space:pre-wrap;word-break:break-word}
  .msg-row.user .msg-content{border-left-color:#534AB7;color:#c8c8e0}
  .msg-row.assistant .msg-content{border-left-color:#20b882}
  .empty{text-align:center;padding:60px 20px;color:#2a2a40;font-size:14px}
  @media(max-width:600px){.content{padding:16px}.session-title{max-width:220px}}
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-left">
    <a href="/admin">← Dashboard</a>
    <div class="user-chip">
      ${user?.photo ? `<img src="${user.photo}" onerror="this.style.display='none'">` : ""}
      <div>
        <span>${user?.name || "Unknown User"}</span>
        <div class="user-email">${user?.email || userId}</div>
      </div>
    </div>
  </div>
  <h1>${sessions.length} chat session${sessions.length !== 1 ? "s" : ""}</h1>
</div>

<div class="content">
  <div class="stat-row">
    <div class="stat-pill"><div class="num">${sessions.length}</div><div class="lbl">Sessions</div></div>
    <div class="stat-pill"><div class="num">${sessions.reduce((a,s) => a+(s.messages?.length||0),0)}</div><div class="lbl">Total Messages</div></div>
    <div class="stat-pill"><div class="num">${user?.loginCount||"—"}</div><div class="lbl">Logins</div></div>
  </div>

  <div class="section-title">Chat Sessions (newest first)</div>
  ${sessionCards || '<div class="empty">No chat sessions found for this user</div>'}
</div>

<script>
function toggleChat(id) {
  const msgs = document.getElementById('chat-' + id);
  const icon = document.getElementById('icon-' + id);
  const isHidden = msgs.classList.contains('hidden');
  msgs.classList.toggle('hidden', !isHidden);
  icon.classList.toggle('open', isHidden);
}
</script>
</body></html>`);
  } catch (e) {
    console.error("Admin chats error:", e);
    res.status(500).send("Error: " + e.message);
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
        model: "meta-llama/llama-4-maverick-17b-128e-instruct",
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

// ── STATS API — this week counts from MongoDB ──
app.get("/api/stats", isLoggedIn, async (req, res) => {
  try {
    // Start of current week (Monday 00:00 IST)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(now.getTime() + istOffset);
    const dayOfWeek = nowIST.getUTCDay(); // 0=Sun, 1=Mon...
    const daysSinceMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
    const weekStart = new Date(nowIST);
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
    // Convert back to UTC for MongoDB query
    const weekStartUTC = new Date(weekStart.getTime() - istOffset);

    const [chats, flashcards, notes] = await Promise.all([
      ChatSession.countDocuments({
        userId: req.user.id,
        createdAt: { $gte: weekStartUTC }
      }),
      CanvasItem.countDocuments({
        userId: req.user.id,
        type: "flashcard",
        createdAt: { $gte: weekStartUTC }
      }),
      CanvasItem.countDocuments({
        userId: req.user.id,
        type: "note",
        createdAt: { $gte: weekStartUTC }
      }),
    ]);

    res.json({ chats, flashcards, notes, weekStart: weekStartUTC });
  } catch (e) {
    console.error("Stats error:", e.message);
    res.status(500).json({ chats: 0, flashcards: 0, notes: 0 });
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
