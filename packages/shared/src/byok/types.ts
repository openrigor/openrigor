export type ByokShareMode = "none" | "all_assignments" | "specific_items";

export interface UserByokSettingsRow {
  user_id: string;
  base_url: string;
  model: string;
  api_key_enc: string;
  enabled: boolean;
  share_mode: ByokShareMode;
  shared_item_ids: string[];
}

export interface ByokDecryptedSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
}
