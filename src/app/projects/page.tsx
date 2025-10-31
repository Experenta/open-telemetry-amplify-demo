import { MainLayout } from '@/components/layout/MainLayout';
import { getProjects } from '@/actions/projects';
import { getCurrentUserAction } from '@/actions/auth';
import { redirect } from 'next/navigation';
import { ProjectsList } from '@/components/projects/ProjectsList';
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default async function ProjectsPage() {
  const { isAuthenticated } = await getCurrentUserAction();

  if (!isAuthenticated) {
    redirect('/auth/sign-in');
  }

  const { projects } = await getProjects();

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-gray-600 mt-1">
              Manage and organize your projects
            </p>
          </div>
          <CreateProjectDialog>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </CreateProjectDialog>
        </div>

        <ProjectsList projects={projects} />
      </div>
    </MainLayout>
  );
}

