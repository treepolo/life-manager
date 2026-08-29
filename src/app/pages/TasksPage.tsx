import type { FormEvent } from "react";

import { useResource } from "@/app/hooks/use-resource";
import type { DailyTask, TaskCategory } from "@/modules/simple/model";

function formValue(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function errorText(error: unknown): string | null {
  return error instanceof Error ? error.message : error ? "操作失敗。" : null;
}

export function TasksPage() {
  const categoriesResource = useResource<TaskCategory>("task-categories", "?includeArchived=true");
  const tasksResource = useResource<DailyTask>("daily-tasks", "?includeArchived=true");
  const categories = categoriesResource.list.data ?? [];
  const tasks = tasksResource.list.data ?? [];
  const activeCategories = categories.filter((category) => !category.archivedAt && !category.deletedAt);
  const activeTasks = tasks.filter((task) => !task.archivedAt && !task.deletedAt);
  const archivedTasks = tasks.filter((task) => task.archivedAt && !task.deletedAt);

  const createCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    categoriesResource.create.mutate({ name: formValue(form, "name"), description: formValue(form, "description") });
    event.currentTarget.reset();
  };

  const createTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    tasksResource.create.mutate({
      categoryId: formValue(form, "categoryId"),
      name: formValue(form, "name"),
      description: formValue(form, "description"),
    });
    event.currentTarget.reset();
  };

  const updateCategory = (event: FormEvent<HTMLFormElement>, category: TaskCategory) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    categoriesResource.update.mutate({
      id: category.id,
      version: category.version,
      patch: { name: formValue(form, "name"), description: formValue(form, "description") },
    });
  };

  const updateTask = (event: FormEvent<HTMLFormElement>, task: DailyTask) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    tasksResource.update.mutate({
      id: task.id,
      version: task.version,
      patch: {
        categoryId: formValue(form, "categoryId"),
        name: formValue(form, "name"),
        description: formValue(form, "description"),
      },
    });
  };

  const busy = categoriesResource.create.isPending || categoriesResource.update.isPending || categoriesResource.archive.isPending
    || tasksResource.create.isPending || tasksResource.update.isPending || tasksResource.archive.isPending;
  const error = categoriesResource.list.error ?? tasksResource.list.error
    ?? categoriesResource.create.error ?? categoriesResource.update.error ?? categoriesResource.archive.error
    ?? tasksResource.create.error ?? tasksResource.update.error ?? tasksResource.archive.error;

  return (
    <div className="page crayon-page">
      <header className="hero-scribble compact-hero">
        <div>
          <p className="eyebrow">每日任務</p>
          <h1>只留下每天真的要做的事</h1>
          <p>每個任務只需要名稱、敘述與一個分類；沒有優先級、排程器、延期或其他額外欄位。</p>
        </div>
      </header>

      {error ? <p className="notice-strip notice-strip--danger">{errorText(error)}</p> : null}

      <section className="task-admin-grid">
        <article className="crayon-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">分類</p><h2>新增任務分類</h2></div>
          </div>
          <form className="crayon-form" onSubmit={createCategory}>
            <label>分類名稱<input name="name" maxLength={120} required placeholder="例如：訓練" /></label>
            <label>敘述<textarea name="description" maxLength={2000} rows={3} placeholder="這類任務在累積什麼？" /></label>
            <button className="crayon-button" disabled={busy}>新增分類</button>
          </form>
        </article>

        <article className="crayon-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">任務</p><h2>新增每日任務</h2></div>
          </div>
          {!activeCategories.length ? (
            <div className="empty-note">先建立至少一個任務分類。</div>
          ) : (
            <form className="crayon-form" onSubmit={createTask}>
              <label>名稱<input name="name" maxLength={180} required placeholder="例如：投 30 球" /></label>
              <label>敘述<textarea name="description" maxLength={2000} rows={3} placeholder="簡短說明今天要完成什麼" /></label>
              <label>分類
                <select name="categoryId" required defaultValue="">
                  <option value="" disabled>選擇分類</option>
                  {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <button className="crayon-button" disabled={busy}>新增每日任務</button>
            </form>
          )}
        </article>
      </section>

      <section className="crayon-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">正在使用</p><h2>任務與分類</h2></div>
          <span className="tiny-note">封存後不會出現在每天清單，但歷史完成次數會保留。</span>
        </div>
        {!activeCategories.length ? <div className="empty-note">目前沒有使用中的分類。</div> : (
          <div className="category-list">
            {activeCategories.map((category) => {
              const categoryTasks = activeTasks.filter((task) => task.categoryId === category.id);
              return (
                <article className="category-section" key={category.id}>
                  <header>
                    <div><h3>{category.name}</h3>{category.description ? <p>{category.description}</p> : null}</div>
                    <button className="paper-button" type="button" disabled={busy} onClick={() => categoriesResource.archive.mutate({ id: category.id, version: category.version })}>封存分類</button>
                  </header>
                  <details className="paper-details">
                    <summary>編輯分類</summary>
                    <form className="inline-edit-form" onSubmit={(event) => updateCategory(event, category)}>
                      <input name="name" defaultValue={category.name} required maxLength={120} />
                      <textarea name="description" defaultValue={category.description} rows={2} maxLength={2000} />
                      <button className="paper-button" disabled={busy}>儲存</button>
                    </form>
                  </details>
                  {!categoryTasks.length ? <p className="empty-note compact-empty">這個分類還沒有每日任務。</p> : (
                    <div className="task-card-list">
                      {categoryTasks.map((task) => (
                        <article className="task-admin-row" key={task.id}>
                          <div><strong>{task.name}</strong>{task.description ? <p>{task.description}</p> : null}</div>
                          <div className="row-actions">
                            <details className="paper-details">
                              <summary>編輯</summary>
                              <form className="inline-edit-form" onSubmit={(event) => updateTask(event, task)}>
                                <input name="name" defaultValue={task.name} required maxLength={180} />
                                <textarea name="description" defaultValue={task.description} rows={2} maxLength={2000} />
                                <select name="categoryId" defaultValue={task.categoryId} required>
                                  {activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                </select>
                                <button className="paper-button" disabled={busy}>儲存</button>
                              </form>
                            </details>
                            <button className="paper-button" type="button" disabled={busy} onClick={() => tasksResource.archive.mutate({ id: task.id, version: task.version })}>封存</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {(categories.some((category) => category.archivedAt) || archivedTasks.length) ? (
        <details className="crayon-panel archive-panel">
          <summary>已封存項目</summary>
          <div className="archive-list">
            {categories.filter((category) => category.archivedAt).map((category) => (
              <div key={category.id}><span>分類：{category.name}</span><button className="paper-button" disabled={busy} onClick={() => categoriesResource.archive.mutate({ id: category.id, version: category.version, restore: true })}>恢復</button></div>
            ))}
            {archivedTasks.map((task) => (
              <div key={task.id}><span>任務：{task.name}</span><button className="paper-button" disabled={busy} onClick={() => tasksResource.archive.mutate({ id: task.id, version: task.version, restore: true })}>恢復</button></div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
