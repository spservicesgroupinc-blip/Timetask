import React, { useState, useEffect } from 'react';
import { X } from './Icons';

export const IOSInstallPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Detects if device is on iOS 
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    // Detects if device is in standalone mode (already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

    // Show prompt only if on iOS and NOT already installed
    if (isIOS && !isStandalone) {
      // Check if user has dismissed it recently (optional, simple logic here just shows it once per session)
      setShowPrompt(true);
    }
  }, []);

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-8 animate-in slide-in-from-bottom duration-500">
      <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-5 shadow-2xl border border-slate-700 relative max-w-md mx-auto">
        <button 
          onClick={() => setShowPrompt(false)}
          className="absolute top-2 right-2 p-1 text-slate-400 hover:text-white"
        >
          <X size={20} />
        </button>
        
        <div className="flex gap-4 items-start">
          <div className="bg-orange-600 p-2 rounded-lg shrink-0">
             <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"></polyline>
             </svg>
          </div>
          <div>
            <h3 className="font-bold text-lg">Install TruTasks</h3>
            <p className="text-slate-300 text-sm mt-1 mb-3 leading-relaxed">
              Install this app on your iPhone for offline access and better performance.
            </p>
            
            <div className="text-sm font-medium text-orange-400 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="bg-slate-800 w-6 h-6 flex items-center justify-center rounded-full text-xs">1</span>
                <span>Tap the <span className="font-bold text-white">Share</span> icon below</span>
                {/* Share Icon Representation */}
                <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              </div>
              <div className="flex items-center gap-2">
                 <span className="bg-slate-800 w-6 h-6 flex items-center justify-center rounded-full text-xs">2</span>
                <span>Select <span className="font-bold text-white">Add to Home Screen</span></span>
                 <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Little arrow pointing down to the browser bar */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-2 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[10px] border-t-slate-900/95"></div>
    </div>
  );
};