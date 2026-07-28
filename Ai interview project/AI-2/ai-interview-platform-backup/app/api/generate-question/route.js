import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getInterviewData } from "../../../lib/storage.js";

let genAI;
let model;

// Initialize Gemini model once
async function initModel() {
  if (!model) {
    console.log("⏳ Loading Gemini 2.5 Flash model...");
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    console.log("✅ Gemini model ready");
  }
}

export async function POST(req) {
  try {
    const { 
      token, 
      lastAnswer = "", 
      questionHistory = [], 
      questionMode = "first", 
      topicQuestionCount = 0 
    } = await req.json();

    // Look up stored CV text and JD using token from persistent storage
    const interviewData = getInterviewData(token);
    const cvText = interviewData?.cvText || "";
    const jdText = interviewData?.jdText || "";

    if (!cvText || cvText.trim().length === 0) {
      console.error("[ERROR] No CV text found for token:", token);
      return NextResponse.json({ error: "No CV text provided" }, { status: 400 });
    }

    console.log(`📋 JD provided: ${jdText ? 'YES' : 'NO'} (${jdText.length} chars)`);

    await initModel();

    // Build context based on whether JD is provided
    const contextSection = jdText 
      ? `CV Summary:\n${cvText.substring(0, 1000)}\n\nJob Description:\n${jdText.substring(0, 800)}\n\nIMPORTANT: Ask questions that assess the candidate's fit for THIS SPECIFIC ROLE based on the job requirements.`
      : `CV Summary:\n${cvText.substring(0, 1500)}`;

    let prompt;
    
    if (questionMode === "new_topic" || !lastAnswer || lastAnswer === "(No answer provided)") {
      // New topic - ask about completely different area
      console.log("🔄 Switching to NEW TOPIC");
      const jdGuidance = jdText 
        ? "Focus on skills and requirements mentioned in the Job Description that match the candidate's background."
        : "Choose a NEW topic from their CV that is COMPLETELY DIFFERENT from all previous questions.";
      
      prompt = `You are an expert technical interviewer. Based on the candidate's CV ${jdText ? 'and the Job Description ' : ''}below, ask ONE concise and engaging interview question about a COMPLETELY NEW and DIFFERENT topic that we haven't explored yet.

${questionHistory.length > 0 ? `Previous questions asked (AVOID these topics and ask about something COMPLETELY DIFFERENT):\n${questionHistory.join('\n')}\n\n` : ''}${contextSection}

IMPORTANT: ${jdGuidance} Generate only the interview question, nothing else.`;
      
    } else if (questionMode === "follow_up") {
      // Follow-up on same topic (1st, 2nd, or 3rd question)
      const questionNumber = topicQuestionCount + 1;
      console.log(`📍 Follow-up question ${questionNumber}/3 on SAME topic`);
      
      const jdGuidance = jdText 
        ? "Evaluate if their experience aligns with the job requirements while staying on the current topic."
        : "Stay on the SAME topic and build on their previous answer.";
      
      prompt = `You are an expert technical interviewer. The candidate just answered: "${lastAnswer}". 

This is question ${questionNumber} of 3 on the CURRENT topic. Ask ONE concise and relevant follow-up interview question that CONTINUES exploring the SAME topic based on their answer. Make it conversational, natural, and dig deeper into what they just mentioned.

${contextSection}

IMPORTANT: ${jdGuidance} Generate only the interview question, nothing else.`;
      
    } else {
      // First question of interview
      console.log("🎬 First question of interview");
      const jdGuidance = jdText 
        ? "Start with a key skill or requirement from the Job Description that appears in their CV."
        : "Make it conversational and natural.";
      
      prompt = `You are an expert technical interviewer. Based on the candidate's CV ${jdText ? 'and the Job Description ' : ''}below, ask ONE concise and engaging first interview question suitable for a technical video interview. ${jdGuidance}

${contextSection}

Generate only the interview question, nothing else.`;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let question = response.text().trim();

    // Clean up any markdown or extra formatting
    question = question.replace(/^\*\*|\*\*$/g, '').replace(/^"|"$/g, '').trim();
    
    // Take first line only if multiple lines
    const lines = question.split('\n').filter(line => line.trim());
    question = lines[0] || question;

    // Fallback if output too short or empty
    if (!question || question.length < 5) {
      question = questionMode === "new_topic" 
        ? "Tell me about another project from your experience." 
        : "Can you tell me more about that?";
    }

    console.log("🧠 Generated question:", question);
    console.log("📊 Mode:", questionMode, "| Topic count:", topicQuestionCount);
    
    return NextResponse.json({ question });
  } catch (err) {
    console.error("generate-question error:", err);
    const fallback = "Tell me about your most recent project.";
    return NextResponse.json({ question: fallback });
  }
}
