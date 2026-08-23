import {
  ALL_MODEL_NAMES,
  DEFAULT_MODEL_CONFIG,
  DEFAULT_MODEL_NAME,
  OPENROUTER_DEFAULT_MODEL_NAME,
  OPENROUTER_MODELS,
} from "@opencanvas/shared/models";
import { CustomModelConfig } from "@opencanvas/shared/types";

export function isOpenRouterMode(): boolean {
  return process.env.NEXT_PUBLIC_OPENROUTER_ENABLED === "true";
}

export function getActiveDefaultModelName(): ALL_MODEL_NAMES {
  if (isOpenRouterMode()) {
    return OPENROUTER_DEFAULT_MODEL_NAME;
  }
  return DEFAULT_MODEL_NAME;
}

export function getActiveDefaultModelConfig(): CustomModelConfig {
  if (isOpenRouterMode()) {
    const model =
      OPENROUTER_MODELS.find((m) => m.name === OPENROUTER_DEFAULT_MODEL_NAME) ??
      OPENROUTER_MODELS[0];
    return {
      ...model.config,
      temperatureRange: { ...model.config.temperatureRange },
      maxTokens: { ...model.config.maxTokens },
    };
  }
  return {
    ...DEFAULT_MODEL_CONFIG,
    temperatureRange: { ...DEFAULT_MODEL_CONFIG.temperatureRange },
    maxTokens: { ...DEFAULT_MODEL_CONFIG.maxTokens },
  };
}
