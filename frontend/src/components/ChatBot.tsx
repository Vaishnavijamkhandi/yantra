import { useState, useRef, useEffect } from "react";
import { sendChatMessage, type ChatMessage } from "../services/api";

const DEFAULT_PROMPTS = [
  "What are our highest risk assets right now?",
  "How should we remediate CVE-2023-20198?",
  "Explain CISA KEV vs EPSS scores",
  "Recommend network segmentation for PACS",
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative my-2 bg-[#1c1917] text-emerald-400 font-mono text-[11px] p-2.5 rounded-lg border border-stone-800 overflow-x-auto">
      <div className="flex justify-between items-center pb-1 mb-1.5 border-b border-stone-800 text-[10px] text-stone-400">
        <span>CLI MITIGATION COMMAND</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="text-stone-400 hover:text-white px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-[10px] font-mono cursor-pointer transition"
        >
          {copied ? "✓ Copied" : "📋 Copy Command"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "**Welcome to CyberSentra AI.**\n\nI am your critical infrastructure copilot powered by Google Gemini. I can assist with vulnerability triaging, CISA KEV alerts, multi-factor risk formulas, and emergency mitigation playbooks.\n\nClick **✨ Ask Gemini** on any assessment row to generate instant interactive remediation steps.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeModel, setActiveModel] = useState<string>("gemini-3.5-flash");
  const [activeContext, setActiveContext] = useState<{
    cveId?: string;
    assetId?: number | string;
    software?: string;
  } | null>(null);
  const [interactivePrompts, setInteractivePrompts] = useState<string[]>(DEFAULT_PROMPTS);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, loading]);

  async function handleSend(userText?: string) {
    const textToSend = userText || input;
    if (!textToSend.trim() || loading) return;

    const currentHistory = messagesRef.current.slice(1);
    const userMessage: ChatMessage = { role: "user", content: textToSend.trim() };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await sendChatMessage(textToSend.trim(), currentHistory);
      if (response.model) {
        setActiveModel(response.model);
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "⚠️ **Network Notice**: Unable to reach Gemini API directly. Please check backend connectivity.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Listen for custom event triggered from Assessment table rows or modal
  useEffect(() => {
    const handleCopilotEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        prompt: string;
        cveId?: string;
        assetId?: number | string;
        software?: string;
        interactivePrompts?: string[];
      }>;
      if (!customEvent.detail) return;

      const { prompt, cveId, assetId, software, interactivePrompts: followUps } = customEvent.detail;
      setIsOpen(true);

      if (cveId || assetId) {
        setActiveContext({ cveId, assetId, software });
      }

      if (followUps && followUps.length > 0) {
        setInteractivePrompts(followUps);
      } else if (cveId) {
        setInteractivePrompts([
          `Give me the exact rollback commands for ${cveId}`,
          `Can we block ${cveId} at the network firewall without rebooting?`,
          `Is ${cveId} weaponized by ransomware in CISA KEV?`,
          `Draft an executive incident ticket for Asset #${assetId}`,
        ]);
      }

      // Automatically send the prompt
      handleSend(prompt);
    };

    window.addEventListener("cybersentra:open-ai-copilot", handleCopilotEvent);
    return () => {
      window.removeEventListener("cybersentra:open-ai-copilot", handleCopilotEvent);
    };
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleClear() {
    setMessages([
      {
        role: "assistant",
        content:
          "**Chat history cleared.** Ready for new cyber-risk inquiries, CVE investigations, or incident playbooks.",
      },
    ]);
    setActiveContext(null);
    setInteractivePrompts(DEFAULT_PROMPTS);
  }

  // Rich Content Parser: parses code blocks, inline code, bold, lists, and headings
  function renderFormattedContent(text: string) {
    // Check for multi-line code blocks ``` ... ```
    if (text.includes("```")) {
      const segments = text.split(/(```[\s\S]*?```)/g);
      return segments.map((seg, sIdx) => {
        if (seg.startsWith("```") && seg.endsWith("```")) {
          const lines = seg.slice(3, -3).trim().split("\n");
          // Remove optional language identifier on first line (e.g. ```bash)
          const firstLine = lines[0].trim();
          const codeLines =
            ["bash", "sh", "cli", "shell", "cisco", "json", "python"].includes(firstLine.toLowerCase())
              ? lines.slice(1)
              : lines;
          return <CodeBlock key={sIdx} code={codeLines.join("\n")} />;
        }
        return <div key={sIdx}>{renderMarkdownLines(seg)}</div>;
      });
    }

    return renderMarkdownLines(text);
  }

  function renderMarkdownLines(text: string) {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // Heading 3 / 2
      if (trimmed.startsWith("### ")) {
        return (
          <h4 key={idx} className="font-mono font-bold text-stone-900 mt-2 mb-1 text-xs uppercase tracking-wide">
            {trimmed.slice(4)}
          </h4>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <h3 key={idx} className="font-mono font-black text-[#800020] mt-2.5 mb-1 text-sm tracking-tight">
            {trimmed.slice(3)}
          </h3>
        );
      }

      // Inline formatting (bold and backtick code)
      const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);
      const renderedParts = parts.map((part, pIdx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={pIdx} className="font-bold text-stone-900">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={pIdx}
              className="bg-[#ede5d8] text-[#800020] px-1.5 py-0.5 rounded font-mono text-[11px] font-bold"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      });

      // Bullet List
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        return (
          <div key={idx} className="flex items-start gap-1.5 ml-2 my-0.5">
            <span className="text-[#800020] font-bold">•</span>
            <span className="flex-1">{renderedParts}</span>
          </div>
        );
      }

      // Numbered List
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        return (
          <div key={idx} className="flex items-start gap-1.5 ml-2 my-0.5">
            <span className="text-[#800020] font-mono font-bold">{numMatch[1]}.</span>
            <span className="flex-1">{renderedParts}</span>
          </div>
        );
      }

      if (trimmed === "") {
        return <div key={idx} className="h-1.5" />;
      }

      return (
        <p key={idx} className="my-0.5 leading-relaxed">
          {renderedParts}
        </p>
      );
    });
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans">
      {/* Floating Toggle Pill / Bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2.5 px-4 py-3 bg-[#800020] hover:bg-[#66001a] text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border border-[#800020]/40"
          title="Open CyberSentra AI Copilot"
        >
          <span className="text-lg">🛡️</span>
          <span className="text-xs font-mono font-bold tracking-wide">
            CyberSentra AI
          </span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </span>
        </button>
      )}

      {/* Floating Chat Modal Window */}
      {isOpen && (
        <div className="w-[390px] sm:w-[480px] h-[610px] bg-[#fbf9f5] rounded-2xl border border-[#d6ccbe] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="px-4 py-3 bg-[#800020] text-white flex items-center justify-between border-b border-[#66001a]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-base border border-white/20">
                🛡️
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-mono font-black tracking-wider uppercase">
                    CyberSentra AI
                  </h3>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-white/20 text-white">
                    {activeModel.replace("models/", "")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-white/80 font-mono">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span>Enclave Security Advisor · Online</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleClear}
                title="Clear conversation"
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition cursor-pointer text-xs font-mono"
              >
                Clear
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Minimize chat"
                className="w-7 h-7 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded-md transition cursor-pointer text-sm font-bold"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Active Finding Context Pill */}
          {activeContext && (
            <div className="px-3.5 py-2 bg-[#f5f0e6] border-b border-[#e5ded0] flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 truncate">
                <span className="text-[#800020] font-bold">🎯 Targeted Finding:</span>
                <span className="bg-white px-2 py-0.5 rounded border border-[#d6ccbe] text-[#800020] font-bold">
                  {activeContext.cveId}
                </span>
                <span className="text-stone-600 truncate">
                  Asset #{activeContext.assetId} ({activeContext.software || "System"})
                </span>
              </div>
              <button
                onClick={() => setActiveContext(null)}
                className="text-stone-400 hover:text-stone-700 ml-2 text-xs"
                title="Clear active context"
              >
                ✕
              </button>
            </div>
          )}

          {/* Chat Message Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-[#fbf9f5]">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex flex-col ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[10px] font-mono text-stone-500 font-bold uppercase">
                    {msg.role === "user" ? "Security Analyst" : "CyberSentra Copilot"}
                  </span>
                </div>
                <div
                  className={`max-w-[92%] text-xs p-3.5 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-[#800020] text-white rounded-tr-none shadow-xs whitespace-pre-wrap font-sans"
                      : "bg-[#faf7f2] text-stone-800 border border-[#e5ded0] rounded-tl-none shadow-xs font-sans"
                  }`}
                >
                  {msg.role === "user" ? msg.content : renderFormattedContent(msg.content)}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[10px] font-mono text-stone-500 font-bold uppercase">
                    CyberSentra Copilot
                  </span>
                </div>
                <div className="bg-[#faf7f2] border border-[#e5ded0] text-stone-700 text-xs px-3.5 py-2.5 rounded-2xl rounded-tl-none flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#800020] animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#800020] animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#800020] animate-bounce [animation-delay:0.4s]" />
                  <span className="text-[11px] font-mono text-stone-500 ml-1">
                    Analyzing technical mitigation steps...
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Interactive Follow-Up Chips */}
          <div className="px-3 py-2 bg-[#f4efe6] border-t border-[#e5ded0] flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            <span className="w-full text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1">
              <span>⚡</span> Interactive Inquiries:
            </span>
            {interactivePrompts.map((prompt, pIdx) => (
              <button
                key={pIdx}
                onClick={() => handleSend(prompt)}
                disabled={loading}
                className="text-[11px] font-mono bg-white hover:bg-[#800020] hover:text-white text-stone-700 px-2.5 py-1 rounded-full border border-[#d6ccbe] transition cursor-pointer text-left truncate max-w-full disabled:opacity-50"
              >
                💬 {prompt}
              </button>
            ))}
          </div>

          {/* Input & Action Bar */}
          <div className="p-3 bg-[#faf7f2] border-t border-[#e5ded0]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask follow-up questions, CLI commands, rollback steps..."
                rows={2}
                className="flex-1 bg-white border border-[#d6ccbe] focus:border-[#800020] focus:ring-1 focus:ring-[#800020] rounded-xl px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 resize-none outline-none font-sans"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="h-10 px-4 bg-[#800020] hover:bg-[#66001a] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-mono font-bold transition flex items-center justify-center cursor-pointer shadow-xs"
              >
                Send ➔
              </button>
            </form>
            <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono mt-1.5 px-1">
              <span>Press Enter to send · Shift+Enter for newline</span>
              <span className="text-emerald-700 font-bold">🔒 Encrypted Enclave</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
