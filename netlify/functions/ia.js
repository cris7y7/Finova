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
  if (!GROQ_API_KEY) {
    return json(500, event, { error: "GROQ_API_KEY no configurada" });
  }

  try {
    const body = JSON.parse(event.body);
    const esVision = body.vision === true;

    if (!validarMessages(body.messages)) {
      return json(400, event, { error: "Payload de mensajes invalido" });
    }

    const modelCandidates = esVision
      ? [
          "llama-3.2-11b-vision-instruct",
          "llama-3.2-90b-vision-instruct",
          "llama-3.2-11b-vision",
          "llama-3.2-90b-vision",
          "llama-3.2-11b-vision-preview",
          "llama-3.2-90b-vision-preview",
          "llama-3.3-70b-versatile"
        ]
      : ["llama-3.3-70b-versatile"];

    let lastData = null;
    let lastStatus = 500;

    for (const model of modelCandidates) {
      let payloadMessages = body.messages;
      if (esVision && !model.includes("vision")) {
        payloadMessages = body.messages.map(m => {
          if (Array.isArray(m.content)) {
            const textPart = m.content.find(c => c.type === "text")?.text || "Analiza los datos de la factura";
            return { role: m.role, content: textPart };
          }
          return m;
        });
      }

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model,
          messages: payloadMessages,
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

    const errorMsg = lastData?.error?.message || "No se pudo procesar la imagen con los modelos de Groq";
    return json(lastStatus, event, { error: errorMsg, detail: lastData });

  } catch(e) {
    return json(500, event, { error: e.message });
  }
};
