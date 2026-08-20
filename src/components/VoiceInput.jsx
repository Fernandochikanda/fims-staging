import { useState, useEffect } from "react";
import { Icon } from "../lib/icons";

export default function VoiceInput({ value, onChange, placeholder, style, multiline }) {
  const [listening, setListening] = useState(false);
  const [recognition, setRecognition] = useState(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = 'pt-PT'; // Set to Portuguese
      rec.continuous = false;
      rec.interimResults = false;

      rec.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        onChange((value ? value + " " : "") + transcript);
        setListening(false);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      
      setRecognition(rec);
    }
  }, []);

  const toggleListen = () => {
    if (!recognition) return alert("Voice recognition not supported on this browser.");
    if (listening) {
      recognition.stop();
      setListening(false);
    } else {
      recognition.start();
      setListening(true);
    }
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {multiline ? (
        <textarea 
          className="form-textarea" 
          placeholder={placeholder} 
          value={value || ""} 
          onChange={e => onChange(e.target.value)} 
          style={{ ...style, paddingRight: 40 }}
          spellCheck="true"
        />
      ) : (
        <input 
          className="form-input" 
          placeholder={placeholder} 
          value={value || ""} 
          onChange={e => onChange(e.target.value)} 
          style={{ ...style, paddingRight: 40 }}
          spellCheck="true"
        />
      )}
      <button 
        type="button"
        onClick={toggleListen} 
        style={{ 
          position: "absolute", right: 8, top: multiline ? 8 : "50%", transform: multiline ? "none" : "translateY(-50%)",
          background: listening ? "#A32D2D" : "transparent", border: "none", cursor: "pointer", 
          width: 28, height: 28, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
          color: listening ? "#fff" : "#888"
        }}
        title="Dictate (Voice to Text)"
      >
        <Icon name="bell" size={14} /> {/* Using bell as mic icon workaround if mic isn't in sprite */}
      </button>
      {listening && <div style={{ position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#A32D2D", fontWeight: 600 }}>Listening...</div>}
    </div>
  );
}
