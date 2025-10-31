'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { Schema } from '@/amplify/data/resource';

type Project = Schema['Project']['type'];

interface ProjectsListProps {
  projects: Project[];
}

const statusColors = {
  ACTIVE: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-blue-100 text-blue-800',
  ARCHIVED: 'bg-gray-100 text-gray-800',
};

export function ProjectsList({ projects }: ProjectsListProps) {
  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-gray-500 text-center">
            No projects yet. Create your first project to get started!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <Link key={project.id} href={`/projects/${project.id}`}>
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-xl">{project.name}</CardTitle>
                <Badge className={statusColors[project.status || 'ACTIVE']}>
                  {project.status || 'ACTIVE'}
                </Badge>
              </div>
              {project.description && (
                <CardDescription className="line-clamp-2">
                  {project.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Created{' '}
                {project.createdAt
                  ? formatDistanceToNow(new Date(project.createdAt), {
                      addSuffix: true,
                    })
                  : 'recently'}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

