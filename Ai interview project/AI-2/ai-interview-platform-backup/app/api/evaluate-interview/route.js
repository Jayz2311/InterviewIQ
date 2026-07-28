import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

let genAI;
let model;

async function initModel() {
  if (!model) {
    console.log("⏳ Loading Gemini model for evaluation...");
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    console.log("✅ Gemini model ready for evaluation");
  }
}

export async function POST(req) {
  try {
    const { answers, jdText } = await req.json();

    if (!answers || answers.length === 0) {
      return NextResponse.json({ 
        error: "No interview data to evaluate" 
      }, { status: 400 });
    }

    await initModel();

    // Build interview transcript
    const transcript = answers.map((qa, i) => 
      `Q${i+1}: ${qa.question}\nA${i+1}: ${qa.answer}`
    ).join('\n\n');

    const jdContext = jdText ? `\n\nJob Description:\n${jdText.substring(0, 1000)}` : '';

    const prompt = `You are an expert interview evaluator. Analyze this interview transcript and provide a detailed evaluation in JSON format.

Interview Transcript:
${transcript}${jdContext}

Provide evaluation in this EXACT JSON structure (use ONLY valid JSON, no markdown):
{
  "finalScore": <number 0-100>,
  "verdict": "<Excellent|Good|Needs Improvement|Not Suitable>",
  "recommendation": "<Shortlist|Reconsider|Reject>",
  "communicationSkills": {
    "fluency": <number 0-10>,
    "confidence": <number 0-10>,
    "clarity": <number 0-10>
  },
  "contentKnowledge": {
    "technicalAccuracy": <number 0-10>,
    "relevance": <number 0-10>,
    "depth": <number 0-10>,
    "problemSolving": <number 0-10>
  },
  "behavioralSkills": {
    "composure": <number 0-10>,
    "adaptability": <number 0-10>
  },
  "strengths": ["<strength1>", "<strength2>", "<strength3>"],
  "improvements": ["<area1>", "<area2>"],
  "recommendedFit": "<one sentence about job fit>"
}

Base your evaluation on:
- Answer completeness (avoid "(No answer provided)")
- Technical depth and accuracy
- Communication quality
- Relevance to questions asked${jdText ? '\n- Alignment with job requirements' : ''}

Return ONLY the JSON object, no other text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Clean up markdown code blocks if present
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Parse JSON
    let evaluation;
    try {
      evaluation = JSON.parse(text);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Response text:", text);
      
      // Fallback evaluation
      evaluation = {
        finalScore: 70,
        verdict: "Good",
        recommendation: "Reconsider",
        communicationSkills: { fluency: 7, confidence: 7, clarity: 7 },
        contentKnowledge: { technicalAccuracy: 7, relevance: 7, depth: 7, problemSolving: 7 },
        behavioralSkills: { composure: 7, adaptability: 7 },
        strengths: ["Attempted to answer questions", "Showed engagement", "Maintained composure"],
        improvements: ["Provide more detailed responses", "Demonstrate deeper technical knowledge"],
        recommendedFit: "Moderate fit for the role based on limited responses"
      };
    }

    console.log("✅ Generated interview evaluation");
    
    return NextResponse.json({ evaluation });
  } catch (err) {
    console.error("Evaluation error:", err);
    return NextResponse.json({ 
      error: "Failed to generate evaluation" 
    }, { status: 500 });
  }
}
