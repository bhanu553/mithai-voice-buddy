import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Message {
  type: "user" | "bot";
  text: string;
  timestamp: Date;
}

const PRODUCTION_URL = "https://space432.app.n8n.cloud/webhook/voice-reply";
const TEST_URL = "https://space432.app.n8n.cloud/webhook-test/voice-reply";

export default function VoiceChatbot() {
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const { toast } = useToast();
  
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

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
        console.log('Recognized text:', transcript);
        
        // Add user message
        setMessages(prev => [...prev, { type: "user", text: transcript, timestamp: new Date() }]);
        
        // Send to backend
        await sendToBackend(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        toast({
          variant: "destructive",
          title: "Speech Recognition Error",
          description: "Could not recognize speech. Please try again.",
        });
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

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast({
        variant: "destructive",
        title: "Not Supported",
        description: "Speech recognition is not supported in your browser.",
      });
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const sendToBackend = async (userText: string) => {
    setIsThinking(true);
    
    const payload = {
      userText,
      clientId: "anand_mithaiwala"
    };

    try {
      // Try production URL first
      let response = await fetch(PRODUCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // If production fails, try test URL
      if (!response.ok) {
        console.log('Production URL failed, trying test URL...');
        response = await fetch(TEST_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        throw new Error('Both URLs failed');
      }

      const data = await response.json();
      console.log('Backend response:', data);

      // Add bot message
      setMessages(prev => [...prev, { 
        type: "bot", 
        text: data.replyText, 
        timestamp: new Date() 
      }]);

      // Play audio
      if (data.audioBase64) {
        await playAudio(data.audioBase64);
      }

    } catch (error) {
      console.error('Backend error:', error);
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Could not reach the assistant. Please try again.",
      });
    } finally {
      setIsThinking(false);
    }
  };

  const playAudio = async (base64Audio: string) => {
    try {
      // Decode base64 to array buffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create blob and audio element
      const blob = new Blob([bytes], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(blob);
      
      const audio = new Audio(audioUrl);
      await audio.play();

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
    } catch (error) {
      console.error('Audio playback error:', error);
      toast({
        variant: "destructive",
        title: "Audio Error",
        description: "Could not play audio response.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col">
      {/* Header */}
      <header className="text-center pt-8 pb-6 px-4">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-2">
          Talk to Anand Mithaiwala 🍬
        </h1>
        <p className="text-muted-foreground text-lg">
          Your friendly voice assistant for sweet conversations
        </p>
      </header>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 pb-32 max-w-4xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center mt-20 animate-fade-in">
            <div className="text-6xl mb-4">🎤</div>
            <p className="text-xl text-muted-foreground">
              Press the microphone to start talking
            </p>
          </div>
        )}
        
        <div className="space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
            >
              <div
                className={`max-w-[80%] md:max-w-[60%] rounded-2xl px-6 py-4 shadow-lg ${
                  msg.type === "user"
                    ? "bg-gradient-to-br from-primary to-accent text-primary-foreground"
                    : "bg-card text-card-foreground border-2 border-border"
                }`}
              >
                <p className="text-base leading-relaxed">{msg.text}</p>
                <span className="text-xs opacity-70 mt-2 block">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          
          {isThinking && (
            <div className="flex justify-start animate-fade-in">
              <div className="bg-card text-card-foreground rounded-2xl px-6 py-4 border-2 border-border flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-muted-foreground">Thinking...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Microphone Button */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
        <div className="relative">
          {isRecording && (
            <div className="absolute inset-0 rounded-full bg-primary/30 animate-pulse-ring"></div>
          )}
          <Button
            onClick={toggleRecording}
            disabled={isThinking}
            className={`w-20 h-20 rounded-full shadow-2xl transition-all duration-300 ${
              isRecording 
                ? "bg-destructive hover:bg-destructive/90 scale-110" 
                : "bg-gradient-to-br from-primary to-accent hover:scale-105"
            }`}
            style={{
              boxShadow: isRecording 
                ? "0 0 40px hsl(var(--destructive) / 0.5)" 
                : "var(--shadow-glow)"
            }}
          >
            {isRecording ? (
              <MicOff className="w-10 h-10 text-white animate-pulse" />
            ) : (
              <Mic className="w-10 h-10 text-white" />
            )}
          </Button>
        </div>
        <p className="text-center mt-3 text-sm text-muted-foreground font-medium">
          {isRecording ? "Tap to stop" : "Tap to speak"}
        </p>
      </div>
    </div>
  );
}
