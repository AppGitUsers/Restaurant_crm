import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { menuAPI } from '@/api'
import { PageLoader, Modal, SearchBar, StatusBadge, ConfirmDialog, Field, Empty } from '@/components/ui'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, ChefHat, UtensilsCrossed, Layers, Sparkles } from 'lucide-react'

// ── Food Type Tab ─────────────────────────────────────
function FoodTypeTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)
  const [sel, setSel]     = useState(null)
  const [form, setForm]   = useState({ name: '', description: '', icon: '', sort_order: 0, allow_addons: false, addon_ids: [] })
  const [del, setDel]     = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['food-types'], queryFn: () => menuAPI.types.list().then(r => r.data.results || r.data) })
  const { data: allAddons } = useQuery({ queryKey: ['addons'], queryFn: () => menuAPI.addons.list({ is_active: true }).then(r => r.data.results || r.data) })

  const save = useMutation({
    mutationFn: (d) => sel ? menuAPI.types.update(sel.id, d) : menuAPI.types.create(d),
    onSuccess: () => { qc.invalidateQueries(['food-types']); setModal(null); toast.success('Saved!') },
    onError:   () => toast.error('Save failed'),
  })
  const remove = useMutation({
    mutationFn: (id) => menuAPI.types.delete(id),
    onSuccess: () => { qc.invalidateQueries(['food-types']); setDel(null); toast.success('Deleted') },
  })

  const blankForm = { name: '', description: '', icon: '', sort_order: 0, allow_addons: false, addon_ids: [] }
  const openCreate = () => { setSel(null); setForm(blankForm); setModal('form') }
  const openEdit   = (t)  => {
    setSel(t)
    setForm({
      name: t.name, description: t.description, icon: t.icon, sort_order: t.sort_order,
      allow_addons: t.allow_addons || false,
      addon_ids: (t.addons || []).map(a => a.id),
    })
    setModal('form')
  }

  const toggleAddon = (id) => {
    const ids = form.addon_ids
    setForm({ ...form, addon_ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] })
  }

  if (isLoading) return <PageLoader />
  const types  = data || []
  const addons = allAddons || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="font-semibold text-gray-700">Food Types / Categories</h2>
          <p className="text-xs text-gray-400">{types.length} categories</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Type</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {types.map(t => (
          <div key={t.id} className="card-sm flex flex-col gap-2 relative group">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{t.icon || '🍽'}</span>
              <div>
                <p className="font-semibold text-sm text-gray-800">{t.name}</p>
                <p className="text-xs text-gray-400">{t.item_count} items</p>
              </div>
            </div>
            {t.allow_addons && (
              <span className="inline-flex items-center gap-1 text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full w-fit">
                <Sparkles size={10} /> Add-ons ({(t.addons || []).length})
              </span>
            )}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => openEdit(t)} className="btn-ghost py-1 px-2 text-xs"><Edit2 size={12} />Edit</button>
              <button onClick={() => setDel(t)} className="btn-ghost py-1 px-2 text-xs text-red-500"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        {types.length === 0 && <div className="col-span-5"><Empty message="No food types yet" /></div>}
      </div>

      <Modal open={modal === 'form'} onClose={() => setModal(null)} title={sel ? 'Edit Food Type' : 'Add Food Type'}
        footer={<>
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">Save</button>
        </>}
      >
        <Field label="Name" required><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Icon (emoji)"><input className="input" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="🍕" /></Field>
        <Field label="Description"><textarea className="input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Sort Order"><input type="number" className="input" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} /></Field>

        {/* Add-ons toggle */}
        <Field label="Allow Add-ons?">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setForm({ ...form, allow_addons: !form.allow_addons })}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.allow_addons ? 'bg-primary-500' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.allow_addons ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-gray-600">{form.allow_addons ? 'Yes — customers can add extras' : 'No add-ons for this category'}</span>
          </label>
        </Field>

        {/* Addon checklist — only shown when allow_addons */}
        {form.allow_addons && (
          <Field label="Available Add-ons">
            {addons.length === 0
              ? <p className="text-xs text-gray-400">No add-ons created yet. Go to the Add-ons tab first.</p>
              : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {addons.map(a => (
                    <label key={a.id} className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors
                      ${form.addon_ids.includes(a.id) ? 'border-primary-400 bg-primary-50' : 'border-gray-100 hover:border-gray-200'}`}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={form.addon_ids.includes(a.id)} onChange={() => toggleAddon(a.id)} className="accent-primary-500" />
                        <span className="text-sm text-gray-700">{a.name}</span>
                      </div>
                      <span className="text-xs text-gray-400">{a.is_costed ? `₹${parseFloat(a.price).toFixed(2)}` : 'Free'}</span>
                    </label>
                  ))}
                </div>
              )
            }
          </Field>
        )}
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)}
        title="Delete Food Type" message={`Delete "${del?.name}"? This may affect food items.`} danger />
    </div>
  )
}

// ── Ingredient Tab ────────────────────────────────────
function IngredientTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [sel, setSel]       = useState(null)
  const [form, setForm]     = useState({ name: '', unit: 'g', description: '' })
  const [del, setDel]       = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['ingredients', search], queryFn: () => menuAPI.ingredients.list({ search }).then(r => r.data.results || r.data) })

  const save = useMutation({
    mutationFn: (d) => sel ? menuAPI.ingredients.update(sel.id, d) : menuAPI.ingredients.create(d),
    onSuccess: () => { qc.invalidateQueries(['ingredients']); setModal(false); toast.success('Saved!') },
  })
  const remove = useMutation({
    mutationFn: (id) => menuAPI.ingredients.delete(id),
    onSuccess: () => { qc.invalidateQueries(['ingredients']); setDel(null); toast.success('Deleted') },
  })

  const openCreate = () => { setSel(null); setForm({ name: '', unit: 'g', description: '' }); setModal(true) }
  const openEdit   = (i) => { setSel(i); setForm({ name: i.name, unit: i.unit, description: i.description }); setModal(true) }

  const UNITS = ['g', 'kg', 'ml', 'l', 'pcs', 'tbsp', 'tsp']
  const items = data || []

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search ingredients…">
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Ingredient</button>
      </SearchBar>

      <div className="table-container">
        <table className="table">
          <thead><tr><th>Name</th><th>Unit</th><th>Current Stock</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {items.map(i => (
              <tr key={i.id}>
                <td className="font-medium">{i.name}</td>
                <td><span className="badge-gray">{i.unit}</span></td>
                <td>{i.current_stock} {i.unit}</td>
                <td><span className={i.is_active ? 'badge-green' : 'badge-gray'}>{i.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(i)} className="btn-ghost py-1"><Edit2 size={13} /></button>
                    <button onClick={() => setDel(i)} className="btn-ghost py-1 text-red-400"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && items.length === 0 && <tr><td colSpan={5}><Empty message="No ingredients found" /></td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={sel ? 'Edit Ingredient' : 'Add Ingredient'}
        footer={<>
          <button onClick={() => setModal(false)} className="btn-ghost">Cancel</button>
          <button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">Save</button>
        </>}
      >
        <Field label="Name" required><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Unit" required>
          <select className="select" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Description"><textarea className="input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)}
        title="Delete Ingredient" message={`Delete "${del?.name}"?`} danger />
    </div>
  )
}

// ── Food Item Tab ─────────────────────────────────────
function FoodItemTab() {
  const qc = useQueryClient()
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [modal, setModal]       = useState(null)
  const [sel, setSel]           = useState(null)
  const [recipeModal, setRecipeModal] = useState(null)
  const [del, setDel]           = useState(null)
  const [form, setForm]         = useState({ food_type: '', name: '', description: '', price: '', is_available: true, is_active: true })
  const [photoFile, setPhotoFile] = useState(null)
  const [recipe, setRecipe]     = useState([])  // [{ingredient, quantity_required}]

  const { data, isLoading } = useQuery({
    queryKey: ['food-items', search, typeFilter],
    queryFn:  () => menuAPI.items.list({ search, food_type: typeFilter || undefined }).then(r => r.data.results || r.data),
  })
  const { data: types } = useQuery({ queryKey: ['food-types'], queryFn: () => menuAPI.types.list().then(r => r.data.results || r.data) })
  const { data: ingredients } = useQuery({ queryKey: ['ingredients'], queryFn: () => menuAPI.ingredients.list().then(r => r.data.results || r.data) })

  const save = useMutation({
    mutationFn: async (d) => {
      const fd = new FormData()
      Object.entries(d).forEach(([k, v]) => fd.append(k, v))
      if (photoFile) fd.append('photo', photoFile)
      return sel ? menuAPI.items.update(sel.id, fd) : menuAPI.items.create(fd)
    },
    onSuccess: () => { qc.invalidateQueries(['food-items']); setModal(null); setPhotoFile(null); toast.success('Saved!') },
  })
  const remove = useMutation({
    mutationFn: (id) => menuAPI.items.delete(id),
    onSuccess: () => { qc.invalidateQueries(['food-items']); setDel(null); toast.success('Deleted') },
  })
  const saveRecipe = useMutation({
    mutationFn: ({ id, data }) => menuAPI.items.setRecipe(id, data),
    onSuccess: () => { qc.invalidateQueries(['food-items']); setRecipeModal(null); toast.success('Recipe saved!') },
  })

  const openCreate = () => { setSel(null); setForm({ food_type: '', name: '', description: '', price: '', is_available: true, is_active: true }); setPhotoFile(null); setModal('form') }
  const openEdit   = (item) => { setSel(item); setForm({ food_type: item.food_type, name: item.name, description: item.description, price: item.price, is_available: item.is_available, is_active: item.is_active }); setPhotoFile(null); setModal('form') }
  const openRecipe = (item) => {
    setSel(item)
    setRecipe(item.recipe_ingredients.map(r => ({ ingredient: r.ingredient, quantity_required: r.quantity_required })))
    setRecipeModal(true)
  }

  const addRecipeRow    = () => setRecipe([...recipe, { ingredient: '', quantity_required: '' }])
  const removeRecipeRow = (i) => setRecipe(recipe.filter((_, idx) => idx !== i))
  const updateRecipeRow = (i, field, val) => setRecipe(recipe.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  const items = data || []
  const typesList = types || []
  const ingList   = ingredients || []

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search food items…">
        <select className="select w-40" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {typesList.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
        </select>
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Item</button>
      </SearchBar>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading && <div className="col-span-4"><PageLoader /></div>}
        {items.map(item => (
          <div key={item.id} className={`card group relative flex flex-col gap-3 ${!item.is_active ? 'opacity-60' : ''}`}>
            {/* Photo */}
            <div className="w-full h-36 rounded-lg bg-primary-50 flex items-center justify-center overflow-hidden">
              {item.photo_url
                ? <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover rounded-lg" />
                : <UtensilsCrossed size={32} className="text-primary-200" />
              }
            </div>
            {/* Type badge */}
            <div className="flex items-center justify-between">
              <span className="badge-green text-xs">{item.food_type_icon} {item.food_type_name}</span>
              <span className={item.is_available ? 'badge-green' : 'badge-red'}>
                {item.is_available ? `${item.makeable_count} can make` : 'Unavailable'}
              </span>
            </div>
            <div>
              <p className="font-semibold text-gray-800">{item.name}</p>
              {item.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>}
            </div>
            <p className="text-lg font-bold text-primary-500">₹{parseFloat(item.price).toFixed(2)}</p>
            {/* Actions */}
            <div className="flex gap-1 pt-1 border-t border-gray-50">
              <button onClick={() => openEdit(item)} className="btn-ghost py-1 text-xs flex-1"><Edit2 size={12} />Edit</button>
              <button onClick={() => openRecipe(item)} className="btn-ghost py-1 text-xs flex-1"><ChefHat size={12} />Recipe</button>
              <button onClick={() => setDel(item)} className="btn-ghost py-1 text-xs text-red-400"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        {!isLoading && items.length === 0 && <div className="col-span-4"><Empty message="No food items found" icon={<UtensilsCrossed size={48} />} /></div>}
      </div>

      {/* Food Item Form Modal */}
      <Modal open={modal === 'form'} onClose={() => setModal(null)} title={sel ? 'Edit Food Item' : 'Add Food Item'}
        footer={<>
          <button onClick={() => setModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={() => save.mutate(form)} disabled={save.isPending} className="btn-primary">Save</button>
        </>}
      >
        <Field label="Food Type" required>
          <select className="select" value={form.food_type} onChange={e => setForm({ ...form, food_type: e.target.value })}>
            <option value="">Select type…</option>
            {typesList.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
          </select>
        </Field>
        <Field label="Name" required><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Price (₹)" required><input type="number" step="0.01" className="input" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></Field>
        <Field label="Description"><textarea className="input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Photo"><input type="file" accept="image/*" className="input" onChange={e => setPhotoFile(e.target.files[0])} /></Field>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_available} onChange={e => setForm({ ...form, is_available: e.target.checked })} />
            Available
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
        </div>
      </Modal>

      {/* Recipe Modal */}
      <Modal open={!!recipeModal} onClose={() => setRecipeModal(null)} title={`Recipe — ${sel?.name}`} size="lg"
        footer={<>
          <button onClick={() => setRecipeModal(null)} className="btn-ghost">Cancel</button>
          <button onClick={() => saveRecipe.mutate({ id: sel.id, data: { ingredients: recipe.filter(r => r.ingredient && r.quantity_required) } })}
            disabled={saveRecipe.isPending} className="btn-primary">Save Recipe</button>
        </>}
      >
        <p className="text-xs text-gray-400 mb-4">Set ingredients and required quantity per serving. This controls inventory deduction and makeable count.</p>
        <div className="space-y-2">
          {recipe.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select className="select flex-1" value={row.ingredient} onChange={e => updateRecipeRow(i, 'ingredient', e.target.value)}>
                <option value="">Select ingredient…</option>
                {ingList.map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}
              </select>
              <input type="number" step="0.001" placeholder="Qty" className="input w-24" value={row.quantity_required}
                onChange={e => updateRecipeRow(i, 'quantity_required', e.target.value)} />
              <button onClick={() => removeRecipeRow(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <button onClick={addRecipeRow} className="btn-outline mt-3 text-xs"><Plus size={13} />Add Ingredient</button>
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)}
        title="Delete Item" message={`Delete "${del?.name}"?`} danger />
    </div>
  )
}

// ── Add-ons Tab ───────────────────────────────────────
function AddonsTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [sel, setSel]     = useState(null)
  const [form, setForm]   = useState({ name: '', is_costed: false, price: '0', is_active: true })
  const [del, setDel]     = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['addons'],
    queryFn:  () => menuAPI.addons.list().then(r => r.data.results || r.data),
  })

  const save = useMutation({
    mutationFn: (d) => sel ? menuAPI.addons.update(sel.id, d) : menuAPI.addons.create(d),
    onSuccess:  () => { qc.invalidateQueries(['addons']); setModal(false); toast.success('Saved!') },
    onError:    () => toast.error('Save failed'),
  })
  const remove = useMutation({
    mutationFn: (id) => menuAPI.addons.delete(id),
    onSuccess:  () => { qc.invalidateQueries(['addons']); setDel(null); toast.success('Deleted') },
  })

  const openCreate = () => { setSel(null); setForm({ name: '', is_costed: false, price: '0', is_active: true }); setModal(true) }
  const openEdit   = (a) => { setSel(a);   setForm({ name: a.name, is_costed: a.is_costed, price: String(a.price), is_active: a.is_active }); setModal(true) }

  const handleSave = () => save.mutate({
    name: form.name, is_active: form.is_active,
    is_costed: form.is_costed,
    price: form.is_costed ? parseFloat(form.price) || 0 : 0,
  })

  const addons = data || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="font-semibold text-gray-700">Add-ons</h2>
          <p className="text-xs text-gray-400">{addons.length} add-ons · assign them to categories in the Categories tab</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus size={15} />Add Add-on</button>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Costed?</th><th>Price</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {addons.map(a => (
              <tr key={a.id}>
                <td className="font-medium">{a.name}</td>
                <td><span className={a.is_costed ? 'badge-green' : 'badge-gray'}>{a.is_costed ? 'Costed' : 'Free'}</span></td>
                <td>{a.is_costed ? `₹${parseFloat(a.price).toFixed(2)}` : '—'}</td>
                <td><span className={a.is_active ? 'badge-green' : 'badge-gray'}>{a.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(a)} className="btn-ghost py-1"><Edit2 size={13} /></button>
                    <button onClick={() => setDel(a)} className="btn-ghost py-1 text-red-400"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && addons.length === 0 && (
              <tr><td colSpan={5}><Empty message="No add-ons yet. Create one to get started." /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={sel ? 'Edit Add-on' : 'New Add-on'}
        footer={<>
          <button onClick={() => setModal(false)} className="btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={save.isPending} className="btn-primary">Save</button>
        </>}
      >
        <Field label="Add-on Name" required>
          <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Extra Cheese, Extra Sauce" />
        </Field>
        <Field label="Has Extra Cost?">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setForm({ ...form, is_costed: !form.is_costed })}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.is_costed ? 'bg-primary-500' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_costed ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-gray-600">{form.is_costed ? 'Charged add-on' : 'Free add-on (no extra cost)'}</span>
          </label>
        </Field>
        {form.is_costed && (
          <Field label="Price (₹)" required>
            <input type="number" step="0.50" min="0" className="input" value={form.price}
              onChange={e => setForm({ ...form, price: e.target.value })} />
          </Field>
        )}
        <Field label="Status">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
        </Field>
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => remove.mutate(del?.id)}
        title="Delete Add-on" message={`Delete "${del?.name}"? This will remove it from all categories.`} danger />
    </div>
  )
}

// ── Main MenuPage ─────────────────────────────────────
export default function MenuPage() {
  const [tab, setTab] = useState('items')
  const tabs = [
    { id: 'items',       label: 'Food Items',   icon: <UtensilsCrossed size={15} /> },
    { id: 'types',       label: 'Categories',   icon: <Layers size={15} /> },
    { id: 'addons',      label: 'Add-ons',      icon: <Sparkles size={15} /> },
    { id: 'ingredients', label: 'Ingredients',  icon: <ChefHat size={15} /> },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Menu Management</h1>
          <p className="page-subtitle">Manage food items, categories, and ingredients</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === t.id ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'items'       && <FoodItemTab />}
      {tab === 'types'       && <FoodTypeTab />}
      {tab === 'addons'      && <AddonsTab />}
      {tab === 'ingredients' && <IngredientTab />}
    </div>
  )
}
