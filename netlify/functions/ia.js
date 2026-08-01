const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://novyranet.netlify.app,https://localhost,http://localhost,http://localhost:8888,http://localhost:5500")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

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
    
    // Permitir content como string O como array (para visión)
    if (typeof message.content === "string") {
      return message.content.length <= 8000;
    } else if (Array.isArray(message.content)) {
      return message.content.length > 0;
    }
    return false;
  });
}

exports.handler = async function(event, context) {
  console.log("=== FUNCION IA V2 ===");
  const headers = corsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, event, { error: "Method Not Allowed" });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!GROQ_API_KEY && !GEMINI_API_KEY) {
    return json(500, event, { error: "API Key de IA no configurada" });
  }

  try {
    const body = JSON.parse(event.body);
    const esVision = body.vision === true;

    if (!validarMessages(body.messages)) {
      return json(400, event, { error: "Payload de mensajes invalido" });
    }

    // 1. Intentar visión con Gemini Flash si hay GEMINI_API_KEY disponible
    if (esVision && GEMINI_API_KEY) {
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

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { inline_data: { mime_type: mimeType, data: base64Data } },
                    { text: promptText }
                  ]
                }],
                generationConfig: { response_mime_type: "application/json" }
              })
            }
          );

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const textOut = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (textOut) {
              return json(200, event, {
                choices: [{ message: { content: textOut } }]
              });
            }
          }
        }
      } catch(errGemini) {
        console.warn("Gemini Vision failed, falling back to Groq:", errGemini.message);
      }
    }

    // 2. Intentar modelos con Groq
    if (!GROQ_API_KEY) {
      return json(500, event, { error: "GROQ_API_KEY no configurada para chat" });
    }

    const modelCandidates = esVision
      ? [
          "llama-3.2-11b-vision-preview",
          "llama-3.2-90b-vision-preview",
          "llama-3.2-11b-vision-instruct",
          "llama-3.2-90b-vision-instruct",
          "llama-3.2-11b-vision",
          "llama-3.2-90b-vision"
        ]
      : ["llama-3.3-70b-versatile"];

    let lastData = null;
    let lastStatus = 500;

    for (const model of modelCandidates) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model,
          messages: body.messages,
          max_tokens: 1500,
          temperature: 0.3
        })
      });

      const data = await res.json();

      if (res.ok) {
        return json(200, event, data);
      }

      lastData = data;
      lastStatus = res.status;
      console.warn(`Groq model ${model} failed (${res.status}):`, data.error?.message);

      if (res.status !== 400 && res.status !== 404) {
        break;
      }
    }

    const errorMsg = esVision
      ? "El servicio de OCR con IA no está disponible actualmente en Groq. Si deseas OCR activo, agrega GEMINI_API_KEY en Netlify."
      : (lastData?.error?.message || "No se pudo procesar la solicitud con Groq");

    return json(lastStatus, event, { error: errorMsg, detail: lastData });

  } catch(e) {
    return json(500, event, { error: e.message });
  }
};
