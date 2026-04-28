import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function moderateImage(base64Image: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: "Analyze this image for a lost item recovery platform. Check for sexual content, nudity, unethical content, or spam. Also assess the technical quality: check for blur, lighting, and visibility. Return a JSON object with: { isSafe: boolean, rejectionReason: string | null, qualityScore: number (0-10), qualityIssues: string[], isBannable: boolean }" },
            { inlineData: { data: base64Image.split(',')[1], mimeType: "image/jpeg" } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isSafe: { type: Type.BOOLEAN },
            rejectionReason: { type: Type.STRING },
            qualityScore: { type: Type.NUMBER },
            qualityIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
            isBannable: { type: Type.BOOLEAN }
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Moderation Error:", error);
    return { isSafe: true, qualityScore: 8, qualityIssues: [], isBannable: false }; // Fallback for prototype
  }
}

export async function getQuestAIInsights(title: string, description: string, category: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Suggest recovery zones and tips for a lost item: Title: ${title}, Description: ${description}, Category: ${category}. Return JSON: { zones: string[], tips: string[] }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            zones: { type: Type.ARRAY, items: { type: Type.STRING } },
            tips: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Insights Error:", error);
    return { zones: ["Nearby businesses", "Main walking paths"], tips: ["Check security cameras", "Ask local staff"] };
  }
}

export async function enhanceClosureReason(reason: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Simplify and clarify this reason for closing a lost item quest for other helpers to understand clearly: "${reason}". Return JSON: { enhancedReason: string }`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            enhancedReason: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text).enhancedReason;
  } catch (error) {
    console.error("AI Enhance Reason Error:", error);
    return reason;
  }
}
