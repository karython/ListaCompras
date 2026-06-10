import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  ShoppingBag, ArrowLeft, Store, ChevronRight,
  CheckCircle2, XCircle, RotateCcw, Share2, Copy, Check,
  Play, AlertCircle, X,
} from 'lucide-react';

export default function ShoppingMode({ session, subscription, onRequireSubscription, refreshSubscription }) {
  const userId = session.user.id;

  const [view, setView] = useState('select'); // 'select' | 'session'
  const [savedLists, setSavedLists] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Session state
  const [activeSession, setActiveSession] = useState(null);
  const [sItems, setSItems] = useState([]);
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [showConfirmFinalize, setShowConfirmFinalize] = useState(false);

  // Start session modal
  const [showStartModal, setShowStartModal] = useState(false);
  const [startList, setStartList] = useState(null);
  const [sessionMarketId, setSessionMarketId] = useState('');
  const [showNewMarketInput, setShowNewMarketInput] = useState(false);
  const [newMarketName, setNewMarketName] = useState('');

  // Share modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const [purchaseCount, setPurchaseCount] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: marketsData } = await supabase
      .from('markets').select('*').eq('user_id', userId).order('name');
    setMarkets(marketsData || []);

    // Own saved lists
    const { data: ownLists } = await supabase
      .from('shopping_lists')
      .select('id, name, user_id, market_id, status, created_at, markets(id, name)')
      .eq('user_id', userId).eq('status', 'saved')
      .order('created_at', { ascending: false });

    // Shared lists I'm a member of
    const { data: memberships } = await supabase
      .from('list_members').select('list_id').eq('user_id', userId);
    const memberListIds = (memberships || []).map(m => m.list_id);

    let sharedLists = [];
    if (memberListIds.length > 0) {
      const { data } = await supabase
        .from('shopping_lists')
        .select('id, name, user_id, market_id, status, created_at, markets(id, name)')
        .in('id', memberListIds).in('status', ['open', 'saved'])
        .order('created_at', { ascending: false });
      sharedLists = (data || []).map(l => ({ ...l, isShared: true }));
    }

    setSavedLists([...(ownLists || []), ...sharedLists]);

    // Active sessions — próprias + de listas compartilhadas iniciadas por outra pessoa
    const { data: ownSessions } = await supabase
      .from('shopping_sessions')
      .select('id, list_id, user_id, market_id, created_at, markets(name), shopping_lists(name)')
      .eq('user_id', userId).eq('status', 'active')
      .order('created_at', { ascending: false });

    let sharedActiveSessions = [];
    if (memberListIds.length > 0) {
      const { data: memberSessions } = await supabase
        .from('shopping_sessions')
        .select('id, list_id, user_id, market_id, created_at, markets(name), shopping_lists(name)')
        .in('list_id', memberListIds).eq('status', 'active')
        .neq('user_id', userId)
        .order('created_at', { ascending: false });
      sharedActiveSessions = memberSessions || [];
    }
    setActiveSessions([...(ownSessions || []), ...sharedActiveSessions]);

    const { count: totalPurchases } = await supabase
      .from('shopping_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed');

    setPurchaseCount(totalPurchases || 0);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Sincronização em tempo real durante a sessão de compra
  useEffect(() => {
    if (!activeSession) return;
    const channel = supabase
      .channel(`session-items-${activeSession.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'session_items',
        filter: `session_id=eq.${activeSession.id}`,
      }, (payload) => {
        setSItems(prev => prev.map(si =>
          si.id === payload.new.id
            ? { ...si, picked: payload.new.picked, actualPrice: payload.new.actual_price }
            : si
        ));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSessionItems = async (sessionId) => {
    const { data } = await supabase
      .from('session_items')
      .select('id, list_item_id, picked, actual_price, list_items(name, category, quantity, unit, price)')
      .eq('session_id', sessionId).order('id');
    return (data || []).map(si => ({
      id: si.id,
      list_item_id: si.list_item_id,
      name: si.list_items.name,
      category: si.list_items.category,
      quantity: si.list_items.quantity,
      unit: si.list_items.unit,
      listPrice: si.list_items.price,
      actualPrice: si.actual_price,
      picked: si.picked,
    }));
  };

  const resumeSession = async (sess) => {
    const items = await loadSessionItems(sess.id);
    setActiveSession({
      id: sess.id,
      list_id: sess.list_id,
      list_name: sess.shopping_lists?.name || 'Lista',
      market_id: sess.market_id,
      market_name: sess.markets?.name || null,
      session_owner_id: sess.user_id,
    });
    setSItems(items);
    setView('session');
  };

  const openStartModal = (list) => {
    const isFreeExpired = !(subscription?.plan === 'annual' && subscription?.status === 'active' && subscription?.expires_at && new Date(subscription.expires_at) > new Date());
    if (isFreeExpired && purchaseCount >= 3) {
      onRequireSubscription();
      return;
    }

    setStartList(list);
    setSessionMarketId(list.market_id?.toString() || '');
    setShowNewMarketInput(false);
    setNewMarketName('');
    setShowStartModal(true);
  };

  const startSession = async () => {
    if (!startList) return;

    const isFreeExpired = !(subscription?.plan === 'annual' && subscription?.status === 'active' && subscription?.expires_at && new Date(subscription.expires_at) > new Date());
    if (isFreeExpired && purchaseCount >= 3) {
      onRequireSubscription();
      return;
    }

    // Se já existe uma sessão ativa para esta lista, entrar nela
    const { data: existing } = await supabase
      .from('shopping_sessions')
      .select('id, list_id, user_id, market_id, markets(name), shopping_lists(name)')
      .eq('list_id', startList.id).eq('status', 'active')
      .maybeSingle();

    if (existing) {
      await resumeSession(existing);
      setShowStartModal(false);
      return;
    }

    let marketId = sessionMarketId ? parseInt(sessionMarketId, 10) : startList.market_id || null;

    if (showNewMarketInput && newMarketName.trim()) {
      const { data: mkt } = await supabase
        .from('markets').insert({ user_id: userId, name: newMarketName.trim() }).select().single();
      if (mkt) {
        marketId = mkt.id;
        setMarkets(prev => [...prev, mkt].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }

    const { data: sess } = await supabase
      .from('shopping_sessions')
      .insert({ list_id: startList.id, user_id: userId, market_id: marketId, status: 'active' })
      .select('id, list_id, user_id, market_id, markets(name)')
      .single();
    if (!sess) return;

    // Pre-populate session_items with all list items
    const { data: listItems } = await supabase
      .from('list_items').select('id').eq('list_id', startList.id);
    if (listItems?.length) {
      await supabase.from('session_items').insert(
        listItems.map(li => ({ session_id: sess.id, list_item_id: li.id, picked: null, actual_price: null }))
      );
    }

    const items = await loadSessionItems(sess.id);
    const mktName = sess.markets?.name || markets.find(m => m.id === marketId)?.name || null;
    setActiveSession({ id: sess.id, list_id: startList.id, list_name: startList.name, market_id: marketId, market_name: mktName, session_owner_id: sess.user_id });
    setSItems(items);
    setShowStartModal(false);
    setView('session');
  };

  const markItem = async (sItemId, picked) => {
    await supabase.from('session_items')
      .update({ picked, updated_at: new Date().toISOString() }).eq('id', sItemId);
    setSItems(prev => prev.map(si => si.id === sItemId ? { ...si, picked } : si));
  };

  const updateItemPrice = async (sItemId, price) => {
    const floatPrice = parseFloat(price) || 0;
    await supabase.from('session_items')
      .update({ actual_price: floatPrice, updated_at: new Date().toISOString() }).eq('id', sItemId);
    setSItems(prev => prev.map(si => si.id === sItemId ? { ...si, actualPrice: floatPrice } : si));
    setEditingPriceId(null);
  };

  const finalizeSession = async () => {
    const pickedItems = sItems.filter(si => si.picked === true);
    const total = pickedItems.reduce((acc, si) => acc + (si.actualPrice ?? si.listPrice) * si.quantity, 0);

    await supabase.from('shopping_sessions').update({
      status: 'completed', total, completed_at: new Date().toISOString(),
    }).eq('id', activeSession.id);

    // Apenas o criador da sessão pode fechar a lista
    if (activeSession.session_owner_id === userId) {
      await supabase.from('shopping_lists').update({
        status: 'closed', total, completed_at: new Date().toISOString(),
      }).eq('id', activeSession.list_id);
    }

    if (activeSession.market_id && pickedItems.length > 0) {
      await supabase.from('price_history').upsert(
        pickedItems.map(si => ({
          user_id: userId,
          item_name: si.name,
          market_id: activeSession.market_id,
          price: si.actualPrice ?? si.listPrice,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'user_id,item_name,market_id' }
      );
    }

    setActiveSession(null); setSItems([]);
    setShowConfirmFinalize(false); setView('select');
    await loadData();
    if (refreshSubscription) await refreshSubscription();
  };

  const getShareLink = async (listId) => {
    let { data } = await supabase
      .from('list_shares').select('share_token').eq('list_id', listId).maybeSingle();
    if (!data) {
      const { data: created } = await supabase
        .from('list_shares').insert({ list_id: listId, owner_id: userId }).select('share_token').single();
      data = created;
    }
    if (data) {
      setShareLink(`${window.location.origin}${window.location.pathname}?share=${data.share_token}`);
      setShowShareModal(true);
    }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); } catch { }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // ─── HELPERS ──────────────────────────────────────────────
  const sortedItems = [...sItems].sort((a, b) => {
    const order = v => v === null ? 0 : v === true ? 1 : 2;
    return order(a.picked) - order(b.picked);
  });
  const pickedItems = sItems.filter(si => si.picked === true);
  const sessionTotal = pickedItems.reduce((acc, si) => acc + (si.actualPrice ?? si.listPrice) * si.quantity, 0);

  if (loading) return (
    <div className="flex items-center justify-center p-16 text-gray-400">
      <p className="text-sm">Carregando...</p>
    </div>
  );

  // ── SHOPPING SESSION VIEW ─────────────────────────────────
  if (view === 'session' && activeSession) {
    return (
      <div className="pb-4">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 z-20">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => { setActiveSession(null); setSItems([]); setView('select'); }}
              className="flex items-center gap-1 text-blue-600 text-sm font-medium"
            >
              <ArrowLeft size={16} /> Fazer Compras
            </button>
            <div className="text-center flex-1 mx-2">
              <p className="text-xs text-gray-400 leading-none">Comprando em</p>
              <p className="font-semibold text-gray-800 text-sm truncate">
                {activeSession.market_name || 'Sem mercado'}
              </p>
            </div>
            <button
              onClick={() => setShowConfirmFinalize(true)}
              className="bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold"
            >
              Finalizar
            </button>
          </div>
          <div className="px-4 pb-2 flex items-center justify-between">
            <p className="text-xs text-gray-400">{activeSession.list_name}</p>
            <p className="text-xs text-gray-500">
              {pickedItems.length}/{sItems.length} pegos
            </p>
          </div>
        </div>

        {/* Items */}
        <div className="px-4 pt-3 space-y-2">
          {sortedItems.map(item => {
            const displayPrice = item.actualPrice ?? item.listPrice;
            const isPicked = item.picked === true;
            const isNotPicked = item.picked === false;

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-3 transition-all ${
                  isPicked ? 'bg-green-50 border-green-200' :
                  isNotPicked ? 'bg-gray-50 border-gray-100 opacity-50' :
                  'bg-white border-gray-100 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {isPicked && <CheckCircle2 size={18} className="text-green-500 mt-0.5 flex-shrink-0" />}
                    {isNotPicked && <XCircle size={18} className="text-gray-400 mt-0.5 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className={`font-medium text-sm leading-tight ${isNotPicked ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.quantity} {item.unit} · {item.category}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {editingPriceId === item.id ? (
                      <input
                        type="number"
                        defaultValue={displayPrice}
                        step="0.01" min="0"
                        autoFocus
                        className="w-20 border rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        onBlur={(e) => updateItemPrice(item.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') updateItemPrice(item.id, e.target.value); }}
                      />
                    ) : (
                      <button onClick={() => setEditingPriceId(item.id)} className="text-right">
                        <span className={`text-sm font-bold block ${isPicked ? 'text-green-700' : 'text-gray-600'}`}>
                          R$ {(displayPrice * item.quantity).toFixed(2)}
                        </span>
                        {item.quantity !== 1 && (
                          <span className="text-xs text-gray-400 block">R$ {displayPrice.toFixed(2)}/{item.unit}</span>
                        )}
                        {item.actualPrice !== null && item.actualPrice !== undefined && (
                          <span className="text-xs text-blue-400 block">editado</span>
                        )}
                      </button>
                    )}
                    {(isPicked || isNotPicked) && (
                      <button
                        onClick={() => markItem(item.id, null)}
                        className="text-gray-300 hover:text-gray-500 p-1"
                        title="Desfazer"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Action buttons (only for undecided) */}
                {item.picked === null && (
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => markItem(item.id, true)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                    >
                      <Check size={14} /> Peguei
                    </button>
                    <button
                      onClick={() => markItem(item.id, false)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold py-2 rounded-lg transition-colors"
                    >
                      <X size={14} /> Não Peguei
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Running total */}
        <div className="px-4 mt-4">
          <div className="bg-gray-900 text-white rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-xs">Total da compra</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {pickedItems.length} de {sItems.length} itens pegos
              </p>
            </div>
            <p className="text-2xl font-bold">R$ {sessionTotal.toFixed(2)}</p>
          </div>
        </div>

        {/* Confirm finalize modal */}
        {showConfirmFinalize && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={20} className="text-green-600" />
                </div>
                <h3 className="font-bold text-gray-800">Finalizar compra?</h3>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Itens pegos</span>
                  <span className="font-medium text-gray-700">{pickedItems.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Itens não pegos</span>
                  <span className="font-medium text-gray-700">{sItems.filter(si => si.picked !== true).length}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold pt-1 border-t border-gray-200">
                  <span className="text-gray-700">Total</span>
                  <span className="text-gray-800">R$ {sessionTotal.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Itens não pegos não entrarão no histórico. Preços serão salvos para as próximas listas.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirmFinalize(false)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={finalizeSession}
                  className="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-sm font-semibold"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── SELECT LIST VIEW ──────────────────────────────────────
  return (
    <div className="p-4">
      <h2 className="font-bold text-gray-800 mb-5">Fazer Compras</h2>

      {/* Active sessions to resume */}
      {activeSessions.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-2">
            Compras em andamento
          </p>
          <div className="space-y-2">
            {activeSessions.map(sess => (
              <button
                key={sess.id}
                onClick={() => resumeSession(sess)}
                className="w-full bg-orange-50 border border-orange-200 rounded-xl p-3.5 text-left flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{sess.shopping_lists?.name}</p>
                  <p className="text-xs text-orange-600 flex items-center gap-1 mt-0.5">
                    <Store size={11} /> {sess.markets?.name || 'Sem mercado'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">Retomar</span>
                  <ChevronRight size={16} className="text-orange-400" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Saved lists */}
      {savedLists.length === 0 && activeSessions.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="text-blue-300" size={28} />
          </div>
          <p className="text-gray-600 font-medium">Nenhuma lista pronta</p>
          <p className="text-gray-400 text-sm mt-1">
            Crie uma lista na aba "Lista" e clique em "Salvar Lista" para usá-la aqui.
          </p>
        </div>
      ) : (
        <>
          {savedLists.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Listas salvas
              </p>
              <div className="space-y-3">
                {savedLists.map(list => (
                  <div key={list.id} className="bg-white rounded-xl shadow-sm border border-gray-100">
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-800">{list.name}</p>
                            {list.isShared && (
                              <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">
                                Compartilhada
                              </span>
                            )}
                            {list.isShared && list.status === 'open' && (
                              <span className="text-xs bg-yellow-100 text-yellow-600 px-1.5 py-0.5 rounded-full">
                                Em edição
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-400 flex items-center gap-1 mt-1">
                            <Store size={12} /> {list.markets?.name || 'Sem mercado'}
                          </p>
                          <p className="text-xs text-gray-300 mt-0.5">
                            {new Date(list.created_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        {!list.isShared && (
                          <button
                            onClick={() => getShareLink(list.id)}
                            className="text-gray-300 hover:text-blue-500 p-1.5 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0"
                            title="Compartilhar lista"
                          >
                            <Share2 size={16} />
                          </button>
                        )}
                      </div>
                      {list.isShared && list.status === 'open' ? (
                        <div className="mt-3 w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-400 text-sm font-semibold py-2.5 rounded-xl cursor-not-allowed">
                          <Play size={15} /> Lista sendo preparada...
                        </div>
                      ) : (
                        <button
                          onClick={() => openStartModal(list)}
                          className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                        >
                          <Play size={15} /> Iniciar Compra
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Start session modal */}
      {showStartModal && startList && (
        <div
          className="fixed inset-0 bg-black/40 flex items-end z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowStartModal(false); }}
        >
          <div className="bg-white rounded-t-2xl p-6 w-full max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Iniciar Compra</h3>
                <p className="text-sm text-gray-400">{startList.name}</p>
              </div>
              <button onClick={() => setShowStartModal(false)}>
                <X size={22} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Mercado desta compra
                </label>
                {!showNewMarketInput ? (
                  <div className="space-y-2">
                    <select
                      value={sessionMarketId}
                      onChange={(e) => setSessionMarketId(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">Nenhum mercado</option>
                      {markets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewMarketInput(true)}
                      className="text-sm text-blue-600 font-medium"
                    >
                      + Cadastrar novo mercado
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={newMarketName}
                      onChange={(e) => setNewMarketName(e.target.value)}
                      placeholder="Nome do mercado"
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewMarketInput(false)}
                      className="text-gray-400 p-2"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 rounded-xl p-3 flex items-start gap-2">
                <AlertCircle size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-600">
                  Os preços da lista serão usados como ponto de partida. Você pode editar cada preço durante a compra.
                </p>
              </div>

              <button
                onClick={startSession}
                className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-semibold hover:bg-blue-700"
              >
                Iniciar Compra
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
              Envie este link. O destinatário precisará criar conta ou fazer login para acessar.
            </p>
            <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2 mb-3">
              <p className="text-xs text-gray-600 flex-1 truncate font-mono">{shareLink}</p>
              <button
                onClick={copyLink}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                  linkCopied ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                }`}
              >
                {linkCopied ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> Copiar</>}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Após aceitar o convite, o convidado terá acesso a esta lista em "Fazer Compras".
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
