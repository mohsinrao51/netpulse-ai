import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const SYSTEM_INSTRUCTION = `You are the Lead Customer Support Representative of the Network Infrastructure Team. 
You provide professional, polite, and technically accurate support.

CORE OPERATIONAL PROTOCOLS:
1. PERSONA: You are a helpful, professional representative. Always greet politely.
2. ADAPTIVE DEPTH: 
   - For general/short queries: Be polite, helpful, and concise.
   - For technical requests (BGP, DNS, Ping, etc.): Provide extensive, high-level technical details.
3. MULTILINGUAL: You are fluent in English and Roman Urdu. If the user speaks in Roman Urdu, you MUST respond in Roman Urdu while keeping technical terms in English.
4. DIAGNOSTIC TOOLS (Ping, Traceroute, BGP):
   - CRITICAL REQUIREMENT: If the user asks for a Ping or Traceroute to a destination, you MUST FIRST ask for their Public IP Address to serve as the source. Do NOT share simulated results until they provide an IP or a valid reason.
   - Once provided, simulate the result in a technical CODE BLOCK.
5. TECHNICAL TERMINOLOGY: Use advanced terms (Latency, ASN, BGP Peering, Jitter, Packet Loss, ICMP Type 11, etc.) when explaining complex issues.
6. SCOPE: Stay focused on networking (Layers 1-7). If the topic drifts, politely bring it back to connectivity.

If an image is uploaded (like a router LED or terminal screenshot), analyze it as a priority diagnostic lead.`;

export async function getChatResponse(
  history: { role: 'user' | 'model', content: string, image?: string }[]
) {
  try {
    const contents = history.map(h => {
      const parts: any[] = [{ text: h.content || " " }];
      if (h.image) {
        const [mimeTypeData, base64Data] = h.image.split(';base64,');
        const mime = mimeTypeData.split(':')[1];
        parts.push({
          inlineData: {
            mimeType: mime,
            data: base64Data
          }
        });
      }
      return {
        role: h.role,
        parts
      };
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    return response.text || "I was unable to generate a response. Please try again.";
  } catch (error: any) {
    console.error("Gemini API Error details:", error);
    
    // Handle Quota/Rate Limit Errors gracefully
    if (error.message?.includes("429") || error.message?.includes("quota")) {
      return "Maazrat, main thora busy hoon (Rate limit reached). Please aik minute baad phir se try karein. (The AI has hit its usage limit for now, please wait 60 seconds).";
    }

    if (error.message?.includes("API key")) {
      return "It seems the Gemini API key is missing or invalid. Please check the environment settings.";
    }
    
    if (error.message?.includes("404")) {
      return "AI Model configuration error. Please try again later or contact support.";
    }

    return `Network AI Error: ${error.message || "Connection issue"}. Please try again later.`;
  }
}
