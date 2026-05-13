import express from "express";
import path from "path";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const PORT = 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Middleware for parsing JSON
app.use(express.json());

// WebSocket Relay Logic with Security Enhancements
const activeSessions = new Map<string, any>();

wss.on("connection", (clientWs, req) => {
  const sessionId = Math.random().toString(36).substring(7);
  console.log(`[${sessionId}] Client connected`);

  let geminiSession: any = null;
  let isClosing = false;

  const cleanup = () => {
    if (isClosing) return;
    isClosing = true;
    console.log(`[${sessionId}] Cleaning up resources`);
    if (geminiSession) {
      try { geminiSession.close(); } catch (e) {}
      geminiSession = null;
    }
    activeSessions.delete(sessionId);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  };

  clientWs.on("message", async (message) => {
    // Security: Limit message size (e.g., 100KB for safety)
    if (message.toString().length > 102400) {
      console.warn(`[${sessionId}] Payload too large, disconnecting`);
      cleanup();
      return;
    }

    try {
      const data = JSON.parse(message.toString());

      if (data.type === "setup") {
        if (geminiSession) return; // Already setup

        const { systemInstruction } = data;
        if (typeof systemInstruction !== 'string') throw new Error("Invalid setup payload");
        
        try {
          geminiSession = await ai.live.connect({
            model: "gemini-3.1-flash-live-preview",
            callbacks: {
              onmessage: (msg: LiveServerMessage) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify(msg));
                }
              },
              onclose: () => {
                console.log(`[${sessionId}] Gemini session closed by remote`);
                cleanup();
              },
              onerror: (err) => {
                console.error(`[${sessionId}] Gemini Error:`, err);
                cleanup();
              }
            },
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
              },
              systemInstruction,
              temperature: 0.7
            },
          });
          activeSessions.set(sessionId, geminiSession);
          console.log(`[${sessionId}] Gemini session established`);
        } catch (e) {
          console.error(`[${sessionId}] Gemini Connection Failed:`, e);
          cleanup();
        }
        return;
      }

      if (data.audio && geminiSession) {
        // Validate audio format if possible, or just relay
        geminiSession.sendRealtimeInput({
          audio: { 
            data: data.audio, 
            mimeType: "audio/pcm;rate=16000" 
          },
        });
      }

      if (data.type === "ping") {
        clientWs.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      }

    } catch (err) {
      console.error(`[${sessionId}] Message Handling Error:`, err);
    }
  });

  clientWs.on("close", cleanup);
  clientWs.on("error", (err) => {
    console.error(`[${sessionId}] WebSocket Error:`, err);
    cleanup();
  });
});

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Correct Express v4 routing for production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
