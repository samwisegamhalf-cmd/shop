"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";

import type { ShoppingItemDto, ShoppingListDto, WorkspaceSummary } from "@/types/app";

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

export function ShoppingApp({ workspace, initialLists }: Props) {
  const [lists, setLists] = useState<ShoppingListDto[]>(initialLists);
  const [activeListId, setActiveListId] = useState<string>(initialLists[0]?.id ?? "");
  const [quickInput, setQuickInput] = useState("");
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

    const preferredDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = preferredDark ? "dark" : "light";
    root.dataset.theme = initialTheme;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadLists().catch(() => undefined);
    }, 5000);

    return () => clearInterval(timer);
  }, [loadLists]);

  const pendingItems = useMemo(
    () => (activeList ? activeList.items.filter((item) => !item.isBought) : []),
    [activeList],
  );
  const boughtItems = useMemo(
    () => (activeList ? activeList.items.filter((item) => item.isBought) : []),
    [activeList],
  );

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

  async function submitStructuredItem(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!activeList || !itemName.trim()) return;

    setLoading(true);
    setError(null);
    const quantity = [itemAmount.trim(), itemUnit.trim()].filter(Boolean).join(" ").trim();
    const res = await fetch(`/api/lists/${activeList.id}/items/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            originalText: itemName.trim(),
            normalizedName: itemName.trim().toLowerCase(),
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

  function startRenameList() {
    if (!activeList) return;
    setRenameListTitle(activeList.title);
    setIsRenamingList(true);
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
    const accepted = window.confirm(`Удалить список "${activeList.title}"?`);
    if (!accepted) return;

    const res = await fetch(`/api/lists/${activeList.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Не удалось удалить список");
      return;
    }

    setActiveListId("");
    await loadLists();
  }

  function onQuickInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitQuickInput().catch(() => undefined);
    }
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

  function toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("shop_theme", nextTheme);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>{workspace.name}</h1>
          <p>Быстрый список покупок</p>
        </div>
        <div className={styles.headerActions}>
          <button onClick={toggleTheme} className={styles.ghostButton}>
            Тема
          </button>
          <button onClick={logout} className={styles.ghostButton}>Выйти</button>
        </div>
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

      <section className={styles.activeListActions}>
        {isRenamingList ? (
          <form
            className={styles.renameListForm}
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
            <button
              className={styles.ghostButton}
              type="button"
              onClick={() => setIsRenamingList(false)}
            >
              Отмена
            </button>
          </form>
        ) : (
          <button
            className={styles.ghostButton}
            onClick={startRenameList}
            disabled={!activeList}
          >
            Переименовать список
          </button>
        )}
        <button
          className={styles.dangerButton}
          onClick={deleteActiveList}
          disabled={!activeList}
        >
          Удалить список
        </button>
      </section>

      <form className={styles.manualItemForm} onSubmit={submitStructuredItem}>
        <input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="Товар (Enter - добавить)"
          required
        />
        <input
          value={itemAmount}
          onChange={(e) => setItemAmount(e.target.value)}
          placeholder="Кол-во"
        />
        <input
          value={itemUnit}
          onChange={(e) => setItemUnit(e.target.value)}
          placeholder="Ед. изм."
        />
        <button type="submit" disabled={loading || !activeList}>Добавить</button>
      </form>

      <section className={styles.inputBox}>
        <textarea
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
          onKeyDown={onQuickInputKeyDown}
          placeholder="молоко 2 литра, хлеб, яйца 10 штук"
          rows={2}
        />
        <button onClick={submitQuickInput} disabled={loading || !activeList}>Добавить</button>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.block}>
        <h2>Купить</h2>
        {pendingItems.map((item) => (
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
            isEditing={editingItem?.id === item.id}
            editingItem={editingItem}
            onEditingChange={setEditingItem}
            onSaveEdit={saveEditedItem}
            onCancelEdit={() => setEditingItem(null)}
          />
        ))}
      </section>

      <section className={styles.block}>
        <h2>Куплено</h2>
        {boughtItems.map((item) => (
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
            isEditing={editingItem?.id === item.id}
            editingItem={editingItem}
            onEditingChange={setEditingItem}
            onSaveEdit={saveEditedItem}
            onCancelEdit={() => setEditingItem(null)}
          />
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
  isEditing,
  editingItem,
  onEditingChange,
  onSaveEdit,
  onCancelEdit,
}: {
  item: ShoppingItemDto;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
  editingItem: EditingState | null;
  onEditingChange: (value: EditingState | null) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  if (isEditing && editingItem) {
    return (
      <div className={styles.itemEditRow}>
        <input
          value={editingItem.name}
          onChange={(e) => onEditingChange({ ...editingItem, name: e.target.value })}
          placeholder="Товар"
        />
        <input
          value={editingItem.amount}
          onChange={(e) => onEditingChange({ ...editingItem, amount: e.target.value })}
          placeholder="Кол-во"
        />
        <input
          value={editingItem.unit}
          onChange={(e) => onEditingChange({ ...editingItem, unit: e.target.value })}
          placeholder="Ед. изм."
        />
        <button className={styles.primaryMiniButton} onClick={onSaveEdit}>Сохранить</button>
        <button className={styles.ghostButton} onClick={onCancelEdit}>Отмена</button>
      </div>
    );
  }

  return (
    <div className={styles.itemRow}>
      <button className={styles.checkbox} onClick={onToggle} aria-label="toggle bought">
        {item.isBought ? "✓" : ""}
      </button>
      <div className={styles.itemContent}>
        <p>{item.originalText}</p>
        {item.quantity ? <small>{item.quantity}</small> : null}
      </div>
      <button className={styles.ghostButton} onClick={onEdit}>Ред.</button>
      <button className={styles.dangerButton} onClick={onDelete}>Удалить</button>
    </div>
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
