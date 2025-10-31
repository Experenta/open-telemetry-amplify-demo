import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { BarChart3, CheckSquare, FolderKanban } from "lucide-react";
import Link from "next/link";
import { getCurrentUserAction } from "@/actions/auth";
import { redirect } from "next/navigation";

export default async function Home() {
	const { isAuthenticated } = await getCurrentUserAction();

	if (isAuthenticated) {
		redirect("/projects");
	}

	return (
		<MainLayout>
			<div className="min-h-[80vh] flex flex-col items-center justify-center">
				<div className="text-center space-y-6 max-w-3xl mx-auto">
					<h1 className="text-5xl font-bold tracking-tight">
						Welcome to ProjectHub
					</h1>
					<p className="text-xl text-gray-600">
						Manage your projects, tasks, and subtasks efficiently
						with real-time tracking and analytics.
					</p>
					<div className="flex items-center justify-center space-x-4 pt-4">
						<Link href="/auth/sign-up">
							<Button size="lg">Get Started</Button>
						</Link>
						<Link href="/auth/sign-in">
							<Button size="lg" variant="outline">
								Sign In
							</Button>
						</Link>
					</div>
				</div>

				<div className="grid md:grid-cols-3 gap-6 mt-16 w-full max-w-5xl">
					<Card>
						<CardHeader>
							<FolderKanban className="h-10 w-10 text-blue-500 mb-2" />
							<CardTitle>Project Management</CardTitle>
						</CardHeader>
						<CardContent>
							<CardDescription>
								Create and organize projects with detailed
								descriptions and status tracking.
							</CardDescription>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CheckSquare className="h-10 w-10 text-green-500 mb-2" />
							<CardTitle>Task Tracking</CardTitle>
						</CardHeader>
						<CardContent>
							<CardDescription>
								Break down projects into tasks and subtasks with
								priorities and due dates.
							</CardDescription>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<BarChart3 className="h-10 w-10 text-purple-500 mb-2" />
							<CardTitle>Analytics Dashboard</CardTitle>
						</CardHeader>
						<CardContent>
							<CardDescription>
								Track your productivity with comprehensive
								metrics and visual charts.
							</CardDescription>
						</CardContent>
					</Card>
				</div>
			</div>
		</MainLayout>
	);
}
