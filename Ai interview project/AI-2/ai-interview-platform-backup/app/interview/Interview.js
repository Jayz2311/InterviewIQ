"use client";
import { useEffect, useRef, useState } from "react";

export default function Interview({ cvText }) {
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [question, setQuestion] = useState("");
  const [qaPairs, setQaPairs] = useState([]);
  const [listening, setListening] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10 * 60); // seconds
  const videoRef = useRef(null);
  const recognitionRef = useRef(null);
  const speakingRef = useRef(false);

  // Timer
  useEffect(() => {
    if (!started || finished) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          handleFinish();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [started, finished]);

  // Helper: speak text and return Promise
  function speakText(text) {
    console.log("[DEBUG] speakText called:", text);
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.rate = 1;
        u.pitch = 1;
        u.onstart = () => console.log("[DEBUG] TTS started");
        u.onend = () => {
          console.log("[DEBUG] TTS ended");
          speakingRef.current = false;
          resolve();
        };
        speakingRef.current = true;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch (e) {
        console.error("[DEBUG] TTS error:", e);
        speakingRef.current = false;
        resolve();
      }
    });
  }

  // Fetch next question from backend
  async function fetchQuestion(lastAnswer = "") {
    console.log("[DEBUG] fetchQuestion called with cvText:", cvText, "lastAnswer:", lastAnswer);
    try {
      const res = await fetch("/api/generate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvText, lastAnswer }),
      });

      const data = await res.json();
      console.log("[DEBUG] fetchQuestion response:", data);

      const finalQ =
        data?.question || (lastAnswer ? "Can you tell me more about that?" : "Tell me about your most recent project.");
      setQuestion(finalQ);
      return finalQ;
    } catch (err) {
      console.error("[DEBUG] fetchQuestion error:", err);
      const fallback = lastAnswer ? "Can you expand on that?" : "Tell me about your most recent project.";
      setQuestion(fallback);
      return fallback;
    }
  }

  // Start speech recognition once
  function startListeningOnce() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech Recognition not supported. Use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      console.log("[DEBUG] STT started listening");
      setListening(true);
    };

    recognition.onresult = async (evt) => {
      try {
        const transcript = evt.results[0][0].transcript;
        console.log("[DEBUG] STT transcript:", transcript);
        setQaPairs((prev) => [...prev, { question, answer: transcript, ts: new Date().toISOString() }]);

        const nextQ = await fetchQuestion(transcript);
        await speakText(nextQ);

        if (timeLeft > 0 && !finished) {
          startListeningOnce();
        }
      } catch (e) {
        console.error("[DEBUG] onresult error:", e);
      }
    };

    recognition.onerror = (ev) => {
      console.error("[DEBUG] STT error:", ev);
      setListening(false);
    };

    recognition.onend = () => {
      console.log("[DEBUG] STT ended");
      setListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error("[DEBUG] recognition.start() failed:", e);
      setListening(false);
    }
  }

  // Start interview
  async function handleStart() {
    console.log("[DEBUG] handleStart called");
    setStarted(true);
    setFinished(false);
    setTimeLeft(10 * 60);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.warn("[DEBUG] Camera/mic permission error:", err);
    }

    const firstQ = await fetchQuestion("");
    await speakText(firstQ);
    startListeningOnce();
  }

  // Manual speak button
  function handleSpeakButton() {
    if (speakingRef.current) return;
    startListeningOnce();
  }

  // Finish interview
  function handleFinish() {
    console.log("[DEBUG] handleFinish called");
    setFinished(true);
    setStarted(false);

    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    } catch (e) {
      console.warn("[DEBUG] Stopping media error:", e);
    }

    try {
      if (recognitionRef.current) recognitionRef.current.stop();
    } catch (e) {}

    window.speechSynthesis.cancel();
  }

  // Cleanup
  useEffect(() => {
    return () => {
      try {
        if (recognitionRef.current) recognitionRef.current.stop();
      } catch (e) {}
      window.speechSynthesis.cancel();
      try {
        if (videoRef.current && videoRef.current.srcObject) {
          const tracks = videoRef.current.srcObject.getTracks();
          tracks.forEach((t) => t.stop());
        }
      } catch (e) {}
    };
  }, []);

  // UI
  if (!started && !finished) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6">
        <h1 className="text-3xl font-bold">AI Interview</h1>
        <button
          onClick={handleStart}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Click to Start Interview
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Interview Complete</h1>
        <h2 className="text-lg mb-2">Review</h2>
        <div className="space-y-4">
          {qaPairs.map((p, i) => (
            <div key={i} className="p-4 border rounded">
              <p className="font-semibold">Q: {p.question}</p>
              <p>A: {p.answer}</p>
              <p className="text-xs text-gray-500">{new Date(p.ts).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="flex items-center gap-12">
        <div className="w-40 h-40 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center text-white text-2xl font-bold">
          AI
        </div>
        <video ref={videoRef} autoPlay playsInline muted className="w-48 h-48 rounded-full border-4 border-green-400" />
      </div>

      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">(AI is speaking) — the question will be asked aloud</h2>
        <p className="mb-4 text-gray-600">{/* CV hidden */}</p>

        <div className="flex items-center gap-4 justify-center">
          <button
            onClick={handleSpeakButton}
            disabled={listening}
            className={`px-5 py-2 rounded-lg text-white ${listening ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"}`}
          >
            {listening ? "Listening..." : "Speak Answer"}
          </button>

          <div className="text-sm text-gray-600">
            Time left: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
          </div>
        </div>
      </div>
    </div>
  );
}
