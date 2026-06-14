import React, { useRef, useState, useEffect } from 'react';
import { X, CheckCircle, Trash, RotateCcw } from './Icons';

interface ImageEditorProps {
  imageSrc: string;
  onSave: (newImage: string) => void;
  onClose: () => void;
}

const COLORS = [
  { id: 'red', value: '#ef4444' },
  { id: 'yellow', value: '#eab308' },
  { id: 'green', value: '#22c55e' },
  { id: 'blue', value: '#3b82f6' },
  { id: 'white', value: '#ffffff' },
];

export const ImageEditor: React.FC<ImageEditorProps> = ({ imageSrc, onSave, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(COLORS[0].value);
  const [history, setHistory] = useState<string[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Initial load
  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "Anonymous"; // Try to handle CORS if external
    image.src = imageSrc;
    image.onload = () => {
      // Determine canvas size based on window size but keep aspect ratio
      const maxWidth = window.innerWidth;
      const maxHeight = window.innerHeight * 0.8; // Leave room for toolbar
      
      let width = image.naturalWidth;
      let height = image.naturalHeight;

      // Scale down if too big for viewport (saves memory, easier to draw)
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      
      // If image is smaller than viewport, keep it. If larger, scale it.
      // Or just fit to width for better mobile experience
      const displayWidth = width * ratio;
      const displayHeight = height * ratio;

      setCanvasSize({ width: displayWidth, height: displayHeight });

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(image, 0, 0, displayWidth, displayHeight);
            saveHistory(); // Initial state
        }
      }
    };
  }, [imageSrc]);

  const saveHistory = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      setHistory(prev => [...prev.slice(-9), canvas.toDataURL()]);
    }
  };

  const undo = () => {
    if (history.length <= 1) return; // Keep initial state
    
    const newHistory = [...history];
    newHistory.pop(); // Remove current
    const previousState = newHistory[newHistory.length - 1];
    setHistory(newHistory);

    const img = new Image();
    img.src = previousState;
    img.onload = () => {
       const canvas = canvasRef.current;
       const ctx = canvas?.getContext('2d');
       if (canvas && ctx) {
           ctx.clearRect(0, 0, canvas.width, canvas.height);
           ctx.drawImage(img, 0, 0);
       }
    };
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault(); // Prevent scrolling on touch
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveHistory();
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      onSave(canvas.toDataURL('image/jpeg', 0.8));
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900 flex flex-col animate-in fade-in duration-200">
      
      {/* Top Bar */}
      <div className="flex justify-between items-center p-4 bg-black/50 backdrop-blur-md text-white">
         <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
            <X size={24} />
         </button>
         <div className="text-sm font-bold uppercase tracking-widest text-slate-400">Annotate Photo</div>
         <button onClick={handleSave} className="p-2 bg-orange-600 hover:bg-orange-500 rounded-full transition text-white shadow-lg shadow-orange-900/20">
            <CheckCircle size={24} />
         </button>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-slate-900 touch-none">
        <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="touch-none shadow-2xl"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
        />
      </div>

      {/* Bottom Toolbar */}
      <div className="p-6 bg-black/80 backdrop-blur-md safe-bottom">
          <div className="flex justify-between items-center max-w-md mx-auto">
             
             {/* Colors */}
             <div className="flex gap-4">
                {COLORS.map(color => (
                    <button
                        key={color.id}
                        onClick={() => setCurrentColor(color.value)}
                        className={`w-8 h-8 rounded-full border-2 transition-transform ${currentColor === color.value ? 'border-white scale-110' : 'border-transparent scale-100'}`}
                        style={{ backgroundColor: color.value }}
                    />
                ))}
             </div>

             {/* Tools */}
             <div className="flex gap-4 border-l border-white/20 pl-4">
                 <button onClick={undo} disabled={history.length <= 1} className="text-white disabled:opacity-30 hover:text-orange-400 transition">
                     <RotateCcw size={24} />
                 </button>
                 <button onClick={() => {
                     // Clear canvas by reloading initial image from history[0] or clearing rect
                     if(history.length > 0) {
                         const img = new Image();
                         img.src = history[0];
                         img.onload = () => {
                             const canvas = canvasRef.current;
                             const ctx = canvas?.getContext('2d');
                             if(canvas && ctx) {
                                 ctx.clearRect(0, 0, canvas.width, canvas.height);
                                 ctx.drawImage(img, 0, 0);
                                 saveHistory();
                             }
                         }
                     }
                 }} className="text-white hover:text-red-500 transition">
                     <Trash size={24} />
                 </button>
             </div>

          </div>
      </div>

    </div>
  );
};
