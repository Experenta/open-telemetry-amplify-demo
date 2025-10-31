'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { Schema } from '@/amplify/data/resource';
import { toggleSubtask, deleteSubtask } from '@/actions/subtasks';
import { toast } from 'sonner';

type Subtask = Schema['Subtask']['type'];

interface SubtasksListProps {
  subtasks: Subtask[];
  projectId: string;
  onUpdate: () => void;
}

export function SubtasksList({ subtasks, projectId, onUpdate }: SubtasksListProps) {
  async function handleToggle(subtask: Subtask) {
    const result = await toggleSubtask(
      subtask.id,
      !subtask.isCompleted,
      projectId
    );

    if (result.success) {
      onUpdate();
    } else {
      toast.error(result.error || 'Failed to update subtask');
    }
  }

  async function handleDelete(subtaskId: string) {
    const result = await deleteSubtask(subtaskId, projectId);

    if (result.success) {
      toast.success('Subtask deleted');
      onUpdate();
    } else {
      toast.error(result.error || 'Failed to delete subtask');
    }
  }

  if (subtasks.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">No subtasks yet</p>
    );
  }

  return (
    <div className="space-y-2">
      {subtasks.map((subtask) => (
        <div
          key={subtask.id}
          className="flex items-center space-x-2 group"
        >
          <Checkbox
            id={subtask.id}
            checked={subtask.isCompleted || false}
            onCheckedChange={() => handleToggle(subtask)}
          />
          <label
            htmlFor={subtask.id}
            className={`flex-1 text-sm cursor-pointer ${
              subtask.isCompleted
                ? 'line-through text-gray-500'
                : 'text-gray-700'
            }`}
          >
            {subtask.title}
          </label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => handleDelete(subtask.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

