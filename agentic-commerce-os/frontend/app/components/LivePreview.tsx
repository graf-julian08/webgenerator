"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LivePreviewProps {
  files: Record<string, string>;
  masterView: string;
}

export default function LivePreview({ files, masterView }: LivePreviewProps) {
  const fileNames = Object.keys(files);
  const [activeFile, setActiveFile] = useState(fileNames[0] || "");

  if (fileNames.length === 0) return null;

  const activeContent = files[activeFile] || "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="max-w-5xl mx-auto mt-6"
    >
      {/* Header Bar */}
      <div className="glass rounded-t-2xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#EF4444" }} />
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#F59E0B" }} />
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22C55E" }} />
          </div>
          <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.15em", color: "#737373" }}>
            Generated Output — {fileNames.length} files
          </span>
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(activeContent);
          }}
          style={{
            padding: "4px 12px", fontSize: "10px", textTransform: "uppercase",
            letterSpacing: "0.1em", color: "#A3A3A3", background: "rgba(255,255,255,0.05)",
            border: "1px solid #262626", borderRadius: "4px", cursor: "pointer",
          }}
        >
          Copy
        </button>
      </div>

      <div className="flex" style={{ height: "600px" }}>
        {/* File Sidebar */}
        <div style={{
          width: "240px", flexShrink: 0,
          background: "#0D0D0D", borderRight: "1px solid #1A1A1A",
          overflowY: "auto", padding: "8px 0",
        }}>
          {fileNames.map((name) => (
            <button
              key={name}
              onClick={() => setActiveFile(name)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "6px 16px", fontSize: "11px",
                fontFamily: "'JetBrains Mono', monospace",
                color: activeFile === name ? "#818CF8" : "#737373",
                background: activeFile === name ? "rgba(99, 102, 241, 0.08)" : "transparent",
                border: "none", cursor: "pointer",
                borderLeft: activeFile === name ? "2px solid #6366F1" : "2px solid transparent",
                transition: "all 0.15s",
              }}
            >
              {name.includes("/") ? (
                <>
                  <span style={{ color: "#404040" }}>{name.substring(0, name.lastIndexOf("/") + 1)}</span>
                  {name.substring(name.lastIndexOf("/") + 1)}
                </>
              ) : name}
            </button>
          ))}
        </div>

        {/* Code View */}
        <div className="code-block flex-1 overflow-auto" style={{ borderRadius: 0, border: "none" }}>
          <pre style={{ padding: "16px 20px", margin: 0, color: "#C9D1D9", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            <code>{activeContent}</code>
          </pre>
        </div>
      </div>

      {/* Bottom Bar */}
      <div style={{
        background: "#0D0D0D", borderTop: "1px solid #1A1A1A",
        padding: "8px 16px", borderRadius: "0 0 16px 16px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: "10px", color: "#404040", fontFamily: "'JetBrains Mono', monospace" }}>
          {activeFile} — {(activeContent.length / 1024).toFixed(1)} KB
        </span>
        <span style={{ fontSize: "10px", color: "#404040" }}>
          {activeContent.split("\n").length} lines
        </span>
      </div>
    </motion.div>
  );
}
