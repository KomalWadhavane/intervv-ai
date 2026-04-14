import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, Send, ChevronRight, BrainCircuit, History, LayoutDashboard, 
  Star, CheckCircle2, AlertCircle, Loader2, ArrowLeft, LogOut, 
  User as UserIcon, Lock, Mail, Download, Code, ListChecks, BarChart3,
  MessageSquare, X, Minus
} from 'lucide-react';
import { generateInterviewQuestions, getFeedback, getChatResponse, type InterviewQuestion, type Feedback } from './lib/gemini';
import { cn } from './lib/utils';
import Markdown from 'react-markdown';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism-tomorrow.css';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface User {
  id: string;
  email: string;
  name: string;
}

interface InterviewSession {
  id: string;
  userId: string;
  role: string;
  level: string;
  questions: InterviewQuestion[];
  answers: string[];
  feedbacks: Feedback[];
  createdAt: string;
}

const BackgroundBlobs = () => (
  <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
    <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-vibrant-indigo/20 rounded-full blur-[120px] animate-float" />
    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-vibrant-pink/20 rounded-full blur-[120px] animate-float-delayed" />
    <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-vibrant-cyan/10 rounded-full blur-[100px] animate-float-slow" />
    <div className="absolute bottom-[20%] left-[10%] w-[30%] h-[30%] bg-vibrant-amber/10 rounded-full blur-[100px] animate-float" />
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'auth' | 'landing' | 'setup' | 'interview' | 'results' | 'dashboard' | 'coding-setup'>('auth');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  
  const [role, setRole] = useState('');
  const [level, setLevel] = useState('Mid-Level');
  const [description, setDescription] = useState('');
  const [codingLang, setCodingLang] = useState('JavaScript');
  const [codingDiff, setCodingDiff] = useState('Intermediate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [history, setHistory] = useState<InterviewSession[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Chatbot State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
    { role: 'model', text: "Hi! I'm your IntervAI mentor. How can I help you with your interview prep today?" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('user');
      if (savedUser && savedUser !== 'undefined') {
        setUser(JSON.parse(savedUser));
        setView('landing');
      }
    } catch (err) {
      console.error("Failed to parse saved user:", err);
      localStorage.removeItem('user');
    }
  }, []);

  useEffect(() => {
    if (view === 'interview' && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else if (view !== 'interview' && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [view]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleVoiceMode = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition is not supported in your browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setUserAnswers(prev => {
        const updated = [...prev];
        updated[currentQuestionIndex] = (updated[currentQuestionIndex] || '') + (updated[currentQuestionIndex] ? ' ' : '') + transcript;
        return updated;
      });
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/interviews?userId=${user?.id}`);
      const data = await res.json();
      setHistory(data);
    } catch (err) { console.error(err); }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUser(data);
      localStorage.setItem('user', JSON.stringify(data));
      setView('landing');
    } catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    setView('auth');
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsChatLoading(true);

    try {
      const geminiHistory = chatMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));
      const response = await getChatResponse(userMessage, geminiHistory);
      setChatMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'model', text: "Sorry, I'm having trouble connecting right now." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleStartInterview = async (mode: 'full' | 'coding' = 'full') => {
    if (mode === 'full' && (!role || !description)) return;
    setLoading(true);
    setError(null);
    try {
      const generatedQuestions = await generateInterviewQuestions(
        role, 
        description, 
        level, 
        mode, 
        codingLang, 
        codingDiff
      );
      if (!generatedQuestions || generatedQuestions.length === 0) {
        throw new Error("No questions were generated. Please try again.");
      }
      setQuestions(generatedQuestions);
      setUserAnswers(generatedQuestions.map(q => q.type === 'coding' ? q.initialCode || '' : ''));
      setSession({
        id: Date.now().toString(),
        userId: user!.id,
        role: mode === 'coding' ? `Coding Practice (${codingLang})` : role,
        level: mode === 'coding' ? codingDiff : level,
        questions: generatedQuestions,
        answers: [],
        feedbacks: [],
        createdAt: new Date().toISOString()
      });
      setView('interview');
      setCurrentQuestionIndex(0);
      setTimer(0);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate interview. Please check your connection and try again.");
    }
    finally { setLoading(false); }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    const updatedAnswers = [...userAnswers];
    updatedAnswers[currentQuestionIndex] = "Skipped";
    setUserAnswers(updatedAnswers);
    
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      finishInterview(updatedAnswers);
    }
  };

  const handleSubmitAnswer = async () => {
    const currentAnswer = userAnswers[currentQuestionIndex];
    if (!currentAnswer && questions[currentQuestionIndex].type !== 'mcq') return;
    
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      finishInterview(userAnswers);
    }
  };

  const finishInterview = async (finalAnswers: string[]) => {
    setLoading(true);
    try {
      // Get all feedback at once for a better summary experience
      const feedbackPromises = questions.map((q, i) => getFeedback(q, finalAnswers[i]));
      const feedbacks = await Promise.all(feedbackPromises);
      
      const finalSession = {
        ...session!,
        answers: finalAnswers,
        feedbacks: feedbacks
      };
      
      setSession(finalSession);
      if (timerRef.current) clearInterval(timerRef.current);
      
      await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalSession)
      });
      fetchHistory();
      setView('results');
    } catch (err) {
      console.error(err);
      setError("Failed to process results. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!resultsRef.current) return;
    const canvas = await html2canvas(resultsRef.current);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Interview_Report_${session?.role}.pdf`);
  };

  const chartData = history.map(h => ({
    date: new Date(h.createdAt).toLocaleDateString(),
    score: (h.feedbacks.reduce((acc, f) => acc + f.score, 0) / h.feedbacks.length).toFixed(1)
  })).reverse();

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-indigo-500/30 overflow-x-hidden">
      <BackgroundBlobs />

      {user && (
        <nav className="border-b border-white/5 px-6 py-4 flex items-center justify-between sticky top-0 bg-black/20 backdrop-blur-xl z-50">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('landing')}>
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <span className="font-black text-2xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">IntervAI</span>
          </div>
          <div className="flex items-center gap-4 md:gap-8">
            <button onClick={() => setView('dashboard')} className="text-sm font-bold text-white/60 hover:text-white transition-all flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Dashboard
            </button>
            <div className="h-4 w-[1px] bg-white/10 hidden md:block" />
            <div className="flex items-center gap-3">
              <div className="text-right hidden md:block">
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Welcome back</p>
                <p className="text-sm font-black">{user.name}</p>
              </div>
              <button onClick={handleLogout} className="p-2 rounded-full bg-white/5 hover:bg-red-500/10 hover:text-red-500 transition-all">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </nav>
      )}

      <main className="max-w-6xl mx-auto px-6 py-8 relative z-10">
        <AnimatePresence mode="wait">
          {view === 'auth' && (
            <motion.div key="auth" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-md mx-auto py-20">
              <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem] backdrop-blur-2xl space-y-8">
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-indigo-500/40">
                    <BrainCircuit className="w-10 h-10" />
                  </div>
                  <h2 className="text-3xl font-black tracking-tight">{authMode === 'login' ? 'Welcome Back' : 'Join IntervAI'}</h2>
                  <p className="text-white/40 font-medium">Elevate your career with AI prep.</p>
                </div>
                <form onSubmit={handleAuth} className="space-y-4">
                  {authMode === 'signup' && (
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                      <input type="text" placeholder="Full Name" required className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:border-indigo-500 transition-all" value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} />
                    </div>
                  )}
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                    <input type="email" placeholder="Email Address" required className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:border-indigo-500 transition-all" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                    <input type="password" placeholder="Password" required className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:border-indigo-500 transition-all" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
                  </div>
                  <button type="submit" disabled={loading} className="w-full bg-indigo-500 hover:bg-indigo-400 text-white py-4 rounded-2xl font-black text-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
                  </button>
                </form>
                <p className="text-center text-white/40 font-bold text-sm">
                  {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}
                  <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="ml-2 text-indigo-400 hover:underline">
                    {authMode === 'login' ? 'Sign Up' : 'Sign In'}
                  </button>
                </p>
              </div>
            </motion.div>
          )}

          {view === 'landing' && (
            <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 space-y-20">
              <div className="text-center space-y-8">
                <h1 className="text-7xl md:text-9xl font-black tracking-tighter leading-[0.85] bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40">
                  PRACTICE <br /> <span className="text-indigo-500">SMARTER.</span>
                </h1>
                <p className="text-xl text-white/40 max-w-2xl mx-auto font-medium">
                  The ultimate AI-driven platform for technical, MCQ, and coding interviews.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <button onClick={() => setView('setup')} className="bg-white text-black px-10 py-5 rounded-2xl font-black text-xl hover:scale-105 transition-all flex items-center gap-2 shadow-2xl shadow-white/10">
                    Get Started <ChevronRight />
                  </button>
                  <button onClick={() => setView('dashboard')} className="bg-white/5 border border-white/10 px-10 py-5 rounded-2xl font-black text-xl hover:bg-white/10 transition-all">
                    View Dashboard
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { id: 'setup', icon: ListChecks, title: "MCQ Mastery", desc: "Quick conceptual checks to sharpen your fundamentals.", color: "text-blue-400", border: "hover:border-blue-500/50", glow: "group-hover:shadow-blue-500/20" },
                  { id: 'coding-setup', icon: Code, title: "Live Coding", desc: "Solve real-world problems in our integrated code editor.", color: "text-purple-400", border: "hover:border-purple-500/50", glow: "group-hover:shadow-purple-500/20" },
                  { id: 'setup', icon: BrainCircuit, title: "Deep Feedback", desc: "AI analysis of your logic, style, and technical depth.", color: "text-indigo-400", border: "hover:border-indigo-500/50", glow: "group-hover:shadow-indigo-500/20" }
                ].map((f, i) => (
                  <div 
                    key={i} 
                    onClick={() => setView(f.id as any)}
                    className={cn(
                      "p-10 rounded-[2.5rem] bg-white/5 border border-white/10 transition-all group cursor-pointer hover:bg-white/10 active:scale-95 shadow-xl",
                      f.border,
                      f.glow
                    )}
                  >
                    <f.icon className={cn("w-12 h-12 mb-6 transition-transform group-hover:scale-110", f.color)} />
                    <h3 className="text-2xl font-black mb-4">{f.title}</h3>
                    <p className="text-white/40 font-medium leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'setup' && (
            <motion.div key="setup" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl mx-auto space-y-10 py-12">
              <div className="space-y-2">
                <h2 className="text-5xl font-black tracking-tight">Configure Session</h2>
                <p className="text-white/40 text-lg font-medium">Tailor the AI to your specific career goals.</p>
              </div>
              <div className="bg-white/5 border border-white/10 p-10 rounded-[3rem] space-y-8 backdrop-blur-xl shadow-2xl shadow-indigo-500/5">
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Target Role</label>
                  <input type="text" placeholder="e.g. Full Stack Developer" className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500 transition-all text-lg font-bold" value={role} onChange={e => setRole(e.target.value)} />
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Experience</label>
                  <div className="grid grid-cols-3 gap-4">
                    {['Junior', 'Mid-Level', 'Senior'].map(l => (
                      <button key={l} onClick={() => setLevel(l)} className={cn("py-4 rounded-2xl border font-black transition-all", level === l ? "bg-gradient-to-r from-indigo-600 to-purple-600 border-transparent shadow-lg shadow-indigo-500/20" : "bg-white/5 border-white/10 text-white/40 hover:border-white/20")}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Job Description</label>
                  <textarea rows={4} placeholder="Paste requirements here..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500 transition-all resize-none text-lg" value={description} onChange={e => setDescription(e.target.value)} />
                </div>

                {error && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-bold flex items-center gap-3">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                  </div>
                )}

                <button onClick={() => handleStartInterview('full')} disabled={loading || !role || !description} className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white py-5 rounded-2xl font-black text-xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/20">
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      <span>Generating Questions...</span>
                    </>
                  ) : 'Generate Interview'}
                </button>
              </div>
            </motion.div>
          )}

          {view === 'coding-setup' && (
            <motion.div key="coding-setup" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl mx-auto space-y-10 py-12">
              <div className="space-y-2">
                <h2 className="text-5xl font-black tracking-tight">Coding Practice</h2>
                <p className="text-white/40 text-lg font-medium">Master algorithms and logic in your favorite language.</p>
              </div>
              <div className="bg-white/5 border border-white/10 p-10 rounded-[3rem] space-y-8 backdrop-blur-xl shadow-2xl shadow-purple-500/5">
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Difficulty Level</label>
                  <div className="grid grid-cols-3 gap-4">
                    {['Easy', 'Intermediate', 'Advance'].map(d => (
                      <button key={d} onClick={() => setCodingDiff(d)} className={cn("py-4 rounded-2xl border font-black transition-all", codingDiff === d ? "bg-gradient-to-r from-blue-600 to-indigo-600 border-transparent shadow-lg shadow-blue-500/20" : "bg-white/5 border-white/10 text-white/40 hover:border-white/20")}>{d}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-[0.2em] text-indigo-400">Choose Language</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['Java', 'Python', 'C', 'C++', 'JavaScript'].map(lang => (
                      <button key={lang} onClick={() => setCodingLang(lang)} className={cn("py-4 rounded-2xl border font-black transition-all", codingLang === lang ? "bg-gradient-to-r from-purple-600 to-pink-600 border-transparent shadow-lg shadow-purple-500/20" : "bg-white/5 border-white/10 text-white/40 hover:border-white/20")}>{lang}</button>
                    ))}
                  </div>
                </div>
                
                {error && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-bold flex items-center gap-3">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                  </div>
                )}

                <button onClick={() => handleStartInterview('coding')} disabled={loading} className="w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 text-white py-5 rounded-2xl font-black text-xl hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-blue-500/20">
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      <span>Preparing Challenges...</span>
                    </>
                  ) : 'Start Coding Practice'}
                </button>
                <button onClick={() => setView('landing')} className="w-full text-white/40 font-bold hover:text-white transition-colors">Cancel</button>
              </div>
            </motion.div>
          )}

          {view === 'interview' && (
            <motion.div key="interview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto py-8 space-y-8">
              <div className="flex items-center justify-between bg-white/5 p-6 rounded-[2rem] border border-white/10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                    {questions[currentQuestionIndex].type === 'mcq' ? <ListChecks className="text-indigo-400" /> : questions[currentQuestionIndex].type === 'coding' ? <Code className="text-purple-400" /> : <BrainCircuit className="text-blue-400" />}
                  </div>
                  <div>
                    <h3 className="font-black text-lg uppercase tracking-tight">{questions[currentQuestionIndex].type} Question</h3>
                    <p className="text-white/40 text-sm font-bold">
                      {questions[currentQuestionIndex].context ? `${questions[currentQuestionIndex].context} • ` : ''}
                      Step {currentQuestionIndex + 1} of {questions.length}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {questions.map((_, i) => (
                    <div key={i} className={cn("h-1.5 w-8 rounded-full transition-all", i <= currentQuestionIndex ? "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" : "bg-white/10")} />
                  ))}
                </div>
              </div>

              <div className="flex justify-center">
                <div className="bg-white/5 border border-white/10 px-6 py-2 rounded-full flex items-center gap-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="font-mono text-xl font-black tracking-widest">{formatTime(timer)}</span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-[3rem] p-12 space-y-10 relative overflow-hidden">
                <div className="space-y-4">
                  <h2 className="text-3xl font-black leading-tight">{questions[currentQuestionIndex].question}</h2>
                </div>

                <div className="space-y-6">
                  {questions[currentQuestionIndex].type === 'mcq' ? (
                    <div className="grid grid-cols-1 gap-4">
                      {questions[currentQuestionIndex].options?.map((opt, i) => (
                        <button 
                          key={i} 
                          onClick={() => {
                            const updated = [...userAnswers];
                            updated[currentQuestionIndex] = i.toString();
                            setUserAnswers(updated);
                          }} 
                          className={cn(
                            "p-6 rounded-2xl border text-left font-bold transition-all flex items-center justify-between group", 
                            userAnswers[currentQuestionIndex] === i.toString() ? "bg-indigo-500/20 border-indigo-500 text-white" : "bg-white/5 border-white/10 text-white/60 hover:border-white/30"
                          )}
                        >
                          {opt}
                          <div className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all", userAnswers[currentQuestionIndex] === i.toString() ? "border-white bg-white" : "border-white/20")}>
                            {userAnswers[currentQuestionIndex] === i.toString() && <div className="w-2 h-2 bg-indigo-500 rounded-full" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : questions[currentQuestionIndex].type === 'coding' ? (
                    <div className="rounded-2xl border border-white/10 overflow-hidden bg-[#011627]">
                      <Editor
                        value={userAnswers[currentQuestionIndex] || ''}
                        onValueChange={code => {
                          const updated = [...userAnswers];
                          updated[currentQuestionIndex] = code;
                          setUserAnswers(updated);
                        }}
                        highlight={code => highlight(code, languages.js, 'javascript')}
                        padding={20}
                        style={{ fontFamily: '"Fira code", "Fira Mono", monospace', fontSize: 16, minHeight: '300px' }}
                      />
                    </div>
                  ) : (
                    <textarea 
                      rows={6} 
                      placeholder="Type your detailed answer here..." 
                      className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-8 focus:outline-none focus:border-indigo-500 transition-all text-xl resize-none" 
                      value={userAnswers[currentQuestionIndex] || ''} 
                      onChange={e => {
                        const updated = [...userAnswers];
                        updated[currentQuestionIndex] = e.target.value;
                        setUserAnswers(updated);
                      }} 
                    />
                  )}

                  <div className="flex items-center justify-between pt-6">
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={handlePrevious}
                        disabled={currentQuestionIndex === 0}
                        className="flex items-center gap-2 text-white/40 hover:text-white transition-all font-black uppercase tracking-widest text-xs disabled:opacity-0"
                      >
                        <ArrowLeft className="w-4 h-4" /> Back
                      </button>
                      <button 
                        onClick={toggleVoiceMode}
                        className={cn(
                          "flex items-center gap-2 transition-all font-black uppercase tracking-widest text-xs px-4 py-2 rounded-full border",
                          isListening 
                            ? "bg-red-500/20 border-red-500 text-red-500 animate-pulse" 
                            : "text-white/40 hover:text-white border-white/10 hover:bg-white/5"
                        )}
                      >
                        <Mic className={cn("w-4 h-4", isListening && "animate-bounce")} />
                        {isListening ? 'Listening...' : 'Voice Mode'}
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={handleSkip}
                        className="text-white/40 hover:text-white transition-all font-black uppercase tracking-widest text-xs"
                      >
                        Skip Question
                      </button>
                      <button 
                        onClick={handleSubmitAnswer} 
                        disabled={loading || (questions[currentQuestionIndex].type !== 'mcq' && !userAnswers[currentQuestionIndex])} 
                        className="bg-indigo-500 hover:bg-indigo-400 text-white px-10 py-4 rounded-2xl font-black text-lg transition-all flex items-center gap-2 shadow-xl shadow-indigo-500/20"
                      >
                        {loading ? <Loader2 className="animate-spin" /> : (currentQuestionIndex === questions.length - 1 ? 'Finish' : 'Next Question')}
                        <ChevronRight />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'results' && session && (
            <motion.div key="results" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-4xl mx-auto space-y-8 py-12">
              <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-12 rounded-[3rem] text-center space-y-6 shadow-2xl shadow-indigo-500/20 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
                <div className="relative z-10">
                  <h2 className="text-2xl font-black uppercase tracking-[0.3em] text-white/60 mb-2">Interview Result</h2>
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <div className={cn("text-8xl font-black tracking-tighter drop-shadow-2xl", (session.feedbacks.reduce((acc, f) => acc + f.score, 0) / session.feedbacks.length) >= 7 ? "text-green-400" : "text-red-400")}>
                      {(session.feedbacks.reduce((acc, f) => acc + f.score, 0) / session.feedbacks.length) >= 7 ? 'PASS' : 'FAIL'}
                    </div>
                  </div>
                  <p className="text-6xl font-black text-white">{(session.feedbacks.reduce((acc, f) => acc + f.score, 0) / session.feedbacks.length).toFixed(1)}<span className="text-2xl text-white/40">/10</span></p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <h2 className="text-5xl font-black tracking-tight">Interview Report</h2>
                  <p className="text-white/40 font-medium">Comprehensive analysis of your performance.</p>
                </div>
                <button onClick={downloadPDF} className="bg-white/5 border border-white/10 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-white/10 transition-all">
                  <Download className="w-4 h-4" /> Export PDF
                </button>
              </div>

              <div ref={resultsRef} className="space-y-12 p-4 bg-[#030303]">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-10 rounded-[2.5rem] bg-white/5 border border-white/10 text-center space-y-2 shadow-xl hover:border-indigo-500/30 transition-all">
                    <p className="text-white/40 font-black uppercase tracking-widest text-xs">Overall Score</p>
                    <div className="text-7xl font-black text-indigo-500">{(session.feedbacks.reduce((acc, f) => acc + f.score, 0) / session.feedbacks.length).toFixed(1)}</div>
                    <p className="text-white/20 font-bold">out of 10</p>
                  </div>
                  <div className="p-10 rounded-[2.5rem] bg-white/5 border border-white/10 text-center space-y-2 shadow-xl hover:border-purple-500/30 transition-all">
                    <p className="text-white/40 font-black uppercase tracking-widest text-xs">Status</p>
                    {(() => {
                      const avg = session.feedbacks.reduce((acc, f) => acc + f.score, 0) / session.feedbacks.length;
                      const pass = avg >= 7;
                      return (
                        <div className={cn("text-5xl font-black flex items-center justify-center gap-3", pass ? "text-green-500" : "text-red-500")}>
                          {pass ? <CheckCircle2 className="w-10 h-10" /> : <AlertCircle className="w-10 h-10" />}
                          {pass ? 'PASS' : 'FAIL'}
                        </div>
                      );
                    })()}
                    <p className="text-white/20 font-bold">AI Recommendation</p>
                  </div>
                  <div className="p-10 rounded-[2.5rem] bg-white/5 border border-white/10 text-center space-y-2 shadow-xl hover:border-blue-500/30 transition-all">
                    <p className="text-white/40 font-black uppercase tracking-widest text-xs">Questions</p>
                    <div className="text-7xl font-black">{session.questions.length}</div>
                    <p className="text-white/20 font-bold">Completed</p>
                  </div>
                </div>

                <div className="space-y-8">
                  <h3 className="text-3xl font-black tracking-tight">Question Breakdown</h3>
                  <div className="space-y-6">
                    {session.questions.map((q, i) => (
                      <div key={i} className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10 space-y-8">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">{q.type}</span>
                            <h4 className="text-2xl font-black leading-tight">{q.question}</h4>
                          </div>
                          <div className="text-3xl font-black text-indigo-500">{session.feedbacks[i].score}/10</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                          <div className="space-y-4">
                            <p className="text-green-400 font-black uppercase tracking-widest text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Key Strengths</p>
                            <ul className="space-y-2">
                              {session.feedbacks[i].strengths.map((s, si) => <li key={si} className="text-white/60 text-sm flex gap-3"><span className="text-indigo-500 font-bold">→</span> {s}</li>)}
                            </ul>
                          </div>
                          <div className="space-y-4">
                            <p className="text-red-400 font-black uppercase tracking-widest text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Improvements</p>
                            <ul className="space-y-2">
                              {session.feedbacks[i].improvements.map((imp, imi) => <li key={imi} className="text-white/60 text-sm flex gap-3"><span className="text-indigo-500 font-bold">→</span> {imp}</li>)}
                            </ul>
                          </div>
                        </div>
                        <div className="p-8 rounded-3xl bg-black/40 border border-white/5 space-y-4">
                          <p className="text-white/40 font-black uppercase tracking-widest text-[10px]">AI Sample Answer</p>
                          <div className="text-white/80 text-sm italic leading-relaxed prose prose-invert max-w-none">
                            <Markdown>{session.feedbacks[i].sampleAnswer}</Markdown>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-center">
                <button onClick={() => setView('landing')} className="bg-indigo-500 text-white px-12 py-5 rounded-2xl font-black text-xl hover:scale-105 transition-all">Back to Home</button>
              </div>
            </motion.div>
          )}

          {view === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12 py-8">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <h2 className="text-5xl font-black tracking-tight">Performance Dashboard</h2>
                  <p className="text-white/40 font-medium">Visualize your progress and interview trends.</p>
                </div>
                <button onClick={() => setView('setup')} className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-indigo-500/20">
                  New Session <ChevronRight />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-10 rounded-[2.5rem] shadow-xl shadow-blue-500/20">
                  <p className="text-white/60 font-black uppercase tracking-widest text-xs mb-2">Total Interviews</p>
                  <p className="text-5xl font-black">{history.length}</p>
                </div>
                <div className="bg-gradient-to-br from-purple-600 to-pink-700 p-10 rounded-[2.5rem] shadow-xl shadow-purple-500/20">
                  <p className="text-white/60 font-black uppercase tracking-widest text-xs mb-2">Average Score</p>
                  <p className="text-5xl font-black">
                    {history.length > 0 ? (history.reduce((acc, h) => acc + (h.feedbacks.reduce((a, f) => a + f.score, 0) / h.feedbacks.length), 0) / history.length).toFixed(1) : '0.0'}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-10 rounded-[2.5rem] shadow-xl shadow-orange-500/20">
                  <p className="text-white/60 font-black uppercase tracking-widest text-xs mb-2">Practice Time</p>
                  <p className="text-5xl font-black">{Math.floor(history.length * 15)}<span className="text-xl ml-2 opacity-60">mins</span></p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-white/5 py-12 mt-20">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setView('landing')}>
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <span className="font-black tracking-tighter group-hover:text-indigo-400 transition-colors">IntervAI</span>
          </div>
          <p className="text-white/20 text-sm font-bold">© 2026 IntervAI. Master your future.</p>
          <div className="flex gap-8 text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Support</a>
          </div>
        </div>
      </footer>

      {/* Floating Chatbot */}
      {user && (
        <div className="fixed bottom-6 right-6 z-[100]">
          <AnimatePresence>
            {isChatOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="mb-4 w-[350px] md:w-[400px] h-[500px] bg-[#0F0F0F] border border-white/10 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl"
              >
                {/* Chat Header */}
                <div className="p-4 border-b border-white/10 bg-indigo-500/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                      <BrainCircuit className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-black text-sm">AI Mentor</h4>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Online</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setIsChatOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                    <X className="w-4 h-4 text-white/40" />
                  </button>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  {chatMessages.map((m, i) => (
                    <div key={i} className={cn("flex", m.role === 'user' ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed",
                        m.role === 'user' 
                          ? "bg-indigo-500 text-white rounded-tr-none" 
                          : "bg-white/5 border border-white/10 text-white/80 rounded-tl-none"
                      )}>
                        <Markdown>{m.text}</Markdown>
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tl-none">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 bg-white/5">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ask a doubt..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:border-indigo-500 transition-all text-sm"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                    />
                    <button 
                      type="submit" 
                      disabled={!chatInput.trim() || isChatLoading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-500 rounded-lg text-white disabled:opacity-50 hover:bg-indigo-400 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95",
              isChatOpen ? "bg-white text-black" : "bg-indigo-500 text-white"
            )}
          >
            {isChatOpen ? <Minus className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
          </button>
        </div>
      )}
    </div>
  );
}
