import React, { useState, useEffect, useRef } from 'react';
import { Job, JobStatus } from '../types';
import { X, Camera, DollarSign, MapPin, Calendar, Briefcase } from './Icons';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (job: Job) => void;
  job?: Job | null;
  initialDate?: string; // New prop for pre-filling date
}

const JobModal: React.FC<Props> = ({ isOpen, onClose, onSave, job, initialDate }) => {
  const [baseData, setBaseData] = useState<Job>({
    id: '',
    customerName: '',
    address: '',
    jobType: '',
    soldDate: '',
    installDate: '',
    contractAmount: '',
    status: JobStatus.SOLD,
    notes: '',
    image: ''
  });

  const [newImageFile, setNewImageFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Default dates
      const defaultInstallDate = initialDate || '';
      const defaultSoldDate = new Date().toISOString().split('T')[0];

      const initialJob = job || {
        id: crypto.randomUUID(),
        customerName: '',
        address: '',
        jobType: '',
        soldDate: defaultSoldDate,
        installDate: defaultInstallDate,
        contractAmount: '',
        status: JobStatus.SOLD,
        notes: '',
        image: ''
      };
      setBaseData(initialJob);
      setNewImageFile(null);
    }
  }, [job, isOpen, initialDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ 
        ...baseData, 
        image: newImageFile || baseData.image
    });
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 flex justify-between items-center bg-white border-b border-slate-100">
           <div className="flex items-center gap-2 text-orange-600">
               <Briefcase size={20} />
               <span className="text-sm font-bold uppercase tracking-wider">
                   {job ? 'Edit Job' : 'New Sold Job'}
               </span>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
          <div className="p-6 space-y-6">
            
            {/* Customer Name */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Customer Name</label>
              <input
                type="text"
                required
                value={baseData.customerName}
                onChange={(e) => setBaseData({ ...baseData, customerName: e.target.value })}
                className="w-full text-xl font-bold text-slate-900 placeholder-slate-300 border-b border-slate-200 focus:border-orange-500 focus:outline-none py-2"
                placeholder="e.g. Smith Residence"
              />
            </div>

            {/* Core Info Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-1">
                        <MapPin size={12} /> Address
                    </label>
                    <input
                        type="text"
                        value={baseData.address}
                        onChange={(e) => setBaseData({ ...baseData, address: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                        placeholder="Project Address"
                    />
                </div>
                
                 <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Job Type</label>
                    <input
                        type="text"
                        value={baseData.jobType}
                        onChange={(e) => setBaseData({ ...baseData, jobType: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                        placeholder="e.g. Roofing"
                    />
                </div>
                
                <div>
                    <label className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-1">
                        <DollarSign size={12} /> Amount
                    </label>
                    <input
                        type="number"
                        value={baseData.contractAmount}
                        onChange={(e) => setBaseData({ ...baseData, contractAmount: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                        placeholder="0.00"
                    />
                </div>
            </div>

            {/* Dates */}
             <div className="grid grid-cols-2 gap-4 bg-orange-50/50 p-4 rounded-xl border border-orange-100">
                <div>
                    <label className="block text-xs font-bold text-orange-800 mb-1">Sold Date</label>
                    <input
                        type="date"
                        value={baseData.soldDate}
                        onChange={(e) => setBaseData({ ...baseData, soldDate: e.target.value })}
                        className="w-full px-2 py-1 bg-white border border-orange-200 rounded text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-orange-800 mb-1">Install Date</label>
                    <input
                        type="date"
                        value={baseData.installDate}
                        onChange={(e) => setBaseData({ ...baseData, installDate: e.target.value })}
                        className="w-full px-2 py-1 bg-white border border-orange-200 rounded text-sm"
                    />
                </div>
             </div>

            {/* Status & Notes */}
            <div>
                 <label className="block text-xs font-bold text-slate-500 mb-1">Status</label>
                 <select
                    value={baseData.status}
                    onChange={(e) => setBaseData({ ...baseData, status: e.target.value as JobStatus })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                 >
                     {Object.values(JobStatus).map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
            </div>

            <div>
                 <label className="block text-xs font-bold text-slate-500 mb-1">Notes / Instructions</label>
                 <textarea
                    value={baseData.notes}
                    onChange={(e) => setBaseData({ ...baseData, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm h-24 resize-none"
                    placeholder="Enter specific instructions..."
                 />
            </div>

            {/* Photo Upload */}
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
                            alt="Job Attachment" 
                            className="w-full h-40 object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <button 
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-white/20 hover:bg-white/40 backdrop-blur-sm text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2"
                             >
                                <Camera size={18} />
                                Change Photo
                             </button>
                        </div>
                    </div>
                ) : (
                    <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-medium flex items-center justify-center gap-2 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-all"
                    >
                        <Camera size={20} />
                        Attach Contract/Photo
                    </button>
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
              onClick={handleSubmit}
              className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-orange-600 transition shadow-lg shadow-slate-900/10"
            >
              Save Job
            </button>
        </div>

      </div>
    </div>
  );
};

export default JobModal;