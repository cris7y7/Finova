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
  const raw = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_KEY || process.env.GEMINI_APIKEY || "";
  if (!raw) {
    const dynamicKeyName = Object.keys(process.env).find(k => /gemini|google_api/i.test(k));
    if (dynamicKeyName && process.env[dynamicKeyName]) {
      return process.env[dynamicKeyName].split(",").map(k => k.trim()).filter(Boolean);
    }
    return [];
  }
  return raw.split(",").map(k => k.trim()).filter(Boolean);
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
  const geminiKeys = obtenerGeminiKeys();

  if (!GROQ_API_KEY && geminiKeys.length === 0) {
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

            // Probar las llaves disponibles (con rotación rápida en caso de cuota)
            for (const key of geminiKeys) {
              const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
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
                lastErrText = geminiData.error?.message || `HTTP ${geminiRes.status}`;
                console.warn("Gemini key error, intentando siguiente llave si existe:", lastErrText);
              }
            }

            if (lastErrText.toLowerCase().includes("quota") || lastErrText.toLowerCase().includes("exceeded")) {
              return res.status(429).json({
                error: "⏳ Límite de cuota alcanzado en Gemini. Reintenta en unos segundos o agrega una 2da API Key en Vercel."
              });
            }

            return res.status(400).json({ error: `Gemini Error: ${lastErrText}` });
          }
        } catch(errGemini) {
          return res.status(500).json({ error: `Error conectando con Gemini: ${errGemini.message}` });
        }
      }

      return res.status(400).json({ error: "El servicio de OCR requiere configurar la variable GEMINI_API_KEY en tu proyecto." });
    }

    // 2. Si es Chat o Reporte de Texto (Usar Groq si está disponible para velocidad ilimitada)
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKeys[0]}`;
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
