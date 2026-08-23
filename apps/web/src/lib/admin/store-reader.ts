import { Client } from "@langchain/langgraph-sdk";
import { LANGGRAPH_API_URL } from "@/constants";

export type StoreItemLike = {
  key: string;
  value?: unknown;
  namespace?: string[];
};

export function createAdminStoreClient(): Client {
  return new Client({
    apiUrl: LANGGRAPH_API_URL,
    apiKey: process.env.LANGCHAIN_API_KEY,
  });
}

/** Read all items below a namespace prefix, including paginated results. */
export async function readAllStoreItems(
  namespacePrefix: string[],
  client = createAdminStoreClient()
): Promise<StoreItemLike[]> {
  const items: StoreItemLike[] = [];
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const response = await client.store.searchItems(namespacePrefix, {
      limit: pageSize,
      offset,
    });
    const page = Array.isArray(response)
      ? response
      : Array.isArray(response?.items)
        ? response.items
        : [];
    items.push(...(page as StoreItemLike[]));
    if (page.length < pageSize) return items;
    offset += page.length;
  }
}
