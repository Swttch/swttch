# Catalog

Status: Implemented
Last verified: 2026-10-04 on branch `feat/prompt-library-reorder` (PR #519, not yet merged)

The tables of the entity system. Each row of this index points at the code that owns the table. What a table's columns mean is in its entity class; how a feature uses it is in that feature's documentation.

| Table | Domain | What it holds | Owner |
|---|---|---|---|
| `table_metadatas` | `system` | Last id, counts and layout version of every table | `system/TableMetadata.entity.ts` |
| `system_migrations` | `system` | The migrations that have run (an existing name; an exception to the naming rule) | `system/SystemMigration.entity.ts` |
| `unread_folders` | `system` | The folders whose old files a migration could not read, kept until the program has read them | `system/UnreadFolder.entity.ts`; `migration/UnreadFolderRetry.ts` |
| `projects` | `project` | Every working directory the program knows, with its session counts, pin, alias, note and whether the user removed it from the list | `project/Project.entity.ts`; `features/getProjectsList.ts`, `features/syncProjectsList.ts`, `features/projectPreferences.ts` |
| `prompt_items` | `prompt` | Saved prompts of the prompt library | `prompt/PromptItem.entity.ts`; `docs/features/064-prompt_library/` |
| `prompt_categories` | `prompt` | Prompt categories, shared by every project | `prompt/PromptCategory.entity.ts` |
| `prompt_category_item_links` | `prompt` | Which prompt sits in which category, and its place there | `prompt/PromptCategoryItemLink.entity.ts` |

When you add a table, add a row here.
