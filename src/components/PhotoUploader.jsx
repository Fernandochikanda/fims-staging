import { useRef, useState } from "react";
import { Icon } from "../lib/icons";
import { optimizeImage } from "../lib/imageOptimizer";

export default function PhotoUploader({ id, photos, onAdd, onRemove, max = 3, isRequired, label }) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = async (files) => {
    setUploading(true);
    const arr = Array.from(files);
    for (let file of arr) {
      if (photos.length >= max) break;
      const optimized = await optimizeImage(file);
      await onAdd(id, optimized);
    }
    setUploading(false);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current.click()} disabled={photos.length >= max}>
          <Icon name="file" size={12} /> Galeria
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => cameraInputRef.current.click()} disabled={photos.length >= max}>
          <Icon name="camera" size={12} /> Câmara
        </button>
        <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 500, color: photos.length >= max ? "#0F6E56" : (isRequired ? "#A32D2D" : "#888") }}>
          {photos.length}/{max} Fotos
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />

      {uploading && <div style={{ fontSize: 11, color: "#378ADD", marginBottom: 8 }}>⚙️ A otimizar e guardar...</div>}

      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map(p => (
            <div key={p.id} className="photo-thumb">
              <img src={p.url} alt={p.filename} onClick={() => setLightboxUrl(p.url)} />
              <button className="photo-thumb-remove" onClick={() => onRemove(id, p)}><Icon name="x" size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {lightboxUrl && (
        <div className="photo-lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Evidência" />
        </div>
      )}
    </div>
  );
}
