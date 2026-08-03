let modeloGeminiCache = null;

async function obtenerModeloGeminiValido(apiKey) {
  if (modeloGeminiCache) return modeloGeminiCache;

  const keyClean = apiKey.trim();
  const preferredModels = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-8b", "gemini-1.5-pro", "gemini-2.0-flash-exp"];

  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keyClean}`);
    if (listRes.ok) {
      const listData = await listRes.json();
      if (Array.isArray(listData.models)) {
        const availableNames = listData.models
          .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
          .map(m => m.name.replace("models/", ""));

        const matched = preferredModels.find(c => availableNames.includes(c))
                     || availableNames.find(n => n.includes("flash"))
                     || availableNames[0];

        if (matched) {
          modeloGeminiCache = matched;
          return matched;
        }
      }
    }
  } catch (e) {
    console.warn("No se pudo consultar ListModels de Gemini:", e.message);
  }

  return "gemini-1.5-flash";
}

function validarMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30) return false;

  return messages.every(message => {
    if (!message || typeof message !== "object") return false;
    if (!["system", "user", "assistant"].includes(message.role)) return false;
    if (typeof message.content === "string") {
      return message.content.length <= 8000;
    } else if (Array.isArray(message.content)) {
      return message.content.length > 0;
    }
    return false;
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  let GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_KEY || process.env.GEMINI_APIKEY;

  if (!GEMINI_API_KEY) {
    const dynamicKeyName = Object.keys(process.env).find(k => /gemini|google_api/i.test(k));
    if (dynamicKeyName) {
      GEMINI_API_KEY = process.env[dynamicKeyName];
    }
  }

  if (!GROQ_API_KEY && !GEMINI_API_KEY) {
    return res.status(500).json({ error: "Faltan las API Keys de IA. Por favor agrega GROQ_API_KEY o GEMINI_API_KEY en las variables de entorno." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const esVision = body.vision === true;

    if (!validarMessages(body.messages)) {
      return res.status(400).json({ error: "Payload de mensajes inválido" });
    }

    // 1. Si es Visión / OCR (foto de factura)
    if (esVision) {
      if (GEMINI_API_KEY) {
        try {
          const userMsg = body.messages.find(m => m.role === "user");
          let base64Url = "";
          let promptText = "";

          if (Array.isArray(userMsg?.content)) {
            const imgPart = userMsg.content.find(c => c.type === "image_url");
            const textPart = userMsg.content.find(c => c.type === "text");
            base64Url = imgPart?.image_url?.url || "";
            promptText = textPart?.text || "";
          }

          if (base64Url && promptText) {
            const mimeType = base64Url.split(";")[0].split(":")[1] || "image/jpeg";
            const base64Data = base64Url.split(",")[1];

            const targetModel = await obtenerModeloGeminiValido(GEMINI_API_KEY);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${GEMINI_API_KEY.trim()}`;
            
            const geminiRes = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { inline_data: { mime_type: mimeType, data: base64Data } },
                    { text: promptText }
                  ]
                }]
              })
            });

            const geminiData = await geminiRes.json();

            if (geminiRes.ok) {
              const textOut = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (textOut) {
                return res.status(200).json({
                  choices: [{ message: { content: textOut } }]
                });
              }
            } else {
              const errText = geminiData.error?.message || `HTTP ${geminiRes.status}`;
              if (geminiRes.status === 429 || errText.toLowerCase().includes("quota") || errText.toLowerCase().includes("exceeded")) {
                return res.status(429).json({
                  error: "⏳ Límite de solicitudes de Google Gemini alcanzado. Reintenta en 30 segundos."
                });
              }
              return res.status(400).json({ error: `Gemini Error (${targetModel}): ${errText}` });
            }
          }
        } catch(errGemini) {
          return res.status(500).json({ error: `Error conectando con Gemini: ${errGemini.message}` });
        }
      }

      return res.status(400).json({ error: "El servicio de OCR requiere configurar la variable GEMINI_API_KEY en tu proyecto." });
    }

    // 2. Si es Chat o Reporte de Texto
    if (GROQ_API_KEY) {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: body.messages,
          max_tokens: 1500,
          temperature: 0.3
        })
      });

      const data = await groqRes.json();
      if (groqRes.ok) {
        return res.status(200).json(data);
      }
      return res.status(groqRes.status).json({ error: data.error?.message || "Error en Groq API" });
    }

    if (GEMINI_API_KEY) {
      const textMsg = body.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
      const targetModel = await obtenerModeloGeminiValido(GEMINI_API_KEY);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${GEMINI_API_KEY.trim()}`;
      
      const geminiRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: textMsg }] }]
        })
      });
      const geminiData = await geminiRes.json();
      if (geminiRes.ok) {
        const textOut = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return res.status(200).json({
          choices: [{ message: { content: textOut } }]
        });
      }
      return res.status(geminiRes.status).json({ error: geminiData.error?.message || "Error en Gemini API" });
    }

    return res.status(500).json({ error: "No hay proveedor de IA disponible." });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
