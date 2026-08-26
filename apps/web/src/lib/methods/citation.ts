export type MethodCitationMethod = {
  name?: string | null;
  version?: string | null;
  profiles?: ReadonlyArray<{ author?: string | null }> | null;
  publication_date?: string | null;
  publisher?: string | null;
  institution?: string | null;
};

type CitationFields = {
  author: string;
  title: string;
  version: string;
  year: string;
  publisher?: string;
};

function present(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function citationFields(
  method: MethodCitationMethod
): CitationFields | undefined {
  const author = present(method.profiles?.[0]?.author);
  const title = present(method.name);
  const version = present(method.version);
  const publicationDate = present(method.publication_date);
  const year = publicationDate?.match(/^(\d{4})/)?.[1];

  if (!author || !title || !version || !year) return undefined;

  return {
    author,
    title,
    version,
    year,
    publisher: present(method.institution) ?? present(method.publisher),
  };
}

function escapeBibtex(value: string): string {
  return value.replace(/[\\{}]/g, (character) => `\\${character}`);
}

function citationKey(author: string, year: string, version: string): string {
  const authorPart =
    author
      .split(/\s+/)
      .at(-1)
      ?.replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase() || "method";
  const versionPart = version.replace(/[^a-zA-Z0-9]+/g, "_");
  return `${authorPart}${year}_${versionPart}`;
}

export function generateBibtex(method: MethodCitationMethod): string | null {
  const fields = citationFields(method);
  if (!fields) return null;

  const institution = fields.publisher
    ? `\n  institution = {${escapeBibtex(fields.publisher)}},`
    : "";

  return `@techreport{${citationKey(fields.author, fields.year, fields.version)},
  author = {${escapeBibtex(fields.author)}},
  title = {${escapeBibtex(fields.title)}},
  year = {${fields.year}},${institution}
  number = {${escapeBibtex(fields.version)}}
}`;
}

export function generateApa(method: MethodCitationMethod): string | null {
  const fields = citationFields(method);
  if (!fields) return null;

  const publisher = fields.publisher ? ` ${fields.publisher}.` : "";
  return `${fields.author} (${fields.year}). ${fields.title} (${fields.version}).${publisher}`;
}
