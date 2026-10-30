import { useRef, useState, useEffect } from "react";
import { Icon } from "../lib/icons";

export default function PhotoAnnotator({ imageUrl, onSave, onSkip }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#A32D2D");
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxW = 700;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setSnapshot(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    if (tool === "text") {
      const text = window.prompt("Texto a escrever na foto:");
      if (text) {
        const ctx = canvasRef.current.getContext("2d");
        ctx.font = "bold 18px Arial";
        ctx.fillStyle = color;
        ctx.strokeStyle = "white";
        ctx.lineWidth = 4;
        ctx.strokeText(text, pos.x, pos.y);
        ctx.fillText(text, pos.x, pos.y);
        setSnapshot(ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));
      }
      return;
    }
    setStartPos(pos);
    setDrawing(true);
  };

  const draw = (e) => {
    if (!drawing || !startPos) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.putImageData(snapshot, 0, 0);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    if (tool === "pen") {
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      setStartPos(pos);
    } else if (tool === "circle") {
      const cx = (startPos.x + pos.x) / 2;
      const cy = (startPos.y + pos.y) / 2;
      const rx = Math.max(5, Math.abs(pos.x - startPos.x) / 2);
      const ry = Math.max(5, Math.abs(pos.y - startPos.y) / 2);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (tool === "arrow") {
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      const angle = Math.atan2(pos.y - startPos.y, pos.x - startPos.x);
      const len = 12;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x - len * Math.cos(angle - Math.PI / 6), pos.y - len * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x - len * Math.cos(angle + Math.PI / 6), pos.y - len * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
  };

  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    setStartPos(null);
    const ctx = canvasRef.current.getContext("2d");
    setSnapshot(ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));
  };

  const handleSave = () => {
    const url = canvasRef.current.toDataURL("image/jpeg", 0.9);
    onSave(url);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setSnapshot(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.src = imageUrl;
  };

  const tools = [
    { id: "pen", label: "Caneta", icon: "edit" },
    { id: "circle", label: "Círculo", icon: "camera" },
    { id: "arrow", label: "Seta", icon: "download" },
    { id: "text", label: "Texto", icon: "file" },
  ];
  const colors = ["#A32D2D", "#F4A51C", "#239653", "#378ADD"];

  return (
    <div className="modal-overlay" onClick={onSkip}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 850 }}>
        <div className="modal-header">
          <div style={{ fontSize: 15, fontWeight: 500 }}>Anotar Foto</div>
          <button className="icon-btn" onClick={onSkip}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body" style={{ padding: 12 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            {tools.map(t => (
              <button key={t.id} className={"btn btn-sm " + (tool === t.id ? "btn-primary" : "btn-secondary")} onClick={() => setTool(t.id)}>
                <Icon name={t.icon} size={12} /> {t.label}
              </button>
            ))}
            <div style={{ marginLeft: 8, display: "flex", gap: 4 }}>
              {colors.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: color === c ? "3px solid #333" : "1px solid #ccc", cursor: "pointer" }} />
              ))}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleClear} style={{ marginLeft: 8 }}>
              <Icon name="trash" size={12} /> Limpar
            </button>
          </div>
          <div style={{ textAlign: "center", maxHeight: 380, overflow: "auto" }}>
            <canvas
              ref={canvasRef}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
              style={{ maxWidth: "100%", border: "1px solid #ddd", borderRadius: 4, cursor: "crosshair", touchAction: "none" }}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onSkip}>Saltar (sem anotação)</button>
          <button className="btn btn-primary" onClick={handleSave}><Icon name="check" size={13} /> Guardar Anotada</button>
        </div>
      </div>
    </div>
  );
}
