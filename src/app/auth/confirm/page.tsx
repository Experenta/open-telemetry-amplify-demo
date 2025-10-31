import { ConfirmSignUpForm } from "@/components/auth/ConfirmSignUpForm";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default async function ConfirmSignUpPage({
	searchParams,
}: {
	searchParams: Promise<{ email?: string }>;
}) {
	const { email } = await searchParams;
	return (
		<div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Confirm your account</CardTitle>
					<CardDescription>
						Enter the confirmation code sent to your email
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConfirmSignUpForm email={email} />
				</CardContent>
			</Card>
		</div>
	);
}
