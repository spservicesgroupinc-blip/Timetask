export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

// Generate a simple ID for list items
const generateId = () => Math.random().toString(36).substring(2, 9);

export const parseDescription = (desc: string) => {
  if (!desc) return { notes: '', items: [] };
  
  const lines = desc.split('\n');
  const items: ChecklistItem[] = [];
  const notesLines: string[] = [];

  lines.forEach(line => {
    // Regex matches "- [ ] Text" or "- [x] Text"
    const match = line.match(/^- \[(x| )\] (.*)/i);
    if (match) {
      items.push({
        id: generateId(),
        checked: match[1].toLowerCase() === 'x',
        text: match[2]
      });
    } else {
      // Keep empty lines only if they are between notes, simplified here to just push
      notesLines.push(line);
    }
  });

  return {
    notes: notesLines.join('\n').trim(),
    items
  };
};

export const serializeDescription = (notes: string, items: ChecklistItem[]) => {
  const checklistString = items
    .map(item => `- [${item.checked ? 'x' : ' '}] ${item.text}`)
    .join('\n');
  
  const cleanedNotes = notes.trim();
  
  if (!cleanedNotes) return checklistString;
  if (!items.length) return cleanedNotes;
  
  return `${cleanedNotes}\n\n${checklistString}`;
};