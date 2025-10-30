import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Volume2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const TEST_URL = "https://spacecadet4.app.n8n.cloud/webhook-test/voice-reply";
const PRODUCTION_URL = "https://spacecadet4.app.n8n.cloud/webhook/voice-reply";

export default function VoiceChatbot() {
  const [isRecording, setIsRecording] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [userTranscript, setUserTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const { toast } = useToast();
  
  const recognitionRef = useRef<any>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingInterruptionRef = useRef(false);
  const reinitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isListeningRef = useRef(false);

  useEffect(() => {
    // Initialize Speech Recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      // Enable continuous recognition for interruption capability
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = async (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        console.log('✅ Speech recognized:', transcript);
        
        // Check if AI is speaking - if so, interrupt immediately
        if (isAiSpeaking) {
          console.log('🛑 User interrupted AI - stopping playback');
          pendingInterruptionRef.current = true;
          
          // Stop AI audio immediately
          if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current.currentTime = 0;
            const audioUrl = currentAudioRef.current.src;
            if (audioUrl && audioUrl.startsWith('blob:')) {
              URL.revokeObjectURL(audioUrl);
            }
            currentAudioRef.current = null;
            setIsAiSpeaking(false);
          }
          
          // Stop recognition temporarily to process
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop();
            } catch (e) {
              console.error('Error stopping recognition:', e);
            }
          }
          
          setIsRecording(false);
          setUserTranscript(transcript);
          
          // Reset interruption flag immediately so audio.onended can restart mic
          pendingInterruptionRef.current = false;
          
          // Process with standard delay to ensure clean state
          setTimeout(async () => {
            await sendToBackend(transcript);
          }, 300);
          
          return;
        }
        
        // Normal flow - only process if not currently responding
        if (!isResponding) {
          setIsRecording(false);
          setUserTranscript(transcript);
          
          // Stop recognition to process this input
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop();
            } catch (e) {
              console.error('Error stopping recognition:', e);
            }
          }
          
          await sendToBackend(transcript);
        }
        
        // Clear transcript after 3 seconds
        setTimeout(() => setUserTranscript(""), 3000);
      };

      // Detect when user starts speaking (for interruption)
      recognitionRef.current.onaudiostart = () => {
        console.log('🎤 Audio input detected - mic is receiving input');
        if (isAiSpeaking && !pendingInterruptionRef.current) {
          console.log('⚠️ User voice detected during AI speech - preparing interruption');
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        isListeningRef.current = false;
        // Restart listening if enabled and not handling interruption
        if (isEnabled && !pendingInterruptionRef.current) {
          setTimeout(() => startListening(), 300);
        }
      };

      recognitionRef.current.onend = () => {
        console.log('🎤 Recognition ended');
        setIsRecording(false);
        isListeningRef.current = false;
        
        // Auto-restart listening if enabled, AI not speaking, and not handling interruption
        if (isEnabled && !isAiSpeaking && !isResponding && !pendingInterruptionRef.current) {
          setTimeout(() => {
            console.log('🔄 Auto-restarting mic after recognition end');
            startListening();
          }, 300);
        }
      };
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
      // Cleanup timeouts
      if (reinitTimeoutRef.current) {
        clearTimeout(reinitTimeoutRef.current);
      }
    };
  }, [isEnabled, isAiSpeaking, isResponding]);

  const startListening = (retryAttempt: number = 0) => {
    if (!recognitionRef.current) return;
    
    // Don't start if AI is speaking or system is processing
    if (isAiSpeaking || isResponding) {
      console.log('⚠️ Cannot start - AI speaking or processing');
      return;
    }
    
    // Prevent starting if already recording
    if (isRecording) {
      console.log('⚠️ Already recording, skipping start');
      isListeningRef.current = true;
      return;
    }
    
    try {
      console.log('🎤 Starting speech recognition...', retryAttempt > 0 ? `(retry ${retryAttempt})` : '');
      setIsRecording(true);
      isListeningRef.current = true;
      recognitionRef.current.start();
      
      // Verify mic started successfully after 300ms - retry if not listening
      if (retryAttempt === 0) {
        clearTimeout(reinitTimeoutRef.current!);
        reinitTimeoutRef.current = setTimeout(() => {
          if (!isRecording && isEnabled && !isAiSpeaking && !isResponding) {
            console.log('⚠️ Mic start verification failed - attempting retry');
            startListening(1);
          }
        }, 300);
      }
    } catch (error) {
      console.error('Error starting recognition:', error);
      setIsRecording(false);
      isListeningRef.current = false;
      
      // Retry once if first attempt fails
      if (retryAttempt === 0 && isEnabled) {
        console.log('⚠️ Retrying mic start after error...');
        setTimeout(() => startListening(1), 300);
      }
    }
  };

  const stopAiAudio = () => {
    if (currentAudioRef.current) {
      console.log('🛑 Stopping AI audio');
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
      setAiResponse("");
      isListeningRef.current = false;
      console.log('✅ AI audio stopped cleanly');
    }
  };

  const toggleAssistant = () => {
    if (!recognitionRef.current) {
      console.error('Speech recognition not supported in this browser');
      return;
    }

    if (isAiSpeaking || isResponding) {
      // If AI is speaking or processing, interrupt and start listening immediately
      console.log('🛑 Manual interrupt triggered');
      pendingInterruptionRef.current = true;
      stopAiAudio();
      setIsResponding(false);
      setIsEnabled(true); // Ensure assistant stays enabled
      
      // Restart mic after interruption with standard delay
      setTimeout(() => {
        pendingInterruptionRef.current = false;
        startListening();
      }, 300);
      return;
    }

    if (isEnabled) {
      // Turn OFF assistant
      setIsEnabled(false);
      setIsRecording(false);
      pendingInterruptionRef.current = false;
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore
      }
      console.log('🛑 Assistant disabled');
    } else {
      // Turn ON assistant and start listening
      setIsEnabled(true);
      pendingInterruptionRef.current = false;
      setTimeout(() => startListening(), 300);
      console.log('✅ Assistant enabled');
    }
  };

  const sendToBackend = async (userText: string) => {
    const payload = {
      text: userText
    };

    console.log('📤 Sending to backend:', { text: userText, url: PRODUCTION_URL });
    setIsResponding(true);
    setAiResponse("Processing...");

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
          setAiResponse("Speaking...");
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
      // Reinitialize mic on error
      if (isEnabled && !pendingInterruptionRef.current) {
        setTimeout(() => startListening(), 300);
      }
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
      
      // Keep mic active during AI speech to allow interruptions
      setIsAiSpeaking(true);
      setIsResponding(false);

      console.log('▶️ Audio playback started at:', new Date().toISOString());
      await audio.play();

      audio.onended = () => {
        console.log('⏹️ Audio playback ended at:', new Date().toISOString());
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        setIsAiSpeaking(false);
        setAiResponse("");
        console.log('🎤 Audio complete - reinitializing mic');
        
        // Clean reinitialization: single activation after AI finishes
        if (isEnabled && !pendingInterruptionRef.current) {
          setTimeout(() => {
            console.log('🔄 Reactivating mic after AI speech');
            startListening();
          }, 300);
        }
        
        // Reset interruption flag
        pendingInterruptionRef.current = false;
      };

      audio.onerror = (e) => {
        console.error('❌ Audio playback error:', e);
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
        setIsAiSpeaking(false);
        setAiResponse("");
        
        // Reinitialize mic after error
        if (isEnabled && !pendingInterruptionRef.current) {
          setTimeout(() => startListening(), 300);
        }
      };
    } catch (error) {
      console.error('❌ Audio playback exception:', error);
      setIsAiSpeaking(false);
      setAiResponse("");
      
      // Reinitialize mic after exception
      if (isEnabled && !pendingInterruptionRef.current) {
        setTimeout(() => startListening(), 300);
      }
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
          {/* Outer ring animations for different states */}
          {isAiSpeaking && (
            <div className="absolute inset-0 rounded-full bg-green-500/30 animate-ping"></div>
          )}
          {isResponding && (
            <div className="absolute inset-0 rounded-full border-4 border-yellow-500/50 animate-spin" style={{ animationDuration: '2s' }}></div>
          )}
          {isRecording && !isResponding && !isAiSpeaking && (
            <>
              <div className="absolute inset-0 rounded-full bg-blue-500/30 animate-pulse"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-400/50 animate-ping" style={{ animationDuration: '2s' }}></div>
            </>
          )}
          
          <Button
            onClick={toggleAssistant}
            className={`w-24 h-24 rounded-full shadow-2xl transition-all duration-500 relative z-10 ${
              isAiSpeaking
                ? "bg-gradient-to-br from-green-500 to-green-700 scale-110"
                : isResponding
                ? "bg-gradient-to-br from-yellow-400 to-orange-600 scale-105"
                : isRecording
                ? "bg-gradient-to-br from-blue-500 to-blue-700 hover:scale-105"
                : isEnabled
                ? "bg-gradient-to-br from-gray-600 to-gray-800 hover:scale-105"
                : "bg-gradient-to-br from-gray-500 to-gray-700 hover:scale-105"
            }`}
            style={{
              boxShadow: isAiSpeaking
                ? "0 0 50px rgba(34, 197, 94, 0.8), 0 0 100px rgba(34, 197, 94, 0.4)"
                : isResponding
                ? "0 0 50px rgba(251, 191, 36, 0.8), 0 0 100px rgba(251, 191, 36, 0.4)"
                : isRecording
                ? "0 0 40px rgba(59, 130, 246, 0.6), 0 0 80px rgba(59, 130, 246, 0.3)"
                : "0 0 20px rgba(107, 114, 128, 0.4)"
            }}
          >
            {isAiSpeaking ? (
              <Volume2 className="w-12 h-12 text-white animate-pulse" />
            ) : isResponding ? (
              <Loader2 className="w-12 h-12 text-white animate-spin" />
            ) : isRecording ? (
              <Mic className="w-12 h-12 text-white animate-pulse" />
            ) : isEnabled ? (
              <Mic className="w-12 h-12 text-white/70" />
            ) : (
              <MicOff className="w-12 h-12 text-white" />
            )}
          </Button>
        </div>
        
        {/* Status Text with Glass Effect */}
        <div className="mt-8 px-6 py-3 rounded-2xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-xl">
          <p className={`text-center text-lg text-white font-medium drop-shadow-md transition-all duration-300 ${
            isAiSpeaking || isResponding ? 'animate-pulse' : ''
          }`}>
            {isAiSpeaking 
              ? "🔊 AI Speaking - Click to interrupt" 
              : isResponding
              ? "⏳ Processing your request..."
              : isRecording
              ? "👂 Listening..."
              : isEnabled
              ? "Ready - Start speaking"
              : "Tap to activate voice assistant"}
          </p>
        </div>

        {/* Live Transcript Feedback */}
        {userTranscript && (
          <div className="mt-4 px-6 py-3 rounded-2xl backdrop-blur-xl bg-blue-500/20 border border-blue-400/30 shadow-xl animate-fade-in">
            <p className="text-center text-sm text-white/90 drop-shadow-md">
              💬 You said: "{userTranscript}"
            </p>
          </div>
        )}
        
        {aiResponse && (
          <div className="mt-4 px-6 py-3 rounded-2xl backdrop-blur-xl bg-green-500/20 border border-green-400/30 shadow-xl animate-fade-in">
            <p className="text-center text-sm text-white/90 drop-shadow-md">
              🤖 AI: {aiResponse}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
