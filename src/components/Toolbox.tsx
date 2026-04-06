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

type ActiveTool = 'none' | 'voice' | 'lego' | 'vocab' | 'chat' | 'search' | 'visualizer' | 'photo' | 'manual';
type OpenFolder = 'none' | 'study' | 'handson';

const Toolbox: React.FC<ToolboxProps> = ({ onReturnToToday, onTasksUpdated }) => {
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [openFolder, setOpenFolder] = useState<OpenFolder>('none');

  // Voice Note state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [recentNotes, setRecentNotes] = useState<VoiceNote[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Master Builder state
  const [builderPrompt, setBuilderPrompt] = useState('');
  const [builderImage, setBuilderImage] = useState<string | null>(null);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderResult, setBuilderResult] = useState<string>('');

  // Word Wizard state
  const [vocabInput, setVocabInput] = useState('');
  const [vocabLoading, setVocabLoading] = useState(false);
  const [vocabResult, setVocabResult] = useState('');

  // Study Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatResult, setChatResult] = useState('');

  // Researcher state
  const [searchInput, setSearchInput] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState('');
  const [searchSources, setSearchSources] = useState<GroundingSource[]>([]);

  // Visualizer state
  const [vizInput, setVizInput] = useState('');
  const [vizLoading, setVizLoading] = useState(false);
  const [vizImage, setVizImage] = useState<string>('');
  const [vizText, setVizText] = useState('');

  // Photo Insight state
  const [photoImage, setPhotoImage] = useState<string | null>(null);
  const [photoMode, setPhotoMode] = useState<'pull-text' | 'summarize' | 'explain' | 'identify'>('pull-text');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoResult, setPhotoResult] = useState('');

  // Manual Lookup state
  const [manualInput, setManualInput] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState('');
  const [manualSources, setManualSources] = useState<GroundingSource[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Load recent notes on mount
  useEffect(() => {
    const loadRecentNotes = async () => {
      const notes = storageService.getVoiceNotes();
      setRecentNotes(notes.slice(0, 5).reverse());
    };
    loadRecentNotes();
  }, []);

  // Utility: compress image
  const compressImage = async (base64: string, maxWidth = 800, quality = 0.75): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    });
  };

  // Utility: format file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Utility: save to gallery (create a task)
  const saveToGallery = async (name: string, description: string, reflectionText: string) => {
    const task: Task = {
      id: Math.random().toString(36).slice(2),
      date: new Date().toISOString().split('T')[0],
      name,
      description,
      accountabilityType: 'none',
      completed: true,
      showInGallery: true,
      reflectionText,
      completedAt: new Date().toISOString(),
    };

    storageService.addTasks([task]);
    if (onTasksUpdated) {
      onTasksUpdated(storageService.getTasks());
    }
  };

  // ========== VOICE NOTE IMPLEMENTATION ==========
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/wav' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTranscript('');
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    setIsTranscribing(true);

    mediaRecorderRef.current?.stop();
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
      const reader = new FileReader();

      reader.onload = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        try {
          const transcribed = await geminiService.transcribeAudio(base64Audio);
          setTranscript(transcribed);
        } catch (error) {
          console.error('Transcription error:', error);
          setTranscript('Error transcribing audio. Please try again.');
        } finally {
          setIsTranscribing(false);
        }
      };

      reader.readAsDataURL(audioBlob);
    };
    }
  };

  const saveVoiceNote = async (type: 'summary' | 'reflection' | 'assignment' | 'transcript') => {
    try {
      let processedText = transcript;
      let title = '';

      if (type === 'summary') {
        title = 'Voice Note Summary';
        processedText = await geminiService.transformVoiceNote(transcript, 'summary');
      } else if (type === 'reflection') {
        title = 'Voice Note Reflection';
        processedText = await geminiService.transformVoiceNote(transcript, 'reflection');
      } else if (type === 'assignment') {
        title = 'Voice Note Assignment';
        processedText = await geminiService.transformVoiceNote(transcript, 'assignment');
      } else {
        title = 'Voice Transcript';
      }

      await saveToGallery(title, 'Voice-captured insight', processedText);

      const voiceNote: VoiceNote = {
        id: Math.random().toString(36).slice(2),
        date: new Date().toISOString().split('T')[0],
        transcript,
        processedType: type,
        processedText,
      };

      storageService.addVoiceNote(voiceNote);
      setRecentNotes([voiceNote, ...recentNotes.slice(0, 4)]);
      setTranscript('');
    } catch (error) {
      console.error('Error saving voice note:', error);
    }
  };

  const deleteVoiceNote = (noteId: string) => {
    storageService.deleteVoiceNote(noteId);
    setRecentNotes(recentNotes.filter((n) => n.id !== noteId));
  };

  // ========== MASTER BUILDER IMPLEMENTATION ==========
  const handleBuilderImageSelect = async (file: File) => {
    const base64 = await fileToBase64(file);
    const compressed = await compressImage(base64);
    setBuilderImage(compressed);
  };

  const runMasterBuilder = async () => {
    if (!builderPrompt || !builderImage) return;

    setBuilderLoading(true);
    try {
      const base64Data = builderImage.split(',')[1];
      const result = await geminiService.masterBuilderMultimodal(base64Data, builderPrompt);
      setBuilderResult(result);
    } catch (error) {
      console.error('Master Builder error:', error);
      setBuilderResult('Error analyzing image. Please try again.');
    } finally {
      setBuilderLoading(false);
    }
  };

  const saveMasterBuilderFix = async () => {
    try {
      const formatted = await geminiService.transformMasterBuilderFix(builderResult);
      await saveToGallery('Master Builder Fix', 'Problem diagnosis', formatted);
      setBuilderResult('');
      setBuilderPrompt('');
      setBuilderImage(null);
    } catch (error) {
      console.error('Error saving master builder fix:', error);
    }
  };

  // ========== WORD WIZARD IMPLEMENTATION ==========
  const runWordWizard = async () => {
    if (!vocabInput) return;

    setVocabLoading(true);
    try {
      const result = await geminiService.shopHelp(vocabInput, 'vocab');
      setVocabResult(result);
    } catch (error) {
      console.error('Word Wizard error:', error);
      setVocabResult('Error looking up word. Please try again.');
    } finally {
      setVocabLoading(false);
    }
  };

  // ========== STUDY CHAT IMPLEMENTATION ==========
  const runStudyChat = async (prefix: string) => {
    const fullQuery = prefix + chatInput;

    setChatLoading(true);
    try {
      const result = await geminiService.shopHelp(fullQuery, 'general');
      setChatResult(result);
    } catch (error) {
      console.error('Study Chat error:', error);
      setChatResult('Error getting help. Please try again.');
    } finally {
      setChatLoading(false);
    }
  };

  // ========== RESEARCHER IMPLEMENTATION ==========
  const runResearcher = async () => {
    if (!searchInput) return;

    setSearchLoading(true);
    try {
      const result = await geminiService.searchHelp(searchInput);
      setSearchResult(result.text);
      setSearchSources(result.sources || []);
    } catch (error) {
      console.error('Researcher error:', error);
      setSearchResult('Error searching. Please try again.');
      setSearchSources([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // ========== VISUALIZER IMPLEMENTATION ==========
  const runVisualizer = async (prompt?: string) => {
    const fullPrompt = prompt ? `${prompt}: ${vizInput}` : vizInput;

    if (!fullPrompt) return;

    setVizLoading(true);
    try {
      const result = await geminiService.generateIllustration(fullPrompt);
      setVizImage(result.image);
      setVizText(result.text);
    } catch (error) {
      console.error('Visualizer error:', error);
      setVizText('Error generating visualization. Please try again.');
    } finally {
      setVizLoading(false);
    }
  };

  // ========== PHOTO INSIGHT IMPLEMENTATION ==========
  const handlePhotoSelect = async (file: File) => {
    const base64 = await fileToBase64(file);
    const compressed = await compressImage(base64);
    setPhotoImage(compressed);
  };

  const runPhotoInsight = async () => {
    if (!photoImage) return;

    setPhotoLoading(true);
    try {
      const base64Data = photoImage.split(',')[1];

      let modePrompt = '';
      if (photoMode === 'pull-text') {
        modePrompt = 'Extract and transcribe all text visible in this image.';
      } else if (photoMode === 'summarize') {
        modePrompt = 'Provide a concise summary of the main content in this image.';
      } else if (photoMode === 'explain') {
        modePrompt = 'Explain in detail what is shown in this image and why it matters.';
      } else if (photoMode === 'identify') {
        modePrompt = 'Identify all objects, concepts, and elements in this image.';
      }

      const result = await geminiService.analyzeImage(base64Data, modePrompt);
      setPhotoResult(result);
    } catch (error) {
      console.error('Photo Insight error:', error);
      setPhotoResult('Error analyzing image. Please try again.');
    } finally {
      setPhotoLoading(false);
    }
  };

  const savePhotoInsight = async () => {
    if (photoResult) {
      await saveToGallery('Photo Insight', `Photo analysis (${photoMode})`, photoResult);
      setPhotoImage(null);
      setPhotoResult('');
      setPhotoMode('pull-text');
    }
  };

  // ========== MANUAL LOOKUP IMPLEMENTATION ==========
  const runManualLookup = async () => {
    if (!manualInput) return;

    setManualLoading(true);
    try {
      const result = await geminiService.shopHelp(manualInput, 'manual');
      setManualResult(result);
      setManualSources([]);
    } catch (error) {
      console.error('Manual Lookup error:', error);
      setManualResult('Error finding instructions. Please try again.');
      setManualSources([]);
    } finally {
      setManualLoading(false);
    }
  };

  const saveManualToGallery = async () => {
    if (manualResult) {
      try {
        const formatted = await geminiService.formatManualForGallery(manualResult);
        await saveToGallery('Manual Reference', 'Instructions and guide', formatted);
        setManualResult('');
        setManualInput('');
        setManualSources([]);
      } catch (error) {
        console.error('Error saving manual:', error);
      }
    }
  };

  // ========== RENDER: MAIN GRID ==========
  if (activeTool === 'none' && openFolder === 'none') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Tools</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Toolbox.</h2>
          </div>
        </header>

        {/* Main Tools */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Voice Note */}
          <div
            className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
            onClick={() => setActiveTool('voice')}
          >
            <div className="text-4xl mb-4">{Icons.Mic}</div>
            <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">
              Voice Note
            </h3>
            <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">
              Record and save
            </p>
          </div>

          {/* Master Builder */}
          <div
            className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
            onClick={() => setActiveTool('lego')}
          >
            <div className="text-4xl mb-4">{Icons.Lego}</div>
            <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">
              Master Builder
            </h3>
            <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">
              Build diagnostics
            </p>
          </div>

          {/* Word Wizard */}
          <div
            className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
            onClick={() => setActiveTool('vocab')}
          >
            <div className="text-4xl mb-4">{Icons.Vocabulary}</div>
            <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">
              Word Wizard
            </h3>
            <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">
              Words and origins
            </p>
          </div>
        </div>

        {/* Folders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Study Tools Folder */}
          <div
            className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
            onClick={() => setOpenFolder('study')}
          >
            <div className="text-4xl mb-4">📁</div>
            <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">
              Study Tools
            </h3>
            <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">
              3 tools inside
            </p>
          </div>

          {/* Hands-On Folder */}
          <div
            className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
            onClick={() => setOpenFolder('handson')}
          >
            <div className="text-4xl mb-4">📁</div>
            <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">
              Hands-On
            </h3>
            <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">
              2 tools inside
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ========== RENDER: STUDY TOOLS FOLDER ==========
  if (openFolder === 'study') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Tools</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Study Tools.</h2>
          </div>
          <button
            onClick={() => setOpenFolder('none')}
            className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{ backgroundColor: COLORS.green, color: '#1e2830' }}
          >
            ← Back
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Study Chat */}
          <div
            className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
            onClick={() => setActiveTool('chat')}
          >
            <div className="text-4xl mb-4">{Icons.Chat}</div>
            <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">
              Study Chat
            </h3>
            <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">
              Homework help
            </p>
          </div>

          {/* Researcher */}
          <div
            className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
            onClick={() => setActiveTool('search')}
          >
            <div className="text-4xl mb-4">{Icons.Search}</div>
            <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">
              Researcher
            </h3>
            <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">
              Fact checker
            </p>
          </div>

          {/* Visualizer */}
          <div
            className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
            onClick={() => setActiveTool('visualizer')}
          >
            <div className="text-4xl mb-4">{Icons.Visualizer}</div>
            <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">
              Visualizer
            </h3>
            <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">
              Diagrams and charts
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ========== RENDER: HANDS-ON FOLDER ==========
  if (openFolder === 'handson') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Tools</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Hands-On.</h2>
          </div>
          <button
            onClick={() => setOpenFolder('none')}
            className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{ backgroundColor: COLORS.green, color: '#1e2830' }}
          >
            ← Back
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Photo Insight */}
          <div
            className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
            onClick={() => setActiveTool('photo')}
          >
            <div className="text-4xl mb-4">{Icons.Camera}</div>
            <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">
              Photo Insight
            </h3>
            <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">
              Analyze photos
            </p>
          </div>

          {/* Manual Lookup */}
          <div
            className="glass-tile-tinted adhd-card p-5 md:p-8 rounded-[2rem] cursor-pointer transition-all"
            onClick={() => setActiveTool('manual')}
          >
            <div className="text-4xl mb-4">{Icons.Manual}</div>
            <h3 style={{ color: COLORS.cream }} className="text-xl md:text-2xl font-serif">
              Manual Lookup
            </h3>
            <p style={{ color: COLORS.caramel, opacity: 0.7 }} className="text-sm">
              Find instructions
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ========== RENDER: VOICE NOTE TOOL ==========
  if (activeTool === 'voice') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24 flex flex-col">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Toolbox</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Voice Note.</h2>
          </div>
          <button
            onClick={() => setActiveTool('none')}
            className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{ backgroundColor: COLORS.green, color: '#1e2830' }}
          >
            ← Back
          </button>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center">

          {!transcript ? (
            <div className="flex flex-col items-center gap-8">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing}
                className={`w-32 h-32 rounded-full font-bold text-lg transition-all flex items-center justify-center ${
                  isRecording ? 'animate-pulse' : ''
                }`}
                style={{
                  backgroundColor: isRecording ? '#ef4444' : COLORS.green,
                  color: COLORS.cream,
                }}
              >
                {isRecording ? 'Stop' : 'Record'}
              </button>

              {isTranscribing && (
                <p style={{ color: COLORS.caramel }}>Transcribing...</p>
              )}

              {recentNotes.length > 0 && (
                <div className="w-full mt-8 max-w-md">
                  <h3 style={{ color: COLORS.cream }} className="font-bold mb-4">
                    Recent Notes
                  </h3>
                  <div className="space-y-2">
                    {recentNotes.map((note) => (
                      <div
                        key={note.id}
                        className="p-3 rounded-lg flex items-center justify-between"
                        style={{
                          backgroundColor: 'rgba(81, 55, 33, 0.42)',
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          deleteVoiceNote(note.id);
                        }}
                      >
                        <div>
                          <p style={{ color: COLORS.cream }} className="text-sm font-semibold">
                            {note.date}
                          </p>
                          <p style={{ color: COLORS.caramel }} className="text-xs">
                            {note.processedType}
                          </p>
                        </div>
                        <span style={{ color: COLORS.caramel }} className="text-xs">
                          (long-press to delete)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full max-w-2xl">
              <div
                className="glass-tile-tinted rounded-[2rem] p-5 md:p-8 mb-8"
              >
                <h3 style={{ color: COLORS.cream }} className="font-serif mb-3">
                  Review Draft
                </h3>
                <p style={{ color: COLORS.cream }} className="leading-relaxed">
                  {transcript}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <button
                  onClick={() => saveVoiceNote('summary')}
                  className="px-4 py-3 rounded-lg font-semibold transition-all"
                  style={{
                    backgroundColor: COLORS.green,
                    color: COLORS.cream,
                  }}
                >
                  Summary
                </button>
                <button
                  onClick={() => saveVoiceNote('reflection')}
                  className="px-4 py-3 rounded-lg font-semibold transition-all"
                  style={{
                    backgroundColor: COLORS.green,
                    color: COLORS.cream,
                  }}
                >
                  Note
                </button>
                <button
                  onClick={() => saveVoiceNote('assignment')}
                  className="px-4 py-3 rounded-lg font-semibold transition-all"
                  style={{
                    backgroundColor: COLORS.green,
                    color: COLORS.cream,
                  }}
                >
                  Assignment
                </button>
                <button
                  onClick={() => saveVoiceNote('transcript')}
                  className="px-4 py-3 rounded-lg font-semibold transition-all"
                  style={{
                    backgroundColor: COLORS.green,
                    color: COLORS.cream,
                  }}
                >
                  Transcript
                </button>
              </div>

              <button
                onClick={() => setTranscript('')}
                className="w-full px-4 py-3 rounded-lg font-semibold transition-all"
                style={{
                  backgroundColor: 'rgba(81, 55, 33, 0.42)',
                  color: COLORS.caramel,
                }}
              >
                Start Over
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== RENDER: MASTER BUILDER TOOL ==========
  if (activeTool === 'lego') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Toolbox</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Master Builder.</h2>
          </div>
          <button
            onClick={() => setActiveTool('none')}
            className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{ backgroundColor: COLORS.green, color: '#1e2830' }}
          >
            ← Back
          </button>
        </header>

        <div className="max-w-2xl">
          {!builderResult ? (
            <div className="space-y-6">
              {/* Image Upload */}
              <div>
                <label
                  style={{ color: COLORS.cream }}
                  className="block font-serif mb-3"
                >
                  Upload Photo
                </label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-6 py-4 rounded-lg font-semibold transition-all"
                  style={{
                    backgroundColor: 'rgba(81, 55, 33, 0.42)',
                    color: COLORS.cream,
                    border: `2px solid ${COLORS.green}`,
                  }}
                >
                  {builderImage ? 'Photo Selected ✓' : 'Choose Photo'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleBuilderImageSelect(e.target.files[0]);
                    }
                  }}
                />
              </div>

              {/* Prompt Input */}
              <div>
                <label
                  style={{ color: COLORS.cream }}
                  className="block font-serif mb-3"
                >
                  What's the problem?
                </label>
                <textarea
                  value={builderPrompt}
                  onChange={(e) => setBuilderPrompt(e.target.value)}
                  placeholder="Describe the issue or what you want to analyze..."
                  className="w-full px-4 py-3 rounded-lg font-light focus:outline-none"
                  style={{
                    backgroundColor: 'rgba(81, 55, 33, 0.42)',
                    color: COLORS.cream,
                  }}
                  rows={4}
                />
              </div>

              <button
                onClick={runMasterBuilder}
                disabled={!builderImage || !builderPrompt || builderLoading}
                className="w-full px-6 py-4 rounded-lg font-bold transition-all disabled:opacity-50"
                style={{
                  backgroundColor: COLORS.green,
                  color: COLORS.cream,
                }}
              >
                {builderLoading ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div
                className="glass-tile-tinted rounded-[2rem] p-5 md:p-8"
              >
                <h3 style={{ color: COLORS.cream }} className="font-serif mb-3">
                  Diagnosis
                </h3>
                <p style={{ color: COLORS.cream }} className="leading-relaxed">
                  {builderResult}
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={saveMasterBuilderFix}
                  className="flex-1 px-6 py-3 rounded-lg font-bold transition-all"
                  style={{
                    backgroundColor: COLORS.green,
                    color: COLORS.cream,
                  }}
                >
                  Save to Gallery
                </button>
                <button
                  onClick={() => {
                    setBuilderResult('');
                    setBuilderPrompt('');
                    setBuilderImage(null);
                  }}
                  className="flex-1 px-6 py-3 rounded-lg font-bold transition-all"
                  style={{
                    backgroundColor: 'rgba(81, 55, 33, 0.42)',
                    color: COLORS.caramel,
                  }}
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== RENDER: WORD WIZARD TOOL ==========
  if (activeTool === 'vocab') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Toolbox</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Word Wizard.</h2>
          </div>
          <button
            onClick={() => setActiveTool('none')}
            className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{ backgroundColor: COLORS.green, color: '#1e2830' }}
          >
            ← Back
          </button>
        </header>

        <div className="max-w-2xl space-y-6">
          <div>
            <label
              style={{ color: COLORS.cream }}
              className="block font-serif mb-3"
            >
              What word?
            </label>
            <input
              type="text"
              value={vocabInput}
              onChange={(e) => setVocabInput(e.target.value)}
              placeholder="Enter a word..."
              className="w-full px-4 py-3 rounded-lg focus:outline-none"
              style={{
                backgroundColor: 'rgba(81, 55, 33, 0.42)',
                color: COLORS.cream,
              }}
            />
          </div>

          <button
            onClick={runWordWizard}
            disabled={!vocabInput || vocabLoading}
            className="w-full px-6 py-4 rounded-lg font-bold transition-all disabled:opacity-50"
            style={{
              backgroundColor: COLORS.green,
              color: COLORS.cream,
            }}
          >
            {vocabLoading ? 'Looking up...' : 'Look Up'}
          </button>

          {vocabResult && (
            <div
              className="glass-tile-tinted rounded-[2rem] p-5 md:p-8"
            >
              <h3 style={{ color: COLORS.cream }} className="font-serif mb-3">
                Word Info
              </h3>
              <p style={{ color: COLORS.cream }} className="leading-relaxed">
                {vocabResult}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== RENDER: STUDY CHAT TOOL ==========
  if (activeTool === 'chat') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Toolbox</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Study Chat.</h2>
          </div>
          <button
            onClick={() => setActiveTool('none')}
            className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{ backgroundColor: COLORS.green, color: '#1e2830' }}
          >
            ← Back
          </button>
        </header>

        <div className="max-w-2xl space-y-6">
          <div>
            <label
              style={{ color: COLORS.cream }}
              className="block font-serif mb-3"
            >
              Your Question
            </label>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask anything about your homework..."
              className="w-full px-4 py-3 rounded-lg focus:outline-none"
              style={{
                backgroundColor: 'rgba(81, 55, 33, 0.42)',
                color: COLORS.cream,
              }}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => runStudyChat('Explain: ')}
              disabled={!chatInput || chatLoading}
              className="px-4 py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50"
              style={{
                backgroundColor: COLORS.green,
                color: COLORS.cream,
              }}
            >
              Explain
            </button>
            <button
              onClick={() => runStudyChat('What should I do: ')}
              disabled={!chatInput || chatLoading}
              className="px-4 py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50"
              style={{
                backgroundColor: COLORS.green,
                color: COLORS.cream,
              }}
            >
              What do I do?
            </button>
            <button
              onClick={() => runStudyChat('Check my answer: ')}
              disabled={!chatInput || chatLoading}
              className="px-4 py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50"
              style={{
                backgroundColor: COLORS.green,
                color: COLORS.cream,
              }}
            >
              Check Answer
            </button>
          </div>

          {chatResult && (
            <div
              className="glass-tile-tinted rounded-[2rem] p-5 md:p-8"
            >
              <h3 style={{ color: COLORS.cream }} className="font-serif mb-3">
                Response
              </h3>
              <p style={{ color: COLORS.cream }} className="leading-relaxed">
                {chatResult}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== RENDER: RESEARCHER TOOL ==========
  if (activeTool === 'search') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Toolbox</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Researcher.</h2>
          </div>
          <button
            onClick={() => setActiveTool('none')}
            className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{ backgroundColor: COLORS.green, color: '#1e2830' }}
          >
            ← Back
          </button>
        </header>

        <div className="max-w-2xl space-y-6">
          <div>
            <label
              style={{ color: COLORS.cream }}
              className="block font-serif mb-3"
            >
              What do you want to research?
            </label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search for facts..."
              className="w-full px-4 py-3 rounded-lg focus:outline-none"
              style={{
                backgroundColor: 'rgba(81, 55, 33, 0.42)',
                color: COLORS.cream,
              }}
            />
          </div>

          <button
            onClick={runResearcher}
            disabled={!searchInput || searchLoading}
            className="w-full px-6 py-4 rounded-lg font-bold transition-all disabled:opacity-50"
            style={{
              backgroundColor: COLORS.green,
              color: COLORS.cream,
            }}
          >
            {searchLoading ? 'Researching...' : 'Research'}
          </button>

          {searchResult && (
            <div className="space-y-6">
              <div
                className="glass-tile-tinted rounded-[2rem] p-5 md:p-8"
              >
                <h3 style={{ color: COLORS.cream }} className="font-serif mb-3">
                  Findings
                </h3>
                <p style={{ color: COLORS.cream }} className="leading-relaxed">
                  {searchResult}
                </p>
              </div>

              {searchSources.length > 0 && (
                <div>
                  <h3 style={{ color: COLORS.cream }} className="font-serif mb-3">
                    Sources
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {searchSources.map((source, idx) => (
                      <a
                        key={idx}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-full text-sm font-semibold transition-all hover:opacity-80"
                        style={{
                          backgroundColor: COLORS.green,
                          color: COLORS.cream,
                        }}
                      >
                        {source.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== RENDER: VISUALIZER TOOL ==========
  if (activeTool === 'visualizer') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Toolbox</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Visualizer.</h2>
          </div>
          <button
            onClick={() => setActiveTool('none')}
            className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{ backgroundColor: COLORS.green, color: '#1e2830' }}
          >
            ← Back
          </button>
        </header>

        <div className="max-w-2xl space-y-6">
          <div>
            <label
              style={{ color: COLORS.cream }}
              className="block font-serif mb-3"
            >
              What do you want to visualize?
            </label>
            <input
              type="text"
              value={vizInput}
              onChange={(e) => setVizInput(e.target.value)}
              placeholder="Enter a concept, process, or idea..."
              className="w-full px-4 py-3 rounded-lg focus:outline-none"
              style={{
                backgroundColor: 'rgba(81, 55, 33, 0.42)',
                color: COLORS.cream,
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => runVisualizer('How it works')}
              disabled={!vizInput || vizLoading}
              className="px-4 py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50"
              style={{
                backgroundColor: COLORS.green,
                color: COLORS.cream,
              }}
            >
              How it works
            </button>
            <button
              onClick={() => runVisualizer('Inside/Parts')}
              disabled={!vizInput || vizLoading}
              className="px-4 py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50"
              style={{
                backgroundColor: COLORS.green,
                color: COLORS.cream,
              }}
            >
              Inside/Parts
            </button>
            <button
              onClick={() => runVisualizer('Process steps')}
              disabled={!vizInput || vizLoading}
              className="px-4 py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50"
              style={{
                backgroundColor: COLORS.green,
                color: COLORS.cream,
              }}
            >
              Process steps
            </button>
          </div>

          {vizImage && (
            <div className="space-y-4">
              <img
                src={vizImage}
                alt="Visualization"
                className="w-full rounded-lg"
              />
              {vizText && (
                <div
                  className="glass-tile-tinted rounded-[2rem] p-5 md:p-8"
                >
                  <h3 style={{ color: COLORS.cream }} className="font-serif mb-3">
                    Explanation
                  </h3>
                  <p style={{ color: COLORS.cream }} className="leading-relaxed">
                    {vizText}
                  </p>
                </div>
              )}
              <button
                onClick={() => {
                  setVizImage('');
                  setVizText('');
                  setVizInput('');
                }}
                className="w-full px-6 py-3 rounded-lg font-bold transition-all"
                style={{
                  backgroundColor: 'rgba(81, 55, 33, 0.42)',
                  color: COLORS.caramel,
                }}
              >
                Create Another
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== RENDER: PHOTO INSIGHT TOOL ==========
  if (activeTool === 'photo') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Toolbox</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Photo Insight.</h2>
          </div>
          <button
            onClick={() => setActiveTool('none')}
            className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{ backgroundColor: COLORS.green, color: '#1e2830' }}
          >
            ← Back
          </button>
        </header>

        <div className="max-w-2xl space-y-6">
          {!photoImage ? (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="w-full px-6 py-12 rounded-[2rem] font-bold text-lg transition-all"
              style={{
                backgroundColor: 'rgba(81, 55, 33, 0.42)',
                color: COLORS.cream,
                border: `2px dashed ${COLORS.green}`,
              }}
            >
              {Icons.Camera} Take or Upload Photo
            </button>
          ) : (
            <div className="space-y-6">
              <img
                src={photoImage}
                alt="Selected"
                className="w-full rounded-[2rem]"
              />

              <div>
                <label
                  style={{ color: COLORS.cream }}
                  className="block font-serif mb-3"
                >
                  Choose Mode
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'pull-text' as const, label: 'Pull Text' },
                    { value: 'summarize' as const, label: 'Summarize' },
                    { value: 'explain' as const, label: 'Explain' },
                    { value: 'identify' as const, label: 'Identify' },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setPhotoMode(mode.value)}
                      className="px-4 py-3 rounded-lg font-bold text-sm transition-all"
                      style={{
                        backgroundColor: photoMode === mode.value ? COLORS.green : 'rgba(81, 55, 33, 0.42)',
                        color: COLORS.cream,
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={runPhotoInsight}
                disabled={photoLoading}
                className="w-full px-6 py-4 rounded-lg font-bold transition-all disabled:opacity-50"
                style={{
                  backgroundColor: COLORS.green,
                  color: COLORS.cream,
                }}
              >
                {photoLoading ? 'Analyzing...' : 'Analyze Photo'}
              </button>

              {!photoResult && (
                <button
                  onClick={() => {
                    setPhotoImage(null);
                    setPhotoResult('');
                  }}
                  className="w-full px-6 py-3 rounded-lg font-bold transition-all"
                  style={{
                    backgroundColor: 'rgba(81, 55, 33, 0.42)',
                    color: COLORS.caramel,
                  }}
                >
                  Choose Different Photo
                </button>
              )}
            </div>
          )}

          {photoResult && (
            <div className="space-y-6">
              <div
                className="glass-tile-tinted rounded-[2rem] p-5 md:p-8"
              >
                <h3 style={{ color: COLORS.cream }} className="font-serif mb-3">
                  Analysis
                </h3>
                <p style={{ color: COLORS.cream }} className="leading-relaxed">
                  {photoResult}
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={savePhotoInsight}
                  className="flex-1 px-6 py-3 rounded-lg font-bold transition-all"
                  style={{
                    backgroundColor: COLORS.green,
                    color: COLORS.cream,
                  }}
                >
                  Save to Gallery
                </button>
                <button
                  onClick={() => {
                    setPhotoResult('');
                    setPhotoImage(null);
                  }}
                  className="flex-1 px-6 py-3 rounded-lg font-bold transition-all"
                  style={{
                    backgroundColor: 'rgba(81, 55, 33, 0.42)',
                    color: COLORS.caramel,
                  }}
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handlePhotoSelect(e.target.files[0]);
              }
            }}
          />
        </div>
      </div>
    );
  }

  // ========== RENDER: MANUAL LOOKUP TOOL ==========
  if (activeTool === 'manual') {
    return (
      <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8" style={{ borderBottom: '1px solid rgba(81, 55, 33, 0.45)' }}>
          <div className="space-y-2">
            <div className="font-bold uppercase tracking-[0.4em] text-[9px]" style={{ color: COLORS.caramel }}>Toolbox</div>
            <h2 className="text-4xl md:text-7xl font-serif leading-none" style={{ color: COLORS.cream }}>Manual Lookup.</h2>
          </div>
          <button
            onClick={() => setActiveTool('none')}
            className="px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
            style={{ backgroundColor: COLORS.green, color: '#1e2830' }}
          >
            ← Back
          </button>
        </header>

        <div className="max-w-2xl space-y-6">
          <div>
            <label
              style={{ color: COLORS.cream }}
              className="block font-serif mb-3"
            >
              What instructions do you need?
            </label>
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Search for instructions or guides..."
              className="w-full px-4 py-3 rounded-lg focus:outline-none"
              style={{
                backgroundColor: 'rgba(81, 55, 33, 0.42)',
                color: COLORS.cream,
              }}
            />
          </div>

          <button
            onClick={runManualLookup}
            disabled={!manualInput || manualLoading}
            className="w-full px-6 py-4 rounded-lg font-bold transition-all disabled:opacity-50"
            style={{
              backgroundColor: COLORS.green,
              color: COLORS.cream,
            }}
          >
            {manualLoading ? 'Searching...' : 'Find Instructions'}
          </button>

          {manualResult && (
            <div className="space-y-6">
              <div
                className="glass-tile-tinted rounded-[2rem] p-5 md:p-8"
              >
                <h3 style={{ color: COLORS.cream }} className="font-serif mb-3">
                  Instructions
                </h3>
                <p style={{ color: COLORS.cream }} className="leading-relaxed">
                  {manualResult}
                </p>
              </div>

              {manualSources.length > 0 && (
                <div>
                  <h3 style={{ color: COLORS.cream }} className="font-serif mb-3">
                    Source Links
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {manualSources.map((source, idx) => (
                      <a
                        key={idx}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-full text-sm font-semibold transition-all hover:opacity-80"
                        style={{
                          backgroundColor: COLORS.green,
                          color: COLORS.cream,
                        }}
                      >
                        {source.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={saveManualToGallery}
                className="w-full px-6 py-3 rounded-lg font-bold transition-all"
                style={{
                  backgroundColor: COLORS.green,
                  color: COLORS.cream,
                }}
              >
                Save to Gallery
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default Toolbox;
