import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, Field, inputClass, Modal, SegmentedTabs, useBusy } from '../components/ui';
import { addCategory, deleteCategory, isCategoryUsed, RepoError, updateCategory } from '../db/repo';
import { chartColor, EMOJI_CHOICES, PALETTE } from '../domain/seed';
import type { Category, TxType } from '../domain/types';
import { useCategories } from '../hooks/data';
import { useApp } from '../state/AppContext';

export function CategoryForm({ category, type, onClose }: { category?: Category; type: TxType; onClose: () => void }) {
  const { toast } = useApp();
  const [name, setName] = useState(category?.name ?? '');
  const [emoji, setEmoji] = useState(category?.emoji ?? '📦');
  const [color, setColor] = useState(category?.color ?? PALETTE[0]!);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, run] = useBusy();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      try {
        if (category) await updateCategory(category.id, { name, emoji, color });
        else await addCategory({ name, emoji, color, type });
        toast(category ? 'Kategori güncellendi' : 'Kategori eklendi');
        onClose();
      } catch (err) {
        setError(err instanceof RepoError ? err.message : 'Kaydedilemedi');
      }
    });
  };

  const askDelete = () =>
    void run(async () => {
      if (!category) return;
      if (await isCategoryUsed(category.id)) {
        setError('Bu kategori kullanılıyor. Silmek yerine arşivleyebilirsiniz.');
        return;
      }
      setConfirmDelete(true);
    });

  return (
    <>
      <Modal open={!confirmDelete} onClose={onClose} title={category ? 'Kategoriyi düzenle' : `Yeni ${type === 'income' ? 'gelir' : 'gider'} kategorisi`}>
        <form onSubmit={submit} noValidate>
          <Field label="Ad">{(id) => <input id={id} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="Örn. Evcil hayvan" />}</Field>
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium text-muted" htmlFor="emoji-input">
              Simge
            </label>
            <div className="flex gap-2">
              <input id="emoji-input" className={`${inputClass} w-16 text-center text-xl`} value={emoji} onChange={(e) => setEmoji([...e.target.value].slice(-2).join('') || '')} aria-label="Simge (emoji)" />
              <div className="flex flex-wrap gap-1">
                {EMOJI_CHOICES.map((em) => (
                  <button key={em} type="button" onClick={() => setEmoji(em)} aria-label={`Simge ${em}`} className={`size-9 rounded-lg text-lg ${emoji === em ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mb-4">
            <div className="mb-1 text-sm font-medium text-muted">Renk</div>
            <div role="radiogroup" aria-label="Renk" className="flex flex-wrap gap-2">
              {PALETTE.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Renk ${i + 1}`}
                  onClick={() => setColor(c)}
                  className={`size-9 rounded-full ring-offset-2 ring-offset-surface ${color === c ? 'ring-2 ring-text' : ''}`}
                  style={{ background: chartColor(c) }}
                />
              ))}
            </div>
          </div>
          {error && (
            <p role="alert" className="mb-3 text-sm text-expense">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {category && (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void run(async () => {
                      await updateCategory(category.id, { archived: !category.archived });
                      toast(category.archived ? 'Kategori arşivden çıkarıldı' : 'Kategori arşivlendi');
                      onClose();
                    })
                  }
                >
                  {category.archived ? 'Arşivden çıkar' : 'Arşivle'}
                </Button>
                <Button variant="danger" onClick={askDelete}>
                  Sil
                </Button>
              </>
            )}
            <Button type="submit" className="flex-1" disabled={busy}>
              Kaydet
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Kategori silinsin mi?"
        message="Bu kategori ve bütçesi silinecek."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          void run(async () => {
            try {
              await deleteCategory(category!.id);
              toast('Kategori silindi');
              onClose();
            } catch (err) {
              setConfirmDelete(false);
              setError(err instanceof RepoError ? err.message : 'Silinemedi');
            }
          })
        }
      />
    </>
  );
}

export function CategoriesPage() {
  const categories = useCategories();
  const [type, setType] = useState<TxType>('expense');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  if (!categories) return null;
  const list = categories.filter((c) => c.type === type);

  return (
    <div className="space-y-4">
      <SegmentedTabs
        label="Kategori türü"
        value={type}
        onChange={setType}
        options={[
          { value: 'expense', label: 'Gider' },
          { value: 'income', label: 'Gelir' },
        ]}
      />
      <Card className="p-2!">
        <ul>
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setEditing(c)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
                <span className="flex size-10 items-center justify-center rounded-full text-lg" style={{ background: `color-mix(in srgb, ${chartColor(c.color)} 22%, transparent)` }} aria-hidden>
                  {c.emoji}
                </span>
                <span className={`flex-1 font-medium ${c.archived ? 'text-muted' : ''}`}>{c.name}</span>
                {c.archived && <Badge>Arşivde</Badge>}
                <span className="size-3 rounded-full" style={{ background: chartColor(c.color) }} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Button onClick={() => setEditing('new')}>
        <Plus size={18} /> Kategori ekle
      </Button>
      {editing && <CategoryForm category={editing === 'new' ? undefined : editing} type={type} onClose={() => setEditing(null)} />}
    </div>
  );
}
