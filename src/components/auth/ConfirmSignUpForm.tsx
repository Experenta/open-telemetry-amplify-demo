"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmSignUp } from "aws-amplify/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function ConfirmSignUpForm({ email }: { email?: string }) {
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsLoading(true);

		const formData = new FormData(event.currentTarget);
		const emailValue = formData.get("email") as string;
		const code = formData.get("code") as string;

		try {
			await confirmSignUp({
				username: emailValue,
				confirmationCode: code,
			});

			toast.success("Account confirmed! You can now sign in.");
			router.push("/auth/sign-in");
		} catch (error: unknown) {
			console.error("Confirmation error:", error);
			toast.error(
				(error as Error).message || "Failed to confirm account"
			);
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="email">Email</Label>
				<Input
					id="email"
					name="email"
					type="email"
					defaultValue={email}
					placeholder="john@example.com"
					required
					disabled={isLoading}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="code">Confirmation Code</Label>
				<Input
					id="code"
					name="code"
					type="text"
					placeholder="123456"
					required
					disabled={isLoading}
				/>
				<p className="text-xs text-gray-500">
					Enter the 6-digit code sent to your email
				</p>
			</div>
			<Button type="submit" className="w-full" disabled={isLoading}>
				{isLoading ? "Confirming..." : "Confirm account"}
			</Button>
		</form>
	);
}
