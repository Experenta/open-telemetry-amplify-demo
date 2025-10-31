'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Schema } from '@/amplify/data/resource';
import { TaskItem } from './TaskItem';
import { useState } from 'react';

type Task = Schema['Task']['type'];

interface TasksListProps {
  tasks: Task[];
  projectId: string;
}

const statusColors = {
  TODO: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
};

const priorityColors = {
  LOW: 'bg-gray-100 text-gray-800',
  MEDIUM: 'bg-orange-100 text-orange-800',
  HIGH: 'bg-red-100 text-red-800',
};

export function TasksList({ tasks, projectId }: TasksListProps) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-gray-500 text-center">
            No tasks yet. Create your first task to get started!
          </p>
        </CardContent>
      </Card>
    );
  }

  const groupedTasks = {
    TODO: tasks.filter((t) => t.status === 'TODO'),
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS'),
    COMPLETED: tasks.filter((t) => t.status === 'COMPLETED'),
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {Object.entries(groupedTasks).map(([status, statusTasks]) => (
        <div key={status} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center">
              <Badge className={statusColors[status as keyof typeof statusColors]}>
                {status.replace('_', ' ')}
              </Badge>
              <span className="ml-2 text-gray-500">({statusTasks.length})</span>
            </h3>
          </div>
          <div className="space-y-3">
            {statusTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                projectId={projectId}
                isExpanded={expandedTaskId === task.id}
                onToggleExpand={() =>
                  setExpandedTaskId(
                    expandedTaskId === task.id ? null : task.id
                  )
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

