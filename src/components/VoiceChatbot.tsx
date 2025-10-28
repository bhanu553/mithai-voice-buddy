import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const TEST_URL = "https://spacecadet4.app.n8n.cloud/webhook-test/voice-reply";
const PRODUCTION_URL = "https://spacecadet4.app.n8n.cloud/webhook/voice-reply";

export default function VoiceChatbot() {
  const [isRecording, setIsRecording] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const { toast } = useToast();
  
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize Speech Recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        console.log('✅ Speech recognized:', transcript);
        
        // Send to backend
        await sendToBackend(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }

    // Initialize Audio Context
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const stopAiAudio = () => {
    if (currentAudioRef.current) {
      console.log('🛑 User interrupted AI - stopping audio');
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        const audioUrl = currentAudioRef.current.src;
        if (audioUrl && audioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(audioUrl);
        }
      } catch (error) {
        console.error('⚠️ Error stopping audio:', error);
      }
      currentAudioRef.current = null;
      setIsAiSpeaking(false);
      console.log('✅ AI audio stopped - mic re-enabled');
    }
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      console.error('Speech recognition not supported in this browser');
      return;
    }

    // If AI is speaking, stop it and enable mic
    if (isAiSpeaking) {
      stopAiAudio();
      // Don't start recording immediately, let user click again
      return;
    }

    if (isRecording) {
      console.log('🎤 User stopped recording');
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      console.log('🎤 User started recording');
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const sendToBackend = async (userText: string) => {
    const payload = {
      text: userText
    };

    console.log('📤 Sending to backend:', { text: userText, url: PRODUCTION_URL });
    setIsResponding(true);

    try {
      const startTime = Date.now();
      
      // Send to test URL (fire and forget)
      fetch(TEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).catch(() => {});

      // Send to production URL and await response
      console.log('⏳ Fetch started at:', new Date().toISOString());
      
      const response = await fetch(PRODUCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const fetchDuration = Date.now() - startTime;
      console.log(`✅ Fetch completed in ${fetchDuration}ms`);
      console.log('📊 Response status:', response.status, response.statusText);
      console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        console.log('🎵 Content-Type:', contentType);

        // Handle binary audio response
        if (contentType?.includes('audio') || contentType?.includes('mp3') || contentType?.includes('mpeg')) {
          console.log('✅ Received audio response, creating blob...');
          const audioBlob = await response.blob();
          console.log('✅ MP3 Blob created successfully:', { 
            size: audioBlob.size, 
            type: audioBlob.type 
          });
          await playAudioBlob(audioBlob);
        } else {
          console.warn('⚠️ Expected audio response but got:', contentType);
          console.warn('Response might not be MP3 binary data');
          
          // Try to play anyway as blob
          const audioBlob = await response.blob();
          console.log('⚠️ Attempting to play blob anyway:', { 
            size: audioBlob.size, 
            type: audioBlob.type 
          });
          await playAudioBlob(audioBlob);
        }
      } else {
        console.error('❌ Backend returned error status:', response.status);
        throw new Error(`Backend error: ${response.status}`);
      }

    } catch (error) {
      console.error('❌ Backend error:', error);
    } finally {
      setIsResponding(false);
    }
  };

  const playAudioBlob = async (audioBlob: Blob) => {
    try {
      console.log('🎵 Starting audio playback...');
      
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        console.log('⏹️ Stopping previous audio');
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      // Create audio URL from blob
      const audioUrl = URL.createObjectURL(audioBlob);
      console.log('✅ Audio URL created:', audioUrl);
      
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      
      // Disable recording while AI is speaking
      setIsAiSpeaking(true);
      setIsResponding(false);
      
      if (isRecording && recognitionRef.current) {
        console.log('🎤 Stopping microphone input during playback');
        recognitionRef.current.stop();
        setIsRecording(false);
      }

      console.log('▶️ Audio playback started at:', new Date().toISOString());
      await audio.play();

      audio.onended = () => {
        console.log('⏹️ Audio playback ended at:', new Date().toISOString());
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        setIsAiSpeaking(false);
        console.log('🎤 Microphone re-enabled');
      };

      audio.onerror = (e) => {
        console.error('❌ Audio playback error:', e);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        setIsAiSpeaking(false);
      };
    } catch (error) {
      console.error('❌ Audio playback exception:', error);
      setIsAiSpeaking(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center relative"
      style={{
        backgroundImage: 'url(/sweetshop-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Overlay for better readability */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"></div>
      
      {/* Glassmorphism Container */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Header with Glass Effect */}
        <div className="text-center px-8 py-6 mb-16 rounded-3xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg">
            Talk to Anand Mithaiwala 🍬
          </h1>
          <p className="text-white/90 text-xl drop-shadow-md">
            Your friendly voice assistant for sweet conversations
          </p>
        </div>

        {/* Microphone Button with Glass Effect */}
        <div className="relative p-8 rounded-full backdrop-blur-2xl bg-white/10 border border-white/30 shadow-2xl">
          {(isRecording || isAiSpeaking) && (
            <div className="absolute inset-0 rounded-full bg-white/20 animate-pulse"></div>
          )}
          <Button
          onClick={toggleRecording}
          disabled={isResponding}
          className={`w-24 h-24 rounded-full shadow-2xl transition-all duration-300 ${
            isAiSpeaking
              ? "bg-gradient-to-br from-green-500 to-green-600 hover:bg-gradient-to-br hover:from-green-600 hover:to-green-700"
              : isResponding
              ? "bg-gradient-to-br from-yellow-500 to-orange-500 cursor-not-allowed animate-pulse"
              : isRecording 
              ? "bg-destructive hover:bg-destructive/90 scale-110" 
              : "bg-gradient-to-br from-primary to-accent hover:scale-105"
          }`}
          style={{
            boxShadow: isAiSpeaking
              ? "0 0 40px rgba(34, 197, 94, 0.5)"
              : isRecording 
              ? "0 0 40px hsl(var(--destructive) / 0.5)" 
              : "var(--shadow-glow)"
          }}
        >
          {isAiSpeaking ? (
            <Volume2 className="w-12 h-12 text-white animate-pulse" />
          ) : isResponding ? (
            <Mic className="w-12 h-12 text-white animate-pulse" />
          ) : isRecording ? (
            <MicOff className="w-12 h-12 text-white animate-pulse" />
          ) : (
            <Mic className="w-12 h-12 text-white" />
          )}
        </Button>
        </div>
        
        {/* Status Text with Glass Effect */}
        <div className="mt-8 px-6 py-3 rounded-2xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-xl">
          <p className="text-center text-lg text-white font-medium drop-shadow-md">
            {isAiSpeaking 
              ? "🔊 AI is speaking... (tap to interrupt)" 
              : isResponding
              ? "⏳ Getting response..."
              : isRecording 
              ? "🎤 Listening... Tap to stop" 
              : "Tap the microphone to speak"}
          </p>
        </div>
      </div>
    </div>
  );
}
