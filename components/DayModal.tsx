
import React from 'react';
import { Task, TaskStatus } from '../types';
import { X, Plus, Calendar, CheckCircle, Clock } from './Icons';

interface Props {
  date: string; // YYYY-MM-DD
  tasks: Task[];
  onClose: () => void;
  onEditTask: (task: Task) => void;
  onAddTask: () => void;
}

const DayModal: React.FC<Props> = ({ 
    date, tasks, onClose, 
    onEditTask, onAddTask 
}) => {
  
  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex justify-between items-start">
            <div>
                <h2 className="text-2xl font-bold">{displayDate}</h2>
                <p className="text-slate-400 text-sm font-medium mt-1">Daily Agenda</p>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded-full hover:bg-white/10 transition">
                <X size={24} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            
            {/* TASKS SECTION */}
            <div>
                <div className="flex items-center gap-2 mb-3 text-slate-800 font-bold uppercase tracking-wider text-xs">
                    <Calendar size={14} className="text-orange-600" />
                    <span>Tasks Due ({tasks.length})</span>
                </div>

                {tasks.length === 0 ? (
                    <div className="text-sm text-slate-400 italic pl-6">No tasks due this day.</div>
                ) : (
                    <div className="space-y-2">
                        {tasks.map(task => (
                            <button 
                                key={task.id} 
                                onClick={() => onEditTask(task)}
                                className={`w-full text-left bg-white border rounded-xl p-3 transition flex items-start gap-3 group
                                    ${task.status === TaskStatus.COMPLETED ? 'border-emerald-100 bg-emerald-50/30' : 'border-slate-200 hover:border-orange-300'}
                                `}
                            >
                                <div className={`mt-0.5 ${task.status === TaskStatus.COMPLETED ? 'text-emerald-500' : 'text-slate-300'}`}>
                                    {task.status === TaskStatus.COMPLETED ? <CheckCircle size={18} /> : <Clock size={18} />}
                                </div>
                                <div>
                                    <div className={`font-semibold text-sm ${task.status === TaskStatus.COMPLETED ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                                        {task.title}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">{task.assignedTo || 'Unassigned'}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200">
             <button 
                onClick={onAddTask}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-slate-200 hover:border-orange-500 hover:text-orange-600 text-slate-600 font-bold rounded-xl transition text-sm"
            >
                <Plus size={16} /> Add Task
             </button>
        </div>

      </div>
    </div>
  );
};

export default DayModal;
