import { z } from "zod";
import { ResearchRepositoryWorkspaceItemSchema as SharedResearchRepositoryWorkspaceItemSchema } from "@opencanvas/shared/research-repository";

export const MethodHostInitializationFailureReasonSchema = z.enum([
  "methods_directory_missing",
  "methods_index_missing",
]);

export type MethodHostInitializationFailureReason = z.infer<
  typeof MethodHostInitializationFailureReasonSchema
>;

const ResearchRepositoryBindingSchema =
  SharedResearchRepositoryWorkspaceItemSchema.shape.binding.extend({
    initialized: z.boolean().default(false),
    initializationFailureReason:
      MethodHostInitializationFailureReasonSchema.optional(),
  });

/**
 * Web-owned extension of the shared repository binding. Keeping Method-host
 * state here avoids widening the repository/seal wire contracts.
 */
export const ResearchRepositoryWorkspaceItemSchema =
  SharedResearchRepositoryWorkspaceItemSchema.extend({
    binding: ResearchRepositoryBindingSchema,
  });

export type ResearchRepositoryWorkspaceItem = z.infer<
  typeof ResearchRepositoryWorkspaceItemSchema
>;

export type MethodHostInitialization =
  | { initialized: true; initializationFailureReason?: never }
  | {
      initialized: false;
      initializationFailureReason: MethodHostInitializationFailureReason;
    };
