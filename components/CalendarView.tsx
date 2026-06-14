
import React from 'react';
import { Task, TaskStatus } from '../types';
import { Calendar as CalendarIcon, MapPin } from './Icons';

interface Props {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDayClick: (date: string) => void;
}

export const CalendarView: React.FC<Props> = ({ tasks, onTaskClick, onDayClick }) => {
  const today = new Date();
  const [currentDate, setCurrentDate] = React.useState(today);

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Map items to dates
  const getItemsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayTasks = tasks.filter(t => t.dueDate === dateStr && t.status !== TaskStatus.COMPLETED);
    return { dateStr, dayTasks };
  };

  const changeMonth = (delta: number) => {
    setCurrentDate(new Date(year, month + delta, 1));
  };

  const renderCalendarDays = () => {
    const days = [];
    
    // Empty cells for padding before start of month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 bg-slate-50/50 border-r border-b border-slate-100"></div>);
    }

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
      const { dateStr, dayTasks } = getItemsForDay(day);
      const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

      days.push(
        <div 
            key={day} 
            onClick={() => onDayClick(dateStr)}
            className={`h-24 border-r border-b border-slate-100 p-1 relative overflow-hidden group hover:bg-slate-50 cursor-pointer transition ${isToday ? 'bg-orange-50/30' : ''}`}
        >
           <span className={`text-xs font-bold p-1 rounded-full w-6 h-6 flex items-center justify-center ${isToday ? 'bg-orange-600 text-white' : 'text-slate-400'}`}>
               {day}
           </span>
           
           <div className="mt-1 space-y-1 overflow-y-auto max-h-[calc(100%-24px)] no-scrollbar">
               {dayTasks.map(task => (
                   <button 
                     key={task.id}
                     onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                     className="w-full text-left text-[9px] bg-orange-100 text-orange-800 px-1 py-0.5 rounded truncate hover:bg-orange-200 block"
                     title={task.title}
                   >
                     • {task.title}
                   </button>
               ))}
           </div>
        </div>
      );
    }
    return days;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 flex justify-between items-center bg-white border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <CalendarIcon className="text-orange-600" />
                {monthNames[month]} {year}
            </h2>
            <div className="flex gap-1">
                <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-100 rounded text-slate-500 font-bold">&lt;</button>
                <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-100 rounded text-slate-500 font-bold">&gt;</button>
            </div>
        </div>
        
        {/* Week Days Header */}
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {d}
                </div>
            ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7">
            {renderCalendarDays()}
        </div>

        {/* Legend */}
        <div className="p-3 text-[10px] flex gap-4 border-t border-slate-100 text-slate-500 font-medium">
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-200"></span> Tasks Due</div>
        </div>
    </div>
  );
};
