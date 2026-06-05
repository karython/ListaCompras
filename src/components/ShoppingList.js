import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  Plus, Trash2, X, Store, ShoppingBag,
  ChevronRight, ArrowLeft, TrendingDown, TrendingUp,
  CheckCircle2, Circle, Share2, Copy, Check,
} from 'lucide-react';

const UNITS = ['un', 'kg', 'g', 'l', 'ml', 'cx', 'pc', 'dz'];

export default function ShoppingList({ session }) {
  const userId = session.user.id;

  const [markets, setMarkets] = useState([]);
  const [priceHistory, setPriceHistory] = useState({});
  const [knownItems, setKnownItems] = useState([]);
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [items, setItems] = useState([]);
  const [prevListTotal, setPrevListTotal] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListMarketId, setNewListMarketId] = useState('');
  const [showNewMarketInput, setShowNewMarketInput] = useState(false);
  const [newMarketName, setNewMarketName] = useState('');
  const [copyFromLast, setCopyFromLast] = useState(false);
  const [lastSavedList, setLastSavedList] = useState(null);

  const [showAddItem, setShowAddItem] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('Geral');
  const [itemQty, setItemQty] = useState('1');
  const [itemUnit, setItemUnit] = useState('un');

  const [editingPriceId, setEditingPriceId] = useState(null);
  const [editingQtyId, setEditingQtyId] = useState(null);
  const [showMarketPanel, setShowMarketPanel] = useState(false);

  // Share feature
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: marketsData } = await supabase
      .from('markets').select('*').eq('user_id', userId).order('name');
    setMarkets(marketsData || []);

    const { data: histData } = await supabase
      .from('price_history').select('item_name, market_id, price').eq('user_id', userId);
    const hist = {};
    (histData || []).forEach((row) => {
      if (!hist[row.item_name]) hist[row.item_name] = {};
      hist[row.item_name][row.market_id] = row.price;
    });
    setPriceHistory(hist);
    setKnownItems(Object.keys(hist));

    const { data: listsData } = await supabase
      .from('shopping_lists')
      .select('id, name, market_id, status, total, created_at, markets(id, name)')
      .eq('user_id', userId).eq('status', 'open')
      .order('created_at', { ascending: false });
    setLists(listsData || []);

    // For "copy from last": get most recent saved or closed list
    const { data: lastSaved } = await supabase
      .from('shopping_lists').select('id, name')
      .eq('user_id', userId).in('status', ['saved', 'closed'])
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    setLastSavedList(lastSaved || null);

    setLoading(false);
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadListItems = async (listId) => {
    const { data } = await supabase
      .from('list_items').select('*').eq('list_id', listId).order('created_at');
    return data || [];
  };

  const loadPrevTotal = async (marketId) => {
    if (!marketId) { setPrevListTotal(null); return; }
    const { data } = await supabase
      .from('shopping_lists').select('total, name')
      .eq('user_id', userId).eq('market_id', marketId).eq('status', 'closed')
      .order('completed_at', { ascending: false }).limit(1).maybeSingle();
    setPrevListTotal(data || null);
  };

  const selectList = async (list) => {
    const loadedItems = await loadListItems(list.id);
    setItems(loadedItems);
    setActiveList(list);
    await loadPrevTotal(list.market_id);
  };

  const createMarket = async (name) => {
    const { data, error } = await supabase
      .from('markets').insert({ user_id: userId, name: name.trim() }).select().single();
    if (!error && data) {
      setMarkets((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    }
    return null;
  };

  const openNewListModal = () => {
    const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    setNewListName(`Compras ${today}`);
    setNewListMarketId(markets[0]?.id?.toString() || '');
    setShowNewMarketInput(false);
    setNewMarketName('');
    setCopyFromLast(false);
    setShowNewList(true);
  };

  const createList = async () => {
    if (!newListName.trim()) return;
    let marketId = newListMarketId ? parseInt(newListMarketId, 10) : null;
    if (showNewMarketInput && newMarketName.trim()) {
      const created = await createMarket(newMarketName.trim());
      if (created) marketId = created.id;
    }

    const { data: list, error } = await supabase
      .from('shopping_lists')
      .insert({ user_id: userId, name: newListName.trim(), market_id: marketId, status: 'open' })
      .select('id, name, market_id, status, total, created_at, markets(id, name)')
      .single();
    if (error || !list) return;

    setLists((prev) => [list, ...prev]);
    setShowNewList(false);

    let initialItems = [];
    if (copyFromLast && lastSavedList) {
      const lastItems = await loadListItems(lastSavedList.id);
      if (lastItems.length > 0) {
        const rows = lastItems.map((item) => ({
          list_id: list.id, user_id: userId,
          name: item.name, category: item.category,
          quantity: item.quantity, unit: item.unit,
          price: priceHistory[item.name]?.[marketId] ?? item.price,
          checked: false,
        }));
        const { data: inserted } = await supabase.from('list_items').insert(rows).select();
        initialItems = inserted || [];
      }
    }

    setItems(initialItems);
    setActiveList(list);
    await loadPrevTotal(marketId);
    setNewListName(''); setNewListMarketId(''); setNewMarketName('');
  };

  const addItem = async () => {
    if (!itemName.trim() || !activeList) return;
    const price = priceHistory[itemName.trim()]?.[activeList.market_id] ?? 0;
    const { data, error } = await supabase
      .from('list_items').insert({
        list_id: activeList.id, user_id: userId,
        name: itemName.trim(), category: itemCategory.trim() || 'Geral',
        quantity: parseFloat(itemQty) || 1, unit: itemUnit, price, checked: false,
      }).select().single();
    if (!error && data) {
      setItems((prev) => [...prev, data]);
      if (!knownItems.includes(itemName.trim())) setKnownItems((prev) => [...prev, itemName.trim()]);
      setItemName(''); setItemQty('1');
    }
  };

  const updateItemPrice = async (itemId, price) => {
    const floatPrice = parseFloat(price) || 0;
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    await supabase.from('list_items').update({ price: floatPrice }).eq('id', itemId);
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, price: floatPrice } : i)));
    setEditingPriceId(null);
    if (activeList?.market_id) {
      await supabase.from('price_history').upsert(
        { user_id: userId, item_name: item.name, market_id: activeList.market_id, price: floatPrice, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,item_name,market_id' }
      );
      setPriceHistory((prev) => ({
        ...prev,
        [item.name]: { ...(prev[item.name] || {}), [activeList.market_id]: floatPrice },
      }));
    }
  };

  const updateItemQty = async (itemId, qty) => {
    const floatQty = parseFloat(qty) || 1;
    await supabase.from('list_items').update({ quantity: floatQty }).eq('id', itemId);
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity: floatQty } : i)));
    setEditingQtyId(null);
  };

  const toggleItem = async (itemId) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const newChecked = !item.checked;
    await supabase.from('list_items').update({ checked: newChecked }).eq('id', itemId);
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, checked: newChecked } : i)));
  };

  const deleteItem = async (itemId) => {
    await supabase.from('list_items').delete().eq('id', itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const switchMarket = async (market) => {
    const newItems = items.map((item) => ({
      ...item, price: priceHistory[item.name]?.[market.id] ?? item.price,
    }));
    await supabase.from('shopping_lists').update({ market_id: market.id }).eq('id', activeList.id);
    await Promise.all(newItems.map((item) =>
      supabase.from('list_items').update({ price: item.price }).eq('id', item.id)
    ));
    setActiveList({ ...activeList, market_id: market.id, markets: { id: market.id, name: market.name } });
    setItems(newItems);
    setShowMarketPanel(false);
    await loadPrevTotal(market.id);
  };

  // Save list (was: finalizeList) — sets status to 'saved', makes it available in "Fazer Compras"
  const saveList = async () => {
    await supabase.from('shopping_lists').update({ status: 'saved' }).eq('id', activeList.id);
    setLastSavedList({ id: activeList.id, name: activeList.name });
    setLists((prev) => prev.filter((l) => l.id !== activeList.id));
    setActiveList(null); setItems([]); setPrevListTotal(null);
  };

  const deleteList = async (listId) => {
    if (!window.confirm('Excluir esta lista permanentemente?')) return;
    await supabase.from('shopping_lists').delete().eq('id', listId);
    setLists((prev) => prev.filter((l) => l.id !== listId));
    if (activeList?.id === listId) { setActiveList(null); setItems([]); }
  };

  // Share feature
  const openShareModal = async (listId) => {
    let { data } = await supabase
      .from('list_shares').select('share_token').eq('list_id', listId).maybeSingle();
    if (!data) {
      const { data: created } = await supabase
        .from('list_shares').insert({ list_id: listId, owner_id: userId }).select('share_token').single();
      data = created;
    }
    if (data) {
      setShareLink(`${window.location.origin}${window.location.pathname}?share=${data.share_token}`);
      setLinkCopied(false);
      setShowShareModal(true);
    }
  };

  const copyShareLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); } catch { }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const total = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const checkedCount = items.filter((i) => i.checked).length;

  if (loading) return (
    <div className="flex items-center justify-center p-16 text-gray-400">
      <p className="text-sm">Carregando...</p>
    </div>
  );

  // ── ACTIVE LIST VIEW ──────────────────────────────────────
  if (activeList) {
    const marketName = activeList.markets?.name;
    const diff = prevListTotal ? total - prevListTotal.total : null;

    return (
      <div className="pb-4">
        <div className="sticky top-0 bg-white border-b border-gray-100 z-20">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => { setActiveList(null); setItems([]); setPrevListTotal(null); setShowAddItem(false); }}
              className="flex items-center gap-1 text-blue-600 text-sm font-medium"
            >
              <ArrowLeft size={16} /> Listas
            </button>
            <h2 className="font-semibold text-gray-800 text-sm truncate mx-2 max-w-[150px]">
              {activeList.name}
            </h2>
            <button
              onClick={saveList}
              className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700"
            >
              Salvar Lista
            </button>
          </div>

          <div className="flex items-center justify-between px-4 pb-2.5">
            <button
              onClick={() => setShowMarketPanel(!showMarketPanel)}
              className="flex items-center gap-1.5 text-sm text-gray-600"
            >
              <Store size={13} className="text-blue-500" />
              <span className="font-medium">{marketName || 'Sem mercado'}</span>
              <span className="text-gray-400 text-xs">{showMarketPanel ? '▴' : '▾'}</span>
            </button>
            <span className="text-xs text-gray-400">{checkedCount}/{items.length} marcados</span>
          </div>

          {showMarketPanel && (
            <div className="px-4 pb-3 pt-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Trocar mercado (preços serão atualizados):</p>
              <div className="flex flex-wrap gap-2">
                {markets.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => switchMarket(m)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      activeList.market_id === m.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 pt-4 space-y-2">
          {items.length === 0 && (
            <div className="text-center py-10">
              <ShoppingBag className="mx-auto text-gray-200 mb-2" size={36} />
              <p className="text-sm text-gray-400">Lista vazia — adicione itens abaixo</p>
            </div>
          )}

          {items.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-xl shadow-sm border border-gray-100 p-3 ${item.checked ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start gap-3">
                <button onClick={() => toggleItem(item.id)} className="mt-0.5 flex-shrink-0">
                  {item.checked
                    ? <CheckCircle2 size={20} className="text-green-500" />
                    : <Circle size={20} className="text-gray-300" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-gray-800 text-sm leading-tight ${item.checked ? 'line-through text-gray-400' : ''}`}>
                    {item.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-gray-400">{item.category}</span>
                    <span className="text-gray-200 text-xs">·</span>
                    {editingQtyId === item.id ? (
                      <input
                        type="number" defaultValue={item.quantity} step="0.1" min="0.1" autoFocus
                        className="w-16 border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        onBlur={(e) => updateItemQty(item.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') updateItemQty(item.id, e.target.value); }}
                      />
                    ) : (
                      <button onClick={() => setEditingQtyId(item.id)} className="text-xs text-blue-500 font-medium">
                        {item.quantity} {item.unit}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {editingPriceId === item.id ? (
                    <input
                      type="number" defaultValue={item.price} step="0.01" min="0" autoFocus
                      className="w-20 border rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      onBlur={(e) => updateItemPrice(item.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') updateItemPrice(item.id, e.target.value); }}
                    />
                  ) : (
                    <button onClick={() => setEditingPriceId(item.id)} className="text-right">
                      <span className="text-sm font-bold text-gray-700 block">
                        R$ {(item.price * item.quantity).toFixed(2)}
                      </span>
                      {item.quantity !== 1 && (
                        <span className="text-xs text-gray-400">R$ {item.price.toFixed(2)}/un</span>
                      )}
                    </button>
                  )}
                  <button onClick={() => deleteItem(item.id)} className="text-red-300 hover:text-red-500 p-1 ml-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 mt-4">
          {showAddItem ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-gray-700 text-sm">Adicionar item</p>
                <button onClick={() => setShowAddItem(false)}>
                  <X size={16} className="text-gray-400" />
                </button>
              </div>
              <div className="space-y-2.5">
                <div>
                  <input
                    list="known-items-list"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="Nome do produto"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
                  />
                  <datalist id="known-items-list">
                    {knownItems.map((name) => <option key={name} value={name} />)}
                  </datalist>
                  {itemName && priceHistory[itemName]?.[activeList.market_id] !== undefined && (
                    <p className="text-xs text-blue-500 mt-1 px-1">
                      Último preço neste mercado: R$ {priceHistory[itemName][activeList.market_id].toFixed(2)}
                    </p>
                  )}
                </div>
                <input
                  value={itemCategory}
                  onChange={(e) => setItemCategory(e.target.value)}
                  placeholder="Categoria (ex: Laticínios)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <div className="flex gap-2">
                  <input
                    type="number" value={itemQty} onChange={(e) => setItemQty(e.target.value)}
                    placeholder="Qtd" min="0.1" step="0.1"
                    className="w-24 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <select
                    value={itemUnit} onChange={(e) => setItemUnit(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <button
                  onClick={addItem}
                  className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700"
                >
                  Adicionar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddItem(true)}
              className="w-full bg-blue-600 text-white rounded-xl py-3 flex items-center justify-center gap-2 font-semibold hover:bg-blue-700"
            >
              <Plus size={18} /> Adicionar Item
            </button>
          )}
        </div>

        <div className="px-4 mt-4">
          <div className="bg-gray-900 text-white rounded-xl p-4">
            {prevListTotal && (
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
                <span className="text-xs text-gray-400 truncate mr-2">Anterior: {prevListTotal.name}</span>
                <span className="text-xs text-gray-300 flex-shrink-0">R$ {prevListTotal.total.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs">Total estimado</p>
                {diff !== null && (
                  <p className={`text-xs flex items-center gap-1 mt-0.5 ${diff > 0 ? 'text-red-300' : diff < 0 ? 'text-green-300' : 'text-gray-400'}`}>
                    {diff > 0 ? <TrendingUp size={11} /> : diff < 0 ? <TrendingDown size={11} /> : null}
                    {diff > 0 ? '+' : ''}{diff.toFixed(2)} vs anterior
                  </p>
                )}
              </div>
              <p className="text-2xl font-bold">R$ {total.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── LISTS OVERVIEW ────────────────────────────────────────
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-bold text-gray-800">Listas em Edição</h2>
        <button
          onClick={openNewListModal}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 font-medium hover:bg-blue-700"
        >
          <Plus size={15} /> Nova Lista
        </button>
      </div>

      {lists.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="text-blue-300" size={28} />
          </div>
          <p className="text-gray-600 font-medium">Nenhuma lista em edição</p>
          <p className="text-gray-400 text-sm mt-1">Crie uma lista, adicione itens e clique em "Salvar Lista"</p>
          <p className="text-gray-400 text-xs mt-1">A lista salva ficará disponível em "Fazer Compras"</p>
          <button
            onClick={openNewListModal}
            className="mt-5 bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium"
          >
            Criar lista
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map((list) => (
            <div key={list.id} className="bg-white rounded-xl shadow-sm border border-gray-100">
              <button onClick={() => selectList(list)} className="w-full p-4 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800">{list.name}</p>
                    <p className="text-sm text-gray-400 flex items-center gap-1 mt-1">
                      <Store size={12} /> {list.markets?.name || 'Sem mercado'}
                    </p>
                    <p className="text-xs text-gray-300 mt-0.5">
                      {new Date(list.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </button>
              <div className="border-t border-gray-50 px-4 py-2 flex items-center justify-between">
                <button
                  onClick={() => openShareModal(list.id)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors"
                >
                  <Share2 size={13} /> Compartilhar
                </button>
                <button
                  onClick={() => deleteList(list.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Excluir lista
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New List Modal */}
      {showNewList && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewList(false); }}
        >
          <div className="bg-white rounded-t-2xl p-6 w-full max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800 text-lg">Nova Lista</h3>
              <button onClick={() => setShowNewList(false)} className="text-gray-400">
                <X size={22} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome da lista</label>
                <input
                  value={newListName} onChange={(e) => setNewListName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mercado</label>
                {!showNewMarketInput ? (
                  <div className="space-y-2">
                    {markets.length > 0 && (
                      <select
                        value={newListMarketId} onChange={(e) => setNewListMarketId(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">Nenhum mercado</option>
                        {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    )}
                    <button type="button" onClick={() => setShowNewMarketInput(true)} className="text-sm text-blue-600 font-medium">
                      + Cadastrar novo mercado
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={newMarketName} onChange={(e) => setNewMarketName(e.target.value)}
                      placeholder="Nome do mercado"
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowNewMarketInput(false)} className="text-gray-400 p-2">
                      <X size={18} />
                    </button>
                  </div>
                )}
              </div>
              {lastSavedList && (
                <label className="flex items-center gap-3 cursor-pointer bg-blue-50 rounded-xl p-3.5">
                  <input
                    type="checkbox" checked={copyFromLast} onChange={(e) => setCopyFromLast(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Copiar itens da lista anterior</p>
                    <p className="text-xs text-gray-400 mt-0.5">"{lastSavedList.name}"</p>
                  </div>
                </label>
              )}
              <button onClick={createList} className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-semibold hover:bg-blue-700">
                Criar Lista
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowShareModal(false); setLinkCopied(false); } }}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">Compartilhar Lista</h3>
              <button onClick={() => { setShowShareModal(false); setLinkCopied(false); }}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              Envie este link. O destinatário precisará criar conta ou fazer login para acessar a lista.
            </p>
            <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2 mb-3">
              <p className="text-xs text-gray-600 flex-1 truncate font-mono">{shareLink}</p>
              <button
                onClick={copyShareLink}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition-colors ${
                  linkCopied ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                }`}
              >
                {linkCopied ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> Copiar</>}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Após aceitar o convite, o convidado terá acesso à lista em "Fazer Compras".
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
