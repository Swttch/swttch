import { useMemo, useState } from 'react';
import { Combobox, createListCollection } from '@ark-ui/react/combobox';
import { Portal } from '@ark-ui/react/portal';
import { CheckIcon, ChevronDownIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import type { PromptCategory } from '@/types/prompt';

/** The id the "create what I typed" row carries, which is never a real id. */
export const CREATE_OPTION = '__create__';

/**
 * Case-insensitive name match, the same rule the backend registry dedupes by.
 *
 * It is what decides whether the typed text is a new category or one that
 * already exists, so it has to agree with the side that will refuse to make a
 * second "Review" next to "review".
 */
export function findByName(
  categories: PromptCategory[],
  name: string,
): PromptCategory | undefined {
  const wanted = name.trim().toLowerCase();
  if (wanted === '') return undefined;
  return categories.find((category) => category.name.toLowerCase() === wanted);
}

/** Whether typing [query] should offer to create a category by that name. */
export function shouldOfferCreate(categories: PromptCategory[], query: string): boolean {
  const trimmed = query.trim();
  if (trimmed === '') return false;
  return findByName(categories, trimmed) === undefined;
}

/**
 * The rows the menu offers for [query]: the matching categories, then the
 * create row when the typed name is not one of them.
 *
 * The create row is a real member of this list, not something drawn beside it.
 * Selecting with Enter resolves the highlighted row THROUGH the collection, so
 * a row that is drawn but not collected cannot be resolved — Enter cleared the
 * box and made nothing, while clicking the same row worked, because a click is
 * handled by the row itself and never asks the collection.
 */
export function buildCategoryItems(
  categories: PromptCategory[],
  query: string,
): PromptCategory[] {
  const wanted = query.trim().toLowerCase();
  const matching =
    wanted === ''
      ? categories
      : categories.filter((category) => category.name.toLowerCase().includes(wanted));
  return shouldOfferCreate(categories, query)
    ? [...matching, { id: CREATE_OPTION, name: query.trim(), createdAt: 0 }]
    : matching;
}

/**
 * Whether Backspace should take the last chip off instead of editing text.
 *
 * Only when there is no text left to edit. The library does not do this, so it
 * is ours: without it the only way to undo a pick is to reach for the X with
 * the mouse, which is a long way from the keyboard the chip was added with.
 */
export function backspaceRemovesLastChip(query: string, chosen: string[]): boolean {
  return query === '' && chosen.length > 0;
}

/**
 * The row Tab should move the highlight to, or null to let Tab leave the field.
 *
 * Tab walks the menu the way the down arrow does, because the row a user most
 * often wants is the create row and reaching for an arrow key mid-typing is a
 * detour. It only takes Tab while the menu is open with something in it —
 * otherwise Tab has to keep meaning "leave this field".
 */
export function highlightAfterTab(
  items: PromptCategory[],
  highlighted: string | null,
  backwards: boolean,
): string | null {
  if (items.length === 0) return null;
  const at = items.findIndex((item) => item.id === highlighted);
  if (at === -1) return backwards ? items[items.length - 1].id : items[0].id;
  const next = at + (backwards ? -1 : 1);
  // Past either end, Tab goes back to meaning "leave the field".
  if (next < 0 || next >= items.length) return null;
  return items[next].id;
}

/**
 * Whether Enter should create the typed name outright.
 *
 * True only when nothing in the menu is highlighted: with the caret sitting
 * after the text they just typed, the user means that text, and making them
 * arrow down onto a row that says the same thing back is a step for nothing.
 * Once a row IS highlighted, Enter belongs to that row.
 */
export function enterCreatesDirectly(
  items: PromptCategory[],
  highlighted: string | null,
): boolean {
  return highlighted === null && items.some((item) => item.id === CREATE_OPTION);
}

interface Props {
  categories: PromptCategory[];
  /** The ids this prompt is filed under. */
  value: string[];
  onChange: (ids: string[]) => void;
  /**
   * Make a category and hand back its id, or null if the name was refused.
   *
   * Creating from here is new. The old field was a row of toggles over the
   * categories that already existed, and the argument against typing was that
   * it would become a second way to create one, spelled differently each time.
   * A combobox answers that: it shows the matching names BEFORE it offers to
   * make one, so "Review" is found rather than typed again as "review".
   */
  onCreateCategory: (name: string) => Promise<string | null>;
}

/**
 * The category picker on the prompt form.
 *
 * A combobox with the chosen categories as chips, rather than the row of
 * toggles this used to be: toggles show every category at once, which reads
 * fine at three and becomes a wall at twenty, and they offer no way to narrow.
 *
 * Built on Ark UI, which is headless — every class here is ours, so the field
 * matches the name and content inputs above and below it instead of arriving
 * with a theme of its own.
 */
export function PromptCategoryField({ categories, value, onChange, onCreateCategory }: Props) {
  const { t } = useTranslation('common');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  /**
   * The highlighted row, held here rather than left to the library.
   *
   * Both of the keys below need to know whether anything is highlighted: Enter
   * creates outright only when nothing is, and Tab has to know where to move
   * the highlight from.
   */
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => categories.filter((category) => value.includes(category.id)),
    [categories, value],
  );

  /**
   * Everything the menu offers, built here rather than with `useListCollection`.
   *
   * Two reasons, both measured. The create row has to be a real member of the
   * collection (see {@link buildCategoryItems}), and `useListCollection` seeds
   * its items once, so a category made from this very field was filed on the
   * prompt while the menu below still had no row for it.
   */
  const items = useMemo(() => buildCategoryItems(categories, query), [categories, query]);

  const collection = useMemo(
    () =>
      createListCollection({
        items,
        itemToValue: (category: PromptCategory) => category.id,
        itemToString: (category: PromptCategory) => category.name,
      }),
    [items],
  );


  const handleValueChange = async (ids: string[], picked: PromptCategory[]) => {
    // The create row is not a category, so it never lands in the value. It is
    // an instruction: make this one, then file the prompt under what came back.
    if (ids.includes(CREATE_OPTION)) {
      // Read off the selected ITEM, not off `query`. Selecting clears the input
      // — `multiple` forces that behaviour — and on Enter the clear lands first,
      // so reading state here made the name empty and nothing was created.
      const name = (picked.find((item) => item.id === CREATE_OPTION)?.name ?? '').trim();
      setQuery('');
      if (name === '' || creating) return;
      setCreating(true);
      try {
        const id = await onCreateCategory(name);
        if (id !== null) onChange([...value.filter((existing) => existing !== CREATE_OPTION), id]);
      } finally {
        setCreating(false);
      }
      return;
    }
    onChange(ids);
  };

  const remove = (id: string) => onChange(value.filter((existing) => existing !== id));

  return (
    <Combobox.Root
      multiple
      // The menu stays open after a pick, because filing a prompt under two
      // categories is the ordinary case and reopening for the second one would
      // make the common path the slow one.
      closeOnSelect={false}
      collection={collection}
      value={value}
      onValueChange={(details) => void handleValueChange(details.value, details.items)}
      inputValue={query}
      onInputValueChange={(details) => setQuery(details.inputValue)}
      highlightedValue={highlighted}
      onHighlightChange={(details) => setHighlighted(details.highlightedValue)}
      onOpenChange={(details) => setOpen(details.open)}
      openOnClick
      className="block"
    >
      <Combobox.Label className="mb-1 block text-xs text-text-tertiary">
        {t('promptLibrary.categoryLabel')}
      </Combobox.Label>

      {/* The chips live inside the control, so the field reads as one box the
          way the name input above it does, rather than as a list with a box
          under it. */}
      <Combobox.Control className="flex w-full flex-wrap items-center gap-1 rounded-md border border-border-default bg-surface-base px-2 py-1.5 focus-within:border-border-focus">
        {selected.map((category) => (
          <span
            key={category.id}
            className="flex max-w-[12rem] items-center gap-1 rounded-full bg-accent-primary px-2 py-0.5 text-xs text-text-inverse"
          >
            <span className="truncate">{category.name}</span>
            <button
              type="button"
              onClick={() => remove(category.id)}
              title={t('promptLibrary.removeCategory', { name: category.name })}
              aria-label={t('promptLibrary.removeCategory', { name: category.name })}
              className="flex-shrink-0 rounded-full transition-opacity hover:opacity-70"
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Combobox.Input
          placeholder={selected.length === 0 ? t('promptLibrary.categoryPlaceholder') : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && backspaceRemovesLastChip(query, value)) {
              e.preventDefault();
              onChange(value.slice(0, -1));
              return;
            }
            if (e.key === 'Enter' && enterCreatesDirectly(items, highlighted)) {
              const row = items.find((item) => item.id === CREATE_OPTION);
              if (row) {
                e.preventDefault();
                void handleValueChange([CREATE_OPTION], [row]);
              }
              return;
            }
            if (e.key === 'Tab' && open) {
              const next = highlightAfterTab(items, highlighted, e.shiftKey);
              // Null means the walk ran off the end, so Tab goes back to being
              // the key that leaves the field.
              if (next === null) return;
              e.preventDefault();
              setHighlighted(next);
            }
          }}
          className="min-w-24 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-disabled focus:outline-none"
        />
        <Combobox.Trigger
          className="flex-shrink-0 text-text-tertiary transition-colors hover:text-text-primary"
          aria-label={t('promptLibrary.categoryLabel')}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </Combobox.Trigger>
      </Combobox.Control>

      {/* Portalled because the form scrolls: an absolutely positioned menu
          inside it would be clipped by the scroll container.

          The `!` on the z-index is load-bearing. Ark writes BOTH
          `z-index: var(--z-index)` and `--z-index: auto` into the positioner's
          own style attribute, and it replaces any `style` prop passed in, so
          neither `z-[60]` nor defining `--z-index` from a class could reach it:
          an inline declaration wins over both. The menu rendered in exactly the
          right place, underneath the modal. `!important` is what outranks an
          inline declaration, and the positioner sets `isolation: isolate`, so
          raising the Content instead would not escape it either. */}
      <Portal>
        <Combobox.Positioner className="!z-[60]">
          <Combobox.Content className="max-h-56 w-[var(--reference-width)] overflow-y-auto rounded-md border border-border-default bg-surface-overlay p-1 shadow-lg focus:outline-none">
            {collection.items.map((category) =>
              category.id === CREATE_OPTION ? (
                <Combobox.Item
                  key={category.id}
                  item={category}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-text-secondary data-[highlighted]:bg-surface-hover data-[highlighted]:text-text-primary"
                >
                  <PlusIcon className="h-3.5 w-3.5 flex-shrink-0" />
                  <Combobox.ItemText className="truncate">
                    {t('promptLibrary.createCategoryNamed', { name: category.name })}
                  </Combobox.ItemText>
                </Combobox.Item>
              ) : (
                <Combobox.Item
                  key={category.id}
                  item={category}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm text-text-secondary data-[highlighted]:bg-surface-hover data-[highlighted]:text-text-primary"
                >
                  <Combobox.ItemText className="truncate">{category.name}</Combobox.ItemText>
                  <Combobox.ItemIndicator className="flex-shrink-0 text-accent-primary">
                    <CheckIcon className="h-4 w-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              ),
            )}

            {/* Only reachable when the library has categories but none match and
                the box is empty, which is the moment after a pick clears it. */}
            {collection.items.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-text-tertiary">
                {categories.length === 0
                  ? t('promptLibrary.noCategoriesYet')
                  : t('promptLibrary.noCategoryMatch')}
              </p>
            )}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}
