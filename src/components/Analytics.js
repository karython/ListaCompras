import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { TrendingUp, Package, DollarSign, ShoppingCart, Store } from 'lucide-react';

export default function Analytics({ session }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const userId = session.user.id;

  const loadStats = useCallback(async () => {
    const { data: lists } = await supabase
      .from('shopping_lists')
      .select('id, total, market_id, markets(name), completed_at')
      .eq('user_id', userId)
      .eq('status', 'closed')
      .order('completed_at', { ascending: false });

    if (!lists || lists.length === 0) {
      setStats({ empty: true });
      setLoading(false);
      return;
    }

    const listIds = lists.map((l) => l.id);

    const { data: items } = await supabase
      .from('list_items')
      .select('name, quantity, price')
      .in('list_id', listIds);

    const allItems = items || [];

    const purchaseCounts = {};
    const priceSums = {};
    const priceCounts = {};

    allItems.forEach((item) => {
      purchaseCounts[item.name] = (purchaseCounts[item.name] || 0) + 1;
      if (item.price > 0) {
        priceSums[item.name] = (priceSums[item.name] || 0) + item.price;
        priceCounts[item.name] = (priceCounts[item.name] || 0) + 1;
      }
    });

    const mostPurchased = Object.entries(purchaseCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const mostExpensive = Object.entries(priceSums)
      .filter(([name]) => priceCounts[name] > 0)
      .map(([name, sum]) => ({ name, avg: sum / priceCounts[name] }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);

    const totalSpent = lists.reduce((acc, l) => acc + (l.total || 0), 0);
    const avgPerList = lists.length ? totalSpent / lists.length : 0;

    const marketSpend = {};
    const marketCount = {};
    lists.forEach((list) => {
      const market = list.markets?.name || 'Sem mercado';
      marketSpend[market] = (marketSpend[market] || 0) + (list.total || 0);
      marketCount[market] = (marketCount[market] || 0) + 1;
    });

    const recentLists = lists.slice(0, 6).map((l) => ({
      name: l.name,
      total: l.total || 0,
      market: l.markets?.name || 'Sem mercado',
      date: l.completed_at,
    }));

    setStats({ mostPurchased, mostExpensive, totalSpent, avgPerList, marketSpend, marketCount, listCount: lists.length, recentLists });
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) return (
    <div className="flex items-center justify-center p-16 text-gray-400">
      <p className="text-sm">Carregando...</p>
    </div>
  );

  if (!stats || stats.empty) return (
    <div className="p-4 text-center py-16">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <TrendingUp className="text-gray-300" size={28} />
      </div>
      <p className="text-gray-500 font-medium">Sem dados ainda</p>
      <p className="text-gray-400 text-sm mt-1">Finalize listas de compras para ver análises aqui</p>
    </div>
  );

  const maxPurchase = stats.mostPurchased[0]?.count || 1;
  const maxPrice = stats.mostExpensive[0]?.avg || 1;
  const maxMarket = Math.max(...Object.values(stats.marketSpend));

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-bold text-gray-800">Análises</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-xl p-4">
          <DollarSign className="text-blue-400 mb-2" size={18} />
          <p className="text-xl font-bold text-blue-700">R$ {stats.totalSpent.toFixed(2)}</p>
          <p className="text-xs text-blue-500 mt-0.5">Total gasto</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <ShoppingCart className="text-green-400 mb-2" size={18} />
          <p className="text-xl font-bold text-green-700">R$ {stats.avgPerList.toFixed(2)}</p>
          <p className="text-xs text-green-500 mt-0.5">Média por lista · {stats.listCount}x</p>
        </div>
      </div>

      {/* Gasto por mercado */}
      {Object.keys(stats.marketSpend).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Store size={15} className="text-gray-400" /> Gasto por Mercado
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.marketSpend)
              .sort((a, b) => b[1] - a[1])
              .map(([market, total]) => (
                <div key={market}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">
                      {market}
                      <span className="text-gray-300 text-xs ml-1">({stats.marketCount[market]}x)</span>
                    </span>
                    <span className="text-sm font-semibold text-gray-800">R$ {total.toFixed(2)}</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-purple-500 h-1.5 rounded-full"
                      style={{ width: `${(total / maxMarket) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Itens mais comprados */}
      {stats.mostPurchased.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Package size={15} className="text-gray-400" /> Itens Mais Comprados
          </h3>
          <div className="space-y-3">
            {stats.mostPurchased.map((item, i) => (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-300 w-4 text-right">{i + 1}</span>
                    <span className="text-sm text-gray-700">{item.name}</span>
                  </div>
                  <span className="text-xs text-gray-500">{item.count}× listas</span>
                </div>
                <div className="bg-gray-100 rounded-full h-1.5 ml-6">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full"
                    style={{ width: `${(item.count / maxPurchase) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Itens mais caros */}
      {stats.mostExpensive.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <DollarSign size={15} className="text-gray-400" /> Itens Mais Caros (preço médio/un)
          </h3>
          <div className="space-y-3">
            {stats.mostExpensive.map((item, i) => (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-300 w-4 text-right">{i + 1}</span>
                    <span className="text-sm text-gray-700">{item.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-600">R$ {item.avg.toFixed(2)}</span>
                </div>
                <div className="bg-gray-100 rounded-full h-1.5 ml-6">
                  <div
                    className="bg-orange-500 h-1.5 rounded-full"
                    style={{ width: `${(item.avg / maxPrice) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Últimas compras */}
      {stats.recentLists.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <TrendingUp size={15} className="text-gray-400" /> Últimas Compras
          </h3>
          <div className="space-y-2.5">
            {stats.recentLists.map((list, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-sm text-gray-700 truncate">{list.name}</p>
                  <p className="text-xs text-gray-400">
                    {list.market}
                    {list.date && ` · ${new Date(list.date).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <p className="font-semibold text-gray-700 text-sm flex-shrink-0">
                  R$ {list.total.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
