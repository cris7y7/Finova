# 🚀 NOVYRA — Asistente de Finanzas Personales & Gestión Inteligente

**NOVYRA** es una aplicación multiplataforma (Web PWA + Android APK Nativa) de gestión financiera personal, diseñada para ofrecer privacidad total, cifrado de extremo a extremo (E2E), sincronización automática en la nube con Google Drive y asistencia financiera con Inteligencia Artificial.

---

## 🌟 Características Principales

### 🤖 NOVI AI — Asistente Financiero
- **Chat Conversacional Inteligente:** Diagnósticos financieros, hábitos de gasto y consejos de ahorro personalizados.
- **Escáner OCR de Facturas:** Toma o sube la foto de un recibo y la IA extraerá automáticamente la fecha, monto y concepto.
- **Simulador de Compra:** Evalúa si una compra proyectada se ajusta a tu presupuesto y metas antes de realizarla.

### 🔒 Suite de Seguridad & Privacidad Total
- **Cifrado E2E AES-256-GCM:** Todos tus registros financieros se cifran localmente con una clave derivada de tu PIN de 4 dígitos.
- **Autenticación Biológica Nativa:** Desbloqueo rápido mediante huella dactilar o reconocimiento facial.
- **Modo Incógnito (`👁️/🙈`):** Oculta saldos al instante con un botón estilo visibilidad de contraseña de iOS/Android.
- **Auto-Bloqueo Configurable:** Elige la temporización de bloqueo (`0m` inmediato al minimizar, `1m`, `5m`, `15m`).

### ☁️ Sincronización en la Nube con Google Drive v3.5
- **Backups Cifrados:** Sincronización automática en segundo plano directo a tu cuenta de Google.
- **Detección Bidireccional:** Te notifica si existe un respaldo más reciente en otro dispositivo.
- **Puntos de Restauración (Snapshots):** Historial diario de respaldos (`novyra_snap_YYYY-MM-DD.json`) con restauración a 1 toque.

### 🎨 Diseño artesanal con Íconos Humanos (Heroicons por Steve Schoger)
- **100% Sin Emojis Unicode:** Toda la interfaz utiliza trazados vectoriales SVG hechos a mano por el diseñador Steve Schoger.
- **Rendimiento Offline de 0ms:** Trazados inline livianos que no requieren conexión a internet ni librerías externas.
- **Header Fintech Simétrico:** Layout de 3 columnas con logo central resplandeciente en gradiente esmeralda.

---

## 🛠️ Stack Tecnológico

- **Frontend:** HTML5, Vanilla CSS3, JavaScript ES6
- **Vector Graphics:** Heroicons (Steve Schoger / Tailwind Labs) + Lucide SVGs
- **Nativo Móvil:** Capacitor 8 (Android Studio / Java / WebView)
- **Cifrado Local:** Web Crypto API (PBKDF2, SHA-256, AES-256-GCM)
- **Cloud & Cloud Storage:** Google Drive v3 API (OAuth 2.0 PKCE / Deep Linking)
- **Motor de IA & OCR:** Groq API (Llama 3.3 70B & Llama 4 Scout Vision) via Netlify Serverless Functions
- **Hosting & Web Deployment:** Netlify (novyranet.netlify.app)

---

## 📄 Licencia y Derechos

© 2026 NOVYRA. Todos los derechos reservados.
