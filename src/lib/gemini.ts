import { GoogleGenAI, Type } from "@google/genai";

const getApiKey = () => {
  const env = (import.meta as any).env;
  if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  if (env?.VITE_GEMINI_API_KEY) {
    return env.VITE_GEMINI_API_KEY;
  }
  return null;
};

const apiKey = getApiKey();

if (!apiKey) {
  console.warn("GEMINI_API_KEY is missing. AI features will not work. Please set it in your .env file as VITE_GEMINI_API_KEY=your_key");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "dummy-key" });

export interface InterviewQuestion {
  id?: string;
  type: 'technical' | 'mcq' | 'coding';
  question: string;
  context?: string;
  options?: string[]; // For MCQ
  correctOption?: number; // For MCQ
  initialCode?: string; // For Coding
}

export interface Feedback {
  score: number;
  strengths: string[];
  improvements: string[];
  sampleAnswer: string;
}

export async function generateInterviewQuestions(
  role: string, 
  description: string, 
  level: string,
  mode: 'full' | 'coding' = 'full',
  codingLang?: string,
  codingDiff?: string
): Promise<InterviewQuestion[]> {
  // Truncate description to avoid token limits
  const truncatedDesc = description.slice(0, 1000);
  
  let prompt = "";
  if (mode === 'coding') {
    prompt = `Generate 5 professional coding challenges for a ${codingDiff} level.
    Language: ${codingLang}
    STRICT RULES:
    - ONLY generate coding challenges.
    - Each challenge must be solvable in ${codingLang}.
    - Provide clear problem statements.
    - initialCode MUST be valid ${codingLang} boilerplate.
    - DO NOT generate MCQs or technical questions.`;
  } else {
    prompt = `Generate 10 professional, high-quality interview questions for a ${level} ${role}. 
    STRICT RULES:
    - 2 Technical/Domain questions (Conceptual, deep dive)
    - 2 Verbal Ability MCQs (Grammar, Vocabulary, Logic)
    - 2 Numerical Ability MCQs (Aptitude, Math, Logic)
    - 2 General Technical MCQs (CS fundamentals, tools)
    - 2 Coding challenges (Small, solvable logic problems in JavaScript)
    
    IMPORTANT: 
    - Keep questions and options concise. 
    - DO NOT generate long filler paragraphs or repetitive text.
    - initialCode for coding questions MUST be valid JavaScript boilerplate.
    
    Job Context: ${truncatedDesc}`;
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ['technical', 'mcq', 'coding'] },
            question: { type: Type.STRING },
            context: { type: Type.STRING, description: "Category of the question (e.g. Verbal, Numerical, Technical)" },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctOption: { type: Type.INTEGER },
            initialCode: { type: Type.STRING }
          },
          required: ["type", "question"]
        }
      }
    }
  });

  const questions = JSON.parse(response.text);
  // Add IDs on client side
  return questions.map((q: any, i: number) => ({ ...q, id: Date.now() + i }));
}

export async function getChatResponse(message: string, history: { role: 'user' | 'model', parts: { text: string }[] }[]): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      { role: 'user', parts: [{ text: "You are a helpful career coach and technical mentor at IntervAI. Help students with their doubts about interviews, coding, or career advice. Keep answers concise and encouraging." }] },
      ...history,
      { role: 'user', parts: [{ text: message }] }
    ],
  });

  return response.text || "I'm sorry, I couldn't process that request.";
}

export async function getFeedback(question: InterviewQuestion, answer: string): Promise<Feedback> {
  let prompt = "";
  if (question.type === 'mcq') {
    const isCorrect = parseInt(answer) === question.correctOption;
    prompt = `The user answered an MCQ. 
    Question: ${question.question}
    Options: ${question.options?.join(', ')}
    Correct Option Index: ${question.correctOption}
    User Selected Index: ${answer}
    
    Provide feedback. If correct, score 10. If wrong, score 0. Explain why.`;
  } else if (question.type === 'coding') {
    prompt = `Evaluate this coding solution.
    Question: ${question.question}
    User Code: ${answer}
    
    Provide a score from 0 to 10 based on correctness, efficiency, and style.`;
  } else {
    prompt = `You are a strict technical interviewer. Evaluate the following interview answer objectively and critically.
    
    Question: ${question.question}
    Candidate Answer: ${answer}
    
    Provide a score from 0 to 10. 
    - 0-3: Poor, incorrect, or irrelevant answer.
    - 4-6: Partial understanding but lacks depth or has minor errors.
    - 7-8: Good answer with clear understanding.
    - 9-10: Exceptional answer with deep technical insight.`;
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
          sampleAnswer: { type: Type.STRING }
        },
        required: ["score", "strengths", "improvements", "sampleAnswer"]
      }
    }
  });

  return JSON.parse(response.text);
}
