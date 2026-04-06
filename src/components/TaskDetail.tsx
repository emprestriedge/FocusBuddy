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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
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
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic error:", err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

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
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] font-bold uppercase tracking-[0.3em] block" style={{ color: COLORS.caramel }}>Voice Summary</label>
                      <button onClick={isRecording ? stopRecording : startRecording} className={`p-3 rounded-full transition-all shadow-md ${isRecording ? 'bg-red-500 animate-pulse' : ''}`} style={!isRecording ? { backgroundColor: COLORS.green, color: COLORS.cream } : { color: 'white' }}>
                        <div className="scale-110">{isRecording ? <Icons.Check /> : <Icons.Mic />}</div>
                      </button>
                    </div>
                    <div className="relative">
                      <textarea
                        value={reflection}
                        onChange={(e) => setReflection(e.target.value)}
                        placeholder={isRecording ? "Listening..." : "Tell me what you learned..."}
                        className="w-full h-40 p-6 rounded-[2rem] font-serif text-xl resize-none leading-relaxed overflow-y-auto border outline-none"
                        style={{ background: 'rgba(81, 55, 33, 0.42)', borderColor: 'rgba(81, 55, 33, 0.45)', color: COLORS.cream }}
                      />
                      {isTranscribing && (
                        <div className="absolute inset-0 rounded-[2rem] flex items-center justify-center" style={{ background: 'rgba(60, 37, 32, 0.3)', backdropFilter: 'blur(2px)' }}>
                          <div className="flex space-x-2">
                            <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: COLORS.green }}></div>
                            <div className="w-2 h-2 rounded-full animate-bounce [animation-delay:0.2s]" style={{ backgroundColor: COLORS.green }}></div>
                            <div className="w-2 h-2 rounded-full animate-bounce [animation-delay:0.4s]" style={{ backgroundColor: COLORS.green }}></div>
                          </div>
                        </div>
                      )}
                    </div>
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
