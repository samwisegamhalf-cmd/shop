"use client";

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type {
  FavoriteProductDto,
  ShoppingItemDto,
  ShoppingListDto,
  WorkspaceSummary,
} from "@/types/app";

import { canonicalizeItemName } from "@/lib/item-normalization";

import styles from "./shopping-app.module.css";

type Props = {
  workspace: WorkspaceSummary;
  initialLists: ShoppingListDto[];
  initialActiveListId: string;
  initialFavorites: FavoriteProductDto[];
};

type AppMode = "shopping" | "lists";
type ListViewMode = "single" | "all";

type EditingState = {
  id: string;
  name: string;
  amount: string;
  unit: string;
};

type RenameState = {
  id: string;
  title: string;
};

type MergeNotice = {
  id: string;
  title: string;
  quantity: string | null;
  mergedFrom: string;
};

type SuggestionItem = {
  canonicalName: string;
  label: string;
  quantity: string | null;
  source: "favorite" | "suggestion" | "frequent";
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

export function ShoppingApp({
  workspace,
  initialLists,
  initialActiveListId,
  initialFavorites,
}: Props) {
  const [lists, setLists] = useState<ShoppingListDto[]>(initialLists);
  const [activeListId, setActiveListId] = useState<string>(initialActiveListId || initialLists[0]?.id || "");
  const [itemName, setItemName] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemUnit, setItemUnit] = useState("");
  const [newListTitle, setNewListTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<EditingState | null>(null);
  const [renamingList, setRenamingList] = useState<RenameState | null>(null);
  const [mergeNotices, setMergeNotices] = useState<MergeNotice[]>([]);
  const [mode, setMode] = useState<AppMode>("shopping");
  const [listViewMode, setListViewMode] = useState<ListViewMode>("single");
  const [favorites, setFavorites] = useState<FavoriteProductDto[]>(initialFavorites);
  const didMountActiveList = useRef(false);

  const activeList = useMemo(
    () => lists.find((list) => list.id === activeListId) ?? lists[0] ?? null,
    [activeListId, lists],
  );

  useEffect(() => {
    if (!lists.length) return;
    if (!activeListId || lists.some((list) => list.id === activeListId)) return;
    setActiveListId(lists[0].id);
  }, [lists, activeListId]);

  const activeListOptions = useMemo(
    () => lists.map((list) => ({ value: list.id, label: list.title })),
    [lists],
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

  const loadPreferences = useCallback(async () => {
    const [activeRes, favoritesRes] = await Promise.all([
      fetch("/api/preferences/active-list"),
      fetch(`/api/favorites?workspaceId=${workspace.id}`),
    ]);

    if (activeRes.ok) {
      const activeData = await activeRes.json();
      if (activeData.activeListId && activeData.activeListId !== activeListId) {
        setActiveListId(activeData.activeListId);
      }
    }

    if (favoritesRes.ok) {
      const favoritesData = await favoritesRes.json();
      setFavorites(favoritesData.favorites ?? []);
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
      loadPreferences().catch(() => undefined);
    }, 5000);

    return () => clearInterval(timer);
  }, [loadLists, loadPreferences]);

  useEffect(() => {
    if (!activeListId) return;
    if (!didMountActiveList.current) {
      didMountActiveList.current = true;
      return;
    }

    fetch("/api/preferences/active-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: activeListId }),
    }).catch(() => undefined);
  }, [activeListId]);

  const allItems = useMemo(() => lists.flatMap((list) => list.items), [lists]);
  const activeItems = useMemo(() => activeList?.items ?? [], [activeList]);
  const pendingItems = useMemo(() => activeItems.filter((item) => !item.isBought), [activeItems]);
  const boughtItems = useMemo(() => activeItems.filter((item) => item.isBought), [activeItems]);

  const frequentSuggestions = useMemo(() => {
    const counters = new Map<string, { count: number; label: string; quantity: string | null }>();

    for (const item of allItems) {
      const canonicalName = canonicalizeItemName(item.originalText);
      if (!canonicalName) continue;
      const current = counters.get(canonicalName);
      if (!current) {
        counters.set(canonicalName, {
          count: 1,
          label: item.originalText,
          quantity: item.quantity,
        });
      } else {
        current.count += 1;
      }
    }

    return Array.from(counters.entries())
      .filter(([canonicalName, value]) => {
        const alreadyFavorite = favorites.some((entry) => entry.canonicalName === canonicalName);
        return value.count >= 2 && !alreadyFavorite;
      })
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([canonicalName, value]) => ({
        canonicalName,
        label: value.label,
        quantity: value.quantity,
        source: "frequent" as const,
      }));
  }, [allItems, favorites]);

  const suggestionPool = useMemo(() => {
    const map = new Map<string, SuggestionItem>();

    for (const favorite of favorites) {
      map.set(favorite.canonicalName, {
        canonicalName: favorite.canonicalName,
        label: favorite.label,
        quantity: favorite.quantity,
        source: "favorite",
      });
    }

    for (const frequent of frequentSuggestions) {
      if (!map.has(frequent.canonicalName)) {
        map.set(frequent.canonicalName, frequent);
      }
    }

    for (const item of allItems) {
      const canonicalName = canonicalizeItemName(item.originalText);
      if (!canonicalName || map.has(canonicalName)) continue;
      map.set(canonicalName, {
        canonicalName,
        label: item.originalText,
        quantity: item.quantity,
        source: "suggestion",
      });
    }

    return Array.from(map.values());
  }, [allItems, favorites, frequentSuggestions]);

  const filteredSuggestions = useMemo(() => {
    const query = itemName.trim().toLowerCase();
    if (!query) return [];

    return suggestionPool
      .filter((item) => item.label.toLowerCase().includes(query))
      .sort((a, b) => suggestionPriority(b.source) - suggestionPriority(a.source))
      .slice(0, 6);
  }, [itemName, suggestionPool]);

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
      body: JSON.stringify({
        workspaceId: workspace.id,
        title: newListTitle.trim(),
      }),
    });

    if (!res.ok) {
      setError("Не удалось создать список");
      return;
    }

    setNewListTitle("");
    await loadLists();
  }

  async function renameList() {
    if (!renamingList?.id || !renamingList.title.trim()) return;

    const res = await fetch(`/api/lists/${renamingList.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: renamingList.title.trim(),
      }),
    });

    if (!res.ok) {
      setError("Не удалось переименовать список");
      return;
    }

    setRenamingList(null);
    await loadLists();
  }

  async function deleteList(listId: string, title: string) {
    if (!window.confirm(`Удалить список "${title}"?`)) return;

    const res = await fetch(`/api/lists/${listId}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Не удалось удалить список");
      return;
    }

    if (activeListId === listId) {
      setActiveListId("");
    }
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

  async function toggleFavorite(input: FavoriteProductDto) {
    const exists = favorites.some((entry) => entry.canonicalName === input.canonicalName);
    const method = exists ? "DELETE" : "POST";

    const res = await fetch("/api/favorites", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: workspace.id,
        label: input.label,
        canonicalName: input.canonicalName,
        quantity: input.quantity,
      }),
    });

    if (!res.ok) {
      setError("Не удалось обновить избранное");
      return;
    }

    if (exists) {
      setFavorites((current) => current.filter((entry) => entry.canonicalName !== input.canonicalName));
    } else {
      const data = await res.json();
      setFavorites((current) => [data.favorite, ...current.filter((entry) => entry.canonicalName !== input.canonicalName)]);
    }
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

  function applySuggestion(item: { label: string; quantity: string | null }) {
    const amount = parseAmount(item.quantity);
    const unit = parseUnit(item.quantity);
    setItemName(item.label);
    setItemAmount(amount);
    setItemUnit(unit);
  }

  const totalBought = allItems.filter((item) => item.isBought).length;

  return (
    <div className={styles.desktopShell}>
      <div className={styles.phoneFrame}>
        <header className={styles.topBar}>
          <div className={styles.modeTabs}>
            <button
              className={mode === "shopping" ? styles.modeTabActive : styles.modeTab}
              onClick={() => setMode("shopping")}
            >
              Покупки
            </button>
            <button
              className={mode === "lists" ? styles.modeTabActive : styles.modeTab}
              onClick={() => setMode("lists")}
            >
              Списки
            </button>
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
            <span>Списков</span>
            <strong>{lists.length}</strong>
          </article>
          <article className={styles.statCard}>
            <span>В покупке</span>
            <strong>{pendingItems.length}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Куплено</span>
            <strong>{totalBought}</strong>
          </article>
        </section>

        {mode === "lists" ? (
          <section className={styles.managementWrap}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <span className={styles.panelKicker}>Список списков</span>
                  <h2>Каждый список можно открыть, переименовать и удалить</h2>
                </div>
              </div>

              <div className={styles.managementList}>
                {lists.map((list) => (
                  <div key={list.id} className={styles.managementItem}>
                    <button
                      className={list.id === activeListId ? styles.managementOpenActive : styles.managementOpen}
                      onClick={() => setActiveListId(list.id)}
                    >
                      <span>{list.title}</span>
                      <small>{list.items.length} товаров</small>
                    </button>
                    <div className={styles.managementActions}>
                      <button
                        className={styles.iconTextButton}
                        onClick={() =>
                          setRenamingList({
                            id: list.id,
                            title: list.title,
                          })
                        }
                        aria-label="Переименовать список"
                      >
                        <EditIcon />
                      </button>
                      <button
                        className={styles.iconDangerButton}
                        onClick={() => deleteList(list.id, list.title)}
                        aria-label="Удалить список"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.topActions}>
                <input
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                  placeholder="Новый список"
                />
                <button onClick={createList} disabled={loading}>Создать</button>
              </div>

              {renamingList ? (
                <form
                  className={styles.renameRow}
                  onSubmit={(event) => {
                    event.preventDefault();
                    renameList().catch(() => undefined);
                  }}
                >
                  <input
                    value={renamingList.title}
                    onChange={(e) => setRenamingList({ ...renamingList, title: e.target.value })}
                    placeholder="Название списка"
                    required
                  />
                  <div className={styles.renameActions}>
                    <button className={styles.primaryMiniButton} type="submit">Сохранить</button>
                    <button type="button" className={styles.ghostButton} onClick={() => setRenamingList(null)}>
                      Отмена
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </section>
        ) : (
          <div className={styles.shoppingGrid}>
            <main className={styles.mainColumn}>
              <section className={styles.heroListPanel}>
                <div className={styles.panelTopRow}>
                  <div>
                    <span className={styles.panelKicker}>Главный список</span>
                    <h2>{listViewMode === "single" ? activeList?.title ?? "Выберите список" : "Все списки подряд"}</h2>
                  </div>

                  <div className={styles.inlineTopActions}>
                    <div className={styles.modeTabs}>
                      <button
                        className={listViewMode === "single" ? styles.modeTabActive : styles.modeTab}
                        onClick={() => setListViewMode("single")}
                      >
                        Один
                      </button>
                      <button
                        className={listViewMode === "all" ? styles.modeTabActive : styles.modeTab}
                        onClick={() => setListViewMode("all")}
                      >
                        Все
                      </button>
                    </div>

                    <SelectField
                      value={activeListId}
                      onChange={setActiveListId}
                      options={activeListOptions}
                      placeholder="Выберите список"
                      ariaLabel="Список"
                    />
                  </div>
                </div>

                {listViewMode === "single" ? (
                  <div className={styles.listSections}>
                    <ListCard
                      title="Нужно купить"
                      count={pendingItems.length}
                      emptyText="Список пуст. Добавь первую покупку."
                      items={pendingItems}
                      favorites={favorites}
                      onToggleFavorite={toggleFavorite}
                      onToggle={(item) => updateItem(item.id, { isBought: !item.isBought })}
                      onEdit={(item) =>
                        setEditingItem({
                          id: item.id,
                          name: item.originalText,
                          amount: parseAmount(item.quantity),
                          unit: parseUnit(item.quantity),
                        })
                      }
                      onDelete={(item) => removeItem(item.id)}
                    />

                    <ListCard
                      title="Уже куплено"
                      count={boughtItems.length}
                      emptyText="Купленные товары пока не появились."
                      items={boughtItems}
                      favorites={favorites}
                      onToggleFavorite={toggleFavorite}
                      onToggle={(item) => updateItem(item.id, { isBought: !item.isBought })}
                      onEdit={(item) =>
                        setEditingItem({
                          id: item.id,
                          name: item.originalText,
                          amount: parseAmount(item.quantity),
                          unit: parseUnit(item.quantity),
                        })
                      }
                      onDelete={(item) => removeItem(item.id)}
                    />
                  </div>
                ) : (
                  <div className={styles.allListsWrap}>
                    {lists.map((list) => (
                      <section key={list.id} className={styles.allListSection}>
                        <div className={styles.sectionHeading}>
                          <h3>{list.title}</h3>
                          <span>{list.items.length}</span>
                        </div>
                        <div className={styles.card}>
                          {list.items.length ? (
                            list.items.map((item) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                isFavorite={favorites.some((entry) => entry.canonicalName === canonicalizeItemName(item.originalText))}
                                onToggleFavorite={toggleFavorite}
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
                            <EmptyState text="В этом списке пока нет товаров." />
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </section>
            </main>

            <aside className={styles.sideColumn}>
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <span className={styles.panelKicker}>Новый пункт</span>
                    <h2>Добавление и подсказки</h2>
                  </div>
                </div>

                {frequentSuggestions.length ? (
                  <div className={styles.favoritePanel}>
                    <div className={styles.sectionCaption}>Часто покупаете</div>
                    <div className={styles.recommendationList}>
                      {frequentSuggestions.map((item) => (
                        <div key={item.canonicalName} className={styles.recommendationItem}>
                          <button className={styles.recommendationBody} onClick={() => applySuggestion(item)}>
                            <strong>{item.label}</strong>
                            {item.quantity ? <small>{item.quantity}</small> : <small>Подсказка</small>}
                          </button>
                          <button
                            className={styles.iconTextButton}
                            onClick={() =>
                              toggleFavorite({
                                id: "",
                                label: item.label,
                                canonicalName: item.canonicalName,
                                quantity: item.quantity,
                              })
                            }
                            aria-label="Добавить в избранное"
                          >
                            <StarIcon />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <form className={styles.composer} onSubmit={submitStructuredItem}>
                  <div className={styles.inputStack}>
                    <input
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="Фарш индейки 1 кг, молоко 2 л, хлеб..."
                      required
                    />
                    {filteredSuggestions.length ? (
                      <div className={styles.suggestionList}>
                        {filteredSuggestions.map((item) => (
                          <button
                            key={`${item.source}-${item.canonicalName}`}
                            type="button"
                            className={styles.suggestionItem}
                            onClick={() => applySuggestion(item)}
                          >
                            <div>
                              <strong>{item.label}</strong>
                              {item.quantity ? <small>{item.quantity}</small> : null}
                            </div>
                            <span>{labelForSuggestion(item.source)}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

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

                {favorites.length ? (
                  <div className={styles.favoritePanel}>
                    <div className={styles.sectionCaption}>Избранные</div>
                    <div className={styles.favoriteTags}>
                      {favorites.slice(0, 10).map((item) => (
                        <button
                          key={item.canonicalName}
                          className={styles.favoriteTag}
                          onClick={() => applySuggestion(item)}
                        >
                          <span>{item.label}</span>
                          {item.quantity ? <small>{item.quantity}</small> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

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
            </aside>
          </div>
        )}

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

function ListCard({
  title,
  count,
  emptyText,
  items,
  favorites,
  onToggleFavorite,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  count: number;
  emptyText: string;
  items: ShoppingItemDto[];
  favorites: FavoriteProductDto[];
  onToggleFavorite: (item: FavoriteProductDto) => void;
  onToggle: (item: ShoppingItemDto) => void;
  onEdit: (item: ShoppingItemDto) => void;
  onDelete: (item: ShoppingItemDto) => void;
}) {
  return (
    <section className={styles.listCard}>
      <div className={styles.sectionHeading}>
        <h3>{title}</h3>
        <span>{count}</span>
      </div>
      <div className={styles.card}>
        {items.length ? (
          items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              isFavorite={favorites.some((entry) => entry.canonicalName === canonicalizeItemName(item.originalText))}
              onToggleFavorite={onToggleFavorite}
              onToggle={() => onToggle(item)}
              onEdit={() => onEdit(item)}
              onDelete={() => onDelete(item)}
            />
          ))
        ) : (
          <EmptyState text={emptyText} />
        )}
      </div>
    </section>
  );
}

function ItemRow({
  item,
  isFavorite,
  onToggleFavorite,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ShoppingItemDto;
  isFavorite: boolean;
  onToggleFavorite: (item: FavoriteProductDto) => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={item.isBought ? styles.itemRowBought : styles.itemRow}>
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
            <button
              className={isFavorite ? styles.iconFavoriteActive : styles.iconTextButton}
              onClick={() =>
                onToggleFavorite({
                  id: "",
                  label: item.originalText,
                  canonicalName: canonicalizeItemName(item.originalText),
                  quantity: item.quantity,
                })
              }
              aria-label="Избранное"
            >
              <StarIcon />
            </button>
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

function StarIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.rowIcon}>
      <path
        d="m10 2.2 2.1 4.4 4.8.7-3.5 3.4.8 4.8-4.2-2.3-4.3 2.3.8-4.8-3.5-3.4 4.8-.7L10 2.2Z"
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
  if (/фарш|мясо|курица|индейка/.test(name)) return { amount: "1", unit: "кг" };

  return { amount: "", unit: "" };
}

function suggestionPriority(source: SuggestionItem["source"]): number {
  if (source === "favorite") return 3;
  if (source === "frequent") return 2;
  return 1;
}

function labelForSuggestion(source: SuggestionItem["source"]): string {
  if (source === "favorite") return "избранное";
  if (source === "frequent") return "часто";
  return "подсказка";
}
