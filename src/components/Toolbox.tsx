'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Icons, COLORS } from '../constants';
import { VoiceNote, Task, GroundingSource } from '../types';
import { geminiService } from '../services/geminiService';
import { storageService } from '../services/storageService';

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

  const saveToGallery = async (name: string, desc: string, text: string, photoUrl?: string) => {
    const task: Task = {
      id: Math.random().toString(36).slice(2), date: new Date().toISOString().split('T')[0],
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

  const saveVoiceNote = async (type: 'summary' | 'reflection' | 'assignment' | 'transcript') => {
    if (!transcript || voiceSaveStatus !== 'idle') return;
    setVoiceSaveStatus('saving');
    try {
      let text = transcript, title = 'Voice Transcript';
      if (type === 'summary') { title = 'Reading Summary'; text = await geminiService.transformVoiceNote(transcript, 'summary'); }
      else if (type === 'reflection') { title = 'Voice Reflection'; text = await geminiService.transformVoiceNote(transcript, 'reflection'); }
      else if (type === 'assignment') { title = 'Assignment Proof'; text = await geminiService.transformVoiceNote(transcript, 'assignment'); }
      await saveToGallery(title, 'Voice-captured insight', text);
      const vn: VoiceNote = { id: Math.random().toString(36).slice(2), date: new Date().toISOString().split('T')[0], transcript, processedType: type, processedText: text };
      storageService.saveVoiceNote(vn);
      setRecentNotes([vn, ...recentNotes.slice(0, 4)]);
      setTranscript(''); setRealtimeText('');
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
      await saveToGallery('Photo Insight', 'Photo analysis', photoResult, photoImage || undefined);
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
    setChatMessages(p => [...p, { role: 'user', text: msg }]);
    try {
      const r = await geminiService.studyChatText(msg);
      setChatMessages(p => [...p, { role: 'ai', text: r }]);
    } catch { setChatMessages(p => [...p, { role: 'ai', text: 'Error. Try again.' }]); }
    finally { setChatLoading(false); }
  };

  const startChatLive = async () => {
    setChatLiveStatus('Connecting...'); setChatLiveTranscript('');
    chatAudioCtxRef.current = new AudioContext({ sampleRate: 24000 }); chatNextStartRef.current = 0;
    const inputCtx = new AudioContext({ sampleRate: 16000 });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const session = await geminiService.connectLiveSession('study', {
      onOpen: () => {
        setChatLiveActive(true); setChatLiveStatus('Live — Talk now');
        const src = inputCtx.createMediaStreamSource(stream);
        const proc = inputCtx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = (e) => {
          const d = e.inputBuffer.getChannelData(0); const i16 = new Int16Array(d.length);
          for (let i = 0; i < d.length; i++) i16[i] = d[i] * 32768;
          session?.sendRealtimeInput({ media: { data: encodePCM(new Uint8Array(i16.buffer)), mimeType: 'audio/pcm;rate=16000' } });
        };
        src.connect(proc); proc.connect(inputCtx.destination);
      },
      onAudio: (ad) => {
        if (!chatAudioCtxRef.current) return;
        const buf = pcmToBuffer(decodePCM(ad), chatAudioCtxRef.current, 24000);
        const s = chatAudioCtxRef.current.createBufferSource(); s.buffer = buf; s.connect(chatAudioCtxRef.current.destination);
        chatNextStartRef.current = Math.max(chatNextStartRef.current, chatAudioCtxRef.current.currentTime);
        s.start(chatNextStartRef.current); chatNextStartRef.current += buf.duration;
        chatSourcesSetRef.current.add(s); s.onended = () => chatSourcesSetRef.current.delete(s);
      },
      onTranscript: (t) => setChatLiveTranscript(p => p + ' ' + t),
      onError: () => { setChatLiveStatus('Error'); setChatLiveActive(false); },
      onClose: () => { setChatLiveActive(false); setChatLiveStatus('Ended'); stream.getTracks().forEach(t => t.stop()); }
    });
    chatSessionRef.current = session;
  };

  const stopChatLive = () => {
    chatSessionRef.current?.close(); chatSessionRef.current = null;
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
    setResearchLiveStatus('Connecting...'); setResearchLiveTranscript('');
    researchAudioCtxRef.current = new AudioContext({ sampleRate: 24000 }); researchNextStartRef.current = 0;
    const inputCtx = new AudioContext({ sampleRate: 16000 });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const session = await geminiService.connectLiveSession('research', {
      onOpen: () => {
        setResearchLiveActive(true); setResearchLiveStatus('Live — Ask away');
        const src = inputCtx.createMediaStreamSource(stream);
        const proc = inputCtx.createScriptProcessor(4096, 1, 1);
        proc.onaudioprocess = (e) => {
          const d = e.inputBuffer.getChannelData(0); const i16 = new Int16Array(d.length);
          for (let i = 0; i < d.length; i++) i16[i] = d[i] * 32768;
          session?.sendRealtimeInput({ media: { data: encodePCM(new Uint8Array(i16.buffer)), mimeType: 'audio/pcm;rate=16000' } });
        };
        src.connect(proc); proc.connect(inputCtx.destination);
      },
      onAudio: (ad) => {
        if (!researchAudioCtxRef.current) return;
        const buf = pcmToBuffer(decodePCM(ad), researchAudioCtxRef.current, 24000);
        const s = researchAudioCtxRef.current.createBufferSource(); s.buffer = buf; s.connect(researchAudioCtxRef.current.destination);
        researchNextStartRef.current = Math.max(researchNextStartRef.current, researchAudioCtxRef.current.currentTime);
        s.start(researchNextStartRef.current); researchNextStartRef.current += buf.duration;
        researchSourcesSetRef.current.add(s); s.onended = () => researchSourcesSetRef.current.delete(s);
      },
      onTranscript: (t) => setResearchLiveTranscript(p => p + ' ' + t),
      onError: () => { setResearchLiveStatus('Error'); setResearchLiveActive(false); },
      onClose: () => { setResearchLiveActive(false); setResearchLiveStatus('Ended'); stream.getTracks().forEach(t => t.stop()); }
    });
    researchSessionRef.current = session;
  };

  const stopResearchLive = () => {
    researchSessionRef.current?.close(); researchSessionRef.current = null;
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
      await saveToGallery(f.title || 'Manual', 'Instructions', `${f.summary}\n\n${manualResult}`);
      setManualResult(''); setManualInput(''); setManualSources([]);
    } catch (e) { console.error(e); }
  };

  // ==================== SHARED UI ====================
  const Header = ({ title, onBack }: { title: string; onBack: () => void }) => (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
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
    <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-8">
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
    if (multiline) return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} style={style} rows={3} />;
    return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} style={style} onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }} />;
  };

  // ==================== MAIN GRID ====================
  if (activeTool === 'none' && openFolder === 'none') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Tools</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Toolbox.</h2>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { id: 'voice' as ActiveTool, icon: Icons.Mic, name: 'Voice Note', desc: 'Record, summarize, save as proof' },
            { id: 'photo' as ActiveTool, icon: Icons.Camera, name: 'Photo Insight', desc: 'Analyze any photo with AI' },
            { id: 'factcheck' as ActiveTool, icon: Icons.FactCheck, name: 'Fact Check', desc: 'Quick-check if something is true' },
          ].map(t => (
            <div key={t.id} className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all" onClick={() => setActiveTool(t.id)}>
              <div className="text-4xl mb-4">{t.icon()}</div>
              <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">{t.name}</h3>
              <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">{t.desc}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { id: 'study' as OpenFolder, name: 'Study Tools', desc: 'Study Chat, Researcher, Word Wizard' },
            { id: 'tech' as OpenFolder, name: 'Tech Tools', desc: 'Manual Lookup, Visualizer' },
          ].map(f => (
            <div key={f.id} className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all" onClick={() => setOpenFolder(f.id)}>
              <div className="text-4xl mb-4">{Icons.Folder()}</div>
              <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">{f.name}</h3>
              <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ==================== STUDY TOOLS FOLDER ====================
  if (openFolder === 'study') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="Study Tools." onBack={() => setOpenFolder('none')} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { id: 'chat' as ActiveTool, icon: Icons.Chat, name: 'Study Chat', desc: 'Explain, show how, check answers' },
            { id: 'search' as ActiveTool, icon: Icons.Search, name: 'Researcher', desc: 'Dig deep into any topic' },
            { id: 'vocab' as ActiveTool, icon: Icons.Vocabulary, name: 'Word Wizard', desc: 'Definitions, synonyms, origins' },
          ].map(t => (
            <div key={t.id} className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
              onClick={() => { setActiveTool(t.id); setOpenFolder('none'); }}>
              <div className="text-4xl mb-4">{t.icon()}</div>
              <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">{t.name}</h3>
              <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ==================== TECH TOOLS FOLDER ====================
  if (openFolder === 'tech') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="Tech Tools." onBack={() => setOpenFolder('none')} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { id: 'manual' as ActiveTool, icon: Icons.Manual, name: 'Manual Lookup', desc: 'Find instructions for anything' },
            { id: 'visualizer' as ActiveTool, icon: Icons.Visualizer, name: 'Visualizer', desc: 'Turn ideas into diagrams' },
          ].map(t => (
            <div key={t.id} className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
              onClick={() => { setActiveTool(t.id); setOpenFolder('none'); }}>
              <div className="text-4xl mb-4">{t.icon()}</div>
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
        <Header title="Voice Note." onBack={() => { setActiveTool('none'); setTranscript(''); setRealtimeText(''); }} />
        <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-6">
          <p style={{ color: COLORS.cream }} className="text-sm leading-relaxed">
            <strong>What this is for:</strong> Record yourself talking about what you read or worked on. The AI will turn your recording into a written summary that gets saved to the Gallery as proof you did the work. Hit record, explain what you learned, then choose how to save it.
          </p>
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
              <div>
                <p style={{ color: COLORS.caramel }} className="text-xs font-bold uppercase tracking-widest mb-4 text-center">Choose how to save to the Gallery</p>
                <div className="grid grid-cols-2 gap-4">
                  {(['summary', 'assignment', 'reflection', 'transcript'] as const).map(t => (
                    <button key={t} onClick={() => saveVoiceNote(t)} disabled={voiceSaveStatus !== 'idle'}
                      className="px-4 py-4 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                      style={{ backgroundColor: t === 'transcript' ? 'rgba(81, 55, 33, 0.42)' : COLORS.green, color: t === 'transcript' ? COLORS.caramel : '#1e2830' }}>
                      {voiceSaveStatus === 'saving' ? 'Saving...' : voiceSaveStatus === 'saved' ? 'Saved!' : t === 'summary' ? 'Summary' : t === 'assignment' ? 'Assignment Proof' : t === 'reflection' ? 'Reflection' : 'Raw Transcript'}
                    </button>
                  ))}
                </div>
              </div>
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
        <Header title="Photo Insight." onBack={() => { setActiveTool('none'); setPhotoImage(null); setPhotoResult(''); setPhotoFocus(''); }} />
        <div className="max-w-2xl space-y-6">
          {!photoImage ? (
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
          ) : (
            <div className="space-y-6">
              <div className="relative">
                <img src={photoImage} alt="Selected" className="w-full rounded-[2rem]" />
                <button onClick={() => { setPhotoImage(null); setPhotoResult(''); }} className="absolute top-3 right-3 p-2 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}>✕</button>
              </div>
              <div>
                <label style={{ color: COLORS.cream }} className="block font-serif mb-2 text-sm">What should the AI focus on? (optional)</label>
                <Input value={photoFocus} onChange={setPhotoFocus} placeholder='e.g. the label on the bottle, the math problem...' />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { mode: 'find-text' as const, label: 'Find Text' },
                  { mode: 'identify' as const, label: 'Identify Subject' },
                  { mode: 'summarize' as const, label: 'Summarize Picture' },
                ].map(b => (
                  <button key={b.mode} onClick={() => runPhotoInsight(b.mode)} disabled={photoLoading}
                    className="px-4 py-4 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                    style={{ backgroundColor: COLORS.green, color: '#1e2830' }}>{photoLoading ? '...' : b.label}</button>
                ))}
                <button onClick={savePhotoInsight} disabled={!photoResult || photoSaveStatus !== 'idle'}
                  className="px-4 py-4 rounded-xl font-bold text-sm transition-all disabled:opacity-30"
                  style={{ backgroundColor: photoSaveStatus === 'saved' ? '#22c55e' : COLORS.green, color: '#1e2830' }}>
                  {photoSaveStatus === 'saving' ? 'Saving...' : photoSaveStatus === 'saved' ? 'Saved!' : 'Save Result'}
                </button>
              </div>
              {photoLoading && <Spinner t="Analyzing photo..." />}
              {photoResult && !photoLoading && <Result result={photoResult} label="Analysis" />}
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
        <Header title="Fact Check." onBack={() => { setActiveTool('none'); setFactInput(''); setFactResult(''); setFactSources([]); }} />
        <div className="max-w-2xl space-y-6">
          <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-6">
            <p style={{ color: COLORS.cream }} className="text-sm leading-relaxed">
              <strong>Type something you heard or read</strong> and the AI will check if it's true using Google Search. It'll tell you if it's true, false, or somewhere in between.
            </p>
          </div>
          <div>
            <label style={{ color: COLORS.cream }} className="block font-serif mb-3">What do you want to check?</label>
            <Input value={factInput} onChange={setFactInput} placeholder='"The Great Wall of China is visible from space"' multiline onEnter={runFactCheck} />
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
        <Header title="Word Wizard." onBack={() => { setActiveTool('none'); setVocabInput(''); setVocabResult(''); setVocabMode(null); }} />
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
        <Header title="Study Chat." onBack={() => { setActiveTool('none'); setChatMode('choose'); setChatInput(''); setChatMessages([]); stopChatLive(); }} />
        <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-6">
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
            <button onClick={() => { setChatMode('voice'); startChatLive(); }} className="p-6 rounded-[2rem] font-bold text-sm transition-all flex flex-col items-center gap-3 glass-tile-tinted adhd-card" style={{ color: COLORS.cream }}>
              <div className="scale-[1.5]">{Icons.Mic()}</div>Talk
            </button>
          </div>
        )}
        {chatMode === 'text' && (
          <div className="max-w-2xl space-y-4">
            {chatMessages.length > 0 && (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {chatMessages.map((m, i) => (
                  <div key={i} className={`p-4 rounded-[1.5rem] ${m.role === 'user' ? 'ml-8' : 'mr-8'}`}
                    style={{ backgroundColor: m.role === 'user' ? COLORS.green + '30' : 'rgba(81, 55, 33, 0.42)' }}>
                    <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: m.role === 'user' ? COLORS.green : COLORS.caramel }}>{m.role === 'user' ? 'You' : 'Study Buddy'}</p>
                    <p style={{ color: COLORS.cream }} className="leading-relaxed text-sm whitespace-pre-wrap">{m.text}</p>
                  </div>
                ))}
              </div>
            )}
            {chatLoading && <Spinner t="Thinking..." />}
            <div className="flex gap-3">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask your question..."
                className="flex-1 px-4 py-3 rounded-lg focus:outline-none" style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)', color: COLORS.cream }}
                onKeyDown={e => { if (e.key === 'Enter') runStudyChat(); }} />
              <button onClick={runStudyChat} disabled={!chatInput.trim() || chatLoading} className="px-6 py-3 rounded-lg font-bold transition-all disabled:opacity-50" style={{ backgroundColor: COLORS.green, color: '#1e2830' }}>Ask</button>
            </div>
          </div>
        )}
        {chatMode === 'voice' && (
          <div className="flex flex-col items-center space-y-8 max-w-md mx-auto">
            <div className={`w-28 h-28 rounded-full flex items-center justify-center transition-all shadow-xl ${chatLiveActive ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: chatLiveActive ? COLORS.green : 'rgba(81, 55, 33, 0.42)' }}>
              <div className="scale-[2]" style={{ color: chatLiveActive ? '#1e2830' : COLORS.cream }}>{Icons.Chat()}</div>
            </div>
            <p className="font-bold text-sm" style={{ color: chatLiveActive ? COLORS.green : COLORS.caramel }}>{chatLiveStatus || 'Ready'}</p>
            {chatLiveTranscript && (
              <div className="w-full p-5 rounded-[2rem] max-h-[200px] overflow-y-auto" style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)' }}>
                <p style={{ color: COLORS.cream }} className="text-sm leading-relaxed">{chatLiveTranscript}</p>
              </div>
            )}
            <button onClick={chatLiveActive ? stopChatLive : startChatLive} className="w-full max-w-xs py-4 rounded-xl font-bold text-sm shadow-lg transition-all"
              style={{ backgroundColor: chatLiveActive ? '#ef4444' : COLORS.green, color: chatLiveActive ? '#fff' : '#1e2830' }}>
              {chatLiveActive ? 'End Conversation' : 'Start Talking'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ==================== RESEARCHER ====================
  if (activeTool === 'search') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="Researcher." onBack={() => { setActiveTool('none'); setResearchMode('choose'); setSearchInput(''); setSearchResult(''); setSearchSources([]); stopResearchLive(); }} />
        <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-6">
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
            <button onClick={() => { setResearchMode('voice'); startResearchLive(); }} className="p-6 rounded-[2rem] font-bold text-sm transition-all flex flex-col items-center gap-3 glass-tile-tinted adhd-card" style={{ color: COLORS.cream }}>
              <div className="scale-[1.5]">{Icons.Mic()}</div>Talk
            </button>
          </div>
        )}
        {researchMode === 'text' && (
          <div className="max-w-2xl space-y-6">
            <div>
              <label style={{ color: COLORS.cream }} className="block font-serif mb-3">What do you want to research?</label>
              <Input value={searchInput} onChange={setSearchInput} placeholder="Ask about any topic..." onEnter={runResearcher} />
            </div>
            <Btn onClick={runResearcher} disabled={!searchInput.trim() || searchLoading}>{searchLoading ? 'Researching...' : 'Research'}</Btn>
            {searchLoading && <Spinner t="Searching the web..." />}
            {searchResult && !searchLoading && (
              <div className="space-y-6"><Result result={searchResult} label="Findings" /><Sources sources={searchSources} /></div>
            )}
          </div>
        )}
        {researchMode === 'voice' && (
          <div className="flex flex-col items-center space-y-8 max-w-md mx-auto">
            <div className={`w-28 h-28 rounded-full flex items-center justify-center transition-all shadow-xl ${researchLiveActive ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: researchLiveActive ? COLORS.green : 'rgba(81, 55, 33, 0.42)' }}>
              <div className="scale-[2]" style={{ color: researchLiveActive ? '#1e2830' : COLORS.cream }}>{Icons.Search()}</div>
            </div>
            <p className="font-bold text-sm" style={{ color: researchLiveActive ? COLORS.green : COLORS.caramel }}>{researchLiveStatus || 'Ready'}</p>
            {researchLiveTranscript && (
              <div className="w-full p-5 rounded-[2rem] max-h-[200px] overflow-y-auto" style={{ backgroundColor: 'rgba(81, 55, 33, 0.42)' }}>
                <p style={{ color: COLORS.cream }} className="text-sm leading-relaxed">{researchLiveTranscript}</p>
              </div>
            )}
            <button onClick={researchLiveActive ? stopResearchLive : startResearchLive} className="w-full max-w-xs py-4 rounded-xl font-bold text-sm shadow-lg transition-all"
              style={{ backgroundColor: researchLiveActive ? '#ef4444' : COLORS.green, color: researchLiveActive ? '#fff' : '#1e2830' }}>
              {researchLiveActive ? 'End Conversation' : 'Start Talking'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ==================== VISUALIZER (unchanged) ====================
  if (activeTool === 'visualizer') {
    return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-24">
        <Header title="Visualizer." onBack={() => { setActiveTool('none'); setVizInput(''); setVizImage(''); setVizText(''); }} />
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
        <Header title="Manual Lookup." onBack={() => { setActiveTool('none'); setManualInput(''); setManualResult(''); setManualSources([]); }} />
        <div className="max-w-2xl space-y-6">
          <div className="glass-tile-tinted rounded-[2rem] p-5 md:p-6">
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
              <Result result={manualResult} label="Instructions" />
              <Sources sources={manualSources} />
              <Btn onClick={saveManualToGallery}>Save to Gallery</Btn>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default Toolbox;
