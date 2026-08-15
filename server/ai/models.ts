/**
 * Registry of supported summarization models.
 *
 * All are free-plan text-generation models on Workers AI (no paid billing
 * method required — verified against the model catalog + pricing 2026-08-16).
 */

export interface SummaryModel {
	/** Full Workers AI model id. */
	id: string;
	/** Human-readable label shown in the UI. */
	label: string;
	/** Maximum output tokens requested from the model. */
	maxTokens: number;
	/** Maximum input characters sent to the model. */
	maxInputChars: number;
}

export const SUMMARY_MODELS: Record<string, SummaryModel> = {
	"llama-3.1-8b-instruct-fp8-fast": {
		id: "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
		label: "Llama 3.1 8B",
		maxTokens: 400,
		maxInputChars: 12_000,
	},
	"llama-3.2-3b-instruct": {
		id: "@cf/meta/llama-3.2-3b-instruct",
		label: "Llama 3.2 3B",
		maxTokens: 350,
		maxInputChars: 10_000,
	},
	"llama-3.2-1b-instruct": {
		id: "@cf/meta/llama-3.2-1b-instruct",
		label: "Llama 3.2 1B",
		maxTokens: 300,
		maxInputChars: 8_000,
	},
	"qwen3-30b-a3b-fp8": {
		id: "@cf/qwen/qwen3-30b-a3b-fp8",
		label: "Qwen3 30B (MoE)",
		maxTokens: 400,
		maxInputChars: 12_000,
	},
	"glm-4.7-flash": {
		id: "@cf/zai-org/glm-4.7-flash",
		label: "GLM-4.7 Flash",
		maxTokens: 400,
		maxInputChars: 14_000,
	},
};

export const DEFAULT_SUMMARY_MODEL = "llama-3.1-8b-instruct-fp8-fast";
