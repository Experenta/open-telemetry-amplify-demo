'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { Schema } from '@/amplify/data/resource';

type Task = Schema['Task']['type'];

interface TaskStatusChartProps {
  tasks: Task[];
}

const COLORS = {
  TODO: '#FCD34D',
  IN_PROGRESS: '#60A5FA',
  COMPLETED: '#34D399',
};

export function TaskStatusChart({ tasks }: TaskStatusChartProps) {
  const statusCounts = {
    TODO: tasks.filter((t) => t.status === 'TODO').length,
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    COMPLETED: tasks.filter((t) => t.status === 'COMPLETED').length,
  };

  const data = [
    { name: 'To Do', value: statusCounts.TODO, color: COLORS.TODO },
    { name: 'In Progress', value: statusCounts.IN_PROGRESS, color: COLORS.IN_PROGRESS },
    { name: 'Completed', value: statusCounts.COMPLETED, color: COLORS.COMPLETED },
  ].filter((item) => item.value > 0);

  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Task Status Distribution</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-gray-500">No tasks to display</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Task Status Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

