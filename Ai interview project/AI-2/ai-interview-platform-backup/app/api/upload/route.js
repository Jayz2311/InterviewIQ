import crypto from "crypto";
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse-fixed";
import { saveInterviewData } from "../../../lib/storage.js";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const jdText = formData.get("jd"); // Job Description text

    // 1️⃣ Validate inputs
    if (!file) {
      console.error("❌ Missing CV file in upload");
      return NextResponse.json(
        { error: "Please provide a CV file." },
        { status: 400 }
      );
    }

    if (!file.name.endsWith(".pdf")) {
      console.error("❌ Invalid file type:", file.name);
      return NextResponse.json(
        { error: "Only PDF files are allowed." },
        { status: 400 }
      );
    }

    // 2️⃣ Extract text from PDF
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await pdfParse(buffer);
    const cvText = pdfData.text || "";
    console.log("📄 Extracted CV text length:", cvText.length);
    console.log("📋 JD text length:", jdText ? jdText.length : 0);

    // 3️⃣ Generate a unique token for this interview
    const token = crypto.randomBytes(16).toString("hex");
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const meetingLink = `${baseUrl}/interview/${token}`;
    console.log("🎟️ Generated token:", token);
    console.log("🔗 Meeting link:", meetingLink);

    // 4️⃣ Store interview data persistently
    saveInterviewData(token, { cvText, jdText: jdText || "" });
    console.log("✅ Stored interview data for token:", token);

    // 5️⃣ Respond with interview link immediately
    return NextResponse.json({
      success: true,
      message: "CV uploaded successfully!",
      token,
      interviewLink: meetingLink,
    });
  } catch (err) {
    console.error("❌ Error processing upload:", err);
    return NextResponse.json(
      { error: "Failed to process the file. Please try again." },
      { status: 500 }
    );
  }
}
