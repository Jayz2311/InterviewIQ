import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getInterviewData } from "../../../lib/storage.js";

let genAI;
let model;

// Initialize Gemini model once
async function initModel() {
  if (!model) {
    console.log("⏳ Loading Gemini model for CV-JD analysis...");
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    console.log("✅ Gemini model ready");
  }
}

export async function POST(req) {
  try {
    const { token } = await req.json();

    // Get stored data
    const interviewData = getInterviewData(token);
    const cvText = interviewData?.cvText || "";
    const jdText = interviewData?.jdText || "";

    if (!cvText || !jdText) {
      return NextResponse.json({ 
        error: "CV or JD not found",
        hasJD: !!jdText 
      }, { status: 400 });
    }

    await initModel();

    const prompt = `You are an expert HR analyst. Compare the candidate's CV against the Job Description and provide a brief analysis.

CV:
${cvText.substring(0, 2000)}

Job Description:
${jdText.substring(0, 1500)}

Provide a concise analysis covering:
1. Match Score (0-100%)
2. Key Strengths (2-3 matching skills/experiences)
3. Potential Gaps (1-2 areas to explore in interview)

Keep the response brief and focused.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const analysis = response.text().trim();

    console.log("📊 Generated CV-JD analysis");
    
    return NextResponse.json({ 
      analysis,
      hasJD: true 
    });
  } catch (err) {
    console.error("CV-JD analysis error:", err);
    return NextResponse.json({ 
      error: "Failed to analyze CV vs JD",
      hasJD: false 
    }, { status: 500 });
  }
}
