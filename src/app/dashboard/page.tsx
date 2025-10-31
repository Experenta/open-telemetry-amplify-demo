import { MainLayout } from '@/components/layout/MainLayout';
import { getCurrentUserAction } from '@/actions/auth';
import { redirect } from 'next/navigation';
import { getProjects } from '@/actions/projects';
import { getAllTasks } from '@/actions/tasks';
import { getAllSubtasks } from '@/actions/subtasks';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { TaskStatusChart } from '@/components/dashboard/TaskStatusChart';
import { ProjectProgressChart } from '@/components/dashboard/ProjectProgressChart';
import { ProductivityTrend } from '@/components/dashboard/ProductivityTrend';

export default async function DashboardPage() {
  const { isAuthenticated } = await getCurrentUserAction();

  if (!isAuthenticated) {
    redirect('/auth/sign-in');
  }

  const [projectsResult, tasksResult, subtasksResult] = await Promise.all([
    getProjects(),
    getAllTasks(),
    getAllSubtasks(),
  ]);

  const projects = projectsResult.projects || [];
  const tasks = tasksResult.tasks || [];
  const subtasks = subtasksResult.subtasks || [];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Track your productivity and project progress
          </p>
        </div>

        <DashboardStats
          projects={projects}
          tasks={tasks}
          subtasks={subtasks}
        />

        <div className="grid gap-6 md:grid-cols-2">
          <TaskStatusChart tasks={tasks} />
          <ProjectProgressChart projects={projects} />
        </div>

        <ProductivityTrend tasks={tasks} />
      </div>
    </MainLayout>
  );
}

