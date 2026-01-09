import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableToolProps {
  id: string;
  children: React.ReactNode;
}

export function SortableTool({ id, children }: SortableToolProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="flex items-center gap-2 bg-secondary/50 p-2 rounded-md border border-transparent hover:border-border group touch-none mb-2"
    >
      {/* Pega para arrastar */}
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
        <GripVertical size={16} />
      </div>
      {/* Conteúdo (Nome da ferramenta) */}
      <div className="flex-1 text-sm font-medium">
        {children}
      </div>
    </div>
  );
}