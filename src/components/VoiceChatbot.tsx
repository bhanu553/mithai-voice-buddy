import { useState, useRef, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const PRODUCTION_URL = "https://space432.app.n8n.cloud/webhook/voice-reply";
const TEST_URL = "https://space432.app.n8n.cloud/webhook-test/voice-reply";

export default function VoiceChatbot() {
  const [isRecording, setIsRecording] = useState(false);
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
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col items-center justify-center">
      {/* Header */}
      <div className="text-center px-4 mb-16">
        <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-4">
          Talk to Anand Mithaiwala 🍬
        </h1>
        <p className="text-muted-foreground text-xl">
          Your friendly voice assistant for sweet conversations
        </p>
      </div>

      {/* Microphone Button */}
      <div className="relative">
        {isRecording && (
          <div className="absolute inset-0 rounded-full bg-primary/30 animate-pulse-ring"></div>
        )}
        <Button
          onClick={toggleRecording}
          className={`w-24 h-24 rounded-full shadow-2xl transition-all duration-300 ${
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
            <MicOff className="w-12 h-12 text-white animate-pulse" />
          ) : (
            <Mic className="w-12 h-12 text-white" />
          )}
        </Button>
      </div>
      <p className="text-center mt-6 text-lg text-muted-foreground font-medium">
        {isRecording ? "Listening... Tap to stop" : "Tap the microphone to speak"}
      </p>
    </div>
  );
}
