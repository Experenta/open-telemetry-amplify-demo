"use client";

import { useState } from "react";
import { createSubtask } from "@/actions/subtasks";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface CreateSubtaskDialogProps {
	taskId: string;
	projectId: string;
	onSuccess: () => void;
	children: React.ReactNode;
}

export function CreateSubtaskDialog({
	taskId,
	projectId,
	onSuccess,
	children,
}: CreateSubtaskDialogProps) {
	const [open, setOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsLoading(true);

		const formData = new FormData(event.currentTarget);
		formData.append("taskId", taskId);
		formData.append("projectId", projectId);

		const result = await createSubtask(formData);

		setIsLoading(false);

		if (result.success) {
			toast.success("Subtask created successfully!");
			setOpen(false);
			onSuccess();
		} else {
			toast.error(result.error || "Failed to create subtask");
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Subtask</DialogTitle>
					<DialogDescription>
						Add a new subtask to this task
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="title">Subtask Title</Label>
						<Input
							id="title"
							name="title"
							placeholder="Subtask title"
							required
							disabled={isLoading}
							autoFocus
						/>
					</div>
					<div className="flex justify-end space-x-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
							disabled={isLoading}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isLoading}>
							{isLoading ? "Creating..." : "Create Subtask"}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
