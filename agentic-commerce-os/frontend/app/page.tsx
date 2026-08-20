"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PromptInput from "./components/PromptInput";
import AgentTimeline from "./components/AgentTimeline";
import LivePreview from "./components/LivePreview";

const API_BASE = "http://localhost:8000";

interface AgentEvent {
  event: string;
  node: string;
  message: string;
  timestamp: number;
  data?: any;
  tokens_used?: number;
}

export default function Home() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [masterView, setMasterView] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleSubmit = useCallback(async (prompt: string, industry: string) => {
    setEvents([]);
    setFiles({});
    setMasterView("");
    setError(null);
    setIsComplete(false);
    setIsRunning(true);

    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, industry }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to start generation");
      }

      const data = await res.json();
      setJobId(data.job_id);

      // Connect to SSE stream
      const es = new EventSource(`${API_BASE}/api/stream/${data.job_id}`);
      eventSourceRef.current = es;

      const handleEvent = (e: MessageEvent) => {
        try {
          const event: AgentEvent = JSON.parse(e.data);
          setEvents((prev) => [...prev, event]);

          if (event.event === "final" && event.data) {
            setMasterView(event.data.master_view || "");
            // Fetch full files
            fetchFiles(data.job_id);
          }
        } catch (err) {
          console.error("SSE parse error:", err);
        }
      };

      es.addEventListener("node_start", handleEvent);
      es.addEventListener("node_done", handleEvent);
      es.addEventListener("node_progress", handleEvent);
      es.addEventListener("node_error", handleEvent);
      es.addEventListener("final", handleEvent);

      es.addEventListener("done", () => {
        es.close();
        setIsRunning(false);
        setIsComplete(true);
      });

      es.onerror = () => {
        es.close();
        setIsRunning(false);
        setError("Connection to server lost. Check if the backend is running.");
      };

    } catch (err: any) {
      setIsRunning(false);
      setError(err.message || "Unknown error");
    }
  }, []);

  const fetchFiles = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${id}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || {});
      }
    } catch (err) {
      console.error("Failed to fetch files:", err);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "0 24px" }}>
      {/* Top Bar */}
      <header style={{
        maxWidth: "1200px", margin: "0 auto",
        padding: "24px 0", display: "flex",
        justifyContent: "space-between", alignItems: "center",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div className="flex items-center gap-3">
          <div style={{
            width: "28px", height: "28px", borderRadius: "8px",
            background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px",
          }}>
            ◆
          </div>
          <div>
            <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "-0.01em" }}>
              Agentic Commerce OS
            </span>
            <span style={{ fontSize: "10px", color: "#525252", marginLeft: "8px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              v1.0
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: isRunning ? "#F59E0B" : "#22C55E",
          }}
            className={isRunning ? "status-dot-pulse" : ""}
          />
          <span style={{ fontSize: "10px", color: "#525252", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {isRunning ? "Processing" : "Ready"}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: "1200px", margin: "0 auto", paddingTop: "48px", paddingBottom: "80px" }}>
        {/* Hero Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ textAlign: "center", marginBottom: "48px" }}
        >
          <h1 style={{
            fontSize: "clamp(28px, 4vw, 48px)",
            fontWeight: 300,
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
            marginBottom: "16px",
          }}>
            Generate <em style={{ fontStyle: "italic", color: "#818CF8" }}>Luxury</em> Commerce
          </h1>
          <p style={{ fontSize: "14px", color: "#737373", maxWidth: "480px", margin: "0 auto" }}>
            6 specialized AI agents collaborate to build Prada-level
            e-commerce components from a single prompt.
          </p>
        </motion.div>

        {/* Prompt Input */}
        <PromptInput onSubmit={handleSubmit} isLoading={isRunning} />

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                maxWidth: "768px", margin: "16px auto 0",
                padding: "12px 16px", borderRadius: "8px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                fontSize: "12px", color: "#EF4444",
              }}
            >
              ⚠️ {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Agent Timeline */}
        <AgentTimeline events={events} isRunning={isRunning} />

        {/* Live Preview */}
        <AnimatePresence>
          {Object.keys(files).length > 0 && (
            <LivePreview files={files} masterView={masterView} />
          )}
        </AnimatePresence>

        {/* Completion Badge */}
        <AnimatePresence>
          {isComplete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                maxWidth: "768px", margin: "24px auto 0",
                padding: "16px 24px", borderRadius: "12px",
                background: "rgba(34, 197, 94, 0.08)",
                border: "1px solid rgba(34, 197, 94, 0.2)",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: "12px", color: "#22C55E", fontWeight: 500 }}>
                ✓ Generation Complete
              </span>
              <p style={{ fontSize: "10px", color: "#525252", marginTop: "4px" }}>
                {Object.keys(files).length} files generated • All agents finished successfully
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
