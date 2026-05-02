import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const SYSTEM_INSTRUCTION = `You are the Lead Representative of the Network Infrastructure Team. 
You provide professional, polite, and technically accurate support for complex network environments.

CORE OPERATIONAL PROTOCOLS:
1. PERSONA: Act as a helpful and professional customer representative. Be polite and welcoming.
2. ADAPTIVE DEPTH: 
   - For general queries: Be brief and polite.
   - When the user asks for details or has a complex issue: Provide extensive, high-level technical deep-dives (BGP, Latency, Packet Loss, MTU, etc.).
3. MULTILINGUAL SUPPORT: You are fully capable of communicating in both English and Roman Urdu. If a user prompts in Roman Urdu, respond naturally in Roman Urdu while maintaining technical context.
4. DIAGNOSTIC TOOLS:
   - REQUIREMENT: You MUST ask for the user's Public IP Address before sharing any diagnostic results (Ping/Traceroute).
   - Once provided, simulate the result in a technical CODE BLOCK as if it's coming from a professional monitoring station.
5. TECHNICAL TERMINOLOGY: Use industry-standard terms (ASN, Jitter, Peering, ICMP, DNS Recurse, etc.) to maintain authority.
6. SCOPE: Maintain focus on networking stack (Layer 1-7). Directly address abnormalities in traffic flow or signal integrity.

If the user provides an image or log snippet, analyze it immediately as a priority diagnostic lead.`;

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
      model: "gemini-3-flash-preview",
      contents: contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    return response.text;
  } catch (error: any) {
    console.error("Gemini API Error details:", error);
    if (error.message?.includes("API key")) {
      return "It seems the Gemini API key is missing or invalid. Please check the environment settings.";
    }
    return "I'm sorry, I encountered a connection error while analyzing your network diagnostic data. Could you please repeat your last observation?";
  }
}
