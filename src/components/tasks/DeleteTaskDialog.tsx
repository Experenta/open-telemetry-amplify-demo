'use client';

import { useState } from 'react';
import { deleteTask } from '@/actions/tasks';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import type { Schema } from '@/amplify/data/resource';

type Task = Schema['Task']['type'];

interface DeleteTaskDialogProps {
  task: Task;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteTaskDialog({
  task,
  projectId,
  open,
  onOpenChange,
}: DeleteTaskDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function onDelete() {
    setIsLoading(true);

    const result = await deleteTask(task.id, projectId);

    setIsLoading(false);

    if (result.success) {
      toast.success('Task deleted successfully!');
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to delete task');
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the task &quot;{task.title}&quot; and all
            associated subtasks. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onDelete}
            disabled={isLoading}
          >
            {isLoading ? 'Deleting...' : 'Delete Task'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

