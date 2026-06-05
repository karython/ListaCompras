import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Store, ChevronRight, ArrowLeft, ShoppingBag, Calendar } from 'lucide-react';

export default function History({ session }) {
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const userId = session.user.id;

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('shopping_lists')
      .select('id, name, market_id, total, completed_at, markets(name)')
      .eq('user_id', userId).eq('status', 'closed')
      .order('completed_at', { ascending: false });
    setLists(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const viewList = async (list) => {
    setSelectedList(list);

    // Check for a completed shopping session for this list
    const { data: sess } = await supabase
      .from('shopping_sessions')
      .select('id, market_id, total, completed_at, markets(name)')
      .eq('list_id', list.id).eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1).maybeSingle();

    if (sess) {
      setSelectedSession(sess);
      // Load only picked items from the session
      const { data: sItems } = await supabase
        .from('session_items')
        .select('id, actual_price, picked, list_items(name, category, quantity, unit, price)')
        .eq('session_id', sess.id).eq('picked', true);

      setSelectedItems((sItems || []).map(si => ({
        id: si.id,
        name: si.list_items.name,
        category: si.list_items.category,
        quantity: si.list_items.quantity,
        unit: si.list_items.unit,
        price: si.actual_price ?? si.list_items.price,
      })));
    } else {
      // Legacy: show list_items directly (lists finalized before ShoppingMode)
      setSelectedSession(null);
      const { data } = await supabase
        .from('list_items').select('*').eq('list_id', list.id).order('created_at');
      setSelectedItems(data || []);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-16 text-gray-400">
      <p className="text-sm">Carregando...</p>
    </div>
  );

  if (selectedList) {
    const total = selectedItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
    const marketName = selectedSession?.markets?.name || selectedList.markets?.name;
    const date = selectedSession?.completed_at || selectedList.completed_at;

    return (
      <div className="p-4">
        <button
          onClick={() => { setSelectedList(null); setSelectedItems([]); setSelectedSession(null); }}
          className="flex items-center gap-1 text-blue-600 text-sm font-medium mb-4"
        >
          <ArrowLeft size={16} /> Histórico
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <h2 className="font-bold text-gray-800 text-lg">{selectedList.name}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            {marketName && (
              <span className="text-sm text-gray-400 flex items-center gap-1.5">
                <Store size={13} /> {marketName}
              </span>
            )}
            {date && (
              <span className="text-sm text-gray-400 flex items-center gap-1.5">
                <Calendar size={13} />
                {new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            )}
          </div>
          {selectedSession && (
            <p className="text-xs text-green-600 mt-2 font-medium">
              ✓ Compra realizada · {selectedItems.length} itens pegos
            </p>
          )}
        </div>

        <div className="space-y-2 mb-4">
          {selectedItems.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800 text-sm">{item.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.quantity} {item.unit} · {item.category}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-700 text-sm">R$ {(item.price * item.quantity).toFixed(2)}</p>
                {item.quantity !== 1 && (
                  <p className="text-xs text-gray-400">R$ {item.price.toFixed(2)}/un</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 text-white rounded-xl p-4 flex justify-between items-center">
          <div>
            <p className="text-gray-400 text-xs">Total {selectedSession ? 'gasto' : 'estimado'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{selectedItems.length} itens</p>
          </div>
          <p className="text-2xl font-bold">R$ {total.toFixed(2)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="font-bold text-gray-800 mb-5">Histórico de Compras</h2>

      {lists.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="text-gray-300" size={28} />
          </div>
          <p className="text-gray-500 font-medium">Nenhuma compra finalizada</p>
          <p className="text-gray-400 text-sm mt-1">Finalize uma compra em "Fazer Compras" para ver o histórico</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lists.map((list) => (
            <button
              key={list.id}
              onClick={() => viewList(list)}
              className="w-full bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-left flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">{list.name}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {list.markets?.name && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Store size={11} /> {list.markets.name}
                    </span>
                  )}
                  {list.completed_at && (
                    <span className="text-xs text-gray-400">
                      {new Date(list.completed_at).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <p className="font-bold text-blue-600 text-sm">R$ {(list.total || 0).toFixed(2)}</p>
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
