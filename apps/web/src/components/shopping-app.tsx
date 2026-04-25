"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ShoppingItemDto, ShoppingListDto, WorkspaceSummary } from "@/types/app";

import styles from "./shopping-app.module.css";

type Props = {
  workspace: WorkspaceSummary;
  initialLists: ShoppingListDto[];
};

type ItemsByCategory = Record<string, ShoppingItemDto[]>;

export function ShoppingApp({ workspace, initialLists }: Props) {
  const [lists, setLists] = useState<ShoppingListDto[]>(initialLists);
  const [activeListId, setActiveListId] = useState<string>(initialLists[0]?.id ?? "");
  const [quickInput, setQuickInput] = useState("");
  const [newListTitle, setNewListTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const timer = setInterval(() => {
      loadLists().catch(() => undefined);
    }, 5000);

    return () => clearInterval(timer);
  }, [loadLists]);

  const grouped = useMemo(() => {
    if (!activeList) return { pending: {}, bought: {} } as { pending: ItemsByCategory; bought: ItemsByCategory };

    const pending: ItemsByCategory = {};
    const bought: ItemsByCategory = {};

    activeList.items.forEach((item) => {
      const bucket = item.isBought ? bought : pending;
      const category = item.category?.trim() || "Без категории";
      if (!bucket[category]) bucket[category] = [];
      bucket[category].push(item);
    });

    return { pending, bought };
  }, [activeList]);

  async function submitQuickInput() {
    if (!activeList || !quickInput.trim()) return;

    setLoading(true);
    setError(null);
    const res = await fetch(`/api/lists/${activeList.id}/items/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quickInput }),
    });
    setLoading(false);

    if (!res.ok) {
      setError("Не удалось добавить товары");
      return;
    }

    setQuickInput("");
    await loadLists();
  }

  async function createList() {
    if (!newListTitle.trim()) return;
    setLoading(true);
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, title: newListTitle }),
    });
    setLoading(false);

    if (!res.ok) {
      setError("Не удалось создать список");
      return;
    }

    setNewListTitle("");
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{workspace.name}</h1>
          <p>Быстрый список покупок</p>
        </div>
        <button onClick={logout} className={styles.ghostButton}>Выйти</button>
      </header>

      <section className={styles.newListRow}>
        <input
          value={newListTitle}
          onChange={(e) => setNewListTitle(e.target.value)}
          placeholder="Новый список"
        />
        <button onClick={createList} disabled={loading}>Создать</button>
      </section>

      <section className={styles.tabs}>
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

      <section className={styles.inputBox}>
        <textarea
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
          placeholder="молоко 2 литра, хлеб, яйца 10 штук"
          rows={2}
        />
        <button onClick={submitQuickInput} disabled={loading || !activeList}>Добавить</button>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.block}>
        <h2>Купить</h2>
        {Object.entries(grouped.pending).map(([category, items]) => (
          <div key={category} className={styles.category}>
            <h3>{category}</h3>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onToggle={() => updateItem(item.id, { isBought: !item.isBought })}
                onEdit={() => {
                  const value = window.prompt("Редактировать строку", item.originalText);
                  if (value && value.trim()) {
                    updateItem(item.id, { originalText: value, normalizedName: value.toLowerCase() });
                  }
                }}
                onDelete={() => removeItem(item.id)}
              />
            ))}
          </div>
        ))}
      </section>

      <section className={styles.block}>
        <h2>Куплено</h2>
        {Object.entries(grouped.bought).map(([category, items]) => (
          <div key={category} className={styles.category}>
            <h3>{category}</h3>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onToggle={() => updateItem(item.id, { isBought: !item.isBought })}
                onEdit={() => {
                  const value = window.prompt("Редактировать строку", item.originalText);
                  if (value && value.trim()) {
                    updateItem(item.id, { originalText: value, normalizedName: value.toLowerCase() });
                  }
                }}
                onDelete={() => removeItem(item.id)}
              />
            ))}
          </div>
        ))}
      </section>
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
      <button className={styles.checkbox} onClick={onToggle} aria-label="toggle bought">
        {item.isBought ? "✓" : ""}
      </button>
      <div className={styles.itemContent}>
        <p>{item.originalText}</p>
        <small>
          {item.quantity ? `${item.quantity} · ` : ""}source: {item.source.toLowerCase()} · lang: {item.language ?? "und"}
        </small>
      </div>
      <button className={styles.ghostButton} onClick={onEdit}>Ред.</button>
      <button className={styles.dangerButton} onClick={onDelete}>Удалить</button>
    </div>
  );
}
