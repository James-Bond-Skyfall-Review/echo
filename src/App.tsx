import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Settings, MessageSquare, Terminal } from 'lucide-react';
import { useGeminiLive } from '@/src/hooks/useGeminiLive';
import { DEFAULT_CONFIG, ProficiencyLevel } from '@/shared/prompts';

const MessageBubble = React.memo(({ role, text }: { role: 'user' | 'model', text: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`flex flex-col gap-1 ${role === 'user' ? 'items-end' : 'items-start'}`}
  >
    <span className={`text-[9px] font-bold uppercase ${role === 'user' ? 'text-slate-400' : 'text-blue-600'}`}>
      {role === 'user' ? 'You' : 'AI Tutor'}
    </span>
    <p className={`text-sm p-3 rounded-2xl ${
      role === 'user' 
        ? 'bg-slate-800 text-white rounded-tr-none' 
        : 'bg-blue-50 text-slate-700 border border-blue-100 rounded-tl-none'
    }`}>
      {text}
    </p>
  </motion.div>
));

export default function App() {
  const [config, setConfig] = React.useState(DEFAULT_CONFIG);
  const [showDebug, setShowDebug] = React.useState(true);
  
  const {
    isConnected,
    isRecording,
    messages,
    latency,
    isModelSpeaking,
    audioState,
    connect,
    startRecording,
    stopRecording
  } = useGeminiLive(config);

  const handleMicToggle = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  return (
    <div className="h-screen flex flex-col font-sans text-slate-800 bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900 font-display">
            EchoTutor AI <span className="text-xs font-normal text-slate-400 ml-2">v2.0 Flash</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 items-end h-3 w-4">
              <div className={`w-1 h-3 ${latency < 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
              <div className={`w-1 h-2 ${latency < 200 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
              <div className={`w-1 h-1 ${latency < 300 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{latency}ms Latency</span>
          </div>
          <div className={`flex items-center gap-2 py-1 px-3 rounded-full border ${
            isConnected ? 'bg-emerald-50/50 border-emerald-100 text-emerald-600' : 'bg-red-50 border-red-100 text-red-600'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            <span className="text-[10px] font-bold uppercase">{isConnected ? 'STABLE' : 'DISCONNECTED'}</span>
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left Panel: Controls */}
        <aside className="w-72 border-r border-slate-200 bg-white flex flex-col p-6 gap-8 shrink-0 overflow-y-auto">
          <section>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4">Proficiency Level</label>
            <div className="space-y-2">
              {(['beginner', 'intermediate', 'advanced'] as ProficiencyLevel[]).map(p => (
                <button
                  key={p}
                  onClick={() => setConfig({ ...config, proficiency: p })}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all text-sm ${
                    config.proficiency === p 
                      ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' 
                      : 'border-slate-100 text-slate-500 font-medium hover:border-blue-100'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex justify-between items-center mb-4">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Speech Rate</label>
              <span className="text-xs font-mono font-bold text-blue-600">{config.speechRate}x</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="2.0" 
              step="0.1" 
              value={config.speechRate}
              onChange={(e) => setConfig({ ...config, speechRate: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between mt-2 text-[10px] text-slate-400 font-medium font-mono uppercase tracking-tighter">
              <span>0.5x</span>
              <span>1.0x</span>
              <span>2.0x</span>
            </div>
          </section>

          <section className="mt-auto bg-slate-50 p-4 rounded-xl border border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest">Active Tags</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-black tracking-tight">[FEEDBACK]</span>
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-black tracking-tight">[TRANSLATE]</span>
            </div>
          </section>
        </aside>

        {/* Center: Interaction Area */}
        <div className="flex-1 flex flex-col items-center justify-center relative bg-gradient-to-b from-slate-50 to-white overflow-hidden">
          {/* Visualizer Area */}
          <div className="relative flex items-center justify-center w-80 h-80">
            <motion.div 
              animate={{ scale: isModelSpeaking ? [1, 1.1, 1] : 1 }}
              transition={{ duration: 1, repeat: Infinity }}
              className="absolute w-full h-full rounded-full border-2 border-blue-200 opacity-20" 
            />
            <motion.div 
              animate={{ scale: isModelSpeaking ? [1, 1.2, 1] : 1 }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute w-[80%] h-[80%] rounded-full border-2 border-blue-400 opacity-40" 
            />
            <div className="absolute w-[110%] h-[110%] rounded-full border border-blue-100 border-dashed animate-spin-slow opacity-30" />
            
            {/* Waveform Visualization Mockup */}
            <div className="flex items-center gap-1.5 h-32">
              {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    height: isModelSpeaking ? [10 * h, 20 * h, 10 * h] : 10,
                    opacity: isModelSpeaking ? 1 : 0.2
                  }}
                  transition={{ duration: 0.5, delay: i * 0.05, repeat: Infinity }}
                  className="w-1.5 bg-blue-600 rounded-full"
                />
              ))}
            </div>
          </div>

          {/* Interactive Microphone */}
          <div className="absolute bottom-12 flex flex-col items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleMicToggle}
              className={`group w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 border-4 border-white ${
                isRecording 
                  ? 'bg-red-500 text-white shadow-red-200' 
                  : 'bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700'
              }`}
            >
              {isRecording ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
              
              {isRecording && (
                <motion.div 
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-full bg-red-500 -z-10"
                />
              )}
            </motion.button>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
              {isRecording ? 'TAP TO PAUSE' : isModelSpeaking ? 'TUTOR SPEAKING' : 'TAP TO START'}
            </span>
          </div>
        </div>

        {/* Right Panel: Transcript & Debug */}
        <aside className="w-80 border-l border-slate-200 bg-white flex flex-col shrink-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <MessageSquare className="w-3 h-3" /> Transcript
            </h2>
            <button className="text-[10px] text-blue-600 font-bold uppercase hover:underline">Clear</button>
          </div>
          
          <div className="flex-1 p-4 space-y-4 overflow-y-auto scroll-smooth bg-slate-50/30">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 grayscale opacity-50">
                <MessageSquare className="w-8 h-8" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-center">Conversation will appear here</p>
              </div>
            )}
            <AnimatePresence initial={false} mode="popLayout">
              {messages.slice(-50).map((m, i) => (
                <MessageBubble key={`${i}-${m.text.length}`} role={m.role} text={m.text} />
              ))}
            </AnimatePresence>
          </div>

          {/* Console Debugger */}
          {showDebug && (
            <div className="h-56 bg-slate-900 border-t border-slate-800 flex flex-col font-mono text-[10px]">
              <div className="px-3 py-2 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                <span className="text-slate-500 uppercase tracking-widest font-bold">System Console</span>
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                   <button onClick={() => setShowDebug(false)} className="text-slate-600 hover:text-slate-400">×</button>
                </div>
              </div>
              <div className="p-3 text-emerald-400 space-y-1 overflow-y-auto custom-scrollbar">
                <p><span className="text-slate-500">[{new Date().toLocaleTimeString()}]</span> WS Handshake: Success</p>
                <p><span className="text-slate-500">[{new Date().toLocaleTimeString()}]</span> AudioCtx: <span className="text-blue-400">{audioState.toUpperCase()}</span></p>
                <p><span className="text-slate-500">[{new Date().toLocaleTimeString()}]</span> Heartbeat Active (15s)</p>
                <p><span className="text-slate-500">[{new Date().toLocaleTimeString()}]</span> PCM Chunk Ready: 16kHz Mono</p>
                {isConnected && <p><span className="text-slate-500">[{new Date().toLocaleTimeString()}]</span> Session: Gemini-Flash-Live v3.1</p>}
                <p className="text-slate-600 animate-pulse">_</p>
              </div>
            </div>
          )}
        </aside>
      </main>

      {/* Footer */}
      <footer className="h-8 bg-white border-t border-slate-200 px-6 flex items-center justify-between shrink-0 font-mono text-[9px]">
        <div className="text-slate-400 flex items-center gap-2">
          <Settings className="w-3 h-3" />
          SYSTEM: <span className="text-slate-600 font-bold">Node-Relay v20.1</span>
        </div>
        <div className="flex gap-4 text-slate-400 font-bold">
          <span>JITTER: 120MS</span>
          <span>FLOAT32-PCM16</span>
          <span className="text-blue-600 uppercase">PWA LITE READY</span>
        </div>
      </footer>

      <style>{`
        .animate-spin-slow { animation: spin 20s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}</style>
    </div>
  );
}
