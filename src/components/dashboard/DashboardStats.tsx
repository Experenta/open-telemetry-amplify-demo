'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderKanban, ListTodo, CheckCircle2, TrendingUp } from 'lucide-react';
import type { Schema } from '@/amplify/data/resource';

type Project = Schema['Project']['type'];
type Task = Schema['Task']['type'];
type Subtask = Schema['Subtask']['type'];

interface DashboardStatsProps {
  projects: Project[];
  tasks: Task[];
  subtasks: Subtask[];
}

export function DashboardStats({ projects, tasks, subtasks }: DashboardStatsProps) {
  const activeProjects = projects.filter((p) => p.status === 'ACTIVE').length;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const completedSubtasks = subtasks.filter((s) => s.isCompleted).length;
  const totalSubtasks = subtasks.length;

  // Calculate productivity index (0-100)
  const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const subtaskCompletionRate = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;
  const productivityIndex = Math.round((taskCompletionRate + subtaskCompletionRate) / 2);

  const stats = [
    {
      title: 'Active Projects',
      value: activeProjects,
      icon: FolderKanban,
      color: 'text-blue-600',
    },
    {
      title: 'Total Tasks',
      value: totalTasks,
      icon: ListTodo,
      color: 'text-purple-600',
    },
    {
      title: 'Completed Tasks',
      value: `${completedTasks}/${totalTasks}`,
      icon: CheckCircle2,
      color: 'text-green-600',
    },
    {
      title: 'Productivity Index',
      value: `${productivityIndex}%`,
      icon: TrendingUp,
      color: 'text-orange-600',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <Icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

