"use client";

import { motion, AnimatePresence } from "framer-motion";

interface AgentEvent {
  event: string;
  node: string;
  message: string;
  timestamp: number;
  data?: any;
  tokens_used?: number;
}

interface AgentTimelineProps {
  events: AgentEvent[];
  isRunning: boolean;
}

const AGENTS = [
  { id: "scout", name: "The Scout", icon: "🔍", description: "Crawling reference sites" },
  { id: "art_director", name: "The Art Director", icon: "🎨", description: "Synthesizing design DNA" },
  { id: "builder_nav", name: "Builder: Navigation", icon: "🧭", description: "Header, Menu, Footer" },
  { id: "builder_commerce", name: "Builder: Commerce", icon: "🛍️", description: "Hero, Products, PDP" },
  { id: "builder_checkout", name: "Builder: Checkout", icon: "💳", description: "Cart, Checkout, Atoms" },
  { id: "finisher", name: "The Finisher", icon: "✅", description: "QA & Assembly" },
];

function getAgentStatus(agentId: string, events: AgentEvent[]): "pending" | "running" | "done" | "error" {
  const agentEvents = events.filter((e) => e.node === agentId || (agentId.startsWith("builder_") && e.node === "builders"));
  if (agentEvents.length === 0) return "pending";
  const last = agentEvents[agentEvents.length - 1];
  if (last.event === "node_done" || last.event === "final") return "done";
  if (last.event === "node_error") return "error";
  return "running";
}

function getAgentMessage(agentId: string, events: AgentEvent[]): string {
  const agentEvents = events.filter((e) => e.node === agentId);
  if (agentEvents.length === 0) return "";
  return agentEvents[agentEvents.length - 1].message;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "#404040",
    running: "#F59E0B",
    done: "#22C55E",
    error: "#EF4444",
  };
  return (
    <div style={{
      width: "8px", height: "8px", borderRadius: "50%",
      background: colors[status] || "#404040",
      boxShadow: status === "running" ? `0 0 8px ${colors.running}` : "none",
    }}
      className={status === "running" ? "status-dot-pulse" : ""}
    />
  );
}

export default function AgentTimeline({ events, isRunning }: AgentTimelineProps) {
  if (events.length === 0 && !isRunning) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass rounded-2xl p-6 max-w-3xl mx-auto mt-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.2em", color: "#737373" }}>
          Agent Pipeline
        </span>
        {isRunning && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] status-dot-pulse" />
            <span style={{ fontSize: "10px", color: "#F59E0B" }}>Running</span>
          </div>
        )}
      </div>

      <div className="space-y-1">
        {AGENTS.map((agent, i) => {
          const status = getAgentStatus(agent.id, events);
          const message = getAgentMessage(agent.id, events);
          const isParallelBuilder = agent.id.startsWith("builder_");

          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 12px",
                borderRadius: "8px",
                background: status === "running" ? "rgba(245, 158, 11, 0.06)" : "transparent",
                marginLeft: isParallelBuilder ? "24px" : "0",
                borderLeft: isParallelBuilder ? "1px solid #262626" : "none",
              }}
            >
              <StatusDot status={status} />

              {/* Connector line */}
              {i < AGENTS.length - 1 && !isParallelBuilder && (
                <div style={{
                  position: "absolute",
                  left: "22px",
                  top: "100%",
                  width: "1px",
                  height: "8px",
                  background: "#262626",
                }} />
              )}

              <span style={{ fontSize: "16px", width: "24px", textAlign: "center" }}>
                {agent.icon}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "12px", fontWeight: 500, color: status === "done" ? "#22C55E" : status === "error" ? "#EF4444" : "#FAFAFA" }}>
                  {agent.name}
                </div>
                <div style={{
                  fontSize: "10px",
                  color: "#525252",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {message || agent.description}
                </div>
              </div>

              {status === "done" && (
                <span style={{ fontSize: "10px", color: "#22C55E" }}>✓</span>
              )}
              {status === "running" && (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: "#F59E0B" }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
                  <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
