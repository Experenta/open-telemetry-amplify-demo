import { generateServerClientUsingCookies } from "@aws-amplify/adapter-nextjs/data";
import { cookies } from "next/headers";
import outputs from "../../amplify_outputs.json";
import type { Schema } from "../amplify/data/resource";

export const cookieBasedClient = generateServerClientUsingCookies<Schema>({
	config: outputs,
	cookies,
});
