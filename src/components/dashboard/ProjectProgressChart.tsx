'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import type { Schema } from '@/amplify/data/resource';

type Project = Schema['Project']['type'];

interface ProjectProgressChartProps {
  projects: Project[];
}

export function ProjectProgressChart({ projects }: ProjectProgressChartProps) {
  const statusCounts = {
    ACTIVE: projects.filter((p) => p.status === 'ACTIVE').length,
    COMPLETED: projects.filter((p) => p.status === 'COMPLETED').length,
    ARCHIVED: projects.filter((p) => p.status === 'ARCHIVED').length,
  };

  const data = [
    { name: 'Active', count: statusCounts.ACTIVE, fill: '#34D399' },
    { name: 'Completed', count: statusCounts.COMPLETED, fill: '#60A5FA' },
    { name: 'Archived', count: statusCounts.ARCHIVED, fill: '#9CA3AF' },
  ];

  if (projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Project Status Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-gray-500">No projects to display</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Status Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" name="Projects" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

