
import { GOOGLE_SCRIPT_URL } from '../constants';
import { Task, TaskStatus, TaskPriority, SheetResponse, ChatMessage, UserProfile, JobOption, TimeEntry } from '../types';

// Mock Tasks
const MOCK_TASKS: Task[] = [
  {
    id: '1',
    title: 'Roof Inspection - Smith Residence',
    description: 'Check for hail damage on the north slope and inspect flashing around the chimney.',
    location: '124 Maple Ave, Sector 4',
    assignedTo: 'Mike R.',
    dueDate: '2023-11-15',
    priority: TaskPriority.HIGH,
    status: TaskStatus.IN_PROGRESS,
    createdAt: Date.now() - 10000000,
    image: 'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&q=80&w=600'
  }
];

const MOCK_MESSAGES: ChatMessage[] = [
  { id: 'm1', sender: 'System', text: 'Welcome to TruChoice Chat!', timestamp: Date.now(), status: 'sent' }
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper for fetch with timeout
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 8000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

// --- IMAGE UTILS ---

// Compresses image to max 800px width/height and 0.7 quality jpeg
export const compressImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 800;

      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // Returns full data URI
        resolve(canvas.toDataURL('image/jpeg', 0.7)); 
      } else {
        resolve(base64Str); // Fallback
      }
    };
    img.onerror = () => resolve(base64Str); // Fallback
  });
};

// --- TASKS ---

export const fetchTasks = async (forceRefresh = false): Promise<Task[]> => {
  return fetchGeneric('tasks', MOCK_TASKS, forceRefresh);
};

export const saveTask = async (task: Task, isNew: boolean): Promise<Task> => {
  return saveGeneric('tasks', task, isNew);
};

export const deleteTask = async (taskId: string): Promise<void> => {
  return deleteGeneric('tasks', taskId);
};

// --- CHAT ---

export const fetchMessages = async (forceRefresh = false): Promise<ChatMessage[]> => {
    // Shorter timeout for chat to keep it snappy, faster updates
    return fetchGeneric('messages', MOCK_MESSAGES, forceRefresh || true, 5000); 
};

export const sendMessage = async (message: ChatMessage): Promise<ChatMessage> => {
    // 1. Compress image if present
    if (message.image) {
        try {
            message.image = await compressImage(message.image);
        } catch (e) {
            console.warn("Image compression failed, sending raw", e);
        }
    }
    
    // 2. Send to server
    // We do NOT save to generic local storage immediately here, 
    // we let the UI handle the "pending" state via Optimistic UI
    if (!GOOGLE_SCRIPT_URL) {
        await delay(500);
        return { ...message, status: 'sent' };
    }

    const token = getAuthToken();
    if (!token) throw new Error("Unauthorized: Please sign in");

    try {
        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'create',
                table: 'messages',
                data: message,
                token: token
            })
        }, 15000); // Image upload might take a bit

        if (!response.ok) throw new Error("Network error");
        
        const result = await response.json();
        if (result.status === 'success') {
            return { ...message, status: 'sent' };
        } else {
            throw new Error(result.message);
        }
    } catch (e) {
        console.error("Send Message Error:", e);
        throw e;
    }
};

// --- ADMIN (USERS & JOBS) ---

export const fetchUsers = async (forceRefresh = false): Promise<UserProfile[]> => {
    return fetchGeneric('users', [], forceRefresh);
};

export const saveUser = async (user: UserProfile, isNew: boolean): Promise<UserProfile> => {
    return saveGeneric('users', user, isNew);
};

export const deleteUser = async (id: string): Promise<void> => {
    return deleteGeneric('users', id);
};

export const fetchJobs = async (forceRefresh = false): Promise<JobOption[]> => {
    return fetchGeneric('jobs', [], forceRefresh);
};

export const saveJob = async (job: JobOption, isNew: boolean): Promise<JobOption> => {
    return saveGeneric('jobs', job, isNew);
};

export const deleteJob = async (id: string): Promise<void> => {
    return deleteGeneric('jobs', id);
};


// --- AUTHENTICATION TOKEN STORE ---

let cachedToken: string | null = localStorage.getItem('truchoice_token') || null;

export const setAuthToken = (token: string | null) => {
    cachedToken = token;
    if (token) {
        localStorage.setItem('truchoice_token', token);
    } else {
        localStorage.removeItem('truchoice_token');
    }
};

export const getAuthToken = () => cachedToken;

export const loginUserApi = async (email: string, password: string): Promise<{ token: string; user: UserProfile }> => {
    if (!GOOGLE_SCRIPT_URL) {
        // Mock fallback for local environment/tests
        const mockUser: UserProfile = { id: 'admin-id', name: 'Admin', email, password, role: 'admin', rate: '50' };
        const token = 'mock-jwt-token';
        setAuthToken(token);
        return { token, user: mockUser };
    }

    try {
        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'login',
                data: { email, password }
            })
        }, 15000);

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const result = await response.json();
        if (result.status === 'success' && result.data) {
            const { token, user } = result.data;
            setAuthToken(token);
            return { token, user };
        }
        throw new Error(result.message || 'Invalid email or password.');
    } catch (e: any) {
        console.error("Login Error:", e);
        throw e;
    }
};

export const registerUserApi = async (name: string, email: string, password: string, role = 'admin'): Promise<{ token: string; user: UserProfile }> => {
    if (!GOOGLE_SCRIPT_URL) {
        // Mock fallback
        const mockUser: UserProfile = { id: 'new-id', name, email, password, role, rate: '40' };
        const token = 'mock-jwt-token';
        setAuthToken(token);
        return { token, user: mockUser };
    }

    try {
        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'register',
                data: { name, email, password, role }
            })
        }, 15000);

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const result = await response.json();
        if (result.status === 'success' && result.data) {
            const { token, user } = result.data;
            setAuthToken(token);
            return { token, user };
        }
        throw new Error(result.message || 'Registration failed.');
    } catch (e: any) {
        console.error("Register Error:", e);
        throw e;
    }
};

// --- TIME CLOCK & REPORTS ---

export const saveTimeEntryLocal = async (entry: TimeEntry): Promise<void> => {
    // Standard direct database creation or updates for perfect sheet-sync with NO local storage discrepancies
    const isNew = entry.status === 'active';
    await saveGeneric('time_entries', entry, isNew);
};

export const syncPendingTimeEntries = async (): Promise<void> => {
    // No-op because saveTimeEntryLocal pushes directly to Apps Script immediately!
    return;
};

export const generateReport = async (userId: string, startDate: string, endDate: string): Promise<string> => {
    if (!GOOGLE_SCRIPT_URL) throw new Error("No backend configured");

    const token = getAuthToken();
    if (!token) throw new Error("Unauthorized: Please sign in");

    try {
        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'generateReport',
                token,
                data: {
                    userId,
                    startDate,
                    endDate
                }
            })
        }, 30000); // Longer timeout for report generation

        if (!response.ok) throw new Error("Report generation network error");
        
        const result = await response.json();
        if (result.status === 'success' && result.data && result.data.url) {
            return result.data.url;
        }
        throw new Error(result.message || "Failed to generate report");
    } catch (e) {
        console.error("Generate Report Error:", e);
        throw e;
    }
};

export const fetchTimeEntries = async (forceRefresh = false): Promise<TimeEntry[]> => {
    return fetchGeneric('time_entries', [], forceRefresh);
};

// --- GENERIC HELPERS ---

async function fetchGeneric<T>(table: 'tasks' | 'messages' | 'users' | 'jobs' | 'time_entries', mockData: T[], forceRefresh = false, timeout = 10000): Promise<T[]> {
  if (!GOOGLE_SCRIPT_URL) {
    await delay(500);
    return mockData;
  }

  const token = getAuthToken();
  if (!token) {
    // If not logged in, return empty array (prevents unauthorized fetch errors in log console on mount)
    return [];
  }

  try {
    const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'read',
            table: table,
            token: token
        })
    }, timeout);
    
    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    
    const result: SheetResponse = await response.json();
    if (result.status === 'success' && result.data) {
      // Ensure all items have a unique ID, acting as a failsafe if remote backend is missing IDs
      return result.data.map((item: any, index: number) => ({
          ...item,
          id: item.id || `fallback-id-${index}`
      }));
    }
    throw new Error(result.message || 'Failed to fetch');
  } catch (error) {
    if (table !== 'time_entries') {
        console.error(`API Fetch Error (${table}):`, error);
    }
    return [];
  }
}

async function saveGeneric<T extends { id: string }>(table: 'tasks' | 'messages' | 'users' | 'jobs' | 'time_entries', item: T, isNew: boolean): Promise<T> {
  if (GOOGLE_SCRIPT_URL) {
    const token = getAuthToken();
    if (!token) throw new Error("Unauthorized: Please sign in");
    
    try {
      const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: isNew ? 'create' : 'update',
          table: table,
          data: item,
          token: token
        })
      }, 15000);

      if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
      }
      
      const result = await response.json();
      if (result.status !== 'success') {
          throw new Error(result.message || 'Backend returned error');
      }

    } catch (e) {
      console.error("API Save Error:", e);
      throw e;
    }
  }
  return item;
}

async function forceClearCache(table: string) {
    if (!GOOGLE_SCRIPT_URL) return;
    const token = getAuthToken();
    if (!token) return;
    const tempId = 'cache_buster_' + Date.now();
    try {
        await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'create', table: table, data: { id: tempId, name: 'temp cache buster', rate: 0, role: 'temp' }, token: token })
        });
        await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'delete', table: table, id: tempId, data: { id: tempId }, token: token })
        });
    } catch(e) {
        console.warn("Forced cache clear failed:", e);
    }
}

async function deleteGeneric(table: 'tasks' | 'users' | 'jobs' | 'time_entries', id: string): Promise<void> {
    if (GOOGLE_SCRIPT_URL) {
        const token = getAuthToken();
        if (!token) throw new Error("Unauthorized: Please sign in");
        try {
          const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'delete', table: table, id: id, data: { id }, token: token })
          });
          
          if (!response.ok) throw new Error('Delete failed network');
          const result = await response.json();
          if (result.status !== 'success') {
              if (result.message && result.message.includes('Item ID not found')) {
                  console.warn(`Item ${id} not found on server, may have been manually deleted. Forcing cache clear.`);
                  await forceClearCache(table);
                  return; // Consider it a success since it's gone
              }
              throw new Error(result.message);
          }

        } catch (e) { 
            console.error(e);
            throw e; 
        }
    }
}
