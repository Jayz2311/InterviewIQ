import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI;
let model;

export async function initAI() {
  if (!model) {
    console.log("⏳ Loading Gemini AI model...");
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    console.log("✅ Gemini AI model ready");
  }
}

export async function generateQuestion(cvText, lastAnswer = "") {
  await initAI();
  
  const prompt = lastAnswer
    ? `You are an expert technical interviewer. The candidate just answered: "${lastAnswer}". 

Based on their CV and their previous answer, ask ONE concise and relevant follow-up interview question. Make it conversational and natural.

CV Summary:
${cvText.substring(0, 1500)}

Generate only the interview question, nothing else.`
    : `You are an expert technical interviewer. Based on the candidate's CV below, ask ONE concise and engaging first interview question suitable for a technical video interview. Make it conversational and natural.

CV Summary:
${cvText.substring(0, 1500)}

Generate only the interview question, nothing else.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  let question = response.text().trim();
  
  // Clean up any markdown or extra formatting
  question = question.replace(/^\*\*|\*\*$/g, '').replace(/^"|"$/g, '').trim();
  
  return question;
}
