
import React, { useEffect, useState, useCallback } from 'react';
import { fetchTasks, saveTask, deleteTask, fetchMessages, fetchUsers, fetchJobs, fetchTimeEntries, setAuthToken, sendMessage } from './services/sheetService';
import { Task, TaskStatus, ViewType, ChatMessage, UserProfile, JobOption, TimeEntry } from './types';
import TaskModal from './components/TaskModal';
import DayModal from './components/DayModal';
import NotePromptModal from './components/NotePromptModal';
import ChatView from './components/ChatView';
import AdminView from './components/AdminView';
import TimeClockView from './components/TimeClockView';
import LoginView from './components/LoginView';
import { CalendarView } from './components/CalendarView';
import { Plus, Search, Calendar, CheckCircle, AlertTriangle, Trash, RotateCcw, Bell, LayoutList, MapPin, MessageCircle, User, Download, Briefcase, Clock, LogOut } from './components/Icons';
import { parseDescription, serializeDescription } from './utils/checklist';
import { IOSInstallPrompt } from './components/IOSInstallPrompt';

// Helper to prevent unnecessary state updates
const hasDataChanged = (prev: any[], next: any[]) => {
    if (prev.length !== next.length) return true;
    return JSON.stringify(prev) !== JSON.stringify(next);
};

declare global {
  interface Window {
    currentViewRef: string;
  }
}

const deduplicateById = <T extends { id?: any }>(arr: T[]): T[] => {
  const seen = new Set<string>();
  return arr.map((item, idx) => {
    let idStr = String(item?.id ?? '').trim();
    if (!idStr) {
      idStr = `fallback-id-${idx}-${Date.now()}`;
    }
    return { ...item, id: idStr } as unknown as T;
  }).filter(item => {
    const id = String(item?.id ?? '');
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const App: React.FC = () => {
  // Navigation State
  const [currentView, setCurrentView] = useState<ViewType>('tasks');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  
  // Data State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  
  // New Admin Data
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [taskFilter, setTaskFilter] = useState<'active' | 'completed'>('active');
  
  // Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false); // Admin Modal State
  
  // Note Prompt State (for completion)
  const [isNotePromptOpen, setIsNotePromptOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<Task | null>(null);

  // Day View State
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  // Date State for new items
  const [newItemDate, setNewItemDate] = useState<string | undefined>(undefined);

  // Desktop Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  useEffect(() => {
     window.currentViewRef = currentView;
     if (currentView === 'chat') {
         setHasUnreadMessages(false);
         // clear badge if API supported
         if (navigator.clearAppBadge) {
             navigator.clearAppBadge().catch(console.warn);
         }
     }
  }, [currentView]);

  useEffect(() => {
    const handleNewMessage = () => {
        setHasUnreadMessages(true);
        if (Notification.permission === 'granted') {
             new Notification("New Message", {
                 body: "You have a new message in Chat",
                 icon: 'https://cdn-icons-png.flaticon.com/512/2965/2965359.png'
             });
        }
        if (navigator.setAppBadge) {
             navigator.setAppBadge(1).catch(console.warn);
        }
    };
    window.addEventListener('new_chat_message', handleNewMessage);
    return () => window.removeEventListener('new_chat_message', handleNewMessage);
  }, []);

  const loadData = useCallback(async (isBackground = false) => {
    // If no token exists yet, we don't fetch anything! Prevents pre-auth fetch failures.
    const token = localStorage.getItem('truchoice_token');
    if (!token) {
        setIsLoading(false);
        return;
    }

    if (!isBackground) setIsLoading(true);
    
    try {
        const forceRefresh = true; // Always force refresh to get latest data from Sheets
        // Fetch core data (Tasks, Users, Jobs, TimeEntries, Messages)
        const [taskData, userData, jobData, entryData, msgsData] = await Promise.all([
            fetchTasks(forceRefresh), 
            fetchUsers(forceRefresh),
            fetchJobs(forceRefresh),
            fetchTimeEntries(forceRefresh),
            fetchMessages(forceRefresh)
        ]);

        // Sort Tasks: Pending/In Progress first
        const sortedTasks = taskData.sort((a, b) => {
            if (a.status === TaskStatus.COMPLETED && b.status !== TaskStatus.COMPLETED) return 1;
            if (a.status !== TaskStatus.COMPLETED && b.status === TaskStatus.COMPLETED) return -1;
            return b.createdAt - a.createdAt;
        });

        const uniqueTasks = deduplicateById(sortedTasks);
        const uniqueUsers = deduplicateById(userData);
        const uniqueJobs = deduplicateById(jobData);
        const uniqueEntries = deduplicateById(entryData);
        const uniqueMsgs = deduplicateById(msgsData);

        // Smart State Updates (only if changed)
        setTasks(prev => hasDataChanged(prev, uniqueTasks) ? uniqueTasks : prev);
        setUsers(prev => hasDataChanged(prev, uniqueUsers) ? uniqueUsers : prev);
        setJobs(prev => hasDataChanged(prev, uniqueJobs) ? uniqueJobs : prev);
        setTimeEntries(prev => hasDataChanged(prev, uniqueEntries) ? uniqueEntries : prev);
        
        setMessages(prev => {
            if (hasDataChanged(prev, uniqueMsgs)) {
                 // Check if new messages arrived and we are not in chat view
                 if (prev.length > 0 && uniqueMsgs.length > prev.length) {
                     const newMessages = uniqueMsgs.slice(prev.length);
                     const hasOtherMessages = newMessages.some(m => currentUser && m.sender !== currentUser.name);
                     if (hasOtherMessages && window.currentViewRef !== 'chat') {
                          window.dispatchEvent(new CustomEvent('new_chat_message'));
                     }
                 }
                 return uniqueMsgs;
            }
            return prev;
        });

        checkDueTasks(uniqueTasks);
    } catch (e) {
        console.error("Failed to load data", e);
    } finally {
        if (!isBackground) setIsLoading(false);
    }
  }, [currentView, currentUser]);

  // Restore session on app launch
  useEffect(() => {
    const storedToken = localStorage.getItem('truchoice_token');
    const storedUserStr = localStorage.getItem('truchoice_user');
    if (storedToken && storedUserStr) {
      try {
        const parsedUser = JSON.parse(storedUserStr);
        setAuthToken(storedToken);
        setCurrentUser(parsedUser);
      } catch (e) {
        console.warn("Corrupt persistent session, clearing", e);
        setAuthToken(null);
        localStorage.removeItem('truchoice_user');
      }
    }
  }, []);

  useEffect(() => {
    loadData(false);
    // Polling interval
    const intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
             if (currentView === 'chat') {
                 // Fast poll for chat
                 fetchMessages().then(msgs => {
                     setMessages(prev => hasDataChanged(prev, msgs) ? msgs : prev);
                 }).catch(console.warn);
             } else {
                 // Slow poll for other data
                 loadData(true);
             }
        }
    }, currentView === 'chat' ? 4000 : 30000); // 4s for chat, 30s for rest

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') loadData(true);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
        clearInterval(intervalId);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [loadData, currentView, currentUser]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const checkDueTasks = (currentTasks: Task[]) => {
    if (Notification.permission !== 'granted') return;
    const today = new Date().toISOString().split('T')[0];
    const dueToday = currentTasks.filter(t => t.dueDate === today && t.status !== TaskStatus.COMPLETED);
    const lastCount = parseInt(localStorage.getItem('last_notified_count') || '0');
    
    if (dueToday.length > 0 && dueToday.length !== lastCount) {
      new Notification("Tasks Due Today", {
        body: `You have ${dueToday.length} tasks due today.`,
        icon: 'https://cdn-icons-png.flaticon.com/512/2965/2965359.png'
      });
      localStorage.setItem('last_notified_count', dueToday.length.toString());
    }
  };

  // --- Auth Handlers ---
  const handleLogin = (user: UserProfile) => {
    setCurrentUser(user);
    localStorage.setItem('truchoice_userid', user.id);
    localStorage.setItem('truchoice_user', JSON.stringify(user));
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(console.warn);
    }
  };

  const handleLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem('truchoice_userid');
      localStorage.removeItem('truchoice_user');
      setAuthToken(null);
  };

  // --- Task Handlers ---
  const handleSaveTask = async (task: Task) => {
    const isNew = !editingTask;
    if (isNew) setTasks(prev => [task, ...prev]);
    else setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    setIsTaskModalOpen(false);
    try {
        await saveTask(task, isNew);
        // If task status changed to IN_PROGRESS (Working), trigger refresh for admin view sync
        if (task.status === TaskStatus.IN_PROGRESS) {
            loadData(true);
        }
    } catch (error: any) {
        alert("Failed to save task to Google Sheets: " + (error.message || error));
        loadData(true); // Re-fetch to synchronize state
    }
  };

  const handleDeleteTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(window.confirm('Delete this task?')) {
        setTasks(prev => prev.filter(t => t.id !== id));
        try {
            await deleteTask(id);
        } catch (error) {
            console.error("Failed to delete remote task", error);
        }
    }
  };

  const handleToggleChecklistItem = async (e: React.MouseEvent, task: Task, indexToToggle: number) => {
    e.stopPropagation();
    
    const { notes, items } = parseDescription(task.description);
    if (!items[indexToToggle]) return;

    const updatedItems = items.map((item, idx) => 
        idx === indexToToggle ? { ...item, checked: !item.checked } : item
    );
    
    const newDescription = serializeDescription(notes, updatedItems);
    
    // If task was completed and we uncheck something, set it back to In Progress
    let newStatus = task.status;
    if (newStatus === TaskStatus.COMPLETED && updatedItems.some(i => !i.checked)) {
        newStatus = TaskStatus.IN_PROGRESS;
    }

    const updatedTask = { ...task, description: newDescription, status: newStatus };
    
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
    
    try {
        await saveTask(updatedTask, false);
    } catch (e) {
        console.error("Failed to sync checklist item", e);
    }
  };

  const handleTaskClickCard = (e: React.MouseEvent, task: Task) => {
      // Logic for clicking the checkmark in the list view
      e.stopPropagation();
      const isCompleting = task.status !== TaskStatus.COMPLETED;
      
      if (isCompleting) {
          // Open Note Prompt
          setTaskToComplete(task);
          setIsNotePromptOpen(true);
      } else {
          // Un-completing, just do it directly
          const updatedTask = { ...task, status: TaskStatus.IN_PROGRESS };
          setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
          saveTask(updatedTask, false).catch(console.error);
      }
  };
  
  const handleConfirmCompletion = async (notes: string) => {
      if (!taskToComplete) return;

      const { notes: existingNotes, items } = parseDescription(taskToComplete.description);
      let updatedDescription = taskToComplete.description;
      
      // Auto-check items if completing
      if (items.length > 0) {
        const completedItems = items.map(item => ({ ...item, checked: true }));
        updatedDescription = serializeDescription(existingNotes, completedItems);
      }

      const updatedTask = {
          ...taskToComplete,
          status: TaskStatus.COMPLETED,
          description: updatedDescription,
          jobNotes: notes // Update with new notes from prompt
      };

      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
      setIsNotePromptOpen(false);
      setTaskToComplete(null);

      try {
          await saveTask(updatedTask, false);
      } catch (e) {
          console.error("Failed to sync completion", e);
      }
  };

  // --- Day View Handlers ---
  const handleDayClick = (date: string) => {
      setSelectedDate(date);
      setIsDayModalOpen(true);
  };

  const handleOptimisticTimeEntry = (entry: TimeEntry) => {
      setTimeEntries(prev => {
          const index = prev.findIndex(e => e.id === entry.id);
          if (index >= 0) {
              const updated = [...prev];
              updated[index] = entry;
              return updated;
          }
          return [entry, ...prev];
      });
  };

  const handleAddTaskForDate = () => {
      if (selectedDate) setNewItemDate(selectedDate);
      setIsDayModalOpen(false);
      setEditingTask(null);
      setIsTaskModalOpen(true);
  };

  const handleEditTaskFromDay = (task: Task) => {
      setIsDayModalOpen(false);
      setEditingTask(task);
      setIsTaskModalOpen(true);
  };

  const handleSwitchToChat = () => {
      setCurrentView('chat');
  };

  // --- Filters ---
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          task.assignedTo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (task.jobName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const isCompleted = task.status === TaskStatus.COMPLETED;
    if (taskFilter === 'active' && isCompleted) return false;
    if (taskFilter === 'completed' && !isCompleted) return false;
    return matchesSearch;
  });

  if (!currentUser) {
      return (
          <LoginView 
              users={users} 
              onLogin={handleLogin} 
              isLoading={isLoading} 
              onRefreshUsers={() => loadData(false)}
          />
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-24">
      <IOSInstallPrompt />
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm safe-top">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 select-none">
             {/* Logo SVG */}
             <div className="flex flex-col items-center">
                <svg viewBox="0 0 260 88" className="h-12 w-auto">
                    <path d="M10 28 L20 38 L40 8" fill="none" stroke="#ea580c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                    <text x="50" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#ea580c">Tru</text>
                    <text x="110" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">C</text>
                    <text x="136" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">h</text>
                    <path d="M136 12 L146 2 L156 12" fill="none" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    <text x="160" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">o</text>
                    <rect x="187" y="20" width="6" height="20" fill="#0f172a" />
                    <rect x="187" y="10" width="6" height="6" fill="#ea580c" />
                    <text x="198" y="40" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="34" fill="#0f172a">ce</text>
                    <text x="110" y="62" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.1em' }} fill="#0f172a">ROOFING</text>
                    <text x="110" y="78" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" style={{ letterSpacing: '0.08em' }} fill="#ea580c">PRODUCTION</text>
                </svg>
             </div>
          </div>

          <div className="flex items-center gap-3">
             <div className="hidden sm:flex flex-col items-end mr-2 text-right">
                <span className="text-xs font-bold text-slate-900">{currentUser.name}</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">{currentUser.role}</span>
             </div>

             {deferredPrompt && (
                <button 
                  onClick={handleInstallClick} 
                  className="p-2 text-white bg-slate-900 hover:bg-orange-600 rounded-lg shadow-md transition-colors"
                  title="Install App"
                >
                  <Download size={18} />
                </button>
             )}

             {/* Admin Toggle */}
             {currentUser.role === 'admin' && (
                 <button onClick={() => setIsAdminOpen(true)} className="p-2 text-slate-400 hover:text-orange-600 transition-colors" title="Company Overview">
                    <Briefcase size={20} />
                 </button>
             )}

             <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Logout">
                <LogOut size={20} />
             </button>

             {currentView === 'tasks' && (
                 <button onClick={() => { setEditingTask(null); setNewItemDate(undefined); setIsTaskModalOpen(true); }} className="bg-slate-900 text-white p-2 rounded-lg shadow-md hover:bg-orange-600 transition-colors">
                    <Plus size={20} />
                 </button>
             )}
          </div>
        </div>
      </header>
      
      {/* User Status Bar (Mobile focused) */}
      <div className="bg-slate-900 text-white py-1.5 px-4 sm:hidden flex items-center justify-between border-t border-slate-700">
         <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-[10px] font-bold">
               {currentUser.name.charAt(0)}
            </div>
            <span className="text-xs font-medium">{currentUser.name}</span>
         </div>
         <span className="text-[9px] uppercase tracking-widest opacity-60">{currentUser.role}</span>
      </div>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        
        {/* VIEW: TASKS */}
        {currentView === 'tasks' && (
            <>
                {/* Active Shift Banner */}
                {timeEntries.find(e => e.status === 'active' && (e.userId === currentUser.id || e.userId === currentUser.name)) && (
                    <div 
                        onClick={() => setCurrentView('timeclock')}
                        className="mb-6 bg-emerald-600 text-white rounded-xl p-4 shadow-lg flex items-center justify-between cursor-pointer group active:scale-95 transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/20 rounded-lg">
                                <Clock size={20} className="animate-pulse" />
                            </div>
                            <div>
                                <h4 className="font-bold text-sm">Active Shift</h4>
                                <p className="text-[10px] opacity-90">Tap to view live earnings & clock out</p>
                            </div>
                        </div>
                        <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 group-hover:bg-white/30">
                            View Pay <RotateCcw size={12} className="rotate-180" />
                        </div>
                    </div>
                )}

                {/* Search & Tabs */}
                <div className="mb-6 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input type="text" placeholder="Search tasks..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:border-orange-500 focus:outline-none shadow-sm" />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setTaskFilter('active')} className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${taskFilter === 'active' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border'}`}>Active</button>
                        <button onClick={() => setTaskFilter('completed')} className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${taskFilter === 'completed' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border'}`}>Completed</button>
                    </div>
                </div>

                {/* List */}
                <div className="space-y-4">
                    {filteredTasks.map(task => {
                        const { items } = parseDescription(task.description);
                        const isDone = task.status === TaskStatus.COMPLETED;
                        const isInProgress = task.status === TaskStatus.IN_PROGRESS;

                        return (
                            <div key={task.id} onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); }}
                             className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition relative overflow-hidden 
                                ${isDone ? 'opacity-70 border-slate-100' : isInProgress ? 'border-orange-500 shadow-md bg-orange-50/10' : 'border-slate-200'}
                             `}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex gap-2 items-center">
                                       <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{task.assignedTo || 'Unassigned'}</span>
                                       {task.jobName && (
                                           <span className="text-[10px] font-bold uppercase bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                               <Briefcase size={10} /> {task.jobName}
                                           </span>
                                       )}
                                       {isInProgress && (
                                            <span className="text-[10px] font-bold uppercase bg-green-100 text-green-600 px-2 py-0.5 rounded-full animate-pulse">
                                                Working Now
                                            </span>
                                       )}
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={(e) => handleTaskClickCard(e, task)} className="text-slate-400 hover:text-emerald-500 p-1">{isDone ? <RotateCcw size={16}/> : <CheckCircle size={16}/>}</button>
                                        <button onClick={(e) => handleDeleteTask(e, task.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash size={16}/></button>
                                    </div>
                                </div>
                                <h3 className={`font-bold mb-2 ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.title || "Untitled"}</h3>
                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                    {task.dueDate && <span className="flex items-center gap-1"><Calendar size={12} /> {task.dueDate}</span>}
                                    {task.priority === 'Critical' && <span className="flex items-center gap-1 text-red-600"><AlertTriangle size={12}/> Critical</span>}
                                </div>
                                
                                {/* Checklist Items on Card */}
                                {items.length > 0 && (
                                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                        {items.slice(0, 5).map((item, idx) => (
                                            <div 
                                                key={idx}
                                                onClick={(e) => handleToggleChecklistItem(e, task, idx)}
                                                className="flex items-start gap-2 cursor-pointer group"
                                            >
                                                <div className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${item.checked ? 'bg-orange-500 border-orange-500' : 'border-slate-300 bg-white group-hover:border-orange-400'}`}>
                                                    {item.checked && <CheckCircle size={10} className="text-white" strokeWidth={4} />}
                                                </div>
                                                <span className={`text-xs leading-5 ${item.checked ? 'line-through text-slate-400' : 'text-slate-600 group-hover:text-slate-900'}`}>
                                                    {item.text}
                                                </span>
                                            </div>
                                        ))}
                                        {items.length > 5 && (
                                            <div className="text-[10px] text-slate-400 font-medium pl-6">
                                                + {items.length - 5} more items
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </>
        )}

        {/* VIEW: CALENDAR */}
        {currentView === 'calendar' && (
            <CalendarView 
                tasks={tasks}
                onTaskClick={(t) => { setEditingTask(t); setIsTaskModalOpen(true); }}
                onDayClick={handleDayClick}
            />
        )}

        {/* VIEW: CHAT */}
        {currentView === 'chat' && (
            <ChatView 
                messages={messages}
                currentUserName={currentUser.name}
                onSendMessage={async (text, image) => {
                    // ChatView handles its own sending now, but we keep this prop for future flexibility
                    // The App polling will pick up the new message for other clients
                }}
            />
        )}

        {/* VIEW: TIME CLOCK */}
        {currentView === 'timeclock' && (
            <TimeClockView 
                timeEntries={timeEntries}
                userId={currentUser.id}
                userName={currentUser.name}
                hourlyRate={currentUser.rate || '0'}
                availableJobs={jobs}
                onRefresh={() => loadData(true)}
                onOptimisticUpdate={handleOptimisticTimeEntry}
            />
        )}

      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe z-40">
           <div className="max-w-3xl mx-auto flex justify-around">
               <button onClick={() => setCurrentView('tasks')} 
                   className={`flex flex-col items-center py-3 px-6 transition-colors ${currentView === 'tasks' ? 'text-orange-600' : 'text-slate-400'}`}>
                   <LayoutList size={22} strokeWidth={currentView === 'tasks' ? 2.5 : 2} />
                   <span className="text-[10px] font-bold mt-1">Tasks</span>
               </button>
               <button onClick={() => setCurrentView('timeclock')} 
                   className={`flex flex-col items-center py-3 px-6 transition-colors ${currentView === 'timeclock' ? 'text-orange-600' : 'text-slate-400'}`}>
                   <Clock size={22} strokeWidth={currentView === 'timeclock' ? 2.5 : 2} />
                   <span className="text-[10px] font-bold mt-1">Time</span>
               </button>
               <button onClick={handleSwitchToChat} 
                   className={`flex flex-col items-center py-3 px-6 transition-colors relative ${currentView === 'chat' ? 'text-orange-600' : 'text-slate-400'}`}>
                   <MessageCircle size={22} strokeWidth={currentView === 'chat' ? 2.5 : 2} />
                   {hasUnreadMessages && currentView !== 'chat' && (
                       <span className="absolute top-2 right-5 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-pulse"></span>
                   )}
                   <span className="text-[10px] font-bold mt-1">Chat</span>
               </button>
               <button onClick={() => setCurrentView('calendar')} 
                   className={`flex flex-col items-center py-3 px-6 transition-colors ${currentView === 'calendar' ? 'text-orange-600' : 'text-slate-400'}`}>
                   <Calendar size={22} strokeWidth={currentView === 'calendar' ? 2.5 : 2} />
                   <span className="text-[10px] font-bold mt-1">Calendar</span>
               </button>
           </div>
      </div>

      <TaskModal 
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        task={editingTask}
        initialDate={newItemDate}
        availableJobs={jobs}
        currentUser={currentUser ? currentUser.name : ''}
        users={users}
      />
      
      <NotePromptModal 
        isOpen={isNotePromptOpen}
        onClose={() => { setIsNotePromptOpen(false); setTaskToComplete(null); }}
        onConfirm={handleConfirmCompletion}
        task={taskToComplete}
      />

      {isAdminOpen && (
          <AdminView 
              users={users} 
              jobs={jobs}
              tasks={tasks} // Now passing tasks for active monitoring
              timeEntries={timeEntries}
              onRefresh={() => loadData(true)} 
              onClose={() => setIsAdminOpen(false)} 
          />
      )}

      {isDayModalOpen && (
        <DayModal
           date={selectedDate || ''}
           tasks={tasks.filter(t => t.dueDate === selectedDate && t.status !== TaskStatus.COMPLETED)}
           onClose={() => setIsDayModalOpen(false)}
           onEditTask={handleEditTaskFromDay}
           onAddTask={handleAddTaskForDate}
        />
      )}
      
      {/* Spacer for bottom nav */}
      <div className="h-16" />
    </div>
  );
};

export default App;
