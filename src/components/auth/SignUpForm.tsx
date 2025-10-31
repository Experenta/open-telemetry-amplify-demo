"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "aws-amplify/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function SignUpForm() {
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsLoading(true);

		const formData = new FormData(event.currentTarget);
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;
		const name = formData.get("name") as string;

		try {
			await signUp({
				username: email,
				password,
				options: {
					userAttributes: {
						email,
						name,
					},
				},
			});

			toast.success(
				"Account created! Please check your email for the confirmation code."
			);
			router.push(`/auth/confirm?email=${encodeURIComponent(email)}`);
		} catch (error: unknown) {
			console.error("Sign up error:", error);
			toast.error((error as Error).message || "Failed to create account");
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="name">Name</Label>
				<Input
					id="name"
					name="name"
					type="text"
					placeholder="John Doe"
					required
					disabled={isLoading}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="email">Email</Label>
				<Input
					id="email"
					name="email"
					type="email"
					placeholder="john@example.com"
					required
					disabled={isLoading}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="password">Password</Label>
				<Input
					id="password"
					name="password"
					type="password"
					placeholder="••••••••"
					required
					minLength={8}
					disabled={isLoading}
				/>
				<p className="text-xs text-gray-500">
					Password must be at least 8 characters long
				</p>
			</div>
			<Button type="submit" className="w-full" disabled={isLoading}>
				{isLoading ? "Creating account..." : "Create account"}
			</Button>
		</form>
	);
}
