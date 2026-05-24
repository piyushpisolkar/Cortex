require("dotenv").config();
const express = require("express");
const Groq = require("groq-sdk");
const path = require("path");

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const SYSTEM_PROMPT = `You are Cortex, an elite AI study assistant for engineering students.
Your personality: sharp, clear, confident, intelligent — like a brilliant senior student.
Rules:
- Keep responses SHORT and focused — max 4-5 sentences for simple questions
- Only give long responses when the question genuinely requires detail
- For code requests, use proper code blocks with backticks
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

app.post("/api/chat", async (req, res) => {
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
      messages: messages,
      max_tokens: 1024,
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("Groq error:", error);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

app.post("/api/flashcard", async (req, res) => {
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

app.post("/api/summarize", async (req, res) => {
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

    const reply = response.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("Summarize error:", error);
    res.status(500).json({ error: "Could not summarize." });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Cortex is running at http://localhost:3000`);
});
