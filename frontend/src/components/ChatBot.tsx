import { useState, useRef, useEffect } from "react";
import { sendChatMessage, type ChatMessage } from "../services/api";

const QUICK_PROMPTS = [
  "What are our highest risk assets right now?",
  "How should we remediate CVE-2023-20198?",
  "Explain CISA KEV vs EPSS scores",
  "Recommend network segmentation for PACS",
];

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "**Welcome to CyberSentra AI.**\n\nI am your critical infrastructure copilot powered by Google Gemini. I can assist with vulnerability triaging, CISA KEV alerts, multi-factor risk formulas, and emergency mitigation playbooks.\n\nHow can I support your operational defense today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeModel, setActiveModel] = useState<string>("gemini-3.5-flash");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  async function handleSend(userText?: string) {
    const textToSend = userText || input;
    if (!textToSend.trim() || loading) return;

    const userMessage: ChatMessage = { role: "user", content: textToSend.trim() };
    const updatedHistory = [...messages, userMessage];
    setMessages(updatedHistory);
    setInput("");
    setLoading(true);

    try {
      // Send message to Gemini API backend
      const response = await sendChatMessage(textToSend.trim(), updatedHistory.slice(1));
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
            "⚠️ **Network Notice**: Unable to reach Gemini API directly. Please ensure your backend is active or check connectivity.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

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
          "**Chat history cleared.** Ready for new cyber-risk inquiries or incident playbooks.",
      },
    ]);
  }

  // Format text with bold and list markers
  function formatContent(text: string) {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      // Bold rendering
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const renderedLine = parts.map((part, pIdx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={pIdx} className="font-bold text-stone-900">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) {
        return (
          <div key={idx} className="flex items-start gap-1.5 ml-2 my-0.5">
            <span className="text-[#800020] font-bold">•</span>
            <span>{renderedLine}</span>
          </div>
        );
      }

      if (line.trim() === "") {
        return <div key={idx} className="h-2" />;
      }

      return (
        <p key={idx} className="my-0.5 leading-relaxed">
          {renderedLine}
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
        <div className="w-[380px] sm:w-[440px] h-[580px] bg-[#fbf9f5] rounded-2xl border border-[#d6ccbe] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
                  className={`max-w-[88%] text-xs p-3.5 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-[#800020] text-white rounded-tr-none shadow-xs"
                      : "bg-[#faf7f2] text-stone-800 border border-[#e5ded0] rounded-tl-none shadow-xs"
                  }`}
                >
                  {formatContent(msg.content)}
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
                    Analyzing threat intel...
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts (Only if 2 or fewer messages) */}
          {messages.length <= 2 && (
            <div className="px-4 py-2 bg-[#f4efe6] border-t border-[#e5ded0] flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  disabled={loading}
                  className="text-[11px] font-mono bg-white hover:bg-[#800020] hover:text-white text-stone-700 px-2.5 py-1 rounded-full border border-[#d6ccbe] transition cursor-pointer text-left"
                >
                  💬 {prompt}
                </button>
              ))}
            </div>
          )}

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
                placeholder="Ask about CVEs, exploitability, playbooks..."
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
