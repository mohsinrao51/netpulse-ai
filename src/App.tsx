import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Wifi, RefreshCcw, WifiOff, Home, Image as ImageIcon, X, Mic, MicOff, Volume2, Trash2, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { getChatResponse } from './services/geminiService';
import { cn } from './lib/utils';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  image?: string; // Base64
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('netpulse_sessions');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  useEffect(() => {
    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setInput(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser.');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setInput('');
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } else {
      alert('Text-to-speech is not supported in your browser.');
    }
  };

  useEffect(() => {
    localStorage.setItem('netpulse_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentSession?.messages, isLoading]);

  const startNewSession = () => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: 'New Diagnostic Session',
      messages: [],
      createdAt: Date.now(),
    };
    setSessions([newSession, ...sessions]);
    setCurrentSessionId(newSession.id);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
    }
  };

  const CodeBlock = ({ children }: { children: any }) => {
    const [copied, setCopied] = useState(false);
    const content = String(children).replace(/\n$/, '');

    const handleCopy = () => {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="relative group/code my-4">
        <div className="flex items-center justify-between px-4 py-2 bg-black/60 border-x border-t border-white/10 rounded-t-lg text-[10px] font-mono text-slate-500 uppercase tracking-widest">
          <span>Terminal Output</span>
          <button 
            onClick={handleCopy}
            className="hover:text-white transition-colors flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="p-4 bg-black/40 border border-white/10 rounded-b-lg overflow-x-auto custom-scrollbar font-mono text-xs text-brand-accent leading-relaxed">
          <code>{children}</code>
        </pre>
      </div>
    );
  };

  const handleSendMessage = async (e?: React.FormEvent, overrideInput?: string) => {
    if (e) e.preventDefault();
    const finalInput = overrideInput || input;
    if ((!finalInput.trim() && !selectedImage) || isLoading) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      const newSession: ChatSession = {
        id: crypto.randomUUID(),
        title: 'New Diagnostic Session',
        messages: [],
        createdAt: Date.now(),
      };
      setSessions([newSession, ...sessions]);
      setCurrentSessionId(newSession.id);
      sessionId = newSession.id;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: finalInput,
      image: selectedImage || undefined,
      timestamp: Date.now(),
    };

    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        return { ...s, messages: [...s.messages, userMessage] };
      }
      return s;
    }));

    const userText = finalInput;
    const userImg = selectedImage;
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    const history = sessions.find(s => s.id === sessionId)?.messages.map(m => ({
      role: m.role,
      content: m.content,
      image: m.image
    })) || [];

    const aiResponse = await getChatResponse([...history, { role: 'user', content: userText, image: userImg || undefined }]);

    const aiMessage: Message = {
      id: crypto.randomUUID(),
      role: 'model',
      content: aiResponse,
      timestamp: Date.now(),
    };

    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        const newTitle = s.messages.length === 1 ? (userText ? userText.slice(0, 30) : 'Visual Report') + '...' : s.title;
        return {
          ...s,
          title: newTitle,
          messages: [...s.messages, aiMessage]
        };
      }
      return s;
    }));

    setIsLoading(false);
  };

  return (
    <div className="flex h-screen bg-brand-bg text-white overflow-hidden font-sans">
      {/* Sidebar - Navigation & History */}
      <aside className="w-72 bg-[#0D0D0E] border-r border-white/5 flex flex-col shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center gap-3 bg-[#121214]">
          <div className="w-8 h-8 rounded bg-brand-accent flex items-center justify-center">
            <Wifi className="w-5 h-5 text-white" />
          </div>
          <span className="font-medium text-lg tracking-tight text-white">NetPulse<span className="text-brand-accent">.ai</span></span>
        </div>

        <div className="p-4 bg-[#121214]/50">
          <button
            onClick={startNewSession}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-full text-xs font-semibold uppercase tracking-widest transition-all border border-white/10 text-white"
            id="new-session-btn"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            New Diagnosis
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-6 space-y-8">
          {/* Active Monitoring Section from Theme */}
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-4">Active Monitoring</h3>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-slate-400">Latency</span>
                  <span className="text-[11px] text-emerald-400 font-mono">14ms</span>
                </div>
                <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 w-[15%] h-full"></div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-slate-400">Packet Loss</span>
                  <span className="text-[11px] text-amber-400 font-mono">0.02%</span>
                </div>
                <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                  <div className="bg-amber-500 w-[2%] h-full"></div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-4">History</h3>
            <div className="space-y-1">
              {sessions.length === 0 && (
                <p className="text-center py-4 text-xs text-slate-600">No recent sessions</p>
              )}
              {sessions.map(session => (
                <div key={session.id} className="relative group">
                  <button
                    onClick={() => setCurrentSessionId(session.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all truncate hover:bg-white/[0.03]",
                      currentSessionId === session.id ? "bg-white/[0.05] text-white" : "text-slate-500"
                    )}
                    id={`session-${session.id}`}
                  >
                    <span className="truncate block pr-6">{session.title}</span>
                    <span className="text-[9px] opacity-40 font-mono mt-0.5 block">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                  <button
                    onClick={(e) => deleteSession(e, session.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-red-500/10 hover:text-red-500 opacity-40 group-hover:opacity-100 transition-all text-slate-400"
                    title="Delete session"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="p-6 border-t border-white/5 bg-[#0D0D0E]">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">System Operational</span>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative min-w-0 bg-[#080809]">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#121214] shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <h2 className="text-sm font-medium tracking-tight text-white flex items-center gap-2">
              <span className="text-slate-500 uppercase tracking-widest text-[10px] hidden sm:inline">Diagnostic Node:</span>
              <span className="truncate">
                {currentSession?.title || 'System Idle'}
              </span>
            </h2>
          </div>
          <button className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-semibold uppercase tracking-widest text-slate-400 hover:bg-white/10 hover:text-white transition-all">
            Export Logs
          </button>
        </header>

        {/* Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8 pb-32"
        >
          <AnimatePresence mode="popLayout">
            {!currentSessionId || currentSession?.messages.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-2xl mx-auto mt-20 text-center space-y-8"
              >
                <div className="space-y-4">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-slate-500 font-bold">Session Initiated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  <h1 className="text-4xl font-semibold tracking-tight text-white">How can I assist?</h1>
                  <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
                    NetPulse AI is currently monitoring your uplink. Describe any abnormalities or service interruptions.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto text-xs px-4">
                   {[
                     "Check Jitter on Gig0/0",
                     "DNS Resolution Failure",
                     "Packet Loss in US-EAST-1",
                     "BGP Path Convergence"
                   ].map((suggest, i) => (
                     <button 
                       key={i}
                       onClick={() => setInput(suggest)}
                       className="p-4 bg-white/[0.02] border border-white/10 rounded-xl hover:bg-white/[0.05] hover:border-brand-accent/30 transition-all text-left text-slate-400 hover:text-white"
                       id={`suggestion-${i}`}
                     >
                       {suggest}
                     </button>
                   ))}
                </div>
              </motion.div>
            ) : (
              currentSession.messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-4 max-w-4xl mx-auto",
                    message.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded border flex items-center justify-center shrink-0 uppercase text-[10px] font-bold",
                    message.role === 'user' ? "bg-slate-800 border-white/10 text-slate-400" : "bg-brand-accent/20 border-brand-accent/30 text-brand-accent"
                  )}>
                    {message.role === 'user' ? "JD" : "AI"}
                  </div>
                  <div className={cn(
                    "space-y-4 max-w-[85%] sm:max-w-[80%]",
                    message.role === 'user' ? "items-end text-right" : "items-start text-left"
                  )}>
                    {message.image && (
                      <div className="rounded-xl overflow-hidden border border-white/10 ring-1 ring-white/5">
                        <img src={message.image} alt="Uploaded diagnostic" className="max-h-60 w-auto object-contain" />
                      </div>
                    )}
                    <div className={cn(
                      "px-5 py-4 rounded-2xl text-sm leading-relaxed relative group/msg",
                      message.role === 'user' 
                        ? "bg-brand-accent/10 border border-brand-accent/20 text-blue-50 rounded-tr-none" 
                        : "bg-white/[0.03] border border-white/5 rounded-tl-none text-slate-300"
                    )}>
                      <div className={cn(
                        "prose prose-sm max-w-none prose-p:leading-relaxed break-words",
                        message.role === 'user' ? "prose-invert" : "prose-slate"
                      )}>
                        <ReactMarkdown
                          components={{
                            code({ node, className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              return match || !node?.position ? (
                                <CodeBlock>{children}</CodeBlock>
                              ) : (
                                <code className={cn("bg-black/20 px-1 rounded", className)} {...props}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                      
                      {message.role === 'model' && (
                        <button 
                          onClick={() => speakText(message.content)}
                          className="absolute -right-10 top-2 p-2 rounded-lg bg-white/5 border border-white/10 opacity-0 group-hover/msg:opacity-100 transition-opacity hover:bg-white/10 text-slate-400 hover:text-white"
                          title="Listen to response"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}

            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-4 max-w-4xl mx-auto"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-accent flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 animate-pulse" />
                </div>
                <div className="flex items-center gap-1.5 px-4 h-10 bg-zinc-900/50 rounded-2xl rounded-tl-sm border border-zinc-800">
                  <div className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="p-8 bg-gradient-to-t from-[#0D0D0E] to-transparent">
          <form 
            onSubmit={handleSendMessage}
            className="max-w-3xl mx-auto relative group"
          >
            <AnimatePresence>
              {selectedImage && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full mb-4 left-0"
                >
                  <div className="relative p-2 bg-[#121214] border border-white/10 rounded-xl shadow-2xl">
                    <img src={selectedImage} className="h-32 rounded-lg" alt="Preview" />
                    <button 
                      type="button"
                      onClick={clearImage}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative flex items-center bg-[#121214] border border-white/10 rounded-xl focus-within:border-brand-accent/50 transition-all duration-300">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="pl-4 pr-2 text-slate-500 hover:text-brand-accent transition-colors"
                title="Upload diagnostic image"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={toggleRecording}
                className={cn(
                  "px-2 transition-colors",
                  isRecording ? "text-red-500 animate-pulse" : "text-slate-500 hover:text-brand-accent"
                )}
                title={isRecording ? "Stop recording" : "Explain with voice"}
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about a node, IP, or diagnostic procedure..."
                className="flex-1 bg-transparent border-none focus:ring-0 rounded-xl px-2 py-4 text-sm placeholder:text-slate-600 text-white"
                id="message-input"
              />
              <button
                type="submit"
                disabled={(!input.trim() && !selectedImage) || isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-brand-accent text-white p-2.5 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-all"
                id="send-button"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </form>
          <div className="mt-4 flex justify-center gap-6">
            {["Trace Route", "Ping Node", "BGP Status"].map((cmd, i) => (
              <button 
                key={i} 
                onClick={() => {
                  const query = `Initiate ${cmd} command sequence. Please verify requirements.`;
                  handleSendMessage(undefined, query); 
                }}
                className="text-[10px] text-slate-500 uppercase tracking-widest hover:text-white transition-colors font-bold cursor-pointer"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* Info Panel - Hidden on smaller screens */}
      <aside className="hidden xl:flex w-80 bg-[#0D0D0E] border-l border-white/5 flex-col shrink-0 overflow-hidden">
        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-4">Recent Incidents</h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-1 bg-red-500 rounded-full"></div>
                <div>
                  <div className="text-xs text-white font-medium">DNS Resolution Failure</div>
                  <div className="text-[10px] text-slate-500">Node: US-EAST-1 • 14:02</div>
                </div>
              </div>
              <div className="flex gap-3 opacity-60">
                <div className="w-1 bg-emerald-500 rounded-full"></div>
                <div>
                  <div className="text-xs text-white font-medium">DHCP Renewal Successful</div>
                  <div className="text-[10px] text-slate-500">Node: GW-LOCAL • 12:45</div>
                </div>
              </div>
            </div>
          </section>

          <section>
             <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-4">Diagnostic Tools</h3>
             <div className="space-y-2">
                {[
                  "Spectral Analysis",
                  "TCP Handshake Inspect",
                  "Jumbo Frame Audit",
                  "MTU Path Discovery"
                ].map((tool, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-lg border border-white/5 hover:border-white/10 transition-colors cursor-pointer group">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-brand-accent transition-colors" />
                    <span className="text-[11px] text-slate-400 group-hover:text-slate-200">{tool}</span>
                  </div>
                ))}
             </div>
          </section>

          <div className="mt-8 p-4 bg-blue-600/5 border border-blue-500/10 rounded-xl">
             <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-2">Internal Note</p>
             <p className="text-[11px] text-slate-500 leading-relaxed italic">
               "Confirmed: High CRC errors detected. Strongly suggests physical layer issue on Rack 4."
             </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
