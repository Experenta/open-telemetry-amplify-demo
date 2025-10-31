import { MainLayout } from "@/components/layout/MainLayout";
import { getProjectById } from "@/actions/projects";
import { getTasksByProjectId } from "@/actions/tasks";
import { getCurrentUserAction } from "@/actions/auth";
import { redirect, notFound } from "next/navigation";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { TasksList } from "@/components/tasks/TasksList";
import { CreateTaskDialog } from "@/components/tasks/CreateTaskDialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function ProjectDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { isAuthenticated } = await getCurrentUserAction();

	if (!isAuthenticated) {
		redirect("/auth/sign-in");
	}
	const id = (await params).id;

	const { project } = await getProjectById(id);

	if (!project) {
		notFound();
	}

	const { tasks } = await getTasksByProjectId(id);

	return (
		<MainLayout>
			<div className="space-y-6">
				<ProjectHeader project={project} />

				<div className="flex items-center justify-between">
					<h2 className="text-2xl font-semibold">Tasks</h2>
					<CreateTaskDialog projectId={id}>
						<Button>
							<Plus className="h-4 w-4 mr-2" />
							New Task
						</Button>
					</CreateTaskDialog>
				</div>

				<TasksList tasks={tasks} projectId={id} />
			</div>
		</MainLayout>
	);
}
