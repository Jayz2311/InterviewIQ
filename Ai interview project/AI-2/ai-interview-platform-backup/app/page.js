"use client";
import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState(null);
  const [jd, setJd] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [interviewLink, setInterviewLink] = useState("");

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setStatus("Please select a CV file");
      return;
    }
    if (!file.name.endsWith(".pdf")) {
      setStatus("Only PDF files are supported");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("jd", jd);

    try {
      setLoading(true);
      setStatus("Uploading...");
      setInterviewLink("");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setStatus(data.message || "Success!");
        setInterviewLink(data.interviewLink);
      } else {
        setStatus(data.error || "Upload failed");
      }
    } catch (err) {
      console.error(err);
      setStatus("Error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Interview Setup</h1>
          <p className="text-sm text-gray-600">Upload your resume to begin</p>
        </div>

        {/* Main Form */}
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <form onSubmit={handleUpload}>
            {/* CV Upload */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Resume (PDF) *
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files[0])}
                className="w-full border border-gray-300 rounded p-2 text-sm"
                required
              />
              {file && (
                <p className="text-xs text-gray-500 mt-1">File: {file.name}</p>
              )}
            </div>

            {/* Job Description */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Description (optional)
              </label>
              <textarea
                placeholder="Paste job description here for better question matching..."
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                rows="6"
                className="w-full border border-gray-300 rounded p-2 text-sm"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2 px-4 rounded text-white text-sm font-medium ${
                loading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? "Processing..." : "Upload & Continue"}
            </button>
          </form>

          {/* Status */}
          {status && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-sm">
              {status}
            </div>
          )}
        </div>

        {/* Interview Link */}
        {interviewLink && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Ready to Start</h2>
            
            <div className="bg-gray-50 p-3 rounded border border-gray-200 mb-4">
              <p className="text-xs text-gray-600 mb-1">Your link:</p>
              <p className="text-xs text-blue-600 break-all font-mono">{interviewLink}</p>
            </div>

            <button
              onClick={() => window.location.href = interviewLink}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded text-sm font-medium"
            >
              Join Interview
            </button>
          </div>
        )}

        {/* Simple Info Footer */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Voice-based AI interview • ~10 minutes</p>
        </div>
      </div>
    </div>
  );
}
