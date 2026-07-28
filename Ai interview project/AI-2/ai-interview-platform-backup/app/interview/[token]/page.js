"use client";
import { use, useEffect, useRef, useState } from "react";

export default function InterviewPage({ params: paramsPromise }) {
  // Unwrap params using use()
  const params = use(paramsPromise);
  const token = params.token;

  const [interviewStarted, setInterviewStarted] = useState(false);
  const [interviewOver, setInterviewOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10 * 60);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // AI is speaking
  const [thinkingTime, setThinkingTime] = useState(15); // 15 seconds thinking time
  const [isThinking, setIsThinking] = useState(false);
  const [speakingTime, setSpeakingTime] = useState(0); // Time candidate has been speaking
  const [maxSpeakingTime, setMaxSpeakingTime] = useState(60); // AI-determined max time
  const [error, setError] = useState(null);
  const [currentTranscript, setCurrentTranscript] = useState(""); // Track current answer
  const [currentTopicCount, setCurrentTopicCount] = useState(0); // Questions asked on current topic
  const [evaluation, setEvaluation] = useState(null); // Evaluation results
  const [isEvaluating, setIsEvaluating] = useState(false); // Loading state for evaluation
  const [jdText, setJdText] = useState(""); // Store JD for evaluation
  const recognitionRef = useRef(null);
  const videoRef = useRef(null);
  const thinkingTimerRef = useRef(null);
  const speakingTimerRef = useRef(null);
  const autoSubmitTimerRef = useRef(null);
  const isManualStopRef = useRef(false); // Track if user manually stopped recognition
  const accumulatedTranscriptRef = useRef(""); // Persist transcript across restarts
  
  // Start interview
  async function startInterview() {
    setInterviewStarted(true);
    setError(null);
    setCurrentTopicCount(0); // Reset topic count
    console.log("[DEBUG] startInterview triggered, sending token:", params.token);

    try {
      const res = await fetch("/api/generate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token: params.token, 
          lastAnswer: "",
          questionHistory: [],
          questionMode: "first",
          topicQuestionCount: 0
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to generate question");
      }
      
      const data = await res.json();
      console.log("[DEBUG] Initial backend response:", data);

      if (data.question) {
        setQuestion(data.question);
        setCurrentTopicCount(1); // First question on first topic
        speak(data.question);
      } else {
        console.warn("[DEBUG] No question returned from backend.");
        setError("Failed to generate question. Please try again.");
      }
    } catch (err) {
      console.error("[DEBUG] Error fetching first question:", err);
      setError(err.message || "Failed to start interview. Please check if your link is valid.");
      setInterviewStarted(false);
    }
  }

  // Fetch JD on mount
  useEffect(() => {
    async function fetchJD() {
      try {
        const res = await fetch(`/api/get-interview-data?token=${params.token}`);
        if (res.ok) {
          const data = await res.json();
          if (data.jdText) {
            setJdText(data.jdText);
            console.log("[DEBUG] JD fetched for evaluation");
          }
        }
      } catch (err) {
        console.log("Could not fetch JD:", err);
      }
    }
    fetchJD();
  }, [params.token]);

  // Timer
  useEffect(() => {
    if (interviewStarted && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0) {
      setInterviewOver(true);
      stopInterview();
    }
  }, [interviewStarted, timeLeft]);

  // Camera setup
  useEffect(() => {
    if (interviewStarted) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }).catch((err) => {
        console.warn("[DEBUG] Camera/mic permission error:", err);
      });
    }
  }, [interviewStarted]);

  // Text-to-speech
  function speak(text) {
    console.log("[DEBUG] Speaking:", text);
    
    // Clean up any existing recognition before starting new question
    if (recognitionRef.current) {
      console.log("[DEBUG] Cleaning up existing recognition before new question");
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log("[DEBUG] Error stopping old recognition:", e);
      }
      recognitionRef.current = null;
    }
    
    // Reset all flags for new question
    isManualStopRef.current = false;
    accumulatedTranscriptRef.current = "";
    
    // Clear any existing timers
    if (speakingTimerRef.current) {
      clearInterval(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    
    setIsSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.pitch = 1;
    utterance.rate = 1;
    
    utterance.onend = () => {
      console.log("[DEBUG] AI finished speaking");
      setIsSpeaking(false);
      startThinkingTimer();
    };
    
    window.speechSynthesis.speak(utterance);
  }

  // Start thinking timer (15 seconds)
  function startThinkingTimer() {
    console.log("[DEBUG] Starting thinking timer");
    setIsThinking(true);
    setThinkingTime(15);
    
    thinkingTimerRef.current = setInterval(() => {
      setThinkingTime((prev) => {
        if (prev <= 1) {
          clearInterval(thinkingTimerRef.current);
          setIsThinking(false);
          startListening(); // Auto-start listening after thinking time
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // Calculate max speaking time based on question complexity
  function calculateSpeakingTime(question) {
    const words = question.split(' ').length;
    // Base time: 60 seconds, add 10 seconds for every 10 words in question
    const calculatedTime = 60 + Math.floor(words / 10) * 10;
    return Math.min(calculatedTime, 120); // Max 2 minutes
  }

  // Correct only obvious technical term misrecognitions
  function correctTechnicalTerms(text) {
    if (!text) return text;
    
    // Only correct very specific technical terms that are commonly misheard
    // These should only be words that would NEVER make sense in an interview context
    const corrections = {
      // Only docker-specific corrections (doctor would never be used in tech interview)
      'doctor': 'docker',
      'doctors': 'docker',
      'darker': 'docker',
      
      // Very specific misrecognitions only
      'coober netties': 'kubernetes',
      'cooper netties': 'kubernetes',
      'my sequel': 'mysql',
      'post gray': 'postgresql',
      'red is': 'redis',
    };
    
    let correctedText = text;
    
    // Apply only very specific corrections
    for (const [wrong, correct] of Object.entries(corrections)) {
      const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
      correctedText = correctedText.replace(regex, (match) => {
        if (match[0] === match[0].toUpperCase()) {
          return correct.charAt(0).toUpperCase() + correct.slice(1);
        }
        return correct;
      });
    }
    
    return correctedText;
  }

  // Choose best alternative from multiple recognition results
  function chooseBestAlternative(alternatives) {
    if (!alternatives || alternatives.length === 0) return '';
    
    // If only one alternative, return it
    if (alternatives.length === 1) return alternatives[0].transcript;
    
    // Score each alternative based on:
    // 1. Confidence level
    // 2. Word coherence (prefer complete words over fragments)
    let bestScore = -1;
    let bestTranscript = alternatives[0].transcript;
    
    alternatives.forEach(alt => {
      // Start with confidence as base score
      let score = alt.confidence || 0.5;
      
      const text = alt.transcript.toLowerCase();
      
      // Boost score if it contains common technical keywords (without forcing them)
      const technicalKeywords = [
        'docker', 'kubernetes', 'python', 'javascript', 'react', 'node',
        'api', 'database', 'server', 'cloud', 'aws', 'azure', 'git',
        'code', 'software', 'development', 'programming', 'framework',
        'experience', 'expertise', 'project', 'team', 'work', 'built',
        'developed', 'implemented', 'managed', 'designed', 'created'
      ];
      
      const containsKeywords = technicalKeywords.some(keyword => text.includes(keyword));
      if (containsKeywords) {
        score += 0.1; // Small boost, not forcing
      }
      
      // Prefer longer, more complete responses
      const wordCount = text.split(/\s+/).length;
      if (wordCount > 3) {
        score += 0.05;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestTranscript = alt.transcript;
      }
    });
    
    return bestTranscript;
  }

  // Speech recognition with improved accuracy
  function startListening() {
    console.log("[DEBUG] Starting speech recognition...");
    
    // Prevent multiple simultaneous recognitions
    if (recognitionRef.current) {
      console.log("[DEBUG] Recognition already exists, stopping it first");
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log("[DEBUG] Error stopping existing recognition:", e);
      }
    }
    
    // Clear thinking timer if still running
    if (thinkingTimerRef.current) {
      clearInterval(thinkingTimerRef.current);
      setIsThinking(false);
    }
    
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true; // Enable interim results for better accuracy
    recognition.maxAlternatives = 3; // Get multiple alternatives for better accuracy
    recognition.continuous = false; // Set to false to avoid no-speech timeouts

    // Calculate max speaking time for current question
    const maxTime = calculateSpeakingTime(question);
    setMaxSpeakingTime(maxTime);
    setSpeakingTime(0);
    setCurrentTranscript(""); // Reset transcript
    
    // Reset accumulated transcript only on first start
    accumulatedTranscriptRef.current = "";

    recognition.onstart = () => {
      console.log("[DEBUG] Listening started");
      setIsListening(true);
      isManualStopRef.current = false; // Reset flag
      
      // Only start timers if they're not already running
      if (!speakingTimerRef.current) {
        console.log("[DEBUG] Starting speaking timer");
        // Start speaking timer
        speakingTimerRef.current = setInterval(() => {
          setSpeakingTime((prev) => prev + 1);
        }, 1000);
      }
      
      if (!autoSubmitTimerRef.current) {
        console.log("[DEBUG] Starting auto-submit timer for", maxTime, "seconds");
        // Auto-submit after max time
        autoSubmitTimerRef.current = setTimeout(() => {
          console.log("[DEBUG] Max speaking time reached, auto-submitting");
          console.log("[DEBUG] Final accumulated transcript:", accumulatedTranscriptRef.current);
          isManualStopRef.current = true; // Mark as manual stop
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
        }, maxTime * 1000);
      }
    };
    
    recognition.onend = () => {
      console.log("[DEBUG] ========== ONEND FIRED ==========");
      console.log("[DEBUG] Listening ended");
      console.log("[DEBUG] Is manual stop:", isManualStopRef.current);
      console.log("[DEBUG] Total accumulated transcript:", accumulatedTranscriptRef.current);
      
      // If not a manual stop, just restart without submitting
      if (!isManualStopRef.current) {
        console.log("[DEBUG] ✅ NOT a manual stop - restarting recognition");
        // Restart immediately
        setTimeout(() => {
          if (recognitionRef.current && !isManualStopRef.current) {
            try {
              console.log("[DEBUG] 🔄 Restarting...");
              recognitionRef.current.start();
            } catch (e) {
              console.log("[DEBUG] ❌ Could not restart:", e.message);
            }
          }
        }, 50);
        return; // EXIT - don't submit
      }
      
      // Only reach here if manual stop (user clicked submit or timer expired)
      console.log("[DEBUG] 🛑 Manual stop - will submit answer");
      setIsListening(false);
      
      // Clear timers
      if (speakingTimerRef.current) {
        clearInterval(speakingTimerRef.current);
        speakingTimerRef.current = null;
      }
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
      }
      
      // Submit answer
      let finalTranscript = accumulatedTranscriptRef.current.trim();
      console.log("[DEBUG] 📤 Submitting:", finalTranscript || "(No answer provided)");
      if (finalTranscript) {
        const correctedFinal = correctTechnicalTerms(finalTranscript);
        submitAnswer(correctedFinal);
      } else {
        submitAnswer("(No answer provided)");
      }
    };
    
    recognition.onresult = (event) => {
      // Build complete transcript from all results
      let completeTranscript = "";
      
      // Process all results to get the most complete transcript
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          // Get all alternatives for this result
          const alternatives = [];
          for (let j = 0; j < result.length; j++) {
            alternatives.push(result[j]);
          }
          
          // Choose best alternative (considering confidence and context)
          const bestTranscript = chooseBestAlternative(alternatives);
          completeTranscript += bestTranscript + " ";
          
          // Log alternatives for debugging
          if (alternatives.length > 1) {
            console.log("[DEBUG] Multiple alternatives detected:");
            alternatives.forEach((alt, idx) => {
              console.log(`  ${idx + 1}. "${alt.transcript}" (confidence: ${alt.confidence})`);
            });
            console.log(`  → Selected: "${bestTranscript}"`);
          }
        }
      }
      
      // Update accumulated transcript if we got final results
      if (completeTranscript) {
        // Apply only very specific technical term corrections (doctor→docker)
        const correctedTranscript = correctTechnicalTerms(completeTranscript.trim());
        accumulatedTranscriptRef.current = correctedTranscript;
        setCurrentTranscript(accumulatedTranscriptRef.current);
        
        if (completeTranscript.trim() !== correctedTranscript) {
          console.log("[DEBUG] Applied correction:");
          console.log("  Before:", completeTranscript.trim());
          console.log("  After:", correctedTranscript);
        }
      }
    };
    
    recognition.onerror = (event) => {
      console.log("[DEBUG] Speech recognition error:", event.error);
      // Ignore errors - we'll restart in onend anyway
    };

    recognition.start();
    recognitionRef.current = recognition;
  }

  // Manual submit answer (when user clicks "Submit Answer" during speaking)
  async function manualSubmit() {
    console.log("[DEBUG] Manual submit clicked");
    console.log("[DEBUG] Current transcript at manual submit:", currentTranscript);
    
    // Mark as manual stop so recognition won't restart
    isManualStopRef.current = true;
    
    // Stop recognition (this will trigger onend which submits)
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    // Clear timers
    if (speakingTimerRef.current) {
      clearInterval(speakingTimerRef.current);
    }
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
    }
    
    setIsListening(false);
    
    // Note: The actual submission happens in recognition.onend
    // This ensures we get the most complete transcript
  }

  // Submit answer and get next question
  async function submitAnswer(userAnswer) {
    // Save current Q&A pair
    const currentQA = { question, answer: userAnswer };
    setAnswers((prev) => [...prev, currentQA]);
    
    // Reset timers
    setSpeakingTime(0);
    setMaxSpeakingTime(60);
    setCurrentTranscript("");
    
    await generateFollowUp(userAnswer);
  }


// Generate follow-up question
async function generateFollowUp(answer) {
  console.log("[DEBUG] generateFollowUp called with answer:", answer);
  console.log("[DEBUG] Current topic count:", currentTopicCount);

  try {
    // Determine question mode based on topic count and answer
    let questionMode;
    let newTopicCount;
    
    if (!answer || answer === "(No answer provided)") {
      // No answer given - move to new topic immediately regardless of count
      questionMode = "new_topic";
      newTopicCount = 1; // Start counting from 1 for new topic
      console.log("[DEBUG] No answer provided - switching to new topic immediately");
    } else if (currentTopicCount >= 3) {
      // Completed 3 questions on current topic - switch to new topic
      questionMode = "new_topic";
      newTopicCount = 1; // Reset and start counting from 1 for new topic
      console.log("[DEBUG] Completed 3 questions - switching to new topic");
    } else {
      // Continue with follow-up on same topic (candidate is answering)
      questionMode = "follow_up";
      newTopicCount = currentTopicCount + 1;
      console.log("[DEBUG] Follow-up question", newTopicCount, "/3 on same topic");
    }
    
    const res = await fetch("/api/generate-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        token: token, 
        lastAnswer: answer,
        questionHistory: answers.map(qa => qa.question),
        questionMode: questionMode,
        topicQuestionCount: currentTopicCount
      }),
    });

    const data = await res.json();
    console.log("[DEBUG] Follow-up backend response:", data);

    let question = data.question;

    // Fallback questions if needed
    if (!question || question.length < 5) {
      const fallbackQuestions = [
        "Tell me about another project from your experience.",
        "What technologies are you most comfortable with?",
        "Describe a challenging problem you solved recently.",
        "What's your approach to learning new technologies?",
        "Tell me about your experience working in teams."
      ];
      question = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
    }

    // Update topic count
    setCurrentTopicCount(newTopicCount);
    console.log("[DEBUG] Updated topic count to:", newTopicCount);
    
    setQuestion(question);
    speak(question);

  } catch (err) {
    console.error("[DEBUG] Follow-up error:", err);
    stopInterview();
  }
}


  // Stop interview
  async function stopInterview() {
    console.log("[DEBUG] Stopping interview...");
    
    // Always save current question if it exists and hasn't been answered yet
    if (question && question.trim()) {
      // Check if this question is already in answers
      const alreadySaved = answers.some(qa => qa.question === question);
      
      if (!alreadySaved) {
        console.log("[DEBUG] Saving unanswered question before ending");
        const answerText = currentTranscript && currentTranscript.trim() 
          ? currentTranscript.trim() 
          : "(No answer provided)";
        setAnswers((prev) => {
          const updatedAnswers = [...prev, { question, answer: answerText }];
          // Generate evaluation after updating answers
          generateEvaluation(updatedAnswers);
          return updatedAnswers;
        });
      } else {
        // Generate evaluation with current answers
        generateEvaluation(answers);
      }
    } else {
      // Generate evaluation with current answers
      generateEvaluation(answers);
    }
    
    setInterviewOver(true);
    setInterviewStarted(false);
    
    // Clear all timers
    if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current);
    if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
    if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
    
    window.speechSynthesis.cancel();
    if (recognitionRef.current) recognitionRef.current.stop();
  }

  // Generate evaluation
  async function generateEvaluation(finalAnswers) {
    setIsEvaluating(true);
    try {
      const res = await fetch("/api/evaluate-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          answers: finalAnswers,
          jdText: jdText 
        }),
      });

      const data = await res.json();
      if (res.ok && data.evaluation) {
        setEvaluation(data.evaluation);
      } else {
        console.error("Evaluation failed:", data.error);
      }
    } catch (err) {
      console.error("Error generating evaluation:", err);
    } finally {
      setIsEvaluating(false);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (recognitionRef.current) recognitionRef.current.stop();
      } catch (e) {}
      window.speechSynthesis.cancel();
      
      // Clear all timers
      if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current);
      if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
      if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
      
      try {
        if (videoRef.current && videoRef.current.srcObject) {
          const tracks = videoRef.current.srcObject.getTracks();
          tracks.forEach((t) => t.stop());
        }
      } catch (e) {}
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {!interviewStarted && !interviewOver && (
        <div className="max-w-xl mx-auto mt-20">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Interview Session</h1>
            
            {error && (
              <div className="mb-4 bg-red-50 border border-red-300 rounded p-3">
                <p className="text-red-700 text-sm">{error}</p>
                <p className="text-red-600 text-xs mt-1">Please upload your resume again.</p>
              </div>
            )}
            
            <p className="text-gray-600 mb-6 text-sm">Click below when ready to begin</p>
            
            <button
              onClick={startInterview}
              className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 font-medium"
            >
              Start Interview
            </button>
          </div>
        </div>
      )}

      {interviewStarted && !interviewOver && (
        <div className="max-w-5xl mx-auto">
          {/* Top Bar */}
          <div className="bg-white rounded-lg shadow p-4 mb-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Time: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
            </div>
            <button
              onClick={stopInterview}
              className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700"
            >
              End Interview
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Left - Question & AI */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="h-full flex flex-col">
                <div className="mb-4">
                  <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-white text-2xl font-bold">AI</span>
                  </div>
                </div>
                
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-gray-800 text-lg text-center leading-relaxed">
                    {question || "Loading..."}
                  </p>
                </div>
                
                <div className="text-xs text-gray-500 text-center mt-4">
                  Question {answers.length + 1}
                </div>

                {isSpeaking && (
                  <div className="bg-purple-50 border border-purple-300 rounded p-2 text-center mt-3">
                    <p className="text-purple-700 text-sm">AI is speaking...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right - Video & Controls */}
            <div className="bg-white rounded-lg shadow p-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-64 bg-black rounded object-cover mb-3"
              />
              
              {/* Controls */}
              <div className="space-y-2">
                {!isListening && !isSpeaking && !isThinking && (
                  <button
                    onClick={startListening}
                    className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 text-sm"
                  >
                    Start Speaking
                  </button>
                )}

                {isThinking && !isSpeaking && (
                  <div className="bg-yellow-50 border border-yellow-300 rounded p-2 text-center">
                    <p className="text-yellow-700 text-sm font-medium">Think: {thinkingTime}s</p>
                    <button
                      onClick={startListening}
                      className="mt-2 bg-yellow-600 text-white px-4 py-1 rounded text-xs hover:bg-yellow-700"
                    >
                      Skip & Speak
                    </button>
                  </div>
                )}

                {isListening && (
                  <>
                    <div className="bg-green-50 border border-green-300 rounded p-2">
                      <div className="flex justify-between text-xs text-green-700 mb-1">
                        <span>Recording</span>
                        <span>{speakingTime}s / {maxSpeakingTime}s</span>
                      </div>
                      <div className="w-full bg-green-200 rounded h-2">
                        <div 
                          className="bg-green-600 h-2 rounded"
                          style={{ width: `${(speakingTime / maxSpeakingTime) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                    <button
                      onClick={manualSubmit}
                      className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 text-sm"
                    >
                      Submit Answer
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {interviewOver && (
        <div className="max-w-4xl mx-auto mt-8 pb-8">
          <div className="bg-white rounded shadow p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-5">Interview Results</h2>
            
            {isEvaluating && (
              <div className="text-center py-8">
                <p className="text-gray-600">Loading evaluation...</p>
              </div>
            )}

            {!isEvaluating && evaluation && (
              <div className="space-y-5">
                {/* Overall Summary */}
                <div className="border border-gray-300 p-4">
                  <h3 className="font-bold text-gray-800 mb-3">Overall</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Score:</span>
                      <span className="font-medium">{evaluation.finalScore}/100</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Verdict:</span>
                      <span className="font-medium">{evaluation.verdict}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Recommendation:</span>
                      <span className="font-medium">{evaluation.recommendation}</span>
                    </div>
                  </div>
                </div>

                {/* Communication Skills */}
                <div className="border border-gray-300 p-4">
                  <h3 className="font-bold text-gray-800 mb-3">Communication</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Fluency:</span>
                      <span>{evaluation.communicationSkills.fluency}/10</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Confidence:</span>
                      <span>{evaluation.communicationSkills.confidence}/10</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Clarity:</span>
                      <span>{evaluation.communicationSkills.clarity}/10</span>
                    </div>
                  </div>
                </div>

                {/* Content & Knowledge */}
                <div className="border border-gray-300 p-4">
                  <h3 className="font-bold text-gray-800 mb-3">Technical Knowledge</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Accuracy:</span>
                      <span>{evaluation.contentKnowledge.technicalAccuracy}/10</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Relevance:</span>
                      <span>{evaluation.contentKnowledge.relevance}/10</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Understanding:</span>
                      <span>{evaluation.contentKnowledge.depth}/10</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Problem Solving:</span>
                      <span>{evaluation.contentKnowledge.problemSolving}/10</span>
                    </div>
                  </div>
                </div>

                {/* Behavioral Skills */}
                <div className="border border-gray-300 p-4">
                  <h3 className="font-bold text-gray-800 mb-3">Behavioral</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Composure:</span>
                      <span>{evaluation.behavioralSkills.composure}/10</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Adaptability:</span>
                      <span>{evaluation.behavioralSkills.adaptability}/10</span>
                    </div>
                  </div>
                </div>

                {/* Strengths & Improvements */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-gray-300 p-4">
                    <h3 className="font-bold text-gray-800 mb-2">Strengths</h3>
                    <ul className="space-y-1 text-sm">
                      {evaluation.strengths.map((strength, i) => (
                        <li key={i} className="text-gray-700">• {strength}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="border border-gray-300 p-4">
                    <h3 className="font-bold text-gray-800 mb-2">To Improve</h3>
                    <ul className="space-y-1 text-sm">
                      {evaluation.improvements.map((improvement, i) => (
                        <li key={i} className="text-gray-700">• {improvement}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Recommended Fit */}
                <div className="border border-gray-300 p-4">
                  <h3 className="font-bold text-gray-800 mb-2">Job Fit</h3>
                  <p className="text-sm text-gray-700">{evaluation.recommendedFit}</p>
                </div>
              </div>
            )}

            {!isEvaluating && !evaluation && (
              <div className="text-center py-8 text-gray-500">
                <p>Unable to load evaluation.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
