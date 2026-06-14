
export enum TaskStatus {
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  BLOCKED = 'Blocked',
  COMPLETED = 'Completed'
}

export enum TaskPriority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  CRITICAL = 'Critical'
}

export interface Task {
  id: string;
  title: string;
  description: string;
  location: string;
  assignedTo: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  image?: string;
  jobName?: string;
  startedAt?: number;
  jobNotes?: string; // New field for field notes/completion notes
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  image?: string;
  status?: 'sending' | 'sent' | 'error';
  localId?: string; 
}

export enum JobStatus {
  SOLD = 'Sold',
  SCHEDULED = 'Scheduled',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled'
}

export interface Job {
  id: string;
  customerName: string;
  address: string;
  jobType: string;
  soldDate: string;
  installDate: string;
  contractAmount: string;
  status: JobStatus;
  notes: string;
  image: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  password?: string;
  rate: string;
  role: 'admin' | 'user';
  pin?: string; 
}

export interface JobOption {
  id: string;
  name: string;
  address: string;
  active: boolean;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId?: string;
  userAgent?: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  startTime: number;
  endTime: number | null;
  status: 'active' | 'completed';
  jobName?: string;
  totalPay?: number;
  isSynced?: boolean;
}

export type ViewType = 'tasks' | 'calendar' | 'chat' | 'admin' | 'timeclock';

export interface SheetResponse {
  status: 'success' | 'error';
  data?: any[];
  message?: string;
}

export interface IconProps {
  className?: string;
  size?: number;
  fill?: string;
  strokeWidth?: number | string;
}
