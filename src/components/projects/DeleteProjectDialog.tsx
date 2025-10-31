'use client';

import { useState } from 'react';
import { deleteProject } from '@/actions/projects';
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

type Project = Schema['Project']['type'];

interface DeleteProjectDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
}: DeleteProjectDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function onDelete() {
    setIsLoading(true);

    const result = await deleteProject(project.id);

    setIsLoading(false);

    if (result.success) {
      toast.success('Project deleted successfully!');
      onOpenChange(false);
      router.push('/projects');
    } else {
      toast.error(result.error || 'Failed to delete project');
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the project &quot;{project.name}&quot; and all
            associated tasks and subtasks. This action cannot be undone.
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
            {isLoading ? 'Deleting...' : 'Delete Project'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

