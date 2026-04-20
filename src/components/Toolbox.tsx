'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Icons, COLORS, toLocalDateString } from '../constants';
import { VoiceNote, Task, GroundingSource } from '../types';
import { geminiService } from '../services/geminiService';
import { storageService } from '../services/storageService';

// ==================== SHARED UI (outside component to prevent re-mount on state change) ====================
const Header = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '0.5px solid rgba(240, 226, 206, 0.1)' }}>
    <div className="space-y-2">
      <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Toolbox</div>
      <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>{title}</h2>
    </div>
    <button onClick={onBack} className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all" style={{ backgroundColor: COLORS.green, color: '#1e2830' }}>← Back</button>
  </header>
);

const Spinner = ({ t }: { t: string }) => (
  <div className="flex flex-col items-center space-y-4 py-12">
    <div className="relative w-16 h-16">
      <div className="absolute inset-0 border-4 rounded-full" style={{ borderColor: `${COLORS.green}30` }}></div>
      <div className="absolute inset-0 border-4 rounded-full border-t-transparent animate-spin" style={{ borderColor: COLORS.green, borderTopColor: 'transparent' }}></div>
    </div>
    <p className="text-[10px] font-bold uppercase tracking-[0.3em] animate-pulse" style={{ color: COLORS.caramel }}>{t}</p>
  </div>
);

const Result = ({ result, label }: { result: string; label?: string }) => (
  <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-8" style={{ border: '0.5px solid rgba(240, 226, 206, 0.06)' }}>
    {label && <h3 style={{ color: COLORS.green }} className="font-bold text-xs uppercase tracking-widest mb-3">{label}</h3>}
    <p style={{ color: COLORS.cream }} className="leading-relaxed whitespace-pre-wrap">{result}</p>
  </div>
);

const Sources = ({ sources }: { sources: GroundingSource[] }) => {
  if (!sources.length) return null;
  return (
    <div>
      <h3 style={{ color: COLORS.cream }} className="font-serif mb-3 text-sm">Sources</h3>
      <div className="flex flex-wrap gap-2">
        {sources.map((s, i) => (
          <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-full text-[11px] font-semibold transition-all hover:opacity-80" style={{ backgroundColor: COLORS.green, color: '#1e2830' }}>{s.title}</a>
        ))}
      </div>
    </div>
  );
};

const Btn = ({ onClick, disabled, children, primary = true }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; primary?: boolean }) => (
  <button onClick={onClick} disabled={disabled} className={`w-full px-6 py-4 rounded-lg font-bold transition-all disabled:opacity-50`}
    style={{ backgroundColor: primary ? COLORS.green : 'rgba(81, 55, 33, 0.42)', color: primary ? '#1e2830' : COLORS.caramel }}>{children}</button>
);

const Input = ({ value, onChange, placeholder, multiline = false, onEnter }: { value: string; onChange: (v: string) => void; placeholder: string; multiline?: boolean; onEnter?: () => void }) => {
  const style = { backgroundColor: 'rgba(81, 55, 33, 0.42)', color: COLORS.cream };
  const cls = "w-full px-4 py-3 rounded-lg focus:outline-none";
  const borderStyle = { ...style, border: '0.5px solid rgba(240, 226, 206, 0.1)' };
  if (multiline) return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} style={borderStyle} rows={3} />;
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} style={borderStyle} onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }} />;
};

interface ToolboxProps {
  onReturnToToday?: () => void;
  onTasksUpdated?: (tasks: Task[]) => void;
}

type ActiveTool = 'none' | 'voice' | 'photo' | 'factcheck' | 'chat' | 'search' | 'vocab' | 'visualizer' | 'manual';
type OpenFolder = 'none' | 'study' | 'tech';

const Toolbox: React.FC<ToolboxProps> = ({ onReturnToToday, onTasksUpdated }) => {
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [openFolder, setOpenFolder] = useState<OpenFolder>('none');

  // ==================== VOICE NOTE STATE ====================
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [realtimeText, setRealtimeText] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recentNotes, setRecentNotes] = useState<VoiceNote[]>([]);
  const [voiceSaveStatus, setVoiceSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [voiceTitle, setVoiceTitle] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);

  // ==================== PHOTO INSIGHT STATE ====================
  const [photoImage, setPhotoImage] = useState<string | null>(null);
  const [photoFocus, setPhotoFocus] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoResult, setPhotoResult] = useState('');
  const [photoSaveStatus, setPhotoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // ==================== FACT CHECK STATE ====================
  const [factInput, setFactInput] = useState('');
  const [factLoading, setFactLoading] = useState(false);
  const [factResult, setFactResult] = useState('');
  const [factSources, setFactSources] = useState<GroundingSource[]>([]);

  // ==================== WORD WIZARD STATE ====================
  const [vocabInput, setVocabInput] = useState('');
  const [vocabLoading, setVocabLoading] = useState(false);
  const [vocabResult, setVocabResult] = useState('');
  const [vocabMode, setVocabMode] = useState<'definition' | 'synonyms' | 'origin' | null>(null);

  // ==================== STUDY CHAT STATE ====================
  const [chatMode, setChatMode] = useState<'choose' | 'text' | 'voice'>('choose');
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatLiveActive, setChatLiveActive] = useState(false);
  const [chatLiveStatus, setChatLiveStatus] = useState('');
  const [chatLiveTranscript, setChatLiveTranscript] = useState('');
  const chatSessionRef = useRef<any>(null);
  const chatAudioCtxRef = useRef<AudioContext | null>(null);
  const chatNextStartRef = useRef<number>(0);
  const chatSourcesSetRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // ==================== RESEARCHER STATE ====================
  const [researchMode, setResearchMode] = useState<'choose' | 'text' | 'voice'>('choose');
  const [searchInput, setSearchInput] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState('');
  const [searchSources, setSearchSources] = useState<GroundingSource[]>([]);
  const [researchLiveActive, setResearchLiveActive] = useState(false);
  const [researchLiveStatus, setResearchLiveStatus] = useState('');
  const [researchLiveTranscript, setResearchLiveTranscript] = useState('');
  const researchSessionRef = useRef<any>(null);
  const researchAudioCtxRef = useRef<AudioContext | null>(null);
  const researchNextStartRef = useRef<number>(0);
  const researchSourcesSetRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // ==================== VISUALIZER STATE ====================
  const [vizInput, setVizInput] = useState('');
  const [vizLoading, setVizLoading] = useState(false);
  const [vizImage, setVizImage] = useState<string>('');
  const [vizText, setVizText] = useState('');

  // ==================== MANUAL LOOKUP STATE ====================
  const [manualInput, setManualInput] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState('');
  const [manualSources, setManualSources] = useState<GroundingSource[]>([]);

  // Load recent notes on mount
  useEffect(() => {
    const notes = storageService.getVoiceNotes();
    setRecentNotes(notes.slice(0, 5).reverse());
  }, []);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  // ==================== UTILITIES ====================
  const compressImage = async (base64: string, maxWidth = 800, quality = 0.75): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    });
  };

  const fileToBase64 = (file: File): Promise<string> => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file);
  });

  const saveToLibrary = async (name: string, desc: string, text: string, photoUrl?: string) => {
    const task: Task = {
      id: Math.random().toString(36).slice(2), date: toLocalDateString(),
      name, description: desc, accountabilityType: 'none', completed: true,
      showInGallery: true, reflectionText: text, photoUrl, completedAt: new Date().toISOString(),
    };
    storageService.addTasks([task]);
    if (onTasksUpdated) onTasksUpdated(storageService.getTasks());
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const playBeep = (freq: number, dur: number) => {
    try {
      const ctx = new AudioContext(), osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination); osc.frequency.value = freq; g.gain.value = 0.3;
      osc.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur); osc.stop(ctx.currentTime + dur);
    } catch (e) {}
  };

  // Live API audio helpers
  const decodePCM = (b64: string) => { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  const encodePCM = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]); return btoa(s); };
  const pcmToBuffer = (data: Uint8Array, ctx: AudioContext, sr: number) => {
    const i16 = new Int16Array(data.buffer); const buf = ctx.createBuffer(1, i16.length, sr);
    const cd = buf.getChannelData(0); for (let i = 0; i < i16.length; i++) cd[i] = i16[i] / 32768.0; return buf;
  };

  // ==================== VOICE NOTE ====================
  const startRecording = async () => {
    try {
      playBeep(880, 0.15);
      setRealtimeText(''); setTranscript('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (SR) {
        const rec = new SR(); rec.continuous = true; rec.interimResults = true;
        rec.onresult = (e: any) => { let t = ''; for (let i = e.resultIndex; i < e.results.length; ++i) t += e.results[i][0].transcript; setRealtimeText(t); };
        rec.start(); recognitionRef.current = rec;
      }

      const mr = new MediaRecorder(stream); mediaRecorderRef.current = mr; audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.onload = async () => {
          const b64 = (reader.result as string).split(',')[1];
          setIsTranscribing(true);
          try {
            const t = await geminiService.transcribeAudio(b64);
            setTranscript(t && !t.includes("couldn't transcribe") ? t : '');
          } catch { setTranscript('Error transcribing. Please try again.'); }
          finally { setIsTranscribing(false); }
        };
        reader.readAsDataURL(blob);
      };
      mr.start(); setIsRecording(true);
    } catch (err) { console.error("Mic error:", err); alert("Microphone access is required."); }
  };

  const stopRecording = () => {
    playBeep(440, 0.2);
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const saveVoiceNote = async () => {
    if (!transcript || voiceSaveStatus !== 'idle') return;
    setVoiceSaveStatus('saving');
    try {
      const text = await geminiService.transformVoiceNote(transcript, 'summary');
      const dateStr = toLocalDateString();
      const titleText = voiceTitle.trim() || 'Untitled';
      const galleryTitle = `${titleText} — ${dateStr}`;
      await saveToLibrary(galleryTitle, 'Voice-captured summary', text);
      const vn: VoiceNote = { id: Math.random().toString(36).slice(2), date: dateStr, transcript, processedType: 'summary', processedText: text };
      storageService.saveVoiceNote(vn);
      setRecentNotes([vn, ...recentNotes.slice(0, 4)]);
      setTranscript(''); setRealtimeText(''); setVoiceTitle('');
      setVoiceSaveStatus('saved');
      setTimeout(() => setVoiceSaveStatus('idle'), 2000);
    } catch (e) { console.error(e); setVoiceSaveStatus('idle'); }
  };

  // ==================== PHOTO INSIGHT ====================
  const handlePhotoSelect = async (file: File) => { const b = await fileToBase64(file); setPhotoImage(await compressImage(b)); setPhotoResult(''); };

  const runPhotoInsight = async (mode: 'find-text' | 'identify' | 'summarize') => {
    if (!photoImage) return;
    setPhotoLoading(true); setPhotoResult('');
    try {
      const b64 = photoImage.split(',')[1];
      let p = mode === 'find-text' ? 'Extract and transcribe ALL text visible in this image. List everything you can read, exactly as written.'
        : mode === 'identify' ? 'Identify the main subject(s) in this image. What is this? Name it specifically and give a brief description.'
        : 'Summarize what this picture shows. What is happening? What does it represent? Describe the scene, context, and key details.';
      if (photoFocus.trim()) p += `\n\nThe student wants you to focus on: "${photoFocus}"`;
      setPhotoResult(await geminiService.analyzeImage(b64, p) || 'No result.');
    } catch { setPhotoResult('Error analyzing image.'); }
    finally { setPhotoLoading(false); }
  };

  const savePhotoInsight = async () => {
    if (!photoResult || photoSaveStatus !== 'idle') return;
    setPhotoSaveStatus('saving');
    try {
      await saveToLibrary('Photo Insight', 'Photo analysis', photoResult, photoImage || undefined);
      setPhotoSaveStatus('saved');
      setTimeout(() => { setPhotoImage(null); setPhotoResult(''); setPhotoFocus(''); setPhotoSaveStatus('idle'); }, 2000);
    } catch { setPhotoSaveStatus('idle'); }
  };

  // ==================== FACT CHECK ====================
  const runFactCheck = async () => {
    if (!factInput.trim()) return;
    setFactLoading(true); setFactResult(''); setFactSources([]);
    try { const r = await geminiService.factCheck(factInput); setFactResult(r.text); setFactSources(r.sources); }
    catch { setFactResult('Error checking. Try again.'); }
    finally { setFactLoading(false); }
  };

  // ==================== WORD WIZARD ====================
  const runWordWizard = async (mode: 'definition' | 'synonyms' | 'origin') => {
    if (!vocabInput.trim()) return;
    setVocabLoading(true); setVocabResult(''); setVocabMode(mode);
    try {
      const r = mode === 'definition' ? await geminiService.wordDefinition(vocabInput)
        : mode === 'synonyms' ? await geminiService.wordSynonyms(vocabInput)
        : await geminiService.wordOrigin(vocabInput);
      setVocabResult(r);
    } catch { setVocabResult('Error looking up word.'); }
    finally { setVocabLoading(false); }
  };

  // ==================== STUDY CHAT ====================
  const runStudyChat = async () => {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    const msg = chatInput; setChatInput('');
    const updatedMessages = [...chatMessages, { role: 'user' as const, text: msg }];
    setChatMessages(updatedMessages);
    try {
      // Build conversation context from message history
      const conversationContext = updatedMessages.map(m =>
        `${m.role === 'user' ? 'Student' : 'Study Buddy'}: ${m.text}`
      ).join('\n\n');
      const fullQuery = updatedMessages.length > 1
        ? `Here is our conversation so far:\n\n${conversationContext}\n\nPlease respond to the student's latest message. Keep the conversation going naturally.`
        : msg;
      const r = await geminiService.studyChatText(fullQuery);
      setChatMessages(p => [...p, { role: 'ai', text: r }]);
    } catch { setChatMessages(p => [...p, { role: 'ai', text: 'Error. Try again.' }]); }
    finally { setChatLoading(false); }
  };

  const startChatLive = async () => {
    let stream: MediaStream | null = null;
    let inputCtx: AudioContext | null = null;
    try {
      setChatLiveStatus('Getting microphone...'); setChatLiveTranscript('');

      // Get mic access first
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setChatLiveStatus('Connecting to AI...');

      chatAudioCtxRef.current = new AudioContext({ sampleRate: 24000 }); chatNextStartRef.current = 0;
      inputCtx = new AudioContext({ sampleRate: 16000 });

      const capturedStream = stream;
      const capturedInputCtx = inputCtx;

      const session = await geminiService.connectLiveSession('study', {
        onOpen: () => {
          setChatLiveActive(true); setChatLiveStatus('Live — Talk now');
        },
        onAudio: (ad) => {
          if (!chatAudioCtxRef.current) return;
          try {
            const buf = pcmToBuffer(decodePCM(ad), chatAudioCtxRef.current, 24000);
            const s = chatAudioCtxRef.current.createBufferSource(); s.buffer = buf; s.connect(chatAudioCtxRef.current.destination);
            chatNextStartRef.current = Math.max(chatNextStartRef.current, chatAudioCtxRef.current.currentTime);
            s.start(chatNextStartRef.current); chatNextStartRef.current += buf.duration;
            chatSourcesSetRef.current.add(s); s.onended = () => chatSourcesSetRef.current.delete(s);
          } catch (playErr) { console.error("Audio playback error:", playErr); }
        },
        onTranscript: (t) => setChatLiveTranscript(p => p + ' ' + t),
        onError: (err) => { console.error("Live session error:", err); setChatLiveStatus('Connection error — try again'); setChatLiveActive(false); capturedStream.getTracks().forEach(t => t.stop()); },
        onClose: () => { setChatLiveActive(false); setChatLiveStatus('Ended'); capturedStream.getTracks().forEach(t => t.stop()); }
      });

      if (!session) {
        setChatLiveStatus('Could not connect — try again');
        setChatLiveActive(false);
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      // Set ref BEFORE starting audio pipeline so onaudioprocess can send data immediately
      chatSessionRef.current = session;

      // Now set up mic capture — ref is already set so audio chunks won't be silently dropped
      try {
        const src = capturedInputCtx.createMediaStreamSource(capturedStream);
        const proc = capturedInputCtx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = (e) => {
          if (!chatSessionRef.current) return;
          const d = e.inputBuffer.getChannelData(0); const i16 = new Int16Array(d.length);
          for (let i = 0; i < d.length; i++) i16[i] = d[i] * 32768;
          try {
            chatSessionRef.current.sendRealtimeInput({ media: { data: encodePCM(new Uint8Array(i16.buffer)), mimeType: 'audio/pcm;rate=16000' } });
          } catch (sendErr) { console.error("Audio send error:", sendErr); }
        };
        src.connect(proc); proc.connect(capturedInputCtx.destination);
      } catch (audioErr) {
        console.error("Audio pipeline setup error:", audioErr);
        setChatLiveStatus('Audio setup failed — mic may not be working');
      }
    } catch (err: any) {
      console.error("Live chat start error:", err);
      setChatLiveStatus(err?.message?.includes('getUserMedia') ? 'Microphone access denied' : `Connection failed: ${err?.message || 'Unknown error'}`);
      setChatLiveActive(false);
      if (stream) stream.getTracks().forEach(t => t.stop());
    }
  };

  const stopChatLive = () => {
    try { chatSessionRef.current?.close(); } catch (e) { console.error("Close error:", e); }
    chatSessionRef.current = null;
    chatSourcesSetRef.current.forEach(s => { try { s.stop(); } catch {} }); chatSourcesSetRef.current.clear();
    setChatLiveActive(false); setChatLiveStatus('Ended');
  };

  // ==================== RESEARCHER ====================
  const runResearcher = async () => {
    if (!searchInput.trim()) return;
    setSearchLoading(true); setSearchResult(''); setSearchSources([]);
    try { const r = await geminiService.researcherText(searchInput); setSearchResult(r.text); setSearchSources(r.sources); }
    catch { setSearchResult('Error researching.'); }
    finally { setSearchLoading(false); }
  };

  const startResearchLive = async () => {
    let stream: MediaStream | null = null;
    let inputCtx: AudioContext | null = null;
    try {
      setResearchLiveStatus('Getting microphone...'); setResearchLiveTranscript('');

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setResearchLiveStatus('Connecting to AI...');

      researchAudioCtxRef.current = new AudioContext({ sampleRate: 24000 }); researchNextStartRef.current = 0;
      inputCtx = new AudioContext({ sampleRate: 16000 });

      const capturedStream = stream;
      const capturedInputCtx = inputCtx;

      const session = await geminiService.connectLiveSession('research', {
        onOpen: () => {
          setResearchLiveActive(true); setResearchLiveStatus('Live — Ask away');
        },
        onAudio: (ad) => {
          if (!researchAudioCtxRef.current) return;
          try {
            const buf = pcmToBuffer(decodePCM(ad), researchAudioCtxRef.current, 24000);
            const s = researchAudioCtxRef.current.createBufferSource(); s.buffer = buf; s.connect(researchAudioCtxRef.current.destination);
            researchNextStartRef.current = Math.max(researchNextStartRef.current, researchAudioCtxRef.current.currentTime);
            s.start(researchNextStartRef.current); researchNextStartRef.current += buf.duration;
            researchSourcesSetRef.current.add(s); s.onended = () => researchSourcesSetRef.current.delete(s);
          } catch (playErr) { console.error("Audio playback error:", playErr); }
        },
        onTranscript: (t) => setResearchLiveTranscript(p => p + ' ' + t),
        onError: (err) => { console.error("Live research error:", err); setResearchLiveStatus('Connection error — try again'); setResearchLiveActive(false); capturedStream.getTracks().forEach(t => t.stop()); },
        onClose: () => { setResearchLiveActive(false); setResearchLiveStatus('Ended'); capturedStream.getTracks().forEach(t => t.stop()); }
      });

      if (!session) {
        setResearchLiveStatus('Could not connect — try again');
        setResearchLiveActive(false);
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      // Set ref BEFORE starting audio pipeline so onaudioprocess can send data immediately
      researchSessionRef.current = session;

      // Now set up mic capture — ref is already set so audio chunks won't be silently dropped
      try {
        const src = capturedInputCtx.createMediaStreamSource(capturedStream);
        const proc = capturedInputCtx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = (e) => {
          if (!researchSessionRef.current) return;
          const d = e.inputBuffer.getChannelData(0); const i16 = new Int16Array(d.length);
          for (let i = 0; i < d.length; i++) i16[i] = d[i] * 32768;
          try {
            researchSessionRef.current.sendRealtimeInput({ media: { data: encodePCM(new Uint8Array(i16.buffer)), mimeType: 'audio/pcm;rate=16000' } });
          } catch (sendErr) { console.error("Audio send error:", sendErr); }
        };
        src.connect(proc); proc.connect(capturedInputCtx.destination);
      } catch (audioErr) {
        console.error("Audio pipeline setup error:", audioErr);
        setResearchLiveStatus('Audio setup failed — mic may not be working');
      }
    } catch (err: any) {
      console.error("Live research start error:", err);
      setResearchLiveStatus(err?.message?.includes('getUserMedia') ? 'Microphone access denied' : `Connection failed: ${err?.message || 'Unknown error'}`);
      setResearchLiveActive(false);
      if (stream) stream.getTracks().forEach(t => t.stop());
    }
  };

  const stopResearchLive = () => {
    try { researchSessionRef.current?.close(); } catch (e) { console.error("Close error:", e); }
    researchSessionRef.current = null;
    researchSourcesSetRef.current.forEach(s => { try { s.stop(); } catch {} }); researchSourcesSetRef.current.clear();
    setResearchLiveActive(false); setResearchLiveStatus('Ended');
  };

  // ==================== VISUALIZER ====================
  const runVisualizer = async (prefix?: string) => {
    const p = prefix ? `${prefix}: ${vizInput}` : vizInput;
    if (!p) return; setVizLoading(true);
    try { const r = await geminiService.generateIllustration(p); setVizImage(r.image || ''); setVizText(r.text || ''); }
    catch { setVizText('Error generating.'); } finally { setVizLoading(false); }
  };

  // ==================== MANUAL LOOKUP ====================
  const runManualLookup = async () => {
    if (!manualInput.trim()) return;
    setManualLoading(true); setManualResult(''); setManualSources([]);
    try { const r = await geminiService.manualLookup(manualInput); setManualResult(r.text); setManualSources(r.sources); }
    catch { setManualResult('Error finding instructions.'); } finally { setManualLoading(false); }
  };

  const saveManualToGallery = async () => {
    if (!manualResult) return;
    try {
      const f = await geminiService.formatManualForGallery(manualResult);
      await saveToLibrary(f.title || 'Manual', 'Instructions', `${f.summary}\n\n${manualResult}`);
      setManualResult(''); setManualInput(''); setManualSources([]);
    } catch (e) { console.error(e); }
  };

  // ==================== MAIN GRID ====================
  if (activeTool === 'none' && openFolder === 'none') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '0.5px solid rgba(240, 226, 206, 0.1)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Tools</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Toolbox.</h2>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { id: 'voice' as ActiveTool, icon: Icons.Mic, name: 'VoiceNote', desc: 'Record, summarize, save as proof' },
            { id: 'photo' as ActiveTool, icon: Icons.Camera, name: 'PhotoInsight', desc: 'Analyze any photo with AI' },
            { id: 'factcheck' as ActiveTool, icon: Icons.FactCheck, name: 'FactCheck', desc: 'Quick-check if something is true' },
          ].map(t => (
            <div key={t.id} className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all flex flex-col items-center text-center" style={{ border: '0.5px solid rgba(240, 226, 206, 0.06)' }} onClick={() => setActiveTool(t.id)}>
              <div className="text-4xl mb-4" style={{ color: COLORS.green }}>{t.icon()}</div>
              <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">{t.name}</h3>
              <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">{t.desc}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { id: 'study' as OpenFolder, name: 'StudyTools', desc: 'Study Chat, Researcher, Word Wizard' },
            { id: 'tech' as OpenFolder, name: 'TechTools', desc: 'Manual Lookup, Visualizer' },
          ].map(f => (
            <div key={f.id} className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all flex flex-col items-center text-center" style={{ border: '0.5px solid rgba(240, 226, 206, 0.06)' }} onClick={() => setOpenFolder(f.id)}>
              <div className="text-4xl mb-4" style={{ color: COLORS.green }}>{Icons.Folder()}</div>
              <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">{f.name}</h3>
              <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ==================== STUDY TOOLS FOLDER ====================
  if (openFolder === 'study' && activeTool === 'none') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="StudyTools." onBack={() => setOpenFolder('none')} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { id: 'chat' as ActiveTool, icon: Icons.Chat, name: 'StudyChat', desc: 'Explain, show how, check answers' },
            { id: 'search' as ActiveTool, icon: Icons.Search, name: 'Researcher', desc: 'Dig deep into any topic' },
            { id: 'vocab' as ActiveTool, icon: Icons.Vocabulary, name: 'WordWizard', desc: 'Definitions, synonyms, origins' },
          ].map(t => (
            <div key={t.id} className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all flex flex-col items-center text-center"
              onClick={() => setActiveTool(t.id)}>
              <div className="text-4xl mb-4" style={{ color: COLORS.green }}>{t.icon()}</div>
              <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">{t.name}</h3>
              <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ==================== TECH TOOLS FOLDER ====================
  if (openFolder === 'tech' && activeTool === 'none') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="TechTools." onBack={() => setOpenFolder('none')} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { id: 'manual' as ActiveTool, icon: Icons.Manual, name: 'ManualLookup', desc: 'Find instructions for anything' },
            { id: 'visualizer' as ActiveTool, icon: Icons.Visualizer, name: 'Visualizer', desc: 'Turn ideas into diagrams' },
          ].map(t => (
            <div key={t.id} className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all flex flex-col items-center text-center"
              onClick={() => setActiveTool(t.id)}>
              <div className="text-4xl mb-4" style={{ color: COLORS.green }}>{t.icon()}</div>
              <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">{t.name}</h3>
              <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ==================== VOICE NOTE ====================
  if (activeTool === 'voice') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24 flex flex-col">
        <Header title="VoiceNote." onBack={() => { setActiveTool('none'); setTranscript(''); setRealtimeText(''); }} />
        <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-6" style={{ border: '0.5px solid rgba(240, 226, 206, 0.08)' }}>
          <p style={{ color: COLORS.cream }} className="text-sm leading-relaxed">
            Record a short summary of what you read or learned about. Your recording will be transcribed into a written AI summary and saved to the library for review.
          </p>
        </div>
        <div className="w-full max-w-2xl mb-4">
          <label style={{ color: COLORS.cream }} className="block font-serif mb-2 text-sm">What book or movie is this about? <span style={{ color: COLORS.caramel, opacity: 0.5 }}>(optional)</span></label>
          <Input value={voiceTitle} onChange={setVoiceTitle} placeholder='e.g. "Percy Jackson", "Planet Earth II"' />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center">
          {!transcript && !isTranscribing ? (
            <div className="flex flex-col items-center gap-8 w-full">
              <div className="relative">
                <button onClick={isRecording ? stopRecording : startRecording}
                  className={`w-32 h-32 rounded-full font-bold text-lg transition-all flex items-center justify-center shadow-xl ${isRecording ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: isRecording ? '#ef4444' : COLORS.green, color: isRecording ? '#fff' : '#1e2830' }}>
                  <div className="scale-[1.8]">{isRecording ? <Icons.Stop /> : <Icons.Mic />}</div>
                </button>
                {isRecording && <div className="absolute inset-0 rounded-full animate-ping -z-10" style={{ backgroundColor: '#ef444430' }}></div>}
              </div>
              <div className="text-center">
                {isRecording ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                      <span className="text-red-400 font-bold text-sm uppercase tracking-widest">Recording</span>
                    </div>
                    <p className="text-3xl font-mono" style={{ color: COLORS.cream }}>{formatTime(recordingSeconds)}</p>
                  </div>
                ) : (
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: COLORS.caramel }}>Tap to start recording</p>
                )}
              </div>
              {isRecording && realtimeText && (
                <div className="w-full max-w-lg p-5 rounded-[2rem] animate-in fade-in duration-300" style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)' }}>
                  <p style={{ color: COLORS.cream }} className="text-lg font-serif leading-relaxed text-center italic">"{realtimeText}"</p>
                </div>
              )}
              {recentNotes.length > 0 && !isRecording && (
                <div className="w-full mt-8 max-w-md">
                  <h3 style={{ color: COLORS.cream }} className="font-bold mb-4 text-sm">Recent Notes</h3>
                  <div className="space-y-2">
                    {recentNotes.map(n => (
                      <div key={n.id} className="p-3 rounded-lg flex items-center justify-between" style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)' }}
                        onContextMenu={e => { e.preventDefault(); storageService.deleteVoiceNote(n.id); setRecentNotes(recentNotes.filter(x => x.id !== n.id)); }}>
                        <div>
                          <p style={{ color: COLORS.cream }} className="text-sm font-semibold">{n.date}</p>
                          <p style={{ color: COLORS.caramel }} className="text-xs">{n.processedType}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : isTranscribing ? (
            <Spinner t="Transcribing your recording..." />
          ) : (
            <div className="w-full max-w-2xl space-y-6">
              <Result result={`"${transcript}"`} label="Review What You Said" />
              <div className="w-full">
                <label style={{ color: COLORS.cream }} className="block font-serif mb-2 text-sm">What book or movie is this about? <span style={{ color: COLORS.caramel, opacity: 0.5 }}>(optional)</span></label>
                <Input value={voiceTitle} onChange={setVoiceTitle} placeholder='e.g. "Percy Jackson", "Planet Earth II"' />
              </div>
              <Btn onClick={saveVoiceNote} disabled={voiceSaveStatus !== 'idle'}>
                {voiceSaveStatus === 'saving' ? 'Saving Summary...' : voiceSaveStatus === 'saved' ? 'Saved to Library!' : 'Save to Library'}
              </Btn>
              <button onClick={() => { setTranscript(''); setRealtimeText(''); }} className="w-full px-4 py-3 rounded-lg font-semibold transition-all text-sm" style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)', color: COLORS.caramel }}>Start Over</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== PHOTO INSIGHT ====================
  if (activeTool === 'photo') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="PhotoInsight." onBack={() => { setActiveTool('none'); setPhotoImage(null); setPhotoResult(''); setPhotoFocus(''); }} />
        <div className="max-w-2xl space-y-6">
          <p style={{ color: COLORS.cream }} className="text-sm leading-relaxed">Take a picture of something you're reading, building, or curious about and the AI will tell you what it sees.</p>
          {!photoImage ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => cameraInputRef.current?.click()} className="w-full px-6 py-10 rounded-[2rem] font-bold text-sm transition-all flex flex-col items-center gap-3"
                  style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)', color: COLORS.cream, border: `2px dashed ${COLORS.green}` }}>
                  <div className="scale-[1.5]">{Icons.Camera()}</div>Take Photo
                </button>
                <button onClick={() => galleryInputRef.current?.click()} className="w-full px-6 py-10 rounded-[2rem] font-bold text-sm transition-all flex flex-col items-center gap-3"
                  style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)', color: COLORS.cream, border: `2px dashed ${COLORS.green}` }}>
                  <div className="scale-[1.5]">{Icons.Visualizer()}</div>Upload Photo
                </button>
              </div>
              <div>
                <label style={{ color: COLORS.caramel, opacity: 0.7 }} className="block text-xs font-bold uppercase tracking-widest mb-2">Try it on</label>
                <div className="flex flex-wrap gap-2">
                  {['A page from your book', 'A bug or animal', 'A label or sign', 'Your handwriting', 'A math problem'].map(ex => (
                    <span key={ex} className="px-3 py-1.5 rounded-full text-xs" style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)', color: COLORS.caramel }}>{ex}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="relative">
                <img src={photoImage} alt="Selected" className="w-full rounded-[2rem]" />
                <button onClick={() => { setPhotoImage(null); setPhotoResult(''); }} className="absolute top-3 right-3 p-2 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}>✕</button>
              </div>
              <div>
                <label style={{ color: COLORS.cream }} className="block font-serif mb-2 text-sm">Tell the AI what to look for</label>
                <Input value={photoFocus} onChange={setPhotoFocus} placeholder='e.g. the ingredients list, what kind of bird this is...' />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { mode: 'find-text' as const, label: 'What does it say?' },
                  { mode: 'identify' as const, label: 'What is this?' },
                  { mode: 'summarize' as const, label: "What's going on?" },
                ].map(b => (
                  <button key={b.mode} onClick={() => runPhotoInsight(b.mode)} disabled={photoLoading}
                    className="px-3 py-4 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
                    style={{ backgroundColor: COLORS.green, color: '#1e2830' }}>{photoLoading ? '...' : b.label}</button>
                ))}
              </div>
              {photoLoading && <Spinner t="Looking at your photo..." />}
              {photoResult && !photoLoading && (
                <div className="space-y-4">
                  <Result result={photoResult} label="Here's what I see" />
                  <button onClick={savePhotoInsight} disabled={photoSaveStatus !== 'idle'}
                    className="w-full px-4 py-4 rounded-xl font-bold text-sm transition-all disabled:opacity-30"
                    style={{ backgroundColor: photoSaveStatus === 'saved' ? '#22c55e' : COLORS.green, color: '#1e2830' }}>
                    {photoSaveStatus === 'saving' ? 'Saving...' : photoSaveStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                  </button>
                </div>
              )}
            </div>
          )}
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { if (e.target.files?.[0]) handlePhotoSelect(e.target.files[0]); }} />
          <input ref={galleryInputRef} type="file" accept="image/*" hidden onChange={e => { if (e.target.files?.[0]) handlePhotoSelect(e.target.files[0]); }} />
        </div>
      </div>
    );
  }

  // ==================== FACT CHECK ====================
  if (activeTool === 'factcheck') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '0.5px solid rgba(240, 226, 206, 0.1)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Toolbox</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none flex items-end gap-3" style={{ color: COLORS.cream }}>
              FactCheck.
              <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 md:w-14 md:h-14 mb-1" style={{ flexShrink: 0 }}>
                <path d="M9 12l2 2 4-4" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="#ef4444" strokeWidth="2.5"/>
              </svg>
            </h2>
          </div>
          <button onClick={() => { setActiveTool('none'); setFactInput(''); setFactResult(''); setFactSources([]); }} className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all" style={{ backgroundColor: COLORS.green, color: '#1e2830' }}>← Back</button>
        </header>
        <div className="max-w-2xl space-y-6">
          <div>
            <Input value={factInput} onChange={setFactInput} placeholder='What is the truth?' multiline onEnter={runFactCheck} />
          </div>
          <Btn onClick={runFactCheck} disabled={!factInput.trim() || factLoading}>{factLoading ? 'Checking...' : 'Check It'}</Btn>
          {factLoading && <Spinner t="Verifying with Google..." />}
          {factResult && !factLoading && (
            <div className="space-y-6">
              <Result result={factResult} label="Verdict" />
              <Sources sources={factSources} />
              <Btn onClick={() => { setFactInput(''); setFactResult(''); setFactSources([]); }} primary={false}>Check Something Else</Btn>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== WORD WIZARD ====================
  if (activeTool === 'vocab') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="WordWizard." onBack={() => { setActiveTool('none'); setVocabInput(''); setVocabResult(''); setVocabMode(null); if (openFolder === 'none') setOpenFolder('study'); }} />
        <div className="max-w-2xl space-y-6">
          <div>
            <label style={{ color: COLORS.cream }} className="block font-serif mb-3">Enter a word</label>
            <Input value={vocabInput} onChange={setVocabInput} placeholder="Type any word..." onEnter={() => runWordWizard('definition')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(['definition', 'synonyms', 'origin'] as const).map(m => (
              <button key={m} onClick={() => runWordWizard(m)} disabled={!vocabInput.trim() || vocabLoading}
                className="px-4 py-4 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                style={{ backgroundColor: vocabMode === m ? COLORS.green : 'rgba(81, 55, 33, 0.6)', color: vocabMode === m ? '#1e2830' : COLORS.cream }}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          {vocabLoading && <Spinner t="Looking up word..." />}
          {vocabResult && !vocabLoading && <Result result={vocabResult} label={vocabMode === 'definition' ? 'Definition' : vocabMode === 'synonyms' ? 'Synonyms & Antonyms' : 'Word Origin'} />}
        </div>
      </div>
    );
  }

  // ==================== STUDY CHAT ====================
  if (activeTool === 'chat') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="StudyChat." onBack={() => { setActiveTool('none'); setChatMode('choose'); setChatInput(''); setChatMessages([]); stopChatLive(); if (openFolder === 'none') setOpenFolder('study'); }} />
        <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-6" style={{ border: '0.5px solid rgba(240, 226, 206, 0.08)' }}>
          <p style={{ color: COLORS.cream }} className="text-sm leading-relaxed"><strong>Use Study Chat when you need help with schoolwork.</strong> It can:</p>
          <div className="mt-3 space-y-1">
            <p style={{ color: COLORS.caramel }} className="text-sm">→ <strong style={{ color: COLORS.cream }}>Explain</strong> something you don't understand</p>
            <p style={{ color: COLORS.caramel }} className="text-sm">→ <strong style={{ color: COLORS.cream }}>Show you how</strong> to do something step by step</p>
            <p style={{ color: COLORS.caramel }} className="text-sm">→ <strong style={{ color: COLORS.cream }}>Check your answer</strong> and tell you if you're right</p>
          </div>
          <p style={{ color: COLORS.caramel }} className="text-xs mt-3 italic">Tip: Be specific! "explain how to add 1/3 + 1/4" works better than "explain fractions"</p>
        </div>
        {chatMode === 'choose' && (
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
            <button onClick={() => setChatMode('text')} className="p-6 rounded-[2rem] font-bold text-sm transition-all flex flex-col items-center gap-3 glass-tile-tinted adhd-card" style={{ color: COLORS.cream }}>
              <div className="scale-[1.5]">{Icons.Chat()}</div>Type
            </button>
            <button onClick={() => { setChatMode('voice') }} className="p-6 rounded-[2rem] font-bold text-sm transition-all flex flex-col items-center gap-3 glass-tile-tinted adhd-card" style={{ color: COLORS.cream }}>
              <div className="scale-[1.5]">{Icons.Mic()}</div>Talk
            </button>
          </div>
        )}
        {chatMode === 'text' && (
          <div className="max-w-2xl space-y-4">
            {/* Messages area — scrollable */}
            {chatMessages.length > 0 && (
              <div className="space-y-3 overflow-y-auto pr-2 rounded-[2rem] p-2" style={{ maxHeight: '50vh' }}>
                {chatMessages.map((m, i) => (
                  <div key={i} className={`p-4 rounded-[1.5rem] ${m.role === 'user' ? 'ml-8' : 'mr-8'}`}
                    style={{ backgroundColor: m.role === 'user' ? COLORS.green + '30' : 'rgba(81, 55, 33, 0.42)' }}>
                    <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: m.role === 'user' ? COLORS.green : COLORS.caramel }}>{m.role === 'user' ? 'You' : 'Study Buddy'}</p>
                    <p style={{ color: COLORS.cream }} className="leading-relaxed text-sm whitespace-pre-wrap">{m.text}</p>
                  </div>
                ))}
                {chatLoading && <Spinner t="Thinking..." />}
              </div>
            )}
            {chatMessages.length === 0 && chatLoading && <Spinner t="Thinking..." />}
            {/* Input — always visible, never hidden behind scroll */}
            <div className="pt-3" style={{ borderTop: chatMessages.length > 0 ? '0.5px solid rgba(240, 226, 206, 0.08)' : 'none' }}>
              <div className="flex gap-3">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                  placeholder={chatMessages.length === 0 ? "What do you need help with?" : "Ask a follow-up..."}
                  className="flex-1 px-4 py-3 rounded-lg focus:outline-none" style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)', color: COLORS.cream, border: '0.5px solid rgba(240, 226, 206, 0.08)' }}
                  onKeyDown={e => { if (e.key === 'Enter') runStudyChat(); }} />
                <button onClick={runStudyChat} disabled={!chatInput.trim() || chatLoading} className="px-6 py-3 rounded-lg font-bold transition-all disabled:opacity-50" style={{ backgroundColor: COLORS.green, color: '#1e2830' }}>Ask</button>
              </div>
            </div>
          </div>
        )}
        {chatMode === 'voice' && (
          <div className="flex flex-col items-center space-y-8 max-w-md mx-auto">
            <div className={`w-28 h-28 rounded-full flex items-center justify-center transition-all shadow-xl ${chatLiveActive ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: chatLiveActive ? COLORS.green : 'rgba(81, 55, 33, 0.42)' }}>
              <div className="scale-[2]" style={{ color: chatLiveActive ? '#1e2830' : COLORS.cream }}>{Icons.Chat()}</div>
            </div>
            <p className="font-bold text-sm text-center" style={{ color: chatLiveStatus.includes('error') || chatLiveStatus.includes('failed') || chatLiveStatus.includes('denied') ? '#ef4444' : chatLiveActive ? COLORS.green : COLORS.caramel }}>
              {chatLiveStatus || 'Ready — Tap below to start a voice conversation'}
            </p>
            {chatLiveTranscript && (
              <div className="w-full p-5 rounded-[2rem] max-h-[200px] overflow-y-auto" style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)' }}>
                <p style={{ color: COLORS.cream }} className="text-sm leading-relaxed">{chatLiveTranscript}</p>
              </div>
            )}
            <button onClick={chatLiveActive ? stopChatLive : startChatLive}
              disabled={chatLiveStatus === 'Connecting to AI...' || chatLiveStatus === 'Getting microphone...'}
              className="w-full max-w-xs py-4 rounded-xl font-bold text-sm shadow-lg transition-all disabled:opacity-50"
              style={{ backgroundColor: chatLiveActive ? '#ef4444' : COLORS.green, color: chatLiveActive ? '#fff' : '#1e2830' }}>
              {chatLiveStatus === 'Connecting to AI...' || chatLiveStatus === 'Getting microphone...' ? chatLiveStatus : chatLiveActive ? 'End Conversation' : 'Start Talking'}
            </button>
            {(chatLiveStatus.includes('error') || chatLiveStatus.includes('failed')) && (
              <p className="text-[10px] text-center" style={{ color: COLORS.caramel }}>
                Voice chat requires a stable connection. Try refreshing the page, or use the "Type" mode instead.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ==================== RESEARCHER ====================
  if (activeTool === 'search') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="Researcher." onBack={() => { setActiveTool('none'); setResearchMode('choose'); setSearchInput(''); setSearchResult(''); setSearchSources([]); stopResearchLive(); if (openFolder === 'none') setOpenFolder('study'); }} />
        <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-6" style={{ border: '0.5px solid rgba(240, 226, 206, 0.08)' }}>
          <p style={{ color: COLORS.cream }} className="text-sm leading-relaxed"><strong>Use Researcher when you want to learn about a topic.</strong> This is different from Study Chat — Researcher searches the internet to find real facts.</p>
          <div className="mt-3 space-y-1">
            <p style={{ color: COLORS.caramel }} className="text-sm">→ <strong style={{ color: COLORS.cream }}>Explore a topic</strong> — "Tell me about volcanoes"</p>
            <p style={{ color: COLORS.caramel }} className="text-sm">→ <strong style={{ color: COLORS.cream }}>Find specific info</strong> — "When was the first airplane flight?"</p>
            <p style={{ color: COLORS.caramel }} className="text-sm">→ <strong style={{ color: COLORS.cream }}>Go deeper</strong> — Ask follow-ups to keep learning</p>
          </div>
          <p style={{ color: COLORS.caramel }} className="text-xs mt-3 italic">Tip: The best research starts with a good question!</p>
        </div>
        {researchMode === 'choose' && (
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
            <button onClick={() => setResearchMode('text')} className="p-6 rounded-[2rem] font-bold text-sm transition-all flex flex-col items-center gap-3 glass-tile-tinted adhd-card" style={{ color: COLORS.cream }}>
              <div className="scale-[1.5]">{Icons.Search()}</div>Type
            </button>
            <button onClick={() => { setResearchMode('voice') }} className="p-6 rounded-[2rem] font-bold text-sm transition-all flex flex-col items-center gap-3 glass-tile-tinted adhd-card" style={{ color: COLORS.cream }}>
              <div className="scale-[1.5]">{Icons.Mic()}</div>Talk
            </button>
          </div>
        )}
        {researchMode === 'text' && (
          <div className="max-w-2xl space-y-4">
            {/* Results area — scrollable */}
            {(searchResult || searchLoading) && (
              <div className="overflow-y-auto pr-2 space-y-6 rounded-[2rem] p-2" style={{ maxHeight: '50vh' }}>
                {searchLoading && <Spinner t="Searching the web..." />}
                {searchResult && !searchLoading && (
                  <div className="space-y-6"><Result result={searchResult} label="Findings" /><Sources sources={searchSources} /></div>
                )}
              </div>
            )}
            {/* Input — always visible */}
            <div className="pt-3" style={{ borderTop: searchResult ? '0.5px solid rgba(240, 226, 206, 0.08)' : 'none' }}>
              <div className="flex gap-3">
                <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
                  placeholder={searchResult ? "Ask a follow-up question..." : "Ask about any topic..."}
                  className="flex-1 px-4 py-3 rounded-lg focus:outline-none" style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)', color: COLORS.cream, border: '0.5px solid rgba(240, 226, 206, 0.08)' }}
                  onKeyDown={e => { if (e.key === 'Enter') runResearcher(); }} />
                <button onClick={runResearcher} disabled={!searchInput.trim() || searchLoading} className="px-6 py-3 rounded-lg font-bold transition-all disabled:opacity-50" style={{ backgroundColor: COLORS.green, color: '#1e2830' }}>Research</button>
              </div>
            </div>
          </div>
        )}
        {researchMode === 'voice' && (
          <div className="flex flex-col items-center space-y-8 max-w-md mx-auto">
            <div className={`w-28 h-28 rounded-full flex items-center justify-center transition-all shadow-xl ${researchLiveActive ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: researchLiveActive ? COLORS.green : 'rgba(81, 55, 33, 0.42)' }}>
              <div className="scale-[2]" style={{ color: researchLiveActive ? '#1e2830' : COLORS.cream }}>{Icons.Search()}</div>
            </div>
            <p className="font-bold text-sm text-center" style={{ color: researchLiveStatus.includes('error') || researchLiveStatus.includes('failed') || researchLiveStatus.includes('denied') ? '#ef4444' : researchLiveActive ? COLORS.green : COLORS.caramel }}>
              {researchLiveStatus || 'Ready — Tap below to start a voice conversation'}
            </p>
            {researchLiveTranscript && (
              <div className="w-full p-5 rounded-[2rem] max-h-[200px] overflow-y-auto" style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)' }}>
                <p style={{ color: COLORS.cream }} className="text-sm leading-relaxed">{researchLiveTranscript}</p>
              </div>
            )}
            <button onClick={researchLiveActive ? stopResearchLive : startResearchLive}
              disabled={researchLiveStatus === 'Connecting to AI...' || researchLiveStatus === 'Getting microphone...'}
              className="w-full max-w-xs py-4 rounded-xl font-bold text-sm shadow-lg transition-all disabled:opacity-50"
              style={{ backgroundColor: researchLiveActive ? '#ef4444' : COLORS.green, color: researchLiveActive ? '#fff' : '#1e2830' }}>
              {researchLiveStatus === 'Connecting to AI...' || researchLiveStatus === 'Getting microphone...' ? researchLiveStatus : researchLiveActive ? 'End Conversation' : 'Start Talking'}
            </button>
            {(researchLiveStatus.includes('error') || researchLiveStatus.includes('failed')) && (
              <p className="text-[10px] text-center" style={{ color: COLORS.caramel }}>
                Voice chat requires a stable connection. Try refreshing the page, or use the "Type" mode instead.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ==================== VISUALIZER (unchanged) ====================
  if (activeTool === 'visualizer') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="Visualizer." onBack={() => { setActiveTool('none'); setVizInput(''); setVizImage(''); setVizText(''); if (openFolder === 'none') setOpenFolder('tech'); }} />
        <div className="max-w-2xl space-y-6">
          <div>
            <label style={{ color: COLORS.cream }} className="block font-serif mb-3">What do you want to visualize?</label>
            <Input value={vizInput} onChange={setVizInput} placeholder="Enter a concept, process, or idea..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['How it works', 'Inside/Parts', 'Process steps'].map(p => (
              <button key={p} onClick={() => runVisualizer(p)} disabled={!vizInput || vizLoading}
                className="px-4 py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50" style={{ backgroundColor: COLORS.green, color: '#1e2830' }}>{p}</button>
            ))}
          </div>
          {vizLoading && <Spinner t="Generating visual..." />}
          {vizImage && (
            <div className="space-y-4">
              <img src={vizImage} alt="Visualization" className="w-full rounded-[2rem]" />
              {vizText && <Result result={vizText} label="Explanation" />}
              <Btn onClick={() => { setVizImage(''); setVizText(''); setVizInput(''); }} primary={false}>Create Another</Btn>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== MANUAL LOOKUP ====================
  if (activeTool === 'manual') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="ManualLookup." onBack={() => { setActiveTool('none'); setManualInput(''); setManualResult(''); setManualSources([]); if (openFolder === 'none') setOpenFolder('tech'); }} />
        <div className="max-w-2xl space-y-6">
          <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-6" style={{ border: '0.5px solid rgba(240, 226, 206, 0.08)' }}>
            <p style={{ color: COLORS.cream }} className="text-sm leading-relaxed">
              <strong>Find instructions or manuals for anything.</strong> Type the name of what you need help with — a LEGO set, a Snap Circuit kit, an electronic device, an appliance, a tool, or any product.
            </p>
            <div className="mt-3 space-y-1">
              <p style={{ color: COLORS.caramel }} className="text-sm">→ "LEGO Technic 42203 instructions"</p>
              <p style={{ color: COLORS.caramel }} className="text-sm">→ "Snap Circuits SC-300 manual"</p>
              <p style={{ color: COLORS.caramel }} className="text-sm">→ "How to use a soldering iron safely"</p>
              <p style={{ color: COLORS.caramel }} className="text-sm">→ "Roku remote setup instructions"</p>
            </div>
            <p style={{ color: COLORS.caramel }} className="text-xs mt-3 italic">Tip: Include model numbers if you have them.</p>
          </div>
          <div>
            <label style={{ color: COLORS.cream }} className="block font-serif mb-3">What do you need a manual for?</label>
            <Input value={manualInput} onChange={setManualInput} placeholder="Product name, model number, or tool..." onEnter={runManualLookup} />
          </div>
          <Btn onClick={runManualLookup} disabled={!manualInput.trim() || manualLoading}>{manualLoading ? 'Searching...' : 'Find Instructions'}</Btn>
          {manualLoading && <Spinner t="Finding manuals..." />}
          {manualResult && !manualLoading && (
            <div className="space-y-6">
              {/* Instructions with clickable links */}
              <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-8" style={{ border: '0.5px solid rgba(240, 226, 206, 0.06)' }}>
                <h3 style={{ color: COLORS.green }} className="font-bold text-xs uppercase tracking-widest mb-3">Instructions</h3>
                <div style={{ color: COLORS.cream }} className="leading-relaxed whitespace-pre-wrap">
                  {manualResult.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
                    /^https?:\/\//.test(part)
                      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all" style={{ color: COLORS.green }}>{part}</a>
                      : <span key={i}>{part}</span>
                  )}
                </div>
              </div>
              {/* Source links as tappable buttons */}
              {manualSources.length > 0 && (
                <div>
                  <h3 style={{ color: COLORS.cream }} className="font-serif mb-3 text-sm">Sources &amp; Links</h3>
                  <div className="space-y-2">
                    {manualSources.map((s, i) => (
                      <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 rounded-xl transition-all hover:scale-[1.02] active:scale-95"
                        style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)', border: '0.5px solid rgba(240, 226, 206, 0.08)' }}>
                        <span className="text-lg" style={{ color: COLORS.green }}>🔗</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color: COLORS.cream }}>{s.title}</p>
                          <p className="text-[10px] truncate" style={{ color: COLORS.caramel }}>{s.uri}</p>
                        </div>
                        <svg className="w-4 h-4 shrink-0" style={{ color: COLORS.caramel }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <Btn onClick={saveManualToGallery}>Save to Library</Btn>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default Toolbox;
