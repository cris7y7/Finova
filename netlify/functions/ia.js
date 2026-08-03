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

function corsHeaders(event) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function json(statusCode, event, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(event),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
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

exports.handler = async function(event, context) {
  const headers = corsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, event, { error: "Method Not Allowed" });
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
    return json(500, event, { error: "Faltan las API Keys de IA. Por favor agrega GROQ_API_KEY o GEMINI_API_KEY." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const esVision = body.vision === true;

    if (!validarMessages(body.messages)) {
      return json(400, event, { error: "Payload de mensajes inválido" });
    }

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
                return json(200, event, {
                  choices: [{ message: { content: textOut } }]
                });
              }
            } else {
              const errText = geminiData.error?.message || `HTTP ${geminiRes.status}`;
              if (geminiRes.status === 429 || errText.toLowerCase().includes("quota") || errText.toLowerCase().includes("exceeded")) {
                return json(429, event, {
                  error: "⏳ Límite de solicitudes de Google Gemini alcanzado. Reintenta en 30 segundos."
                });
              }
              return json(400, event, { error: `Gemini Error (${targetModel}): ${errText}` });
            }
          }
        } catch(errGemini) {
          return json(500, event, { error: `Error conectando con Gemini: ${errGemini.message}` });
        }
      }

      return json(400, event, { error: "El servicio de OCR requiere configurar la variable GEMINI_API_KEY." });
    }

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
        return json(200, event, data);
      }
      return json(groqRes.status, event, { error: data.error?.message || "Error en Groq API" });
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
        return json(200, event, {
          choices: [{ message: { content: textOut } }]
        });
      }
      return json(geminiData.status, event, { error: geminiData.error?.message || "Error en Gemini API" });
    }

    return json(500, event, { error: "No hay proveedor de IA disponible." });

  } catch(e) {
    return json(500, event, { error: e.message });
  }
};
