import React, { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Trash2, Edit2, Check, Printer, Trash } from 'lucide-react';
import './App.css';
/**
 * Aplicativo: Lista de Compras Inteligente
 * Funcionalidades: Persistência local, histórico de preços, categorias e exportação PDF.
 */
export default function App() {
  const [items, setItems] = useState(() => JSON.parse(localStorage.getItem('items')) || []);
  const [priceHistory, setPriceHistory] = useState(() => JSON.parse(localStorage.getItem('priceHistory')) || {});
  const [markets, setMarkets] = useState(() => JSON.parse(localStorage.getItem('markets')) || ['Mercado A', 'Mercado B']);
  const [selectedMarket, setSelectedMarket] = useState(localStorage.getItem('selectedMarket') || 'Mercado A');
  
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('Geral');
  const [editingMarket, setEditingMarket] = useState(null);
  const [newMarketName, setNewMarketName] = useState('');

  // Sincroniza estado com o LocalStorage para persistência dos dados
  useEffect(() => {
    localStorage.setItem('items', JSON.stringify(items));
    localStorage.setItem('priceHistory', JSON.stringify(priceHistory));
    localStorage.setItem('markets', JSON.stringify(markets));
    localStorage.setItem('selectedMarket', selectedMarket);
  }, [items, priceHistory, markets, selectedMarket]);

  const addItem = () => {
    if (!itemName.trim()) return;
    const newItem = {
      id: Date.now(),
      name: itemName,
      category: itemCategory,
      price: priceHistory[itemName]?.[selectedMarket] || 0,
    };
    setItems([...items, newItem]);
    setItemName('');
  };

  const updatePrice = (id, newPrice) => {
    const item = items.find(i => i.id === id);
    const floatPrice = parseFloat(newPrice) || 0;
    
    setItems(items.map(i => i.id === id ? { ...i, price: floatPrice } : i));
    
    // Atualiza o histórico para o mercado atual
    setPriceHistory(prev => ({
      ...prev,
      [item.name]: { ...prev[item.name], [selectedMarket]: floatPrice }
    }));
  };

  const changeMarket = (market) => {
    setSelectedMarket(market);
    // Recarrega preços baseados no mercado escolhido
    setItems(items.map(i => ({
      ...i,
      price: priceHistory[i.name]?.[market] || 0
    })));
  };

  const renameMarket = (oldName) => {
    if (!newMarketName.trim()) return;
    const updatedMarkets = markets.map(m => m === oldName ? newMarketName : m);
    setMarkets(updatedMarkets);
    setSelectedMarket(newMarketName);
    setEditingMarket(null);
  };

  const clearList = () => {
    if (window.confirm('Tem a certeza que deseja limpar toda a lista?')) {
      setItems([]);
    }
  };

  const exportPDF = () => {
    window.print();
  };

  const total = items.reduce((acc, curr) => acc + curr.price, 0);

  return (
    <div className="p-6 max-w-2xl mx-auto bg-gray-50 min-h-screen print:bg-white">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6 text-gray-800 print:hidden">
        <ShoppingCart /> Lista de Compras Inteligente
      </h1>

      <div className="bg-white p-4 rounded-lg shadow-sm mb-6 print:hidden">
        <label className="block text-sm font-medium mb-2">Gerenciar Mercados:</label>
        <div className="flex flex-wrap gap-2">
          {markets.map(m => (
            editingMarket === m ? (
              <div key={m} className="flex gap-1">
                <input value={newMarketName} onChange={e => setNewMarketName(e.target.value)} className="border p-1 rounded" />
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
        <input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Produto" className="flex-grow p-2 border rounded-md" />
        <input value={itemCategory} onChange={e => setItemCategory(e.target.value)} placeholder="Cat." className="w-24 p-2 border rounded-md" />
        <button onClick={addItem} className="bg-blue-600 text-white px-4 py-2 rounded-md"><Plus /></button>
      </div>

      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-white p-3 rounded shadow-sm flex items-center justify-between border-b">
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-xs text-gray-400">{item.category}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm print:hidden">R$</span>
              <input type="number" value={item.price} onChange={(e) => updatePrice(item.id, e.target.value)} className="w-20 p-1 border rounded text-right" />
              <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-red-500 print:hidden"><Trash2 size={18} /></button>
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