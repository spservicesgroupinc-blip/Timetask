
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, JobOption, Task, TaskStatus, TaskPriority } from '../types';
import { Trash, Plus, User, Briefcase, MapPin, X, Clock, Sparkles, LayoutList, CheckCircle } from './Icons';
import { saveUser, deleteUser, saveJob, deleteJob, saveTask, deleteTask } from '../services/sheetService';

interface Props {
  users: UserProfile[];
  jobs: JobOption[];
  tasks: Task[];
  onRefresh: () => void;
  onClose: () => void;
}

// Helper hook to handle optimistic updates without flickering
function useOptimisticList<T extends { id: string }>(
  serverData: T[], 
  sortFn?: (a: T, b: T) => number
) {
  const [localData, setLocalData] = useState<T[]>(serverData);
  const pendingAdds = useRef(new Set<string>());
  const pendingDeletes = useRef(new Set<string>());

  useEffect(() => {
    setLocalData(prev => {
        // 1. Start with server data, filtering out items we know we just deleted
        const base = serverData.filter(i => !pendingDeletes.current.has(i.id));

        // 2. Identify optimistic items that are in 'prev' but not yet in 'serverData'
        // We only keep them if they are in our 'pendingAdds' set
        const optimisticItems = prev.filter(i => 
            pendingAdds.current.has(i.id) && !base.find(b => b.id === i.id)
        );
        
        const merged = [...base, ...optimisticItems];

        // Cleanup: If a pending add is now in serverData, we can stop tracking it
        const serverIds = new Set(serverData.map(i => i.id));
        optimisticItems.forEach(i => {
            if (serverIds.has(i.id)) pendingAdds.current.delete(i.id);
        });
        
        // Cleanup: If a pending delete is actually gone from serverData, stop tracking
        Array.from(pendingDeletes.current).forEach(id => {
            if (!serverIds.has(id)) pendingDeletes.current.delete(id);
        });

        return sortFn ? merged.sort(sortFn) : merged;
    });
  }, [serverData]);

  const add = (item: T) => {
      pendingAdds.current.add(item.id);
      setLocalData(prev => sortFn ? [...prev, item].sort(sortFn) : [...prev, item]);
  };

  const remove = (id: string) => {
      pendingDeletes.current.add(id);
      setLocalData(prev => prev.filter(i => i.id !== id));
  };

  const revertRemove = (id: string) => {
      pendingDeletes.current.delete(id);
      setLocalData(serverData.filter(i => !pendingDeletes.current.has(i.id)));
  };

  const revertAdd = (id: string) => {
      pendingAdds.current.delete(id);
      setLocalData(serverData.filter(i => !pendingDeletes.current.has(i.id)));
  };

  return { localData, add, remove, revertRemove, revertAdd };
}

// Timer Component
const LiveTimer = ({ startTime }: { startTime: number }) => {
    const [elapsed, setElapsed] = useState(Date.now() - startTime);
    useEffect(() => {
        const interval = setInterval(() => setElapsed(Date.now() - startTime), 1000);
        return () => clearInterval(interval);
    }, [startTime]);
    
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    if (elapsed < 0) return <span>Active</span>;
    return <span className="font-mono">{hours}h {minutes}m</span>;
};

const AdminView: React.FC<Props> = ({ users: propUsers, jobs: propJobs, tasks: propTasks, onRefresh, onClose }) => {
  const [activeTab, setActiveTab] = useState<'live' | 'users' | 'jobs' | 'tasks'>('live');
  
  // Optimistic State Management
  const { localData: users, add: addUser, remove: removeUser, revertRemove: revertRemoveUser, revertAdd: revertAddUser } = useOptimisticList(propUsers);
  const { localData: jobs, add: addJob, remove: removeJob, revertRemove: revertRemoveJob, revertAdd: revertAddJob } = useOptimisticList(propJobs);
  const { localData: tasks, add: addTask, remove: removeTask, revertRemove: revertRemoveTask, revertAdd: revertAddTask } = useOptimisticList(propTasks, (a, b) => b.createdAt - a.createdAt);

        // Forms
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', rate: '', role: 'user' });
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [newJob, setNewJob] = useState({ name: '', address: '' });
  const [newTask, setNewTask] = useState({ title: '', assignedTo: '', jobName: '' });

  // Get Active Tasks (In Progress)
  const activeTasks = tasks.filter(t => t.status === TaskStatus.IN_PROGRESS);

  // --- HANDLERS ---

  const handleSaveUser = (e: React.FormEvent) => {
      e.preventDefault();
      if(!newUser.name || !newUser.password) {
          alert('Name and Password are required.');
          return;
      }
      
      const isNew = !editingUser;
      const user: UserProfile = {
          id: editingUser ? editingUser.id : crypto.randomUUID(),
          name: newUser.name,
          email: newUser.email ? newUser.email.trim() : '',
          password: newUser.password,
          rate: newUser.rate,
          role: newUser.role as 'admin' | 'user'
      };
      
      // Optimistic update
      if (isNew) {
          addUser(user);
      } else {
          removeUser(user.id);
          addUser(user);
      }

      setNewUser({ name: '', email: '', password: '', rate: '', role: 'user' });
      setEditingUser(null);
      saveUser(user, isNew)
        .then(onRefresh)
        .catch(err => {
            alert('Failed to save user: ' + err.message);
            if (isNew) {
                revertAddUser(user.id);
            } else {
                revertRemoveUser(user.id);
                revertAddUser(user.id);
            }
            onRefresh();
        });
  };

  const handleDeleteUser = (id: string) => {
      if(window.confirm("Delete this user?")) {
          removeUser(id);
          deleteUser(id)
            .then(onRefresh)
            .catch(e => {
                alert("Failed to delete user: " + e.message);
                revertRemoveUser(id);
                onRefresh();
            });
      }
  };

  const handleAddJob = (e: React.FormEvent) => {
      e.preventDefault();
      if(!newJob.name) return;
      const job: JobOption = {
          id: crypto.randomUUID(),
          name: newJob.name,
          address: newJob.address,
          active: true
      };
      addJob(job);
      setNewJob({ name: '', address: '' });
      saveJob(job, true)
        .then(onRefresh)
        .catch(err => {
            alert('Failed to add job: ' + err.message);
            revertAddJob(job.id);
            onRefresh();
        });
  };

  const handleDeleteJob = (id: string) => {
      if(window.confirm("Delete this job?")) {
          removeJob(id);
          deleteJob(id)
            .then(onRefresh)
            .catch(e => {
                alert("Failed to delete job: " + e.message);
                revertRemoveJob(id);
                onRefresh();
            });
      }
  };

  const handleAddTask = (e: React.FormEvent) => {
      e.preventDefault();
      if(!newTask.title) return;
      
      const task: Task = {
          id: crypto.randomUUID(),
          title: newTask.title,
          description: '',
          location: '',
          assignedTo: newTask.assignedTo || 'Unassigned',
          jobName: newTask.jobName,
          dueDate: new Date().toISOString().split('T')[0],
          priority: TaskPriority.MEDIUM,
          status: TaskStatus.PENDING,
          createdAt: Date.now(),
          image: ''
      };

      addTask(task);
      setNewTask({ title: '', assignedTo: '', jobName: '' });
      saveTask(task, true)
        .then(onRefresh)
        .catch(err => {
            alert('Failed to add task: ' + err.message);
            revertAddTask(task.id);
            onRefresh();
        });
  };

  const handleDeleteTask = (id: string) => {
      if(window.confirm("Delete this task permanently?")) {
          removeTask(id);
          deleteTask(id)
            .then(onRefresh)
            .catch(e => {
                alert("Failed to delete task: " + e.message);
                revertRemoveTask(id);
                onRefresh();
            });
      }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-4 h-16 flex items-center justify-between shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="bg-slate-900 text-white p-1 rounded">ADMIN</span> Dashboard
            </h2>
            <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200">
                <X size={20} />
            </button>
        </div>

        <div className="max-w-3xl mx-auto p-4 pb-20">
            
            {/* Tabs */}
            <div className="flex gap-2 mb-6 bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto no-scrollbar">
                {[
                    { id: 'live', icon: Sparkles, label: 'Live' },
                    { id: 'tasks', icon: LayoutList, label: 'Tasks' },
                    { id: 'users', icon: User, label: 'Team' },
                    { id: 'jobs', icon: Briefcase, label: 'Jobs' }
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-2 px-3 whitespace-nowrap rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 
                        ${activeTab === tab.id ? 'bg-orange-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* LIVE ACTIVITY TAB */}
            {activeTab === 'live' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                            <div className="text-xs font-bold text-slate-400 uppercase">Tasks In Progress</div>
                            <div className="text-3xl font-bold text-slate-900 mt-1">{activeTasks.length}</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                            <div className="text-xs font-bold text-slate-400 uppercase">Total Team Size</div>
                            <div className="text-3xl font-bold text-slate-900 mt-1">{users.length}</div>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-4">
                             <h3 className="font-bold text-slate-800">Who is working now?</h3>
                             <button onClick={onRefresh} className="text-xs text-orange-600 font-bold hover:underline">Refresh Data</button>
                        </div>
                        {activeTasks.length === 0 ? (
                            <div className="bg-slate-100 rounded-xl p-8 text-center text-slate-400 italic">
                                No tasks currently in progress.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {activeTasks.map(task => (
                                    <div key={task.id} className="bg-white p-4 rounded-xl shadow-md border-l-4 border-l-orange-500 flex justify-between items-center relative overflow-hidden">
                                        <div className="absolute top-2 right-2 w-2 h-2 bg-orange-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]"></div>
                                        <div>
                                            <div className="font-bold text-lg text-slate-900 flex items-center gap-2">
                                                {task.assignedTo || 'Unassigned'}
                                            </div>
                                            <div className="text-sm text-slate-500 mt-1 font-medium">{task.title}</div>
                                            <div className="text-xs text-orange-600 mt-1 flex items-center gap-1 font-semibold">
                                                <Briefcase size={12} /> {task.jobName || 'General Task'}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {task.startedAt && (
                                                <div className="bg-orange-50 text-orange-700 px-3 py-1 rounded-lg font-bold text-sm flex items-center gap-2">
                                                    <Clock size={16} />
                                                    <LiveTimer startTime={task.startedAt} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ALL TASKS TAB */}
            {activeTab === 'tasks' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    {/* Add Task Form */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-sm text-slate-500 uppercase mb-3">Create New Task</h3>
                        <form onSubmit={handleAddTask} className="space-y-3">
                            <input 
                                type="text" 
                                placeholder="Task Title (e.g. Inspect Flashing)"
                                value={newTask.title}
                                onChange={e => setNewTask({...newTask, title: e.target.value})}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold"
                                required
                            />
                            <div className="flex gap-2">
                                <select 
                                    value={newTask.assignedTo}
                                    onChange={e => setNewTask({...newTask, assignedTo: e.target.value})}
                                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                >
                                    <option value="">Unassigned</option>
                                    {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                                </select>
                                <select 
                                    value={newTask.jobName}
                                    onChange={e => setNewTask({...newTask, jobName: e.target.value})}
                                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                >
                                    <option value="">No Job Linked</option>
                                    {jobs.map(j => <option key={j.id} value={j.name}>{j.name}</option>)}
                                </select>
                            </div>
                            <button type="submit" className="w-full py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2">
                                <Plus size={16} /> Create Task
                            </button>
                        </form>
                    </div>

                    {/* Tasks List */}
                    <div className="space-y-2">
                        {tasks.length === 0 ? <p className="text-center text-slate-400 italic">No tasks found.</p> : 
                            tasks.map(task => (
                                <div key={task.id} className="bg-white p-3 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${task.status === TaskStatus.COMPLETED ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                            {task.status === TaskStatus.COMPLETED ? <CheckCircle size={16}/> : <LayoutList size={16} />}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-bold text-slate-800 truncate">{task.title}</div>
                                            <div className="text-xs text-slate-500 flex items-center gap-2">
                                                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">{task.assignedTo || 'Unassigned'}</span>
                                                {task.jobName && <span className="text-orange-600 truncate">{task.jobName}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeleteTask(task.id)} className="text-slate-300 hover:text-red-500 p-2 shrink-0">
                                        <Trash size={18} />
                                    </button>
                                </div>
                            ))
                        }
                    </div>
                </div>
            )}

            {/* USERS TAB */}
            {activeTab === 'users' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-sm text-slate-500 uppercase mb-3">
                            {editingUser ? 'Edit Team Member' : 'Add New Team Member'}
                        </h3>
                        <form onSubmit={handleSaveUser} className="flex flex-col gap-3">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-semibold text-slate-400">Name</label>
                                    <input 
                                        type="text" 
                                        placeholder="Full Name"
                                        value={newUser.name}
                                        onChange={e => setNewUser({...newUser, name: e.target.value})}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-400">Email/Username</label>
                                    <input 
                                        type="text" 
                                        placeholder="Email"
                                        value={newUser.email || ''}
                                        onChange={e => setNewUser({...newUser, email: e.target.value})}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-400">Password</label>
                                    <input 
                                        type="password" 
                                        placeholder="Required"
                                        value={newUser.password || ''}
                                        onChange={e => setNewUser({...newUser, password: e.target.value})}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                      <label className="text-xs font-semibold text-slate-400">Rate</label>
                                      <input 
                                          type="number" 
                                          placeholder="0.00"
                                          value={newUser.rate}
                                          onChange={e => setNewUser({...newUser, rate: e.target.value})}
                                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                      />
                                  </div>
                                  <div>
                                      <label className="text-xs font-semibold text-slate-400">Role</label>
                                      <select 
                                          value={newUser.role}
                                          onChange={e => setNewUser({...newUser, role: e.target.value})}
                                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                      >
                                          <option value="user">User</option>
                                          <option value="admin">Admin</option>
                                      </select>
                                  </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button type="submit" className="flex-1 py-2 bg-slate-900 text-white rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2 font-bold text-sm">
                                    <Plus size={16} /> {editingUser ? 'Save Changes' : 'Add Member'}
                                </button>
                                {editingUser && (
                                    <button type="button" onClick={() => { setEditingUser(null); setNewUser({ name: '', email: '', password: '', rate: '', role: 'user' }); }} className="p-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition">
                                        <X size={20} />
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                    <div className="space-y-2">
                        {users.map(user => (
                            <div key={user.id} className="bg-white p-3 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold">
                                        {user.name.charAt(0)}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800">{user.name}</div>
                                        <div className="text-xs text-emerald-600 font-medium">${user.rate || '0.00'}/hr</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => { setEditingUser(user); setNewUser({ name: user.name, email: user.email || '', password: user.password || '', rate: user.rate || '', role: user.role || 'user' }); }} className="text-slate-300 hover:text-orange-500 p-2">
                                        <div className="text-sm font-bold">Edit</div>
                                    </button>
                                    <button onClick={() => handleDeleteUser(user.id)} className="text-slate-300 hover:text-red-500 p-2">
                                        <Trash size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* JOBS TAB */}
            {activeTab === 'jobs' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-sm text-slate-500 uppercase mb-3">Add Active Job</h3>
                        <form onSubmit={handleAddJob} className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-slate-400">Job Name / Customer</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Smith Residence"
                                    value={newJob.name}
                                    onChange={e => setNewJob({...newJob, name: e.target.value})}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-400">Address / Location</label>
                                <input 
                                    type="text" 
                                    placeholder="123 Main St"
                                    value={newJob.address}
                                    onChange={e => setNewJob({...newJob, address: e.target.value})}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                                />
                            </div>
                            <button type="submit" className="w-full py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2">
                                <Plus size={16} /> Add Job
                            </button>
                        </form>
                    </div>
                    <div className="space-y-2">
                        {jobs.map(job => (
                            <div key={job.id} className="bg-white p-3 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600">
                                        <Briefcase size={16} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800">{job.name}</div>
                                        <div className="text-xs text-slate-400 flex items-center gap-1">
                                            <MapPin size={10} /> {job.address || 'No address'}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => handleDeleteJob(job.id)} className="text-slate-300 hover:text-red-500 p-2">
                                    <Trash size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    </div>
  );
};

export default AdminView;
