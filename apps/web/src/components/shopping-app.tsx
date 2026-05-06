"use client";

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { ShoppingItemDto, ShoppingListDto, WorkspaceSummary } from "@/types/app";

import { canonicalizeItemName } from "@/lib/item-normalization";

import styles from "./shopping-app.module.css";

type Props = {
  workspace: WorkspaceSummary;
  initialLists: ShoppingListDto[];
};

type EditingState = {
  id: string;
  name: string;
  amount: string;
  unit: string;
};

type MergeNotice = {
  id: string;
  title: string;
  quantity: string | null;
  mergedFrom: string;
};

type SelectOption = {
  value: string;
  label: string;
};

const UNIT_OPTIONS: SelectOption[] = [
  { value: "", label: "Ед." },
  { value: "г", label: "г" },
  { value: "гр", label: "гр" },
  { value: "кг", label: "кг" },
  { value: "мл", label: "мл" },
  { value: "л", label: "л" },
  { value: "шт", label: "шт" },
  { value: "уп", label: "уп" },
];

export function ShoppingApp({ workspace, initialLists }: Props) {
  const [lists, setLists] = useState<ShoppingListDto[]>(initialLists);
  const [activeListId, setActiveListId] = useState<string>(initialLists[0]?.id ?? "");
  const [itemName, setItemName] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemUnit, setItemUnit] = useState("");
  const [newListTitle, setNewListTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<EditingState | null>(null);
  const [isRenamingList, setIsRenamingList] = useState(false);
  const [renameListTitle, setRenameListTitle] = useState("");
  const [mergeNotices, setMergeNotices] = useState<MergeNotice[]>([]);

  const activeList = useMemo(
    () => lists.find((list) => list.id === activeListId) ?? lists[0] ?? null,
    [activeListId, lists],
  );

  const loadLists = useCallback(async () => {
    const res = await fetch(`/api/lists?workspaceId=${workspace.id}`);
    if (!res.ok) {
      throw new Error("Cannot load lists");
    }

    const data = await res.json();
    setLists(data.lists);
    if (!activeListId && data.lists[0]?.id) {
      setActiveListId(data.lists[0].id);
    }
  }, [workspace.id, activeListId]);

  useEffect(() => {
    const root = document.documentElement;
    const savedTheme = localStorage.getItem("shop_theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      root.dataset.theme = savedTheme;
      return;
    }
    root.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadLists().catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [loadLists]);

  const allItems = useMemo(() => activeList?.items ?? [], [activeList]);
  const pendingItems = useMemo(() => allItems.filter((item) => !item.isBought), [allItems]);
  const boughtItems = useMemo(() => allItems.filter((item) => item.isBought), [allItems]);

  async function submitStructuredItem(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!activeList || !itemName.trim()) return;

    setLoading(true);
    setError(null);

    let parsedName = itemName.trim();
    let amount = itemAmount.trim();
    let unit = itemUnit.trim();

    if (!amount && !unit) {
      const parsed = parseNameAndQuantity(parsedName);
      parsedName = parsed.name;
      amount = parsed.amount;
      unit = parsed.unit;
    }

    if (!amount && !unit) {
      const fallback = inferDefaultQuantity(parsedName);
      amount = fallback.amount;
      unit = fallback.unit;
    }

    const quantity = [amount, unit].filter(Boolean).join(" ").trim();

    const res = await fetch(`/api/lists/${activeList.id}/items/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            originalText: parsedName,
            normalizedName: parsedName.toLowerCase(),
            canonicalName: canonicalizeItemName(parsedName),
            quantity: quantity || null,
          },
        ],
      }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Не удалось добавить товар");
      return;
    }

    const data = await res.json();
    setMergeNotices(data.mergedItems ?? []);
    setItemName("");
    setItemAmount("");
    setItemUnit("");
    await loadLists();
  }

  async function createList() {
    if (!newListTitle.trim()) return;

    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, title: newListTitle }),
    });

    if (!res.ok) {
      setError("Не удалось создать список");
      return;
    }

    setNewListTitle("");
    await loadLists();
  }

  async function renameActiveList() {
    if (!activeList || !renameListTitle.trim()) return;

    const res = await fetch(`/api/lists/${activeList.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameListTitle.trim() }),
    });

    if (!res.ok) {
      setError("Не удалось переименовать список");
      return;
    }

    setIsRenamingList(false);
    await loadLists();
  }

  async function deleteActiveList() {
    if (!activeList) return;
    if (!window.confirm(`Удалить список "${activeList.title}"?`)) return;

    const res = await fetch(`/api/lists/${activeList.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Не удалось удалить список");
      return;
    }

    setActiveListId("");
    await loadLists();
  }

  async function updateItem(itemId: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      setError("Не удалось обновить товар");
      return;
    }

    await loadLists();
  }

  async function removeItem(itemId: string) {
    const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Не удалось удалить товар");
      return;
    }

    await loadLists();
  }

  async function saveEditedItem() {
    if (!editingItem) return;

    const quantity = [editingItem.amount.trim(), editingItem.unit.trim()].filter(Boolean).join(" ").trim();
    await updateItem(editingItem.id, {
      originalText: editingItem.name.trim(),
      normalizedName: editingItem.name.trim().toLowerCase(),
      quantity: quantity || null,
    });
    setEditingItem(null);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("shop_theme", nextTheme);
  }

  return (
    <div className={styles.desktopShell}>
      <div className={styles.phoneFrame}>
        <header className={styles.topBar}>
          <div className={styles.workspaceBadge}>
            <span className={styles.workspaceDot} />
            <div>
              <strong>{workspace.name}</strong>
              <span>{pendingItems.length} в покупке</span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button onClick={toggleTheme} className={styles.iconButton} aria-label="Переключить тему">
              <ThemeIcon />
            </button>
            <button onClick={logout} className={styles.iconButton} aria-label="Выйти">
              <LogoutIcon />
            </button>
          </div>
        </header>

        <section className={styles.statsRow}>
          <article className={styles.statCard}>
            <span>Всего</span>
            <strong>{allItems.length}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Нужно купить</span>
            <strong>{pendingItems.length}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Куплено</span>
            <strong>{boughtItems.length}</strong>
          </article>
        </section>

        <div className={styles.appGrid}>
          <aside className={styles.listsColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.panelKicker}>Списки</span>
                  <h2>Переключение и управление</h2>
                </div>
              </div>

              <section className={styles.listChips}>
                {lists.map((list) => (
                  <button
                    key={list.id}
                    className={list.id === activeList?.id ? styles.tabActive : styles.tab}
                    onClick={() => setActiveListId(list.id)}
                  >
                    {list.title}
                  </button>
                ))}
              </section>

              <div className={styles.topActions}>
                <input
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                  placeholder="Новый список"
                />
                <button onClick={createList} disabled={loading}>Создать</button>
              </div>

              <div className={styles.inlineActions}>
                {!isRenamingList ? (
                  <button
                    className={styles.ghostButton}
                    onClick={() => {
                      if (!activeList) return;
                      setRenameListTitle(activeList.title);
                      setIsRenamingList(true);
                    }}
                  >
                    Переименовать
                  </button>
                ) : null}
                <button className={styles.dangerButton} onClick={deleteActiveList} disabled={!activeList}>
                  Удалить
                </button>
              </div>

              {isRenamingList ? (
                <form
                  className={styles.renameRow}
                  onSubmit={(event) => {
                    event.preventDefault();
                    renameActiveList().catch(() => undefined);
                  }}
                >
                  <input
                    value={renameListTitle}
                    onChange={(e) => setRenameListTitle(e.target.value)}
                    placeholder="Название списка"
                    required
                  />
                  <button className={styles.primaryMiniButton} type="submit">Сохранить</button>
                  <button type="button" className={styles.ghostButton} onClick={() => setIsRenamingList(false)}>
                    Отмена
                  </button>
                </form>
              ) : null}
            </section>
          </aside>

          <section className={styles.composerColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.panelKicker}>Добавить</span>
                  <h2>Новая покупка</h2>
                </div>
              </div>

              <form className={styles.composer} onSubmit={submitStructuredItem}>
                <input
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Фарш индейки 1 кг, молоко 2 л, хлеб..."
                  required
                />

                <div className={styles.composerRow}>
                  <input value={itemAmount} onChange={(e) => setItemAmount(e.target.value)} placeholder="Кол-во" />
                  <SelectField
                    value={itemUnit}
                    onChange={setItemUnit}
                    options={UNIT_OPTIONS}
                    placeholder="Ед."
                    ariaLabel="Единица измерения"
                  />
                </div>

                <button type="submit" disabled={loading || !activeList} className={styles.submitButton}>
                  Добавить
                </button>
              </form>

              {mergeNotices.length ? (
                <div className={styles.mergePanel}>
                  <div className={styles.mergeHeader}>
                    <MergeIcon />
                    <strong>Объединили похожие товары</strong>
                  </div>
                  {mergeNotices.map((notice) => (
                    <p key={`${notice.id}-${notice.mergedFrom}`}>
                      <span>{notice.mergedFrom}</span> добавлен к <strong>{notice.title}</strong>
                      {notice.quantity ? ` · ${notice.quantity}` : ""}
                    </p>
                  ))}
                </div>
              ) : null}
            </section>
          </section>

          <main className={styles.contentColumn}>
            <section className={styles.panel}>
              <div className={styles.contentHeader}>
                <div>
                  <span className={styles.panelKicker}>Список</span>
                  <h2>{activeList?.title ?? "Выберите список"}</h2>
                </div>
              </div>

              <div className={styles.card}>
                {pendingItems.length ? (
                  pendingItems.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onToggle={() => updateItem(item.id, { isBought: !item.isBought })}
                      onEdit={() =>
                        setEditingItem({
                          id: item.id,
                          name: item.originalText,
                          amount: parseAmount(item.quantity),
                          unit: parseUnit(item.quantity),
                        })
                      }
                      onDelete={() => removeItem(item.id)}
                    />
                  ))
                ) : (
                  <EmptyState text="Список пуст. Добавь первую покупку." />
                )}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.sectionHeading}>
                <h3>Уже куплено</h3>
                <span>{boughtItems.length}</span>
              </div>

              <div className={styles.card}>
                {boughtItems.length ? (
                  boughtItems.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onToggle={() => updateItem(item.id, { isBought: !item.isBought })}
                      onEdit={() =>
                        setEditingItem({
                          id: item.id,
                          name: item.originalText,
                          amount: parseAmount(item.quantity),
                          unit: parseUnit(item.quantity),
                        })
                      }
                      onDelete={() => removeItem(item.id)}
                    />
                  ))
                ) : (
                  <EmptyState text="Купленные товары пока не появились." />
                )}
              </div>
            </section>
          </main>
        </div>

        {editingItem ? (
          <div className={styles.sheetOverlay} onClick={() => setEditingItem(null)}>
            <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
              <h3>Редактировать товар</h3>
              <label>Название</label>
              <input
                value={editingItem.name}
                onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
              />
              <label>Количество</label>
              <input
                value={editingItem.amount}
                onChange={(e) => setEditingItem({ ...editingItem, amount: e.target.value })}
              />
              <label>Единица измерения</label>
              <SelectField
                value={editingItem.unit}
                onChange={(value) => setEditingItem({ ...editingItem, unit: value })}
                options={UNIT_OPTIONS}
                placeholder="Выберите"
                ariaLabel="Единица измерения товара"
              />
              <div className={styles.sheetActions}>
                <button
                  className={styles.dangerButton}
                  onClick={() => {
                    removeItem(editingItem.id).catch(() => undefined);
                    setEditingItem(null);
                  }}
                >
                  Удалить
                </button>
                <button type="button" className={styles.ghostButton} onClick={() => setEditingItem(null)}>
                  Отмена
                </button>
                <button type="button" className={styles.primaryMiniButton} onClick={saveEditedItem}>
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ShoppingItemDto;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.itemRow}>
      <button className={styles.checkbox} onClick={onToggle} aria-label="Переключить статус">
        {item.isBought ? <CheckIcon /> : null}
      </button>

      <div className={styles.itemMain}>
        <div className={styles.itemLine}>
          <div className={styles.itemContent}>
            <p>{item.originalText}</p>
            {item.quantity ? <small>{item.quantity}</small> : null}
          </div>

          <div className={styles.itemActions}>
            <button className={styles.iconTextButton} onClick={onEdit} aria-label="Изменить">
              <EditIcon />
            </button>
            <button className={styles.iconDangerButton} onClick={onDelete} aria-label="Удалить">
              <TrashIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  useEffect(() => {
    function handlePointer(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const selected = options.find((option) => option.value === value)?.label ?? placeholder;

  return (
    <div className={styles.selectRoot} ref={rootRef}>
      <button
        type="button"
        className={styles.selectTrigger}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
      >
        <span>{selected}</span>
        <ChevronIcon />
      </button>

      {open ? (
        <div className={styles.selectPopover} role="listbox" id={listId}>
          {options.map((option) => (
            <button
              type="button"
              key={option.value || "empty"}
              className={option.value === value ? styles.selectOptionActive : styles.selectOption}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className={styles.emptyState}>{text}</div>;
}

function ThemeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.iconSvg}>
      <path
        d="M12 3a1 1 0 0 1 1 1v1.2a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 14a5 5 0 1 0 0-10v10Zm8-6a1 1 0 0 1 1 1 9 9 0 1 1-9-9 1 1 0 0 1 0 2 7 7 0 1 0 7 7 1 1 0 0 1 1-1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.iconSvg}>
      <path
        d="M14 4a1 1 0 0 1 1-1h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3a1 1 0 1 1 0-2h3V5h-3a1 1 0 0 1-1-1Zm-9 8a1 1 0 0 1 1-1h8.6l-2.3-2.3a1 1 0 1 1 1.4-1.4l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 1 1-1.4-1.4l2.3-2.3H6a1 1 0 0 1-1-1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.checkSvg}>
      <path
        d="m7.8 13.2-3-3a1 1 0 0 1 1.4-1.4l1.6 1.6 5-5a1 1 0 0 1 1.4 1.4l-6.4 6.4a1 1 0 0 1-1.4 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.chevronSvg}>
      <path d="m5.8 7.8 4.2 4.2 4.2-4.2 1.4 1.4-5.6 5.6-5.6-5.6 1.4-1.4Z" fill="currentColor" />
    </svg>
  );
}

function MergeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.mergeSvg}>
      <path
        d="M7 5a1 1 0 0 1 1 1v4c0 1.7 1.3 3 3 3h6.6l-2.3-2.3a1 1 0 0 1 1.4-1.4l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4-1.4l2.3-2.3H11a5 5 0 0 1-5-5V6a1 1 0 0 1 1-1Zm10 14a1 1 0 0 1-1-1v-1a3 3 0 0 0-3-3H6a1 1 0 1 1 0-2h7a5 5 0 0 1 5 5v1a1 1 0 0 1-1 1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.rowIcon}>
      <path
        d="M14.8 2.8a2 2 0 0 1 2.8 2.8l-8.7 8.7-3.7.9.9-3.7 8.7-8.7Zm1.4 1.4a.5.5 0 0 0-.7 0l-1 1 1.4 1.4 1-1a.5.5 0 0 0 0-.7l-.7-.7ZM13.5 6.2l-6.3 6.3-.3 1.3 1.3-.3 6.3-6.3-1-1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.rowIcon}>
      <path
        d="M7.5 2.5h5a1 1 0 0 1 1 1V4H17a.75.75 0 0 1 0 1.5h-.8l-.7 9A2 2 0 0 1 13.5 16h-7a2 2 0 0 1-2-1.8l-.7-9H3a.75.75 0 0 1 0-1.5h3.5v-.5a1 1 0 0 1 1-1Zm4.5 1.5h-4v.5h4V4Zm-5.7 1.5.6 8.6a.5.5 0 0 0 .5.4h7a.5.5 0 0 0 .5-.4l.6-8.6H6.3Zm2 1.7a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0v-4a.75.75 0 0 1 .75-.75Zm3.4 0a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0v-4a.75.75 0 0 1 .75-.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function parseAmount(quantity: string | null): string {
  if (!quantity) return "";
  const match = quantity.match(/^\s*(\d+[.,]?\d*)/);
  return match ? match[1] : "";
}

function parseUnit(quantity: string | null): string {
  if (!quantity) return "";
  const amount = parseAmount(quantity);
  if (!amount) return quantity;
  return quantity.replace(amount, "").trim();
}

function parseNameAndQuantity(raw: string): { name: string; amount: string; unit: string } {
  const source = raw.trim();
  const match = source.match(/^(.*?)(?:\s+(\d+[.,]?\d*)\s*([a-zA-Zа-яА-Я.]+))$/);
  if (!match) return { name: source, amount: "", unit: "" };

  const unit = normalizeUnit(match[3] ?? "");
  if (!unit) return { name: source, amount: "", unit: "" };

  return {
    name: (match[1] ?? "").trim(),
    amount: (match[2] ?? "").replace(",", "."),
    unit,
  };
}

function normalizeUnit(rawUnit: string): string {
  const unit = rawUnit.trim().toLowerCase().replace(/\.$/, "");
  const map: Record<string, string> = {
    г: "г",
    гр: "гр",
    грамм: "гр",
    грамма: "гр",
    кг: "кг",
    килограмм: "кг",
    килограмма: "кг",
    мл: "мл",
    л: "л",
    литр: "л",
    литра: "л",
    шт: "шт",
    штука: "шт",
    штук: "шт",
    уп: "уп",
    упаковка: "уп",
    упаковки: "уп",
  };

  return map[unit] ?? "";
}

function inferDefaultQuantity(rawName: string): { amount: string; unit: string } {
  const name = rawName.trim().toLowerCase();

  if (/хлеб|батон|багет|лаваш/.test(name)) return { amount: "1", unit: "шт" };
  if (/перец|огурец|помидор|томат|яблоко|банан|авокадо|лимон|лук/.test(name)) return { amount: "1", unit: "шт" };
  if (/яйц/.test(name)) return { amount: "10", unit: "шт" };
  if (/молоко|кефир|сок|вода/.test(name)) return { amount: "1", unit: "л" };

  return { amount: "", unit: "" };
}
