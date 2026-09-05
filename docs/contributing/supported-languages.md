# Supported languages

OpenRigor UI locales: **en**, **de**, **fr**, **es**, **it**. Default is `en`.
The locale cookie is `NEXT_LOCALE`. Assignment content language uses the same
registry codes.

## Add a language

1. **LOCALES registry** — `apps/web/src/lib/i18n/locales.ts` (`code` + native
   `label`). Shared content-language list: `packages/shared/src/language.ts`
   (`LANGUAGE_LOCALES` + `LANGUAGE_DIRECTIVES`).
2. **Messages catalog** — add `apps/web/messages/<code>.json` (copy `en.json`,
   translate values). `apps/web/src/i18n/request.ts` loads it.
3. **BlockNote dictionary** — `apps/web/src/lib/i18n/blocknote-locale.ts`
   (`BLOCKNOTE_LOCALE_BY_APP_LOCALE`). Unmapped codes fall back to `en`.
4. **Language directive** — map the code in `LANGUAGE_DIRECTIVES` so coaches
   reply in that language. Agents re-export
   `apps/agents/src/open-canvas/language-directive.ts`.

The settings language switcher and compact header menu read the registry; do
not hardcode labels in assignment pickers or badges.
