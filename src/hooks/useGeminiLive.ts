import { useState, useEffect, useRef, useCallback } from 'react';
import { arrayBufferToBase64, floatTo16BitPCM, base64ToFloat32 } from '@/src/lib/audio-utils';
import { TutorConfig, getSystemInstruction } from '@/shared/prompts';

const AUDIO_PROCESSOR_WORKLET = `
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const inputData = input[0];
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}
registerProcessor('audio-recorder-processor', AudioProcessor);
`;

export interface Message {
  role: 'user' | 'model';
  text: string;
}

export function useGeminiLive(config: TutorConfig) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [latency, setLatency] = useState(0);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);

  const [audioState, setAudioState] = useState<string>('closed');

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const lastPingTimeRef = useRef<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (audioCtxRef.current) {
        setAudioState(audioCtxRef.current.state);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const processorNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const stopRecording = useCallback(() => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (streamSourceRef.current) {
      streamSourceRef.current.disconnect();
      streamSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Send setup config
      ws.send(JSON.stringify({
        type: 'setup',
        systemInstruction: getSystemInstruction(config)
      }));
      
      // Start heartbeat
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          lastPingTimeRef.current = performance.now();
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 15000);

      ws.onclose = () => {
        clearInterval(pingInterval);
        setIsConnected(false);
        wsRef.current = null;
      };
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'pong') {
        setLatency(Math.round(performance.now() - lastPingTimeRef.current));
        return;
      }

      // Handle Gemini Live model content
      if (msg.serverContent) {
        const { modelTurn, interrupted, turnComplete } = msg.serverContent;
        
        if (interrupted) {
          // Interrupt playback
          nextStartTimeRef.current = audioCtxRef.current?.currentTime || 0;
          setIsModelSpeaking(false);
        }

        if (modelTurn?.parts) {
          modelTurn.parts.forEach((part: any) => {
            if (part.inlineData) {
              playAudioChunk(part.inlineData.data);
              setIsModelSpeaking(true);
            }
            if (part.text) {
               setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'model') {
                  return [...prev.slice(0, -1), { role: 'model', text: last.text + ' ' + part.text }];
                }
                return [...prev, { role: 'model', text: part.text }];
              });
            }
          });
        }
      }

      // Handle User Transcription if enabled (simplified here)
      if (msg.serverContent?.userTurn?.parts?.[0]?.text) {
        setMessages(prev => [...prev, { role: 'user', text: msg.serverContent.userTurn.parts[0].text }]);
      }
    };

    ws.onerror = (err) => {
      console.error('WS Error:', err);
    };
  }, [config]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, config.proficiency, config.speechRate]);

  const startRecording = useCallback(async () => {
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        try {
          audioCtxRef.current = new AudioContextClass({ sampleRate: 16000 });
        } catch (e) {
          console.warn('Could not force 16kHz AudioContext, using default sample rate:', e);
          audioCtxRef.current = new AudioContextClass();
        }
      }
      
      const audioCtx = audioCtxRef.current!;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser or context.');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
      } catch (e) {
        console.warn('Precision getUserMedia failed, trying basic audio constraints:', e);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      if (!stream || stream.getAudioTracks().length === 0) {
        throw new Error('No audio tracks were returned by the system.');
      }

      micStreamRef.current = stream;
      setIsRecording(true);

      // Load Worklet if possible
      if (audioCtx.audioWorklet) {
        try {
          const blob = new Blob([AUDIO_PROCESSOR_WORKLET], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          await audioCtx.audioWorklet.addModule(workletUrl);
          
          const source = audioCtx.createMediaStreamSource(stream);
          const processorNode = new AudioWorkletNode(audioCtx, 'audio-recorder-processor');
          
          streamSourceRef.current = source;
          processorNodeRef.current = processorNode;

          processorNode.port.onmessage = (event) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              const base64 = arrayBufferToBase64(event.data);
              wsRef.current.send(JSON.stringify({ audio: base64 }));
            }
          };

          source.connect(processorNode);
          URL.revokeObjectURL(workletUrl);
        } catch (e: any) {
          console.error('Worklet initialization failed:', e);
          if (!e?.message?.includes('already registered')) {
             setupLegacyProcessor(audioCtx, stream);
          } else {
             // Already registered, just need to create the node
             try {
               const source = audioCtx.createMediaStreamSource(stream);
               const processorNode = new AudioWorkletNode(audioCtx, 'audio-recorder-processor');
               streamSourceRef.current = source;
               processorNodeRef.current = processorNode;
               processorNode.port.onmessage = (event) => {
                 if (wsRef.current?.readyState === WebSocket.OPEN) {
                   const base64 = arrayBufferToBase64(event.data);
                   wsRef.current.send(JSON.stringify({ audio: base64 }));
                 }
               };
               source.connect(processorNode);
             } catch (retryErr) {
               console.error('Retry with existing worklet failed:', retryErr);
               setupLegacyProcessor(audioCtx, stream);
             }
          }
        }
      } else {
        setupLegacyProcessor(audioCtx, stream);
      }
    } catch (err) {
      console.error('Mic Access Error Detail:', err);
      setIsRecording(false);
    }
  }, []);

  const setupLegacyProcessor = (audioCtx: AudioContext, stream: MediaStream) => {
    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    
    streamSourceRef.current = source;
    // We'll reuse processorNodeRef for compatibility in stopRecording
    (processorNodeRef as any).current = processor;

    source.connect(processor);
    processor.connect(audioCtx.destination);

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = floatTo16BitPCM(inputData);
        const base64 = arrayBufferToBase64(pcm16.buffer);
        wsRef.current.send(JSON.stringify({ audio: base64 }));
      }
    };
  };

  const playAudioChunk = useCallback((base64: string) => {
    if (!audioCtxRef.current) return;
    
    const float32 = base64ToFloat32(base64);
    const buffer = audioCtxRef.current.createBuffer(1, float32.length, 16000);
    buffer.getChannelData(0).set(float32);

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = buffer;
    source.onended = () => {
      // Logic to track if model is still speaking could be added here
    };

    source.connect(audioCtxRef.current.destination);
    
    const startTime = Math.max(audioCtxRef.current.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;
  }, []);

  return {
    isConnected,
    isRecording,
    messages,
    latency,
    isModelSpeaking,
    audioState,
    connect,
    startRecording,
    stopRecording
  };
}
