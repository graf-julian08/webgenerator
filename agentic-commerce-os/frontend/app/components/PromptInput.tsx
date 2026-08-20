"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const INDUSTRIES = [
  { value: "fashion", label: "Fashion", icon: "👗" },
  { value: "automotive", label: "Automotive", icon: "🏎️" },
  { value: "technology", label: "Technology", icon: "💻" },
  { value: "beauty", label: "Beauty", icon: "✨" },
  { value: "furniture", label: "Furniture", icon: "🪑" },
  { value: "watches", label: "Watches", icon: "⌚" },
  { value: "jewelry", label: "Jewelry", icon: "💎" },
];

interface PromptInputProps {
  onSubmit: (prompt: string, industry: string) => void;
  isLoading: boolean;
}

export default function PromptInput({ onSubmit, isLoading }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [industry, setIndustry] = useState("fashion");

  const handleSubmit = () => {
    if (prompt.trim().length < 3 || isLoading) return;
    onSubmit(prompt.trim(), industry);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="glass rounded-2xl p-8 max-w-3xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-2 h-2 rounded-full bg-[#6366F1] status-dot-pulse" />
        <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.2em", color: "#737373" }}>
          Agentic Commerce OS — v1.0
        </span>
      </div>

      {/* Industry Selector */}
      <div className="mb-6">
        <label style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.15em", color: "#737373", display: "block", marginBottom: "8px" }}>
          Industry
        </label>
        <div className="flex flex-wrap gap-2">
          {INDUSTRIES.map((ind) => (
            <button
              key={ind.value}
              onClick={() => setIndustry(ind.value)}
              className="transition-all duration-200"
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                borderRadius: "6px",
                border: `1px solid ${industry === ind.value ? "#6366F1" : "#262626"}`,
                background: industry === ind.value ? "rgba(99, 102, 241, 0.15)" : "transparent",
                color: industry === ind.value ? "#818CF8" : "#A3A3A3",
                cursor: "pointer",
              }}
            >
              {ind.icon} {ind.label}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Textarea */}
      <div className="relative mb-6">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSubmit(); }}
          placeholder='Describe your shop... (e.g., "Luxury electric car brand, dark mode, editorial feel")'
          rows={4}
          maxLength={2000}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid #262626",
            borderRadius: "12px",
            padding: "16px",
            color: "#FAFAFA",
            fontSize: "14px",
            lineHeight: "1.6",
            resize: "vertical",
            outline: "none",
            fontFamily: "Inter, system-ui, sans-serif",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#6366F1")}
          onBlur={(e) => (e.target.style.borderColor = "#262626")}
        />
        <span style={{
          position: "absolute", bottom: "12px", right: "16px",
          fontSize: "10px", color: "#525252",
        }}>
          {prompt.length}/2000
        </span>
      </div>

      {/* Submit Button */}
      <motion.button
        onClick={handleSubmit}
        disabled={prompt.trim().length < 3 || isLoading}
        whileHover={!isLoading ? { scale: 1.01 } : {}}
        whileTap={!isLoading ? { scale: 0.98 } : {}}
        style={{
          width: "100%",
          padding: "14px 24px",
          background: isLoading
            ? "rgba(99, 102, 241, 0.3)"
            : "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",
          border: "none",
          borderRadius: "10px",
          color: "#FFFFFF",
          fontSize: "12px",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          cursor: isLoading ? "not-allowed" : "pointer",
          opacity: prompt.trim().length < 3 ? 0.4 : 1,
          transition: "opacity 0.2s",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Agents Working...
          </span>
        ) : (
          "Generate Commerce OS"
        )}
      </motion.button>

      <p style={{ fontSize: "10px", color: "#525252", textAlign: "center", marginTop: "12px" }}>
        ⌘ + Enter to submit • 6 AI agents will generate your luxury storefront
      </p>
    </motion.div>
  );
}
