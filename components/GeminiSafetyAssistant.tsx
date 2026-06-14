import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Sparkles } from './Icons';

interface Props {
  taskTitle: string;
  onChecklistGenerated: (checklist: string) => void;
}

export const GeminiSafetyAssistant: React.FC<Props> = ({ taskTitle, onChecklistGenerated }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSafetyChecklist = async () => {
    const apiKey = (import.meta.env.VITE_GEMINI_API_KEY as string) || (process.env.API_KEY as string) || (process.env.GEMINI_API_KEY as string);
    if (!apiKey) {
      setError("Please configure VITE_GEMINI_API_KEY in your environment or .env file.");
      return;
    }

    if (!taskTitle) {
      setError("Please enter a task title first.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Generate a concise, 5-point construction safety checklist for a task titled: "${taskTitle}". 
      
      Format the output strictly as a Markdown checklist:
      - [ ] Item 1
      - [ ] Item 2
      
      Do not add intro or outro text.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      const text = response.text;
      if (text) {
        onChecklistGenerated(text);
      }
    } catch (err) {
      console.error("Gemini Error:", err);
      setError("Failed to generate checklist.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col items-start w-full">
      <button
        type="button"
        onClick={generateSafetyChecklist}
        disabled={isLoading || !taskTitle}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50 transition-colors bg-orange-50/50 hover:bg-orange-50 px-3 py-2 rounded-lg border border-dashed border-orange-200"
      >
        <Sparkles size={16} />
        {isLoading ? "Generating Checklist..." : "Auto-Generate Safety Plan"}
      </button>
      {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
    </div>
  );
};