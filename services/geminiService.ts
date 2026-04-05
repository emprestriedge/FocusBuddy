import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";

const STUDENT_CONTEXT = `The student is a 10-year-old boy doing homeschool. He has ADHD, so keep responses concise (2-4 short paragraphs max), use concrete examples over abstract explanations, and break complex ideas into small numbered steps. Avoid walls of text. Use a friendly, encouraging tone — like a cool older brother who knows a lot.`;

const SAFETY_PREAMBLE = `You are helping a child. Never provide inappropriate, violent, or adult content. If asked about something off-topic or inappropriate, gently redirect to the learning task.`;

export const geminiService = {

  async searchHelp(query: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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

  async generateCurriculumTasks(prompt: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze these student reflections and voice note summaries from a 10-year-old homeschool student with ADHD:

${reflections.join(" | ")}`,
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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

  async analyzeImage(base64Image: string, prompt: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
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

  async generateSearchTags(context: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Based on the following description or prompt, list 10-15 key words, labels, or objects that are likely pictured or discussed.
        Format as a comma-separated list. Focus on specific nouns and technical terms.

        Content: ${context}`,
      });
      return response.text || "";
    } catch (error) {
      console.error("Tag Generation Error:", error);
      return "";
    }
  },

  async formatManualForGallery(rawResult: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Extract a short, scannable title and a 1-2 sentence summary from the following manual lookup result.
        The title MUST follow this exact pattern: [Product/Kit Name] [Model# if available] - [Manual Type].
        Examples: 'LEGO 42203 - Official Manual', 'Snap Circuits SC-100 - Instructions', 'Microscope - User Guide'.
        Avoid long, descriptive, or sentence-style titles.

        Result: ${rawResult}`,
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Clean up and shorten this technical manual title for a list view.
        Format MUST follow this exact pattern: [Product/Kit Name] [Model# if available] - [Manual Type].
        Examples: 'LEGO 42203 - Official Manual', 'Snap Circuits SC-100 - Instructions', 'Microscope - User Guide'.
        Keep it extremely concise and scannable.

        Title to refine: ${rawTitle}`,
      });
      return response.text?.trim() || rawTitle;
    } catch (error) {
      console.error("Refine Title Error:", error);
      return rawTitle;
    }
  },

  async generateSourceSummary(title: string, uri: string, context: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Generate a short 1-2 sentence description for an educational resource titled "${title}" at ${uri}. Context of the student's request was: "${context}". Make it sound helpful for a learning portfolio.`,
      });
      return response.text || "An official manual or educational guide.";
    } catch (error) {
      console.error("Source Summary Error:", error);
      return "A helpful assembly guide or official manual.";
    }
  },

  async masterBuilderMultimodal(base64Image: string | null, prompt: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = [];
      if (base64Image) {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Image } });
      }
      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: { parts },
        config: {
          systemInstruction: `${SAFETY_PREAMBLE} You are the Master Builder AI — an expert in LEGO Technic (gears, axles, motors, structural beams, differential gears, worm drives) and Snap Circuits (circuits, polarity, power flow, component identification, series vs parallel).

When a student sends a photo of their build:
1. Look closely at the specific area they're asking about
2. Identify what's wrong or what they're trying to do
3. Give a clear, step-by-step fix using the actual piece names they'd recognize
4. Explain WHY the fix works (teach the engineering principle in simple terms)

${STUDENT_CONTEXT} Use technical vocabulary (gear ratio, torque, load-bearing) but always define it in kid terms right after. Encourage spatial thinking and always mention safety when relevant (sharp edges, small parts, battery handling).`
        }
      });
      return response.text;
    } catch (error) {
      console.error("Master Builder Error:", error);
      return "I couldn't quite see that. Can you try a clearer photo or explain what's happening?";
    }
  },

  async transformMasterBuilderFix(diagnostic: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Convert this engineering diagnostic into a structured "Fix Summary" for a learning portfolio.

        The summary must include these exact sections:
        - WHAT WAS WRONG: (1 sentence)
        - WHAT TO CHANGE: (1-2 sentences)
        - HOW TO TEST IT: (1-3 bullet points)

        Diagnostic: ${diagnostic}`,
      });
      return response.text || diagnostic;
    } catch (error) {
      console.error("Fix Transformation Error:", error);
      return diagnostic;
    }
  },

  async generateIllustration(prompt: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `A clean, educational diagram or illustration for a 10-year-old student. Style: clear labels, bold lines, dark background with warm brown and green accents. Subject: ${prompt}` }]
        },
        config: {
          imageConfig: { aspectRatio: "1:1" }
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

  async transcribeAudio(base64Audio: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
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
      assignment: `Transform this voice recording into a concise note suitable for schoolwork or an assignment log. Focus on what was done, what was learned, and any deliverables. Clean up grammar and organize clearly. This will be reviewed by the student's parent.`
    };

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `${instructions[type]}\n\nTranscript: ${transcript}`,
      });
      return response.text || transcript;
    } catch (error) {
      console.error("Transformation Error:", error);
      return transcript;
    }
  },

  async shopHelp(query: string, category: 'lego' | 'tools' | 'manual' | 'general' | 'vocab') {
    const context = {
      lego: `${SAFETY_PREAMBLE} You are a LEGO and Snap Circuits master builder helping a 10-year-old. ${STUDENT_CONTEXT} Help with build ideas, finding specific parts, understanding instructions, troubleshooting mechanisms, and explaining engineering concepts. You know Technic gears, axles, differentials, pneumatics, and Snap Circuits components inside and out.`,
      tools: `${SAFETY_PREAMBLE} You are a master craftsman helping a 10-year-old learn about tools. ${STUDENT_CONTEXT} Explain how shop tools work, ALWAYS lead with safety procedures, and suggest age-appropriate project ideas. If a tool is dangerous for a child, say so clearly and suggest a safer alternative.`,
      manual: `${SAFETY_PREAMBLE} You are a technical documentation expert helping a homeschool student find official manuals, assembly guides, and setup instructions for tools, kits, and products. ${STUDENT_CONTEXT} Prioritize official manufacturer websites and PDF documentation. Provide clear, direct links to official sources.`,
      general: `${SAFETY_PREAMBLE} You are a study buddy helping a 10-year-old homeschool student with ADHD. ${STUDENT_CONTEXT} When they ask you to explain something, use analogies and real-world examples. When they ask "what am I supposed to do," break the assignment into numbered steps. When they ask you to check their answer, be honest but encouraging — if they're wrong, explain why and guide them to the right answer rather than just giving it.`,
      vocab: `${SAFETY_PREAMBLE} You are a word wizard — an etymologist and language expert helping a 10-year-old expand their vocabulary. ${STUDENT_CONTEXT} For each word: (1) Give the origin story — where did this word come from? Make it interesting like a mini history lesson, (2) Provide 3-4 synonyms ranked from easiest to most advanced, (3) Give 3-4 antonyms, (4) If it's an idiom, explain what it really means and where it came from. Use examples a 10-year-old would relate to.`
    };

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
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
