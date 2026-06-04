import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Trash2, Edit2, Check, Printer, Trash } from 'lucide-react';
import './App.css';
import { supabase } from './supabaseClient';

const DEFAULT_MARKETS = ['Mercado A', 'Mercado B'];

const buildPriceHistory = (rows) => {
  return rows.reduce((acc, row) => {
    const itemHistory = acc[row.item_name] || {};
    acc[row.item_name] = { ...itemHistory, [row.market]: row.price };
    return acc;
  }, {});
};

export default function App() {
  const [items, setItems] = useState([]);
  const [priceHistory, setPriceHistory] = useState({});
  const [markets, setMarkets] = useState(DEFAULT_MARKETS);
  const [selectedMarket, setSelectedMarket] = useState(localStorage.getItem('selectedMarket') || 'Mercado A');

  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('Geral');
  const [editingMarket, setEditingMarket] = useState(null);
  const [newMarketName, setNewMarketName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const storedMarket = localStorage.getItem('selectedMarket') || 'Mercado A';
      setSelectedMarket(storedMarket);

      const { data: marketData, error: marketError } = await supabase.from('markets').select('name');
      if (marketError) {
        console.warn('Erro ao carregar mercados:', marketError.message);
      }

      const localMarkets = JSON.parse(localStorage.getItem('markets')) || DEFAULT_MARKETS;
      const marketNames = marketData?.length ? marketData.map((market) => market.name) : localMarkets;
      const finalMarkets = marketNames.length ? marketNames : DEFAULT_MARKETS;
      setMarkets(finalMarkets);

      if (!marketData?.length) {
        await supabase.from('markets').insert(finalMarkets.map((name) => ({ name })), { returning: 'minimal' });
      }

      const { data: priceData, error: priceError } = await supabase.from('price_history').select('item_name, market, price');
      if (priceError) {
        console.warn('Erro ao carregar histórico de preços:', priceError.message);
      }

      const history = priceData?.length ? buildPriceHistory(priceData) : {};
      setPriceHistory(history);

      const { data: itemData, error: itemError } = await supabase.from('items').select('*');
      if (itemError) {
        console.warn('Erro ao carregar itens:', itemError.message);
      }

      if (itemData?.length) {
        setItems(itemData.map((item) => ({
          ...item,
          price: history[item.name]?.[storedMarket] ?? item.price,
        })));
      } else {
        const localItems = JSON.parse(localStorage.getItem('items')) || [];
        if (localItems.length) {
          const { data: insertedItems, error: insertError } = await supabase.from('items').insert(localItems.map(({ name, category, price }) => ({ name, category, price }))).select();
          if (insertError) {
            console.warn('Erro ao salvar itens locais no Supabase:', insertError.message);
          } else {
            setItems(insertedItems.map((item) => ({
              ...item,
              price: history[item.name]?.[storedMarket] ?? item.price,
            })));
          }
        }
      }

      const localPriceHistory = JSON.parse(localStorage.getItem('priceHistory')) || {};
      if (!priceData?.length && Object.keys(localPriceHistory).length) {
        const historyRows = [];
        Object.entries(localPriceHistory).forEach(([itemName, markets]) => {
          Object.entries(markets).forEach(([market, price]) => {
            historyRows.push({ item_name: itemName, market, price });
          });
        });
        await supabase.from('price_history').insert(historyRows, { returning: 'minimal' });
      }

      setLoading(false);
    };

    loadData();
  }, []);

  useEffect(() => {
    localStorage.setItem('selectedMarket', selectedMarket);
  }, [selectedMarket]);

  const addItem = async () => {
    if (!itemName.trim()) return;

    const newItem = {
      name: itemName,
      category: itemCategory,
      price: priceHistory[itemName]?.[selectedMarket] || 0,
    };

    const { data, error } = await supabase.from('items').insert(newItem).select().single();
    if (error) {
      console.warn('Erro ao criar item:', error.message);
      return;
    }

    setItems([...items, { ...data, price: newItem.price }]);
    setItemName('');
  };

  const updatePrice = async (id, newPrice) => {
    const item = items.find((i) => i.id === id);
    const floatPrice = parseFloat(newPrice) || 0;
    if (!item) return;

    setItems(items.map((i) => (i.id === id ? { ...i, price: floatPrice } : i)));

    const { error: updateError } = await supabase.from('items').update({ price: floatPrice }).eq('id', id);
    if (updateError) {
      console.warn('Erro ao atualizar preço do item:', updateError.message);
    }

    const upsertPayload = {
      item_name: item.name,
      market: selectedMarket,
      price: floatPrice,
    };

    const { error: upsertError } = await supabase.from('price_history').upsert(upsertPayload, { onConflict: ['item_name', 'market'] });
    if (upsertError) {
      console.warn('Erro ao atualizar histórico de preços:', upsertError.message);
    }

    setPriceHistory((prev) => ({
      ...prev,
      [item.name]: { ...prev[item.name], [selectedMarket]: floatPrice },
    }));
  };

  const changeMarket = (market) => {
    setSelectedMarket(market);
    setItems(items.map((item) => ({
      ...item,
      price: priceHistory[item.name]?.[market] ?? item.price,
    })));
  };

  const renameMarket = async (oldName) => {
    if (!newMarketName.trim()) return;
    const updatedMarkets = markets.map((m) => (m === oldName ? newMarketName : m));
    setMarkets(updatedMarkets);
    setSelectedMarket(newMarketName);
    setEditingMarket(null);

    const { error: marketError } = await supabase.from('markets').update({ name: newMarketName }).eq('name', oldName);
    if (marketError) {
      console.warn('Erro ao renomear mercado:', marketError.message);
    }

    const { error: historyError } = await supabase.from('price_history').update({ market: newMarketName }).eq('market', oldName);
    if (historyError) {
      console.warn('Erro ao atualizar histórico de preços do mercado:', historyError.message);
    }
  };

  const clearList = async () => {
    if (window.confirm('Tem a certeza que deseja limpar toda a lista?')) {
      setItems([]);
      const { error } = await supabase.from('items').delete().neq('id', 0);
      if (error) {
        console.warn('Erro ao limpar lista:', error.message);
      }
    }
  };

  const exportPDF = () => {
    window.print();
  };

  const total = items.reduce((acc, curr) => acc + curr.price, 0);

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto bg-gray-50 min-h-screen flex items-center justify-center">
        <span>Carregando dados...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto bg-gray-50 min-h-screen print:bg-white">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6 text-gray-800 print:hidden">
        <ShoppingCart /> Lista de Compras Inteligente
      </h1>

      <div className="bg-white p-4 rounded-lg shadow-sm mb-6 print:hidden">
        <label className="block text-sm font-medium mb-2">Gerenciar Mercados:</label>
        <div className="flex flex-wrap gap-2">
          {markets.map((m) => (
            editingMarket === m ? (
              <div key={m} className="flex gap-1">
                <input value={newMarketName} onChange={(e) => setNewMarketName(e.target.value)} className="border p-1 rounded" />
                <button onClick={() => renameMarket(m)}><Check className="text-green-500" /></button>
              </div>
            ) : (
              <button
                key={m}
                onClick={() => changeMarket(m)}
                className={`px-3 py-1 rounded border ${selectedMarket === m ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
              >
                {m} <Edit2 size={12} className="inline ml-1" onClick={(e) => { e.stopPropagation(); setEditingMarket(m); setNewMarketName(m); }} />
              </button>
            )
          ))}
        </div>
      </div>

      <div className="flex gap-2 mb-6 print:hidden">
        <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Produto" className="flex-grow p-2 border rounded-md" />
        <input value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} placeholder="Cat." className="w-24 p-2 border rounded-md" />
        <button onClick={addItem} className="bg-blue-600 text-white px-4 py-2 rounded-md"><Plus /></button>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="bg-white p-3 rounded shadow-sm flex items-center justify-between border-b">
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-xs text-gray-400">{item.category}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm print:hidden">R$</span>
              <input type="number" value={item.price} onChange={(e) => updatePrice(item.id, e.target.value)} className="w-20 p-1 border rounded text-right" />
              <button onClick={async () => {
                const { error } = await supabase.from('items').delete().eq('id', item.id);
                if (error) {
                  console.warn('Erro ao remover item:', error.message);
                } else {
                  setItems(items.filter((i) => i.id !== item.id));
                }
              }} className="text-red-500 print:hidden"><Trash2 size={18} /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-gray-800 text-white rounded-lg flex justify-between items-center">
        <span className="text-lg font-bold">Total no {selectedMarket}:</span>
        <span className="text-2xl font-bold">R$ {total.toFixed(2)}</span>
      </div>

      <div className="mt-6 flex gap-2 print:hidden">
        <button onClick={clearList} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
          <Trash size={16} /> Limpar Lista
        </button>
        <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
          <Printer size={16} /> Exportar PDF
        </button>
      </div>
    </div>
  );
}
