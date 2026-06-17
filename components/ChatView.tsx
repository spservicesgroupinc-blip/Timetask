
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChatMessage } from '../types';
import { Send, Camera, X, RotateCcw, AlertTriangle } from './Icons';
import { sendMessage } from '../services/sheetService';
import { generateUUID } from '@/utils/uuid';

interface Props {
  messages: ChatMessage[];
  currentUserName: string;
  onSendMessage: (text: string, image?: string | null) => Promise<void>;
}

// Subcomponent: Individual Message Bubble
// Memoized to prevent re-renders of existing messages when new ones arrive or input changes
const ChatMessageItem = React.memo(({ msg, isMe, isSequence, isSystem, isSending, isError, formatTime, handleSend }: any) => {
    if (isSystem) {
        return (
            <div className="flex justify-center my-4">
                <span className="text-xs text-slate-400 italic bg-slate-100 px-3 py-1 rounded-lg">{msg.text}</span>
            </div>
        );
    }

    return (
        <div className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex flex-col max-w-[85%] ${isMe ? 'items-end' : 'items-start'}`}>
            
            {!isSequence && !isMe && (
                <span className="text-[10px] font-bold text-slate-500 mb-1 ml-1">{msg.sender}</span>
            )}

            <div className={`px-4 py-2 rounded-2xl shadow-sm text-sm relative group min-w-[60px] transition-all
                ${isMe 
                    ? 'bg-orange-600 text-white rounded-br-none' 
                    : 'bg-white text-slate-800 border border-slate-100 rounded-bl-none'
                }
                ${isSending ? 'opacity-70' : 'opacity-100'}
                ${isError ? 'border-2 border-red-500 bg-red-50 text-red-900' : ''}
                `}
            >
                {msg.image && (
                    <div className="mb-2 -mx-4 -mt-2 rounded-t-xl overflow-hidden relative min-h-[100px] bg-slate-100 flex items-center justify-center">
                        <img 
                            src={msg.image} 
                            alt="shared" 
                            className="w-full h-auto max-h-60 object-cover" 
                        />
                    </div>
                )}
                
                {msg.text && <p className="break-words leading-relaxed">{msg.text}</p>}
                
                <div className="flex items-center justify-end gap-1 mt-1">
                    {isError ? (
                        <span className="text-[10px] font-bold text-red-600 flex items-center gap-1">
                            <AlertTriangle size={10} /> Failed
                        </span>
                    ) : (
                        <span className={`text-[9px] opacity-60 ${isMe && !isError ? 'text-white' : 'text-slate-400'}`}>
                            {isSending ? 'Sending...' : formatTime(msg.timestamp)}
                        </span>
                    )}
                </div>
            </div>

            {isError && (
                <button 
                    onClick={() => handleSend(undefined, msg)}
                    className="mt-1 mr-1 text-xs font-bold text-red-500 flex items-center gap-1 hover:text-red-700 bg-white px-2 py-1 rounded-full shadow-sm"
                >
                    <RotateCcw size={12} /> Retry
                </button>
            )}
            </div>
        </div>
    );
});

// Subcomponent: Message List
const MessageList = React.memo(({ messages, currentUserName, handleSend }: any) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages.length]);

    // Handle initial scroll on mount
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, []);

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-28 no-scrollbar space-y-4">
            <div className="text-center py-4">
                <div className="inline-block bg-slate-200 text-slate-500 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Today
                </div>
            </div>

            {messages.map((msg: ChatMessage, index: number) => {
                const isMe = msg.sender === currentUserName;
                const isSystem = msg.sender === 'System';
                const isSending = msg.status === 'sending';
                const isError = msg.status === 'error';
                const isSequence = index > 0 && messages[index - 1].sender === msg.sender;

                return (
                    <ChatMessageItem 
                        key={msg.id}
                        msg={msg}
                        isMe={isMe}
                        isSequence={isSequence}
                        isSystem={isSystem}
                        isSending={isSending}
                        isError={isError}
                        formatTime={formatTime}
                        handleSend={handleSend}
                    />
                );
            })}
            <div ref={bottomRef} />
        </div>
    );
});


const ChatView: React.FC<Props> = ({ messages: serverMessages, currentUserName }) => {
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Merge Server messages with Local pending/error messages
  const displayMessages = useMemo(() => {
      // 1. Create a map of server messages by ID for fast lookup
      const serverIds = new Set(serverMessages.map(m => m.id));
      
      // 2. Filter out local messages that have now appeared on the server
      const stillPending = localMessages.filter(local => !serverIds.has(local.id));

      // 3. Combine and sort
      return [...serverMessages, ...stillPending].sort((a, b) => a.timestamp - b.timestamp);
  }, [serverMessages, localMessages]);

  const handleSend = async (e?: React.FormEvent, retryMessage?: ChatMessage) => {
    if (e) e.preventDefault();

    let messageToSend: ChatMessage;

    if (retryMessage) {
        messageToSend = { ...retryMessage, status: 'sending' };
        setLocalMessages(prev => prev.map(m => m.id === retryMessage.id ? messageToSend : m));
    } else {
        if (!inputValue.trim() && !selectedImage) return;

        const newId = generateUUID();
        messageToSend = {
            id: newId, 
            sender: currentUserName || 'Anonymous',
            text: inputValue.trim(),
            timestamp: Date.now(),
            image: selectedImage || undefined,
            status: 'sending'
        };

        // Instant UI Update
        setLocalMessages(prev => [...prev, messageToSend]);
        setInputValue('');
        setSelectedImage(null);
    }

    try {
        await sendMessage(messageToSend);
        
        // Success: Mark as sent locally
        setLocalMessages(prev => prev.map(m => 
            m.id === messageToSend.id ? { ...m, status: 'sent' } : m
        ));
    } catch (error) {
        // Error: Mark as error locally
        setLocalMessages(prev => prev.map(m => 
            m.id === messageToSend.id ? { ...m, status: 'error' } : m
        ));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
          alert("Image is too large. Please select an image under 10MB.");
          return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-50 relative">
      
      {/* Messages Area - Wrapped in memoized List to avoid re-renders on input typing */}
      <MessageList 
         messages={displayMessages} 
         currentUserName={currentUserName} 
         handleSend={handleSend} 
      />

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 safe-bottom">
          
          {/* Image Preview */}
          {selectedImage && (
             <div className="px-4 pt-3 pb-1 flex">
                <div className="relative inline-block animate-in fade-in slide-in-from-bottom-2">
                   <img src={selectedImage} className="h-20 w-auto rounded-lg border border-slate-200 shadow-sm object-cover" alt="Preview" />
                   <button 
                        onClick={() => {
                            setSelectedImage(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                        }} 
                        className="absolute -top-2 -right-2 bg-slate-900 text-white rounded-full p-1 hover:bg-red-500 transition shadow-md"
                    >
                        <X size={12} />
                   </button>
                </div>
             </div>
          )}

          <form onSubmit={(e) => handleSend(e)} className="flex gap-2 items-end max-w-3xl mx-auto p-3">
              <input 
                  type="file" 
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
              />
              
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-slate-100 hover:bg-slate-200 text-slate-500 p-3 rounded-full transition-colors flex-shrink-0 active:scale-95"
              >
                  <Camera size={20} />
              </button>

              <div className="flex-1 bg-slate-100 rounded-2xl flex items-center p-1 border border-transparent focus-within:border-orange-300 focus-within:bg-white transition-colors">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-transparent border-none focus:ring-0 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 max-h-24"
                  />
              </div>
              <button 
                type="submit"
                disabled={!inputValue.trim() && !selectedImage}
                className="bg-slate-900 hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-slate-900 text-white p-3 rounded-full shadow-lg transition-all flex-shrink-0 active:scale-95"
              >
                  <Send size={18} />
              </button>
          </form>
      </div>

    </div>
  );
};

export default ChatView;
