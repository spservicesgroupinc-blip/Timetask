
import React, { useState, useEffect, useRef } from 'react';
import { Task, TaskPriority, TaskStatus, JobOption, UserProfile } from '../types';
import { X, Plus, CheckCircle, Trash, Camera, Pencil, Briefcase, Clock, FileText } from './Icons';
import { parseDescription, serializeDescription, ChecklistItem } from '../utils/checklist';
import { ImageEditor } from './ImageEditor';
import { GeminiSafetyAssistant } from './GeminiSafetyAssistant';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  task?: Task | null;
  initialDate?: string;
  availableJobs: JobOption[];
  currentUser?: string;
  users: UserProfile[];
}

const TaskModal: React.FC<Props> = ({ isOpen, onClose, onSave, task, initialDate, availableJobs, currentUser, users }) => {
  const [baseData, setBaseData] = useState<Task>({
    id: '',
    title: '',
    description: '',
    location: '',
    assignedTo: '',
    dueDate: '',
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.PENDING,
    createdAt: Date.now(),
    image: '',
    jobName: '',
    jobNotes: ''
  });

  const [notes, setNotes] = useState('');
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [showDetails, setShowDetails] = useState(true);
  const [newImageFile, setNewImageFile] = useState<string | null>(null);
  const [completionMode, setCompletionMode] = useState(false); // State for completion prompt
  
  // Editor State
  const [showImageEditor, setShowImageEditor] = useState(false);

  // Focus management
  const [focusId, setFocusId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const defaultDate = initialDate || new Date().toISOString().split('T')[0];

      const initialTask = task || {
        id: crypto.randomUUID(),
        title: '',
        description: '',
        location: '',
        assignedTo: currentUser || '',
        dueDate: defaultDate,
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
        createdAt: Date.now(),
        image: '',
        jobName: '',
        jobNotes: ''
      };
      
      setBaseData(initialTask);
      
      const { notes: parsedNotes, items } = parseDescription(initialTask.description || '');
      setNotes(parsedNotes);
      setChecklistItems(items);
      setNewImageFile(null);
      setShowImageEditor(false);
      setCompletionMode(false);
      
      // Always show details by default
      setShowDetails(true);
    }
  }, [task, isOpen, initialDate, currentUser]);

  useEffect(() => {
    if (focusId) {
      const el = document.getElementById(`checklist-item-${focusId}`);
      if (el) {
        (el as HTMLInputElement).focus();
      }
      setFocusId(null);
    }
  }, [checklistItems, focusId]);

  const handleSubmit = (e?: React.FormEvent) => {
    if(e) e.preventDefault();
    saveChanges();
  };

  const saveChanges = (overrideStatus?: TaskStatus, overrideStartedAt?: number) => {
    const fullDescription = serializeDescription(notes, checklistItems);
    const imageToSave = newImageFile || baseData.image;

    onSave({ 
        ...baseData, 
        description: fullDescription,
        image: imageToSave,
        status: overrideStatus || baseData.status,
        startedAt: overrideStartedAt !== undefined ? overrideStartedAt : baseData.startedAt
    });
  };

  const handleStartWork = () => {
    if (currentUser && baseData.assignedTo !== currentUser) {
        if (!baseData.assignedTo) {
             setBaseData(prev => ({...prev, assignedTo: currentUser}));
        }
    }
    saveChanges(TaskStatus.IN_PROGRESS, Date.now());
    onClose();
  };

  const handleCompleteWork = () => {
      // Mark all checklist items as done
      const allChecked = checklistItems.map(i => ({...i, checked: true}));
      setChecklistItems(allChecked);
      
      const fullDescription = serializeDescription(notes, allChecked);
      const imageToSave = newImageFile || baseData.image;

      onSave({ 
          ...baseData, 
          description: fullDescription,
          image: imageToSave,
          status: TaskStatus.COMPLETED
      });
      onClose();
  };

  const handleJobChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedName = e.target.value;
      const job = availableJobs.find(j => j.name === selectedName);
      
      setBaseData(prev => ({
          ...prev,
          jobName: selectedName,
          location: job?.address || prev.location
      }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewImageFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const addChecklistItem = (text: string = '', insertAtIndex: number = -1) => {
    const newItem: ChecklistItem = {
      id: Math.random().toString(36).substring(2, 9),
      text: text,
      checked: false
    };
    
    setChecklistItems(prev => {
      if (insertAtIndex === -1) return [...prev, newItem];
      const newArr = [...prev];
      newArr.splice(insertAtIndex, 0, newItem);
      return newArr;
    });
    setFocusId(newItem.id);
  };

  const updateChecklistItem = (id: string, updates: Partial<ChecklistItem>) => {
    setChecklistItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const deleteChecklistItem = (id: string) => {
    setChecklistItems(prev => prev.filter(item => item.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string, index: number) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          addChecklistItem('', index + 1);
      } else if (e.key === 'Backspace' && checklistItems[index].text === '') {
          e.preventDefault();
          if (checklistItems.length > 0) {
              deleteChecklistItem(id);
              if (index > 0) {
                  setFocusId(checklistItems[index - 1].id);
              }
          }
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 flex justify-between items-center bg-white border-b border-slate-100">
           <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
               {task ? 'Task Details' : 'New Task'}
           </span>
           <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
          <div className="p-6 space-y-6">
            
            {/* Title Input */}
            <div>
              <input
                type="text"
                required
                autoFocus={!task}
                value={baseData.title}
                onChange={(e) => setBaseData({ ...baseData, title: e.target.value })}
                className="w-full text-2xl font-bold text-slate-900 placeholder-slate-300 border-none focus:ring-0 p-0"
                placeholder="What needs to be done?"
              />
            </div>

            {/* ACTION BUTTONS */}
            {task && (
                <div className="grid grid-cols-2 gap-3">
                     {/* Show completion prompt logic if active */}
                     {completionMode ? (
                        <div className="col-span-2 bg-emerald-50 border border-emerald-100 p-4 rounded-xl animate-in zoom-in-95">
                             <h4 className="font-bold text-emerald-800 text-sm mb-2">Final Job Notes</h4>
                             <textarea 
                                value={baseData.jobNotes}
                                onChange={(e) => setBaseData({...baseData, jobNotes: e.target.value})}
                                placeholder="Any issues encountered? Materials used?"
                                className="w-full bg-white border border-emerald-200 rounded-lg p-2 text-sm mb-3 min-h-[80px]"
                                autoFocus
                             />
                             <div className="flex gap-2">
                                 <button 
                                    type="button" 
                                    onClick={() => setCompletionMode(false)}
                                    className="flex-1 py-2 bg-white text-slate-500 font-bold rounded-lg border border-slate-200"
                                 >
                                    Cancel
                                 </button>
                                 <button 
                                    type="button" 
                                    onClick={handleCompleteWork}
                                    className="flex-1 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700"
                                 >
                                    Confirm Complete
                                 </button>
                             </div>
                        </div>
                     ) : (
                         baseData.status !== TaskStatus.IN_PROGRESS ? (
                            <button 
                                type="button" 
                                onClick={handleStartWork}
                                className="col-span-2 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20 transition transform active:scale-95"
                            >
                                <Clock size={20} />
                                Start Work Now
                            </button>
                         ) : (
                             <>
                                <div className="col-span-2 py-3 bg-orange-50 border border-orange-100 text-orange-700 font-bold rounded-xl flex items-center justify-center gap-2 animate-pulse">
                                    <Clock size={20} />
                                    In Progress (Working)
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => setCompletionMode(true)}
                                    className="col-span-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition transform active:scale-95"
                                >
                                    <CheckCircle size={20} />
                                    Mark Complete
                                </button>
                             </>
                         )
                     )}
                </div>
            )}

            {/* Checklist Section */}
            <div className="space-y-3">
               {checklistItems.map((item, index) => (
                   <div key={item.id} className="flex items-start gap-3 group">
                      <button
                        type="button"
                        onClick={() => updateChecklistItem(item.id, { checked: !item.checked })}
                        className={`mt-1 flex-shrink-0 w-6 h-6 rounded border-2 transition-colors flex items-center justify-center ${
                           item.checked 
                           ? 'bg-orange-500 border-orange-500 text-white' 
                           : 'bg-white border-slate-200 hover:border-orange-400 text-transparent'
                        }`}
                        tabIndex={-1} 
                      >
                         <CheckCircle size={16} fill="currentColor" />
                      </button>
                      
                      <input 
                        id={`checklist-item-${item.id}`}
                        type="text"
                        value={item.text}
                        onChange={(e) => updateChecklistItem(item.id, { text: e.target.value })}
                        onKeyDown={(e) => handleKeyDown(e, item.id, index)}
                        className={`flex-1 bg-transparent border-none focus:ring-0 p-0 text-lg leading-normal text-slate-700 placeholder-slate-300 ${item.checked ? 'line-through text-slate-400' : ''}`}
                        placeholder="Type task..."
                        autoComplete="off"
                      />
                      
                      <button 
                         type="button" 
                         onClick={() => deleteChecklistItem(item.id)}
                         className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 focus:opacity-100"
                         tabIndex={-1}
                      >
                         <Trash size={18} />
                      </button>
                   </div>
               ))}

               <button
                 type="button"
                 onClick={() => addChecklistItem('')}
                 className="flex items-center gap-3 text-slate-400 hover:text-orange-600 font-medium transition-colors py-1 group w-full text-left"
               >
                  <div className="w-6 h-6 flex items-center justify-center rounded border-2 border-dashed border-slate-300 group-hover:border-orange-400">
                    <Plus size={16} />
                  </div>
                  <span>Add Checklist Item</span>
               </button>

               <GeminiSafetyAssistant 
                    taskTitle={baseData.title}
                    onChecklistGenerated={(text) => {
                        // Append generated list to notes
                        setNotes(prev => prev + '\n\n' + text);
                    }}
               />
            </div>
            
            {/* Field Notes Section (Always visible) */}
            <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <FileText size={14} /> Field Notes
                </label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-200 transition-all">
                    <textarea 
                        value={baseData.jobNotes || ''}
                        onChange={(e) => setBaseData({...baseData, jobNotes: e.target.value})}
                        placeholder="Add notes, material updates, or issues here..."
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-slate-800 placeholder-slate-400 min-h-[80px] resize-none"
                    />
                </div>
            </div>

            {/* Photo Upload Section */}
             <div className="pt-2">
                <input 
                    type="file" 
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                />
                
                {(newImageFile || baseData.image) ? (
                    <div className="relative group rounded-xl overflow-hidden border border-slate-200">
                        <img 
                            src={newImageFile || baseData.image} 
                            alt="Task Attachment" 
                            className="w-full h-48 object-cover"
                        />
                        
                        {/* Overlay Controls */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                             <button 
                                type="button"
                                onClick={triggerFileInput}
                                className="bg-white/20 hover:bg-white/40 backdrop-blur-sm text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition"
                             >
                                <Camera size={18} />
                                Change
                             </button>
                             <button 
                                type="button"
                                onClick={() => setShowImageEditor(true)}
                                className="bg-orange-600 hover:bg-orange-500 backdrop-blur-sm text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg transition"
                             >
                                <Pencil size={18} />
                                Annotate
                             </button>
                        </div>
                    </div>
                ) : (
                    <button 
                        type="button"
                        onClick={triggerFileInput}
                        className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-medium flex items-center justify-center gap-2 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-all"
                    >
                        <Camera size={20} />
                        Attach Photo
                    </button>
                )}
            </div>

            {/* Details Toggle */}
            <div className="pt-6 border-t border-slate-100">
                <button 
                    type="button"
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-800 flex items-center gap-1"
                >
                    {showDetails ? 'Hide Details' : 'Show Details (Location, Crew, Date)'}
                </button>

                {showDetails && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                         
                         {/* Job Dropdown */}
                         <div className="sm:col-span-2">
                             <label className="block text-xs font-semibold text-slate-400 mb-1">Related Job</label>
                             <div className="relative">
                                 <Briefcase size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                 <select
                                    value={baseData.jobName || ''}
                                    onChange={handleJobChange}
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-orange-500 appearance-none"
                                 >
                                     <option value="">General Task / No Job</option>
                                     {availableJobs.map(job => (
                                         <option key={job.id} value={job.name}>{job.name}</option>
                                     ))}
                                 </select>
                             </div>
                         </div>

                         <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">Due Date</label>
                            <input
                              type="date"
                              value={baseData.dueDate}
                              onChange={(e) => setBaseData({ ...baseData, dueDate: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-orange-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-1">Assigned To</label>
                            <select
                              value={baseData.assignedTo}
                              onChange={(e) => setBaseData({ ...baseData, assignedTo: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 font-medium"
                            >
                              <option value="">Unassigned</option>
                              {users.map(u => (
                                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                              ))}
                              {baseData.assignedTo && !users.some(u => u.id === baseData.assignedTo || u.name === baseData.assignedTo) && (
                                <option value={baseData.assignedTo}>{baseData.assignedTo}</option>
                              )}
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-400 mb-1">Location / Address</label>
                            <input
                              type="text"
                              value={baseData.location}
                              onChange={(e) => setBaseData({ ...baseData, location: e.target.value })}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-orange-500"
                              placeholder="Address or Site"
                            />
                        </div>
                         <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-400 mb-1">Status</label>
                            <select
                                value={baseData.status}
                                onChange={(e) => setBaseData({ ...baseData, status: e.target.value as TaskStatus })}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-orange-500"
                            >
                                {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                )}
            </div>
          </div>
        </form>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
             <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-orange-600 transition shadow-lg shadow-slate-900/10"
            >
              Save Changes
            </button>
        </div>

        {/* IMAGE EDITOR OVERLAY */}
        {showImageEditor && (newImageFile || baseData.image) && (
            <ImageEditor 
                imageSrc={newImageFile || baseData.image || ''}
                onClose={() => setShowImageEditor(false)}
                onSave={(editedImage) => {
                    setNewImageFile(editedImage);
                    setShowImageEditor(false);
                }}
            />
        )}

      </div>
    </div>
  );
};

export default TaskModal;
