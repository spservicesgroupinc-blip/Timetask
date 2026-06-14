
import React, { useState } from 'react';
import { Task } from '../types';
import { CheckCircle, X, FileText } from './Icons';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
  task: Task | null;
}

const NotePromptModal: React.FC<Props> = ({ isOpen, onClose, onConfirm, task }) => {
  const [notes, setNotes] = useState(task?.jobNotes || '');

  // Update notes if task changes (e.g. reopening)
  React.useEffect(() => {
    if (isOpen && task) {
        setNotes(task.jobNotes || '');
    }
  }, [isOpen, task]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <CheckCircle size={20} className="text-emerald-500" />
                Complete Task
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
            </button>
        </div>

        <div className="p-6">
            <p className="text-sm text-slate-600 mb-4">
                Great job! Before you finish <strong>"{task?.title}"</strong>, add any final notes for the office.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-200 transition-all">
                <div className="flex items-start gap-2">
                    <FileText size={16} className="text-slate-400 mt-1" />
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="E.g. Found damaged plywood, replaced 2 sheets..."
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-slate-800 placeholder-slate-400 min-h-[100px] resize-none"
                        autoFocus
                    />
                </div>
            </div>
        </div>

        <div className="p-4 bg-slate-50 flex gap-3">
            <button 
                onClick={onClose}
                className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition"
            >
                Cancel
            </button>
            <button 
                onClick={() => onConfirm(notes)}
                className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/20"
            >
                Confirm Completion
            </button>
        </div>

      </div>
    </div>
  );
};

export default NotePromptModal;
