let workingModelCache = null;

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

function obtenerGeminiKeys() {
  const keysSet = new Set();
  for (const envKey of Object.keys(process.env)) {
    if (/gemini|google_api|google_key/i.test(envKey)) {
      const val = process.env[envKey];
      if (val && typeof val === "string") {
        val.split(",").map(k => k.trim().replace(/^["']|["']$/g, "")).filter(Boolean).forEach(k => keysSet.add(k));
      }
    }
  }
  return Array.from(keysSet);
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
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const geminiKeys = obtenerGeminiKeys();

  if (!GROQ_API_KEY && !OPENROUTER_API_KEY && geminiKeys.length === 0) {
    return res.status(500).json({ error: "Faltan las API Keys de IA. Por favor agrega OPENROUTER_API_KEY, GROQ_API_KEY o GEMINI_API_KEY en las variables de entorno." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const esVision = body.vision === true;

    if (!validarMessages(body.messages)) {
      return res.status(400).json({ error: "Payload de mensajes inválido" });
    }

    // 1. Si es Visión / OCR (foto de factura)
    if (esVision) {
      // 1.A. Probar con OpenRouter API si está configurada (Modelos de Visión Gratis sin límites severos)
      if (OPENROUTER_API_KEY) {
        try {
          const openRouterModels = [
            "meta-llama/llama-3.2-11b-vision-instruct:free",
            "google/gemini-2.0-flash-exp:free",
            "qwen/qwen-2-vl-7b-instruct:free"
          ];

          for (const orModel of openRouterModels) {
            const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENROUTER_API_KEY.trim()}`,
                "HTTP-Referer": "https://novyra.app",
                "X-Title": "NOVIRA App"
              },
              body: JSON.stringify({
                model: orModel,
                messages: body.messages,
                max_tokens: 1500,
                temperature: 0.2
              })
            });

            if (orRes.ok) {
              const orData = await orRes.json();
              return res.status(200).json(orData);
            }
          }
        } catch(errOR) {
          console.warn("OpenRouter Vision fallback failed:", errOR.message);
        }
      }

      // 1.B. Probar con Gemini API
      if (geminiKeys.length > 0) {
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

            let lastErrText = "";
            let isQuotaErr = false;

            const modelsToTry = workingModelCache
              ? [workingModelCache]
              : ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"];

            for (const key of geminiKeys) {
              for (const model of modelsToTry) {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
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
                    workingModelCache = model;
                    return res.status(200).json({
                      choices: [{ message: { content: textOut } }]
                    });
                  }
                } else {
                  lastErrText = geminiData.error?.message || `HTTP ${geminiRes.status}`;
                  if (geminiRes.status === 429 || lastErrText.toLowerCase().includes("quota") || lastErrText.toLowerCase().includes("exceeded")) {
                    isQuotaErr = true;
                    break;
                  }
                }
              }
            }

            if (isQuotaErr) {
              return res.status(429).json({
                error: "⏳ Límite de cuota alcanzado en Gemini. Agrega OPENROUTER_API_KEY o una 2da Gemini Key en Vercel."
              });
            }

            return res.status(400).json({ error: `Gemini Error: ${lastErrText}` });
          }
        } catch(errGemini) {
          return res.status(500).json({ error: `Error conectando con Gemini: ${errGemini.message}` });
        }
      }

      return res.status(400).json({ error: "El servicio de OCR requiere configurar la variable OPENROUTER_API_KEY o GEMINI_API_KEY." });
    }

    // 2. Si es Chat o Reporte de Texto (Usar Groq / OpenRouter / Gemini)
    if (OPENROUTER_API_KEY) {
      const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY.trim()}`,
          "HTTP-Referer": "https://novyra.app",
          "X-Title": "NOVIRA App"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-70b-instruct:free",
          messages: body.messages,
          max_tokens: 1500,
          temperature: 0.3
        })
      });

      if (orRes.ok) {
        const data = await orRes.json();
        return res.status(200).json(data);
      }
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
        return res.status(200).json(data);
      }
      return res.status(groqRes.status).json({ error: data.error?.message || "Error en Groq API" });
    }

    if (geminiKeys.length > 0) {
      const textMsg = body.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
      const model = workingModelCache || "gemini-2.0-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKeys[0]}`;
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
