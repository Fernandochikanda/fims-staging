import { useRef, useState } from "react";

export default function SignaturePad({ label, onSave, onClear }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);

  const getCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x, y };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getCoords(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSig(true);
  };

  const stopDrawing = () => setIsDrawing(false);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
    onClear();
  };

  const save = () => {
    if (!hasSig) return alert("Por favor, desenhe a assinatura primeiro.");
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onSave(dataUrl);
  };

  return (
    <div style={{ marginBottom: 16, border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
      <label style={{ fontWeight: 500, fontSize: 13, marginBottom: 8, display: "block" }}>{label}</label>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        style={{ border: "1px dashed #ccc", width: "100%", maxWidth: 400, touchAction: "none", background: "#fff" }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={clear}>Limpar</button>
        <button className="btn btn-primary btn-sm" onClick={save}>Confirmar Assinatura</button>
      </div>
    </div>
  );
}
