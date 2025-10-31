'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Edit, Trash2 } from 'lucide-react';
import type { Schema } from '@/amplify/data/resource';
import { getSubtasksByTaskId } from '@/actions/subtasks';
import { SubtasksList } from '../subtasks/SubtasksList';
import { CreateSubtaskDialog } from '../subtasks/CreateSubtaskDialog';
import { EditTaskDialog } from './EditTaskDialog';
import { DeleteTaskDialog } from './DeleteTaskDialog';
import { formatDistanceToNow } from 'date-fns';

type Task = Schema['Task']['type'];
type Subtask = Schema['Subtask']['type'];

const priorityColors = {
  LOW: 'bg-gray-100 text-gray-800',
  MEDIUM: 'bg-orange-100 text-orange-800',
  HIGH: 'bg-red-100 text-red-800',
};

interface TaskItemProps {
  task: Task;
  projectId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function TaskItem({ task, projectId, isExpanded, onToggleExpand }: TaskItemProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [isLoadingSubtasks, setIsLoadingSubtasks] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (isExpanded && subtasks.length === 0) {
      loadSubtasks();
    }
  }, [isExpanded]);

  async function loadSubtasks() {
    setIsLoadingSubtasks(true);
    const result = await getSubtasksByTaskId(task.id);
    if (result.success) {
      setSubtasks(result.subtasks);
    }
    setIsLoadingSubtasks(false);
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={onToggleExpand}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                <CardTitle className="text-base">{task.title}</CardTitle>
              </div>
              {task.priority && (
                <Badge
                  className={`${priorityColors[task.priority]} mt-2 ml-8`}
                  variant="outline"
                >
                  {task.priority}
                </Badge>
              )}
            </div>
            <div className="flex space-x-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowEditDialog(true)}
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        {(task.description || task.dueDate || isExpanded) && (
          <CardContent className="pt-0 space-y-3">
            {task.description && (
              <p className="text-sm text-gray-600">{task.description}</p>
            )}
            {task.dueDate && (
              <p className="text-xs text-gray-500">
                Due{' '}
                {formatDistanceToNow(new Date(task.dueDate), {
                  addSuffix: true,
                })}
              </p>
            )}
            {isExpanded && (
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Subtasks</span>
                  <CreateSubtaskDialog
                    taskId={task.id}
                    projectId={projectId}
                    onSuccess={loadSubtasks}
                  >
                    <Button variant="outline" size="sm">
                      Add Subtask
                    </Button>
                  </CreateSubtaskDialog>
                </div>
                {isLoadingSubtasks ? (
                  <p className="text-sm text-gray-500">Loading subtasks...</p>
                ) : (
                  <SubtasksList
                    subtasks={subtasks}
                    projectId={projectId}
                    onUpdate={loadSubtasks}
                  />
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <EditTaskDialog
        task={task}
        projectId={projectId}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />
      <DeleteTaskDialog
        task={task}
        projectId={projectId}
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      />
    </>
  );
}

