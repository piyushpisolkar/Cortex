// ── MSBTE K-SCHEME — COMPUTER ENGINEERING (CO) — SEM 5 & 6 SUBJECT REFERENCE ──
// Single source of truth. Verified against official MSBTE scheme tables (Aug 2026).
// Used by: chat system prompt (subject awareness), AnswerLab (rubric scoring), ProjectLab.
// Do NOT hardcode subject lists anywhere else — import from this file.

const SUBJECTS = {
  sem5: {
    label: "Semester 5",
    core: [
      { code: "315319", name: "Operating System", abbr: "OSY", maxMarks: 175 },
      { code: "315323", name: "Software Engineering", abbr: "STE", maxMarks: 175 },
      { code: "315002", name: "Entrepreneurship Development and Startups", abbr: "ENDS", maxMarks: 75 },
      { code: "315003", name: "Seminar and Project Initiation Course", abbr: "SPI", maxMarks: 75 },
      { code: "315004", name: "Internship (12 Weeks)", abbr: "ITR", maxMarks: 200 },
    ],
    electives: [
      { code: "315321", name: "Advance Computer Network", abbr: "ACN", maxMarks: 150 },
      { code: "315325", name: "Cloud Computing", abbr: "CLC", maxMarks: 150 },
      { code: "315326", name: "Data Analytics", abbr: "DAN", maxMarks: 150 },
    ],
  },
  sem6: {
    label: "Semester 6",
    core: [
      { code: "315301", name: "Management", abbr: "MAN", maxMarks: 125 },
      { code: "316313", name: "Emerging Trends in Computer Engineering and Information Technology", abbr: "ETI", maxMarks: 125 },
      { code: "316314", name: "Software Testing", abbr: "SFT", maxMarks: 150 },
      { code: "316005", name: "Client Side Scripting", abbr: "CSS", maxMarks: 50 },
      { code: "316006", name: "Mobile Application Development", abbr: "MAD", maxMarks: 75 },
      { code: "316004", name: "Capstone Project", abbr: "CPE", maxMarks: 150 },
    ],
    electives: [
      { code: "316315", name: "Digital Forensic and Hacking Techniques", abbr: "DFH", maxMarks: 175 },
      { code: "316316", name: "Machine Learning", abbr: "MAL", maxMarks: 175 },
      { code: "316317", name: "Network and Information Security", abbr: "NIS", maxMarks: 175 },
    ],
  },
};

// Flat lookup by subject code — used when scoring/generating for a specific subject
function findSubjectByCode(code) {
  for (const sem of Object.keys(SUBJECTS)) {
    const all = [...SUBJECTS[sem].core, ...SUBJECTS[sem].electives];
    const found = all.find(s => s.code === code);
    if (found) return { ...found, semester: sem };
  }
  return null;
}

// Returns every subject across both semesters, flattened — for dropdowns
function getAllSubjects() {
  const out = [];
  for (const sem of Object.keys(SUBJECTS)) {
    for (const s of SUBJECTS[sem].core) out.push({ ...s, semester: sem, type: "core" });
    for (const s of SUBJECTS[sem].electives) out.push({ ...s, semester: sem, type: "elective" });
  }
  return out;
}

// Builds a readable text block for the chat system prompt — kept in sync with this file automatically
function buildSubjectPromptBlock() {
  let out = "";
  for (const sem of Object.keys(SUBJECTS)) {
    const { label, core, electives } = SUBJECTS[sem];
    const coreNames = core.map(s => s.name).join(", ");
    const electiveNames = electives.map(s => s.name).join(" / ");
    out += `  ${label}: ${coreNames} — Elective (choose one): ${electiveNames}\n`;
  }
  return out.trim();
}

module.exports = { SUBJECTS, findSubjectByCode, getAllSubjects, buildSubjectPromptBlock };
