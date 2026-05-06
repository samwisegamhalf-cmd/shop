"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import type { ShoppingItemDto, ShoppingListDto, WorkspaceSummary } from "@/types/app";

import styles from "./shopping-app.module.css";

type Props = {
  workspace: WorkspaceSummary;
  initialLists: ShoppingListDto[];
};

type AppTab = "list" | "history";

type EditingState = {
  id: string;
  name: string;
  amount: string;
  unit: string;
};

const UNIT_OPTIONS = ["", "г", "гр", "кг", "мл", "л", "шт", "уп"];

export function ShoppingApp({ workspace, initialLists }: Props) {
  const [lists, setLists] = useState<ShoppingListDto[]>(initialLists);
  const [activeListId, setActiveListId] = useState<string>(initialLists[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<AppTab>("list");
  const [itemName, setItemName] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemUnit, setItemUnit] = useState("");
  const [newListTitle, setNewListTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<EditingState | null>(null);
  const [isRenamingList, setIsRenamingList] = useState(false);
  const [renameListTitle, setRenameListTitle] = useState("");

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

  const historyGroups = useMemo(() => {
    const map = new Map<string, ShoppingItemDto[]>();
    [...allItems]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .forEach((item) => {
        const key = formatDateKey(item.updatedAt);
        const current = map.get(key) ?? [];
        current.push(item);
        map.set(key, current);
      });
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
  }, [allItems]);

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

    const quantity = [amount, unit].filter(Boolean).join(" ").trim();

    const res = await fetch(`/api/lists/${activeList.id}/items/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            originalText: parsedName,
            normalizedName: parsedName.toLowerCase(),
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
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.eyebrow}>{workspace.name}</span>
            <h1>Список покупок</h1>
            <p>Простой рабочий экран для общих покупок на телефоне, ноутбуке и большом мониторе.</p>
          </div>
          <div className={styles.headerActions}>
            <button onClick={toggleTheme} className={styles.iconButton} aria-label="Переключить тему">◐</button>
            <button onClick={logout} className={styles.iconButton} aria-label="Выйти">⎋</button>
          </div>
        </header>

        <section className={styles.statsRow}>
          <article className={styles.statCard}>
            <span>Всего</span>
            <strong>{allItems.length}</strong>
          </article>
          <article className={styles.statCard}>
            <span>В покупке</span>
            <strong>{pendingItems.length}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Готово</span>
            <strong>{boughtItems.length}</strong>
          </article>
        </section>

        <div className={styles.appGrid}>
          <aside className={styles.sidebar}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.panelKicker}>Списки</span>
                  <h2>Переключение без лишних действий</h2>
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
                <button className={styles.dangerButton} onClick={deleteActiveList} disabled={!activeList}>Удалить</button>
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
                  <button type="button" className={styles.ghostButton} onClick={() => setIsRenamingList(false)}>Отмена</button>
                </form>
              ) : null}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.panelKicker}>Добавить</span>
                  <h2>Новые покупки в одном компактном блоке</h2>
                </div>
              </div>

              <form className={styles.composer} onSubmit={submitStructuredItem}>
                <input
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Молоко 2 л, хлеб, яйца..."
                  required
                />
                <div className={styles.composerRow}>
                  <input value={itemAmount} onChange={(e) => setItemAmount(e.target.value)} placeholder="Кол-во" />
                  <select value={itemUnit} onChange={(e) => setItemUnit(e.target.value)}>
                    {UNIT_OPTIONS.map((unit) => (
                      <option key={unit} value={unit}>{unit || "Ед."}</option>
                    ))}
                  </select>
                  <button type="submit" disabled={loading || !activeList}>Добавить</button>
                </div>
              </form>
            </section>
          </aside>

          <main className={styles.contentArea}>
            <div className={styles.contentHeader}>
              <div>
                <span className={styles.panelKicker}>Активный экран</span>
                <h2>{activeList?.title ?? "Выбери список"}</h2>
              </div>
              <nav className={styles.bottomNav}>
                <button className={activeTab === "list" ? styles.bottomActive : styles.bottomItem} onClick={() => setActiveTab("list")}>Список</button>
                <button className={activeTab === "history" ? styles.bottomActive : styles.bottomItem} onClick={() => setActiveTab("history")}>История</button>
              </nav>
            </div>

            {activeTab === "list" ? (
              <div className={styles.listLayout}>
                <section className={styles.panel}>
                  <div className={styles.sectionHeading}>
                    <h3>Нужно купить</h3>
                    <span>{pendingItems.length}</span>
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
              </div>
            ) : null}

            {activeTab === "history" ? (
              <section className={styles.historyWrap}>
                {historyGroups.length ? (
                  historyGroups.map((group) => (
                    <div key={group.date} className={styles.historyDay}>
                      <h4>{group.date}</h4>
                      <div className={styles.card}>
                        {group.items.map((item) => (
                          <div key={item.id} className={styles.historyRow}>
                            <div>
                              <p>{item.originalText}</p>
                              {item.quantity ? <small>{item.quantity}</small> : null}
                            </div>
                            <span className={styles.sourceBadge}>{formatSource(item.source)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState text="История появится, когда в списке будут изменения." />
                )}
              </section>
            ) : null}
          </main>
        </div>

        {editingItem ? (
          <div className={styles.sheetOverlay} onClick={() => setEditingItem(null)}>
            <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
              <h3>Редактировать</h3>
              <label>Название</label>
              <input value={editingItem.name} onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })} />
              <label>Количество</label>
              <input value={editingItem.amount} onChange={(e) => setEditingItem({ ...editingItem, amount: e.target.value })} />
              <label>Ед. изм.</label>
              <select value={editingItem.unit} onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}>
                {UNIT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>{unit || "Выберите"}</option>
                ))}
              </select>
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
                <button type="button" className={styles.ghostButton} onClick={() => setEditingItem(null)}>Отмена</button>
                <button type="button" className={styles.primaryMiniButton} onClick={saveEditedItem}>Сохранить</button>
              </div>
            </div>
          </div>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className={styles.emptyState}>{text}</div>;
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
        {item.isBought ? "✓" : ""}
      </button>
      <div className={styles.itemContent}>
        <p>{item.originalText}</p>
        {item.quantity ? <small>{item.quantity}</small> : null}
      </div>
      <div className={styles.itemActions}>
        <button className={styles.ghostButton} onClick={onEdit}>Изм.</button>
        <button className={styles.dangerButton} onClick={onDelete}>Удалить</button>
      </div>
    </div>
  );
}

function formatDateKey(isoDate: string): string {
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Сегодня";
  if (date.toDateString() === yesterday.toDateString()) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatSource(source: string): string {
  const normalized = source.toLowerCase();
  if (normalized.includes("telegram")) return "Telegram";
  if (normalized.includes("voice")) return "Голос";
  if (normalized.includes("photo")) return "Фото";
  return "Вручную";
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
