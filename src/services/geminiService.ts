import { GoogleGenAI, GenerateContentResponse, Type, Modality, LiveServerMessage } from "@google/genai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyCtZCK5NX-tqg53BqETynbXCZmrNlpCoJg';

const STUDENT_CONTEXT = `The student is a 10-year-old boy doing homeschool. He has ADHD, so keep responses concise (2-4 short paragraphs max), use concrete examples over abstract explanations, and break complex ideas into small numbered steps. Avoid walls of text. Use a friendly, encouraging tone — like a cool older brother who knows a lot.`;

const SAFETY_PREAMBLE = `You are helping a child. Never provide inappropriate, violent, or adult content. If asked about something off-topic or inappropriate, gently redirect to the learning task.`;

export const geminiService = {

  // ==================== FACT CHECK (NEW — Grounding with Google Search) ====================
  async factCheck(claim: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: claim,
        config: {
          systemInstruction: `${SAFETY_PREAMBLE} You are a fact-checker for a 10-year-old homeschool student. ${STUDENT_CONTEXT}

When the student asks you to check something:
1. Use Google Search to verify the claim
2. State clearly: TRUE, FALSE, PARTLY TRUE, or UNVERIFIED
3. Give a 2-3 sentence explanation of WHY, using simple language
4. If it's false, explain what the truth actually is
5. Mention where you found the answer

Keep it short and direct — this is a quick-check tool, not a research paper.`,
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || "I couldn't verify that right now.";
      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Source',
        uri: chunk.web?.uri || '#'
      })) || [];

      return { text, sources };
    } catch (error) {
      console.error("Fact Check Error:", error);
      return { text: "Error checking that fact. Try again.", sources: [] };
    }
  },

  // ==================== RESEARCHER (Grounding with Google Search) ====================
  async searchHelp(query: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${query}`,
        config: {
          systemInstruction: `${SAFETY_PREAMBLE} You are a research assistant for a homeschool student. ${STUDENT_CONTEXT} Use Google Search to find verified, factual information. Cite your sources. Present findings clearly with short paragraphs and bold key terms. If you're unsure about something, say so rather than guessing.`,
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || "I couldn't find an answer right now.";
      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Source',
        uri: chunk.web?.uri || '#'
      })) || [];

      return { text, sources };
    } catch (error) {
      console.error("Gemini Search Error:", error);
      return { text: "Error searching for info.", sources: [] };
    }
  },

  // ==================== CURRICULUM / ADMIN ====================
  async generateCurriculumTasks(prompt: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Generate 3-5 homework assignments based on this topic: "${prompt}".`,
        config: {
          systemInstruction: `You are a curriculum planner for a 10-year-old homeschool student with ADHD. Design assignments that:
- Can each be completed in 15-30 minutes (ADHD-friendly duration)
- Alternate between reading, hands-on, and creative tasks for variety
- Have clear, specific deliverables (not vague instructions)
- Include at least one task that involves physical movement or building
For each task, provide: name (short, action-oriented), description (1-2 sentences max, very specific about what to do), and suggested accountability type (photo, voice, both, or none).`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                accountabilityType: { type: Type.STRING }
              },
              required: ["name", "description", "accountabilityType"]
            }
          }
        }
      });
      return JSON.parse(response.text || "[]");
    } catch (error) {
      console.error("Curriculum Generation Error:", error);
      return [];
    }
  },

  async summarizeStudentReflections(reflections: string[]) {
    try {
      if (reflections.length === 0) return "No reflections recorded yet.";
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Analyze these student reflections and voice note summaries from a 10-year-old homeschool student with ADHD:\n\n${reflections.join(" | ")}`,
        config: {
          systemInstruction: `You are an educational insight analyst helping a parent understand their child's learning. Provide a 3-sentence summary that covers: (1) What topics or activities the student seems most engaged with, (2) Any signs of struggle, frustration, or avoidance, (3) One specific, actionable suggestion for tomorrow's learning based on what you see. Write in a warm, supportive tone — this parent is doing their best.`
        }
      });
      return response.text;
    } catch (error) {
      console.error("Summary Error:", error);
      return "Could not generate insight summary.";
    }
  },

  async generateReflectionPrompts(taskName: string, description: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Generate 3 short reflection prompts for a 10-year-old who just finished: "${taskName}" — ${description}`,
        config: {
          systemInstruction: `${SAFETY_PREAMBLE} Create reflection prompts that a 10-year-old boy with ADHD would actually want to answer. Keep them short (under 10 words each), concrete, and slightly fun. Avoid generic prompts like "how did you feel?" — instead ask specific things like "what was the trickiest part?" or "would you change anything if you did it again?" Match the prompt to the subject matter.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              prompts: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["prompts"]
          }
        }
      });
      return JSON.parse(response.text || '{"prompts":[]}').prompts;
    } catch (error) {
      console.error("Gemini Reflection Prompts Error:", error);
      return ["What was the trickiest part?", "What tool or trick helped most?", "Would you do anything differently?"];
    }
  },

  // ==================== PHOTO INSIGHT ====================
  async analyzeImage(base64Image: string, prompt: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: prompt || "Describe what you see in this photo in detail. Read any visible text. Identify objects, labels, and how they connect to learning." }
          ]
        },
        config: {
          systemInstruction: `${SAFETY_PREAMBLE} ${STUDENT_CONTEXT} You are a photo analysis tool for a homeschool student. When analyzing images: (1) Read all visible text accurately, (2) Identify and name all objects, (3) Explain how what you see connects to learning, (4) Keep your response organized with clear sections. If the image is of schoolwork, check for correctness and provide gentle feedback.`
        }
      });
      return response.text;
    } catch (error) {
      console.error("Image Analysis Error:", error);
      return "I'm sorry, I couldn't analyze the image.";
    }
  },

  // ==================== SEARCH TAGS (Gallery) ====================
  async generateSearchTags(context: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Based on the following description or prompt, list 10-15 key words, labels, or objects that are likely pictured or discussed.\n        Format as a comma-separated list. Focus on specific nouns and technical terms.\n\n        Content: ${context}`,
      });
      return response.text || "";
    } catch (error) {
      console.error("Tag Generation Error:", error);
      return "";
    }
  },

  // ==================== MANUAL LOOKUP ====================
  async formatManualForGallery(rawResult: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Extract a short, scannable title and a 1-2 sentence summary from the following manual lookup result.\n        The title MUST follow this exact pattern: [Product/Kit Name] [Model# if available] - [Manual Type].\n        Examples: 'LEGO 42203 - Official Manual', 'Snap Circuits SC-100 - Instructions', 'Microscope - User Guide'.\n        Avoid long, descriptive, or sentence-style titles.\n\n        Result: ${rawResult}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING }
            },
            required: ["title", "summary"]
          }
        }
      });
      return JSON.parse(response.text || '{"title": "Manual", "summary": "Instructions found via Manual Lookup."}');
    } catch (error) {
      console.error("Format Manual Error:", error);
      return { title: "Manual", summary: "Instructions found via Manual Lookup." };
    }
  },

  async refineManualTitle(rawTitle: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Clean up and shorten this technical manual title for a list view.\n        Format MUST follow this exact pattern: [Product/Kit Name] [Model# if available] - [Manual Type].\n        Keep it extremely concise and scannable.\n\n        Title to refine: ${rawTitle}`,
      });
      return response.text?.trim() || rawTitle;
    } catch (error) {
      console.error("Refine Title Error:", error);
      return rawTitle;
    }
  },

  async generateSourceSummary(title: string, uri: string, context: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Generate a short 1-2 sentence description for an educational resource titled "${title}" at ${uri}. Context of the student's request was: "${context}". Make it sound helpful for a learning portfolio.`,
      });
      return response.text || "An official manual or educational guide.";
    } catch (error) {
      console.error("Source Summary Error:", error);
      return "A helpful assembly guide or official manual.";
    }
  },

  // ==================== VISUALIZER ====================
  async generateIllustration(prompt: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: {
          parts: [{ text: `A clean, educational diagram or illustration for a 10-year-old student. Style: clear labels, bold lines, dark background with warm brown and green accents. Subject: ${prompt}` }]
        },
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        }
      });

      let image: string | undefined;
      let text: string | undefined;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          image = `data:image/png;base64,${part.inlineData.data}`;
        } else if (part.text) {
          text = part.text;
        }
      }
      return { image, text };
    } catch (error) {
      console.error("Image Gen Error:", error);
      return { text: "I'm sorry, I couldn't generate that illustration right now." };
    }
  },

  // ==================== VOICE NOTE ====================
  async transcribeAudio(base64Audio: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { inlineData: { mimeType: 'audio/wav', data: base64Audio } },
            { text: "Transcribe this audio message. Return only the transcription, preserving the speaker's words exactly. Clean up filler words (um, uh, like) but keep the meaning intact." }
          ]
        }
      });
      return response.text;
    } catch (error) {
      console.error("Transcription Error:", error);
      return "I'm sorry, I couldn't transcribe the audio.";
    }
  },

  async transformVoiceNote(transcript: string, type: 'summary' | 'reflection' | 'assignment') {
    const instructions = {
      summary: `Transform this voice recording from a 10-year-old student into clear, organized bullet points. Capture the main facts and ideas. Clean up grammar but preserve the student's voice and personality. This will be read by the student's parent to verify the student understood the material.`,
      reflection: `Transform this voice recording into a short, meaningful first-person reflection log. Preserve the student's original emotion, opinions, and personality. Clean up grammar but keep it sounding like a kid wrote it — not an adult. This goes in their learning portfolio.`,
      assignment: `Transform this voice recording into a concise note suitable for schoolwork or an assignment log. Focus on what was done, what was learned, and any deliverables. Clean up grammar and organize clearly. This will be reviewed by the student's parent as proof the reading or assignment was completed.`
    };

    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${instructions[type]}\n\nTranscript: ${transcript}`,
      });
      return response.text || transcript;
    } catch (error) {
      console.error("Transformation Error:", error);
      return transcript;
    }
  },

  // ==================== WORD WIZARD (Specific Methods) ====================
  async wordDefinition(word: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Define the word: "${word}"`,
        config: {
          systemInstruction: `${SAFETY_PREAMBLE} ${STUDENT_CONTEXT} You are a dictionary for a 10-year-old. Give:
1. A simple, clear definition a kid would understand
2. The part of speech (noun, verb, adjective, etc.)
3. Two example sentences using the word — one serious, one funny or relatable to a kid
Keep it short and fun.`
        }
      });
      return response.text || "Couldn't find that word.";
    } catch (error) {
      console.error("Word Definition Error:", error);
      return "Error looking up that word.";
    }
  },

  async wordSynonyms(word: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Give synonyms and antonyms for: "${word}"`,
        config: {
          systemInstruction: `${SAFETY_PREAMBLE} ${STUDENT_CONTEXT} You are a thesaurus for a 10-year-old. Provide:
1. 4-5 synonyms, ranked from easiest to most advanced — put the kid-friendly ones first
2. 3-4 antonyms (opposites)
3. For the hardest synonym, give a quick example sentence so the kid knows how to use it
Keep it organized and easy to scan.`
        }
      });
      return response.text || "Couldn't find synonyms.";
    } catch (error) {
      console.error("Word Synonyms Error:", error);
      return "Error finding synonyms.";
    }
  },

  async wordOrigin(word: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Tell me the origin of the word: "${word}"`,
        config: {
          systemInstruction: `${SAFETY_PREAMBLE} ${STUDENT_CONTEXT} You are an etymologist making word origins fun for a 10-year-old. Tell the story of where this word came from:
1. What language did it come from? (Latin, Greek, Old English, etc.)
2. What did it originally mean? Was it different from today?
3. Any cool story or connection? (e.g., "muscle" comes from Latin for "little mouse" because flexed muscles looked like mice running under skin)
Make it feel like a mini history adventure — not a boring dictionary entry.`
        }
      });
      return response.text || "Couldn't find the origin.";
    } catch (error) {
      console.error("Word Origin Error:", error);
      return "Error finding word origin.";
    }
  },

  // ==================== STUDY CHAT & RESEARCHER (Text mode fallback) ====================
  async studyChatText(query: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: query,
        config: {
          systemInstruction: `${SAFETY_PREAMBLE} You are a study buddy helping a 10-year-old homeschool student with ADHD. ${STUDENT_CONTEXT} When they ask you to explain something, use analogies and real-world examples. When they ask "what am I supposed to do," break the assignment into numbered steps. When they ask you to check their answer, be honest but encouraging — if they're wrong, explain why and guide them to the right answer rather than just giving it.`
        }
      });
      return response.text || "I couldn't help with that right now.";
    } catch (error) {
      console.error("Study Chat Error:", error);
      return "Error getting help. Please try again.";
    }
  },

  async researcherText(query: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: query,
        config: {
          systemInstruction: `${SAFETY_PREAMBLE} You are a research assistant for a homeschool student. ${STUDENT_CONTEXT} Use Google Search to find verified, factual information. Present your findings in a clear, organized way. Include specific facts, dates, and details. Cite where you found your information. This is a research tool — go deeper than a quick answer. Help the student learn something new.`,
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || "I couldn't find an answer right now.";
      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Source',
        uri: chunk.web?.uri || '#'
      })) || [];

      return { text, sources };
    } catch (error) {
      console.error("Researcher Error:", error);
      return { text: "Error researching. Please try again.", sources: [] };
    }
  },

  // ==================== GEMINI LIVE API (Voice mode for StudyChat & Researcher) ====================
  async connectLiveSession(purpose: 'study' | 'research', callbacks: {
    onOpen: () => void;
    onAudio: (audioData: string) => void;
    onTranscript: (text: string) => void;
    onError: (error: any) => void;
    onClose: () => void;
  }) {
    const systemInstructions = {
      study: `${SAFETY_PREAMBLE} You are a friendly study buddy for a 10-year-old homeschool student named Zaidon. He has ADHD so keep your answers short and clear — no long speeches.

Your job is to help him with his schoolwork in three ways:
1. EXPLAIN things he doesn't understand — use simple words and real examples
2. SHOW HIM HOW to do something step by step
3. CHECK HIS ANSWERS — be honest but kind, and if he's wrong, walk him through why

Talk like a cool, patient older brother. Keep responses under 30 seconds of speaking. Ask him follow-up questions to make sure he understands. If he goes off-topic, gently bring him back.`,
      research: `${SAFETY_PREAMBLE} You are a research assistant for a 10-year-old homeschool student named Zaidon. He has ADHD so be concise and engaging.

Your job is to help him dig into topics and find real information:
1. EXPLORE a topic he's curious about — give him interesting facts and details
2. ANSWER specific questions with real, verified information
3. HELP HIM GO DEEPER — suggest related things he might want to learn about

Talk like an excited science teacher who loves sharing cool facts. Keep responses focused and under 30 seconds. When he asks about something, give him 2-3 solid facts and ask what he wants to know more about.`
    };

    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });

      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-preview-native-audio-dialog',
        callbacks: {
          onopen: () => callbacks.onOpen(),
          onmessage: (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              callbacks.onAudio(audioData);
            }
            if (message.serverContent?.outputTranscription?.text) {
              callbacks.onTranscript(message.serverContent.outputTranscription.text);
            }
          },
          onerror: (e: any) => callbacks.onError(e),
          onclose: () => callbacks.onClose()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemInstructions[purpose],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          outputAudioTranscription: {}
        }
      });

      return session;
    } catch (error) {
      console.error("Live API Connection Error:", error);
      callbacks.onError(error);
      return null;
    }
  },

  // ==================== MANUAL LOOKUP (with Google Search) ====================
  async manualLookup(query: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: query,
        config: {
          systemInstruction: `${SAFETY_PREAMBLE} You are a technical documentation expert helping a homeschool student find official manuals, assembly guides, and setup instructions for tools, kits, products, electronics, and appliances. ${STUDENT_CONTEXT} Prioritize official manufacturer websites and PDF documentation. Provide clear, direct links to official sources. If the product has a model number, use it to find the exact manual.`,
          tools: [{ googleSearch: {} }]
        }
      });

      const text = response.text || "";
      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Source',
        uri: chunk.web?.uri || '#'
      })) || [];

      return { text, sources };
    } catch (error) {
      console.error("Manual Lookup Error:", error);
      return { text: "I'm sorry, I couldn't find instructions for that.", sources: [] };
    }
  },

  // ==================== GENERIC SHOP HELP (kept for backward compat) ====================
  async shopHelp(query: string, category: 'tools' | 'manual' | 'general' | 'vocab') {
    const context: Record<string, string> = {
      tools: `${SAFETY_PREAMBLE} You are a master craftsman helping a 10-year-old learn about tools. ${STUDENT_CONTEXT}`,
      manual: `${SAFETY_PREAMBLE} You are a technical documentation expert. ${STUDENT_CONTEXT} Prioritize official manufacturer websites.`,
      general: `${SAFETY_PREAMBLE} You are a study buddy helping a 10-year-old homeschool student with ADHD. ${STUDENT_CONTEXT}`,
      vocab: `${SAFETY_PREAMBLE} You are a word wizard for a 10-year-old. ${STUDENT_CONTEXT}`
    };

    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: query,
        config: {
          systemInstruction: context[category],
          tools: category === 'manual' ? [{ googleSearch: {} }] : undefined
        }
      });

      const text = response.text || "";
      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Source',
        uri: chunk.web?.uri || '#'
      })) || [];

      if (category === 'manual') {
        return { text, sources };
      }

      return text;
    } catch (error) {
      console.error("Shop Help Error:", error);
      return category === 'manual'
        ? { text: "I'm sorry, I hit a snag helping you with that.", sources: [] }
        : "I'm sorry, I hit a snag helping you with that.";
    }
  }
};
