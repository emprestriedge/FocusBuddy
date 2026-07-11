import React, { useState, useEffect, useRef } from 'react';
import { Task } from '../types';
import { Icons, COLORS } from '../constants';
import { geminiService } from '../services/geminiService';

interface TaskDetailProps {
  task: Task;
  onClose: () => void;
  onToggleComplete: (id: string, photoUrl: string, reflection: string, showInGallery: boolean) => void;
}

const compressImage = (base64Str: string, maxWidth = 800, quality = 0.75): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64Str);
  });
};

/**
 * Play a short beep tone using the Web Audio API.
 * freq: Hz, duration: seconds, type: 'start' or 'stop'
 */
const playBeep = (type: 'start' | 'stop' | 'countdown') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'start') {
      // Two ascending tones
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.setValueAtTime(900, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'stop') {
      // Two descending tones
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.setValueAtTime(500, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else {
      // Short tick for countdown
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    }
  } catch (e) {
    // Audio not supported — fail silently
  }
};

const TaskDetail: React.FC<TaskDetailProps> = ({ task, onClose, onToggleComplete }) => {
  const [reflection, setReflection] = useState(task.reflectionText || '');
  const [photoUrl, setPhotoUrl] = useState(task.photoUrl || '');
  const [saveToGallery, setSaveToGallery] = useState(task.showInGallery || false);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [recordingCountdown, setRecordingCountdown] = useState<number | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const recordingTimerRef = useRef<number | null>(null);

  const needsPhoto = task.accountabilityType === 'photo' || task.accountabilityType === 'both';
  const needsVoice = task.accountabilityType === 'voice' || task.accountabilityType === 'both';

  useEffect(() => {
    if (needsVoice && !task.completed) {
      setLoadingPrompts(true);
      geminiService.generateReflectionPrompts(task.name, task.description)
        .then(p => { setPrompts(p); setLoadingPrompts(false); })
        .catch(() => setLoadingPrompts(false));
    }
  }, [task]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const compressed = await compressImage(ev.target?.result as string);
        setPhotoUrl(compressed);
      };
      reader.readAsDataURL(file);
    }
  };

  // Clean up recording timer on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      // Request mic access first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 3-2-1 countdown before recording begins
      setRecordingCountdown(3);
      playBeep('countdown');

      await new Promise<void>((resolve) => {
        let count = 3;
        const interval = setInterval(() => {
          count--;
          if (count > 0) {
            setRecordingCountdown(count);
            playBeep('countdown');
          } else {
            clearInterval(interval);
            setRecordingCountdown(null);
            resolve();
          }
        }, 700);
      });

      // Start recording
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        // Stop recording timer
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        // Stop all mic tracks
        stream.getTracks().forEach(track => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          setIsTranscribing(true);
          const transcription = await geminiService.transcribeAudio(base64Audio);
          if (transcription && transcription.trim() && !transcription.includes("couldn't transcribe")) {
            setReflection(prev => prev ? `${prev} ${transcription}` : transcription);
          }
          setIsTranscribing(false);
        };
        reader.readAsDataURL(audioBlob);
      };

      // Play start beep and begin
      playBeep('start');
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      // Start the recording timer
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Mic error:", err);
      setIsRecording(false);
      setRecordingCountdown(null);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      playBeep('stop');
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
  };

  const formatRecordingTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const handleSubmit = () => {
    if (!task.completed) {
      setSaveStatus('saving');
      setTimeout(() => {
        setSaveStatus('saved');
        setTimeout(() => {
          onToggleComplete(task.id, photoUrl, reflection, saveToGallery);
        }, 300);
      }, 600);
    } else {
      onToggleComplete(task.id, photoUrl, reflection, saveToGallery);
    }
  };

  const isCompleteDisabled = (needsPhoto && !photoUrl) || (needsVoice && !reflection.trim());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 backdrop-blur-xl" style={{ background: 'rgba(60, 37, 32, 0.6)' }} onClick={onClose} />

      {/* Photo picker modal */}
      {showPicker && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowPicker(false)}>
          <div className="glass-card w-full max-w-xs rounded-[2rem] p-8 space-y-4 animate-in zoom-in duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => { cameraInputRef.current?.click(); setShowPicker(false); }} className="w-full py-5 rounded-2xl font-bold text-[10px] uppercase tracking-[0.2em] hover:scale-105 transition-transform" style={{ backgroundColor: COLORS.green, color: COLORS.cream }}>Take Photo</button>
            <button onClick={() => { galleryInputRef.current?.click(); setShowPicker(false); }} className="w-full py-5 glass-tile-tinted rounded-2xl font-bold text-[10px] uppercase tracking-[0.2em] hover:scale-105 transition-transform border" style={{ color: COLORS.cream, borderColor: 'rgba(122, 99, 80, 0.30)' }}>Choose from Library</button>
            <button onClick={() => setShowPicker(false)} className="w-full py-3 font-bold text-[8px] uppercase tracking-widest" style={{ color: COLORS.caramel }}>Cancel</button>
          </div>
        </div>
      )}

      <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleImageUpload} />
      <input type="file" ref={galleryInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />

      <div className="glass-card w-full max-w-2xl rounded-[2.5rem] overflow-hidden relative animate-in slide-in-from-bottom-8 duration-500 shadow-2xl">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full transition-all z-10" style={{ background: 'rgba(122, 99, 80, 0.30)', color: COLORS.cream }}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="p-8 md:p-12 space-y-8 max-h-[85vh] overflow-y-auto">
          <header className="space-y-3">
            <h2 className={`text-4xl md:text-5xl font-serif leading-tight ${task.completed ? 'opacity-30' : ''}`} style={{ color: COLORS.cream }}>{task.name}</h2>
            {task.description && <p className="text-lg font-light leading-relaxed" style={{ color: COLORS.caramel }}>{task.description}</p>}
            {!task.completed && (
              <div className="flex gap-2">
                {needsPhoto && <span className="text-[8px] font-bold uppercase tracking-widest px-3 py-1 rounded-full" style={{ background: 'rgba(67, 118, 108, 0.15)', color: COLORS.green }}>📷 Photo required</span>}
                {needsVoice && <span className="text-[8px] font-bold uppercase tracking-widest px-3 py-1 rounded-full" style={{ background: 'rgba(67, 118, 108, 0.15)', color: COLORS.green }}>🎤 Voice summary required</span>}
              </div>
            )}
          </header>

          <div className="space-y-8">
            {!task.completed ? (
              <>
                {needsPhoto && (
                  <div className="space-y-3">
                    <label className="text-[9px] font-bold uppercase tracking-[0.3em] block" style={{ color: COLORS.caramel }}>Photo Proof</label>
                    {photoUrl ? (
                      <div className="relative aspect-video rounded-3xl overflow-hidden group shadow-lg">
                        <img src={photoUrl} className="w-full h-full object-cover" alt="Proof" />
                        <button onClick={() => setPhotoUrl('')} className="absolute top-4 right-4 p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.6)', color: 'white' }}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setShowPicker(true)} className="w-full py-14 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center transition-all group" style={{ borderColor: 'rgba(122, 99, 80, 0.30)', color: COLORS.caramel }}>
                        <div className="scale-150 mb-6 group-hover:scale-110 transition-transform"><Icons.Camera /></div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Tap to Add Proof</span>
                      </button>
                    )}
                    <div className="flex items-center space-x-3 px-2">
                      <input type="checkbox" id="saveToGallery" checked={saveToGallery} onChange={(e) => setSaveToGallery(e.target.checked)} className="w-4 h-4 rounded accent-[#5DD3B6]" />
                      <label htmlFor="saveToGallery" className="text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none" style={{ color: COLORS.caramel }}>Save to Gallery</label>
                    </div>
                  </div>
                )}

                {needsVoice && (
                  <div className="space-y-5">
                    <label className="text-[9px] font-bold uppercase tracking-[0.3em] block" style={{ color: COLORS.caramel }}>Voice Summary</label>

                    {/* Countdown overlay */}
                    {recordingCountdown !== null && (
                      <div className="flex flex-col items-center justify-center py-10 rounded-[2rem] animate-in zoom-in duration-300" style={{ background: 'rgba(81, 55, 33, 0.6)' }}>
                        <div className="text-7xl font-serif animate-pulse" style={{ color: COLORS.green }}>{recordingCountdown}</div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] mt-4" style={{ color: COLORS.caramel }}>Get ready to speak...</p>
                      </div>
                    )}

                    {/* Recording state — large, unmissable */}
                    {isRecording && recordingCountdown === null && (
                      <div className="rounded-[2rem] p-6 space-y-5 animate-in fade-in duration-500" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '2px solid rgba(239, 68, 68, 0.35)' }}>
                        {/* Recording header with timer */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/30"></div>
                            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-red-400">Recording</span>
                          </div>
                          <span className="font-mono text-2xl font-bold text-red-400">{formatRecordingTime(recordingSeconds)}</span>
                        </div>

                        {/* Animated waveform bars */}
                        <div className="flex items-center justify-center gap-1 h-16">
                          {Array.from({ length: 20 }).map((_, i) => (
                            <div
                              key={i}
                              className="w-1.5 rounded-full"
                              style={{
                                backgroundColor: COLORS.green,
                                opacity: 0.6,
                                height: `${20 + Math.random() * 80}%`,
                                animation: `waveBar 0.5s ease-in-out ${i * 0.05}s infinite alternate`,
                              }}
                            />
                          ))}
                        </div>

                        {/* Large stop button */}
                        <button
                          onClick={stopRecording}
                          className="w-full py-5 rounded-2xl font-bold text-[11px] uppercase tracking-[0.3em] transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 shadow-lg"
                          style={{ backgroundColor: 'rgba(239, 68, 68, 0.9)', color: 'white' }}
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                          Stop Recording
                        </button>
                      </div>
                    )}

                    {/* Start recording button — only when NOT recording and NOT in countdown */}
                    {!isRecording && recordingCountdown === null && (
                      <button
                        onClick={startRecording}
                        disabled={isTranscribing}
                        className="w-full py-6 rounded-[2rem] flex flex-col items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 border-2 border-dashed disabled:opacity-30"
                        style={{ borderColor: COLORS.green, background: 'rgba(93, 211, 182, 0.06)' }}
                      >
                        <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg" style={{ backgroundColor: COLORS.green, color: COLORS.cream }}>
                          <Icons.Mic />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: COLORS.green }}>Tap to Record</span>
                        <span className="text-[8px] uppercase tracking-widest" style={{ color: COLORS.caramel }}>A 3-second countdown will start</span>
                      </button>
                    )}

                    {/* Textarea for transcript */}
                    <div className="relative">
                      <textarea
                        value={reflection}
                        onChange={(e) => setReflection(e.target.value)}
                        placeholder={isRecording ? "Speak now — your words will appear here..." : "Tell me what you learned..."}
                        className="w-full h-40 p-6 rounded-[2rem] font-serif text-xl resize-none leading-relaxed overflow-y-auto border outline-none"
                        style={{ background: 'rgba(81, 55, 33, 0.42)', borderColor: isRecording ? 'rgba(239, 68, 68, 0.35)' : 'rgba(81, 55, 33, 0.45)', color: COLORS.cream }}
                      />
                      {isTranscribing && (
                        <div className="absolute inset-0 rounded-[2rem] flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(60, 37, 32, 0.5)', backdropFilter: 'blur(4px)' }}>
                          <div className="flex space-x-2">
                            <div className="w-3 h-3 rounded-full animate-bounce" style={{ backgroundColor: COLORS.green }}></div>
                            <div className="w-3 h-3 rounded-full animate-bounce [animation-delay:0.2s]" style={{ backgroundColor: COLORS.green }}></div>
                            <div className="w-3 h-3 rounded-full animate-bounce [animation-delay:0.4s]" style={{ backgroundColor: COLORS.green }}></div>
                          </div>
                          <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: COLORS.cream }}>Transcribing your voice...</span>
                        </div>
                      )}
                    </div>

                    {/* Reflection prompts */}
                    {loadingPrompts ? (
                      <div className="flex space-x-2 px-2">
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: COLORS.caramel }}></div>
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse [animation-delay:0.2s]" style={{ backgroundColor: COLORS.caramel }}></div>
                      </div>
                    ) : prompts.length > 0 && (
                      <div className="flex flex-wrap gap-2 px-2">
                        {prompts.map((p, idx) => (
                          <button key={idx} onClick={() => setReflection(prev => prev ? `${prev} ${p}` : p)} className="px-4 py-2 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all border" style={{ background: 'rgba(81, 55, 33, 0.42)', borderColor: 'rgba(122, 99, 80, 0.30)', color: COLORS.caramel }}>
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={saveStatus !== 'idle' || isCompleteDisabled}
                  className={`w-full py-6 rounded-full font-bold text-[10px] uppercase tracking-[0.4em] transition-all shadow-xl mt-4 flex items-center justify-center space-x-2 disabled:opacity-30 ${
                    saveStatus === 'saved' ? 'bg-green-500' : ''
                  }`}
                  style={saveStatus !== 'saved' ? { backgroundColor: COLORS.green, color: COLORS.cream } : { color: COLORS.cream }}
                >
                  {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? <><Icons.Check /><span>Done!</span></> : 'Complete Task'}
                </button>
                {isCompleteDisabled && (
                  <p className="text-center text-[8px] font-bold uppercase tracking-widest mt-3" style={{ color: COLORS.caramel, opacity: 0.5 }}>
                    {needsPhoto && !photoUrl && needsVoice && !reflection.trim() ? 'Photo and voice summary required.' : needsPhoto && !photoUrl ? 'Photo required.' : 'Voice summary required.'}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-8 animate-in fade-in duration-1000">
                {task.photoUrl && (
                  <div className="rounded-[2.5rem] overflow-hidden shadow-2xl">
                    <img src={task.photoUrl} className="w-full h-auto" alt="Completed Proof" />
                  </div>
                )}
                {task.reflectionText && (
                  <div className="p-8 rounded-[2.5rem] font-serif text-2xl leading-relaxed shadow-inner" style={{ background: 'rgba(81, 55, 33, 0.42)', color: COLORS.caramel }}>
                    "{task.reflectionText}"
                  </div>
                )}
                <div className="flex flex-col items-center space-y-4 pt-6">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-2xl" style={{ backgroundColor: COLORS.green, color: COLORS.cream }}>
                    <Icons.Check />
                  </div>
                  <h3 className="text-3xl font-serif" style={{ color: COLORS.cream }}>Done.</h3>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetail;
