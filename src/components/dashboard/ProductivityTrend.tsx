'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { Schema } from '@/amplify/data/resource';
import { format, subDays, startOfDay } from 'date-fns';

type Task = Schema['Task']['type'];

interface ProductivityTrendProps {
  tasks: Task[];
}

export function ProductivityTrend({ tasks }: ProductivityTrendProps) {
  // Generate data for the last 7 days
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));

  const data = days.map((day) => {
    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    // Count tasks created on this day
    const createdCount = tasks.filter((task) => {
      if (!task.createdAt) return false;
      const taskDate = new Date(task.createdAt);
      return taskDate >= dayStart && taskDate <= dayEnd;
    }).length;

    // Count tasks completed on this day
    const completedCount = tasks.filter((task) => {
      if (!task.updatedAt || task.status !== 'COMPLETED') return false;
      const taskDate = new Date(task.updatedAt);
      return taskDate >= dayStart && taskDate <= dayEnd;
    }).length;

    return {
      date: format(day, 'MMM dd'),
      created: createdCount,
      completed: completedCount,
    };
  });

  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>7-Day Productivity Trend</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-gray-500">No task activity to display</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>7-Day Productivity Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="created"
              stroke="#60A5FA"
              strokeWidth={2}
              name="Tasks Created"
            />
            <Line
              type="monotone"
              dataKey="completed"
              stroke="#34D399"
              strokeWidth={2}
              name="Tasks Completed"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

