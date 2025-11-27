import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * Define the data schema for a project management application
 * with Projects, Tasks, and Subtasks
 */
const schema = a.schema({
	Project: a
		.model({
			name: a.string().required(),
			description: a.string(),
			status: a.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]),
			createdAt: a.datetime(),
			updatedAt: a.datetime(),
			tasks: a.hasMany("Task", "projectId"),
		})
		.authorization((allow) => [allow.owner()]),

	Task: a
		.model({
			title: a.string().required(),
			description: a.string(),
			status: a.enum(["TODO", "IN_PROGRESS", "COMPLETED"]),
			priority: a.enum(["LOW", "MEDIUM", "HIGH"]),
			dueDate: a.datetime(),
			createdAt: a.datetime(),
			updatedAt: a.datetime(),
			projectId: a.id().required(),
			project: a.belongsTo("Project", "projectId"),
			subtasks: a.hasMany("Subtask", "taskId"),
		})
		.authorization((allow) => [allow.owner()]),

	Subtask: a
		.model({
			title: a.string().required(),
			isCompleted: a.boolean().default(false),
			createdAt: a.datetime(),
			updatedAt: a.datetime(),
			taskId: a.id().required(),
			task: a.belongsTo("Task", "taskId"),
		})
		.authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
	schema,
	authorizationModes: {
		defaultAuthorizationMode: "userPool",
	},
});
